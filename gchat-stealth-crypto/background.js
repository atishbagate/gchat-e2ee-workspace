/**
 * GChat Stealth E2EE - Background Service Worker (Isolated Crypto Vault)
 *
 * Implements zero-storage volatile RAM key lifecycle, PBKDF2 key derivation,
 * and authenticated AES-256-GCM encryption with replay-prevention envelopes.
 */

// Volatile RAM key store - Never written to disk, IndexedDB, or localStorage.
let sessionPasswordBytes = null;

const PREFIX = "ENCv2:";
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const MIN_PAYLOAD_BYTES = 44; // 16B Salt + 12B IV + 16B AES-GCM Tag

/**
 * Converts an ArrayBuffer to Base64 in safe chunks to avoid stack overflow.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000; // 32768
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string to an ArrayBuffer.
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives a hardened 256-bit AES-GCM key from password bytes and salt using PBKDF2.
 * @param {Uint8Array} passwordBytes
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveHardenedKey(passwordBytes, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 310000,
      hash: "SHA-256"
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext using AES-256-GCM with replay-protection envelope.
 * @param {string} plaintext
 * @returns {Promise<string>} Prefixed base64 encrypted payload
 */
async function encryptPayload(plaintext) {
  if (!sessionPasswordBytes || sessionPasswordBytes.length === 0) {
    throw new Error("Vault is locked. Unlock session first.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveHardenedKey(sessionPasswordBytes, salt);

  const envelope = JSON.stringify({
    t: Date.now(),
    m: plaintext
  });
  const encodedPayload = new TextEncoder().encode(envelope);
  const additionalData = new TextEncoder().encode(PREFIX);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
      additionalData: additionalData,
      tagLength: 128
    },
    key,
    encodedPayload
  );

  const cipherBytes = new Uint8Array(ciphertext);
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + cipherBytes.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(cipherBytes, salt.byteLength + iv.byteLength);

  return PREFIX + bufferToBase64(combined.buffer);
}

/**
 * Decrypts an ENCv2: payload, validates integrity, and unpacks the envelope.
 * @param {string} payload
 * @returns {Promise<{ message: string, timestamp: string }>}
 */
async function decryptPayload(payload) {
  if (!sessionPasswordBytes || sessionPasswordBytes.length === 0) {
    throw new Error("Vault is locked. Unlock session first.");
  }

  if (typeof payload !== "string" || !payload.startsWith(PREFIX)) {
    throw new Error("Invalid payload: Missing ENCv2: prefix.");
  }

  const base64Data = payload.slice(PREFIX.length).trim();
  const rawBuffer = base64ToBuffer(base64Data);
  const bytes = new Uint8Array(rawBuffer);

  if (bytes.length < MIN_PAYLOAD_BYTES) {
    throw new Error(`Invalid payload: Insufficient length (minimum ${MIN_PAYLOAD_BYTES} bytes required).`);
  }

  const salt = bytes.slice(0, SALT_LENGTH);
  const iv = bytes.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const cipherBytes = bytes.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveHardenedKey(sessionPasswordBytes, salt);
  const additionalData = new TextEncoder().encode(PREFIX);

  let decryptedBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: additionalData,
        tagLength: 128
      },
      key,
      cipherBytes
    );
  } catch (err) {
    throw new Error("Decryption failed. Incorrect passphrase or modified ciphertext.");
  }

  const decodedString = new TextDecoder().decode(decryptedBuffer);
  let parsedEnvelope;
  try {
    parsedEnvelope = JSON.parse(decodedString);
  } catch (err) {
    throw new Error("Malformed envelope structure.");
  }

  return {
    message: parsedEnvelope.m,
    timestamp: new Date(parsedEnvelope.t).toLocaleTimeString()
  };
}

/**
 * Extension runtime message handler.
 * Verifies caller origin and handles crypto operations.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  (async () => {
    try {
      switch (message.action) {
        case "SET_KEY": {
          if (sessionPasswordBytes) {
            sessionPasswordBytes.fill(0);
            sessionPasswordBytes = null;
          }
          const password = message.password || "";
          if (!password) {
            sendResponse({ ok: false, error: "Passphrase cannot be empty." });
            return;
          }
          sessionPasswordBytes = new TextEncoder().encode(password);
          sendResponse({ ok: true, data: { unlocked: true } });
          break;
        }

        case "LOCK_KEY": {
          if (sessionPasswordBytes) {
            sessionPasswordBytes.fill(0);
            sessionPasswordBytes = null;
          }
          sendResponse({ ok: true, data: { unlocked: false } });
          break;
        }

        case "STATUS": {
          sendResponse({
            ok: true,
            data: { unlocked: Boolean(sessionPasswordBytes && sessionPasswordBytes.length > 0) }
          });
          break;
        }

        case "ENCRYPT": {
          const ciphertext = await encryptPayload(message.plaintext || "");
          sendResponse({ ok: true, data: ciphertext });
          break;
        }

        case "DECRYPT": {
          const result = await decryptPayload(message.payload || "");
          sendResponse({ ok: true, data: result });
          break;
        }

        default: {
          sendResponse({ ok: false, error: `Unknown action: ${message.action}` });
          break;
        }
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();

  return true; // Keep message channel open for async response
});
