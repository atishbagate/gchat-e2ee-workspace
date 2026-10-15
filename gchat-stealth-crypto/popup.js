/**
 * GChat Stealth E2EE - Extension Popup Script
 *
 * Handles vault unlock/lock lifecycle and manual fallback scratchpad.
 */

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const statusBadge = document.getElementById("statusBadge");
  const passphraseInput = document.getElementById("passphraseInput");
  const togglePwdBtn = document.getElementById("togglePwdBtn");
  const unlockBtn = document.getElementById("unlockBtn");
  const lockBtn = document.getElementById("lockBtn");
  const authFeedback = document.getElementById("authFeedback");

  const scratchpadInput = document.getElementById("scratchpadInput");
  const scratchpadEncryptBtn = document.getElementById("scratchpadEncryptBtn");
  const scratchpadDecryptBtn = document.getElementById("scratchpadDecryptBtn");
  const scratchpadClearBtn = document.getElementById("scratchpadClearBtn");
  const scratchpadFeedback = document.getElementById("scratchpadFeedback");
  const resultContainer = document.getElementById("resultContainer");
  const resultBox = document.getElementById("resultBox");
  const copyResultBtn = document.getElementById("copyResultBtn");

  /**
   * Updates UI to reflect current unlocked / locked state.
   * @param {boolean} isUnlocked
   */
  function updateStatusUI(isUnlocked) {
    if (isUnlocked) {
      statusBadge.className = "status-badge unlocked";
      statusBadge.textContent = "🟢 Session Unlocked";
      lockBtn.disabled = false;
    } else {
      statusBadge.className = "status-badge locked";
      statusBadge.textContent = "🔴 Session Locked";
      lockBtn.disabled = true;
    }
  }

  /**
   * Displays temporary feedback in a container.
   * @param {HTMLElement} element
   * @param {string} msg
   * @param {"info"|"success"|"error"} type
   */
  function setFeedback(element, msg, type = "info") {
    element.className = `feedback ${type}`;
    element.textContent = msg;
    if (msg) {
      setTimeout(() => {
        if (element.textContent === msg) {
          element.textContent = "";
        }
      }, 4000);
    }
  }

  // Check initial vault status from Service Worker
  chrome.runtime.sendMessage({ action: "STATUS" }, (res) => {
    if (chrome.runtime.lastError || !res || !res.ok) {
      updateStatusUI(false);
      return;
    }
    updateStatusUI(Boolean(res.data && res.data.unlocked));
  });

  // Password visibility toggle
  togglePwdBtn.addEventListener("click", () => {
    if (passphraseInput.type === "password") {
      passphraseInput.type = "text";
      togglePwdBtn.textContent = "🔒";
    } else {
      passphraseInput.type = "password";
      togglePwdBtn.textContent = "👁️";
    }
  });

  // Unlock Session
  unlockBtn.addEventListener("click", () => {
    const password = passphraseInput.value;
    if (!password) {
      setFeedback(authFeedback, "Please enter a passphrase.", "error");
      passphraseInput.focus();
      return;
    }

    chrome.runtime.sendMessage({ action: "SET_KEY", password }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        setFeedback(authFeedback, res?.error || "Failed to unlock session.", "error");
        return;
      }

      // Clear input so secret isn't kept in DOM
      passphraseInput.value = "";
      updateStatusUI(true);
      setFeedback(authFeedback, "Vault unlocked! Key stored in volatile RAM.", "success");
    });
  });

  // Allow pressing Enter in passphrase input to unlock
  passphraseInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      unlockBtn.click();
    }
  });

  // Lock & Wipe RAM
  lockBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "LOCK_KEY" }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        setFeedback(authFeedback, res?.error || "Failed to lock session.", "error");
        return;
      }

      passphraseInput.value = "";
      updateStatusUI(false);
      resultContainer.style.display = "none";
      resultBox.textContent = "";
      setFeedback(authFeedback, "Vault locked & memory wiped clean.", "success");
    });
  });

  // Fallback Scratchpad - Encrypt
  scratchpadEncryptBtn.addEventListener("click", () => {
    const text = scratchpadInput.value.trim();
    if (!text) {
      setFeedback(scratchpadFeedback, "Please enter text to encrypt.", "error");
      return;
    }

    setFeedback(scratchpadFeedback, "Deriving key & encrypting...", "info");
    chrome.runtime.sendMessage({ action: "ENCRYPT", plaintext: text }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        const err = res?.error || chrome.runtime.lastError?.message || "Encryption failed";
        setFeedback(scratchpadFeedback, err, "error");
        return;
      }

      resultBox.textContent = res.data;
      resultContainer.style.display = "block";
      setFeedback(scratchpadFeedback, "Encrypted successfully!", "success");
    });
  });

  // Fallback Scratchpad - Decrypt
  scratchpadDecryptBtn.addEventListener("click", () => {
    const text = scratchpadInput.value.trim();
    if (!text) {
      setFeedback(scratchpadFeedback, "Please paste an ENCv2:... payload to decrypt.", "error");
      return;
    }

    setFeedback(scratchpadFeedback, "Decrypting payload...", "info");
    chrome.runtime.sendMessage({ action: "DECRYPT", payload: text }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        const err = res?.error || chrome.runtime.lastError?.message || "Decryption failed";
        setFeedback(scratchpadFeedback, err, "error");
        return;
      }

      resultBox.textContent = `[${res.data.timestamp}] ${res.data.message}`;
      resultContainer.style.display = "block";
      setFeedback(scratchpadFeedback, "Decrypted successfully!", "success");
    });
  });

  // Fallback Scratchpad - Clear
  scratchpadClearBtn.addEventListener("click", () => {
    scratchpadInput.value = "";
    resultBox.textContent = "";
    resultContainer.style.display = "none";
    scratchpadFeedback.textContent = "";
  });

  // Copy Result Button
  copyResultBtn.addEventListener("click", async () => {
    const content = resultBox.textContent;
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      copyResultBtn.textContent = "✅ Copied!";
      setTimeout(() => {
        copyResultBtn.textContent = "📋 Copy";
      }, 1500);
    } catch (err) {
      setFeedback(scratchpadFeedback, "Clipboard write permission denied.", "error");
    }
  });
});
