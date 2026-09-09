/* ═══════════════════════════════════════════════════════
   CHATBOT — Agent Wei portfolio assistant
   Default: Claude via /api/chat (system prompt lives server-side).
   Fallback: local keyword matching when the API is unavailable.
   Conversation persists in sessionStorage across page navigation.
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const STORAGE_KEY = 'weiChat.v1';
  const MAX_HISTORY = 20;
  const REQUEST_TIMEOUT_MS = 20000;

  /* ─── Fallback Knowledge Base ──────────────────────── */

  const SOCIAL_LINKS = {
    linkedin:  { url: 'https://www.linkedin.com/in/weihsunchen/' },
    instagram: { url: 'https://www.instagram.com/weiweistreet/' },
    email:     { url: 'mailto:weihsunc@gmail.com' },
    medium:    { url: 'https://medium.com/uxeastmeetswest' },
    facebook:  { url: 'https://www.facebook.com/UXeastmeetswest' },
    illoca:    { url: 'https://illoca.com' },
    lofi:      { url: 'https://studiolofi.com' }
  };

  const ext = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;

  const QA_PAIRS = [
    { keywords: ['who','about','yourself','introduce','background','bio'], answer: `Wei is a product designer with 10+ years of experience, based in Brooklyn, NY and originally from Taiwan. He experiments and ships with AI, and has designed for growth, data tooling, and mobile apps at Docusign, Meta, and Shure. Right now he's driving design at ${ext(SOCIAL_LINKS.illoca.url, 'Illoca')} and co-founding <a href="lofi.html">Lofi</a>.` },
    { keywords: ['now','currently','current','today','these days','doing','illoca','3d','agentic'], answer: `Right now Wei is driving design at ${ext(SOCIAL_LINKS.illoca.url, 'Illoca')}, focused on agentic 3D modeling workflows. On the side he's co-founding <a href="lofi.html">Lofi</a>, a brainstorming canvas for builders.` },
    { keywords: ['lofi','studio lofi','canvas','vibe','vibe coding','cofounder','co-founder','founder','startup'], answer: `<a href="lofi.html">Lofi</a> is the brainstorming canvas for vibe-coders: lay out the flow and figure out the structure before you prompt. Wei is co-founder and wrote about 70% of the code with AI. The alpha launched in July 2026 and ships updates weekly at ${ext(SOCIAL_LINKS.lofi.url, 'studiolofi.com')}.` },
    { keywords: ['ai','claude','llm','prompt','agent','ship','ships','build','builds','code','coding'], answer: `Wei designs, codes, and ships with AI. He built most of <a href="lofi.html">Lofi</a> with AI tooling, works on agentic 3D modeling at ${ext(SOCIAL_LINKS.illoca.url, 'Illoca')}, and even made this site with Figma and Claude.` },
    { keywords: ['experience','work','career','job','role','company','companies','worked','history'], answer: `Wei is currently at ${ext(SOCIAL_LINKS.illoca.url, 'Illoca')} and co-founding <a href="lofi.html">Lofi</a>. Before that he led growth design at <a href="plan-and-pricing.html">Docusign</a>, worked on data and AI tooling at <a href="metric-investigation.html">Meta</a>, and designed audio product experiences at <a href="shure-play.html">Shure</a>.` },
    { keywords: ['contact','email','reach','hire','connect','touch','message'], answer: `You can reach Wei at <a href="mailto:weihsunc@gmail.com">weihsunc@gmail.com</a>, connect on ${ext(SOCIAL_LINKS.linkedin.url, 'LinkedIn')}, or follow on ${ext(SOCIAL_LINKS.instagram.url, 'Instagram')}.` },
    { keywords: ['linkedin','social','profile','network'], answer: `Here's Wei's ${ext(SOCIAL_LINKS.linkedin.url, 'LinkedIn profile')} and ${ext(SOCIAL_LINKS.instagram.url, 'Instagram')}. Feel free to connect!` },
    { keywords: ['instagram','ig','insta'], answer: `Follow Wei on ${ext(SOCIAL_LINKS.instagram.url, 'Instagram (@weiweistreet)')} for photos and updates.` },
    { keywords: ['resume','cv','download'], answer: `You can view Wei's resume ${ext('https://drive.google.com/file/d/19ksAgx9szwyxqmvfr-EajPPbOLni0T4s/view?usp=sharing', 'here on Google Drive')}.` },
    { keywords: ['location','live','where','based','city'], answer: `Wei is based in Brooklyn, NY. Originally born and raised in Taiwan.` },
    { keywords: ['taiwan','taiwanese','origin','from','hometown','born'], answer: `Wei was born and raised in Taiwan and is now based in Brooklyn, NY.` },
    { keywords: ['hobby','hobbies','interest','free time','fun','outside','passion','like','likes'], answer: `Outside of design, Wei enjoys cooking, making espresso, playing guitar, and photography. He also helps run a design community called UX East Meets West.` },
    { keywords: ['cook','cooking','food','kitchen','favorite food','eat','noodle','noodles','ice cream','dessert','espresso','coffee'], answer: `Wei's favorite foods are ice cream and noodles! Cooking and making espresso are two of his favorite ways to unwind outside of design.` },
    { keywords: ['guitar','music','instrument'], answer: `Wei plays guitar in his free time. Music is a nice balance to design work.` },
    { keywords: ['photo','photos','photography','camera','shoot'], answer: `Wei is into photography. You can see some of his personal shots on the <a href="about.html">about page</a>.` },
    { keywords: ['community','ux east','east meets west','mentor','mentorship','meetup'], answer: `Wei co-runs ${ext(SOCIAL_LINKS.medium.url, 'UX East Meets West')}, one of the largest design communities for Taiwanese designers. They run mentorship programs and meetups. Follow on ${ext(SOCIAL_LINKS.facebook.url, 'Facebook')}.` },
    { keywords: ['skill','strength','good at','best','specialty','specialize','expertise'], answer: `Wei excels at navigating complex work and product thinking, turning ambiguous business problems into clear, measurable design solutions. Lately that includes building with AI end to end.` },
    { keywords: ['growth','plg','conversion','experiment','pricing'], answer: `Growth design is a core strength. Check out <a href="product-led-growth.html">Product-Led Growth Experiments</a> and <a href="plan-and-pricing.html">Plan and Pricing</a> from his time at Docusign.` },
    { keywords: ['complex','hardest','challenging','difficult','most complex','biggest'], answer: `Wei's most complex work includes <a href="data-lifecycle.html">Data Lifecycle</a> at Meta, a large-scale data/AI tooling project involving privacy compliance, and <a href="plan-and-pricing.html">Plan and Pricing</a> at Docusign, where he navigated intricate enterprise packaging and monetization logic.` },
    { keywords: ['docusign'], answer: `Wei led growth design at Docusign from 2024 to 2025. See <a href="plan-and-pricing.html">Plan and Pricing</a> and <a href="product-led-growth.html">Product-Led Growth Experiments</a>.` },
    { keywords: ['meta','facebook','data'], answer: `At Meta, Wei worked on enterprise data and AI tooling. See <a href="metric-investigation.html">Metric Investigation</a> and <a href="data-lifecycle.html">Data Lifecycle</a>.` },
    { keywords: ['shure','audio','hardware','headphone','headphones','microphone'], answer: `Wei designed multiple products at Shure: <a href="shure-play.html">ShurePlus Play</a>, <a href="shure-aonic.html">AONIC headphones</a>, and <a href="shure-channels.html">ShurePlus Channels</a>.` },
    { keywords: ['aivvy','iot','wearable','intern'], answer: `<a href="aivvy.html">Aivvy</a> was an early-career project: a hardware startup building smart headphones with built-in music streaming.` },
    { keywords: ['project','projects','portfolio','case study','case studies','all projects','show'], answer: `Here are Wei's featured projects: <a href="lofi.html">Lofi App</a> (Studio Lofi), <a href="plan-and-pricing.html">Plan and Pricing</a> (Docusign), <a href="metric-investigation.html">Metric Investigation</a> (Meta), <a href="shure-play.html">ShurePlus Play</a> (Shure), <a href="data-lifecycle.html">Data Lifecycle</a> (Meta), <a href="shure-aonic.html">Shure AONIC</a> (Shure), <a href="product-led-growth.html">PLG Experiments</a> (Docusign), <a href="shure-channels.html">ShurePlus Channels</a> (Shure), and <a href="aivvy.html">Aivvy Headphones</a> (Aivvy).` },
    { keywords: ['enterprise','b2b','saas','tool','tooling'], answer: `Enterprise design is a strong focus. See <a href="data-lifecycle.html">Data Lifecycle</a> at Meta and <a href="plan-and-pricing.html">Plan and Pricing</a> at Docusign.` },
    { keywords: ['mobile','app','ios','android'], answer: `Check out <a href="shure-play.html">ShurePlus Play</a>, a mobile audio app Wei designed for Shure, and <a href="lofi.html">Lofi</a>, the canvas app he's building now.` },
    { keywords: ['hello','hi','hey','sup','yo','greet'], answer: `Hey there! I'm Agent Wei, Wei's portfolio assistant. Ask me anything about Wei's work, experience, or how to get in touch.` },
    { keywords: ['thank','thanks','bye','goodbye','see you','later','cheers'], answer: `Thanks for stopping by! Reach out at <a href="mailto:weihsunc@gmail.com">weihsunc@gmail.com</a>, on ${ext(SOCIAL_LINKS.linkedin.url, 'LinkedIn')}, or follow on ${ext(SOCIAL_LINKS.instagram.url, 'Instagram')}.` }
  ];

  /* ─── Page-Aware Project Context ──────────────────── */

  // Keys are clean URL names. Works for both /lofi (Vercel cleanUrls)
  // and /lofi.html (local preview).
  const PROJECT_PAGES = {
    'lofi':                 { name: 'Lofi App', company: 'Studio Lofi', tags: ['lofi','ai','startup','canvas'] },
    'plan-and-pricing':     { name: 'Plan and Pricing', company: 'Docusign', tags: ['growth','pricing','enterprise'] },
    'metric-investigation': { name: 'Metric Investigation', company: 'Meta', tags: ['data','analytics','enterprise'] },
    'shure-play':           { name: 'ShurePlus Play', company: 'Shure', tags: ['mobile','audio','app'] },
    'data-lifecycle':       { name: 'Data Lifecycle', company: 'Meta', tags: ['data','enterprise','ai','privacy'] },
    'shure-aonic':          { name: 'Shure AONIC', company: 'Shure', tags: ['hardware','audio','headphone'] },
    'product-led-growth':   { name: 'Product-Led Growth Experiments', company: 'Docusign', tags: ['growth','conversion','experiment'] },
    'shure-channels':       { name: 'ShurePlus Channels', company: 'Shure', tags: ['audio','wireless','hardware'] },
    'aivvy':                { name: 'Aivvy Headphones', company: 'Aivvy', tags: ['hardware','startup','iot'] },
  };

  function currentPageKey() {
    const last = window.location.pathname.split('/').pop() || '';
    const key = last.toLowerCase().replace(/\.html$/, '');
    return key || 'index';
  }

  function getCurrentProject() {
    return PROJECT_PAGES[currentPageKey()] || null;
  }

  // All available follow-up suggestions. 2-3 are picked contextually after each response.
  const ALL_SUGGESTIONS = [
    { label: "What's Wei working on now", query: "What is Wei working on right now?", tags: ['intro','greeting','about','experience'] },
    { label: 'What is Lofi', query: 'What is Lofi?', tags: ['intro','greeting','project','ai','lofi'] },
    { label: 'How does Wei use AI', query: 'How does Wei design and ship with AI?', tags: ['intro','ai','skill','lofi'] },
    { label: "Wei's most complex project", query: "What's Wei's most complex project?", tags: ['project','skill'] },
    { label: "Wei's favorite food", query: "What's Wei's favorite food?", tags: ['greeting','hobby','about'] },
    { label: 'Resume', query: 'Can I see the resume?', tags: ['experience','hire'] },
    { label: 'About Wei', query: 'Tell me about Wei', tags: ['intro','hello'] },
    { label: 'See all projects', query: 'Show me all projects', tags: ['project','work','experience','company'] },
    { label: 'Contact Wei', query: 'How can I reach Wei?', tags: ['default'] },
    { label: 'UX East Meets West', query: 'Tell me about UX East Meets West', tags: ['community','hobby','like'] },
    { label: 'Docusign work', query: 'Tell me about Wei at Docusign', tags: ['project','growth','pricing'] },
    { label: 'Meta work', query: 'Tell me about Wei at Meta', tags: ['project','data','enterprise'] },
    { label: 'Shure work', query: 'Tell me about Wei at Shure', tags: ['project','audio','hardware','mobile'] },
    { label: "Wei's strengths", query: 'What is Wei good at?', tags: ['about','skill'] },
    { label: 'Where is Wei based', query: 'Where does Wei live?', tags: ['about'] },
  ];

  /* ─── Fallback Matching Engine ─────────────────────── */

  function normalise(str) {
    return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }

  function scoreMatch(input, keywords) {
    const words = normalise(input).split(/\s+/);
    let score = 0;
    for (const kw of keywords) {
      for (const w of words) {
        if (w === kw) score += 3;
        else if (w.length > 3 && kw.startsWith(w)) score += 2;
        else if (kw.length > 3 && w.startsWith(kw)) score += 2;
        else if (w.length > 3 && kw.includes(w)) score += 1;
      }
    }
    return score;
  }

  function fallbackAnswer(input) {
    let bestScore = 0, bestAnswer = null;
    for (const pair of QA_PAIRS) {
      const s = scoreMatch(input, pair.keywords);
      if (s > bestScore) { bestScore = s; bestAnswer = pair.answer; }
    }
    if (bestScore < 2) return `I'm not sure about that, but Wei would love to chat! Reach out at <a href="mailto:weihsunc@gmail.com">weihsunc@gmail.com</a> or on ${ext(SOCIAL_LINKS.linkedin.url, 'LinkedIn')}.`;
    return bestAnswer;
  }

  /* ─── HTML Safety ──────────────────────────────────── */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Only these tags survive in bot output. Everything else is unwrapped
  // to its text, and scripts/styles are dropped entirely.
  const ALLOWED_TAGS = new Set(['A', 'STRONG', 'B', 'EM', 'I', 'BR']);

  function safeHref(href) {
    if (!href) return null;
    const h = href.trim();
    if (/^(https?:\/\/|mailto:)/i.test(h)) return h;
    if (/^[a-z0-9-]+\.html$/i.test(h)) return h;      // relative site page
    return null;
  }

  function unwrap(el) {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }

  function cleanNode(node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }

      const tag = child.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') { child.remove(); continue; }

      cleanNode(child);

      if (!ALLOWED_TAGS.has(tag)) {
        // Preserve a line break when a block element is flattened
        if (/^(P|DIV|LI|UL|OL|H[1-6])$/.test(tag) && child.nextSibling) {
          child.appendChild(document.createElement('br'));
        }
        unwrap(child);
        continue;
      }

      const href = tag === 'A' ? child.getAttribute('href') : null;
      for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);

      if (tag === 'A') {
        const safe = safeHref(href);
        if (!safe) { unwrap(child); continue; }
        child.setAttribute('href', safe);
        if (/^https?:/i.test(safe)) {
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener');
        }
      }
    }
  }

  // Light markdown tolerance in case the model slips: **bold** and [text](url)
  function markdownLite(text) {
    return text
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|[a-z0-9-]+\.html)\)/gi, '<a href="$2">$1</a>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  }

  function renderBotHtml(text) {
    const tpl = document.createElement('template');
    tpl.innerHTML = markdownLite(String(text)).replace(/\n/g, '<br>');
    cleanNode(tpl.content);
    return tpl.innerHTML;
  }

  /* ─── Conversation State (persisted per tab) ───────── */

  let conversationHistory = [];   // [{ role, content }] sent to the API
  let transcript = [];            // [{ sender, html }] rendered in the UI
  let lastPage = null;            // page key the transcript was last updated on

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (Array.isArray(s.history)) conversationHistory = s.history.slice(-MAX_HISTORY);
      if (Array.isArray(s.transcript)) transcript = s.transcript;
      if (typeof s.page === 'string') lastPage = s.page;
    } catch (e) { /* ignore corrupt state */ }
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        history: conversationHistory,
        transcript,
        page: currentPageKey()
      }));
    } catch (e) { /* storage unavailable */ }
  }

  /* ─── Claude API (via serverless proxy) ─────────────── */

  function pushHistory(role, content) {
    conversationHistory.push({ role, content });
    if (conversationHistory.length > MAX_HISTORY) conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    while (conversationHistory.length && conversationHistory[0].role !== 'user') conversationHistory.shift();
  }

  async function callClaudeAPI(userMessage) {
    pushHistory('user', userMessage);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory, page: currentPageKey() }),
        signal: controller.signal
      });
      if (!response.ok) return null;

      const data = await response.json();
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      return text || null;
    } catch (e) {
      console.error('Agent Wei request failed:', e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ─── Icons ────────────────────────────────────────── */

  const AVATAR_IMG = `<div style="position:absolute;width:96px;height:64px;left:calc(50% - 2px);top:50%;transform:translate(-50%,-50%);"><img src="images/wei-avatar.png" alt="" style="width:100%;height:100%;object-fit:cover;pointer-events:none;" /></div>`;

  // shadcn Minimize2 icon (two inward-pointing arrows)
  const MINIMIZE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

  const ARROW_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="13" x2="13" y2="3"/><polyline points="6 3 13 3 13 10"/></svg>`;

  // lucide file-text style page icon
  const PAGE_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 1.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.5l-3-3z"/><path d="M9.5 1.5v3h3"/><path d="M6 8.5h4M6 11h4"/></svg>`;

  const CHEVRON_DOWN_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 6 8 10 12 6"/></svg>`;

  /* ─── DOM Construction ─────────────────────────────── */

  function createChatbot() {
    loadState();

    // Pill trigger button
    const trigger = document.createElement('button');
    trigger.className = 'chat-trigger';
    trigger.setAttribute('aria-label', 'Open Agent Wei');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      <span class="chat-trigger-icon">${AVATAR_IMG}</span>
      <span>Agent Wei</span>`;

    // Chat window
    const win = document.createElement('div');
    win.className = 'chat-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Agent Wei');
    win.innerHTML = `
      <div class="chat-header">
        <div class="chat-header-left">
          <span class="chat-header-icon">${AVATAR_IMG}</span>
          <h3>Agent Wei</h3>
        </div>
        <button class="chat-minimize-btn" aria-label="Minimize chat">${MINIMIZE_SVG}</button>
      </div>

      <div class="chat-content">
        <div class="chat-messages" aria-live="polite"></div>
        <button class="chat-scroll-bottom" aria-label="Scroll to latest message" tabindex="-1">${CHEVRON_DOWN_SVG}</button>
      </div>

      <div class="chat-input-area">
        <div class="chat-composer">
          <div class="chat-context-chip" hidden title="Answers use this page as context">
            <span class="chat-context-icon">${PAGE_SVG}</span>
            <span class="chat-context-name"></span>
            <span class="chat-context-meta"></span>
          </div>
          <div class="chat-input-wrap">
            <textarea class="chat-input" rows="1" placeholder="Ask me anything..." autocomplete="off" aria-label="Your message"></textarea>
            <button class="chat-send" aria-label="Send message">${ARROW_SVG}</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(trigger);
    document.body.appendChild(win);

    const messages = win.querySelector('.chat-messages');
    const input = win.querySelector('.chat-input');
    const sendBtn = win.querySelector('.chat-send');
    const minimizeBtn = win.querySelector('.chat-minimize-btn');
    const scrollBtn = win.querySelector('.chat-scroll-bottom');
    const contextChip = win.querySelector('.chat-context-chip');
    const inputArea = win.querySelector('.chat-input-area');

    // Context chip: tells the visitor the assistant knows which project page they're on
    const currentProject = getCurrentProject();
    if (currentProject) {
      contextChip.querySelector('.chat-context-name').textContent = currentProject.name;
      contextChip.querySelector('.chat-context-meta').textContent = currentProject.company;
      contextChip.hidden = false;
      inputArea.classList.add('has-context');
    }

    let hasRendered = false;
    let isSending = false;

    /* ─── Message Helpers ────────────────────────────── */

    const SCROLL_BTN_THRESHOLD = 80; // px away from the bottom before the button shows

    function updateScrollButton() {
      const distance = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
      scrollBtn.classList.toggle('visible', distance > SCROLL_BTN_THRESHOLD);
    }

    function scrollToBottom(smooth) {
      if (smooth) messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
      else messages.scrollTop = messages.scrollHeight;
      updateScrollButton();
    }

    messages.addEventListener('scroll', updateScrollButton, { passive: true });
    scrollBtn.addEventListener('click', () => scrollToBottom(true));

    // `html` must already be safe (escaped or sanitised)
    function renderMessage(html, sender) {
      const div = document.createElement('div');
      div.className = `chat-msg ${sender}`;
      div.innerHTML = html;
      messages.appendChild(div);
      scrollToBottom();
    }

    function addMessage(html, sender) {
      renderMessage(html, sender);
      transcript.push({ sender, html });
      saveState();
    }

    function addUserMessage(text) {
      addMessage(escapeHtml(text).replace(/\n/g, '<br>'), 'user');
    }

    function addBotMessage(text) {
      addMessage(renderBotHtml(text), 'bot');
    }

    function showTyping() {
      const t = document.createElement('div');
      t.className = 'chat-typing';
      t.setAttribute('aria-label', 'Agent Wei is typing');
      t.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(t);
      scrollToBottom();
      return t;
    }

    // Suggestions that have been clicked aren't offered again this session
    const usedQueries = new Set();

    function pickSuggestions(contextTags, count) {
      const available = ALL_SUGGESTIONS.filter(s => !usedQueries.has(s.query));
      if (available.length === 0) return [];

      const scored = available.map(s => {
        let score = 0;
        for (const t of contextTags) {
          if (s.tags.includes(t)) score++;
        }
        score += Math.random() * 0.3; // small random factor to vary picks
        return { ...s, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, count);
    }

    function renderSuggestionRow(items) {
      if (!items.length) return;
      const wrap = document.createElement('div');
      wrap.className = 'chat-suggestions';
      for (const s of items) {
        const btn = document.createElement('button');
        btn.className = 'chat-suggest-btn';
        btn.textContent = s.label;
        btn.addEventListener('click', () => {
          usedQueries.add(s.query);
          handleSend(s.query);
        });
        wrap.appendChild(btn);
      }
      messages.appendChild(wrap);
      scrollToBottom();
    }

    function clearSuggestions() {
      messages.querySelectorAll('.chat-suggestions').forEach(el => el.remove());
    }

    function addSuggestions(contextTags) {
      renderSuggestionRow(pickSuggestions(contextTags, 3));
    }

    function projectSuggestions(project) {
      return [
        { label: 'Summarize this project', query: `Give me a summary of the ${project.name} project` },
        { label: "What's the impact", query: `What's the impact of the ${project.name} project?` },
        { label: `More ${project.company} work`, query: `Tell me about Wei's other work at ${project.company}` },
      ];
    }

    /* ─── Welcome / Restore ──────────────────────────── */

    function showWelcome() {
      const project = getCurrentProject();
      if (project) {
        addBotMessage(`Hi! I see you're viewing <strong>${project.name}</strong>. Ask me anything about this project or Wei's other work.`);
        setTimeout(() => renderSuggestionRow(projectSuggestions(project)), 150);
      } else {
        addBotMessage("Hi! I'm Agent Wei, Wei's portfolio assistant. Ask me anything about Wei's work, what he's building now, or how to get in touch.");
        setTimeout(() => addSuggestions(['intro', 'greeting']), 150);
      }
    }

    function restoreTranscript() {
      for (const m of transcript) renderMessage(m.html, m.sender);

      const project = getCurrentProject();
      const page = currentPageKey();
      if (project && page !== lastPage) {
        // Visitor navigated to a new project page mid-conversation. Shown once,
        // not saved to the transcript, so nudges don't pile up across pages.
        renderMessage(renderBotHtml(`You're now on <strong>${project.name}</strong>. Happy to answer questions about this one too.`), 'bot');
        setTimeout(() => renderSuggestionRow(projectSuggestions(project)), 150);
      } else {
        const lastUser = [...transcript].reverse().find(m => m.sender === 'user');
        const tags = lastUser ? getContextTags(lastUser.html) : ['intro', 'greeting'];
        setTimeout(() => addSuggestions(tags), 150);
      }
      saveState();
    }

    function ensureRendered() {
      if (hasRendered) return;
      hasRendered = true;
      if (transcript.length) restoreTranscript();
      else showWelcome();
    }

    /* ─── Send Message ───────────────────────────────── */

    // Derive context tags from user message to pick relevant follow-ups
    function getContextTags(msg) {
      const lower = msg.toLowerCase();
      const tags = ['default'];
      const tagMap = {
        project: ['project','work','portfolio','case','docusign','meta','shure','aivvy','lofi','illoca'],
        lofi: ['lofi','canvas','vibe','startup','founder','now','currently'],
        ai: ['ai','claude','agent','prompt','ship','code','coding','illoca','3d'],
        about: ['about','who','wei','background','introduce'],
        hobby: ['hobby','like','cooking','guitar','photo','fun','interest','outside','espresso'],
        experience: ['experience','career','job','role','company','worked','now','currently'],
        skill: ['skill','strength','good at','best','specialty','expertise'],
        growth: ['growth','plg','conversion','pricing','plan'],
        data: ['data','lifecycle','metric','analytics'],
        community: ['community','east meets west','mentor','meetup'],
        hire: ['contact','email','reach','hire','connect','resume'],
      };
      for (const [tag, words] of Object.entries(tagMap)) {
        if (words.some(w => lower.includes(w))) tags.push(tag);
      }
      return tags;
    }

    async function handleSend(text) {
      if (isSending) return;
      const msg = (text || input.value).trim();
      if (!msg) return;

      isSending = true;
      sendBtn.disabled = true;
      input.value = '';
      autoGrow();
      clearSuggestions();
      addUserMessage(msg);

      const typing = showTyping();
      const reply = await callClaudeAPI(msg);
      typing.remove();

      if (reply) {
        pushHistory('assistant', reply);
        addBotMessage(reply);
      } else {
        // API unavailable: answer locally and keep history alternating
        // so the next API call still has a valid conversation shape.
        const local = fallbackAnswer(msg);
        pushHistory('assistant', local.replace(/<[^>]+>/g, ''));
        addBotMessage(local);
      }
      saveState();

      isSending = false;
      sendBtn.disabled = false;

      const tags = getContextTags(msg);
      setTimeout(() => addSuggestions(tags), 200);
    }

    /* ─── Toggle Open/Close ──────────────────────────── */

    let isOpen = false;

    function openChatbot() {
      isOpen = true;
      trigger.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
      win.classList.add('open');
      // Only auto-focus on desktop, avoids the keyboard popping up on mobile
      if (!window.matchMedia('(pointer: coarse)').matches) {
        input.focus();
      }
      ensureRendered();
    }

    function closeChatbot() {
      isOpen = false;
      trigger.classList.remove('active');
      trigger.setAttribute('aria-expanded', 'false');
      win.classList.remove('open');
      trigger.focus();
    }

    trigger.addEventListener('click', openChatbot);
    minimizeBtn.addEventListener('click', closeChatbot);

    // Composer grows with its content (like Linear), up to MAX_INPUT_HEIGHT
    const MAX_INPUT_HEIGHT = 120; // px, about 5 lines

    function autoGrow() {
      input.style.height = 'auto';
      const next = Math.min(input.scrollHeight, MAX_INPUT_HEIGHT);
      input.style.height = next + 'px';
      input.style.overflowY = input.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
    }

    input.addEventListener('input', autoGrow);

    sendBtn.addEventListener('click', () => handleSend());
    input.addEventListener('keydown', (e) => {
      // Enter sends, Shift+Enter inserts a newline
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); handleSend(); }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) closeChatbot();
    });
  }

  /* ─── Init ─────────────────────────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createChatbot);
  } else {
    createChatbot();
  }

})();
