/* ═══════════════════════════════════════════════════════
   CHATBOT — Claude Haiku Powered Portfolio Assistant
   Default: Claude AI (Haiku). Fallback: smart matching.
   API key stored in sessionStorage (cleared on tab close)
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── System Prompt ────────────────────────────────── */

  const SYSTEM_PROMPT = `You are Wei's portfolio assistant — a friendly, concise chatbot embedded on Wei-Hsun Chen's personal design portfolio website. Answer visitors' questions using ONLY the information below. Keep responses short (2-4 sentences max) and conversational.

## About Wei
- Full name: Wei-Hsun Chen
- Location: Brooklyn, NY
- Originally born and raised in Taiwan
- 10+ years of product design experience
- Specialties: Growth design, enterprise data/AI tooling, mobile apps, hardware products
- Strengths: Navigating complex work, product thinking — turning ambiguous business problems into clear, measurable design solutions
- Currently leading growth design at Docusign, focusing on customer purchasing & expansion moments
- Hobbies: Cooking, playing guitar, photography
- Favorite food: Ice cream and noodles

## Contact & Social
- Email: weihsunc@gmail.com
- LinkedIn: https://www.linkedin.com/in/weihsunchen/
- Instagram: https://www.instagram.com/weiweistreet/
- Resume: https://drive.google.com/file/d/1wEjseGZzI--HP0VtRS0fhP2p2_UvBVGQ/view?usp=sharing

## Design Community
- Wei co-runs UX East Meets West (https://medium.com/uxeastmeetswest), one of the largest design communities for Taiwanese designers
- They run mentorship programs and meetups
- Facebook: https://www.facebook.com/UXeastmeetswest

## Portfolio Projects

1. Plan and Pricing (Docusign, 2025) — plan-and-pricing.html
   Wei redesigned Docusign's pricing page for the 2025 rebrand and new IAM platform. Led workshops, usability testing, and A/B/C experiments. Result: 8% conversion increase, 29% higher ASP, $252k MRR increase.

2. Metric Investigation (Meta, 2022) — metric-investigation.html
   Wei redesigned Meta's root cause analysis tool to help data scientists find insights faster. Led heuristic evaluation and design. Result: 178% more metrics monitored, 92% user growth, launched in 5 weeks.

3. ShurePlus Play (Shure, 2019) — shure-play.html
   Wei designed a 0-1 mobile app for Shure's premium listening headphones. Led co-design sessions with audiophiles in Tokyo. Result: 4.4/5 App Store rating, 300% Android user growth, 60%+ EQ adoption.

4. Data Lifecycle (Meta, 2022) — data-lifecycle.html
   Wei designed a self-serve lifecycle management tool for data artifacts at Meta. Focused on deprecation workflows and automated notifications. Result: 30% unused tables and 20% unused dashboards deprecated within a month.

5. Shure AONIC (Shure, 2020) — shure-aonic.html
   Wei led UX for the AONIC headphones — app, hardware interaction, and unboxing. Collaborated with industrial design and research teams. Result: press coverage from The Verge, SoundGuys, WhatHifi.

6. Product-Led Growth Experiments (Docusign, 2024) — product-led-growth.html
   Wei designed two in-product growth experiments — plan recommendations and self-serve add-ons. Result: 15.3% conversion lift ($500k MRR) and 53% week-over-week SMS expansion growth.

7. ShurePlus Channels (Shure, 2018) — shure-channels.html
   Wei designed a mobile companion app for audio engineers monitoring wireless systems during live events. Led user interviews and streamlined quick-recording workflows.

8. Aivvy Headphones (Aivvy, 2016) — aivvy.html
   Wei designed the companion app for the world's first IOT smart headphones as a UX intern. Led usability testing that shaped the product. Result: Kickstarter funded, Red Dot and CES Innovation Awards.

## Rules
- CONTEXT AWARENESS: The user's current page is provided as context. When the user asks about a project:
  - If the user is ON that project's page: summarize in 2-3 sentences — what it is, Wei's contribution, and the key result. Do NOT link to the page they're already on.
  - If the user is on a DIFFERENT page (home, about, or another project): give a 1-sentence teaser and link them to the project page.
- Keep ALL responses short — 2-4 sentences max. Never dump the full project details.
- When linking to portfolio projects, use relative URLs as HTML anchor tags: <a href="page.html">text</a>
- When linking to external sites, use full URLs: <a href="url" target="_blank" rel="noopener">text</a>
- If someone asks something you don't know about Wei, say you're not sure and suggest they email Wei directly
- Be warm but professional. Don't make up information.
- Do NOT use markdown formatting. Write in flowing plain text with HTML anchor tags for links.
- Do NOT use bullet lists or headers.`;

  /* ─── Fallback Knowledge Base ──────────────────────── */

  const SOCIAL_LINKS = {
    linkedin:  { url: 'https://www.linkedin.com/in/weihsunchen/' },
    instagram: { url: 'https://www.instagram.com/weiweistreet/' },
    email:     { url: 'mailto:weihsunc@gmail.com' },
    medium:    { url: 'https://medium.com/uxeastmeetswest' },
    facebook:  { url: 'https://www.facebook.com/UXeastmeetswest' }
  };

  const QA_PAIRS = [
    { keywords: ['who','about','yourself','introduce','wei','tell me','background'], answer: `I'm Wei — a product designer with 10+ years of experience based in Brooklyn, NY. Originally born and raised in Taiwan. I specialize in growth design, enterprise data/AI tooling, mobile apps, and hardware products. Currently leading growth design at Docusign.` },
    { keywords: ['experience','work','career','job','role','company','companies','worked'], answer: `Wei has worked across a range of companies: currently at <a href="plan-and-pricing.html">Docusign</a> leading growth design, previously at <a href="metric-investigation.html">Meta</a> working on enterprise data/AI tooling, and at <a href="shure-play.html">Shure</a> designing audio product experiences.` },
    { keywords: ['contact','email','reach','hire','connect','touch','message'], answer: `You can reach Wei at <a href="mailto:weihsunc@gmail.com">weihsunc@gmail.com</a>, connect on <a href="${SOCIAL_LINKS.linkedin.url}" target="_blank" rel="noopener">LinkedIn</a>, or follow on <a href="${SOCIAL_LINKS.instagram.url}" target="_blank" rel="noopener">Instagram</a>.` },
    { keywords: ['linkedin','social','profile','network'], answer: `Here's Wei's <a href="${SOCIAL_LINKS.linkedin.url}" target="_blank" rel="noopener">LinkedIn profile</a> and <a href="${SOCIAL_LINKS.instagram.url}" target="_blank" rel="noopener">Instagram</a>. Feel free to connect!` },
    { keywords: ['instagram','ig','insta','photo','photos'], answer: `Follow Wei on <a href="${SOCIAL_LINKS.instagram.url}" target="_blank" rel="noopener">Instagram (@weiweistreet)</a> for photos and updates.` },
    { keywords: ['resume','cv','download'], answer: `You can view Wei's resume <a href="https://drive.google.com/file/d/1wEjseGZzI--HP0VtRS0fhP2p2_UvBVGQ/view?usp=sharing" target="_blank" rel="noopener">here on Google Drive</a>.` },
    { keywords: ['location','live','where','based','city'], answer: `Wei is based in Brooklyn, NY. Originally born and raised in Taiwan.` },
    { keywords: ['taiwan','taiwanese','origin','from','hometown','born'], answer: `Wei was born and raised in Taiwan and is now based in Brooklyn, NY.` },
    { keywords: ['hobby','hobbies','interest','free time','fun','outside','passion','like','likes'], answer: `Outside of design, Wei enjoys cooking, playing guitar, and photography. He also runs a design community called UX East Meets West.` },
    { keywords: ['cook','cooking','food','kitchen','favorite food','eat','noodle','noodles','ice cream','dessert'], answer: `Wei's favorite foods are ice cream and noodles! Cooking is also one of his favorite hobbies — a creative outlet outside of design.` },
    { keywords: ['guitar','music','instrument'], answer: `Wei plays guitar in his free time — music is a nice balance to design work.` },
    { keywords: ['photo','photography','camera','shoot'], answer: `Wei is into photography — you can see some of his personal shots on the <a href="about.html">about page</a>.` },
    { keywords: ['community','ux east','east meets west','mentor','mentorship','meetup'], answer: `Wei co-runs <a href="${SOCIAL_LINKS.medium.url}" target="_blank" rel="noopener">UX East Meets West</a>, one of the largest design communities for Taiwanese designers. They run mentorship programs and meetups. Follow on <a href="${SOCIAL_LINKS.facebook.url}" target="_blank" rel="noopener">Facebook</a>.` },
    { keywords: ['skill','strength','good at','best','specialty','specialize','expertise'], answer: `Wei excels at navigating complex work and product thinking — turning ambiguous business problems into clear, measurable design solutions.` },
    { keywords: ['growth','plg','conversion','experiment'], answer: `Growth design is a core strength. Check out <a href="product-led-growth.html">Product-Led Growth Experiments</a> and <a href="plan-and-pricing.html">Plan and Pricing</a>.` },
    { keywords: ['complex','hardest','challenging','difficult','most complex','biggest'], answer: `Wei's most complex work includes <a href="data-lifecycle.html">Data Lifecycle</a> at Meta — a large-scale enterprise data/AI tooling project involving privacy compliance — and <a href="plan-and-pricing.html">Plan and Pricing</a> at Docusign, where he navigated intricate business logic around enterprise packaging and monetization.` },
    { keywords: ['docusign','current'], answer: `Wei currently leads growth design at Docusign. See <a href="plan-and-pricing.html">Plan and Pricing</a> and <a href="product-led-growth.html">Product-Led Growth</a>.` },
    { keywords: ['meta','facebook','data'], answer: `At Meta, Wei worked on enterprise data and AI tooling. See <a href="metric-investigation.html">Metric Investigation</a> and <a href="data-lifecycle.html">Data Lifecycle</a>.` },
    { keywords: ['shure','audio','hardware','headphone','microphone'], answer: `Wei designed multiple products at Shure — <a href="shure-play.html">ShurePlus Play</a>, <a href="shure-aonic.html">AONIC headphones</a>, and <a href="shure-channels.html">ShurePlus Channels</a>.` },
    { keywords: ['aivvy','startup','iot','wearable'], answer: `<a href="aivvy.html">Aivvy</a> was an early-career project — a hardware startup building smart headphones with built-in music streaming.` },
    { keywords: ['project','portfolio','case study','case studies','all projects','show'], answer: `Here are Wei's featured projects: <a href="plan-and-pricing.html">Plan & Pricing</a> (Docusign), <a href="metric-investigation.html">Metric Investigation</a> (Meta), <a href="shure-play.html">ShurePlus Play</a> (Shure), <a href="data-lifecycle.html">Data Lifecycle</a> (Meta), <a href="shure-aonic.html">Shure AONIC</a> (Shure), <a href="product-led-growth.html">PLG Experiments</a> (Docusign), <a href="shure-channels.html">ShurePlus Channels</a> (Shure), <a href="aivvy.html">Aivvy Headphones</a> (Aivvy).` },
    { keywords: ['enterprise','b2b','saas','tool','tooling'], answer: `Enterprise design is a strong focus. See <a href="data-lifecycle.html">Data Lifecycle</a> at Meta and <a href="plan-and-pricing.html">Plan & Pricing</a> at Docusign.` },
    { keywords: ['mobile','app','ios','android'], answer: `Check out <a href="shure-play.html">ShurePlus Play</a>, a mobile audio app Wei designed for Shure.` },
    { keywords: ['hello','hi','hey','sup','yo','greet'], answer: `Hey there! I'm Wei's portfolio assistant. Ask me anything about Wei's work, experience, or how to get in touch.` },
    { keywords: ['thank','thanks','bye','goodbye','see you','later','cheers'], answer: `Thanks for stopping by! Reach out at <a href="mailto:weihsunc@gmail.com">weihsunc@gmail.com</a>, on <a href="${SOCIAL_LINKS.linkedin.url}" target="_blank" rel="noopener">LinkedIn</a>, or follow on <a href="${SOCIAL_LINKS.instagram.url}" target="_blank" rel="noopener">Instagram</a>.` }
  ];

  /* ─── Page-Aware Project Context ──────────────────── */

  const PROJECT_PAGES = {
    'plan-and-pricing.html':     { name: 'Plan and Pricing', company: 'Docusign', tags: ['growth','pricing','enterprise'] },
    'metric-investigation.html': { name: 'Metric Investigation', company: 'Meta', tags: ['data','analytics','enterprise'] },
    'shure-play.html':           { name: 'ShurePlus Play', company: 'Shure', tags: ['mobile','audio','app'] },
    'data-lifecycle.html':       { name: 'Data Lifecycle', company: 'Meta', tags: ['data','enterprise','ai','privacy'] },
    'shure-aonic.html':          { name: 'Shure AONIC', company: 'Shure', tags: ['hardware','audio','headphone'] },
    'product-led-growth.html':   { name: 'Product-Led Growth Experiments', company: 'Docusign', tags: ['growth','conversion','experiment'] },
    'shure-channels.html':       { name: 'ShurePlus Channels', company: 'Shure', tags: ['audio','wireless','hardware'] },
    'aivvy.html':                { name: 'Aivvy Headphones', company: 'Aivvy', tags: ['hardware','startup','iot'] },
  };

  function getCurrentProject() {
    const page = window.location.pathname.split('/').pop() || '';
    return PROJECT_PAGES[page] || null;
  }

  // All available follow-up suggestions — 2-3 are picked contextually after each response
  const ALL_SUGGESTIONS = [
    { label: "What's Wei's most complex project", query: "What's Wei's most complex project", tags: ['intro','greeting','project'] },
    { label: "Wei's favorite food", query: "What's Wei's favorite food?", tags: ['intro','greeting','hobby'] },
    { label: 'Resume', query: 'Can I see the resume?', tags: ['intro','greeting','experience','hire'] },
    { label: 'About Wei', query: 'Tell me about Wei', tags: ['intro','hello'] },
    { label: 'See all projects', query: 'Show me all projects', tags: ['project','work','experience','company'] },
    { label: 'Contact Wei', query: 'How can I reach Wei?', tags: ['default'] },
    { label: 'UX East Meets West', query: 'Tell me about UX East Meets West', tags: ['community','hobby','like'] },
    { label: 'Docusign work', query: 'Tell me about Wei at Docusign', tags: ['project','growth','pricing'] },
    { label: 'Meta work', query: 'Tell me about Wei at Meta', tags: ['project','data','enterprise'] },
    { label: 'Shure work', query: 'Tell me about Wei at Shure', tags: ['project','audio','hardware','mobile'] },
    { label: "Wei's strengths", query: "What is Wei good at?", tags: ['intro','about','skill'] },
    { label: 'Where is Wei based', query: 'Where does Wei live?', tags: ['about','intro'] },
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
    if (bestScore < 2) return `I'm not sure about that, but Wei would love to chat! Reach out at <a href="mailto:weihsunc@gmail.com">weihsunc@gmail.com</a> or on <a href="${SOCIAL_LINKS.linkedin.url}" target="_blank" rel="noopener">LinkedIn</a>.`;
    return bestAnswer;
  }

  /* ─── Claude API (via serverless proxy) ─────────────── */

  let conversationHistory = [];

  async function callClaudeAPI(userMessage) {
    conversationHistory.push({ role: 'user', content: userMessage });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

    // Build context-aware system prompt with current page info
    const project = getCurrentProject();
    const pageName = window.location.pathname.split('/').pop() || 'index.html';
    let contextLine = `\n\n## Current Page Context\nThe user is currently viewing: ${pageName}`;
    if (project) {
      contextLine += ` (the ${project.name} project page at ${project.company})`;
    } else if (pageName === 'index.html' || pageName === '') {
      contextLine += ' (the home page)';
    } else if (pageName === 'about.html') {
      contextLine += ' (the about page)';
    }
    const systemWithContext = SYSTEM_PROMPT + contextLine;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemWithContext,
          messages: conversationHistory
        })
      });

      if (!response.ok) return null;

      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      conversationHistory.push({ role: 'assistant', content: text });
      return { text };
    } catch (e) {
      console.error('Claude API error:', e);
      return null;
    }
  }

  /* ─── Icons ────────────────────────────────────────── */

  const AVATAR_IMG = `<div style="position:absolute;width:96px;height:64px;left:calc(50% - 2px);top:50%;transform:translate(-50%,-50%);"><img src="images/wei-avatar.png" alt="" style="width:100%;height:100%;object-fit:cover;pointer-events:none;" /></div>`;

  // shadcn Minimize2 icon (two inward-pointing arrows)
  const MINIMIZE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

  const ARROW_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="13" x2="13" y2="3"/><polyline points="6 3 13 3 13 10"/></svg>`;

  /* ─── DOM Construction ─────────────────────────────── */

  function createChatbot() {
    // Pill trigger button
    const trigger = document.createElement('button');
    trigger.className = 'chat-trigger';
    trigger.setAttribute('aria-label', 'Open chat');
    trigger.innerHTML = `
      <span class="chat-trigger-icon">${AVATAR_IMG}</span>
      <span>Chat with Wei AI</span>`;

    // Chat window
    const win = document.createElement('div');
    win.className = 'chat-window';
    win.innerHTML = `
      <div class="chat-header">
        <div class="chat-header-left">
          <span class="chat-header-icon">${AVATAR_IMG}</span>
          <h3>Chat with Wei AI</h3>
        </div>
        <button class="chat-minimize-btn" aria-label="Minimize">${MINIMIZE_SVG}</button>
      </div>

      <div class="chat-content">
        <div class="chat-messages"></div>
      </div>

      <div class="chat-input-area">
        <div class="chat-input-wrap">
          <input class="chat-input" type="text" placeholder="Ask me anything..." autocomplete="off" />
          <button class="chat-send" aria-label="Send message">${ARROW_SVG}</button>
        </div>
      </div>`;

    document.body.appendChild(trigger);
    document.body.appendChild(win);

    const messages = win.querySelector('.chat-messages');
    const input = win.querySelector('.chat-input');
    const sendBtn = win.querySelector('.chat-send');
    const minimizeBtn = win.querySelector('.chat-minimize-btn');

    let hasShownWelcome = false;

    /* ─── Message Helpers ────────────────────────────── */

    function addMessage(text, sender) {
      const div = document.createElement('div');
      div.className = `chat-msg ${sender}`;
      div.innerHTML = text.replace(/\n/g, '<br>');
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function showTyping() {
      const t = document.createElement('div');
      t.className = 'chat-typing';
      t.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(t);
      messages.scrollTop = messages.scrollHeight;
      return t;
    }

    // Track which suggestions have been used so we don't repeat them
    let usedQueries = new Set();

    function pickSuggestions(contextTags, count) {
      // Filter out already-used suggestions, then score by tag overlap
      const available = ALL_SUGGESTIONS.filter(s => !usedQueries.has(s.query));
      if (available.length === 0) return [];

      const scored = available.map(s => {
        let score = 0;
        for (const t of contextTags) {
          if (s.tags.includes(t)) score++;
        }
        // Small random factor to vary picks
        score += Math.random() * 0.3;
        return { ...s, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, count);
    }

    function addSuggestions(contextTags) {
      const picks = pickSuggestions(contextTags, 3);
      if (picks.length === 0) return;

      const wrap = document.createElement('div');
      wrap.className = 'chat-suggestions';
      for (const s of picks) {
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
      messages.scrollTop = messages.scrollHeight;
    }

    /* ─── Welcome ────────────────────────────────────── */

    function showWelcome() {
      if (hasShownWelcome) return;
      hasShownWelcome = true;

      const project = getCurrentProject();
      if (project) {
        addMessage(`Hi! I see you're viewing <strong>${project.name}</strong>. Ask me anything about this project or Wei's other work.`, 'bot');
        // Show project-specific suggestions
        const wrap = document.createElement('div');
        wrap.className = 'chat-suggestions';
        const projectSuggestions = [
          { label: 'Summarize this project', query: `Give me a summary of the ${project.name} project` },
          { label: "What's the impact", query: `What's the impact of the ${project.name} project?` },
          { label: `More ${project.company} work`, query: `Tell me about Wei's other work at ${project.company}` },
        ];
        for (const s of projectSuggestions) {
          const btn = document.createElement('button');
          btn.className = 'chat-suggest-btn';
          btn.textContent = s.label;
          btn.addEventListener('click', () => {
            usedQueries.add(s.query);
            handleSend(s.query);
          });
          wrap.appendChild(btn);
        }
        setTimeout(() => {
          messages.appendChild(wrap);
          messages.scrollTop = messages.scrollHeight;
        }, 150);
      } else {
        addMessage("Hi! I'm Wei's portfolio assistant. Ask me anything about Wei's work, background, or how to get in touch.", 'bot');
        setTimeout(() => addSuggestions(['intro', 'greeting']), 150);
      }
    }

    /* ─── Send Message ───────────────────────────────── */

    // Derive context tags from user message to pick relevant follow-ups
    function getContextTags(msg) {
      const lower = msg.toLowerCase();
      const tags = ['default'];
      const tagMap = {
        project: ['project','work','portfolio','case','docusign','meta','shure','aivvy'],
        about: ['about','who','wei','background','introduce'],
        hobby: ['hobby','like','cooking','guitar','photo','fun','interest','outside'],
        experience: ['experience','career','job','role','company','worked'],
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
      const msg = (text || input.value).trim();
      if (!msg) return;
      input.value = '';
      addMessage(msg, 'user');

      const typing = showTyping();

      const result = await callClaudeAPI(msg);
      typing.remove();

      if (result && result.text) {
        addMessage(result.text, 'bot');
      } else {
        // Fallback if API is unavailable
        addMessage(fallbackAnswer(msg), 'bot');
      }

      const tags = getContextTags(msg);
      setTimeout(() => addSuggestions(tags), 200);
    }

    /* ─── Toggle Open/Close ──────────────────────────── */

    let isOpen = false;

    function closeChatbot() {
      isOpen = false;
      trigger.classList.remove('active');
      win.classList.remove('open');
    }

    trigger.addEventListener('click', () => {
      isOpen = true;
      trigger.classList.add('active');
      win.classList.add('open');
      // Only auto-focus on desktop — avoids keyboard popping up on mobile
      if (!window.matchMedia('(pointer: coarse)').matches) {
        input.focus();
      }
      showWelcome();
    });

    minimizeBtn.addEventListener('click', closeChatbot);

    sendBtn.addEventListener('click', () => handleSend());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
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
