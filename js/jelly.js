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
  let vvHandler = null;

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
    // Lock the page behind the full-screen panel (mobile). overflow:hidden only —
    // no position:fixed body hack; that fought the fixed panel and scrambled it.
    document.documentElement.classList.add("jelly-lock");

    // Greeting on first open.
    if (!messagesEl.hasChildNodes()) {
      addMessage("bot", GREETING);
    }
    attachViewportFit();
    // Only auto-focus on desktop. On mobile, focusing here pops the keyboard
    // immediately and the panel opens in the cramped keyboard-up state; let the
    // user read the greeting and tap to type instead.
    if (window.innerWidth > 600) inputEl.focus();
  }

  function closePanel() {
    panel.classList.remove("jelly-open");
    panel.setAttribute("aria-hidden", "true");
    launcher.classList.remove("jelly-hidden");
    detachViewportFit();
    document.documentElement.classList.remove("jelly-lock");
    launcher.focus();
  }

  // ===== Mobile keyboard handling =====
  // 100dvh doesn't shrink when the on-screen keyboard opens, so the fixed panel
  // keeps its full height and the input bar ends up behind the keyboard. The
  // panel is anchored top-left (CSS), so the ONLY thing we need is to shrink its
  // height to the area above the keyboard (visualViewport.height).
  //
  // We deliberately do NOT translate/offset the panel: iOS Safari is
  // inconsistent about whether position:fixed is relative to the layout or the
  // visual viewport while the keyboard is up, so any offset double-counts on
  // some versions and floats the panel. Instead we force the page scroll back
  // to 0 so the visual and layout viewports share an origin, and a plain
  // top:0 + height works the same on every iOS version.
  function fitToViewport() {
    var vv = window.visualViewport;
    if (!vv) return;
    // Desktop / wide screens: leave the CSS layout (anchored bottom-right) alone.
    if (window.innerWidth > 600) {
      clearPanelInlineLayout();
      return;
    }
    // Only act while the panel is actually open.
    if (!panel.classList.contains("jelly-open")) return;

    // Kill any keyboard-induced page scroll so top:0 means the visible top.
    if (window.scrollY !== 0) window.scrollTo(0, 0);
    panel.style.height = vv.height + "px";
    scrollToBottom();
  }

  function clearPanelInlineLayout() {
    panel.style.width = "";
    panel.style.height = "";
    panel.style.transform = "";
  }

  // iOS doesn't always report final viewport geometry on the first resize event
  // (the keyboard animates over ~250ms). Re-fit a few times after open/rotate so
  // the panel settles to the correct size once the keyboard finishes animating.
  function refitSoon() {
    fitToViewport();
    [60, 180, 320, 500].forEach(function (ms) {
      window.setTimeout(fitToViewport, ms);
    });
  }

  function attachViewportFit() {
    if (!window.visualViewport) return;
    // Coalesce the bursts of resize/scroll events iOS fires into one rAF update
    // so the panel tracks the keyboard smoothly without layout thrash.
    var scheduled = false;
    vvHandler = function () {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        fitToViewport();
      });
    };
    window.visualViewport.addEventListener("resize", vvHandler);
    window.visualViewport.addEventListener("scroll", vvHandler);
    // Re-fit when the focused field changes or the device rotates.
    window.addEventListener("orientationchange", refitSoon);
    inputEl.addEventListener("focus", refitSoon);
    refitSoon();
  }

  function detachViewportFit() {
    if (window.visualViewport && vvHandler) {
      window.visualViewport.removeEventListener("resize", vvHandler);
      window.visualViewport.removeEventListener("scroll", vvHandler);
    }
    window.removeEventListener("orientationchange", refitSoon);
    inputEl.removeEventListener("focus", refitSoon);
    vvHandler = null;
    // Reset any inline sizing so desktop / next open starts clean.
    clearPanelInlineLayout();
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
