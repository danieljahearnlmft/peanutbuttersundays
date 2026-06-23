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

  // Bump this with every change so you can confirm on-device which build you're
  // running (shown tiny in the footer, and must match ?v=N in the HTML).
  const VERSION = "v9";

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

    // Tiny build stamp in the footer so you can confirm the version on-device.
    panel.querySelector(".jelly-footer-fine").insertAdjacentHTML(
      "beforeend",
      ' <span style="opacity:.45">' + VERSION + "</span>"
    );

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
    lockScroll();

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
    unlockScroll();
    launcher.focus();
  }

  // ===== Page scroll lock (mobile) =====
  // overflow:hidden does NOT stop scrolling on iOS Safari. The reliable lock is
  // position:fixed on <body> with the scroll offset stored, restored on close.
  // It also stops iOS from scrolling the document when the input focuses, which
  // is what dragged the fixed panel off-screen.
  var savedScrollY = 0;

  function lockScroll() {
    if (window.innerWidth > 600) return;
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add("jelly-lock");
    document.body.style.top = -savedScrollY + "px";
  }

  function unlockScroll() {
    if (!document.documentElement.classList.contains("jelly-lock")) return;
    document.documentElement.classList.remove("jelly-lock");
    document.body.style.top = "";
    window.scrollTo(0, savedScrollY);
  }

  // ===== Mobile keyboard handling =====
  // 100dvh doesn't shrink when the keyboard opens, so the fixed panel keeps full
  // height and the input ends up behind the keyboard. With <body> locked
  // (position:fixed) the document can't scroll, so visualViewport.offsetTop is a
  // stable measure of where the visible area starts. Pin the panel to that
  // visible rectangle: top/left = offset, width/height = the visual viewport.
  // This keeps it filling exactly the area above the keyboard.
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

    panel.style.top = vv.offsetTop + "px";
    panel.style.left = vv.offsetLeft + "px";
    panel.style.width = vv.width + "px";
    panel.style.height = vv.height + "px";
    scrollToBottom();
  }

  // On mobile, the input being focused means the keyboard is open — a far more
  // reliable signal than measuring viewport heights (iOS sometimes shrinks
  // innerHeight too). The jelly-kb class hides the consent + footer chrome (CSS)
  // so the chat isn't smooshed into the space above the keyboard.
  function onInputFocus() {
    if (window.innerWidth <= 600) panel.classList.add("jelly-kb");
    refitSoon();
  }

  function onInputBlur() {
    panel.classList.remove("jelly-kb");
    refitSoon();
  }

  function clearPanelInlineLayout() {
    panel.style.top = "";
    panel.style.left = "";
    panel.style.width = "";
    panel.style.height = "";
    panel.classList.remove("jelly-kb");
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
    // Re-fit / toggle keyboard chrome when focus changes or the device rotates.
    window.addEventListener("orientationchange", refitSoon);
    inputEl.addEventListener("focus", onInputFocus);
    inputEl.addEventListener("blur", onInputBlur);
    refitSoon();
  }

  function detachViewportFit() {
    if (window.visualViewport && vvHandler) {
      window.visualViewport.removeEventListener("resize", vvHandler);
      window.visualViewport.removeEventListener("scroll", vvHandler);
    }
    window.removeEventListener("orientationchange", refitSoon);
    inputEl.removeEventListener("focus", onInputFocus);
    inputEl.removeEventListener("blur", onInputBlur);
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
