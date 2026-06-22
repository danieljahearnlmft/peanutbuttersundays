/* Jelly — chat widget for Peanut Butter Sundays.
   Vanilla JS, no build step. Talks to the Cloudflare Worker backend (Part A),
   which holds the DeepSeek API key. No API key lives here in the browser.
   Conversation history is kept in memory only (no localStorage). */

(function () {
  "use strict";

  // ===== CONFIG =====
  // TODO: paste the real Worker URL printed by `npx wrangler deploy`
  // (it looks like https://jelly.<your-subdomain>.workers.dev).
  const JELLY_ENDPOINT = "https://jelly.jellybot.workers.dev";

  const GREETING =
    "Hi! I'm Jelly 🥪 — ask me anything about Peanut Butter Sundays: our programs, how to donate, volunteer, or get involved.";
  const ERROR_REPLY =
    "Jelly is having trouble right now, please try again.";

  // In-memory conversation history (sent to the backend each turn).
  const history = [];

  let panel, launcher, messagesEl, inputEl, sendBtn, closeBtn;
  let isSending = false;

  // ===== Build the DOM =====
  function buildWidget() {
    launcher = document.createElement("button");
    launcher.className = "jelly-launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Open Jelly chat assistant");
    launcher.innerHTML =
      '<span class="jelly-launcher-icon" aria-hidden="true">🥪</span><span>Ask Jelly</span>';

    panel = document.createElement("div");
    panel.className = "jelly-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-label", "Jelly chat assistant");
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = [
      '<div class="jelly-header">',
      '  <span class="jelly-header-avatar" aria-hidden="true">🥪</span>',
      '  <div class="jelly-header-title">',
      '    <span class="jelly-name">Jelly</span>',
      '    <span class="jelly-sub">ask us anything</span>',
      "  </div>",
      '  <button class="jelly-close" type="button" aria-label="Close chat">&times;</button>',
      "</div>",
      '<div class="jelly-consent">By chatting with Jelly you agree to our <a href="/legal/">Terms &amp; Privacy</a>. Jelly is an AI assistant, can make mistakes, and is not medical, legal, or emergency advice.</div>',
      '<div class="jelly-messages" role="log" aria-live="polite" aria-label="Conversation with Jelly"></div>',
      '<div class="jelly-input-row">',
      '  <textarea class="jelly-input" rows="1" placeholder="Type your message…" aria-label="Message Jelly"></textarea>',
      '  <button class="jelly-send" type="button" aria-label="Send message">➤</button>',
      "</div>",
      '<div class="jelly-footer">',
      "  <div>Jelly is an AI assistant and can make mistakes.</div>",
      '  <div class="jelly-footer-fine">Not medical, legal, or emergency advice. In a crisis call 988 or 911. <a href="/legal/" target="_blank" rel="noopener">Terms &amp; Privacy</a></div>',
      "</div>",
    ].join("");

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    messagesEl = panel.querySelector(".jelly-messages");
    inputEl = panel.querySelector(".jelly-input");
    sendBtn = panel.querySelector(".jelly-send");
    closeBtn = panel.querySelector(".jelly-close");

    launcher.addEventListener("click", openPanel);
    closeBtn.addEventListener("click", closePanel);
    sendBtn.addEventListener("click", handleSend);

    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Auto-grow the textarea.
    inputEl.addEventListener("input", function () {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + "px";
    });

    // Esc closes the panel.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("jelly-open")) {
        closePanel();
      }
    });
  }

  // ===== Open / close =====
  function openPanel() {
    panel.classList.add("jelly-open");
    panel.setAttribute("aria-hidden", "false");
    launcher.classList.add("jelly-hidden");
    // Lock background scroll while the panel is open.
    document.body.classList.add("jelly-open");

    // Greeting on first open.
    if (!messagesEl.hasChildNodes()) {
      addMessage("bot", GREETING);
    }
    inputEl.focus();
  }

  function closePanel() {
    panel.classList.remove("jelly-open");
    panel.setAttribute("aria-hidden", "true");
    launcher.classList.remove("jelly-hidden");
    // Restore background scroll.
    document.body.classList.remove("jelly-open");
    launcher.focus();
  }

  // ===== Rendering =====
  function addMessage(who, text) {
    const el = document.createElement("div");
    el.className = "jelly-msg " + (who === "user" ? "jelly-msg-user" : "jelly-msg-bot");
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "jelly-typing";
    el.setAttribute("aria-label", "Jelly is typing");
    el.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setSending(state) {
    isSending = state;
    sendBtn.disabled = state;
    inputEl.disabled = state;
  }

  // ===== Send =====
  async function handleSend() {
    if (isSending) return;
    const text = inputEl.value.trim();
    if (!text) return;

    addMessage("user", text);
    history.push({ role: "user", content: text });

    inputEl.value = "";
    inputEl.style.height = "auto";
    setSending(true);

    const typingEl = showTyping();

    try {
      const res = await fetch(JELLY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json().catch(function () {
        return {};
      });

      typingEl.remove();

      const reply = data && data.reply ? data.reply : ERROR_REPLY;
      addMessage("bot", reply);
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      typingEl.remove();
      addMessage("bot", ERROR_REPLY);
    } finally {
      setSending(false);
      inputEl.focus();
    }
  }

  // ===== Init =====
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
