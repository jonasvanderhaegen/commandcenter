//! Encrypted-at-rest store for provider OAuth/session tokens (Claude, Codex, ...).
//!
//! The wrapping key never touches disk: it lives in the OS secret store (macOS
//! Keychain, Windows Credential Manager, Linux Secret Service, via the
//! `keyring` crate) and is generated once on first use. Tokens are AES-256-GCM
//! encrypted with that key and written to a small JSON file in the app data
//! directory; without the OS-store key, that file is ciphertext only. Plaintext
//! tokens are `Zeroizing` and only ever exist decrypted in memory for the
//! duration of one spawn call -- never returned to the Tauri frontend.

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
    /// Base64-encoded AES-GCM nonce (12 bytes).
    nonce: String,
    /// Base64-encoded ciphertext.
    ciphertext: String,
}

#[derive(Serialize, Deserialize, Default)]
struct StoredFile {
    /// Provider name (e.g. "claude", "codex") -> encrypted token.
    entries: BTreeMap<String, StoredEntry>,
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

    /// Encrypt and persist `token` under `provider`, replacing any existing value.
    pub fn save(&self, provider: &str, token: &str) -> Result<()> {
        let cipher = Aes256Gcm::new_from_slice(self.key.as_slice())
            .map_err(|_| anyhow::anyhow!("invalid root key length"))?;
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, token.as_bytes())
            .map_err(|e| anyhow::anyhow!("encryption failed: {e}"))?;

        let mut file = self.read_file()?;
        file.entries.insert(
            provider.to_owned(),
            StoredEntry {
                nonce: B64.encode(nonce_bytes),
                ciphertext: B64.encode(ciphertext),
            },
        );
        self.write_file(&file)
    }

    /// Decrypt and return the token for `provider`, or `None` if not stored.
    /// Caller must not log or persist the returned value.
    pub fn load(&self, provider: &str) -> Result<Option<Zeroizing<String>>> {
        let file = self.read_file()?;
        let Some(entry) = file.entries.get(provider) else {
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

    /// Remove a stored token, if present.
    pub fn delete(&self, provider: &str) -> Result<()> {
        let mut file = self.read_file()?;
        file.entries.remove(provider);
        self.write_file(&file)
    }

    /// True if a token is stored for `provider`, without decrypting it.
    pub fn has(&self, provider: &str) -> Result<bool> {
        Ok(self.read_file()?.entries.contains_key(provider))
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

    /// Spawn `program` with `args`, injecting the decrypted `provider` token as
    /// `env_var` on the child process only. The plaintext token is never
    /// written to disk and is dropped (zeroized) as soon as this call returns.
    ///
    /// Stub: there is no PTY/process-supervision engine yet (see
    /// docs/ARCHITECTURE.md), so this spawns a bare child process with
    /// inherited stdio. It exists to validate the credential-injection path
    /// ahead of the real process engine, not as the final spawn API.
    pub fn spawn_with_credential(
        &self,
        provider: &str,
        env_var: &str,
        program: &str,
        args: &[String],
    ) -> Result<std::process::Child> {
        let Some(token) = self.load(provider)? else {
            bail!("no stored credential for provider '{provider}'");
        };
        std::process::Command::new(program)
            .args(args)
            .env(env_var, token.as_str())
            .spawn()
            .with_context(|| format!("failed to spawn '{program}'"))
    }
}

fn load_or_create_root_key() -> Result<Zeroizing<[u8; 32]>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .context("failed to open OS secret store entry")?;

    match entry.get_password() {
        Ok(encoded) => {
            let bytes = B64
                .decode(encoded)
                .context("root key in OS secret store is corrupt")?;
            let arr: [u8; 32] = bytes
                .try_into()
                .map_err(|_| anyhow::anyhow!("root key in OS secret store has wrong length"))?;
            Ok(Zeroizing::new(arr))
        }
        Err(keyring::Error::NoEntry) => {
            let mut key = [0u8; 32];
            AeadOsRng.fill_bytes(&mut key);
            entry
                .set_password(&B64.encode(key))
                .context("failed to store root key in OS secret store")?;
            Ok(Zeroizing::new(key))
        }
        Err(e) => Err(e).context("failed to read root key from OS secret store"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_load_delete_round_trip() {
        let dir = std::env::temp_dir().join(format!("cc-cred-test-{}", std::process::id()));
        let store = CredentialStore::open(&dir).expect("open store");

        assert!(!store.has("claude").unwrap());
        assert!(store.load("claude").unwrap().is_none());

        store.save("claude", "sk-test-token-123").unwrap();
        assert!(store.has("claude").unwrap());
        let loaded = store.load("claude").unwrap().expect("token present");
        assert_eq!(loaded.as_str(), "sk-test-token-123");

        // Ciphertext on disk must not contain the plaintext token.
        let raw = std::fs::read_to_string(dir.join(CREDENTIALS_FILE)).unwrap();
        assert!(!raw.contains("sk-test-token-123"));

        store.delete("claude").unwrap();
        assert!(!store.has("claude").unwrap());

        std::fs::remove_dir_all(&dir).ok();
    }
}
