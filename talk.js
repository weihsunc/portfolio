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
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
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
     sphere turns slowly. While the agent thinks the sphere pulses. While
     it speaks the dots morph into Wei's head: the face is wrapped onto an
     ellipsoid with a sparse back, so it reads as a solid head as it
     rotates, and the mouth region opens with the audio level. */
  const DOT = {
    size: 220,       // css px of .talk-avatar; the canvas scales with CSS below that
    grid: 88,        // sampling cells per side
    faceDots: 1500,  // dots on the face
    backDots: 520,   // sparse dots on the back of the head
    sphereDots: 620, // dots visible on the resting sphere (the rest fade in as the head forms)
    sphereRadius: 72,
    head: { rx: 82, ry: 98, rz: 84 }, // ellipsoid radii
    // where the face sits in the crop (as a fraction of the avatar box)
    face: { cx: 0.5, cy: 0.5, rx: 0.32, ry: 0.42 },
    mouth: { x: 102, y: 144, rx: 22, ry: 13 } // css px, matches --mouth-* in talk.css
  };

  function createDotAvatar(canvas, img) {
    const ctx = canvas.getContext('2d');
    let pts = [];
    let ready = false;
    let morph = 0;   // 0 sphere, 1 head
    let rgb = [255, 255, 255];
    let rgbAt = -1e9;
    let sampledLight = null; // theme the current point set was built for
    let imageData = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = DOT.size * dpr;
    canvas.height = DOT.size * dpr;

    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    /* Like a halftone print: dots are the ink. On a dark theme the ink is
       light, so dots go where the photo is bright (lit skin); on a light
       theme they go where it is dark. Density and size both follow tone. */
    function sample(lightInk) {
      const g = DOT.grid;
      if (!imageData) {
        const off = document.createElement('canvas');
        off.width = g; off.height = g;
        const o = off.getContext('2d');
        o.drawImage(img, 0, 0, g, g);
        imageData = o.getImageData(0, 0, g, g).data;
      }
      const data = imageData;
      const F = DOT.face;
      const cells = [];
      let sum = 0;
      for (let y = 0; y < g; y++) {
        for (let x = 0; x < g; x++) {
          const u = ((x + 0.5) / g - F.cx) / F.rx;  // -1..1 across the face
          const v = ((y + 0.5) / g - F.cy) / F.ry;  // -1..1 down the face
          const e = u * u + v * v;
          if (e > 1) continue;                      // only the head, nothing outside
          const i = (y * g + x) * 4;
          const R = data[i], G = data[i + 1], B = data[i + 2];
          const lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
          const tone = lightInk ? lum : 1 - lum;
          // sky and bridge are cool or neutral; skin is warm. Cool pixels are not the head.
          const warm = clamp((R - B - 6) / 24);
          const edge = 1 - clamp((e - 0.55) / 0.45); // fade out toward the ellipse boundary
          const w = Math.pow(clamp((tone - 0.15) / 0.85), 1.3) * edge * warm;
          if (w <= 0.01) continue;
          cells.push({ u, v, tone, w });
          sum += w;
        }
      }
      const k = DOT.faceDots / sum;
      const H = DOT.head, M = DOT.mouth;
      const out = [];
      const jitter = 0.9 / (g * F.rx);
      for (const c of cells) {
        if (Math.random() > c.w * k) continue;
        const u = c.u + (Math.random() - 0.5) * jitter;
        const v = c.v + (Math.random() - 0.5) * jitter * (F.rx / F.ry);
        // wrap the flat face onto the front of the ellipsoid
        const lon = u * 1.2, lat = v * 1.25;             // radians; the face spans the front
        const bump = 1 + (c.tone - 0.5) * 0.1;           // slight relief from tone
        const hx = H.rx * Math.cos(lat) * Math.sin(lon) * bump;
        const hy = H.ry * Math.sin(lat) * bump;
        const hz = H.rz * Math.cos(lat) * Math.cos(lon) * bump;
        // flat-image position, for the mouth test
        const px = (F.cx + u * F.rx) * DOT.size, py = (F.cy + v * F.ry) * DOT.size;
        const mx = (px - M.x) / M.rx, my = (py - M.y) / M.ry;
        const inMouth = mx * mx + my * my <= 1;
        out.push({ hx, hy, hz, d: c.tone, r: 0.45 + c.tone * 0.95, stagger: Math.random(),
                   mouth: inMouth ? (py > M.y ? 2 : 1) : 0, back: false });
      }
      // sparse back of the head: random points on the rear of the ellipsoid
      for (let i = 0; i < DOT.backDots; i++) {
        const lon = Math.PI / 2 + Math.random() * Math.PI;  // rear half
        const lat = Math.asin(Math.random() * 2 - 1) * 0.9;
        out.push({ hx: H.rx * Math.cos(lat) * Math.sin(lon), hy: H.ry * Math.sin(lat),
                   hz: H.rz * Math.cos(lat) * Math.cos(lon), d: 0.55, r: 0.65,
                   stagger: Math.random(), mouth: 0, back: true });
      }
      // sphere seats on a fibonacci lattice, shuffled so face neighbours scatter;
      // only the first sphereDots are visible at rest, the rest fade in with the head
      const n = out.length, R = DOT.sphereRadius, phi = Math.PI * (3 - Math.sqrt(5));
      const order = out.map((_, i) => i).sort(() => Math.random() - 0.5);
      order.forEach((idx, i) => {
        const p = out[idx];
        const yy = 1 - (i / Math.max(1, n - 1)) * 2;
        const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
        const th = phi * i;
        p.sx = Math.cos(th) * rad * R;
        p.sy = yy * R;
        p.sz = Math.sin(th) * rad * R;
        p.core = (i % Math.round(n / DOT.sphereDots)) === 0;
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
      morph += ((speaking ? 1 : 0) - morph) * 0.05;
      if (Math.abs((speaking ? 1 : 0) - morph) < 0.002) morph = speaking ? 1 : 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const t = now / 1000;
      // sphere: steady turn, pulsing while thinking
      const rotY = t * 0.4, rotX = Math.sin(t * 0.3) * 0.3;
      const cy1 = Math.cos(rotY), sy1 = Math.sin(rotY), cx1 = Math.cos(rotX), sx1 = Math.sin(rotX);
      const pulseAmt = st === 'thinking' ? 0.05 : 0.01;
      const pulseHz = st === 'thinking' ? 1.1 : 0.2;
      const sScale = 1 + Math.sin(t * pulseHz * 6.2832) * pulseAmt;
      // head: turns side to side so the face stays in view, with a small nod
      const yaw = Math.sin(t * 0.6) * 0.6, pitch = Math.sin(t * 0.45) * 0.07;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cpt = Math.cos(pitch), spt = Math.sin(pitch);
      const ink = `${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0}`;

      for (const p of pts) {
        // sphere seat, rotated and projected
        const sx2 = p.sx * cy1 - p.sz * sy1;
        const szr = p.sx * sy1 + p.sz * cy1;
        const sy2 = p.sy * cx1 - szr * sx1;
        const sz2 = p.sy * sx1 + szr * cx1;
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
        const hp = 320 / (320 - hz2);
        const fx = c + hx2 * hp, fy = c + hy2 * hp;
        const hdepth = clamp((hz2 / DOT.head.rz + 1) / 2);

        const m = ease(clamp(morph * 1.35 - p.stagger * 0.35));
        const X = ox + (fx - ox) * m, Y = oy + (fy - oy) * m;
        const r = (0.35 + sdepth * 0.95) * (1 - m) + (p.r * (0.6 + hdepth * 0.6)) * m;
        // sphere: only core dots show; head: everything, shaded by depth
        const aSphere = p.core ? 0.18 + sdepth * 0.82 : 0;
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
