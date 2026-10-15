/**
 * GChat Stealth E2EE - Content Script
 *
 * Provides in-place compose box encryption (Alt+E) and closed Shadow DOM
 * Hold-to-Peek incoming message decryption to defeat DOM telemetry scraping.
 */

(() => {
  const PREFIX = "ENCv2:";
  const DEFAULT_BADGE_TEXT = "🔒 Encrypted Message (Hold to Peek)";

  /**
   * Displays a temporary notification toast.
   * @param {string} message
   * @param {"info"|"success"|"error"} type
   */
  function showToast(message, type = "info") {
    let container = document.getElementById("gchat-stealth-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "gchat-stealth-toast-container";
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const bgColors = {
      info: "#1e293b",
      success: "#065f46",
      error: "#7f1d1d"
    };
    const borderColors = {
      info: "#38bdf8",
      success: "#34d399",
      error: "#f87171"
    };

    toast.style.cssText = `
      background: ${bgColors[type] || bgColors.info};
      color: #ffffff;
      border: 1px solid ${borderColors[type] || borderColors.info};
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      opacity: 0;
      transform: translateY(-8px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      max-width: 320px;
      word-break: break-word;
    `;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  /**
   * Displays a fallback modal for manual copy if execCommand is blocked.
   * @param {string} ciphertext
   */
  function showManualCopyModal(ciphertext) {
    const existing = document.getElementById("gchat-stealth-modal-backdrop");
    if (existing) existing.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "gchat-stealth-modal-backdrop";
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px;
      width: 440px;
      max-width: 90vw;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      color: #e2e8f0;
    `;

    const title = document.createElement("h3");
    title.style.cssText = "margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #38bdf8;";
    title.textContent = "🔒 Encrypted Payload Ready";

    const desc = document.createElement("p");
    desc.style.cssText = "margin: 0 0 12px 0; font-size: 13px; color: #94a3b8; line-height: 1.4;";
    desc.textContent = "Auto-replace was restricted. Copy the ciphertext below and paste it into the chat box:";

    const textarea = document.createElement("textarea");
    textarea.value = ciphertext;
    textarea.readOnly = true;
    textarea.rows = 4;
    textarea.style.cssText = `
      width: 100%;
      box-sizing: border-box;
      background: #020617;
      color: #a5f3fc;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
      resize: vertical;
      outline: none;
    `;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "📋 Copy to Clipboard";
    copyBtn.style.cssText = `
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = `
      background: #334155;
      color: #f1f5f9;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 13px;
      cursor: pointer;
    `;

    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(ciphertext);
        copyBtn.textContent = "✅ Copied!";
        setTimeout(() => {
          backdrop.remove();
        }, 600);
      } catch (err) {
        textarea.select();
        document.execCommand("copy");
        copyBtn.textContent = "✅ Copied!";
        setTimeout(() => {
          backdrop.remove();
        }, 600);
      }
    };

    closeBtn.onclick = () => backdrop.remove();
    backdrop.onclick = (e) => {
      if (e.target === backdrop) backdrop.remove();
    };

    btnRow.appendChild(closeBtn);
    btnRow.appendChild(copyBtn);

    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(textarea);
    modal.appendChild(btnRow);
    backdrop.appendChild(modal);

    document.body.appendChild(backdrop);
    textarea.focus();
    textarea.select();
  }

  /**
   * Finds the active editable element (contenteditable).
   * @returns {HTMLElement|null}
   */
  function getActiveContentEditable() {
    const active = document.activeElement;
    if (!active) return null;
    if (active.getAttribute("contenteditable") === "true") return active;
    return active.closest('[contenteditable="true"]');
  }

  /**
   * Outgoing encryption handler (Alt + E).
   */
  document.addEventListener("keydown", async (e) => {
    const isAltE = e.altKey && (e.code === "KeyE" || e.key === "e" || e.key === "E");
    if (!isAltE) return;

    const editable = getActiveContentEditable();
    if (!editable) return;

    const rawText = editable.innerText ? editable.innerText.trim() : "";
    if (!rawText) return;

    e.preventDefault();
    e.stopPropagation();

    chrome.runtime.sendMessage({ action: "ENCRYPT", plaintext: rawText }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        const errorMsg = res?.error || chrome.runtime.lastError?.message || "Encryption failed";
        showToast(`🔒 ${errorMsg}`, "error");
        return;
      }

      const encryptedCiphertext = res.data;

      // Replace text using execCommand selectAll and insertText
      editable.focus();
      let success = false;
      try {
        document.execCommand("selectAll", false, null);
        success = document.execCommand("insertText", false, encryptedCiphertext);
      } catch (err) {
        success = false;
      }

      if (!success) {
        showManualCopyModal(encryptedCiphertext);
      } else {
        showToast("🔒 Message encrypted in-place!", "success");
      }
    });
  }, true);

  /**
   * Creates and mounts the closed Shadow DOM badge for an encrypted text node.
   * @param {Node} textNode
   */
  function processEncryptedNode(textNode) {
    if (!textNode || !textNode.nodeValue) return;

    const trimmed = textNode.nodeValue.trim();
    if (!trimmed.startsWith(PREFIX)) return;

    // Check if already encapsulated or in compose box
    const parent = textNode.parentElement;
    if (parent && (parent.closest('[contenteditable="true"]') || parent.closest(".gchat-stealth-e2ee-host"))) {
      return;
    }

    const payload = trimmed;

    // 1. Clear visible ciphertext from the DOM text node
    textNode.nodeValue = "";

    // 2. Mount closed Shadow DOM container
    const hostSpan = document.createElement("span");
    hostSpan.className = "gchat-stealth-e2ee-host";
    hostSpan.style.display = "inline-block";
    hostSpan.style.margin = "2px 0";

    const shadow = hostSpan.attachShadow({ mode: "closed" });

    // Styles inside the closed Shadow Root
    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: inline-block;
      }
      .peek-btn {
        display: inline-flex;
        align-items: center;
        background: #0f172a;
        color: #38bdf8;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 5px 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        line-height: 1.4;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        text-align: left;
        word-break: break-word;
        white-space: pre-wrap;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        transition: background-color 0.15s, border-color 0.15s, color 0.15s;
      }
      .peek-btn:hover {
        background: #1e293b;
        border-color: #38bdf8;
        color: #7dd3fc;
      }
      .peek-btn:active {
        background: #1e293b;
        border-color: #0284c7;
      }
      .peek-btn.unlocked {
        background: #022c22;
        border-color: #059669;
        color: #6ee7b7;
      }
      .peek-btn.error {
        background: #450a0a;
        border-color: #dc2626;
        color: #fca5a5;
      }
    `;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "peek-btn";
    button.textContent = DEFAULT_BADGE_TEXT;

    let isHolding = false;

    const startPeek = (e) => {
      if (e && e.type === "mousedown" && e.button !== 0) return;
      if (isHolding) return;
      isHolding = true;
      button.textContent = "⏳ Decrypting...";
      button.classList.remove("error", "unlocked");

      chrome.runtime.sendMessage({ action: "DECRYPT", payload: payload }, (res) => {
        if (!isHolding) {
          button.textContent = DEFAULT_BADGE_TEXT;
          button.classList.remove("unlocked", "error");
          return;
        }

        if (chrome.runtime.lastError || !res || !res.ok) {
          const err = res?.error || chrome.runtime.lastError?.message || "Decryption failed";
          button.textContent = "⚠️ " + err;
          button.classList.add("error");
        } else if (res.data) {
          // Strictly render via textContent (NEVER innerHTML)
          button.textContent = "🔓 [" + res.data.timestamp + "] " + res.data.message;
          button.classList.add("unlocked");
        }
      });
    };

    const stopPeek = () => {
      if (!isHolding) return;
      isHolding = false;
      button.textContent = DEFAULT_BADGE_TEXT;
      button.classList.remove("unlocked", "error");
    };

    button.addEventListener("mousedown", startPeek);
    button.addEventListener("mouseup", stopPeek);
    button.addEventListener("mouseleave", stopPeek);

    // Touch support for mobile / touch screens
    button.addEventListener("touchstart", (e) => {
      e.preventDefault();
      startPeek(e);
    });
    button.addEventListener("touchend", (e) => {
      e.preventDefault();
      stopPeek();
    });
    button.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      stopPeek();
    });

    shadow.appendChild(style);
    shadow.appendChild(button);

    if (textNode.parentNode) {
      textNode.parentNode.insertBefore(hostSpan, textNode);
    }
  }

  /**
   * Scans a DOM subtree using TreeWalker looking for ENCv2: text nodes.
   * @param {Node} root
   */
  function scanAndMount(root = document.body) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      processEncryptedNode(root);
      return;
    }

    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.closest && (root.closest('[contenteditable="true"]') || root.closest(".gchat-stealth-e2ee-host"))) {
        return;
      }
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          const trimmed = node.nodeValue.trim();
          if (!trimmed.startsWith(PREFIX)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement && (node.parentElement.closest('[contenteditable="true"]') || node.parentElement.closest(".gchat-stealth-e2ee-host"))) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodesToProcess = [];
    let current;
    while ((current = walker.nextNode())) {
      nodesToProcess.push(current);
    }

    for (const textNode of nodesToProcess) {
      processEncryptedNode(textNode);
    }
  }

  // Initial scan on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scanAndMount(document.body));
  } else {
    scanAndMount(document.body);
  }

  // MutationObserver for continuous incoming messages
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const added of mutation.addedNodes) {
          scanAndMount(added);
        }
      } else if (mutation.type === "characterData") {
        scanAndMount(mutation.target);
      }
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
