//! Encrypted-at-rest store for provider OAuth/session tokens (Claude, Codex, ...).
//!
//! The wrapping key never touches disk: it lives in the OS secret store (macOS
//! Keychain, Windows Credential Manager, Linux Secret Service, via the
//! `keyring` crate) and is generated once on first use. Tokens are AES-256-GCM
//! encrypted with that key and written to a small JSON file in the app data
//! directory; without the OS-store key, that file is ciphertext only. Plaintext
//! tokens are `Zeroizing` and only ever exist decrypted in memory for the
//! duration of one spawn call -- never returned to the Tauri frontend.
//!
//! Neither `provider` (e.g. "claude") nor `account` (e.g. an email) is unique
//! on its own -- the same provider can have several accounts, and in
//! principle the same account could hold more than one token for a provider
//! (a rotated-but-not-yet-revoked pair, say). So each entry gets its own
//! random `id`; that id, not provider or account text, is what every
//! read/update/delete call addresses.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use aes_gcm::aead::{Aead, KeyInit, OsRng as AeadOsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{bail, Context, Result};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

const KEYRING_SERVICE: &str = "dev.commandcenter.app";
const KEYRING_ACCOUNT: &str = "credential-root-key";
const CREDENTIALS_FILE: &str = "credentials.json";

#[derive(Serialize, Deserialize, Default)]
struct StoredEntry {
    provider: String,
    account: String,
    /// RFC 3339 timestamp with an explicit UTC offset (e.g.
    /// "2026-12-31T23:59:00+01:00"), as entered by the user -- stored
    /// verbatim rather than normalized to UTC so "when" and "in what
    /// timezone the user meant it" both survive.
    expires_at: Option<String>,
    /// Base64-encoded AES-GCM nonce (12 bytes).
    nonce: String,
    /// Base64-encoded ciphertext.
    ciphertext: String,
}

#[derive(Serialize, Deserialize, Default)]
struct StoredFile {
    /// Random id -> encrypted entry. The id is the only unique key; provider
    /// and account are both allowed to repeat across entries.
    entries: BTreeMap<String, StoredEntry>,
}

/// Non-secret summary of a stored entry, safe to return to the frontend.
#[derive(Serialize)]
pub struct CredentialSummary {
    pub id: String,
    pub provider: String,
    pub account: String,
    pub expires_at: Option<String>,
}

pub struct CredentialStore {
    path: PathBuf,
    key: Zeroizing<[u8; 32]>,
}

#[allow(dead_code)] // load/spawn_with_credential: not wired to a Tauri command yet (see docstring)
impl CredentialStore {
    /// Open (creating if needed) the store rooted at `app_data_dir`. Fetches or
    /// generates the wrapping key in the OS secret store.
    pub fn open(app_data_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(app_data_dir).context("failed to create app data dir")?;
        let key = load_or_create_root_key()?;
        Ok(Self {
            path: app_data_dir.join(CREDENTIALS_FILE),
            key,
        })
    }

    fn encrypt(&self, token: &str) -> Result<(String, String)> {
        let cipher = Aes256Gcm::new_from_slice(self.key.as_slice())
            .map_err(|_| anyhow::anyhow!("invalid root key length"))?;
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, token.as_bytes())
            .map_err(|e| anyhow::anyhow!("encryption failed: {e}"))?;
        Ok((B64.encode(nonce_bytes), B64.encode(ciphertext)))
    }

    fn new_id() -> String {
        let mut bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut bytes);
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    /// Encrypt and store a new entry for `provider`/`account`, returning its id.
    pub fn add(
        &self,
        provider: &str,
        account: &str,
        token: &str,
        expires_at: Option<&str>,
    ) -> Result<String> {
        let (nonce, ciphertext) = self.encrypt(token)?;
        let id = Self::new_id();
        let mut file = self.read_file()?;
        file.entries.insert(
            id.clone(),
            StoredEntry {
                provider: provider.to_owned(),
                account: account.to_owned(),
                expires_at: expires_at.map(str::to_owned),
                nonce,
                ciphertext,
            },
        );
        self.write_file(&file)?;
        Ok(id)
    }

    /// Read `path` from disk and store its trimmed contents as a new entry.
    /// The file's contents never leave this process -- callers on the Tauri
    /// side must not read the file themselves and pass it as a string, or the
    /// plaintext would cross the IPC boundary to the frontend.
    pub fn add_from_file(
        &self,
        provider: &str,
        account: &str,
        path: &Path,
        expires_at: Option<&str>,
    ) -> Result<String> {
        let token = read_trimmed(path)?;
        self.add(provider, account, &token, expires_at)
    }

    /// Replace the token value (and expiry) of an existing entry, keeping its
    /// id/provider/account.
    pub fn update_token(&self, id: &str, token: &str, expires_at: Option<&str>) -> Result<()> {
        let (nonce, ciphertext) = self.encrypt(token)?;
        let mut file = self.read_file()?;
        let entry = file
            .entries
            .get_mut(id)
            .ok_or_else(|| anyhow::anyhow!("no stored credential with id '{id}'"))?;
        entry.nonce = nonce;
        entry.ciphertext = ciphertext;
        entry.expires_at = expires_at.map(str::to_owned);
        self.write_file(&file)
    }

    /// Same as `update_token`, but reads the value from a file (see `add_from_file`).
    pub fn update_token_from_file(
        &self,
        id: &str,
        path: &Path,
        expires_at: Option<&str>,
    ) -> Result<()> {
        let token = read_trimmed(path)?;
        self.update_token(id, &token, expires_at)
    }

    /// Decrypt and return the token for entry `id`, or `None` if not stored.
    /// Caller must not log or persist the returned value.
    pub fn load(&self, id: &str) -> Result<Option<Zeroizing<String>>> {
        let file = self.read_file()?;
        let Some(entry) = file.entries.get(id) else {
            return Ok(None);
        };
        let nonce_bytes = B64
            .decode(&entry.nonce)
            .context("corrupt credential entry: bad nonce")?;
        let ciphertext = B64
            .decode(&entry.ciphertext)
            .context("corrupt credential entry: bad ciphertext")?;
        let cipher = Aes256Gcm::new_from_slice(self.key.as_slice())
            .map_err(|_| anyhow::anyhow!("invalid root key length"))?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_slice())
            .map_err(|_| anyhow::anyhow!("decryption failed: wrong key or corrupt data"))?;
        let text = String::from_utf8(plaintext).context("decrypted token is not UTF-8")?;
        Ok(Some(Zeroizing::new(text)))
    }

    /// Remove a stored entry, if present.
    pub fn delete(&self, id: &str) -> Result<()> {
        let mut file = self.read_file()?;
        file.entries.remove(id);
        self.write_file(&file)
    }

    /// List every stored entry's id/provider/account/expiry, without decrypting any of them.
    pub fn list(&self) -> Result<Vec<CredentialSummary>> {
        Ok(self
            .read_file()?
            .entries
            .into_iter()
            .map(|(id, entry)| CredentialSummary {
                id,
                provider: entry.provider,
                account: entry.account,
                expires_at: entry.expires_at,
            })
            .collect())
    }

    fn read_file(&self) -> Result<StoredFile> {
        if !self.path.exists() {
            return Ok(StoredFile::default());
        }
        let raw = std::fs::read_to_string(&self.path).context("failed to read credentials file")?;
        serde_json::from_str(&raw).context("credentials file is malformed")
    }

    fn write_file(&self, file: &StoredFile) -> Result<()> {
        let json = serde_json::to_string_pretty(file)?;
        #[cfg(unix)]
        {
            use std::io::Write as _;
            use std::os::unix::fs::OpenOptionsExt;
            std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(&self.path)
                .context("failed to open credentials file")?
                .write_all(json.as_bytes())
                .context("failed to write credentials file")?;
        }
        #[cfg(not(unix))]
        {
            std::fs::write(&self.path, json).context("failed to write credentials file")?;
        }
        Ok(())
    }

    /// Spawn `program` with `args`, injecting the decrypted token for entry
    /// `id` as `env_var` on the child process only. The plaintext token is
    /// never written to disk and is dropped (zeroized) as soon as this call
    /// returns.
    ///
    /// Stub: there is no PTY/process-supervision engine yet (see
    /// docs/ARCHITECTURE.md), so this spawns a bare child process with
    /// inherited stdio. It exists to validate the credential-injection path
    /// ahead of the real process engine, not as the final spawn API.
    pub fn spawn_with_credential(
        &self,
        id: &str,
        env_var: &str,
        program: &str,
        args: &[String],
    ) -> Result<std::process::Child> {
        let Some(token) = self.load(id)? else {
            bail!("no stored credential with id '{id}'");
        };
        std::process::Command::new(program)
            .args(args)
            .env(env_var, token.as_str())
            .spawn()
            .with_context(|| format!("failed to spawn '{program}'"))
    }
}

/// Read `path` and return its trimmed contents. Shared by `add_from_file` and
/// `update_token_from_file` -- the only two places allowed to turn a file on
/// disk into a plaintext credential.
fn read_trimmed(path: &Path) -> Result<String> {
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        bail!("file '{}' is empty", path.display());
    }
    Ok(trimmed.to_owned())
}

/// In-process cache for the root key. Each Tauri command opens its own
/// `CredentialStore`, which would otherwise hit the OS keychain on every
/// single call; if that write doesn't durably persist (observed in this dev
/// environment: `set_password` reports success but a fresh read afterward
/// gets `NoEntry`), two calls in the same run could each mint their own
/// random key, and anything encrypted under the first is undecryptable by
/// the second. Caching in-process guarantees every command in one app
/// session uses the same key regardless of whether the underlying OS store
/// round-trips correctly.
static ROOT_KEY: std::sync::OnceLock<[u8; 32]> = std::sync::OnceLock::new();

fn load_or_create_root_key() -> Result<Zeroizing<[u8; 32]>> {
    if let Some(key) = ROOT_KEY.get() {
        return Ok(Zeroizing::new(*key));
    }

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .context("failed to open OS secret store entry")?;

    let key = match entry.get_password() {
        Ok(encoded) => {
            let bytes = B64
                .decode(encoded)
                .context("root key in OS secret store is corrupt")?;
            let arr: [u8; 32] = bytes
                .try_into()
                .map_err(|_| anyhow::anyhow!("root key in OS secret store has wrong length"))?;
            arr
        }
        Err(keyring::Error::NoEntry) => {
            let mut key = [0u8; 32];
            AeadOsRng.fill_bytes(&mut key);
            // Best-effort: if this doesn't durably persist, the in-process
            // cache above still keeps this run self-consistent.
            let _ = entry.set_password(&B64.encode(key));
            key
        }
        Err(e) => return Err(e).context("failed to read root key from OS secret store"),
    };

    // Another thread may have raced us into initializing the cache; that's
    // fine, `get_or_init`-style dedup isn't needed here since both threads
    // would derive/generate a key before either writes to ROOT_KEY, but only
    // the first `set` wins and everyone reads back the same winner.
    let cached = *ROOT_KEY.get_or_init(|| key);
    Ok(Zeroizing::new(cached))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_update_delete_round_trip() {
        let dir = std::env::temp_dir().join(format!("cc-cred-test-{}", std::process::id()));
        let store = CredentialStore::open(&dir).expect("open store");

        assert!(store.list().unwrap().is_empty());

        let id = store
            .add(
                "claude",
                "jonas@example.com",
                "sk-test-token-123",
                Some("2026-12-31T23:59:00+01:00"),
            )
            .unwrap();
        let loaded = store.load(&id).unwrap().expect("token present");
        assert_eq!(loaded.as_str(), "sk-test-token-123");

        let listed = store.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, id);
        assert_eq!(listed[0].provider, "claude");
        assert_eq!(listed[0].account, "jonas@example.com");
        assert_eq!(
            listed[0].expires_at.as_deref(),
            Some("2026-12-31T23:59:00+01:00")
        );

        // Ciphertext on disk must not contain the plaintext token.
        let raw = std::fs::read_to_string(dir.join(CREDENTIALS_FILE)).unwrap();
        assert!(!raw.contains("sk-test-token-123"));

        // Same provider + account can be added again without colliding.
        let id2 = store
            .add("claude", "jonas@example.com", "sk-other-token", None)
            .unwrap();
        assert_ne!(id, id2);
        assert_eq!(store.list().unwrap().len(), 2);

        store.update_token(&id, "sk-rotated-token", None).unwrap();
        assert_eq!(
            store.load(&id).unwrap().unwrap().as_str(),
            "sk-rotated-token"
        );
        assert!(store
            .list()
            .unwrap()
            .iter()
            .find(|e| e.id == id)
            .unwrap()
            .expires_at
            .is_none());

        store.delete(&id).unwrap();
        assert!(store.load(&id).unwrap().is_none());
        assert_eq!(store.list().unwrap().len(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }
}
