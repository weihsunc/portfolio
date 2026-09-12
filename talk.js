/* ═══════════════════════════════════════════════════════
   TALK TO WEI — voice conversation with an animated avatar
   Live mode: ElevenLabs Agents via /api/talk-session (voice in, voice out).
   Demo mode: no agent configured yet, so questions typed below go to
   /api/chat and the reply is read aloud with the browser voice.
   Either way the orange mouth on the photo moves with the speech.
   Exposes window.TalkToWei = { open, close }.
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm';
  const SESSION_URL = '/api/talk-session';
  const CHAT_URL = '/api/chat';
  const MAX_HISTORY = 16;

  const DEMO_GREETING = "Hey, I'm the AI version of Wei. This is demo mode, so you are hearing a browser voice for now. Once my voice agent is connected you will be able to talk to me out loud. In the meantime, type a question below.";
  const OFFLINE_ANSWER = "I can't reach my brain right now, but here is the short version: I'm a product designer who ships with AI. I'm driving design at Illoca and co-founding Lofi. Ask me again once the site is deployed.";

  const CLOSE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;
  const MIC_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/></svg>`;

  /* Orange lips over the photo. The lower lip group slides down by the
     openness value; the dark cavity path is rebuilt to fill the gap. */
  const MOUTH_SVG = `
    <svg class="talk-mouth" viewBox="0 0 100 70" aria-hidden="true">
      <defs>
        <linearGradient id="talkLipGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FF9A3C"/><stop offset="1" stop-color="#F25C05"/>
        </linearGradient>
        <clipPath id="talkInnerClip"><path class="talk-inner-clip" d="M5 21 L95 21 L95 21 L5 21 Z"/></clipPath>
      </defs>
      <path class="talk-inner" d="M5 21 L95 21 L95 21 L5 21 Z" fill="#3B1206"/>
      <g clip-path="url(#talkInnerClip)">
        <rect class="talk-teeth" x="15" y="21.5" width="70" height="9" rx="3" fill="#FFF7E8"/>
        <ellipse class="talk-tongue" cx="50" cy="34" rx="22" ry="11" fill="#E2453B"/>
      </g>
      <path class="talk-lip-upper" d="M5 21 C 18 9, 40 5, 50 13 C 60 5, 82 9, 95 21 C 82 26, 62 28, 50 28 C 38 28, 18 26, 5 21 Z" fill="url(#talkLipGrad)" stroke="#C94A08" stroke-width="1.2" stroke-linejoin="round"/>
      <g class="talk-lip-lower">
        <path d="M5 21 C 18 27, 38 29, 50 29 C 62 29, 82 27, 95 21 C 84 34, 66 42, 50 42 C 34 42, 16 34, 5 21 Z" fill="url(#talkLipGrad)" stroke="#C94A08" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M24 33 C 34 37, 66 37, 76 33" fill="none" stroke="#FFC08A" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
        <path d="M5 21 C 18 27, 38 29, 50 29 C 62 29, 82 27, 95 21" fill="none" stroke="#7A2A05" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
      </g>
    </svg>`;

  const PAGE_KEY = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';

  /* ─── State ──────────────────────────────────────────── */
  let el = null;           // dom refs, built on first open
  let state = 'idle';      // idle | connecting | listening | thinking | speaking
  let mode = null;         // 'live' (ElevenLabs) | 'demo' (browser voice)
  let conversation = null; // ElevenLabs session
  let level = 0;           // smoothed mouth openness 0..1
  let pulse = 0;           // demo-mode syllable energy
  let rafId = 0;
  let syllableTimer = 0;
  let muted = false;
  let history = [];        // demo-mode chat turns for /api/chat
  let lastFocus = null;
  let avatarMode = 'photo'; // 'photo' (orange mouth) | 'dots' (point cloud)
  let dots = null;          // dot avatar renderer

  const AVATAR_KEY = 'talk.avatar';
  const clamp = v => Math.max(0, Math.min(1, v));

  function setAvatarMode(next) {
    avatarMode = next === 'dots' ? 'dots' : 'photo';
    el.panel.dataset.avatar = avatarMode;
    el.toggle.querySelectorAll('button').forEach(b => {
      b.classList.toggle('is-on', b.dataset.avatar === avatarMode);
      b.setAttribute('aria-pressed', String(b.dataset.avatar === avatarMode));
    });
    try { localStorage.setItem(AVATAR_KEY, avatarMode); } catch (_) { /* storage blocked */ }
  }

  /* ─── DOM ────────────────────────────────────────────── */
  function build() {
    const overlay = document.createElement('div');
    overlay.className = 'talk-overlay';
    overlay.innerHTML = `
      <div class="talk-panel" role="dialog" aria-modal="true" aria-label="Talk to Wei" data-state="idle">
        <div class="talk-top">
          <h3 class="talk-title">Talk to Wei</h3>
          <div class="talk-avatar-toggle" role="group" aria-label="Avatar style">
            <button type="button" data-avatar="photo">Photo</button>
            <button type="button" data-avatar="dots">Dots</button>
          </div>
          <button class="talk-close" aria-label="Close">${CLOSE_SVG}</button>
        </div>
        <div class="talk-avatar-wrap">
          <div class="talk-avatar">
            <img src="images/avatar-face.jpg" alt="Wei" draggable="false" />
            ${MOUTH_SVG}
            <canvas class="talk-dots" aria-hidden="true"></canvas>
          </div>
        </div>
        <p class="talk-status">Start a conversation. Your mic is only used while it is on.</p>
        <div class="talk-transcript" aria-live="polite"></div>
        <div class="talk-controls">
          <button class="btn primary talk-start">${MIC_SVG}<span>Start talking</span></button>
          <button class="btn talk-mute" hidden>Mute</button>
          <button class="btn danger talk-end" hidden>End</button>
        </div>
        <form class="talk-composer" hidden>
          <input type="text" maxlength="500" placeholder="Or type a question" aria-label="Type a question" autocomplete="off" />
          <button type="submit" class="btn">Send</button>
        </form>
        <p class="talk-disclosure">An AI version of Wei, trained on his notes. For anything important, email <a href="mailto:weihsunc@gmail.com">weihsunc@gmail.com</a>.</p>
      </div>`;
    document.body.appendChild(overlay);

    const q = s => overlay.querySelector(s);
    el = {
      overlay,
      panel: q('.talk-panel'),
      status: q('.talk-status'),
      transcript: q('.talk-transcript'),
      startBtn: q('.talk-start'),
      muteBtn: q('.talk-mute'),
      endBtn: q('.talk-end'),
      composer: q('.talk-composer'),
      input: q('.talk-composer input'),
      inner: q('.talk-inner'),
      innerClip: q('.talk-inner-clip'),
      tongue: q('.talk-tongue'),
      lipUpper: q('.talk-lip-upper'),
      lipLower: q('.talk-lip-lower'),
      img: q('.talk-avatar img'),
      canvas: q('.talk-dots'),
      toggle: q('.talk-avatar-toggle')
    };

    dots = createDotAvatar(el.canvas, el.img);
    el.toggle.addEventListener('click', e => {
      const btn = e.target.closest('button[data-avatar]');
      if (btn) setAvatarMode(btn.dataset.avatar);
    });
    let saved = 'dots';
    try { saved = localStorage.getItem(AVATAR_KEY) || 'dots'; } catch (_) { /* storage blocked */ }
    setAvatarMode(saved);

    q('.talk-close').addEventListener('click', close);
    let downOnBackdrop = false;
    overlay.addEventListener('pointerdown', e => { downOnBackdrop = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && downOnBackdrop) close(); downOnBackdrop = false; });
    el.startBtn.addEventListener('click', start);
    el.endBtn.addEventListener('click', () => end('Conversation ended.'));
    el.muteBtn.addEventListener('click', toggleMute);
    el.composer.addEventListener('submit', e => {
      e.preventDefault();
      const text = el.input.value.trim();
      if (!text) return;
      el.input.value = '';
      ask(text);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
  }

  /* ─── Mouth animation ────────────────────────────────── */
  function setMouth(o) {
    const dy = o * 26;
    const y1 = (21 + dy).toFixed(2), y2 = (27 + dy).toFixed(2), y3 = (29 + dy).toFixed(2);
    const d = `M5 21 C 18 26, 38 28, 50 28 C 62 28, 82 26, 95 21 L 95 ${y1} C 82 ${y2}, 62 ${y3}, 50 ${y3} C 38 ${y3}, 18 ${y2}, 5 ${y1} Z`;
    el.inner.setAttribute('d', d);
    el.innerClip.setAttribute('d', d);
    el.tongue.setAttribute('cy', (30 + dy).toFixed(2));
    el.lipLower.setAttribute('transform', `translate(0 ${dy.toFixed(2)})`);
    el.lipUpper.setAttribute('transform', `translate(0 ${(-o * 3).toFixed(2)})`);
  }

  function tick(now) {
    let target = 0;
    if (state === 'speaking') {
      if (mode === 'live' && conversation) {
        try { target = clamp(conversation.getOutputVolume() * 1.8); } catch (_) { target = 0; }
      } else {
        pulse *= 0.8;
        target = clamp(pulse + Math.random() * 0.08);
      }
    }
    level += (target - level) * (target > level ? 0.55 : 0.28);
    if (level < 0.005) level = 0;
    if (avatarMode === 'dots') dots.render(now, state, level);
    else setMouth(level);
    rafId = requestAnimationFrame(tick);
  }

  // The loop runs while the panel is open: the dot avatar animates even when idle.
  function startLoop() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; level = 0; setMouth(0); }

  /* ─── Dot avatar: a 3D point cloud ────────────────────────
     Monochrome dots in the page's foreground colour. At rest a sparse
     sphere turns slowly. While the agent thinks the sphere rounds itself
     into a soft cube (a superellipsoid) that tumbles and breathes. While
     it speaks it becomes an organic blob: every dot is pushed along its
     normal by a drifting noise field whose strength follows the voice, and
     more dots fade in to give it body. Both are the sphere at zero
     amplitude, so every change is continuous. Wei's head (built from the
     photo) stays in the code for the Photo toggle and future use. The head shape comes from
     the photo itself: the head is masked out (skin and hair, no sky,
     stopping at the collar) and the outline is inflated into a volume, so
     hair, jaw and neck keep their real proportions as it turns. */
  const DOT = {
    size: 220,       // css px of .talk-avatar; the canvas scales with CSS below that
    grid: 96,        // sampling cells per side
    faceDots: 1500,  // dots on the front of the head
    backDots: 520,   // sparse dots on the back of the head
    sphereDots: 620, // dots visible on the resting sphere (the rest fade in as the head forms)
    sphereRadius: 72,
    blobAmp: 0.55,   // how far the sphere deforms while speaking, fraction of its radius
    cubeness: 0.7,   // how square the thinking shape gets, 0 sphere .. 1 sharp cube
    headHeight: 196, // css px the head occupies when facing forward
    headDepth: 0.8,  // thickness relative to half the head width
    collar: 0.72,    // fraction of the crop height below which dark pixels are shirt, not hair
    mouth: { x: 102, y: 144, rx: 22, ry: 13 }, // css px in the flat crop, matches --mouth-* in talk.css
    // landmarks as fractions of the crop, read off the photo
    nose: { x: 0.487, top: 0.45, tip: 0.578, end: 0.62, sigma: 0.045, amp: 0.34 },
    eyes: { y: 0.478, xs: [0.385, 0.59], sigma: 0.035, amp: -0.11 },
    chin: { x: 0.487, y: 0.79, sx: 0.09, sy: 0.05, amp: 0.08 },
    ears: { y: 0.57, ry: 12, rz: 11, dots: 70 }, // px at avatar scale; found at the mask edge on that row
    relief: 0.22     // shading relief on skin, fraction of head depth
  };

  function createDotAvatar(canvas, img) {
    const ctx = canvas.getContext('2d');
    let pts = [];
    let ready = false;
    let morph = 0;   // 0 sphere, 1 head (unused by default, kept for the Photo mode and future)
    let blob = 0;    // 0 sphere, 1 organic blob (speaking), eased
    let blobT = 0;   // linear progress behind it
    let cube = 0;    // 0 sphere, 1 soft cube (thinking), eased
    let cubeT = 0;   // linear progress behind it
    let voice = 0;   // slow envelope of the audio level, for the blob
    let rgb = [255, 255, 255];
    let rgbAt = -1e9;
    let sampledLight = null; // theme the current point set was built for
    let imageData = null;
    let head = null;         // { mask, depth, cx, cy, scale, maxDepth } from the photo
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = DOT.size * dpr;
    canvas.height = DOT.size * dpr;

    /* ─── Pointer: drag to rotate, hover to attract ─────────
       User rotation is added on top of the idle turn. Releasing a drag keeps
       its momentum and lets it decay. The pointer position (in canvas px)
       pulls nearby dots toward it like a magnet; -1 means no pointer. */
    const user = { rx: 0, ry: 0, vx: 0, vy: 0, dragging: false, lastX: 0, lastY: 0, lastT: 0 };
    let ptrX = -1, ptrY = -1;
    let pull = 0; // eased 0..1 presence of the pointer, so the magnet fades in and out
    const toLocal = e => {
      const b = canvas.getBoundingClientRect();
      return [(e.clientX - b.left) * DOT.size / b.width, (e.clientY - b.top) * DOT.size / b.height];
    };
    canvas.addEventListener('pointerdown', e => {
      user.dragging = true; user.vx = 0; user.vy = 0;
      [user.lastX, user.lastY] = toLocal(e); user.lastT = performance.now();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic event */ }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      const [x, y] = toLocal(e);
      ptrX = x; ptrY = y;
      if (!user.dragging) return;
      const now = performance.now(), dt = Math.max(1, now - user.lastT);
      const dx = x - user.lastX, dy = y - user.lastY;
      user.ry += dx * 0.012; user.rx += dy * 0.012;
      user.vy = dx * 0.012 / dt * 16; user.vx = dy * 0.012 / dt * 16; // per frame at 60 fps
      user.lastX = x; user.lastY = y; user.lastT = now;
    });
    const release = () => { user.dragging = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => { ptrX = -1; ptrY = -1; release(); });

    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    /* Head mask and inflation. Runs once per image. */
    function buildHead() {
      const g = DOT.grid;
      const off = document.createElement('canvas');
      off.width = g; off.height = g;
      const o = off.getContext('2d');
      o.drawImage(img, 0, 0, g, g);
      imageData = o.getImageData(0, 0, g, g).data;
      const data = imageData;

      // 1. classify pixels: warm skin or dark hair count as head, cool sky and bridge do not
      const mask = new Uint8Array(g * g);
      for (let y = 0; y < g; y++) {
        for (let x = 0; x < g; x++) {
          const i = (y * g + x) * 4;
          const R = data[i], G = data[i + 1], B = data[i + 2];
          const lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
          const warm = R - B > 12;
          const dark = lum < 0.3;
          const cool = B > R + 4 || (lum > 0.72 && !warm);
          const isHead = (warm || (dark && y / g < DOT.collar)) && !(cool && !dark);
          mask[y * g + x] = isHead ? 1 : 0;
        }
      }
      // 2. keep only the blob under the centre, and fill holes in it
      const keep = floodFill(mask, g, Math.round(g / 2), Math.round(g / 2), 1);
      const outside = floodFill(keep, g, 0, 0, 0, true);
      for (let i = 0; i < g * g; i++) keep[i] = outside[i] ? 0 : 1;
      // 3. distance to the outline, then inflate like a balloon
      const dist = distanceTransform(keep, g);
      let maxD = 0, minY = g, maxY = 0, minX = g, maxX = 0;
      for (let y = 0; y < g; y++) {
        for (let x = 0; x < g; x++) {
          if (!keep[y * g + x]) continue;
          if (dist[y * g + x] > maxD) maxD = dist[y * g + x];
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
        }
      }
      const depth = new Float32Array(g * g);
      for (let i = 0; i < g * g; i++) {
        if (!keep[i]) continue;
        const d = dist[i] / maxD;                    // 0 at the edge, 1 at the core
        depth[i] = Math.sqrt(d * (2 - d));           // round cross-section
      }
      // 4. shading relief on the skin: brighter pixels sit closer to the light, so forward
      const relief = new Float32Array(g * g);
      for (let y = 1; y < g - 1; y++) {
        for (let x = 1; x < g - 1; x++) {
          const i = y * g + x;
          if (!keep[i]) continue;
          const j = i * 4;
          if (data[j] - data[j + 2] <= 12) continue; // hair and shadow, not skin
          let acc = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const k = ((y + dy) * g + (x + dx)) * 4;
            acc += 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
          }
          const lum = acc / 9 / 255;
          relief[i] = Math.max(-0.12, Math.min(0.12, (lum - 0.55) * DOT.relief));
        }
      }
      // 5. ear positions: the outermost mask cells on the ear row
      const earRow = Math.round(DOT.ears.y * g);
      let earL = -1, earR = -1;
      for (let x = 0; x < g; x++) if (keep[earRow * g + x]) { if (earL < 0) earL = x; earR = x; }
      const scale = DOT.headHeight / Math.max(1, maxY - minY + 1); // grid cell -> css px
      head = {
        mask: keep, depth, relief, scale,
        cx: (minX + maxX + 1) / 2, cy: (minY + maxY + 1) / 2,
        maxDepth: ((maxX - minX + 1) / 2) * scale * DOT.headDepth,
        ears: earL >= 0 ? [earL + 0.5, earR + 0.5] : []
      };
    }

    /* Sculpted features on top of the inflated silhouette, in units of head depth.
       u, v are fractions of the crop. */
    function features(u, v) {
      const N = DOT.nose, E = DOT.eyes, C = DOT.chin;
      let z = 0;
      // nose: a ridge rising from the bridge to the tip, dropping under the nostrils
      let prof = 0;
      if (v >= N.top && v <= N.tip) prof = (v - N.top) / (N.tip - N.top);
      else if (v > N.tip && v <= N.end) prof = 1 - (v - N.tip) / (N.end - N.tip);
      if (prof > 0) {
        const du = (u - N.x) / (N.sigma * (0.6 + 0.4 * prof)); // widens toward the tip
        z += N.amp * prof * Math.exp(-du * du);
      }
      // eye sockets recess
      for (const ex of E.xs) {
        const du = (u - ex) / E.sigma, dv = (v - E.y) / (E.sigma * 0.8);
        z += E.amp * Math.exp(-(du * du + dv * dv));
      }
      // chin comes forward a little
      const cu = (u - C.x) / C.sx, cv = (v - C.y) / C.sy;
      z += C.amp * Math.exp(-(cu * cu + cv * cv));
      return z;
    }

    function floodFill(src, g, sx, sy, value, invert) {
      const out = new Uint8Array(g * g);
      const stack = [sy * g + sx];
      const hit = i => (invert ? !src[i] : src[i] === value);
      if (!hit(stack[0])) return out;
      out[stack[0]] = 1;
      while (stack.length) {
        const i = stack.pop();
        const x = i % g, y = (i - x) / g;
        const nb = [x > 0 ? i - 1 : -1, x < g - 1 ? i + 1 : -1, y > 0 ? i - g : -1, y < g - 1 ? i + g : -1];
        for (const j of nb) if (j >= 0 && !out[j] && hit(j)) { out[j] = 1; stack.push(j); }
      }
      return out;
    }

    function distanceTransform(mask, g) {
      // two-pass chamfer (3-4), good enough for inflation
      const INF = 1e6;
      const d = new Float32Array(g * g);
      for (let i = 0; i < g * g; i++) d[i] = mask[i] ? INF : 0;
      for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
        const i = y * g + x;
        if (!d[i]) continue;
        if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 3);
        if (y > 0) { d[i] = Math.min(d[i], d[i - g] + 3);
          if (x > 0) d[i] = Math.min(d[i], d[i - g - 1] + 4);
          if (x < g - 1) d[i] = Math.min(d[i], d[i - g + 1] + 4); }
      }
      for (let y = g - 1; y >= 0; y--) for (let x = g - 1; x >= 0; x--) {
        const i = y * g + x;
        if (!d[i]) continue;
        if (x < g - 1) d[i] = Math.min(d[i], d[i + 1] + 3);
        if (y < g - 1) { d[i] = Math.min(d[i], d[i + g] + 3);
          if (x < g - 1) d[i] = Math.min(d[i], d[i + g + 1] + 4);
          if (x > 0) d[i] = Math.min(d[i], d[i + g - 1] + 4); }
      }
      for (let i = 0; i < g * g; i++) d[i] /= 3;
      return d;
    }

    /* Dots are the ink. On a dark theme the ink is light, so dots go where
       the photo is bright; on a light theme where it is dark. A small
       baseline everywhere on the head keeps the silhouette (hair, on dark)
       visible even where the tone gives nothing. */
    function sample(lightInk) {
      if (!head) buildHead();
      const g = DOT.grid, data = imageData, H = head, M = DOT.mouth;
      const cells = [];
      let sum = 0;
      for (let y = 0; y < g; y++) {
        for (let x = 0; x < g; x++) {
          const i = y * g + x;
          if (!H.mask[i]) continue;
          const j = i * 4;
          const lum = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255;
          const tone = lightInk ? lum : 1 - lum;
          const w = Math.pow(clamp((tone - 0.15) / 0.85), 1.3) * 0.88 + 0.12;
          cells.push({ x, y, tone, w, depth: H.depth[i] });
          sum += w;
        }
      }
      const k = DOT.faceDots / sum;
      const out = [];
      const toHead = (gx, gy, dep, sign) => ({
        hx: (gx - H.cx) * H.scale,
        hy: (gy - H.cy) * H.scale,
        hz: sign * dep * H.maxDepth
      });
      for (const c of cells) {
        if (Math.random() > c.w * k) continue;
        const gx = c.x + 0.5 + (Math.random() - 0.5) * 0.9;
        const gy = c.y + 0.5 + (Math.random() - 0.5) * 0.9;
        const zExtra = features(gx / g, gy / g) + H.relief[c.y * g + c.x];
        const pos = toHead(gx, gy, c.depth + zExtra, 1);
        // mouth test in flat crop pixels
        const px = gx / g * DOT.size, py = gy / g * DOT.size;
        const mx = (px - M.x) / M.rx, my = (py - M.y) / M.ry;
        const inMouth = mx * mx + my * my <= 1;
        out.push({ ...pos, d: c.tone, r: 0.45 + c.tone * 0.95, stagger: Math.random(),
                   mouth: inMouth ? (py > M.y ? 2 : 1) : 0, back: false });
      }
      // ears: a loop of dots on each side, standing out from the head in the y/z plane
      const earY = DOT.ears.y * g;
      for (const ex of H.ears) {
        const side = ex < H.cx ? -1 : 1;
        for (let n = 0; n < DOT.ears.dots; n++) {
          const th = Math.random() * 6.2832;
          const rr = 0.55 + Math.random() * 0.45; // mostly rim, some fill
          const base = toHead(ex + side * 0.6, earY, 0, 1);
          out.push({ hx: base.hx + side * (Math.random() * 3), hy: base.hy + Math.sin(th) * DOT.ears.ry * rr,
                     hz: 4 + Math.cos(th) * DOT.ears.rz * rr, d: 0.6, r: 0.75,
                     stagger: Math.random(), mouth: 0, back: false });
        }
      }
      // sparse back of the head: the same silhouette, inflated the other way
      for (let n = 0; n < DOT.backDots; n++) {
        const c = cells[(Math.random() * cells.length) | 0];
        const pos = toHead(c.x + Math.random(), c.y + Math.random(), c.depth * 0.95, -1);
        out.push({ ...pos, d: 0.55, r: 0.65, stagger: Math.random(), mouth: 0, back: true });
      }
      // sphere seats on a fibonacci lattice, shuffled so head neighbours scatter;
      // only the first sphereDots are visible at rest, the rest fade in with the head
      const n = out.length, R = DOT.sphereRadius, phi = Math.PI * (3 - Math.sqrt(5));
      const order = out.map((_, i) => i).sort(() => Math.random() - 0.5);
      const every = Math.max(1, Math.round(n / DOT.sphereDots));
      // nudge each seat by a fraction of a dot spacing: the lattice's spiral arms stay
      // readable but lose their machine-perfect regularity
      const jitter = 0.32 * Math.sqrt(4 * Math.PI * R * R / DOT.sphereDots);
      order.forEach((idx, i) => {
        const p = out[idx];
        const yy = 1 - (i / Math.max(1, n - 1)) * 2;
        const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
        const th = phi * i;
        let x = Math.cos(th) * rad * R + (Math.random() - 0.5) * jitter;
        let y = yy * R + (Math.random() - 0.5) * jitter;
        let z = Math.sin(th) * rad * R + (Math.random() - 0.5) * jitter;
        const len = Math.hypot(x, y, z) || 1;
        p.sx = x / len * R; p.sy = y / len * R; p.sz = z / len * R;
        p.core = (i % every) === 0;
      });
      pts = out;
      sampledLight = lightInk;
      ready = true;
    }

    function readColor(now) {
      if (now - rgbAt < 500) return;
      rgbAt = now;
      const m = getComputedStyle(canvas).color.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) rgb = m.slice(0, 3).map(Number);
      const lightInk = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) > 128;
      if (lightInk !== sampledLight && img.complete && img.naturalWidth) sample(lightInk);
    }

    function render(now, st, lvl) {
      readColor(now);
      if (!ready) return;
      const size = DOT.size, c = size / 2;
      const speaking = st === 'speaking';
      const thinking = st === 'thinking';
      // soft cube while thinking, organic blob while speaking; the head stays parked
      morph += (0 - morph) * 0.05;
      if (morph < 0.002) morph = 0;
      // linear ramp (about 1.5 s in, 1.2 s out), eased below so it starts and ends softly
      cubeT = clamp(cubeT + (thinking ? 1 / 90 : -1 / 70));
      cube = ease(cubeT);
      // about 1 s in, 1.2 s out, eased so the ball grows lobes rather than snapping into them
      blobT = clamp(blobT + (speaking ? 1 / 60 : -1 / 70));
      blob = ease(blobT);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const t = now / 1000;
      // sphere: steady turn. As the cube forms the axis tilts and the turn slows a touch,
      // so the cube spins on a leaning axis with its corners rising and falling, no tumble.
      // user rotation: momentum decays after a drag; a slow spring eases the tilt back
      if (!user.dragging) {
        user.ry += user.vy; user.rx += user.vx;
        user.vy *= 0.94; user.vx *= 0.94;
        user.rx *= 0.985;
        if (Math.abs(user.vy) < 1e-4) user.vy = 0;
        if (Math.abs(user.vx) < 1e-4) user.vx = 0;
      }
      user.rx = Math.max(-1.2, Math.min(1.2, user.rx));
      const rotY = t * (0.26 - cube * 0.08) + user.ry;
      const rotX = Math.sin(t * 0.2) * 0.25 * (1 - cube) + cube * 0.62 + user.rx;
      // magnet presence eases in and out
      pull += ((ptrX >= 0 ? 1 : 0) - pull) * 0.12;
      const magnetR = DOT.size * 0.22, magnetR2 = magnetR * magnetR;
      const breath = 1 + cube * Math.sin(t * 1.4) * 0.05;
      // superellipsoid: pull each unit direction toward the cube surface
      const sq = cube * DOT.cubeness;
      const cy1 = Math.cos(rotY), sy1 = Math.sin(rotY), cx1 = Math.cos(rotX), sx1 = Math.sin(rotX);
      // two layers: a fast swell that tracks the voice, and a slower envelope for the shape
      voice += (lvl - voice) * (lvl > voice ? 0.35 : 0.1);
      const sScale = (1 + Math.sin(t * 0.2 * 6.2832) * 0.01) * (1 + blob * lvl * 0.12) * breath;
      // blob: base shape at a quiet floor, lobes grow with the voice
      const amp = blob * DOT.blobAmp * (0.35 + 0.65 * voice);
      const invR = 1 / DOT.sphereRadius;
      // head: turns side to side so the face stays in view, with a small nod
      const yaw = Math.sin(t * 0.45) * 0.55 + user.ry, pitch = Math.sin(t * 0.35) * 0.06 + user.rx * 0.6;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cpt = Math.cos(pitch), spt = Math.sin(pitch);
      const ink = `${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0}`;
      const maxDepth = head ? head.maxDepth : 60;

      for (const p of pts) {
        // sphere seat, pushed along its normal by the noise field, then rotated and projected
        let bx = p.sx, by = p.sy, bz = p.sz;
        if (sq > 0) {
          // on a sphere the radius is 1; on a cube it is 1 / max(|x|,|y|,|z|). Blend the two.
          const ax = Math.abs(bx), ay = Math.abs(by), az = Math.abs(bz);
          const mx = Math.max(ax, ay, az) * invR;
          const rc = 1 / Math.max(mx, 1e-4);
          const f = 1 + (rc - 1) * sq * 0.86; // 0.86 keeps the corners soft
          bx *= f; by *= f; bz *= f;
        }
        if (amp > 0) {
          const ux = bx * invR, uy = by * invR, uz = bz * invR;
          const n = (Math.sin(ux * 1.6 + t * 0.7) * Math.cos(uy * 1.4 - t * 0.55)
                   + 0.7 * Math.sin(uz * 2.2 + uy * 1.1 - t * 0.9)
                   + 0.35 * Math.sin((ux + uy + uz) * 3.1 + t * 1.3)) * 0.49;
          const f = 1 + amp * n;
          bx *= f; by *= f; bz *= f;
        }
        const sx2 = bx * cy1 - bz * sy1;
        const szr = bx * sy1 + bz * cy1;
        const sy2 = by * cx1 - szr * sx1;
        const sz2 = by * sx1 + szr * cx1;
        const sp = 300 / (300 - sz2);
        const ox = c + sx2 * sp * sScale, oy = c + sy2 * sp * sScale;
        const sdepth = (sz2 / DOT.sphereRadius + 1) / 2;

        // head seat: mouth opens in head space, then the head turns and projects
        let hx = p.hx, hy = p.hy, hz = p.hz;
        if (speaking && p.mouth) hy += p.mouth === 2 ? lvl * 14 : -lvl * 3;
        const hx2 = hx * cyw + hz * syw;
        const hzy = -hx * syw + hz * cyw;
        const hy2 = hy * cpt - hzy * spt;
        const hz2 = hy * spt + hzy * cpt;
        const hp = 340 / (340 - hz2);
        const fx = c + hx2 * hp, fy = c + hy2 * hp;
        const hdepth = clamp((hz2 / maxDepth + 1) / 2);

        const m = ease(clamp(morph * 1.35 - p.stagger * 0.35));
        let X = ox + (fx - ox) * m, Y = oy + (fy - oy) * m;
        // magnet: dots within reach ease toward the pointer, strongest near it
        if (pull > 0.01) {
          const ddx = ptrX - X, ddy = ptrY - Y, d2 = ddx * ddx + ddy * ddy;
          if (d2 < magnetR2) {
            const k = (1 - d2 / magnetR2);
            const g = k * k * 0.45 * pull;
            X += ddx * g; Y += ddy * g;
          }
        }
        const r = (0.35 + sdepth * 0.95) * (1 - m) + (p.r * (0.6 + hdepth * 0.6)) * m;
        // sphere: core dots, plus the rest fading in as the blob forms; head: everything
        const aSphere = p.core ? (0.18 + sdepth * 0.82) * (1 - cube * 0.25) : 0;
        if (aSphere === 0 && m === 0) continue;
        const aHead = (p.back ? 0.5 : 0.5 + p.d * 0.5) * (0.12 + hdepth * 0.88);
        const a = aSphere * (1 - m) + aHead * m;
        if (a < 0.02) continue;

        ctx.globalAlpha = a;
        ctx.fillStyle = `rgb(${ink})`;
        ctx.beginPath();
        ctx.arc(X, Y, r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    return { render };
  }

  /* ─── UI helpers ─────────────────────────────────────── */
  const STATUS = {
    idle: 'Start a conversation. Your mic is only used while it is on.',
    connecting: 'Connecting…',
    listening: 'Listening. Go ahead.',
    thinking: 'Thinking…',
    speaking: 'Wei is speaking.'
  };

  function setState(next) {
    state = next;
    el.panel.dataset.state = next;
    el.status.textContent = mode === 'demo' && next === 'listening'
      ? 'Your turn. Type a question below.'
      : STATUS[next];
    const active = next !== 'idle';
    el.startBtn.hidden = active;
    el.endBtn.hidden = !active;
    el.muteBtn.hidden = !(active && mode === 'live');
    el.composer.hidden = !active;
  }

  function addLine(who, text) {
    const div = document.createElement('div');
    div.className = `talk-line ${who}`;
    div.textContent = text;
    el.transcript.appendChild(div);
    el.transcript.scrollTop = el.transcript.scrollHeight;
    return div;
  }

  function lastLine(who) {
    const lines = el.transcript.querySelectorAll(`.talk-line.${who}`);
    return lines.length ? lines[lines.length - 1].textContent : '';
  }

  /* Strip markup and links so the voice reads plain sentences. */
  function toSpeech(text) {
    return String(text)
      .replace(/<[^>]+>/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_`#]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ─── Session control ────────────────────────────────── */
  async function start() {
    if (state !== 'idle') return;
    mode = null;
    setState('connecting');

    let creds = null;
    try {
      const r = await fetch(SESSION_URL, { cache: 'no-store' });
      if (r.ok) creds = await r.json();
    } catch (_) { /* no session endpoint: demo mode */ }

    if (creds && (creds.signedUrl || creds.agentId)) {
      const ok = await startLive(creds);
      if (ok) return;
    }
    startDemo();
  }

  async function startLive(creds) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { Conversation } = await import(SDK_URL);
      conversation = await Conversation.startSession({
        ...(creds.signedUrl ? { signedUrl: creds.signedUrl } : { agentId: creds.agentId }),
        onModeChange: ({ mode: m }) => setState(m === 'speaking' ? 'speaking' : 'listening'),
        onMessage: ({ message, source }) => {
          if (!message) return;
          if (source === 'user') {
            if (lastLine('you') !== message) addLine('you', message);
          } else {
            addLine('wei', message);
          }
        },
        onStatusChange: ({ status }) => {
          if (status === 'disconnected' && state !== 'idle') end('Call ended.');
        },
        onError: err => {
          console.error('Talk to Wei: agent error', err);
          end('Something went wrong with the call.');
        }
      });
      mode = 'live';
      setState('listening');
      return true;
    } catch (err) {
      console.warn('Talk to Wei: live session unavailable, using demo', err);
      conversation = null;
      const micBlocked = err && (err.name === 'NotAllowedError' || err.name === 'NotFoundError');
      addLine('note', micBlocked
        ? 'Microphone blocked. Allow mic access in your browser to talk out loud, or type below.'
        : 'Voice call unavailable right now, showing the demo instead.');
      return false;
    }
  }

  function startDemo() {
    mode = 'demo';
    history = [];
    addLine('note', 'Demo mode: browser voice, typed questions.');
    say(DEMO_GREETING);
    setTimeout(() => el.input.focus(), 50);
  }

  function end(note) {
    if (conversation) {
      try { conversation.endSession(); } catch (_) { /* already closed */ }
      conversation = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    clearInterval(syllableTimer);
    level = 0;
    setMouth(0);
    if (note && state !== 'idle') addLine('note', note);
    mode = null;
    muted = false;
    el.muteBtn.classList.remove('is-muted');
    el.muteBtn.textContent = 'Mute';
    setState('idle');
  }

  function toggleMute() {
    if (!conversation) return;
    muted = !muted;
    try { conversation.setMicMuted(muted); } catch (_) { /* older sdk */ }
    el.muteBtn.classList.toggle('is-muted', muted);
    el.muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  }

  /* ─── Typed questions ────────────────────────────────── */
  async function ask(text) {
    addLine('you', text);
    if (mode === 'live' && conversation) {
      try { conversation.sendUserMessage(text); } catch (err) { console.warn(err); }
      return;
    }
    if (mode !== 'demo') return;
    history.push({ role: 'user', content: text });
    history = history.slice(-MAX_HISTORY);
    setState('thinking');
    let reply = '';
    try {
      const r = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, page: PAGE_KEY })
      });
      if (r.ok) {
        const data = await r.json();
        reply = typeof data.text === 'string' ? data.text.trim() : '';
      }
    } catch (_) { /* fall through */ }
    if (mode !== 'demo') return; // ended while waiting
    if (!reply) reply = OFFLINE_ANSWER;
    history.push({ role: 'assistant', content: reply });
    say(toSpeech(reply));
  }

  /* ─── Demo speech (browser voice + synthetic mouth energy) ── */
  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    const en = voices.filter(v => /^en/i.test(v.lang));
    return en.find(v => /Google US|Samantha|Daniel|Alex/i.test(v.name)) || en[0] || voices[0] || null;
  }

  function say(text) {
    addLine('wei', text);
    setState('speaking');
    clearInterval(syllableTimer);
    // Syllable-ish energy so the mouth moves even when boundary events never fire
    syllableTimer = setInterval(() => {
      if (state !== 'speaking') return;
      pulse = Math.random() < 0.18 ? 0.05 : 0.45 + Math.random() * 0.55;
    }, 130);

    const done = () => {
      clearInterval(syllableTimer);
      pulse = 0;
      if (mode === 'demo') setState('listening');
    };

    if (!('speechSynthesis' in window)) {
      setTimeout(done, Math.max(1500, text.split(/\s+/).length * 330));
      return;
    }
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    utter.rate = 1.02;
    utter.pitch = 0.95;
    utter.onboundary = e => { if (e.name === 'word') pulse = 0.6 + Math.random() * 0.4; };
    utter.onend = done;
    utter.onerror = done;
    speechSynthesis.speak(utter);
  }

  /* ─── Public API ─────────────────────────────────────── */
  function open() {
    if (!el) build();
    lastFocus = document.activeElement;
    el.transcript.innerHTML = '';
    el.overlay.classList.add('open');
    setState('idle');
    startLoop();
    setTimeout(() => el.startBtn.focus(), 60);
  }

  function close() {
    if (!el) return;
    end();
    stopLoop();
    el.overlay.classList.remove('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

  window.TalkToWei = { open, close };
  // Local-only hook so the avatar states can be previewed without a call
  if (location.hostname === 'localhost') {
    window.TalkToWei._setState = s => { if (el) setState(s); };
    window.TalkToWei._setLevel = v => { pulse = v; };
  }
})();
