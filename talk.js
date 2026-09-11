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

  const clamp = v => Math.max(0, Math.min(1, v));

  /* ─── DOM ────────────────────────────────────────────── */
  function build() {
    const overlay = document.createElement('div');
    overlay.className = 'talk-overlay';
    overlay.innerHTML = `
      <div class="talk-panel" role="dialog" aria-modal="true" aria-label="Talk to Wei" data-state="idle">
        <div class="talk-top">
          <h3 class="talk-title">Talk to Wei</h3>
          <button class="talk-close" aria-label="Close">${CLOSE_SVG}</button>
        </div>
        <div class="talk-avatar-wrap">
          <div class="talk-avatar">
            <img src="images/avatar-face.jpg" alt="Wei" draggable="false" />
            ${MOUTH_SVG}
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
      lipLower: q('.talk-lip-lower')
    };

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

  function tick() {
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
    setMouth(level);
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; level = 0; setMouth(0); }

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
    startLoop();

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
    stopLoop();
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
    setTimeout(() => el.startBtn.focus(), 60);
  }

  function close() {
    if (!el) return;
    end();
    el.overlay.classList.remove('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

  window.TalkToWei = { open, close };
})();
