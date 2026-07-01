# CLAUDE.md

Project-specific notes for working in this repo.

## Osmo Vault licensing (osmo.supply)

Jonas has a paid Osmo membership (Vault access). Checked the actual licensing
agreement (osmo.supply/legal/licensing-agreement) on 2026-07-01 rather than
assuming:

> "non-exclusive, non-transferable license to use, modify, and integrate the
> Items into your personal or commercial projects"

This **does** permit integrating a specific, named Vault resource ("Items" —
e.g. a labeled snippet like "Toggle Switch" or "Table of Contents for
Article") into this codebase, including adapting/modifying it. No need to
refuse on principle for that case.

What the license still does **not** cover, so still don't do this:

- Redistributing/reselling/sublicensing the Items themselves, or uploading
  them to another marketplace/site as standalone resources.
- Recreating Items "in other platforms, frameworks, or formats" for
  distribution, or building a competing snippets/template product.
- Copying Osmo's own product UI wholesale — the Vault dashboard's sidebar,
  account menu, search modal, etc. are Osmo's proprietary app interface, not
  a distributed "Item" the license grants reuse rights to. Build original
  versions of that (as already done for CommandCenter's sidebar/search
  modal/theme switcher) rather than cloning it.
- Anything actually gated: if a resource page shows "Locked" or prompts
  login in the browser session, there's no accessible content regardless of
  the license — don't attempt to log in or work around that (credential
  entry is off-limits).

Net effect: when Jonas points at a specific named Vault resource and its
code is actually visible/accessible (in an authenticated session, or pasted
directly into chat), it's fine to use it as a reference and adapt it into
this codebase. Still write it as an adapted integration (matching this
project's own conventions/CSS variables/component structure, not Webflow
classes or unrelated dependencies like Lenis/GSAP this project doesn't use),
not a verbatim paste — that's both what the license contemplates ("modify,
adapt, and combine") and just better practice for keeping the codebase
consistent.
