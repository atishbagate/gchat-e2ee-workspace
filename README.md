# GChat Stealth E2EE 🔒

A zero-storage, zero-dependency Manifest V3 Chrome Extension providing End-to-End Encryption (E2EE) on Google Chat (`https://chat.google.com/`) and Gmail Chat (`https://mail.google.com/`).

Built using Vanilla JavaScript and the native **Web Crypto API** (`crypto.subtle`).

---

## Key Features

- **Zero-Storage Volatile RAM Vault**: Cryptographic keys and passphrases are stored strictly in volatile RAM inside the background service worker. No keys or passphrases are ever written to disk, `localStorage`, or `chrome.storage`.
- **Hardened Cryptography**:
  - Key Derivation: **PBKDF2** with `SHA-256` and **310,000 iterations** (`extractable: false`).
  - Cipher: **AES-256-GCM** with 16-byte random salt, 12-byte random IV, and 128-bit authentication tag.
  - Authenticated Payload: Includes `"ENCv2:"` domain separator as `additionalData`.
  - Replay Defense: Encapsulated in JSON envelope with millisecond timestamps (`{ t: Date.now(), m: plaintext }`).
- **Closed Shadow DOM Hold-to-Peek**:
  - Decrypted messages are mounted inside `attachShadow({ mode: "closed" })` elements.
  - Page scripts, extensions, and host telemetry cannot inspect or scrape the decrypted text inside the closed shadow root.
  - Uses `textContent` exclusively (zero `innerHTML` usage) to prevent XSS.
- **In-Place Hotkey Compose**: Focus any Google Chat compose box and press <kbd>Alt</kbd> + <kbd>E</kbd> to encrypt in-place.
- **Fallback Scratchpad**: Built-in popup scratchpad for manual encryption and decryption.

---

## Directory Structure

```
gchat-stealth-crypto/
├── manifest.json       # Manifest V3 extension definition
├── background.js      # Isolated volatile RAM crypto vault
├── content.js         # Compose hook (Alt+E) & closed Shadow DOM peeking
├── popup.html         # Dark-mode extension popup interface
└── popup.js           # Session unlock/lock and scratchpad controller
```

---

## Installation (Developer Mode)

1. Clone or download this repository.
2. Open Google Chrome and navigate to:
   ```
   chrome://extensions/
   ```
3. Enable **Developer mode** via the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the `gchat-stealth-crypto` folder.

---

## Usage

1. **Unlock the Vault**:
   - Click the extension icon in the Chrome toolbar.
   - Enter your shared passphrase and click **Unlock Session**.
   - The status badge changes to `🟢 Session Unlocked`.
2. **Encrypt Outgoing Messages**:
   - Open Google Chat (`https://chat.google.com/`) or Gmail Chat (`https://mail.google.com/`).
   - Type your plaintext in the chat box and press <kbd>Alt</kbd> + <kbd>E</kbd>.
   - The text is encrypted in-place into an `ENCv2:...` payload. Press <kbd>Enter</kbd> to send.
3. **Decrypt Incoming Messages**:
   - Received messages show as `🔒 Encrypted Message (Hold to Peek)`.
   - Click and hold the badge to reveal the decrypted text and timestamp.
   - Release the mouse to instantly conceal the message again.
4. **Lock & Wipe**:
   - Click **Lock & Wipe RAM** in the extension popup at any time to zero out the memory and lock the vault.

---

## Security & Privacy Notice

- **No Third-Party Transmission**: All cryptographic operations occur 100% locally on your machine via `crypto.subtle`. No servers, telemetry, or analytics are used.
- **Corporate Networks & DLP**: If using on an enterprise-managed Google Workspace domain, verify compliance with your organization's security and acceptable use policies.

---

## License

MIT License. Free for personal and educational use.
