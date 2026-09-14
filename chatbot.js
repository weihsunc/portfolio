/* ═══════════════════════════════════════════════════════
   AGENT WEI — the floating window in the bottom right
   Builds the trigger chip and the window shell (a floating expand toggle
   and the body). The body is the voice experience from talk.js,
   mounted on first open. Exposes window.AgentWei = { open, close }.
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const CHEVRON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
  const EXPAND_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
  const COLLAPSE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

  /* ─── Dot ball icon ─────────────────────────────────── */
  // A small live dot ball (same lattice as Talk to Wei), turning slowly.
  function startBall(canvas) {
    // Fine and sparse like the big avatar: few dots, and a dot size fixed in
    // screen pixels (the canvas is drawn at 64 logical px and scaled to its box).
    const box = (canvas.parentElement && canvas.parentElement.getBoundingClientRect().width) || 36;
    const size = 64, R = size * 0.42, c = size / 2, DOTS = 110;
    const px = 64 / box; // one screen pixel, in logical units
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    const phi = Math.PI * (3 - Math.sqrt(5));
    const pts = [];
    for (let i = 0; i < DOTS; i++) {
      const y = 1 - (i / (DOTS - 1)) * 2, rad = Math.sqrt(1 - y * y), th = phi * i;
      pts.push([Math.cos(th) * rad * R, y * R, Math.sin(th) * rad * R]);
    }
    const tilt = 0.25, ct = Math.cos(tilt), st = Math.sin(tilt);
    let rgb = '255,255,255', rgbAt = -1e9;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function frame(now) {
      if (now - rgbAt > 500) {
        rgbAt = now;
        const m = getComputedStyle(canvas).color.match(/\d+(\.\d+)?/g);
        if (m && m.length >= 3) rgb = m.slice(0, 3).join(',');
      }
      const a = still ? 0.6 : now / 1000 * 0.35, ca = Math.cos(a), sa = Math.sin(a);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      for (const [x, y, z] of pts) {
        const x2 = x * ca - z * sa, zr = x * sa + z * ca;
        const y2 = y * ct - zr * st, z2 = y * st + zr * ct;
        const d = (z2 / R + 1) / 2;
        ctx.globalAlpha = 0.15 + d * 0.85;
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.beginPath();
        ctx.arc(c + x2, c + y2, (0.35 + d * 0.45) * px, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!still) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ─── Shell ─────────────────────────────────────────── */
  let trigger, win, body, mounted = false, lastFocus = null;

  function build() {
    trigger = document.createElement('button');
    trigger.className = 'chat-trigger';
    trigger.setAttribute('aria-label', 'Open Agent Wei');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      <span class="chat-trigger-icon"><canvas class="chat-ball" aria-hidden="true"></canvas></span>
      <span class="chat-trigger-label">Agent Wei</span>
      <span class="chat-trigger-close">${CHEVRON_SVG}</span>`;

    win = document.createElement('div');
    win.className = 'chat-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Agent Wei');
    win.innerHTML = `
      <button class="chat-expand-btn" aria-label="Expand" aria-pressed="false">
        <span class="chat-expand-icon">${EXPAND_SVG}</span>
        <span class="chat-collapse-icon">${COLLAPSE_SVG}</span>
      </button>
      <div class="chat-body"></div>`;

    document.body.appendChild(trigger);
    document.body.appendChild(win);
    body = win.querySelector('.chat-body');
    document.querySelectorAll('.chat-ball').forEach(startBall);

    trigger.addEventListener('click', () => (win.classList.contains('open') ? close() : open()));
    const expandBtn = win.querySelector('.chat-expand-btn');
    expandBtn.addEventListener('click', () => {
      const on = win.classList.toggle('expanded');
      expandBtn.setAttribute('aria-pressed', String(on));
      expandBtn.setAttribute('aria-label', on ? 'Collapse' : 'Expand');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && win.classList.contains('open')) close();
    });
  }

  function open() {
    if (!win) build();
    if (!mounted && window.TalkToWei) { window.TalkToWei.mount(body); mounted = true; }
    lastFocus = document.activeElement;
    win.classList.add('open');
    trigger.classList.add('active');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-label', 'Close Agent Wei');
    if (window.TalkToWei) window.TalkToWei.activate();
    const start = body.querySelector('.talk-start');
    setTimeout(() => { if (start && !start.hidden) start.focus(); }, 60);
  }

  function close() {
    if (!win) return;
    if (window.TalkToWei) window.TalkToWei.deactivate();
    win.classList.remove('open');
    trigger.classList.remove('active');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Open Agent Wei');
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
    else trigger.focus();
  }

  window.AgentWei = { open, close };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
