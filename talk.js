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
    let saved = 'photo';
    try { saved = localStorage.getItem(AVATAR_KEY) || 'photo'; } catch (_) { /* storage blocked */ }
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

  /* ─── Dot avatar: the photo as a point cloud ─────────────
     Dots sit where the photo is dark (a stipple portrait). While the agent
     connects or thinks they leave the face for a slowly turning sphere and
     come back when it speaks or listens. Speaking moves the dots around the
     mouth and tints them orange with the audio level. */
  const DOT = {
    size: 220,      // css px of .talk-avatar; the canvas scales with CSS below that
    grid: 84,       // sampling cells per side
    target: 1700,   // dots wanted
    orbRadius: 72,
    mouth: { x: 102, y: 144, rx: 24, ry: 14 } // css px, matches --mouth-* in talk.css
  };

  function createDotAvatar(canvas, img) {
    const ctx = canvas.getContext('2d');
    let pts = [];
    let ready = false;
    let morph = 0;   // 0 face, 1 orb
    let rgb = [255, 255, 255];
    let rgbAt = -1e9;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = DOT.size * dpr;
    canvas.height = DOT.size * dpr;

    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    /* Like a halftone print: dots are the ink. On a dark theme the ink is
       light, so dots go where the photo is bright (lit skin); on a light
       theme they go where it is dark. Density and size both follow tone. */
    let sampledLight = null; // theme the current point set was built for
    let imageData = null;

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
      const cells = [];
      let sum = 0;
      for (let y = 0; y < g; y++) {
        for (let x = 0; x < g; x++) {
          const cx = (x + 0.5) / g - 0.5, cy = (y + 0.5) / g - 0.5;
          const rr = Math.sqrt(cx * cx + cy * cy);
          if (rr > 0.5) continue;
          const i = (y * g + x) * 4;
          const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          const tone = lightInk ? lum : 1 - lum; // how much ink this cell wants
          // keep the picture on the head: fade the rim and anything outside the head ellipse (sky, bridge)
          const rim = clamp((rr - 0.34) / 0.16);
          const ex = (cx - 0.0) / 0.30, ey = (cy + 0.04) / 0.40;
          const outside = clamp((Math.sqrt(ex * ex + ey * ey) - 1) / 0.25);
          const w = Math.pow(clamp((tone - 0.18) / 0.82), 1.35) * (1 - rim * 0.92) * (1 - outside * 0.8);
          if (w <= 0.01) continue;
          cells.push({ x, y, tone, w });
          sum += w;
        }
      }
      const k = DOT.target / sum;
      const cell = DOT.size / g;
      const out = [];
      for (const c of cells) {
        if (Math.random() > c.w * k) continue;
        const hx = (c.x + 0.5 + (Math.random() - 0.5) * 0.9) * cell;
        const hy = (c.y + 0.5 + (Math.random() - 0.5) * 0.9) * cell;
        const m = DOT.mouth;
        const mx = (hx - m.x) / m.rx, my = (hy - m.y) / m.ry;
        const inMouth = mx * mx + my * my <= 1;
        out.push({ hx, hy, d: c.tone, r: 0.6 + c.tone * 1.7, stagger: Math.random(),
                   mouth: inMouth ? (hy > m.y ? 2 : 1) : 0, sx: 0, sy: 0, sz: 0 });
      }
      // Sphere seats on a fibonacci lattice, shuffled so face neighbours scatter
      const n = out.length, R = DOT.orbRadius, phi = Math.PI * (3 - Math.sqrt(5));
      const seats = out.map((_, i) => i).sort(() => Math.random() - 0.5);
      out.forEach((p, idx) => {
        const i = seats[idx];
        const yy = 1 - (i / Math.max(1, n - 1)) * 2;
        const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
        const th = phi * i;
        p.sx = Math.cos(th) * rad * R;
        p.sy = yy * R;
        p.sz = Math.sin(th) * rad * R;
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
      const want = (st === 'thinking' || st === 'connecting') ? 1 : 0;
      morph += (want - morph) * 0.045;
      if (Math.abs(want - morph) < 0.002) morph = want;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const t = now / 1000;
      const rotY = t * 0.5, rotX = Math.sin(t * 0.3) * 0.35;
      const cy1 = Math.cos(rotY), sy1 = Math.sin(rotY), cx1 = Math.cos(rotX), sx1 = Math.sin(rotX);
      const breathe = st === 'listening' ? 1 + Math.sin(t * 1.6) * 0.008 : 1;
      const speaking = st === 'speaking';
      const [cr, cg, cb] = rgb;

      for (const p of pts) {
        // sphere seat, rotated and projected
        const x2 = p.sx * cy1 - p.sz * sy1;
        const zr = p.sx * sy1 + p.sz * cy1;
        const y2 = p.sy * cx1 - zr * sx1;
        const z2 = p.sy * sx1 + zr * cx1;
        const persp = 300 / (300 - z2);
        const ox = c + x2 * persp, oy = c + y2 * persp;
        const depth = (z2 / DOT.orbRadius + 1) / 2;

        // face seat, with the mouth opening on speech
        let fx = c + (p.hx - c) * breathe, fy = c + (p.hy - c) * breathe;
        let tint = 0;
        if (speaking) {
          if (p.mouth) { fy += p.mouth === 2 ? lvl * 16 : -lvl * 3; tint = lvl; }
          else { fx += (Math.random() - 0.5) * lvl * 1.2; fy += (Math.random() - 0.5) * lvl * 1.2; }
        }

        const m = ease(clamp(morph * 1.35 - p.stagger * 0.35));
        const X = fx + (ox - fx) * m, Y = fy + (oy - fy) * m;
        const r = p.r * (1 - m) + (0.55 + depth * 1.1) * m;
        const a = (0.55 + p.d * 0.45) * (1 - m) + (0.2 + depth * 0.8) * m;

        ctx.globalAlpha = a;
        ctx.fillStyle = tint > 0
          ? `rgb(${cr + (255 - cr) * tint | 0},${cg + (122 - cg) * tint | 0},${cb + (26 - cb) * tint | 0})`
          : `rgb(${cr},${cg},${cb})`;
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
