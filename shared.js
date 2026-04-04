/* ═══════════════════════════════════════════════════════
   SHARED JAVASCRIPT — Wei-Hsun Chen Portfolio
   Provides: theme, drawer, nav bg, cursor, lightbox, clocks
   ═══════════════════════════════════════════════════════ */

/* ─── Theme toggle ────────────────────────────────────── */
// Note: initial theme restoration is handled by an inline
// <script> in each page's <head> to prevent flash.
(function () {
  const root = document.documentElement;
  let isDark = localStorage.getItem('theme') !== 'light';

  window.toggleTheme = function () {
    isDark = !isDark;
    const next = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    if (!document.startViewTransition) {
      root.setAttribute('data-theme', next);
      return;
    }
    document.startViewTransition(() => {
      root.setAttribute('data-theme', next);
    });
  };
})();

/* ─── Mobile drawer ───────────────────────────────────── */
(function () {
  const drawer = document.getElementById('mobileDrawer');
  if (!drawer) return;

  function openDrawer() {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', e => {
    if (
      drawer.classList.contains('open') &&
      !drawer.contains(e.target) &&
      !e.target.closest('.btn-menu')
    ) closeDrawer();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });

  window.openDrawer  = openDrawer;
  window.closeDrawer = closeDrawer;
})();

/* ─── Animated nav background ─────────────────────────── */
(function () {
  const group = document.querySelector('.nav-tabs-group');
  if (!group) return;

  const bg = document.createElement('div');
  bg.className = 'nav-bg';
  group.prepend(bg);

  const items  = group.querySelectorAll('.nav-tab, .btn');
  const active = group.querySelector('.nav-tab.active');

  function moveBg(el, animate) {
    if (!animate) bg.style.transition = 'none';
    const gr = group.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    bg.style.opacity = '1';
    bg.style.left    = (er.left   - gr.left) + 'px';
    bg.style.top     = (er.top    - gr.top)  + 'px';
    bg.style.width   =  er.width  + 'px';
    bg.style.height  =  er.height + 'px';
    if (!animate) requestAnimationFrame(() => { bg.style.transition = ''; });
  }

  items.forEach(item => {
    item.addEventListener('mouseenter', () => moveBg(item, true));
  });
  group.addEventListener('mouseleave', () => {
    if (active) moveBg(active, true);
    else bg.style.opacity = '0';
  });

  requestAnimationFrame(() => {
    if (active) moveBg(active, false);
  });
})();

/* ─── Spring cursor ───────────────────────────────────── */
(function () {
  // Skip custom cursor on touch / coarse-pointer devices
  if (window.matchMedia('(pointer: coarse)').matches) {
    window.initViewCursor = function () {};
    return;
  }

  const el = document.createElement('div');
  el.id = 'custom-cursor';
  el.innerHTML = `<div class="cursor-ring">
    <span class="cursor-label">View</span>
    <svg class="cursor-icon" width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 17L17 7"/><path d="M7 7h10v10"/>
    </svg>
  </div>`;
  document.body.appendChild(el);

  let mouseX = 0, mouseY = 0, curX = 0, curY = 0, started = false;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!started) {
      curX = mouseX; curY = mouseY;
      started = true;
      el.classList.add('visible');
    }
  });
  document.addEventListener('mouseleave', () => el.classList.remove('visible'));
  document.addEventListener('mouseenter', () => el.classList.add('visible'));

  (function loop() {
    curX += (mouseX - curX) * 0.13;
    curY += (mouseY - curY) * 0.13;
    el.style.transform = `translate(${curX}px, ${curY}px)`;
    requestAnimationFrame(loop);
  })();

  // Call from page script to enable the "View" pill on hover targets
  window.initViewCursor = function (selector) {
    document.querySelectorAll(selector).forEach(wrap => {
      wrap.addEventListener('mouseenter', () => el.classList.add('is-view'));
      wrap.addEventListener('mouseleave', () => el.classList.remove('is-view'));
    });
  };
})();

/* ─── Carousel lightbox + morph open/close ─────────────── */
// Call initLightbox(selector) from each page script.
// On open: clicked image morphs (FLIP) from its thumbnail position
//   into the lightbox; sibling images peek from the edges.
// On close: active image morphs back to its thumbnail in the page.
(function () {
  // Wider slides on mobile for better visibility
  function slideVW() { return window.innerWidth < 768 ? 0.88 : 0.62; }
  const GAP        = 24;   // px gap between slides

  let lb, lbBd, lbTrack, lbTrackWrap, lbClose, lbPrev, lbNext;
  let slides = [], currentIdx = 0, isOpen = false;

  function buildDOM() {
    if (document.getElementById('img-lightbox')) return;
    const el = document.createElement('div');
    el.id = 'img-lightbox';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div id="img-lightbox-backdrop"></div>
      <div id="lb-track-wrap"><div id="lb-track"></div></div>
      <button id="img-lightbox-close" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <button id="lb-prev" aria-label="Previous">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L3 7L9 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button id="lb-next" aria-label="Next">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 2L11 7L5 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>`;
    document.body.appendChild(el);
  }

  function slideW() { return Math.round(window.innerWidth * slideVW()); }

  function positionTrack(animate) {
    const sw = slideW();
    const vw = window.innerWidth;
    const tx = Math.round(vw / 2 - currentIdx * (sw + GAP) - sw / 2);
    lbTrack.style.transition = animate
      ? 'transform 420ms cubic-bezier(0.4,0,0.2,1)'
      : 'none';
    lbTrack.style.transform = `translateX(${tx}px)`;
    lbTrack.querySelectorAll('.lb-slide').forEach((s, i) => {
      s.classList.toggle('lb-active', i === currentIdx);
    });
    lbPrev.hidden = currentIdx === 0;
    lbNext.hidden = currentIdx === slides.length - 1;
  }

  // Animate the backdrop opacity; pass animate=false for instant set
  function setBackdrop(opacity, animate) {
    lbBd.style.transition = animate ? 'opacity 300ms ease' : 'none';
    lbBd.style.opacity    = String(opacity);
  }

  function open(imgEls, startIdx) {
    if (isOpen) return;
    isOpen = true;
    // imgEls are the original <img> elements from the page —
    // used for src/alt AND for getting thumbnail rects on close.
    slides     = imgEls;
    currentIdx = startIdx;

    const sw = slideW();
    lbTrack.innerHTML = '';
    imgEls.forEach((srcImg, i) => {
      const slide = document.createElement('div');
      slide.className = 'lb-slide' + (i === startIdx ? ' lb-active' : '');
      slide.style.width = sw + 'px';
      const imgEl = document.createElement('img');
      imgEl.src = srcImg.src;
      imgEl.alt = srcImg.alt || '';
      slide.appendChild(imgEl);
      slide.addEventListener('click', e => {
        e.stopPropagation();
        if (i !== currentIdx) goTo(i);
      });
      lbTrack.appendChild(slide);
    });

    positionTrack(false);
    setBackdrop(0, false);

    // Show lightbox (triggers CSS transitions on close button & arrows)
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // ── FLIP open ──────────────────────────────────────────
    const activeSlide = lbTrack.children[startIdx];
    const activeImg   = activeSlide.querySelector('img');
    const thumbRect   = imgEls[startIdx].getBoundingClientRect();
    const thumbRadius = window.getComputedStyle(imgEls[startIdx]).borderRadius || '4px';

    // Suppress CSS transition on the active image during setup
    activeImg.style.transition = 'none';

    // Hide side slides initially so they don't flash in
    Array.from(lbTrack.children).forEach((s, i) => {
      if (i !== startIdx) s.style.opacity = '0';
    });

    requestAnimationFrame(() => {
      const dest   = activeImg.getBoundingClientRect();
      const scaleX = thumbRect.width  / Math.max(dest.width,  1);
      const scaleY = thumbRect.height / Math.max(dest.height, 1);
      const dx = (thumbRect.left + thumbRect.width  / 2) - (dest.left + dest.width  / 2);
      const dy = (thumbRect.top  + thumbRect.height / 2) - (dest.top  + dest.height / 2);

      // Invert: instantly place the lightbox image over the thumbnail
      lbTrackWrap.style.overflow = 'visible';
      activeImg.style.transform    = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
      activeImg.style.borderRadius = thumbRadius;

      requestAnimationFrame(() => {
        // Play: animate to final centered position
        activeImg.style.transition   = 'transform 420ms cubic-bezier(0.4,0,0.2,1), border-radius 420ms cubic-bezier(0.4,0,0.2,1)';
        activeImg.style.transform    = '';
        activeImg.style.borderRadius = '';

        // Fade in backdrop
        setBackdrop(1, true);

        // Fade in side slides slightly after morph begins
        setTimeout(() => {
          Array.from(lbTrack.children).forEach((s, i) => {
            if (i !== startIdx) {
              s.style.transition = 'opacity 220ms ease';
              s.style.opacity    = '';
            }
          });
        }, 120);

        // Restore clip and clear inline transition after morph finishes
        setTimeout(() => {
          lbTrackWrap.style.overflow = '';
          activeImg.style.transition = '';
        }, 450);
      });
    });
  }

  function close() {
    if (!isOpen) return;

    const activeSlide = lbTrack.children[currentIdx];
    const activeImg   = activeSlide && activeSlide.querySelector('img');
    const thumbEl     = slides[currentIdx]; // original page <img>

    if (activeImg && thumbEl) {
      // ── FLIP close ───────────────────────────────────────
      const dest      = activeImg.getBoundingClientRect();
      const thumbRect = thumbEl.getBoundingClientRect();
      const scaleX    = thumbRect.width  / Math.max(dest.width,  1);
      const scaleY    = thumbRect.height / Math.max(dest.height, 1);
      const dx = (thumbRect.left + thumbRect.width  / 2) - (dest.left + dest.width  / 2);
      const dy = (thumbRect.top  + thumbRect.height / 2) - (dest.top  + dest.height / 2);
      const thumbRadius = window.getComputedStyle(thumbEl).borderRadius || '4px';

      // Fade out side slides first
      Array.from(lbTrack.children).forEach((s, i) => {
        if (i !== currentIdx) {
          s.style.transition = 'opacity 150ms ease';
          s.style.opacity    = '0';
        }
      });

      // Morph active image back to thumbnail position
      lbTrackWrap.style.overflow  = 'visible';
      activeImg.style.transition  = 'transform 380ms cubic-bezier(0.4,0,0.2,1), border-radius 380ms cubic-bezier(0.4,0,0.2,1)';
      activeImg.style.transform   = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
      activeImg.style.borderRadius = thumbRadius;

      // Fade backdrop concurrently
      lbBd.style.transition = 'opacity 260ms ease';
      lbBd.style.opacity    = '0';

      setTimeout(cleanup, 420);
    } else {
      // Fallback: plain fade if no thumbnail reference
      lbBd.style.transition = 'opacity 300ms ease';
      lbBd.style.opacity    = '0';
      setTimeout(cleanup, 320);
    }
  }

  function cleanup() {
    isOpen = false;
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow  = '';
    lbBd.style.opacity            = '';
    lbBd.style.transition         = '';
    lbTrackWrap.style.overflow    = '';
    lbTrack.innerHTML             = '';
    slides                        = [];
  }

  function goTo(idx) {
    currentIdx = Math.max(0, Math.min(idx, slides.length - 1));
    positionTrack(true);
  }

  // Touch / swipe support
  let touchStartX = null;
  function onTouchStart(e) { touchStartX = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) goTo(currentIdx + 1);
    else        goTo(currentIdx - 1);
  }

  window.initLightbox = function (selector) {
    buildDOM();
    lb          = document.getElementById('img-lightbox');
    lbBd        = document.getElementById('img-lightbox-backdrop');
    lbTrack     = document.getElementById('lb-track');
    lbTrackWrap = document.getElementById('lb-track-wrap');
    lbClose     = document.getElementById('img-lightbox-close');
    lbPrev      = document.getElementById('lb-prev');
    lbNext      = document.getElementById('lb-next');

    document.querySelectorAll(selector).forEach(wrap => {
      const img = wrap.querySelector('img');
      if (!img) return;
      wrap.addEventListener('click', () => {
        const group = wrap.closest('.pp-img-pair, .pp-img-trio');
        if (group) {
          const allWraps = group.querySelectorAll('.pp-img-pair-item, .pp-img-trio-item');
          const imgs = Array.from(allWraps).map(w => w.querySelector('img')).filter(Boolean);
          const idx  = Array.from(allWraps).indexOf(wrap);
          open(imgs, idx >= 0 ? idx : 0);
        } else {
          open([img], 0);
        }
      });
    });

    lbBd.addEventListener('click', close);
    lbClose.addEventListener('click', close);
    lbPrev.addEventListener('click', e => { e.stopPropagation(); goTo(currentIdx - 1); });
    lbNext.addEventListener('click', e => { e.stopPropagation(); goTo(currentIdx + 1); });

    document.addEventListener('keydown', e => {
      if (!isOpen) return;
      if (e.key === 'Escape')     close();
      if (e.key === 'ArrowLeft')  goTo(currentIdx - 1);
      if (e.key === 'ArrowRight') goTo(currentIdx + 1);
    });

    lb.addEventListener('touchstart', onTouchStart, { passive: true });
    lb.addEventListener('touchend',   onTouchEnd,   { passive: true });
  };
})();

/* ─── Sliding digit clock ─────────────────────────────── */
// Call initSlidingClock('clock') from the page script.
window.initSlidingClock = function (elId) {
  const clockEl = document.getElementById(elId);
  if (!clockEl) return;
  let prevChars = [];

  function getTimeChars() {
    const now = new Date();
    let h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)} ${ampm}`.split('');
  }

  function initClockEl(chars) {
    clockEl.innerHTML = chars.map(c =>
      `<span class="digit-wrap"><span class="digit-val">${c}</span></span>`
    ).join('');
    prevChars = chars;
  }

  function tick() {
    const chars = getTimeChars();
    if (prevChars.length === 0) { initClockEl(chars); return; }
    const wraps = clockEl.querySelectorAll('.digit-wrap');
    chars.forEach((c, i) => {
      if (c !== prevChars[i]) {
        const val = wraps[i].querySelector('.digit-val');
        val.style.animation = 'digitOut 120ms ease forwards';
        val.addEventListener('animationend', () => {
          val.textContent = c;
          val.style.animation = 'digitIn 120ms ease forwards';
          val.addEventListener('animationend', () => {
            val.style.animation = '';
          }, { once: true });
        }, { once: true });
      }
    });
    prevChars = chars;
  }

  tick();
  setInterval(tick, 1000);
};

/* ─── Simple text clock ───────────────────────────────── */
// Call initSimpleClock('clock') from the page script.
window.initSimpleClock = function (elId) {
  const clockEl = document.getElementById(elId);
  if (!clockEl) return;

  function tick() {
    const now = new Date();
    let h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const pad = n => String(n).padStart(2, '0');
    clockEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)} ${ampm}`;
  }

  tick();
  setInterval(tick, 1000);
};

/* ─── Text animation helpers ──────────────────────────── */
// splitWords(el, startDelay, stagger?) — animates heading word-by-word.
// Returns the next available delay cursor.
window.splitWords = function (el, startDelay, stagger) {
  stagger = stagger || 55;
  const words = el.textContent.split(/(\s+)/);
  el.innerHTML = words.map(part => {
    if (/^\s+$/.test(part)) return part;
    const delay = startDelay;
    startDelay += stagger;
    return `<span class="word" style="animation-delay:${delay}ms">${part}</span>`;
  }).join('');
  return startDelay;
};

// paraAnimate(els, startDelay, step?) — fades in each element with stagger.
// Returns the next available delay cursor.
window.paraAnimate = function (els, startDelay, step) {
  step = step || 120;
  els.forEach(el => {
    el.classList.add('para-animate');
    el.style.animationDelay = startDelay + 'ms';
    startDelay += step;
  });
  return startDelay;
};

// initProjectAnimations() — shared scroll-triggered animations for all project pages.
// Covers: overview title, section titles, meta items, body text, and images.
window.initProjectAnimations = function () {
  const WORD_STAGGER = 55;
  const LINE_STAGGER = 65;

  function watchOnce(target, cb, threshold) {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { cb(); obs.unobserve(target); }
    }, { threshold: threshold || 0.1 });
    obs.observe(target);
  }

  // ── Overview title: word-by-word on load ──────────────────
  const overviewTitle = document.querySelector('.pp-overview-title');
  if (overviewTitle) splitWords(overviewTitle, 80);

  // ── Section titles: word-by-word on scroll ────────────────
  function splitWordsScroll(el) {
    el.style.opacity = '';
    let d = 0;
    el.innerHTML = el.textContent.split(/(\s+)/).map(part => {
      if (/^\s+$/.test(part)) return part;
      const delay = d; d += WORD_STAGGER;
      return `<span class="word" style="animation-delay:${delay}ms">${part}</span>`;
    }).join('');
  }
  document.querySelectorAll('.pp-section-title').forEach(title => {
    title.style.opacity = '0';
    watchOnce(title, () => splitWordsScroll(title), 0.5);
  });

  // ── Meta items: staggered fade ────────────────────────────
  document.querySelectorAll('.pp-meta-item').forEach((item, i) => {
    item.style.opacity = '0'; item.style.transform = 'translateY(6px)';
    watchOnce(item, () => {
      item.classList.add('para-animate');
      item.style.animationDelay = (i * 60) + 'ms';
      item.style.opacity = ''; item.style.transform = '';
    }, 0.5);
  });

  // ── Fallback .reveal for elements not handled below ──────
  // (badges, quotes, store links, carousels, etc.)
  (function () {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  })();

  // ── Body text: per-line reveal ────────────────────────────
  function markWords(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.split(/(\s+)/).map(p =>
        /^\s+$/.test(p) ? p : `<span class="lw">${p}</span>`
      ).join('');
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const inner = Array.from(node.childNodes).map(markWords).join('');
      const attrs = Array.from(node.attributes).map(a => `${a.name}="${a.value}"`).join(' ');
      const tag = node.tagName.toLowerCase();
      return `<${tag}${attrs ? ' ' + attrs : ''}>${inner}</${tag}>`;
    }
    return '';
  }
  function detectLines(el) {
    el.innerHTML = Array.from(el.childNodes).map(markWords).join('');
    const spans = el.querySelectorAll('.lw');
    const lines = []; let lastTop = -9999;
    spans.forEach(span => {
      const top = Math.round(span.getBoundingClientRect().top);
      if (Math.abs(top - lastTop) > 3) { lines.push([]); lastTop = top; }
      lines[lines.length - 1].push(span);
    });
    return lines;
  }
  function revealLines(lines, startDelay) {
    lines.forEach((lineSpans, i) => {
      const d = startDelay + i * LINE_STAGGER;
      lineSpans.forEach(span => {
        span.style.transition =
          `opacity 480ms cubic-bezier(0.22,1,0.36,1) ${d}ms,` +
          `transform 480ms cubic-bezier(0.22,1,0.36,1) ${d}ms`;
        span.style.opacity = '1'; span.style.transform = 'translateY(0)';
      });
    });
    return startDelay + lines.length * LINE_STAGGER;
  }
  document.querySelectorAll('.pp-text, .pp-section-desc').forEach(block => {
    const els = Array.from(block.querySelectorAll('p, li'));
    if (!els.length) return;
    // Make the block itself immediately visible — only child spans will animate
    block.style.opacity = '1';
    block.style.transform = 'none';
    const elLines = els.map(el => detectLines(el));
    block.querySelectorAll('.lw').forEach(s => {
      s.style.opacity = '0'; s.style.transform = 'translateY(7px)';
    });
    watchOnce(block, () => {
      let delay = 0;
      elLines.forEach(lines => { delay = revealLines(lines, delay); });
    }, 0.08);
  });

  // ── Images: imgReveal keyframe on scroll ──────────────────
  function prepImg(el, delayMs) {
    el.style.opacity = '0';
    return function () {
      // Add .visible so .reveal transition doesn't fight the keyframe animation
      el.classList.add('visible');
      el.style.animation = `imgReveal 800ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms both`;
      el.style.opacity = '';
    };
  }
  const cover = document.querySelector('.pp-cover');
  if (cover) watchOnce(cover, prepImg(cover, 0), 0.2);

  document.querySelectorAll('.pp-img-full, .pp-youtube, .pp-text-gif, .pp-quote').forEach(el =>
    watchOnce(el, prepImg(el, 0), 0.08)
  );
  document.querySelectorAll('.pp-img-pair').forEach(pair => {
    const triggers = Array.from(pair.querySelectorAll('.pp-img-pair-item')).map((el, i) => prepImg(el, i * 120));
    watchOnce(pair, () => triggers.forEach(fn => fn()), 0.08);
  });
  document.querySelectorAll('.pp-carousel').forEach(el => watchOnce(el, prepImg(el, 0), 0.08));
};

/* ─── Scroll progress bar (project detail pages) ─────── */
(function () {
  if (!document.querySelector('.pp-content')) return;

  var track = document.createElement('div');
  track.className = 'scroll-progress';
  var bar = document.createElement('div');
  bar.className = 'scroll-progress-bar';
  track.appendChild(bar);
  document.body.appendChild(track);

  function update() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
    bar.style.transform = 'scaleX(' + progress + ')';
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
})();
