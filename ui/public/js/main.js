gsap.registerPlugin(Draggable, InertiaPlugin, ScrollTrigger, SplitText, CustomEase, Observer);
barba.use(barbaPrefetch);
barbaPrefetch.init();

// —————— GLOBAL STUFF —————— //
let lenis;
let staggerDefault = 0.05;
let durationDefault = 0.6;
let MM = gsap.matchMedia();
let prefersRM = prefersReducedMotion();
let prevWidth = window.innerWidth;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const has = (s, r = document) => !!$(s, r);

history.scrollRestoration = "manual";

CustomEase.create("osmo", "0.625, 0.05, 0, 1");
gsap.defaults({ ease: "osmo", duration: durationDefault });

// Sitemap Data
window.__sitemapBuilt = false;
window.sitemap = null;

// —————— BARBA SETUP —————— //

barba.hooks.leave((data) => {
  setThemeFromSlug(data);
  window.closeAllModals();
  lenis.stop();
});

barba.hooks.afterLeave((data) => {
  lenis.destroy();
  ScrollTrigger.getAll().forEach(t => t.kill());
  if (window.cleanupOnLeave) cleanupOnLeave();
});

barba.hooks.beforeEnter((data) => {
  buildSitemapOnce();
  initPageVisibility();
  initDisposables();
  initObserverHub();
  initLenis();
  initScriptsBeforeEnter();
  // Pixel transition: overlay the incoming page on top of the current one so
  // the clip-path wipe reveals it in the viewport.
  // the clip-path wipe reveals it in the viewport. z-index keeps it above the
  // outgoing page's content but below the nav (100) and pixels (transition, 100).
  gsap.set(data.next.container, { position: "fixed", top: 0, left: 0, right: 0, zIndex: 60 });
  if (lenis && typeof lenis.stop === "function") lenis.stop();
});

barba.hooks.enter((data) => {
  initBarbaNavUpdate(data);
});

barba.hooks.afterEnter((data) => {
  initScriptsAfterEnter();
});

barba.init({
  sync: true,
  debug: false,
  timeout: 7000,
  preventRunning: true,
  prevent: ({ el }) => {
    return el.getAttribute("data-barba-p") === "true";
  },
  transitions: [
    {
      name: 'self',
      sync: true,
      async leave(data) {
        await runPageLeaveAnimation(data.current.container, data.next.container);
      },
      async enter(data) {
        await runPageEnterAnimation(data.next.container);
      }
    },
    {
      name: 'default',
      sync: true,
      once(data) {
        initBasicFunctionsOnce();
        runPageOnceAnimation();
        // beforeEnter fires on `once` too and pins the container fixed; clear it
        // so first load isn't pinned (mirrors apps/landing's once → resetPage).
        resetPage(data.next.container);
      },
      async leave(data) {
        await runPageLeaveAnimation(data.current.container, data.next.container);
      },
      async enter(data) {
        await runPageEnterAnimation(data.next.container);
      }
    }]
});

function setThemeFromSlug(data) {

  const darkParents = [
    'product',
    'plans'
  ];
  const darkPaths = new Set([
    'no-access',
    'logged-out',
    'newsletter',
    'request-lifetime-copy-v1',
    'request-lifetime-copy-v2',
    'login',
    'try'
  ]);

  const link = data.trigger?.closest?.('a[href]');
  const href = link ? link.href : data.next?.url?.pathname || '/';
  const path = new URL(href, location.origin).pathname.replace(/^\/+|\/+$/g, '');
  const parent = path.split('/')[0];
  const theme = darkPaths.has(path) || darkParents.includes(parent) ? 'dark' : 'light';

  document.querySelector('.transition')?.setAttribute('data-transition-theme', theme);
  document.querySelector('.nav')?.setAttribute('data-nav-theme', theme);
}

function initPageVisibility() {
  if (window.__pageVisibilityInit) return;
  window.__pageVisibilityInit = true;

  let wasRunning = false;

  function pauseAll() {
    // pause Lenis + GSAP ticker only if active
    if (window.lenis && !window.lenis.__osmoPaused && window.lenis.stop) {
      window.lenis.stop();
      wasRunning = true;
    } else {
      wasRunning = false;
    }
    gsap.ticker.sleep();
  }

  function resumeAll() {
    gsap.ticker.wake();
    if (wasRunning && window.lenis && !window.lenis.__osmoPaused && window.lenis.start) {
      window.lenis.start();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAll();
    } else {
      requestAnimationFrame(() => {
        if (window.lenis && window.lenis.resize) window.lenis.resize();
        ScrollTrigger.refresh();
        resumeAll();
      });
    }
  });
}

function initDisposables() {
  if (window.__disposablesInit) return;
  window.__disposablesInit = true;

  const bin = [];

  // use this to register anything that needs cleanup
  window.addDisposable = fn => {
    if (typeof fn === 'function') bin.push(fn);
    return fn;
  };

  // call this once on Barba leave
  window.cleanupOnLeave = () => {
    for (let i = 0; i < bin.length; i++) {
      try { bin[i](); } catch (_) { }
    }
    bin.length = 0;
  };
}

function initObserverHub() {
  if (window.__observerHubInit) return;
  window.__observerHubInit = true;

  const hub = new Map();

  function keyOf(opts = {}) {
    const t = Array.isArray(opts.threshold) ? opts.threshold.join(',') : (opts.threshold ?? 0);
    const r = opts.rootMargin ?? '0px 0px 0px 0px';
    return JSON.stringify({ t, r });
  }

  function makeObserver(opts) {
    return new IntersectionObserver((entries) => {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const list = e.target.__ioCallbacks;
        if (!list) continue;
        for (let k = 0; k < list.length; k++) list[k](e);
      }
    }, opts);
  }

  window.getObserver = function (options = {}) {
    const key = keyOf(options);
    if (hub.has(key)) return hub.get(key);
    const ob = makeObserver(options);
    hub.set(key, ob);
    return ob;
  };

  // main helper
  window.observeWith = function (el, options = {}, cb) {
    if (!el || typeof cb !== 'function') return () => { };
    const ob = getObserver(options);
    el.__ioCallbacks = el.__ioCallbacks || [];
    el.__ioCallbacks.push(cb);
    ob.observe(el);

    const off = () => {
      if (el.__ioCallbacks)
        el.__ioCallbacks = el.__ioCallbacks.filter(fn => fn !== cb);
      try { ob.unobserve(el); } catch (_) { }
    };

    // ✅ register cleanup automatically
    return (window.addDisposable ? window.addDisposable(off) : off);
  };
}

// —————— PAGE TRANSITION AND LOADERS —————— //

function runPageOnceAnimation() {
  const tl = gsap.timeline();

  tl.call(function () {
    lenis.stop();
    lenis.scrollTo(0, { immediate: true });
  }, null, 0);

  tl.set(".nav", {
    autoAlpha: 1
  });

  tl.from(".nav-bar", {
    yPercent: -125,
    ease: "Expo.out",
    duration: 1
  }, "0.25");

  tl.call(function () {
    lenis.resize();
    lenis.start();
    ScrollTrigger.refresh();
  }, null, 0.25);
}

// —————— PIXEL PAGE TRANSITION (ported verbatim from apps/landing) —————— //
const pixelHorizontalAmount = 12;
const transitionDuration = 1;
const pixelFadeDuration = 0.2;
const pixelOverlap = 0.3;

const rmMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = rmMQ.matches;
rmMQ.addEventListener?.("change", (e) => (reducedMotion = e.matches));

function pixelGrid(isPortrait) {
  const panel = document.querySelector("[data-transition-panel]");
  if (!panel) return;

  const rect = panel.getBoundingClientRect();
  panel.style.flexDirection = isPortrait ? "column" : "row";

  const lineSizePx = isPortrait ? rect.height / pixelHorizontalAmount : rect.width / pixelHorizontalAmount;
  const crossAmount = Math.ceil((isPortrait ? rect.width : rect.height) / lineSizePx);

  let lines = panel.querySelectorAll("[data-transition-col]");
  const lineTemplate = lines[0];
  const pixelTemplate = lineTemplate.querySelector("[data-transition-pixel]");

  if (lines.length !== pixelHorizontalAmount) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < pixelHorizontalAmount; i++) {
      frag.appendChild(lineTemplate.cloneNode(false));
    }
    panel.replaceChildren(frag);
    lines = panel.querySelectorAll("[data-transition-col]");
  }

  lines.forEach((line) => {
    line.style.flexDirection = isPortrait ? "row" : "column";
    line.style.flex = "1 1 auto";
    line.style.justifyContent = "center";

    const diff = crossAmount - line.childElementCount;

    if (diff > 0) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < diff; i++) {
        frag.appendChild(pixelTemplate.cloneNode(true));
      }
      line.appendChild(frag);
    } else if (diff < 0) {
      for (let i = diff; i < 0; i++) {
        line.lastElementChild.remove();
      }
    }
  });
}

function runPageLeaveAnimation(current, next) {
  closeNavigation();

  const tl = gsap.timeline();

  if (reducedMotion) {
    tl.set(current, { autoAlpha: 0 });
    const curInner = current.querySelector(".under-nav-bar__inner");
    if (curInner) tl.set(curInner, { autoAlpha: 0 });
    tl.call(() => current.remove(), undefined, 0);
    return tl;
  }

  const underNavInner = current.querySelector(".under-nav-bar__inner");
  if (underNavInner) {
    tl.to(underNavInner, { y: "-2em", scale: 0.975, autoAlpha: 0, duration: 0.4 }, 0);
  }

  const isPortrait = window.innerHeight > window.innerWidth;
  pixelGrid(isPortrait);

  const transitionWrap = document.querySelector("[data-transition-wrap]");
  const transitionPanel = transitionWrap.querySelector("[data-transition-panel]");
  const lines = Array.from(transitionPanel.querySelectorAll("[data-transition-col]"));
  const allPixels = transitionPanel.querySelectorAll("[data-transition-pixel]");

  const overlap = Math.max(0, Math.min(1, pixelOverlap));
  const clipFrom = isPortrait ? "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)" : "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)";
  const clipTo = isPortrait
    ? "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)"
    : "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
  const clipStart = Math.min(pixelFadeDuration, transitionDuration * 0.5);
  const clipDuration = Math.max(0.001, transitionDuration - 2 * clipStart);
  const stepDur = clipDuration / Math.max(1, pixelHorizontalAmount);
  const transitionEndDelay = transitionDuration / Math.max(1, pixelHorizontalAmount);

  gsap.set(allPixels, { opacity: 0, willChange: "opacity" });
  gsap.set(transitionPanel, { opacity: 1, willChange: "opacity" });

  gsap.set(next, {
    autoAlpha: 1,
    clipPath: clipFrom,
    webkitClipPath: clipFrom,
    willChange: "clip-path",
    force3D: true,
    maxHeight: "100dvh"
  });

  lines.forEach((line, i) => {
    const pixels = Array.from(line.querySelectorAll("[data-transition-pixel]"));
    if (!pixels.length) return;

    const revealTime = clipStart + i * stepDur;
    const fillStart = Math.max(0, revealTime - pixelFadeDuration);
    const fadeStart = Math.min(transitionDuration, revealTime + stepDur);
    const perPixelMin = pixelFadeDuration / pixels.length;
    const perPixelDur = perPixelMin * (1 - overlap) + pixelFadeDuration * overlap;
    const spread = Math.max(0, pixelFadeDuration - perPixelDur);

    tl.to(pixels, {
      opacity: 1,
      duration: Math.max(0.001, perPixelDur),
      ease: "none",
      stagger: { amount: spread, from: "random" }
    }, fillStart);

    tl.to(pixels, {
      opacity: 0,
      duration: Math.max(0.001, perPixelDur),
      ease: "none",
      stagger: { amount: spread, from: "random" }
    }, fadeStart);
  });

  tl.to(next, {
    clipPath: clipTo,
    webkitClipPath: clipTo,
    ease: `steps(${pixelHorizontalAmount}, start)`,
    duration: clipDuration
  }, clipStart);

  tl.set(next, { clearProps: "clipPath,webkitClipPath,willChange,force3D,maxHeight" }, clipStart + clipDuration);

  tl.call(() => {
    current.remove();
  }, undefined, transitionDuration + transitionEndDelay);

  tl.set(allPixels, { clearProps: "willChange" }, transitionDuration + transitionEndDelay);
  tl.set(transitionPanel, { clearProps: "willChange" }, transitionDuration + transitionEndDelay);

  return tl;
}

function runPageEnterAnimation(next) {
  const tl = gsap.timeline();
  const transitionEndDelay = transitionDuration / Math.max(1, pixelHorizontalAmount);

  if (reducedMotion) {
    tl.set(next, { autoAlpha: 1 });
    tl.add("pageReady");
    tl.call(resetPage, [next], "pageReady");
    return new Promise((resolve) => tl.call(() => resolve(), undefined, "pageReady"));
  }

  tl.add("pageReady", transitionDuration + transitionEndDelay);
  tl.call(resetPage, [next], "pageReady");

  return new Promise((resolve) => {
    tl.call(() => resolve(), undefined, "pageReady");
  });
}

function resetPage(container) {
  window.scrollTo(0, 0);
  if (container) gsap.set(container, { clearProps: "position,top,left,right,zIndex" });

  if (lenis) {
    lenis.resize();
    lenis.start();
  }
  ScrollTrigger.refresh();
}

// —————— INIT EVERYTHING —————— //
function initScriptsBeforeEnter() {
  initBasicFunctions();
  initDetectScrollingDirection();
  if (has('[data-theme-section]')) initCheckSectionThemeScroll();
  if (has('[data-button-rotate]')) initRotateButtonsCalc();
  if (has('[data-button-rotate-hover]')) initRotateButtonsAnim();
  if (has('[data-bunny-thumbnail-init]')) initBunnyThumbnail();
  if (has('[data-radial-marquee]')) initRadialMarquee(); // Need to be before initLazyVideos()
  if (has('[data-video-lazy]')) initLazyVideos();
  if (has('[data-css-marquee="auto"]')) initCSSMarquee();
  if (has('[data-res-used-update]')) initResourcesUsed();
  if (has('[data-css-index-group]')) initCssIndexing();
  if (has('[data-footer-logo-wrap]')) initFooterScroll();
}

function initScriptsAfterEnter() {
  if (has('[data-vertical-slider]')) initVerticalSlider();
  if (has('[data-accordion-css-init]')) initAccordionCSS();
  if (has('[data-pricing-section-status]')) initPricingSection();
  if (has('[data-modal-wrap]')) initModals();
  if (has('[data-about-intro-card]')) initAboutCardAnimation();
  if (has('[data-rotate-wrap]')) initRotatingLayers();
  if (has('[data-form-validate]')) initAdvancedFormValidation();
  if (has('[data-faq-toggle]')) initFAQs();
  if (has('[data-flick-cards-init]')) initFlickCards();
  if (has('[data-bunny-player-init]')) initBunnyPlayer();
  if (has('[data-gsap-slider-init]')) initOsmoSlider();
  if (has('[data-404-trail]')) init404();
  if (has('[data-app-wrap]')) initIconAppAnimation();
  if (has('[data-cursor-zone]')) initBasicCustomCursor();
  if (has('[data-current-year]')) initDynamicCurrentYear();
  if (has('[data-playful-cards-wrap]')) initPlayfulCardsReveal();

  lenis.resize();
  ScrollTrigger.refresh();
}

// —————— GLOBAL FUNCTIONS —————— //

function initLenis() {

  lenis = new Lenis({
    lerp: 0.165,
    wheelMultiplier: 1.25,
    prevent: (element) => {
      if (element.closest('.o--Widget--widget')) return true;
      return false;
    }
  });

  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });

  window.lenis = lenis;

  // gsap.ticker.lagSmoothing(0);
  gsap.ticker.lagSmoothing(500, 33)
}

function prefersReducedMotion() {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  return query.matches;
}

function debounceOnWidthChange(fn, ms) {
  let last = innerWidth,
    timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (innerWidth !== last) {
        last = innerWidth;
        fn.apply(this, args);
      }
    }, ms);
  };
}

function initBarbaNavUpdate(data) {
  var tpl = document.createElement('template');
  tpl.innerHTML = data.next.html.trim();
  var nextNodes = tpl.content.querySelectorAll('[data-barba-update]');
  var currentNodes = document.querySelectorAll('nav [data-barba-update]');

  currentNodes.forEach(function (curr, index) {
    var next = nextNodes[index];
    if (!next) return;

    // Aria-current sync
    var newStatus = next.getAttribute('aria-current');
    if (newStatus !== null) {
      curr.setAttribute('aria-current', newStatus);
    } else {
      curr.removeAttribute('aria-current');
    }

    // Class list sync
    var newClassList = next.getAttribute('class') || '';
    curr.setAttribute('class', newClassList);
  });
}

function initDynamicCurrentYear() {
  const currentYear = new Date().getFullYear();
  const currentYearElements = document.querySelectorAll('[data-current-year]');
  currentYearElements.forEach(currentYearElement => {
    currentYearElement.textContent = currentYear;
  });
}

function initBasicCustomCursor() {
  const cursor = document.querySelector('.cursor');
  if (!cursor) return;

  gsap.set(cursor, { xPercent: -50, yPercent: -50 });
  const xTo = gsap.quickTo(cursor, 'x', { duration: 0.3, ease: 'power3' });
  const yTo = gsap.quickTo(cursor, 'y', { duration: 0.3, ease: 'power3' });

  const zones = document.querySelectorAll('[data-cursor-zone]');
  if (!zones.length) return;

  const track = e => {
    xTo(e.clientX);
    yTo(e.clientY);
  };

  zones.forEach(zone => {
    const onEnter = e => {
      // if we landed without a pointer event, fall back to zone center
      const r = zone.getBoundingClientRect();
      const cx = e && e.clientX || r.left + r.width / 2;
      const cy = e && e.clientY || r.top + r.height / 2;
      gsap.set(cursor, { x: cx, y: cy });
      zone.addEventListener('pointermove', track, { passive: true });
    };

    const onLeave = () => {
      zone.removeEventListener('pointermove', track);
    };

    zone.addEventListener('pointerenter', onEnter);
    zone.addEventListener('pointerleave', onLeave);

    if (typeof addDisposable === 'function') {
      addDisposable(() => {
        zone.removeEventListener('pointerenter', onEnter);
        zone.removeEventListener('pointerleave', onLeave);
        zone.removeEventListener('pointermove', track);
      });
    }

    // Page transition landed with the pointer already inside this zone
    if (zone.matches(':hover')) onEnter(null);
  });
}

function initLazyVideos() {
  if (typeof initLazyVideos._supportsHover === 'undefined') {
    initLazyVideos._supportsHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  const vids = document.querySelectorAll('[data-video-lazy]');
  vids.forEach(v => {
    const src = (v.dataset.videoSrc || '').trim();
    if (!src) return;

    // initial state mirrors your original
    if (!v.dataset.videoStatus) v.dataset.videoStatus = 'not-loaded';
    if (v.getAttribute('src') === null) v.setAttribute('src', '');

    const wantsHover = (v.getAttribute('data-video-lazy') || '').toLowerCase() === 'hover';
    const hoverCapable = initLazyVideos._supportsHover;
    v.__hoverMode = !!(wantsHover && hoverCapable);

    // one-time hydration helper
    if (!v.__startHydration) {
      v.__startHydration = function () {
        if (this.__hydrating || this.__hydrated) return;
        const s = this.dataset.videoSrc;
        if (!s) return;

        this.__hydrating = true;
        this.muted = true;
        this.playsInline = true;
        this.preload = 'metadata';
        if (!this.getAttribute('src')) this.setAttribute('src', s);
        try { this.load(); } catch (_) { }

        const done = () => {
          this.removeEventListener('loadeddata', done);
          this.removeEventListener('canplay', done);
          this.dataset.videoStatus = 'loaded';
          this.__hydrating = false;
          this.__hydrated = true;
        };
        this.addEventListener('loadeddata', done);
        this.addEventListener('canplay', done);
      };
    }

    // HOVER MODE
    if (v.__hoverMode) {
      if (!v.__hoverBound) {
        const hoverEl = v.closest('[data-video-lazy-hover]') || v;

        const onEnter = () => {
          if (v.__hoverLeaveTO) {
            clearTimeout(v.__hoverLeaveTO);
            v.__hoverLeaveTO = 0;
          }
          if (!v.__hydrated) v.__startHydration && v.__startHydration();
          if (!v.getAttribute('src')) v.setAttribute('src', src);
          v.dataset.videoStatus = 'loaded';
          try { v.currentTime = 0; } catch (_) { }
          try { v.play(); } catch (_) { }
        };

        const onLeave = () => {
          v.dataset.videoStatus = 'not-loaded';
          v.__hoverLeaveTO = setTimeout(() => {
            try { v.pause(); } catch (_) { }
            try { v.currentTime = 0; } catch (_) { }
            v.__hoverLeaveTO = 0;
          }, 200);
        };

        hoverEl.addEventListener('mouseenter', onEnter);
        hoverEl.addEventListener('mouseleave', onLeave);
        v.__hoverBound = true;

        // cleanup
        if (window.addDisposable) {
          addDisposable(() => {
            hoverEl.removeEventListener('mouseenter', onEnter);
            hoverEl.removeEventListener('mouseleave', onLeave);
            if (v.__hoverLeaveTO) {
              clearTimeout(v.__hoverLeaveTO);
              v.__hoverLeaveTO = 0;
            }
          });
        }
      }

      // optional safety: pause if not in viewport
      const unobs = observeWith(v, { threshold: 0 }, (entry) => {
        if (!entry.isIntersecting) { try { v.pause(); } catch (_) { } }
      });
      if (window.addDisposable) addDisposable(unobs);
      return;
    }

    // IN-VIEW MODE
    // Single observer handles both hydrate-on-enter and play/pause
    const unobserve = observeWith(v, { threshold: 0.15 }, (entry) => {
      if (entry.isIntersecting) {
        if (!v.__hydrated) v.__startHydration && v.__startHydration();
        v.dataset.videoStatus = 'loaded';
        try { v.play(); } catch (_) { }
      } else {
        try { v.pause(); } catch (_) { }
      }
    });

    if (window.addDisposable) addDisposable(unobserve);

    // If already flagged loaded from previous page state, ensure observing kicks in
    if (v.dataset.videoStatus === 'loaded' && !v.__hydrated) {
      v.__startHydration && v.__startHydration();
    }
  });
}

// —————— OTHER FUNCTIONS —————— //

function initBasicFunctionsOnce() {

  // Made for basic functions outside the main

  // Toggle Navigation
  document.querySelectorAll('[data-nav-toggle="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-nav-status]').forEach(h => {
        let active = h.getAttribute('data-nav-status') === 'active';
        let state = active ? 'not-active' : 'active';
        h.setAttribute('data-nav-status', state);
        if (lenis) state === 'active' ? lenis.stop() : lenis.start();
      });
    });
  });

  // Close Navigation
  document.querySelectorAll('[data-nav-toggle="close"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      closeNavigation();
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      closeNavigation();
    }
  });
}

function closeNavigation() {
  document.querySelectorAll('[data-nav-status]').forEach(function (h) {
    h.setAttribute('data-nav-status', 'not-active');
    lenis.start();
  });
}

function initBasicFunctions() {
  // Made for basic functions inside the main
  document.querySelectorAll('[data-resources-total]').forEach(el => {
    el.textContent = sitemap?.total || 0;
  });

  document.querySelectorAll('[data-updates-date]').forEach(el => {
    const date = el.getAttribute('data-updates-date') || '';
    el.textContent = getTimeAgoText(date);
  });

  document.querySelectorAll('[data-resources-date]').forEach(el => {
    const date = el.getAttribute('data-resources-date') || '';
    const target = el.classList.contains('tag') ? el.querySelector('.eyebrow') : el;
    if (target) target.textContent = getTimeAgoText(date);
  });

  document.querySelectorAll('[data-resources-date-copycat]').forEach(copycat => {
    const first = document.querySelector('[data-resources-date]');
    if (!first) return;
    const text = first.classList.contains('tag') ?
      first.querySelector('.eyebrow')?.textContent || '' :
      first.textContent;
    copycat.textContent = text;
  });

  function initMarketingThemeCheck() {
    // Toggle Dark/Light
    var holders = document.querySelectorAll('[data-marketing-theme]');
    holders.forEach(function (h) {
      var cur = h.getAttribute('data-marketing-theme');
      if (cur == 'light') {
        h.setAttribute('data-marketing-theme', 'dark');
      } else {
        h.setAttribute('data-marketing-theme', 'light');
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    // Prevent action if typing in an input or textarea
    var tagName = e.target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || e.target.isContentEditable) {
      return; // Exit early
    }
    // Dash Dark/Light
    if (e.shiftKey && e.keyCode === 84) {
      e.preventDefault();
      initMarketingThemeCheck();
    }
  });

  document.querySelectorAll('[data-marketing-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      initMarketingThemeCheck();
    });
  });

}

function isInsideBarbaContainer(node) {
  return !!(node && node.closest && node.closest('[data-barba="container"]'));
}

function initRotateButtonsCalc() {
  const btns = document.querySelectorAll('[data-button-rotate]');
  const yk = 30;

  const has = (el, a, t) => (el.getAttribute(a) || '').toLowerCase().split(/\s+/).includes(t);
  const respFull = b =>
    (has(b, 'data-responsive', 'mobile') && innerWidth <= 479) ||
    (has(b, 'data-responsive', 'landscape') && innerWidth <= 767) ||
    (has(b, 'data-responsive', 'tablet') && innerWidth <= 991);

  const maxChars = b =>
    Math.max(...[...b.querySelectorAll('.button-label')]
      .map(l => (l.textContent || '').trim().length || 0), 0);

  const yFromChars = c => Math.round(100 + yk * (12 + 6 * c));

  const update = b => {
    const c = maxChars(b);
    let y = yFromChars(c);
    if (b.dataset.size === 'full' || respFull(b)) y *= 3;
    y = Math.max(100, Math.min(y, 10000));
    b.style.setProperty('--y', y + '%');
  };

  // one global resize binder
  if (!window._rotateButtonsCalcResizeAttached) {
    const handler = debounceOnWidthChange(() => {
      document.querySelectorAll('[data-button-rotate]').forEach(update);
    }, 200);
    addEventListener('resize', handler);
    window._rotateButtonsCalcResizeAttached = true;
  }

  // per-button observer so we can dispose only container elements
  btns.forEach(b => {
    const labels = b.querySelectorAll('.button-label');
    if (!labels.length) return;

    update(b);

    if (b._rotCalcObserver) {
      try { b._rotCalcObserver.disconnect(); } catch (_) { }
      b._rotCalcObserver = null;
    }

    const mo = new MutationObserver(ms => {
      let touched = false;
      ms.forEach(m => {
        const tgt = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        if (tgt && b.contains(tgt)) touched = true;
      });
      if (touched) update(b);
    });
    labels.forEach(l => mo.observe(l, { characterData: true, subtree: true, childList: true }));
    b._rotCalcObserver = mo;

    // fonts ready can shift metrics
    document.fonts?.ready?.then(() => update(b));

    // only container elements get disposed by Barba
    if (window.addDisposable && isInsideBarbaContainer(b)) {
      addDisposable(() => {
        try { b._rotCalcObserver?.disconnect(); } catch (_) { }
        b._rotCalcObserver = null;
      });
    }
  });
}

function initRotateButtonsAnim() {
  const els = document.querySelectorAll('[data-button-rotate-hover]');
  if (!els.length || typeof gsap === 'undefined') return;

  els.forEach(el => {
    const root = el.closest('[data-button-rotate]') || el.closest('.button') || el.closest(
      'button.tag') || el.closest('.square-button') || el;
    const trigger = el.closest('[data-hover]') || el;
    const insideContainer = isInsideBarbaContainer(root || el);

    if (el._rotDisposed) {
      el._rotBound = false;
      el._rotDisposed = false;
    }
    if (el._rotBound) return;
    el._rotBound = true;

    let lastTs = 0;
    const COOLDOWN = 100;

    const run = () => {
      let items = root.querySelectorAll('.button-label, .button-icon');
      if (!items.length) items = [el];

      if (root._rotTl) {
        root._rotTl.kill();
        root._rotTl = null;
        gsap.set(items, { clearProps: 'rotation' });
      }

      const r = parseFloat(getComputedStyle(root).getPropertyValue('--r')) || 120;
      const isFull = root.dataset.size === 'full';
      const duration = isFull ? 0.75 : 0.5;

      root._rotTl = gsap.to(items, {
        rotation: `+=${r * 1}`,
        duration,
        ease: 'osmo',
        stagger: 0.075,
        overwrite: 'auto',
        onComplete: () => {
          gsap.set(items, { clearProps: 'rotation' });
          root._rotTl = null;
        }
      });
    };

    const canTrigger = () => {
      const now = performance.now();
      if (now - lastTs < COOLDOWN) return false;
      lastTs = now;
      return true;
    };

    const onEnter = () => { if (canTrigger()) run(); };
    const onLeave = () => { canTrigger(); };

    trigger.addEventListener('pointerenter', onEnter);
    trigger.addEventListener('pointerleave', onLeave);

    if (window.addDisposable && insideContainer) {
      addDisposable(() => {
        try {
          trigger.removeEventListener('pointerenter', onEnter);
          trigger.removeEventListener('pointerleave', onLeave);
          if (root._rotTl) {
            root._rotTl.kill();
            root._rotTl = null;
          }
        } catch (_) { }
        el._rotBound = false;
        el._rotDisposed = true;
      });
    }
  });
}

function initAdvancedFormValidation() {
  const forms = document.querySelectorAll('[data-form-validate]');

  forms.forEach((formContainer) => {
    const startTime = new Date().getTime();

    const form = formContainer.querySelector('form');
    if (!form) return;

    const validateFields = form.querySelectorAll('[data-validate]');
    const dataSubmit = form.querySelector('[data-submit]');
    if (!dataSubmit) return;

    const realSubmitInput = dataSubmit.querySelector('input[type="submit"]');
    if (!realSubmitInput) return;

    function isSpam() {
      const currentTime = new Date().getTime();
      return currentTime - startTime < 5000;
    }

    // Disable select options with invalid values on page load
    validateFields.forEach(function (fieldGroup) {
      const select = fieldGroup.querySelector('select');
      if (select) {
        const options = select.querySelectorAll('option');
        options.forEach(function (option) {
          if (
            option.value === '' ||
            option.value === 'disabled' ||
            option.value === 'null' ||
            option.value === 'false'
          ) {
            option.setAttribute('disabled', 'disabled');
          }
        });
      }
    });

    function validateAndStartLiveValidationForAll() {
      let allValid = true;
      let firstInvalidField = null;

      validateFields.forEach(function (fieldGroup) {
        const input = fieldGroup.querySelector('input, textarea, select');
        const radioCheckGroup = fieldGroup.querySelector('[data-radiocheck-group]');
        if (!input && !radioCheckGroup) return;

        if (input) input.__validationStarted = true;
        if (radioCheckGroup) {
          radioCheckGroup.__validationStarted = true;
          const inputs = radioCheckGroup.querySelectorAll(
            'input[type="radio"], input[type="checkbox"]');
          inputs.forEach(function (input) {
            input.__validationStarted = true;
          });
        }

        updateFieldStatus(fieldGroup);

        if (!isValid(fieldGroup)) {
          allValid = false;
          if (!firstInvalidField) {
            firstInvalidField = input || radioCheckGroup.querySelector('input');
          }
        }
      });

      if (!allValid && firstInvalidField) {
        firstInvalidField.focus();
      }

      return allValid;
    }

    function isValid(fieldGroup) {
      const radioCheckGroup = fieldGroup.querySelector('[data-radiocheck-group]');
      if (radioCheckGroup) {
        const inputs = radioCheckGroup.querySelectorAll(
          'input[type="radio"], input[type="checkbox"]');
        const checkedInputs = radioCheckGroup.querySelectorAll('input:checked');
        const min = parseInt(radioCheckGroup.getAttribute('min')) || 1;
        const max = parseInt(radioCheckGroup.getAttribute('max')) || inputs.length;
        const checkedCount = checkedInputs.length;

        if (inputs[0].type === 'radio') {
          return checkedCount >= 1;
        } else {
          if (inputs.length === 1) {
            return inputs[0].checked;
          } else {
            return checkedCount >= min && checkedCount <= max;
          }
        }
      } else {
        const input = fieldGroup.querySelector('input, textarea, select');
        if (!input) return false;

        let valid = true;
        const min = parseInt(input.getAttribute('min')) || 0;
        const max = parseInt(input.getAttribute('max')) || Infinity;
        const value = input.value.trim();
        const length = value.length;

        if (input.tagName.toLowerCase() === 'select') {
          if (
            value === '' ||
            value === 'disabled' ||
            value === 'null' ||
            value === 'false'
          ) {
            valid = false;
          }
        } else if (input.type === 'email') {
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          valid = emailPattern.test(value);
        } else {
          if (input.hasAttribute('min') && length < min) valid = false;
          if (input.hasAttribute('max') && length > max) valid = false;
        }

        return valid;
      }
    }

    function updateFieldStatus(fieldGroup) {
      const radioCheckGroup = fieldGroup.querySelector('[data-radiocheck-group]');
      if (radioCheckGroup) {
        const inputs = radioCheckGroup.querySelectorAll(
          'input[type="radio"], input[type="checkbox"]');
        const checkedInputs = radioCheckGroup.querySelectorAll('input:checked');

        if (checkedInputs.length > 0) {
          fieldGroup.classList.add('is--filled');
        } else {
          fieldGroup.classList.remove('is--filled');
        }

        const valid = isValid(fieldGroup);

        if (valid) {
          fieldGroup.classList.add('is--success');
          fieldGroup.classList.remove('is--error');
        } else {
          fieldGroup.classList.remove('is--success');
          const anyInputValidationStarted = Array.from(inputs).some(input => input
            .__validationStarted);
          if (anyInputValidationStarted) {
            fieldGroup.classList.add('is--error');
          } else {
            fieldGroup.classList.remove('is--error');
          }
        }
      } else {
        const input = fieldGroup.querySelector('input, textarea, select');
        if (!input) return;

        const value = input.value.trim();

        if (value) {
          fieldGroup.classList.add('is--filled');
        } else {
          fieldGroup.classList.remove('is--filled');
        }

        const valid = isValid(fieldGroup);

        if (valid) {
          fieldGroup.classList.add('is--success');
          fieldGroup.classList.remove('is--error');
        } else {
          fieldGroup.classList.remove('is--success');
          if (input.__validationStarted) {
            fieldGroup.classList.add('is--error');
          } else {
            fieldGroup.classList.remove('is--error');
          }
        }
      }
    }

    validateFields.forEach(function (fieldGroup) {
      const input = fieldGroup.querySelector('input, textarea, select');
      const radioCheckGroup = fieldGroup.querySelector('[data-radiocheck-group]');

      if (radioCheckGroup) {
        const inputs = radioCheckGroup.querySelectorAll(
          'input[type="radio"], input[type="checkbox"]');
        inputs.forEach(function (input) {
          input.__validationStarted = false;

          input.addEventListener('change', function () {
            requestAnimationFrame(function () {
              if (!input.__validationStarted) {
                const checkedCount = radioCheckGroup.querySelectorAll(
                  'input:checked').length;
                const min = parseInt(radioCheckGroup.getAttribute('min')) || 1;

                if (checkedCount >= min) {
                  input.__validationStarted = true;
                }
              }

              if (input.__validationStarted) {
                updateFieldStatus(fieldGroup);
              }
            });
          });

          input.addEventListener('blur', function () {
            input.__validationStarted = true;
            updateFieldStatus(fieldGroup);
          });
        });
      } else if (input) {
        input.__validationStarted = false;

        if (input.tagName.toLowerCase() === 'select') {
          input.addEventListener('change', function () {
            input.__validationStarted = true;
            updateFieldStatus(fieldGroup);
          });
        } else {
          input.addEventListener('input', function () {
            const value = input.value.trim();
            const length = value.length;
            const min = parseInt(input.getAttribute('min')) || 0;
            const max = parseInt(input.getAttribute('max')) || Infinity;

            if (!input.__validationStarted) {
              if (input.type === 'email') {
                if (isValid(fieldGroup)) input.__validationStarted = true;
              } else {
                if (
                  (input.hasAttribute('min') && length >= min) ||
                  (input.hasAttribute('max') && length <= max)
                ) {
                  input.__validationStarted = true;
                }
              }
            }

            if (input.__validationStarted) {
              updateFieldStatus(fieldGroup);
            }
          });

          input.addEventListener('blur', function () {
            input.__validationStarted = true;
            updateFieldStatus(fieldGroup);
          });
        }
      }
    });

    dataSubmit.addEventListener('click', function () {
      if (validateAndStartLiveValidationForAll()) {
        if (isSpam()) {
          alert('Form submitted too quickly. Please try again.');
          return;
        }
        realSubmitInput.click();
      }
    });

    form.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        if (validateAndStartLiveValidationForAll()) {
          if (isSpam()) {
            alert('Form submitted too quickly. Please try again.');
            return;
          }
          realSubmitInput.click();
        }
      }
    });
  });
}

function initAccordionCSS() {
  document.querySelectorAll('[data-accordion-css-init]').forEach((accordion) => {
    const closeSiblings = accordion.getAttribute('data-accordion-close-siblings') === 'true';

    accordion.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-accordion-toggle]');
      if (!toggle) return; // Exit if the clicked element is not a toggle

      const singleAccordion = toggle.closest('[data-accordion-status]');
      if (!singleAccordion) return; // Exit if no accordion container is found

      gsap.delayedCall(durationDefault, () => {
        lenis.resize();
        ScrollTrigger.refresh();
      })

      const isActive = singleAccordion.getAttribute('data-accordion-status') === 'active';
      singleAccordion.setAttribute('data-accordion-status', isActive ? 'not-active' :
        'active');

      // When [data-accordion-close-siblings="true"]
      if (closeSiblings && !isActive) {
        accordion.querySelectorAll('[data-accordion-status="active"]').forEach((
          sibling) => {
          if (sibling !== singleAccordion) sibling.setAttribute('data-accordion-status',
            'not-active');
        });
      }
    });
  });
}

function initDetectScrollingDirection() {
  let last = 0,
    pending = false;
  const threshold = 10,
    thresholdTop = 50;

  addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      if (Math.abs(last - y) >= threshold) {
        const started = y > thresholdTop;
        document.querySelectorAll('[data-scrolling-started]').forEach(el =>
          el.setAttribute('data-scrolling-started', started ? 'true' : 'false')
        );
        last = y;
      }
      pending = false;
    });
  }, { passive: true });
}

function initCheckSectionThemeScroll() {
  const navBarHeight = document.querySelector("[data-nav-bar-height]")
  const themeObserverOffset = navBarHeight ? navBarHeight.offsetHeight / 2 : 0;

  function checkThemeSection() {
    const themeSections = document.querySelectorAll("[data-theme-section]");

    themeSections.forEach(function (themeSection) {
      const rect = themeSection.getBoundingClientRect();
      const themeSectionTop = rect.top;
      const themeSectionBottom = rect.bottom;

      // If the offset is between the top & bottom of the current section
      if (themeSectionTop <= themeObserverOffset && themeSectionBottom >= themeObserverOffset) {
        // Check [data-theme-section]
        const themeSectionActive = themeSection.getAttribute("data-theme-section");
        document.querySelectorAll("[data-nav-theme]").forEach(function (elem) {
          if (elem.getAttribute("data-nav-theme") !== themeSectionActive) {
            elem.setAttribute("data-nav-theme", themeSectionActive);
          }
        });
      }
    });
  }

  function startThemeCheck() {
    document.addEventListener("scroll", checkThemeSection);
  }

  // Initial check and start listening for scroll
  checkThemeSection();
  startThemeCheck();
}

function initFooterScroll() {
  const logo = document.querySelector('[data-footer-logo-wrap]');
  if (!logo) return;

  const mm = gsap.matchMedia();

  mm.add("(min-width: 768px)", () => {
    const paths = Array.from(logo.querySelectorAll('path'));
    const R = 7.5,
      Y = 10;

    gsap.set(paths, { transformOrigin: "center center" });
    gsap.set(paths[0], { rotate: -6 * R, yPercent: 9 * Y });
    gsap.set(paths[1], { rotate: -3 * R, yPercent: 3.5 * Y });
    gsap.set(paths[2], { rotate: -1.5 * R, yPercent: 2 * Y });
    gsap.set(paths[4], { rotate: 1.5 * R, yPercent: 1 * Y });
    gsap.set(paths[5], { rotate: 3 * R, yPercent: 3.5 * Y });
    gsap.set(paths[6], { rotate: 6 * R, yPercent: 9 * Y });

    const tween = gsap.to(paths, {
      rotate: 0,
      yPercent: 0,
      ease: "none",
      scrollTrigger: {
        trigger: logo,
        start: "top bottom",
        endTrigger: document.body,
        end: "bottom bottom",
        scrub: true
      }
    });

    const st = tween.scrollTrigger;
    addDisposable(() => { try { st && st.kill(); } catch (_) { } });
  });

  addDisposable(() => mm.kill());
}

function initCSSMarquee() {
  const pps = 50;
  const marquees = document.querySelectorAll('[data-css-marquee="auto"]');
  marquees.forEach(marquee => {
    marquee.querySelectorAll('[data-css-marquee-list]').forEach(list => {
      const duplicate = list.cloneNode(true);
      marquee.appendChild(duplicate);
    });

    marquee.querySelectorAll('[data-css-marquee-list]').forEach(list => {
      list.style.animationDuration = (list.offsetWidth / pps) + 's';
      list.style.animationPlayState = 'paused';
    });

    observeWith(marquee, { threshold: 0 }, (entry) => {
      marquee.querySelectorAll('[data-css-marquee-list]').forEach(list => {
        list.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
      });
    });
  });
}

function initVerticalSlider() {
  const wrappers = document.querySelectorAll('[data-vertical-slider]');
  if (!wrappers.length) return;

  const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  wrappers.forEach(wrap => {
    const list = wrap.querySelector('[data-vertical-slider-list]');
    if (!list) return;

    const slides = Array.from(wrap.querySelectorAll('[data-vertical-slider-item]'));
    if (slides.length < 5) return;

    const buttonWrap = wrap.querySelector('[data-button-wrap]');
    const prevButton = wrap.querySelector('[data-prev]');
    const nextButton = wrap.querySelector('[data-next]');
    const bullets = Array.from(wrap.querySelectorAll('[data-vertical-slider-bullet]'));

    const isTestimonial = slides.some(s => s.hasAttribute('data-slide-map'));
    const isFadedSlides = wrap.hasAttribute('data-fade-slides');

    // base values
    const YD = 30,
      ZD = 20,
      RD = 60;
    const YM = 40,
      ZM = 26,
      RM = 70;

    // breakpoint + config factory
    let isMobile = window.innerWidth < 768;

    function makeConfig(isMobileMode) {
      const Y = isMobileMode ? YM : YD;
      const Z = isMobileMode ? ZM : ZD;
      const R = isMobileMode ? RM : RD;

      return {
        "-2": { x: "0em", y: `${Y}em`, z: `-${Z}em`, rx: -R, opacity: 0 },
        "-1": { x: "0em", y: `${Y}em`, z: `-${Z}em`, rx: -R, opacity: isFadedSlides ? 0 : 1 },
        "0": { x: "0em", y: "0em", z: "0em", rx: 0, opacity: 1 },
        "1": { x: "0em", y: `-${Y}em`, z: `-${Z}em`, rx: R, opacity: isFadedSlides ? 0 : 1 },
        "2": { x: "0em", y: `-${Y}em`, z: `-${Z}em`, rx: R, opacity: 0 }
      };
    }

    // mutable so we can swap on breakpoint change
    let CONFIG = makeConfig(isMobile);

    slides.forEach((s, i) => { if (!s.dataset.slideId) s.dataset.slideId = String(i); });

    let activeIndex = slides.findIndex(s => s.hasAttribute('data-initial'));
    if (activeIndex < 0) activeIndex = 0;

    let isAnimating = false;
    const dur = parseFloat(wrap.getAttribute('data-duration')) || 0.725;
    const ease = wrap.getAttribute('data-ease') || 'osmo';

    // autoplay
    const autoplayEnabled = wrap.dataset.autoplay === 'true' && !prm;
    const autoplayMs = parseInt(wrap.dataset.autoplayDuration || '0', 10) || 0;
    const indicator = wrap.querySelector('[data-autoplay-indicator]');
    const indicatorLen = indicator ? parseFloat(indicator.getAttribute('data-autoplay-indicator')) : null;
    let autoTl = null;

    // helpers
    const rel = (i, current) => {
      const t = slides.length;
      let d = ((i - current) % t + t) % t;
      if (d > Math.floor(t / 2)) d -= t;
      return Math.max(-2, Math.min(2, d));
    };

    function setActiveUI(idx) {
      slides.forEach((s, i) => {
        const on = i === idx;
        s.setAttribute('aria-hidden', on ? 'false' : 'true');
        s.tabIndex = on ? 0 : -1;
        s.style.zIndex = on ? '2' : '1';
        s.style.pointerEvents = on ? 'auto' : 'none';
      });
      bullets.forEach((b, i) => {
        const on = i === idx;
        b.setAttribute('data-vertical-slider-bullet', on ? 'active' : 'not-active');
        b.setAttribute('aria-current', on ? 'true' : 'false');
      });
      if (isTestimonial) {
        const activeSlide = slides[idx];
        const mapVal = activeSlide ? activeSlide.getAttribute('data-slide-map') : null;
        if (mapVal) {
          wrap.querySelectorAll('[data-testimonial-map]').forEach(m => {
            m.classList.toggle('is--active', m.getAttribute('data-testimonial-map') === mapVal);
          });
        }
      }
    }

    function setItemImmediate(s, cfg) {
      gsap.set(s, {
        transformOrigin: '50% 50%',
        force3D: true,
        x: cfg.x,
        y: cfg.y,
        z: cfg.z,
        rotationX: cfg.rx,
        opacity: cfg.opacity
      });
    }

    function setImmediateState(current) {
      slides.forEach((s, i) => {
        const key = String(rel(i, current));
        setItemImmediate(s, CONFIG[key]);
      });
    }

    function animateItemTo(s, cfg) {
      return gsap.to(s, {
        transformOrigin: '50% 50%',
        force3D: true,
        x: cfg.x,
        y: cfg.y,
        z: cfg.z,
        rotationX: cfg.rx,
        opacity: cfg.opacity,
        duration: dur,
        ease
      });
    }

    function renderTo(targetIndex) {
      const tweens = [];
      slides.forEach((s, i) => {
        const key = String(rel(i, targetIndex));
        const cfg = CONFIG[key];
        tweens.push(animateItemTo(s, cfg));
      });
      return tweens;
    }

    function stopAutoplay() {
      if (autoTl) {
        autoTl.kill();
        autoTl = null;
      }
      if (indicator) {
        gsap.killTweensOf(indicator);
        indicator.style.strokeDashoffset = 0;
      }
    }

    function startAutoplay() {
      if (!autoplayEnabled || !autoplayMs) return;
      stopAutoplay();
      if (indicator && indicatorLen != null) {
        gsap.set(indicator, {
          transformOrigin: '50% 50%',
          rotate: -90,
          strokeDasharray: indicatorLen,
          strokeDashoffset: 0
        });
        autoTl = gsap.to(indicator, {
          strokeDashoffset: -indicatorLen,
          transformOrigin: '50% 50%',
          ease: 'none',
          duration: autoplayMs / 1000,
          onComplete: () => goNext()
        });
      } else {
        autoTl = gsap.delayedCall(autoplayMs / 1000, () => goNext());
      }
    }

    function pauseAutoplay() { if (autoTl && autoTl.pause) autoTl.pause(); }
    function resumeAutoplay() { if (autoTl && autoTl.resume) autoTl.resume(); }

    function goTo(targetIndex) {
      if (prm) {
        activeIndex = targetIndex;
        setImmediateState(activeIndex);
        setActiveUI(activeIndex);
        return;
      }
      if (isAnimating || targetIndex === activeIndex) {
        if (autoplayEnabled) {
          stopAutoplay();
          startAutoplay();
        }
        return;
      }
      isAnimating = true;
      stopAutoplay();
      setActiveUI(targetIndex);

      const tweens = renderTo(targetIndex);
      const tl = gsap.timeline({
        onComplete: () => {
          activeIndex = targetIndex;
          isAnimating = false;
          startAutoplay();
        }
      });
      tweens.forEach(t => tl.add(t, 0));
    }

    const goNext = () => goTo((activeIndex + 1) % slides.length);
    const goPrev = () => goTo((activeIndex - 1 + slides.length) % slides.length);

    // --- RESPONSIVE HANDLING (desktop/mobile toggle) ---
    const handleResize = debounceOnWidthChange(() => {
      const newIsMobile = window.innerWidth < 768;
      if (newIsMobile === isMobile) return; // no breakpoint change, ignore

      isMobile = newIsMobile;
      CONFIG = makeConfig(isMobile);

      // update transforms to new config (no animation to avoid weird transitions)
      setImmediateState(activeIndex);
    }, 150);

    window.addEventListener('resize', handleResize);
    // --- END RESPONSIVE HANDLING ---

    // buttons
    if (prevButton) prevButton.addEventListener('click', goPrev);
    if (nextButton) nextButton.addEventListener('click', goNext);
    if (buttonWrap) {
      buttonWrap.addEventListener('mouseenter', pauseAutoplay);
      buttonWrap.addEventListener('mouseleave', resumeAutoplay);
    }

    // bullets (delegated)
    wrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-vertical-slider-bullet]');
      if (!btn || !wrap.contains(btn)) return;
      const idx = bullets.indexOf(btn);
      if (idx >= 0) goTo(idx);
    });

    // initial
    setImmediateState(activeIndex);
    setActiveUI(activeIndex);

    // visibility-driven autoplay via ScrollTrigger (plugins already loaded globally)
    const st = ScrollTrigger.create({
      trigger: wrap,
      start: 'top 80%',
      end: 'bottom top',
      onEnter: () => {
        if (autoplayEnabled && !autoTl) startAutoplay();
      },
      onEnterBack: () => {
        if (autoplayEnabled && !autoTl) startAutoplay();
      },
      onLeave: stopAutoplay,
      onLeaveBack: stopAutoplay,
    });

    // expose destroy if you need to clean up on route changes
    wrap.__destroyVerticalSlider = () => {
      stopAutoplay();
      st && st.kill();
      window.removeEventListener('resize', handleResize);
      if (prevButton) prevButton.removeEventListener('click', goPrev);
      if (nextButton) nextButton.removeEventListener('click', goNext);
      if (buttonWrap) {
        buttonWrap.removeEventListener('mouseenter', pauseAutoplay);
        buttonWrap.removeEventListener('mouseleave', resumeAutoplay);
      }
    };

    if (window.addDisposable) addDisposable(() => {
      if (wrap.__destroyVerticalSlider) wrap.__destroyVerticalSlider();
    });

  });
}

/* utils initAboutCardAnimation() and initRotatingLayers() */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pickAngles({ gap = 45, minAbs = 0, range = 180 } = {}) {
  const pick = () => {
    let a = rand(-range, range);
    while (Math.abs(a) < minAbs) a = rand(-range, range);
    return a;
  };
  let a1 = pick();
  let a2 = pick();
  let tries = 0;
  while (Math.abs(a2 - a1) < gap && tries++ < 50) a2 = pick();
  let a3 = pick();
  tries = 0;
  while (Math.abs(a3 - a2) < gap && tries++ < 50) a3 = pick();
  return [a1, a2, a3];
}

function initAboutCardAnimation() {
  const card = document.querySelector('[data-about-intro-card]');
  if (!card) return;

  const wrap = card.querySelector('[data-about-img-wrap]');
  const layers = wrap ? Array.from(wrap.querySelectorAll('[data-rotate-layer]')) : [];
  if (layers.length !== 3) return;

  const marker = wrap.querySelector('[data-rotate-marker]');
  if (!marker) return;

  const progress = card.querySelector('[data-autoplay-indicator]');
  const progressPaths = progress ? Array.from(progress.querySelectorAll('path')) : [];

  const layerImgs = layers.map(l => Array.from(l.querySelectorAll('img')).slice(0, 2));
  if (layerImgs.some(arr => arr.length < 2)) return;

  let current = 0; // 0 = dennis, 1 = ilja

  function setPersonaAll(idx) {
    layerImgs.forEach(imgs => {
      imgs.forEach((img, i) => gsap.set(img, { autoAlpha: i === idx ? 1 : 0 }));
    });
    card.setAttribute('data-about-intro-card', idx === 0 ? 'dennis' : 'ilja');
  }

  function swapPersonaOne(layerIndex, idx) {
    const imgs = layerImgs[layerIndex];
    gsap.set(imgs, { autoAlpha: i => i === idx ? 1 : 0 });
  }

  gsap.set([marker, ...layers], { transformOrigin: "50% 50%" });
  gsap.set(layers, { rotation: 0 });
  gsap.set(marker, { scale: 2 });

  const progUp = 2;
  const durationTurn = 0.75;
  const durationReset = 0.45;
  const durationMarker = 0.4;

  setPersonaAll(current);

  const tl = gsap.timeline({ repeat: -1, paused: true });

  function buildCycle() {
    const [a1, a2, a3] = pickAngles({ gap: 45, minAbs: 30, range: 180 });

    if (progressPaths.length) {
      tl.set(progressPaths, { opacity: 0.2 }, 0);
      tl.to(progressPaths, {
        opacity: 1,
        duration: 0.01,
        ease: "none",
        stagger: { amount: progUp / 2, from: "end" } // 2x faster
      }, 0);
    }

    tl.add("rotStart", progUp / 2);

    tl.call(() => {
      current ^= 1;
      card.setAttribute('data-about-intro-card', current === 0 ? 'dennis' : 'ilja');
    }, null, "rotStart");

    tl.to(marker, { scale: 1, duration: durationMarker }, "rotStart");

    tl.to(layers[2], { rotation: a1, duration: durationTurn }, ">");
    tl.to(marker, { rotation: "+=" + a1, duration: durationTurn }, "<");
    tl.call(() => swapPersonaOne(2, current), null, "<+=0.28");

    tl.to(marker, { scale: 1.5, duration: durationMarker });

    tl.to(layers[1], { rotation: a2, duration: durationTurn });
    tl.to(marker, { rotation: "+=" + a2, duration: durationTurn }, "<");
    tl.call(() => swapPersonaOne(1, current), null, "<+=0.28");

    tl.to(marker, { scale: 2, duration: durationMarker });

    tl.to(layers[0], { rotation: a3, duration: durationTurn });
    tl.to(marker, { rotation: "+=" + a3, duration: durationTurn }, "<");
    tl.call(() => swapPersonaOne(0, current), null, "<+=0.28");

    tl.to(marker, { scale: 1, duration: durationMarker });

    tl.to(layers[2], { rotation: 0, duration: durationReset }, ">");
    tl.to(marker, { rotation: "+=" + (-a1), duration: durationReset }, "<");

    tl.to(marker, { scale: 1.5, duration: durationMarker });

    tl.to(layers[1], { rotation: 0, duration: durationReset });
    tl.to(marker, { rotation: "+=" + (-a2), duration: durationReset }, "<");

    tl.to(marker, { scale: 2, duration: durationMarker });

    tl.to(layers[0], { rotation: 0, duration: durationReset });
    tl.to(marker, { rotation: "+=" + (-a3), duration: durationReset }, "<");

    if (progressPaths.length) {
      tl.to(progressPaths, {
        opacity: 0.2,
        stagger: { amount: durationReset, from: "start" }
      }, "<");
    }
  }

  buildCycle();

  ScrollTrigger.create({
    trigger: card,
    start: "top bottom",
    end: "bottom top",
    onEnter: () => tl.totalTime() === 0 ? tl.play(0) : tl.play(),
    onEnterBack: () => tl.totalTime() === 0 ? tl.play(0) : tl.play(),
    onLeave: () => tl.pause(),
    onLeaveBack: () => tl.pause()
  });

  const inView = ScrollTrigger.isInViewport && ScrollTrigger.isInViewport(card);
  if (inView) tl.play(0);
}

function initRotatingLayers() {
  const wrappers = document.querySelectorAll('[data-rotate-wrap]');
  if (!wrappers.length) return;

  wrappers.forEach(w => {
    const layers = Array.from(w.querySelectorAll('[data-rotate-layer]'));
    if (layers.length !== 3) return;

    const marker = w.querySelector('[data-rotate-marker]');
    if (!marker) return;

    const ignores = layers.map(l => Array.from(l.querySelectorAll('[data-rotate-ignore]')));

    gsap.set([marker, ...layers, ...ignores.flat()], { transformOrigin: "50% 50%" });
    gsap.set([layers, ignores.flat()], { rotation: 0 });

    // ④ use offsetWidth instead of getBoundingClientRect
    const base = layers[2].offsetWidth || 1;
    const s1 = (layers[0].offsetWidth || 1) / base;
    const s2 = (layers[1].offsetWidth || 1) / base;
    const s3 = 1;
    gsap.set(marker, { scale: s3 });

    const tl = gsap.timeline({
      repeat: -1,
      repeatDelay: 1,
      paused: true,
      onRepeat: () => {
        tl.clear();
        buildSequence();
      }
    });

    function buildSequence() {
      const [a1, a2, a3] = pickAngles({ gap: 15, minAbs: 0, range: 270 });
      const d1 = rand(0.7, 1.2);
      const d2 = rand(0.7, 1.2);
      const d3 = rand(0.7, 1.2);
      const dReset = 0.75;

      tl.to(marker, { scale: s1, duration: 0.4 });
      tl.to(layers[0], { rotation: a3, duration: d3 }, ">");
      tl.to(marker, { rotation: "+=" + a3, duration: d3 }, "<");
      if (ignores[0]?.length) tl.to(ignores[0], { rotation: -a3, duration: d3 }, "<");

      tl.to(marker, { scale: s2, duration: 0.4 });
      tl.to(layers[1], { rotation: a2, duration: d2 }, ">");
      tl.to(marker, { rotation: "+=" + a2, duration: d2 }, "<");
      if (ignores[1]?.length) tl.to(ignores[1], { rotation: -a2, duration: d2 }, "<");

      tl.to(marker, { scale: s3, duration: 0.4 });
      tl.to(layers[2], { rotation: a1, duration: d1 }, ">");
      tl.to(marker, { rotation: "+=" + a1, duration: d1 }, "<");
      if (ignores[2]?.length) tl.to(ignores[2], { rotation: -a1, duration: d1 }, "<");

      tl.to(marker, { scale: s1, duration: 0.3 });
      tl.to(layers[0], { rotation: 0, duration: dReset }, ">");
      tl.to(marker, { rotation: "+=" + (-a3), duration: dReset }, "<");
      if (ignores[0]?.length) tl.to(ignores[0], { rotation: 0, duration: dReset }, "<");

      tl.to(marker, { scale: s2, duration: 0.3 });
      tl.to(layers[1], { rotation: 0, duration: dReset }, ">");
      tl.to(marker, { rotation: "+=" + (-a2), duration: dReset }, "<");
      if (ignores[1]?.length) tl.to(ignores[1], { rotation: 0, duration: dReset }, "<");

      tl.to(marker, { scale: s3, duration: 0.3 });
      tl.to(layers[2], { rotation: 0, duration: dReset }, ">");
      tl.to(marker, { rotation: "+=" + (-a1), duration: dReset }, "<");
      if (ignores[2]?.length) tl.to(ignores[2], { rotation: 0, duration: dReset }, "<");

      tl.to({}, { duration: 1 });
    }

    buildSequence();

    ScrollTrigger.create({
      trigger: w,
      start: "top bottom",
      end: "bottom top",
      onEnter: () => tl.totalTime() === 0 ? tl.play(0) : tl.play(),
      onEnterBack: () => tl.totalTime() === 0 ? tl.play(0) : tl.play(),
      onLeave: () => tl.pause(),
      onLeaveBack: () => tl.pause()
    });

    const inView = ScrollTrigger.isInViewport && ScrollTrigger.isInViewport(w);
    if (inView) tl.play(0);
  });
}

function initRadialMarquee() {
  // reuse a single observer
  if (!window.__radial_marquee_observer) {
    window.__radial_marquee_observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        target.style.animationPlayState = isIntersecting ? 'running' : 'paused';
      });
    }, { threshold: 0 });
  }

  const observer = window.__radial_marquee_observer;
  const containers = document.querySelectorAll('[data-radial-marquee]');

  containers.forEach((container) => {
    if (container.hasAttribute('data-radial-marquee-initialized')) return;

    const rotator = container.querySelector('[data-radial-marquee-rotate]');
    if (!rotator) return;

    // duplicate children once
    const items = Array.from(rotator.children);
    items.forEach((item) => rotator.appendChild(item.cloneNode(true)));

    // set default paused state inline
    rotator.style.animationPlayState = 'paused';

    // observe for in-view play/pause
    observer.observe(rotator);

    container.setAttribute('data-radial-marquee-initialized', 'true');
  });
}

function initModals() {
  if (!window.__osmoModals) {
    window.__osmoModals = {
      wraps: new Set(),
      closeAll(restore = true) {
        window.__osmoModals.wraps.forEach(w => {
          if (w._modals && typeof w._modals.close === 'function') {
            w._modals.close(undefined, restore);
          }
        });
      },
      findWrapForModal(id) {
        const modal = document.querySelector(`[data-modal-wrap] [data-modal-target="${id}"]`);
        if (!modal) return null;
        return modal.closest('[data-modal-wrap]');
      }
    };
    window.closeAllModals = function () { window.__osmoModals.closeAll(true); };
  }

  const wraps = Array.from(document.querySelectorAll('[data-modal-wrap]'));
  if (!wraps.length) return;

  // one delegated trigger handler for the whole document
  if (!window.__osmoModals._delegatedBound) {
    document.addEventListener('click', function (e) {
      const t = e.target.closest('[data-modal-trigger]');
      if (!t) return;
      const id = t.getAttribute('data-modal-trigger');
      if (!id) return;
      const wrap = window.__osmoModals.findWrapForModal(id);
      if (!wrap || !wrap._modals || typeof wrap._modals.open !== 'function') return;
      e.preventDefault();
      wrap._modals.open(id, t);
    }, { passive: false });
    window.__osmoModals._delegatedBound = true;
  }

  wraps.forEach(function (wrap) {
    if (!wrap || wrap._modalsBound) return;
    wrap._modalsBound = true;
    window.__osmoModals.wraps.add(wrap);

    const getActive = () => wrap.querySelector(
      '[data-modal-target][data-modal-status="active"]');

    let escHandler = null;
    let trapHandler = null;
    let lastTrigger = null;

    // background scroll locks
    let wheelBlocker = null;
    let touchBlocker = null;

    function lockBackgroundScroll() {
      if (document.documentElement.hasAttribute('data-modal-open')) return;
      document.documentElement.setAttribute('data-modal-open', 'true');
      wheelBlocker = e => { e.preventDefault(); };
      touchBlocker = e => { e.preventDefault(); };
      window.addEventListener('wheel', wheelBlocker, { passive: false });
      //window.addEventListener('touchmove', touchBlocker, { passive: false });
    }

    function unlockBackgroundScroll() {
      document.documentElement.removeAttribute('data-modal-open');
      if (wheelBlocker) window.removeEventListener('wheel', wheelBlocker, { passive: false });
      //if (touchBlocker) window.removeEventListener('touchmove', touchBlocker, { passive: false });
      wheelBlocker = null;
      touchBlocker = null;
    }

    // main Lenis pause/resume
    function pauseGlobalLenis() {
      if (window.lenis && typeof window.lenis.stop === 'function') {
        window.lenis.stop();
        window.lenis.__osmoRunning = false;
      }
    }

    function resumeGlobalLenis() {
      if (window.lenis && typeof window.lenis.start === 'function') {
        window.lenis.start();
        window.lenis.__osmoRunning = true;
      }
    }

    function getTabbables(root) {
      return Array.from(root.querySelectorAll([
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(','))).filter(el => el.offsetParent !== null || el === root);
    }

    function focusCloseFirst(id, scope) {
      const closePref = wrap.querySelector(`[data-modal-close="${id}"]`);
      if (closePref) { closePref.focus(); return; }
      const tabbables = getTabbables(scope);
      if (tabbables.length) tabbables[0].focus();
      else scope.focus?.();
    }

    function bindEsc(modal, id) {
      if (escHandler) window.removeEventListener('keydown', escHandler);
      escHandler = e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeModal(id);
        }
      };
      window.addEventListener('keydown', escHandler, { passive: false });
    }

    function bindTrap(modal) {
      if (trapHandler) modal.removeEventListener('keydown', trapHandler);
      trapHandler = e => {
        if (e.key !== 'Tab') return;
        const tabbables = getTabbables(modal);
        if (!tabbables.length) { e.preventDefault(); return; }
        const first = tabbables[0];
        const last = tabbables[tabbables.length - 1];
        if (e.shiftKey && (document.activeElement === first || !modal.contains(document
          .activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document
          .activeElement))) {
          e.preventDefault();
          first.focus();
        }
      };
      modal.addEventListener('keydown', trapHandler, { passive: false });
    }

    function startModalRaf(modal) {
      if (!modal._lenis) return;
      if (modal._lenisRaf) cancelAnimationFrame(modal._lenisRaf);
      const loop = t => {
        if (!modal._lenis) return;
        modal._lenis.raf(t);
        modal._lenisRaf = requestAnimationFrame(loop);
      };
      modal._lenisRaf = requestAnimationFrame(loop);
    }

    function stopModalRaf(modal) {
      if (modal._lenisRaf) {
        cancelAnimationFrame(modal._lenisRaf);
        modal._lenisRaf = null;
      }
    }

    function makeModalLenis(modal) {
      const scroller = modal.querySelector('[data-modal-scroller]') || modal;
      const instance = new Lenis({
        wrapper: modal,
        content: scroller,
        eventsTarget: wrap,
        smoothWheel: true,
        lerp: 0.165,
        wheelMultiplier: 1.25
      });
      instance.start();
      return instance;
    }

    function killModalScrollTriggers(modal) {
      const scroller = modal._scroller || modal;
      const all = ScrollTrigger.getAll();
      if (modal._sts && modal._sts.length) {
        modal._sts.forEach(st => st && st.kill());
        modal._sts.length = 0;
      }
      all.forEach(st => {
        const trg = st.trigger,
          pin = st.pin,
          scr = st.scroller;
        const hit = (trg && modal.contains(trg)) || (pin && modal.contains(pin)) || scr ===
          scroller || scr === modal;
        if (hit) st.kill();
      });
      gsap.globalTimeline.getChildren(true, true, true).forEach(tw => {
        const st = tw.scrollTrigger;
        if (!st) return;
        const trg = st.trigger,
          pin = st.pin,
          scr = st.scroller;
        const hit = (trg && modal.contains(trg)) || (pin && modal.contains(pin)) || scr ===
          scroller || scr === modal;
        if (hit) tw.kill();
      });
    }

    function syncScrollTrigger(modal) {
      const scroller = modal.querySelector('[data-modal-scroller]') || modal;
      if (modal._lenis && modal._lenisScrollHandler) {
        modal._lenis.off?.('scroll', modal._lenisScrollHandler);
      }
      let y = 0;
      if (modal._lenis) {
        modal._lenisScrollHandler = e => { y = e.scroll; };
        modal._lenis.on('scroll', modal._lenisScrollHandler);
      } else {
        y = scroller.scrollTop || 0;
      }
      ScrollTrigger.scrollerProxy(scroller, {
        scrollTop(v) {
          if (arguments.length) {
            if (modal._lenis) {
              modal._lenis.scrollTo(v, { immediate: true });
            } else {
              scroller.scrollTop = v;
            }
          }
          return modal._lenis ? y : scroller.scrollTop;
        },
        getBoundingClientRect() {
          return {
            top: 0,
            left: 0,
            width: scroller.clientWidth,
            height: scroller
              .clientHeight
          };
        },
        pinType: 'transform'
      });
      modal._scroller = scroller;
      return scroller;
    }

    function openModal(id, triggerEl) {
      const modal = wrap.querySelector(`[data-modal-target="${id}"]`);
      if (!modal) { console.warn('[open] modal not found', id); return; }

      // close any open modal on any wrap
      window.__osmoModals.closeAll(false);

      const current = getActive();
      if (current && current !== modal) {
        closeModal(current.getAttribute('data-modal-target'), false);
      }

      lastTrigger = triggerEl || lastTrigger || null;

      wrap.removeAttribute('aria-hidden');
      modal.setAttribute('data-modal-status', 'active');

      pauseGlobalLenis();
      lockBackgroundScroll();

      if (modal._lenis) {
        stopModalRaf(modal);
        modal._lenis.off?.('scroll', modal._lenisScrollHandler);
        modal._lenisScrollHandler = null;
        modal._lenis.stop();
        modal._lenis.destroy?.();
        modal._lenis = null;
      }

      modal._lenis = makeModalLenis(modal);
      startModalRaf(modal);
      syncScrollTrigger(modal);
      ScrollTrigger.refresh();

      focusCloseFirst(id, modal);
      bindEsc(modal, id);
      bindTrap(modal);

      killModalScrollTriggers(modal);
      callInitHook(id, modal);
      ScrollTrigger.refresh();
    }

    function closeModal(id, restore = true) {
      const modal = id ? wrap.querySelector(`[data-modal-target="${id}"]`) : getActive();
      if (!modal) return;

      modal.removeAttribute('data-modal-status');

      // Reset scroll pos
      gsap.delayedCall(0.75, () => {
        modal.scrollTop = 0;
      })

      // Stop all videos from Resource Modal;
      stopResUsedVideos(document.querySelector('[data-res-used-update]'));

      if (modal._lenis) {
        stopModalRaf(modal);
        modal._lenis.off?.('scroll', modal._lenisScrollHandler);
        modal._lenisScrollHandler = null;
        modal._lenis.stop();
        modal._lenis.destroy?.();
        modal._lenis = null;
      }

      if (escHandler) {
        window.removeEventListener('keydown', escHandler);
        escHandler = null;
      }
      if (trapHandler) {
        modal.removeEventListener('keydown', trapHandler);
        trapHandler = null;
      }

      if (!wrap.querySelector('[data-modal-target][data-modal-status="active"]')) {
        wrap.setAttribute('aria-hidden', 'true');
        if (restore) {
          unlockBackgroundScroll();
          resumeGlobalLenis();
        }
        if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
        killModalScrollTriggers(modal);
        ScrollTrigger.refresh();
      }
    }

    function callInitHook(id, container) {
      const direct = window[`initModal${id}`];
      const cased = `initModal${id.charAt(0).toUpperCase()}${id.slice(1)}`;
      const fn = typeof direct === 'function' ? direct : (typeof window[cased] === 'function' ?
        window[cased] : null);
      if (!fn) return;
      fn({ wrap, modal: container });
    }

    wrap.addEventListener('click', e => {
      const closeBtn = e.target.closest('[data-modal-close]');
      if (closeBtn) {
        const id = closeBtn.getAttribute('data-modal-close');
        closeModal(id || undefined);
        return;
      }
      if (e.target.closest('[data-modal-bg]')) {
        closeModal();
      }
    });

    wrap._modals = { open: openModal, close: closeModal };
  });
}

function initModalAbout({ wrap, modal }) {
  const scroller = modal.querySelector('[data-modal-scroller]') || modal;
  modal._sts = modal._sts || [];

  const heroMarker = modal.querySelector('.about-map__outline');
  const heroMarkerSVG = heroMarker?.querySelector('svg');
  const heroMap = modal.querySelector('.about-map__inner');

  gsap.timeline({ defaults: { duration: 1 } })
    .fromTo(heroMarkerSVG, { rotate: 135 }, {
      rotate: 0,
      duration: 1.4,
      transformOrigin: '50% 50%'
    }, 0.5)
    .fromTo(heroMap, { scale: 1, xPercent: 0, yPercent: 0 }, {
      scale: 1.3,
      xPercent: 10,
      yPercent: 5
    }, '<');

  const t1 = gsap.to(heroMarker, {
    rotate: -180,
    ease: "none",
    scrollTrigger: {
      trigger: heroMarker,
      start: 'clamp(top center)',
      end: 'bottom top',
      scrub: true,
      scroller
    }
  });

  const gallery = modal.querySelector('.about-gallery__wrap')
  const galleryImages = modal.querySelectorAll(".about-gallery__item")

  const t2 = gsap.from(galleryImages, {
    yPercent: 25,
    xPercent: 25,
    autoAlpha: 0,
    duration: 0.8,
    ease: "expo.out",
    rotate: gsap.utils.wrap([9, 6, 3]),
    stagger: { each: 0.1, from: "end" },
    scrollTrigger: {
      trigger: gallery,
      start: 'clamp(top 80%)',
      once: true,
      scroller,
    }
  });

  const logo = modal.querySelector('[data-footer-logo]')
  if (!logo) return

  const paths = Array.from(logo.querySelectorAll('path'))

  const R = 7.5
  const Y = 10

  gsap.set(paths, { transformOrigin: "center center" })

  gsap.set(paths[0], { rotate: -3 * R, yPercent: 8 * Y }) // O 
  gsap.set(paths[1], { rotate: -2 * R, yPercent: 4 * Y }) // S
  gsap.set(paths[2], { rotate: -1.75 * R, yPercent: 1.5 * Y }) // M

  gsap.set(paths[4], { rotate: 1.25 * R, yPercent: 1 * Y }) // S
  gsap.set(paths[5], { rotate: 2.75 * R, yPercent: 4 * Y }) // M
  gsap.set(paths[6], { rotate: 3 * R, yPercent: 8.5 * Y }) // O

  const t3 = gsap.to(paths, {
    rotate: 0,
    yPercent: 0,
    ease: "none",
    scrollTrigger: {
      trigger: logo,
      start: "top bottom",
      end: "+=13%",
      scrub: true,
      scroller
    }
  });

  modal._sts.push(t1.scrollTrigger);
  modal._sts.push(t2.scrollTrigger);
  modal._sts.push(t3.scrollTrigger);

}

function initModalShowcase({ wrap, modal }) {
  const scroller = modal.querySelector('[data-modal-scroller]') || modal;
  modal._sts = modal._sts || [];
}

function initModalLifetime({ wrap, modal }) {
  const scroller = modal.querySelector('[data-modal-scroller]') || modal;
  modal._sts = modal._sts || [];

  const logo = modal.querySelector('[data-footer-logo]')
  if (!logo) return

  const paths = Array.from(logo.querySelectorAll('path'))

  const R = 7.5
  const Y = 10

  gsap.set(paths, { transformOrigin: "center center" })

  gsap.set(paths[0], { rotate: -3 * R, yPercent: 8 * Y }) // O 
  gsap.set(paths[1], { rotate: -2 * R, yPercent: 4 * Y }) // S
  gsap.set(paths[2], { rotate: -1.75 * R, yPercent: 1.5 * Y }) // M

  gsap.set(paths[4], { rotate: 1.25 * R, yPercent: 1 * Y }) // S
  gsap.set(paths[5], { rotate: 2.75 * R, yPercent: 4 * Y }) // M
  gsap.set(paths[6], { rotate: 3 * R, yPercent: 8.5 * Y }) // O

  const t4 = gsap.to(paths, {
    rotate: 0,
    yPercent: 0,
    ease: "none",
    scrollTrigger: {
      trigger: logo,
      start: "top bottom",
      end: "+=13%",
      scrub: true,
      scroller
    }
  });

  modal._sts.push(t4.scrollTrigger);

}

function buildSitemapOnce() {
  if (window.__sitemapBuilt) return window.sitemap;

  const root = document.querySelector('[sm-list="resources"]');
  if (!root) {
    // still return a valid shape so callers don't crash
    window.sitemap = { total: 0, data: [] };
    window.__sitemapBuilt = true;
    return window.sitemap;
  }

  const items = Array.from(root.querySelectorAll('[sm-slug]')).map(el => ({
    slug: el.getAttribute('sm-slug') || '',
    title: el.getAttribute('sm-title') || '',
    vaultCat: el.getAttribute('sm-vault-cat') || '',
    keywords: el.getAttribute('sm-keywords') || '',
    vid: el.getAttribute('sm-vid') || '',
    date: el.getAttribute('sm-date') || '',
    img: el.querySelector('[sm-img]')?.getAttribute('src') || '',
    link: el.querySelector('[sm-link]')?.getAttribute('href') || ''
  }));

  // remove the heavy DOM
  root.remove();

  window.sitemap = { total: items.length, data: items };
  window.__sitemapBuilt = true;
  return window.sitemap;
}

function getTimeAgoText(dateText) {
  const parsedDate = new Date(dateText);
  if (isNaN(parsedDate.getTime())) return '';

  const today = new Date();
  parsedDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diff = today - parsedDate;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return 'In the future';
  if (days === 0) return 'earlier today';
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

  const weeks = Math.floor(days / 7);
  if (weeks >= 52) {
    const years = Math.floor(weeks / 52);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  }

  return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
}

function initResourcesUsed() {
  var updateRoot = document.querySelector('[data-res-used-update]');
  if (!updateRoot) return;
  var cards = document.querySelectorAll('[data-res-used-data]');
  if (!cards.length) return;

  var slugIndex = {};
  if (window.sitemap && Array.isArray(window.sitemap.data)) {
    window.sitemap.data.forEach(it =>
      slugIndex[it.slug] = it);
  }

  function qAll(r, s) { return Array.prototype.slice.call(r.querySelectorAll(s)); }

  cards.forEach(function (card, idx) {
    qAll(card, '[data-res-used-activate]').forEach(function (act) {
      act.addEventListener('click', function () {
        if (updateRoot.getAttribute('data-res-used-active-index') === String(idx)) {
          if (typeof window.startResUsedVideos === 'function') window
            .startResUsedVideos(updateRoot);
          return;
        }

        var title = card.querySelector('[data-res-used="title"]');
        var count = card.querySelector('[data-res-used="count"]');
        var siteA = card.querySelector('[data-res-used="site-url"]');


        qAll(updateRoot, '[data-res-used="title"]').forEach(t => t.textContent = title ?
          title.textContent : '');
        qAll(updateRoot, '[data-res-used="count"]').forEach(t => t.textContent = count ?
          count.textContent : '');
        qAll(updateRoot, '[data-res-used="site-url"]').forEach(a => a.setAttribute(
          'href', siteA ? (siteA.getAttribute('href') || '#') : '#'));

        [1, 2].forEach(function (n) {
          var nameSrc = card.querySelector('[data-res-used="author-name-' + n +
            '"]');
          var imgSrc = card.querySelector('[data-res-used="author-img-' + n +
            '"] img');
          var urlSrc = card.querySelector('[data-res-used="author-url-' + n + '"]');
          qAll(updateRoot, '[data-res-used="author-name-' + n + '"]').forEach(t =>
            qAll(t, '.button-label').forEach(lbl => lbl.textContent = nameSrc ?
              nameSrc.textContent : ''));
          qAll(updateRoot, '[data-res-used="author-img-' + n + '"] img').forEach(
            img => img.setAttribute('src', imgSrc ? (imgSrc.getAttribute('src') ||
              '') : ''));
          qAll(updateRoot, '[data-res-used="author-url-' + n + '"]').forEach(a => a
            .setAttribute('href', urlSrc ? (urlSrc.getAttribute('href') || '#') :
              '#'));
        });

        var listRoot = updateRoot.querySelector('[data-res-used="list"]');
        if (listRoot) {
          var seed = listRoot.querySelector('[data-res-used="item"]'),
            tpl = seed ? seed.cloneNode(true) : null;
          listRoot.textContent = '';
          var slugs = qAll(card, '[data-res-used-slug]').map(el => el.getAttribute(
            'data-res-used-slug') || (el.textContent || '').trim()).filter(Boolean);

          slugs.forEach(function (slug) {
            var d = slugIndex[slug];
            if (!d || !tpl) return;
            var item = tpl.cloneNode(true);
            qAll(item, '[data-res-used="item-title"]').forEach(t => t.textContent =
              d.title || '');
            qAll(item, '[data-res-used="item-catgory"]').forEach(w => {
              var l = w
                .querySelector('.tag-label');
              if (l) l.textContent = d
                .vaultCat || '';
            });
            qAll(item, '[data-res-used="item-link"]').forEach(a => a.setAttribute(
              'href', d.link || '#'));
            qAll(item, '[data-res-used="item-img"]').forEach(img => img
              .setAttribute('src', d.img || ''));
            qAll(item, '[data-res-used="item-video"]').forEach(v => {
              v.removeAttribute('src');
              if (d.vid) { v.setAttribute('data-res-used-video', d.vid); }
              else { v.removeAttribute('data-res-used-video'); }
            });
            listRoot.appendChild(item);
          });
        }

        updateRoot.setAttribute('data-res-used-active-index', String(idx));
        if (window.lenis && typeof window.lenis.resize === 'function') window.lenis
          .resize();
        if (typeof window.startResUsedVideos === 'function') window.startResUsedVideos(
          updateRoot);
      });
    });
  });
}

function startResUsedVideos(root) {
  var vids = [].slice.call((root || document).querySelectorAll('[data-res-used="item-video"]'));
  if (!vids.length) return;
  vids.forEach(v => {
    v.pause();
    v.currentTime = 0;
    v.removeAttribute('src');
    v.loop = true;
    v.muted = true;
  });

  var i = 0;
  (function next() {
    if (i >= vids.length) return;
    var v = vids[i++],
      mark = v.getAttribute('data-res-used-video'),
      src = (mark === 'playing' ? v.getAttribute('data-res-used-video-src') : mark) || '';
    if (!src) { next(); return; }

    v.onplaying = function () {
      if (mark !== 'playing' && src) v.setAttribute('data-res-used-video-src', src);
      v.setAttribute('data-res-used-video', 'playing');
      v.onplaying = v.onerror = null;
      next();
    };
    v.onerror = function () {
      v.onplaying = v.onerror = null;
      next();
    };

    v.src = src;
    v.play().catch(v.onerror);
  })();
}

function stopResUsedVideos(root) {
  [].slice.call((root || document).querySelectorAll('[data-res-used="item-video"]')).forEach(v => {
    try {
      v.pause();
      v.currentTime = 0;
    } catch (e) { }
    v.removeAttribute('src');
    if (v.getAttribute('data-res-used-video') === 'playing') {
      var s = v.getAttribute('data-res-used-video-src') || '';
      s ? v.setAttribute('data-res-used-video', s) : v.removeAttribute('data-res-used-video');
    }
  });
}

function initPricingSection() {
  const section = document.querySelector("[data-pricing-section-status]");
  if (!section) return;

  const buttons = section.querySelectorAll("[data-pricing-button]");
  if (!buttons.length) return;

  const soloCards = section.querySelectorAll('[data-pricing-card="solo"]')
  const teamCards = section.querySelectorAll('[data-pricing-card="team"]')

  const tl = gsap.timeline();

  function onComplete() {
    if (window.lenis && typeof window.lenis.resize === 'function') window.lenis.resize();
    ScrollTrigger.refresh();
  }

  function toTeam() {
    section.setAttribute("data-pricing-section-status", "team");

    tl.clear()
      .to(soloCards, {
        xPercent: -15,
        rotate: (i) => -12 + i * 4,
        yPercent: (i) => 10 + i * -10,
        autoAlpha: 0,
        stagger: 0.05
      })
      .fromTo(teamCards, {
        rotate: 8,
        xPercent: 0,
        yPercent: 0,
        autoAlpha: 0,
      }, {
        rotate: 0,
        xPercent: 0,
        yPercent: 0,
        autoAlpha: 1,
        stagger: 0.05
      }, "<+=0.2")
      .call(onComplete, null, ">")

  }

  function toSolo() {
    section.setAttribute("data-pricing-section-status", "solo");

    tl.clear()
      .to(teamCards, {
        rotate: 8,
        xPercent: 5,
        yPercent: 3,
        autoAlpha: 0,
        stagger: { each: 0.05, from: "end" }
      })
      .to(soloCards, {
        rotate: 0,
        xPercent: 0,
        yPercent: 0,
        autoAlpha: 1,
        stagger: { each: 0.05, from: "end" }
      }, "<+=0.1")
      .call(onComplete, null, ">")

  }

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const current = section.getAttribute("data-pricing-section-status");
      current === "solo" ? toTeam() : toSolo();
    });
  });

  // Price toggling
  const toggleCards = section.querySelectorAll("[data-pricing-state]");

  toggleCards.forEach(card => {
    const toggles = card.querySelectorAll("[data-pricing-card-toggle]");
    if (!toggles.length) return;

    const button = card.querySelector(".button");

    toggles.forEach(toggle => {
      toggle.addEventListener("click", () => {
        const current = card.getAttribute("data-pricing-state");
        const next = current === "quarterly" ? "annually" : "quarterly";
        card.setAttribute("data-pricing-state", next);

        // Update href based on state
        const currentHref = button.getAttribute("href");
        const baseHref = currentHref.includes("?") ?
          currentHref.split("?")[0] :
          currentHref;

        if (next === "annually") {
          button.setAttribute("href", `${baseHref}?type=annual`);
        } else {
          button.setAttribute("href", baseHref);
        }
      });
    });
  });

}

function initFAQs() {
  const toggles = Array.from(document.querySelectorAll("[data-faq-toggle]"));
  const collections = Array.from(document.querySelectorAll("[data-faq-collection]"));
  if (!toggles.length || !collections.length) return;

  const parent = collections[0].parentElement;
  let isSwitching = false; // <— lock flag

  const toggleMap = new Map(
    toggles.map((t, i) => [t.getAttribute("data-faq-toggle"), { el: t, index: i }])
  );
  const collectionMap = new Map(
    collections.map((c, i) => [c.getAttribute("data-faq-collection"), { el: c, index: i }])
  );

  function getActiveToggle() {
    return document.querySelector("[data-faq-toggle][data-toggle-status='active']");
  }

  function switchFAQ(outgoingEl, incomingEl, outgoingIndex, incomingIndex) {
    isSwitching = true; // <— lock at start
    const tl = gsap.timeline({
      onComplete: () => (isSwitching = false) // <— unlock when done
    });

    const outgoingItems = outgoingEl ? outgoingEl.querySelectorAll("[data-accordion-status]") : [];
    const incomingItems = incomingEl.querySelectorAll("[data-accordion-status]");

    incomingEl.setAttribute("data-collection-status", "active");
    incomingEl.style.position = "absolute";
    incomingEl.style.top = "0";

    const targetHeight = incomingEl.offsetHeight;

    tl.to(parent, { height: targetHeight }, 0)
      .to(outgoingItems, { xPercent: -15, autoAlpha: 0, stagger: 0.03 }, 0)
      .fromTo(
        incomingItems, { xPercent: 15, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, stagger: 0.03 },
        "<+=0.1"
      )
      .add(() => {
        collections.forEach((col) => {
          if (col !== incomingEl) {
            col.setAttribute("data-collection-status", "not-active");
            const openAccordions = col.querySelectorAll('[data-accordion-status="active"]');
            openAccordions.forEach((acc) => acc.setAttribute("data-accordion-status",
              "not-active"));
          }
        });
        incomingEl.style.position = "";
        incomingEl.style.top = "";
      })
      .add(() => {
        gsap.set(parent, { clearProps: "height" });
        lenis.resize();
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      });
  }

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      if (isSwitching) return; // <— block clicks during animation

      const incomingVal = toggle.getAttribute("data-faq-toggle");
      const activeToggle = getActiveToggle();
      if (activeToggle && activeToggle.getAttribute("data-faq-toggle") === incomingVal)
        return;

      const outgoingVal = activeToggle ? activeToggle.getAttribute("data-faq-toggle") :
        null;
      const outgoingInfo = outgoingVal ? collectionMap.get(outgoingVal) : null;
      const incomingInfo = collectionMap.get(incomingVal);

      if (activeToggle) activeToggle.setAttribute("data-toggle-status", "not-active");
      toggle.setAttribute("data-toggle-status", "active");

      switchFAQ(
        outgoingInfo ? outgoingInfo.el : null,
        incomingInfo.el,
        outgoingInfo ? outgoingInfo.index : -1,
        incomingInfo.index
      );
    });
  });

  toggles[0].setAttribute("data-toggle-status", "active");
  collections.forEach((col) => {
    const colVal = col.getAttribute("data-faq-collection");
    col.setAttribute(
      "data-collection-status",
      colVal === toggles[0].getAttribute("data-faq-toggle") ? "active" : "not-active"
    );
  });
}

function initFlickCards() {
  const sliders = document.querySelectorAll('[data-flick-cards-init]');
  if (!sliders.length) return;

  sliders.forEach(slider => {
    const list = slider.querySelector('[data-flick-cards-list]');
    if (!list) return;

    const cards = Array.from(list.querySelectorAll('[data-flick-cards-item]'));
    const total = cards.length;
    if (total < 7) {
      console.log('Not minimum of 7 cards');
      return;
    }

    let activeIndex = 0;
    const sliderWidth = slider.offsetWidth;
    const threshold = 0.1;

    // Selector for per-card media element (can be a bunny thumb or a plain <video>)
    const videoSelector = slider.getAttribute('data-flick-cards-video-selector') ||
      '[data-bunny-thumbnail-init][data-player-autoplay="custom"]';

    function playMedia(el) {
      if (!el) return;
      if (typeof window.bunnyThumbnailPlay === 'function') {
        window.bunnyThumbnailPlay(el);
        return;
      }
      const v = el.matches('video, audio') ? el : el.querySelector('video, audio');
      v && v.play && v.play().catch(() => { });
    }

    function pauseMedia(el) {
      if (!el) return;
      if (typeof window.bunnyThumbnailPause === 'function') {
        window.bunnyThumbnailPause(el);
        return;
      }
      const v = el.matches('video, audio') ? el : el.querySelector('video, audio');
      if (v && v.pause) v.pause();
    }

    function pauseAllMedia() {
      cards.forEach(card => {
        const mediaEl = card.querySelector(videoSelector);
        if (mediaEl) pauseMedia(mediaEl);
      });
    }

    function updateActiveMedia(currentIndex) {
      cards.forEach((card, i) => {
        const mediaEl = card.querySelector(videoSelector);
        if (!mediaEl) return;
        if (i === currentIndex) playMedia(mediaEl);
        else pauseMedia(mediaEl);
      });
    }

    const draggers = [];
    cards.forEach(card => {
      const dragger = document.createElement('div');
      dragger.setAttribute('data-flick-cards-dragger', '');
      card.appendChild(dragger);
      draggers.push(dragger);
    });

    slider.setAttribute('data-flick-drag-status', 'grab');

    function getConfig(i, currentIndex) {
      let diff = i - currentIndex;
      if (diff > total / 2) diff -= total;
      else if (diff < -total / 2) diff += total;

      switch (diff) {
        case 0:
          return { x: 0, y: 0, rot: 0, s: 1.0, o: 1, z: 5 };
        case 1:
          return { x: 25, y: 5, rot: 5, s: 0.9, o: 1, z: 4 };
        case -1:
          return { x: -25, y: 5, rot: -5, s: 0.9, o: 1, z: 4 };
        case 2:
          return { x: 45, y: 7, rot: 10, s: 0.75, o: 1, z: 3 };
        case -2:
          return { x: -45, y: 7, rot: -10, s: 0.75, o: 1, z: 3 };
        default:
          const dir = diff > 0 ? 1 : -1;
          return { x: 55 * dir, y: 5, rot: 15 * dir, s: 0.6, o: 0, z: 2 };
      }
    }

    function renderCards(currentIndex) {
      cards.forEach((card, i) => {
        const cfg = getConfig(i, currentIndex);
        let status;
        if (cfg.x === 0) status = 'active';
        else if (cfg.x === 25) status = '2-after';
        else if (cfg.x === -25) status = '2-before';
        else if (cfg.x === 45) status = '3-after';
        else if (cfg.x === -45) status = '3-before';
        else status = 'hidden';

        card.setAttribute('data-flick-cards-item-status', status);
        card.style.zIndex = cfg.z;

        gsap.to(card, {
          duration: 0.6,
          ease: 'elastic.out(1.2, 1)',
          xPercent: cfg.x,
          yPercent: cfg.y,
          rotation: cfg.rot,
          scale: cfg.s,
          opacity: cfg.o
        });
      });
    }

    renderCards(activeIndex);
    pauseAllMedia();

    let pressClientX = 0;
    let pressClientY = 0;

    const draggables = Draggable.create(draggers, {
      type: 'x',
      edgeResistance: 0.8,
      bounds: { minX: -sliderWidth / 2, maxX: sliderWidth / 2 },
      inertia: false,

      onPress() {
        pressClientX = this.pointerEvent.clientX;
        pressClientY = this.pointerEvent.clientY;
        slider.setAttribute('data-flick-drag-status', 'grabbing');
      },

      onDrag() {
        const rawProgress = this.x / sliderWidth;
        const progress = Math.min(1, Math.abs(rawProgress));
        const direction = rawProgress > 0 ? -1 : 1;
        const nextIndex = (activeIndex + direction + total) % total;

        cards.forEach((card, i) => {
          const from = getConfig(i, activeIndex);
          const to = getConfig(i, nextIndex);
          const mix = prop => from[prop] + (to[prop] - from[prop]) * progress;

          gsap.set(card, {
            xPercent: mix('x'),
            yPercent: mix('y'),
            rotation: mix('rot'),
            scale: mix('s'),
            opacity: mix('o')
          });
        });
      },

      onRelease() {
        slider.setAttribute('data-flick-drag-status', 'grab');

        const releaseClientX = this.pointerEvent.clientX;
        const releaseClientY = this.pointerEvent.clientY;
        const dragDistance = Math.hypot(releaseClientX - pressClientX, releaseClientY -
          pressClientY);

        const raw = this.x / sliderWidth;
        let shift = 0;
        if (raw > threshold) shift = -1;
        else if (raw < -threshold) shift = 1;

        if (shift !== 0) {
          activeIndex = (activeIndex + shift + total) % total;
          renderCards(activeIndex);
          // play only if slider is visible
          if (ScrollTrigger.isInViewport(slider)) {
            updateActiveMedia(activeIndex);
          } else {
            pauseAllMedia();
          }
        }

        gsap.to(this.target, { x: 0, duration: 0.3, ease: 'power1.out' });

        if (dragDistance < 4) {
          this.target.style.pointerEvents = 'none';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const el = document.elementFromPoint(releaseClientX, releaseClientY);
              if (el) el.dispatchEvent(new MouseEvent('click', {
                view: window,
                bubbles: true, cancelable: true
              }));
              this.target.style.pointerEvents = 'auto';
            });
          });
        }
      }
    });

    const st = ScrollTrigger.create({
      trigger: slider,
      start: 'top 85%',
      end: 'bottom 15%',
      onEnter: () => updateActiveMedia(activeIndex),
      onEnterBack: () => updateActiveMedia(activeIndex),
      onLeave: () => pauseAllMedia(),
      onLeaveBack: () => pauseAllMedia()
    });

    const onVis = () => {
      if (document.hidden) pauseAllMedia();
      else if (ScrollTrigger.isInViewport(slider)) updateActiveMedia(activeIndex);
    };
    document.addEventListener('visibilitychange', onVis);

    if (window.addDisposable) {
      addDisposable(() => {
        try { st && st.kill(); } catch (_) { }
        try { document.removeEventListener('visibilitychange', onVis); } catch (_) { }
        try { draggables && draggables.forEach(d => d.kill()); } catch (_) { }
        pauseAllMedia();
      });
    }
  });
}

function initBunnyThumbnail() {
  var selector = '[data-bunny-thumbnail-init]';
  var hover_delay = 125;
  var io_threshold = 0.1;
  var reset_after_leave_ms = 200;
  var touch_mq = window.matchMedia('(hover: none), (pointer: coarse)');
  var is_touch = touch_mq.matches;

  var ctx_map = new WeakMap();

  var items = Array.prototype.slice.call(document.querySelectorAll(selector)).map(function (el) {
    var mode_attr = (el.getAttribute('data-player-autoplay') || '').toLowerCase();
    var mode = mode_attr === 'true' ? 'autoplay' : (mode_attr === 'custom' ? 'custom' :
      'hover');

    var ctx = {
      el: el,
      video: el.querySelector('video'),
      src: el.getAttribute('data-player-src') || '',
      mode: mode,
      quality: (el.getAttribute('data-player-quality') || 'full').toLowerCase(),
      hls: null,
      hover_timer: null,
      reset_timer: null,
      attached: false,
      // universal intent guard
      intent: 0,
      _intent: null
    };
    if (!ctx.video || !ctx.src) {
      set_status(el, 'error');
      return ctx;
    }
    set_status(el, 'idle');
    ctx_map.set(el, ctx);
    return ctx;
  });

  function set_status(el, s) {
    if (el.getAttribute('data-player-status') !== s) el.setAttribute('data-player-status', s);
  }

  // minimal watchdog (2s). retries once per item.
  function armWatchdog(ctx, path) {
    clearTimeout(ctx.watchdog_timer);
    if (ctx.watchdog_attempted) return;
    ctx.watchdog_timer = setTimeout(function () {
      if (ctx.el.getAttribute('data-player-status') === 'loading') {
        ctx.watchdog_attempted = true;
        if (path === 'native') {
          try {
            ctx.video.pause();
            ctx.video.removeAttribute('src');
            ctx.video.load();
          } catch (_) { }
          ctx.attached = false;
          // stamp and restart only if this attempt is still intended
          ctx._intent = ctx.intent;
          start_native(ctx);
        } else {
          try {
            ctx.hls && ctx.hls.stopLoad();
            ctx.hls && ctx.hls.startLoad(-1);
          } catch (_) { }
          ctx._intent = ctx.intent;
          start_hls(ctx);
        }
      }
    }, 1000);
  }

  function start_native(ctx) {
    // bail if a newer intent superseded this start
    if (ctx._intent != null && ctx._intent !== ctx.intent) return;

    var v = ctx.video;
    if (!ctx.attached) {
      v.src = ctx.src;
      ctx.attached = true;
    }
    set_status(ctx.el, 'loading');
    try { v.currentTime = 0; } catch (_) { }
    armWatchdog(ctx, 'native');
    var p = v.play();
    if (p && p.then) p.then(function () { set_status(ctx.el, 'playing'); }).catch(
      function () { set_status(ctx.el, 'error'); });
    else set_status(ctx.el, 'playing');
  }

  function stop_native(ctx) {
    try { ctx.video.pause(); } catch (_) { }
    set_status(ctx.el, 'idle');
    clearTimeout(ctx.reset_timer);
    if (reset_after_leave_ms > 0) {
      ctx.reset_timer = setTimeout(function () { try { ctx.video.currentTime = 0; } catch (_) { } },
        reset_after_leave_ms);
    }
  }

  function force_level_for_quality(hls, quality) {
    var target_height = quality === 'half' ? 480 : 1080;
    var levels = hls.levels || [];
    var best = 0,
      diff = Infinity;
    for (var i = 0; i < levels.length; i++) {
      var d = Math.abs((levels[i].height || 0) - target_height);
      if (d < diff) {
        best = i;
        diff = d;
      }
    }
    hls.currentLevel = best;
    hls.startLevel = best;
    hls.autoLevelCapping = best;
  }

  function start_hls(ctx) {
    // bail if a newer intent superseded this start
    if (ctx._intent != null && ctx._intent !== ctx.intent) return;

    var v = ctx.video;

    if (!ctx.attached) {
      if (window.Hls && Hls.isSupported() && !v.canPlayType('application/vnd.apple.mpegurl')) {
        ctx.hls = new Hls({ autoStartLoad: true });
        ctx.hls.attachMedia(v);
        ctx.hls.on(Hls.Events.MEDIA_ATTACHED, function () { ctx.hls.loadSource(ctx.src); });
        ctx.hls.on(Hls.Events.MANIFEST_PARSED, function () {
          if (ctx.quality === 'full' || ctx.quality === 'half') {
            force_level_for_quality(ctx.hls, ctx.quality);
          } else {
            ctx.hls.currentLevel = -1;
            ctx.hls.startLevel = -1;
            ctx.hls.autoLevelCapping = -1;
          }
        });
        ctx.hls.on(Hls.Events.ERROR, function () { set_status(ctx.el, 'error'); });
        ctx.attached = true;
      } else {
        v.src = ctx.src;
        ctx.attached = true;
      }
    }

    set_status(ctx.el, 'loading');
    clearTimeout(ctx.reset_timer);
    try { v.currentTime = 0; } catch (_) { }
    armWatchdog(ctx, 'hls');
    var p = v.play();
    if (p && p.then) p.then(function () { set_status(ctx.el, 'playing'); }).catch(
      function () { set_status(ctx.el, 'error'); });
    else set_status(ctx.el, 'playing');
  }

  function stop_hls(ctx) {
    try { if (ctx.hls && ctx.hls.stopLoad) ctx.hls.stopLoad(); } catch (_) { }
    try { ctx.video.pause(); } catch (_) { }
    set_status(ctx.el, 'idle');
    clearTimeout(ctx.reset_timer);
    if (reset_after_leave_ms > 0) {
      ctx.reset_timer = setTimeout(function () { try { ctx.video.currentTime = 0; } catch (_) { } },
        reset_after_leave_ms);
    }
  }

  function is_native(ctx) {
    return !!ctx.video && !!ctx.video.canPlayType('application/vnd.apple.mpegurl');
  }

  // wire behaviors per item
  items.forEach(function (ctx) {
    if (!ctx.video || !ctx.src) return;

    var native_path = is_native(ctx);

    // hover mode (desktop only)
    if (ctx.mode === 'hover') {
      function hover_in() {
        if (is_touch) return;
        clearTimeout(ctx.hover_timer);
        clearTimeout(ctx.reset_timer);
        ctx.hover_timer = setTimeout(function () {
          // stamp a new intent for this start
          ctx.intent++;
          ctx._intent = ctx.intent;
          native_path ? start_native(ctx) : start_hls(ctx);
        }, hover_delay);
      }

      function hover_out() {
        if (is_touch) return;
        clearTimeout(ctx.hover_timer);
        // invalidate any pending starts
        ctx.intent++;
        native_path ? stop_native(ctx) : stop_hls(ctx);
      }
      ctx.el.addEventListener('mouseenter', hover_in);
      ctx.el.addEventListener('mouseleave', hover_out);
      ctx.el.addEventListener('focusin', hover_in);
      ctx.el.addEventListener('focusout', hover_out);
      addDisposable(() => {
        ctx.el.removeEventListener('mouseenter', hover_in);
        ctx.el.removeEventListener('mouseleave', hover_out);
        ctx.el.removeEventListener('focusin', hover_in);
        ctx.el.removeEventListener('focusout', hover_out);
      });
    }

    // autoplay or touch = IO control
    if (ctx.mode === 'autoplay' || is_touch) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target !== ctx.el) return;
          if (entry.isIntersecting && entry.intersectionRatio >= io_threshold) {
            clearTimeout(ctx.reset_timer);
            // stamp intent for this start as well
            ctx.intent++;
            ctx._intent = ctx.intent;
            native_path ? start_native(ctx) : start_hls(ctx);
          } else {
            native_path ? stop_native(ctx) : stop_hls(ctx);
          }
        });
      }, { threshold: io_threshold });
      io.observe(ctx.el);
    }

    // status events
    ctx.video.addEventListener('playing', function () {
      set_status(ctx.el, 'playing');
      clearTimeout(ctx.watchdog_timer);
    });
    ctx.video.addEventListener('waiting', function () {
      var s = ctx.el.getAttribute('data-player-status');
      if (s !== 'idle') set_status(ctx.el, 'loading');
    });
    ctx.video.addEventListener('error', function () { set_status(ctx.el, 'error'); });
  });

  // public helpers: play/pause by element or selector
  function resolve_target(t) {
    if (!t) return null;
    if (typeof t === 'string') return document.querySelector(t);
    if (t.nodeType === 1) return t;
    return null;
  }

  window.bunnyThumbnailPlay = function (target) {
    var el = resolve_target(target);
    if (!el) return;
    var ctx = ctx_map.get(el);
    if (!ctx || !ctx.video || !ctx.src) return;
    var native_path = is_native(ctx);
    clearTimeout(ctx.reset_timer);
    // stamp intent for programmatic start
    ctx.intent++;
    ctx._intent = ctx.intent;
    native_path ? start_native(ctx) : start_hls(ctx);
  };

  window.bunnyThumbnailPause = function (target) {
    var el = resolve_target(target);
    if (!el) return;
    var ctx = ctx_map.get(el);
    if (!ctx || !ctx.video) return;
    var native_path = is_native(ctx);
    native_path ? stop_native(ctx) : stop_hls(ctx);
  };
}

function initCssIndexing() {
  const groups = document.querySelectorAll("[data-css-index-group]");
  if (!groups.length) return;

  groups.forEach((group) => {
    const items = group.querySelectorAll("[data-css-index-i]");
    items.forEach((el, i) => {
      el.style.setProperty("--i", i + 1);
    });
  });
}

function horizontalLoop(items, config) {
  let timeline;
  items = gsap.utils.toArray(items);
  config = config || {};
  gsap.context(() => {
    let onChange = config.onChange,
      lastIndex = 0,
      tl = gsap.timeline({
        repeat: config.repeat,
        onUpdate: onChange && function () {
          let i = tl.closestIndex();
          if (lastIndex !== i) {
            lastIndex = i;
            onChange(items[i], i);
          }
        },
        paused: config.paused,
        defaults: { ease: "none" },
        onReverseComplete: () => tl.totalTime(tl.rawTime() + tl.duration() * 100)
      }),
      length = items.length,
      startX = items[0].offsetLeft,
      times = [],
      widths = [],
      spaceBefore = [],
      xPercents = [],
      curIndex = 0,
      indexIsDirty = false,
      center = config.center,
      pixelsPerSecond = (config.speed || 1) * 100,
      snap = config.snap === false ? v => v : gsap.utils.snap(config.snap || 1),
      timeOffset = 0,
      container = center === true ? items[0].parentNode : gsap.utils.toArray(center)[0] ||
        items[0].parentNode,
      totalWidth,
      getTotalWidth = () => items[length - 1].offsetLeft + xPercents[length - 1] / 100 * widths[
        length - 1] - startX + spaceBefore[0] + items[length - 1].offsetWidth * gsap
          .getProperty(items[length - 1], "scaleX") + (parseFloat(config.paddingRight) || 0),
      populateWidths = () => {
        let b1 = container.getBoundingClientRect(),
          b2;
        items.forEach((el, i) => {
          widths[i] = parseFloat(gsap.getProperty(el, "width", "px"));
          xPercents[i] = snap(parseFloat(gsap.getProperty(el, "x", "px")) / widths[i] *
            100 + gsap.getProperty(el, "xPercent"));
          b2 = el.getBoundingClientRect();
          spaceBefore[i] = b2.left - (i ? b1.right : b1.left);
          b1 = b2;
        });
        gsap.set(items, {
          xPercent: i => xPercents[i]
        });
        totalWidth = getTotalWidth();
      },
      timeWrap,
      populateOffsets = () => {
        timeOffset = center ? tl.duration() * (container.offsetWidth / 2) / totalWidth : 0;
        center && times.forEach((t, i) => {
          times[i] = timeWrap(tl.labels["label" + i] + tl.duration() * widths[i] / 2 /
            totalWidth - timeOffset);
        });
      },
      getClosest = (values, value, wrap) => {
        let i = values.length,
          closest = 1e10,
          index = 0,
          d;
        while (i--) {
          d = Math.abs(values[i] - value);
          if (d > wrap / 2) {
            d = wrap - d;
          }
          if (d < closest) {
            closest = d;
            index = i;
          }
        }
        return index;
      },
      populateTimeline = () => {
        let i, item, curX, distanceToStart, distanceToLoop;
        tl.clear();
        for (i = 0; i < length; i++) {
          item = items[i];
          curX = xPercents[i] / 100 * widths[i];
          distanceToStart = item.offsetLeft + curX - startX + spaceBefore[0];
          distanceToLoop = distanceToStart + widths[i] * gsap.getProperty(item, "scaleX");
          tl.to(item, {
            xPercent: snap((curX - distanceToLoop) / widths[i] * 100),
            duration: distanceToLoop / pixelsPerSecond
          }, 0)
            .fromTo(item, {
              xPercent: snap((curX - distanceToLoop + totalWidth) / widths[i] *
                100)
            }, {
              xPercent: xPercents[i],
              duration: (curX - distanceToLoop +
                totalWidth - curX) / pixelsPerSecond,
              immediateRender: false
            },
              distanceToLoop / pixelsPerSecond)
            .add("label" + i, distanceToStart / pixelsPerSecond);
          times[i] = distanceToStart / pixelsPerSecond;
        }
        timeWrap = gsap.utils.wrap(0, tl.duration());
      },
      refresh = (deep) => {
        let progress = tl.progress();
        tl.progress(0, true);
        populateWidths();
        deep && populateTimeline();
        populateOffsets();
        deep && tl.draggable ? tl.time(times[curIndex], true) : tl.progress(progress, true);
      },
      onResize = () => refresh(true),
      proxy;
    gsap.set(items, { x: 0 });
    populateWidths();
    populateTimeline();
    populateOffsets();
    window.addEventListener("resize", onResize);

    function toIndex(index, vars) {
      vars = vars || {};
      (Math.abs(index - curIndex) > length / 2) && (index += index > curIndex ? -length :
        length); // always go in the shortest direction
      let newIndex = gsap.utils.wrap(0, length, index),
        time = times[newIndex];
      if (time > tl.time() !== index > curIndex && index !==
        curIndex) { // if we're wrapping the timeline's playhead, make the proper adjustments
        time += tl.duration() * (index > curIndex ? 1 : -1);
      }
      if (time < 0 || time > tl.duration()) {
        vars.modifiers = { time: timeWrap };
      }
      curIndex = newIndex;
      vars.overwrite = true;
      gsap.killTweensOf(proxy);
      return vars.duration === 0 ? tl.time(timeWrap(time)) : tl.tweenTo(time, vars);
    }
    tl.toIndex = (index, vars) => toIndex(index, vars);
    tl.closestIndex = setCurrent => {
      let index = getClosest(times, tl.time(), tl.duration());
      if (setCurrent) {
        curIndex = index;
        indexIsDirty = false;
      }
      return index;
    };
    tl.current = () => indexIsDirty ? tl.closestIndex(true) : curIndex;
    tl.next = vars => toIndex(tl.current() + 1, vars);
    tl.previous = vars => toIndex(tl.current() - 1, vars);
    tl.times = times;
    tl.progress(1, true).progress(0, true); // pre-render for performance
    if (config.reversed) {
      tl.vars.onReverseComplete();
      tl.reverse();
    }
    if (config.draggable && typeof (Draggable) === "function") {
      proxy = document.createElement("div")
      let wrap = gsap.utils.wrap(0, 1),
        ratio, startProgress, draggable, dragSnap, lastSnap, initChangeX, wasPlaying,
        align = () => tl.progress(wrap(startProgress + (draggable.startX - draggable.x) *
          ratio)),
        syncIndex = () => tl.closestIndex(true);
      typeof (InertiaPlugin) === "undefined" && console.warn(
        "InertiaPlugin required for momentum-based scrolling and snapping. https://greensock.com/club"
      );
      draggable = Draggable.create(proxy, {
        trigger: items[0].parentNode,
        type: "x",
        onPressInit() {
          let x = this.x;
          gsap.killTweensOf(tl);
          wasPlaying = !tl.paused();
          tl.pause();
          startProgress = tl.progress();
          refresh();
          ratio = 1 / totalWidth;
          initChangeX = (startProgress / -ratio) - x;
          gsap.set(proxy, { x: startProgress / -ratio });
        },
        onDrag: align,
        onThrowUpdate: align,
        overshootTolerance: 0,
        inertia: true,
        snap(value) {
          if (Math.abs(startProgress / -ratio - this.x) < 10) {
            return lastSnap + initChangeX
          }
          let time = -(value * ratio) * tl.duration(),
            wrappedTime = timeWrap(time),
            snapTime = times[getClosest(times, wrappedTime, tl.duration())],
            dif = snapTime - wrappedTime;
          Math.abs(dif) > tl.duration() / 2 && (dif += dif < 0 ? tl.duration() : -tl
            .duration());
          lastSnap = (time + dif) / tl.duration() / -ratio;
          return lastSnap;
        },
        onRelease() {
          syncIndex();
          draggable.isThrowing && (indexIsDirty = true);
        },
        onThrowComplete: () => {
          syncIndex();
          wasPlaying && tl.play();
        }
      })[0];
      tl.draggable = draggable;
    }
    tl.closestIndex(true);
    lastIndex = curIndex;
    onChange && onChange(items[curIndex], curIndex);
    timeline = tl;
    return () => window.removeEventListener("resize", onResize);
  });
  return timeline;
}

function initOsmoSlider() {
  const slide_duration = 1.5;
  const throw_max = 1;
  const throw_min = 0.5;
  const drag_res = 0.025;
  const throw_res = 2000;
  const click_ease = 'expo.out';
  const edge_res = 0.5;

  document.querySelectorAll('[data-gsap-slider-init]').forEach(root => {
    if (root._sliderDraggable) root._sliderDraggable.kill();
    if (root._sliderTimeline) root._sliderTimeline.kill();

    const collection = root.querySelector('[data-gsap-slider-collection]');
    const track = root.querySelector('[data-gsap-slider-list]');
    const items = Array.from(root.querySelectorAll('[data-gsap-slider-item]'));
    const controls = Array.from(root.querySelectorAll('[data-gsap-slider-control]'));
    if (!items.length) return;

    const rotate_step = parseFloat(root.getAttribute('data-gsap-slider-rotate')) || 0;

    const styles = getComputedStyle(root);
    const status_var = styles.getPropertyValue('--slider-status').trim();
    let spv_var = parseFloat(styles.getPropertyValue('--slider-spv'));

    const first_rect = items[0].getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(items[0]).marginRight) || 0;
    const item_w = first_rect.width;
    const item_h = first_rect.height;
    const slide_w = rotate_step > 0 ? item_w : (item_w +
      gap); // in rotate mode steps ignore gap

    if (isNaN(spv_var)) spv_var = collection.clientWidth / (item_w + gap);

    const spv = Math.max(1, Math.min(spv_var, items.length));
    const vis_count = Math.ceil(spv);
    const slider_enabled = status_var === 'on' && spv < items.length;
    if (!slider_enabled) {
      root.removeAttribute('data-gsap-drag-status');
      return;
    }

    root.setAttribute('data-gsap-drag-status', 'grab');

    const loop_attr = root.getAttribute('data-gsap-slider-loop') === 'true';
    const center_attr = root.getAttribute('data-gsap-slider-center') === 'true';
    const mod = (n, m) => ((n % m) + m) % m;

    const indicators = Array.from(root.querySelectorAll('[data-gsap-slider-active-slide]'));
    const setIndicator = (i) => {
      const v = i + 1;
      const s = v < 10 ? '0' + v : String(v);
      indicators.forEach(el => { el.textContent = s; });
    };
    const updateControlStatus = (activeIndex, len = items.length) => {
      controls.forEach(btn => {
        const val = btn.getAttribute('data-gsap-slider-control');
        if (/^\d+$/.test(val)) {
          const idx = Math.max(0, Math.min(len - 1, parseInt(val, 10) - 1));
          btn.setAttribute('data-gsap-slider-control-status', idx === activeIndex ?
            'active' : 'not-active');
        }
      });
    };

    // ROTATE MODE (no X move, true loop)
    if (rotate_step > 0) {
      const n = items.length;

      // wipe old visuals first (for breakpoint toggles)
      gsap.set(items, { clearProps: 'position,top,left,marginRight,transform' });
      items.forEach(el => el.removeAttribute('data-gsap-slider-item-status'));

      track.style.position = 'relative';
      track.style.height = item_h + 'px';

      items.forEach(el => {
        gsap.set(el, { xPercent: -50 });
      });

      const set_rot = items.map(el => gsap.quickSetter(el, 'rotate', 'deg'));

      const proxy = document.createElement('div');
      gsap.set(proxy, { x: 0 });

      const idx_from_proxy = () => -gsap.getProperty(proxy, 'x') / slide_w;

      const nearest_delta = (i, idx_real, len) => {
        const k = Math.round((idx_real - i) / len);
        return i - (idx_real - k * len);
      };

      function set_statuses(idx_real) {
        const idx_mod = mod(Math.round(idx_real), n);
        const left = Math.floor((vis_count - 1) / 2);
        const right = (vis_count - 1) - left;
        items.forEach(el => el.setAttribute('data-gsap-slider-item-status', 'not-active'));
        items[idx_mod].setAttribute('data-gsap-slider-item-status', 'active');
        for (let k = 1; k <= right; k++) items[mod(idx_mod + k, n)].setAttribute(
          'data-gsap-slider-item-status', 'inview');
        for (let k = 1; k <= left; k++) items[mod(idx_mod - k, n)].setAttribute(
          'data-gsap-slider-item-status', 'inview');
        setIndicator(idx_mod);
        updateControlStatus(idx_mod, n);
      }

      function render() {
        const idx_real = idx_from_proxy();
        for (let i = 0; i < n; i++) {
          set_rot[i](nearest_delta(i, idx_real, n) * rotate_step);
        }
        set_statuses(idx_real);
      }

      // buttons tween to exact snapped index targets (prevents post-ease jump)
      controls.forEach(btn => {
        btn.disabled = false;
        btn.setAttribute('data-gsap-slider-control-status', 'active');
        const dir = btn.getAttribute('data-gsap-slider-control') === 'next' ? -1 : 1;
        if (btn.getAttribute('data-gsap-slider-control') === 'next' || btn.getAttribute(
          'data-gsap-slider-control') === 'prev') {
          btn.onclick = () => {
            gsap.killTweensOf(proxy);
            const current_idx = idx_from_proxy();
            const target_idx = Math.round(current_idx) + (dir === -1 ? 1 : -
              1); // next = +1, prev = -1 in index space
            const target_x = -target_idx * slide_w; // exact center
            gsap.to(proxy, {
              x: target_x,
              duration: slide_duration,
              ease: click_ease,
              onUpdate: render
            });
          };
        } else if (/^\d+$/.test(btn.getAttribute('data-gsap-slider-control'))) {
          const targetZero = Math.max(0, Math.min(n - 1, parseInt(btn.getAttribute(
            'data-gsap-slider-control'), 10) - 1));
          btn.onclick = () => {
            gsap.killTweensOf(proxy);
            const idx_real = idx_from_proxy();
            const delta = nearest_delta(targetZero, idx_real, n);
            const target_idx = idx_real + delta;
            const target_x = -target_idx * slide_w;
            gsap.to(proxy, {
              x: target_x,
              duration: slide_duration,
              ease: click_ease,
              onUpdate: render
            });
          };
        }
      });

      root._sliderDraggable = Draggable.create(proxy, {
        type: 'x',
        trigger: collection,
        inertia: true,
        maxDuration: throw_max,
        minDuration: throw_min,
        dragResistance: drag_res,
        throwResistance: throw_res,
        bounds: null,
        edgeResistance: 0,
        snap: v => Math.round(v / slide_w) * slide_w,
        onDrag: render,
        onThrowUpdate: render,
        onThrowComplete: render,
        onPress: () => { root.setAttribute('data-gsap-drag-status', 'grabbing'); },
        onDragStart: () => { root.setAttribute('data-gsap-drag-status', 'grabbing'); },
        onRelease: () => { root.setAttribute('data-gsap-drag-status', 'grab'); },
        onThrowComplete: () => { root.setAttribute('data-gsap-drag-status', 'grab'); },
      })[0];

      gsap.set(track, { x: 0 });
      render();
      root._sliderTimeline = null;
      return;
    }

    // NORMAL MODE
    const wipe_visuals = () => {
      gsap.set(items, { clearProps: 'position,top,left,marginRight,transform' });
      track.style.height = '';
      track.style.position = '';
      items.forEach(el => el.removeAttribute('data-gsap-slider-item-status'));
    };
    wipe_visuals();

    const vw = collection.clientWidth;
    const offsets = items.map(el => el.offsetLeft);
    const container_center = vw / 2;

    function set_inview_by_index(active_idx) {
      const left = center_attr ? Math.floor((vis_count - 1) / 2) : 0;
      const right = center_attr ? (vis_count - 1 - left) : (vis_count - 1);
      items.forEach(el => el.setAttribute('data-gsap-slider-item-status', 'not-active'));
      items[mod(active_idx, items.length)].setAttribute('data-gsap-slider-item-status',
        'active');
      for (let k = 1; k <= right; k++) items[mod(active_idx + k, items.length)].setAttribute(
        'data-gsap-slider-item-status', 'inview');
      for (let k = 1; k <= left; k++) items[mod(active_idx - k, items.length)].setAttribute(
        'data-gsap-slider-item-status', 'inview');
      setIndicator(mod(active_idx, items.length));
      updateControlStatus(mod(active_idx, items.length), items.length);
    }

    if (root.getAttribute('data-gsap-slider-loop') === 'true') {
      const tl = horizontalLoop(items, {
        draggable: true,
        snap: 1,
        paused: true,
        center: center_attr ? collection : false,
        paddingRight: gap,
        onChange(_, i) { set_inview_by_index(i); }
      });

      if (tl.draggable) {
        Object.assign(tl.draggable.vars, {
          maxDuration: throw_max,
          minDuration: throw_min,
          dragResistance: drag_res,
          throwResistance: throw_res
        });
      }

      tl.toIndex(0, { duration: 0 });
      set_inview_by_index(0);

      controls.forEach(btn => {
        btn.disabled = false;
        btn.setAttribute('data-gsap-slider-control-status', 'active');
        const dir = btn.getAttribute('data-gsap-slider-control');
        if (dir === 'next') {
          btn.onclick = () => { tl.next({ duration: slide_duration, ease: click_ease }); };
        } else if (dir === 'prev') {
          btn.onclick = () => {
            tl.previous({
              duration: slide_duration,
              ease: click_ease
            });
          };
        } else if (/^\d+$/.test(dir)) {
          const targetZero = Math.max(0, Math.min(items.length - 1, parseInt(dir, 10) - 1));
          btn.onclick = () => {
            tl.toIndex(targetZero, {
              duration: slide_duration,
              ease: click_ease
            });
          };
        }
      });

      tl.progress(tl.progress()).pause();
      root._sliderTimeline = tl;
      root._sliderDraggable = tl.draggable;
      return;
    }

    let snap_points = [];
    let min_x, max_x;

    if (center_attr) {
      const half_pad = (vis_count - 1) / 2;
      const virtual_start = -half_pad * (item_w + gap);
      const virtual_end = offsets[offsets.length - 1] + item_w + half_pad * (item_w + gap);
      for (let i = 0; i < items.length; i++) {
        const item_center = offsets[i] + item_w / 2;
        snap_points.push(container_center - item_center);
      }
      min_x = container_center - virtual_end;
      max_x = container_center - virtual_start;
    } else {
      const max_start = Math.max(0, items.length - vis_count);
      for (let i = 0; i <= max_start; i++) snap_points.push(-offsets[i]);

      // extra end-snap so the last slide is reachable when spv is fractional
      const end_x = Math.min(0, vw - (offsets[offsets.length - 1] +
        item_w)); // = -(lastRight - vw)
      const current_min = Math.min(...snap_points);
      if (end_x < current_min - 0.5) snap_points.push(end_x);

      min_x = Math.min(...snap_points);
      max_x = Math.max(...snap_points);
    }

    let active_index = 0;
    const set_x = gsap.quickSetter(track, 'x', 'px');

    const nearest_snap_index = (x) => {
      let idx = 0,
        d = Infinity;
      for (let i = 0; i < snap_points.length; i++) {
        const di = Math.abs(snap_points[i] - x);
        if (di < d) {
          d = di;
          idx = i;
        }
      }
      return idx;
    };

    function update_controls() {
      const at_start = active_index === 0;
      const at_end = active_index === snap_points.length - 1;
      controls.forEach(btn => {
        const dir = btn.getAttribute('data-gsap-slider-control');
        const can = dir === 'prev' ? !at_start : !at_end;
        btn.disabled = !can;
        btn.setAttribute('data-gsap-slider-control-status', can ? 'active' : 'not-active');
      });
      updateControlStatus(active_index, items.length);
    }

    const update_from_x = (x) => {
      active_index = nearest_snap_index(x);
      set_inview_by_index(active_index);
      update_controls();
    };

    controls.forEach(btn => {
      const dir = btn.getAttribute('data-gsap-slider-control');
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (dir === 'next' || dir === 'prev') {
          const target = Math.max(0, Math.min(snap_points.length - 1, active_index + (
            dir === 'next' ? 1 : -1)));
          gsap.to(track, {
            duration: slide_duration,
            ease: click_ease,
            x: snap_points[target],
            onUpdate: () => update_from_x(gsap.getProperty(track, 'x')),
            onComplete: () => update_from_x(snap_points[target])
          });
        } else if (/^\d+$/.test(dir)) {
          const targetZero = Math.max(0, Math.min(snap_points.length - 1, parseInt(dir,
            10) - 1));
          gsap.to(track, {
            duration: slide_duration,
            ease: click_ease,
            x: snap_points[targetZero],
            onUpdate: () => update_from_x(gsap.getProperty(track, 'x')),
            onComplete: () => update_from_x(snap_points[targetZero])
          });
        }
      });
    });

    root._sliderDraggable = Draggable.create(track, {
      type: 'x',
      inertia: true,
      bounds: { minX: min_x, maxX: max_x },
      edgeResistance: edge_res,
      maxDuration: throw_max,
      minDuration: throw_min,
      dragResistance: drag_res,
      throwResistance: throw_res,
      snap: { x: v => snap_points[nearest_snap_index(v)], duration: slide_duration },
      onDrag() {
        set_x(this.x);
        update_from_x(this.x);
      },
      onThrowUpdate() {
        set_x(this.x);
        update_from_x(this.x);
      },
      onThrowComplete() {
        set_x(this.endX);
        update_from_x(this.endX);
      },
      onPress: () => { root.setAttribute('data-gsap-drag-status', 'grabbing'); },
      onDragStart: () => { root.setAttribute('data-gsap-drag-status', 'grabbing'); },
      onRelease: () => { root.setAttribute('data-gsap-drag-status', 'grab'); },
      onThrowComplete: () => { root.setAttribute('data-gsap-drag-status', 'grab'); },
    })[0];

    const start_x = snap_points[0] || 0;
    gsap.set(track, { x: start_x });
    update_from_x(start_x);
  });

  window.addEventListener('resize', debounceOnWidthChange(initOsmoSlider, 200));
}

function initBunnyPlayer() {
  window.__bunnyPlayers = window.__bunnyPlayers || new Map();

  window.playPlayerById = function (id, opts) {
    var entry = window.__bunnyPlayers.get(id);
    if (!entry) return;
    var startAt = (opts && typeof opts.startAt !== 'undefined') ? opts.startAt : null;
    entry.autoCloseOnEnd = true;
    if (entry._closeTimer) {
      clearTimeout(entry._closeTimer);
      entry._closeTimer = null;
    }
    if (entry.isLazy && !entry.isAttached()) entry.attach();
    if (startAt != null) {
      var t = parseTimeValue(startAt);
      if (t != null) {
        try {
          if (isFinite(entry.video.duration)) t = Math.max(0, Math.min(entry.video.duration, t));
          entry.video.currentTime = t;
        } catch (_) { }
      }
    }
    entry.player.setAttribute('data-player-open', 'true');
    entry.setActivated(true);
    entry.setStatus('loading');
    entry.safePlay(entry.video);
  };

  window.closePlayerById = function (id) {
    var entry = window.__bunnyPlayers.get(id);
    if (!entry) return;
    entry.autoCloseOnEnd = false;
    if (entry._closeTimer) clearTimeout(entry._closeTimer);
    entry.player.setAttribute('data-player-open', 'false');
    entry._closeTimer = setTimeout(function () {
      try { entry.video.pause(); } catch (_) { }
      try { entry.video.currentTime = 0; } catch (_) { }
      entry.setActivated(false);
      entry.setStatus('paused');
      entry._closeTimer = null;
    }, 900);
  };

  document.addEventListener('click', function (e) {
    var openBtn = e.target.closest('[data-player-control-open]');
    if (openBtn) {
      var id = openBtn.getAttribute('data-player-control-open');
      var start = openBtn.getAttribute('data-player-start');
      window.playPlayerById(id, { startAt: start });
      return;
    }
    var closeBtn = e.target.closest('[data-player-control-close]');
    if (closeBtn) {
      var idc = closeBtn.getAttribute('data-player-control-close');
      window.closePlayerById(idc);
    }
  }, true);

  document.querySelectorAll('[data-bunny-player-init]').forEach(function (player) {
    var src = player.getAttribute('data-player-src');
    if (!src) return;

    var video = player.querySelector('[data-player-video]');
    if (!video) return;

    initBunnyPlayerMirror(player, video);
    bindBunnyMirrorGuard(player, video);

    function bindBunnyMirrorGuard(player, mainVideo) {
      if (!player || !mainVideo || player._mirrorGuardBound) return;
      player._mirrorGuardBound = true;

      var mirrorRoot = player.querySelector('[data-player-mirror-init]');
      var mirrorVideo = mirrorRoot && mirrorRoot.querySelector('[data-player-mirror-video]');
      if (!mirrorRoot || !mirrorVideo) return;

      var isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
      var lastStatus = mirrorRoot.getAttribute('data-player-mirror-status') || 'idle';

      function keepAlive() {
        if (!isTouch) return;
        if (!mainVideo.paused) {
          try { mirrorVideo.play().catch(function () { }); } catch (_) { }
        }
      }

      mirrorVideo.addEventListener('pause', function () {
        if (!mainVideo.paused) keepAlive();
      });

      var mo = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (m.attributeName !== 'data-player-mirror-status') continue;
          var incoming = mirrorRoot.getAttribute('data-player-mirror-status') || '';
          if (isTouch && !mainVideo.paused && (incoming === 'idle' || incoming ===
            'error')) {
            mirrorRoot.setAttribute('data-player-mirror-status', lastStatus);
            keepAlive();
          } else {
            lastStatus = incoming;
          }
        }
      });
      mo.observe(mirrorRoot, {
        attributes: true,
        attributeFilter: [
          'data-player-mirror-status'
        ]
      });

      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) keepAlive();
      });
    }

    try { video.pause(); } catch (_) { }
    try {
      video.removeAttribute('src');
      video.load();
    } catch (_) { }

    function setStatus(s) {
      if (player.getAttribute('data-player-status') !== s) {
        player.setAttribute('data-player-status', s);
      }
    }

    function setMutedState(v) {
      video.muted = !!v;
      player.setAttribute('data-player-muted', video.muted ? 'true' : 'false');
    }

    function setFsAttr(v) {
      player.setAttribute('data-player-fullscreen', v ? 'true' :
        'false');
    }

    function setActivated(v) {
      player.setAttribute('data-player-activated', v ? 'true' :
        'false');
    }
    if (!player.hasAttribute('data-player-activated')) setActivated(false);

    var timeline = player.querySelector('[data-player-timeline]');
    var progressBar = player.querySelector('[data-player-progress]');
    var bufferedBar = player.querySelector('[data-player-buffered]');
    var handle = player.querySelector('[data-player-timeline-handle]');
    var timeDurationEls = player.querySelectorAll('[data-player-time-duration]');
    var timeProgressEls = player.querySelectorAll('[data-player-time-progress]');

    var updateSize = player.getAttribute('data-player-update-size');
    var lazyMode = player.getAttribute('data-player-lazy');
    var isLazyTrue = lazyMode === 'true';
    var isLazyMeta = lazyMode === 'meta';
    var autoplay = player.getAttribute('data-player-autoplay') === 'true';
    var initialMuted = player.getAttribute('data-player-muted') === 'true';

    var pendingPlay = false;
    var firstPlayLogged = false;
    var watched80Logged = false;

    if (autoplay) {
      setMutedState(true);
      video.loop = true;
    } else { setMutedState(initialMuted); }

    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.playsInline = true;
    if (typeof video.disableRemotePlayback !== 'undefined') video.disableRemotePlayback = true;
    if (autoplay) video.autoplay = false;

    var isSafariNative = !!video.canPlayType('application/vnd.apple.mpegurl');
    var canUseHlsJs = !!(window.Hls && Hls.isSupported()) && !isSafariNative;

    if (updateSize === 'true' && !isLazyMeta) {
      if (isLazyTrue) { } else {
        var prev = video.preload;
        video.preload = 'metadata';
        var onMeta2 = function () {
          setBeforeRatio(player, updateSize, video.videoWidth, video.videoHeight);
          video.removeEventListener('loadedmetadata', onMeta2);
          video.preload = prev || '';
        };
        video.addEventListener('loadedmetadata', onMeta2, { once: true });
        video.src = src;
      }
    }

    function fetchMetaOnce() {
      getSourceMeta(src, canUseHlsJs).then(function (meta) {
        if (meta.width && meta.height) setBeforeRatio(player, updateSize, meta.width, meta
          .height);
        if (timeDurationEls.length && isFinite(meta.duration) && meta.duration > 0) {
          setText(timeDurationEls, formatTime(meta.duration));
        }
        readyIfIdle(player, pendingPlay);
      });
    }

    var isAttached = false;
    var userInteracted = false;
    var lastPauseBy = '';

    function attachMediaOnce() {
      if (isAttached) return;
      isAttached = true;

      if (player._hls) { try { player._hls.destroy(); } catch (_) { } player._hls = null; }

      if (isSafariNative) {
        video.preload = (isLazyTrue || isLazyMeta) ? 'auto' : video.preload;
        video.src = src;
        video.addEventListener('loadedmetadata', function () {
          readyIfIdle(player, pendingPlay);
          if (updateSize === 'true') setBeforeRatio(player, updateSize, video.videoWidth,
            video.videoHeight);
          if (timeDurationEls.length) setText(timeDurationEls, formatTime(video.duration));
        }, { once: true });
      } else if (canUseHlsJs) {
        var hls = new Hls({ maxBufferLength: 10 });
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, function () { hls.loadSource(src); });
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          readyIfIdle(player, pendingPlay);
          if (updateSize === 'true') {
            var lvls = hls.levels || [];
            var best = bestLevel(lvls);
            if (best && best.width && best.height) setBeforeRatio(player, updateSize, best
              .width, best.height);
          }
        });
        hls.on(Hls.Events.LEVEL_LOADED, function (e, data) {
          if (data && data.details && isFinite(data.details.totalduration)) {
            if (timeDurationEls.length) setText(timeDurationEls, formatTime(data.details
              .totalduration));
          }
        });
        player._hls = hls;
      } else {
        video.src = src;
      }
    }

    if (isLazyMeta) {
      fetchMetaOnce();
      video.preload = 'none';
    } else if (isLazyTrue) {
      video.preload = 'none';
    } else {
      attachMediaOnce();
    }

    function togglePlay() {
      userInteracted = true;
      if (video.paused || video.ended) {
        if ((isLazyTrue || isLazyMeta) && !isAttached) attachMediaOnce();
        pendingPlay = true;
        lastPauseBy = '';
        setStatus('loading');
        safePlay(video);
      } else {
        lastPauseBy = 'manual';
        video.pause();
      }
    }

    function toggleMute() {
      video.muted = !video.muted;
      player.setAttribute('data-player-muted', video.muted ? 'true' : 'false');
    }

    function isFsActive() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function enterFullscreen() {
      if (player.requestFullscreen) return player.requestFullscreen();
      if (video.requestFullscreen) return video.requestFullscreen();
      if (video.webkitSupportsFullscreen && typeof video.webkitEnterFullscreen === 'function')
        return video.webkitEnterFullscreen();
    }

    function exitFullscreen() {
      if (document.exitFullscreen) return document.exitFullscreen();
      if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
      if (video.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === 'function')
        return video.webkitExitFullscreen();
    }

    function toggleFullscreen() {
      if (isFsActive() || video.webkitDisplayingFullscreen)
        exitFullscreen();
      else enterFullscreen();
    }
    document.addEventListener('fullscreenchange', function () { setFsAttr(isFsActive()); });
    document.addEventListener('webkitfullscreenchange', function () {
      setFsAttr(
        isFsActive());
    });
    video.addEventListener('webkitbeginfullscreen', function () { setFsAttr(true); });
    video.addEventListener('webkitendfullscreen', function () { setFsAttr(false); });

    player.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-player-control]');
      if (!btn || !player.contains(btn)) return;
      var type = btn.getAttribute('data-player-control');
      if (type === 'play' || type === 'pause' || type === 'playpause') togglePlay();
      else if (type === 'mute') toggleMute();
      else if (type === 'fullscreen') toggleFullscreen();
    });

    player.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-player-control-set-time]');
      if (!btn || !player.contains(btn)) return;

      var val = btn.getAttribute('data-player-control-set-time');
      var t = parseTimeValue(val);
      if (t == null) return;

      if ((isLazyTrue || isLazyMeta) && !isAttached) attachMediaOnce();

      var wasPlaying = !video.paused && !video.ended;
      if (isFinite(video.duration)) t = Math.max(0, Math.min(video.duration, t));

      try { video.currentTime = t; } catch (_) { }

      if (wasPlaying) { safePlay(video); }
      else {
        updateProgressVisuals();
        updateTimeTexts();
      }
    }, { passive: true });

    function updateTimeTexts() {
      if (timeDurationEls.length) setText(timeDurationEls, formatTime(video.duration));
      if (timeProgressEls.length) setText(timeProgressEls, formatTime(video.currentTime));
    }
    video.addEventListener('timeupdate', updateTimeTexts);
    video.addEventListener('timeupdate', function () {
      if (watched80Logged) return;
      var d = video.duration;
      if (!isFinite(d) || d <= 0) return;
      var pct = video.currentTime / d;
      if (pct >= 0.8) {
        watched80Logged = true;
      }
    });
    video.addEventListener('loadedmetadata', function () {
      updateTimeTexts();
      maybeSetRatioFromVideo(player, updateSize, video);
    });
    video.addEventListener('loadeddata', function () {
      maybeSetRatioFromVideo(player,
        updateSize, video);
    });
    video.addEventListener('playing', function () {
      maybeSetRatioFromVideo(player, updateSize,
        video);
    });
    video.addEventListener('durationchange', updateTimeTexts);

    var rafId;

    function updateProgressVisuals() {
      if (!video.duration) return;
      var playedPct = (video.currentTime / video.duration) * 100;
      if (progressBar) progressBar.style.transform = 'translateX(' + (-100 + playedPct) + '%)';
      if (handle) handle.style.left = playedPct + '%';
    }

    function loop() {
      updateProgressVisuals();
      if (!video.paused && !video.ended) rafId = requestAnimationFrame(loop);
    }

    function updateBufferedBar() {
      if (!bufferedBar || !video.duration || !video.buffered.length) return;
      var end = video.buffered.end(video.buffered.length - 1);
      var buffPct = (end / video.duration) * 100;
      bufferedBar.style.transform = 'translateX(' + (-100 + buffPct) + '%)';
    }
    video.addEventListener('progress', updateBufferedBar);
    video.addEventListener('loadedmetadata', updateBufferedBar);
    video.addEventListener('durationchange', updateBufferedBar);

    video.addEventListener('play', function () {
      if (!firstPlayLogged) {
        firstPlayLogged = true;
      }
      setActivated(true);
      cancelAnimationFrame(rafId);
      loop();
      setStatus('playing');
    });
    video.addEventListener('playing', function () {
      pendingPlay = false;
      setStatus('playing');
    });
    video.addEventListener('pause', function () {
      pendingPlay = false;
      cancelAnimationFrame(rafId);
      updateProgressVisuals();
      setStatus('paused');
    });
    video.addEventListener('waiting', function () { setStatus('loading'); });
    video.addEventListener('canplay', function () { readyIfIdle(player, pendingPlay); });
    video.addEventListener('ended', function () {
      if (!watched80Logged) {
        var d = video.duration;
        if (isFinite(d) && d > 0 && (video.currentTime / d) >= 0.8) {
          watched80Logged = true;
        }
      }
      var id = player._playerId || '';
      if (id) {
        var ent = window.__bunnyPlayers.get(id);
        if (ent && ent.autoCloseOnEnd) { window.closePlayerById(id); return; }
      }
      pendingPlay = false;
      cancelAnimationFrame(rafId);
      updateProgressVisuals();
      setStatus('paused');
      setActivated(false);
    });

    if (timeline) {
      var dragging = false,
        wasPlaying = false,
        targetTime = 0,
        lastSeekTs = 0,
        seekThrottle = 180,
        rect = null;
      window.addEventListener('resize', function () { if (!dragging) rect = null; });

      function getFractionFromX(x) {
        if (!rect) rect = timeline.getBoundingClientRect();
        var f = (x - rect.left) / rect.width;
        if (f < 0) f = 0;
        if (f > 1) f = 1;
        return f;
      }

      function previewAtFraction(f) {
        if (!video.duration) return;
        var pct = f * 100;
        if (progressBar) progressBar.style.transform = 'translateX(' + (-100 + pct) + '%)';
        if (handle) handle.style.left = pct + '%';
        if (timeProgressEls.length) setText(timeProgressEls, formatTime(f * video.duration));
      }

      function maybeSeek(now) {
        if (!video.duration) return;
        if ((now - lastSeekTs) < seekThrottle) return;
        lastSeekTs = now;
        video.currentTime = targetTime;
      }

      function onPointerDown(e) {
        if (!video.duration) return;
        dragging = true;
        wasPlaying = !video.paused && !video.ended;
        if (wasPlaying) video.pause();
        player.setAttribute('data-timeline-drag', 'true');
        rect = timeline.getBoundingClientRect();
        var f = getFractionFromX(e.clientX);
        targetTime = f * video.duration;
        previewAtFraction(f);
        maybeSeek(performance.now());
        timeline.setPointerCapture && timeline.setPointerCapture(e.pointerId);
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        e.preventDefault();
      }

      function onPointerMove(e) {
        if (!dragging) return;
        var f = getFractionFromX(e.clientX);
        targetTime = f * video.duration;
        previewAtFraction(f);
        maybeSeek(performance.now());
        e.preventDefault();
      }

      function onPointerUp() {
        if (!dragging) return;
        dragging = false;
        player.setAttribute('data-timeline-drag', 'false');
        rect = null;
        video.currentTime = targetTime;
        if (wasPlaying) safePlay(video);
        else {
          updateProgressVisuals();
          updateTimeTexts();
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }
      timeline.addEventListener('pointerdown', onPointerDown, { passive: false });
      if (handle) handle.addEventListener('pointerdown', onPointerDown, { passive: false });
    }

    var hoverTimer;
    var hoverHideDelay = 3000;

    function setHover(state) {
      if (player.getAttribute('data-player-hover') !== state) {
        player.setAttribute('data-player-hover', state);
      }
    }

    function scheduleHide() {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () { setHover('idle'); }, hoverHideDelay);
    }

    function wakeControls() {
      setHover('active');
      scheduleHide();
    }
    player.addEventListener('pointerdown', wakeControls);
    document.addEventListener('fullscreenchange', wakeControls);
    document.addEventListener('webkitfullscreenchange', wakeControls);
    var trackingMove = false;

    function onPointerMoveGlobal(e) {
      var r = player.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r
        .bottom) wakeControls();
    }
    player.addEventListener('pointerenter', function () {
      wakeControls();
      if (!trackingMove) {
        trackingMove = true;
        window.addEventListener('pointermove', onPointerMoveGlobal, { passive: true });
      }
    });
    player.addEventListener('pointerleave', function () {
      setHover('idle');
      clearTimeout(hoverTimer);
      if (trackingMove) {
        trackingMove = false;
        window.removeEventListener('pointermove', onPointerMoveGlobal);
      }
    });

    if (autoplay) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var inView = entry.isIntersecting && entry.intersectionRatio > 0;
          if (inView) {
            if ((isLazyTrue || isLazyMeta) && !isAttached) attachMediaOnce();
            if ((lastPauseBy === 'io') || (video.paused && lastPauseBy !== 'manual')) {
              setStatus('loading');
              if (video.paused) togglePlay();
              lastPauseBy = '';
            }
          } else {
            if (!video.paused && !video.ended) {
              lastPauseBy = 'io';
              video.pause();
            }
          }
        });
      }, { threshold: 0.1 });
      io.observe(player);
    }

    var playerId = player.getAttribute('data-player-id') || '';
    var isLazy = (lazyMode === 'true' || lazyMode === 'meta');
    if (playerId) {
      player._playerId = playerId;
      window.__bunnyPlayers.set(playerId, {
        id: playerId,
        player: player,
        video: video,
        isLazy: isLazy,
        isAttached: function () { return !!isAttached; },
        attach: attachMediaOnce,
        safePlay: safePlay,
        setActivated: setActivated,
        setStatus: setStatus,
        autoCloseOnEnd: false,
        _closeTimer: null
      });
    }
  });

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '00:00';
    var s = Math.floor(sec),
      h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      r = s % 60;
    return h > 0 ? (h + ':' + pad2(m) + ':' + pad2(r)) : (pad2(m) + ':' + pad2(r));
  }

  function parseTimeValue(s) {
    if (!s && s !== 0) return null;
    s = ('' + s).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    var p = s.split(':').map(Number);
    if (p.some(isNaN)) return null;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return null;
  }

  function setText(nodes, text) { nodes.forEach(function (n) { n.textContent = text; }); }

  function bestLevel(levels) {
    if (!levels || !levels.length) return null;
    return levels.reduce(function (a, b) { return ((b.width || 0) > (a.width || 0)) ? b : a; },
      levels[0]);
  }

  function safePlay(video) {
    var p = video.play();
    if (p && typeof p.then === 'function') p.catch(function () { });
  }

  function readyIfIdle(player, pendingPlay) {
    if (!pendingPlay &&
      player.getAttribute('data-player-activated') !== 'true' &&
      player.getAttribute('data-player-status') === 'idle') {
      player.setAttribute('data-player-status', 'ready');
    }
  }

  function setBeforeRatio(player, updateSize, w, h) {
    if (updateSize !== 'true' || !w || !h) return;
    var before = player.querySelector('[data-player-before]');
    if (!before) return;
    before.style.paddingTop = (h / w * 100) + '%';
  }

  function maybeSetRatioFromVideo(player, updateSize, video) {
    if (updateSize !== 'true') return;
    var before = player.querySelector('[data-player-before]');
    if (!before) return;
    var hasPad = before.style.paddingTop && before.style.paddingTop !== '0%';
    if (!hasPad && video.videoWidth && video.videoHeight) {
      setBeforeRatio(player, updateSize, video.videoWidth, video.videoHeight);
    }
  }

  function resolveUrl(base, rel) {
    try { return new URL(rel, base).toString(); } catch (
    _) { return rel; }
  }

  function getSourceMeta(src, useHlsJs) {
    return new Promise(function (resolve) {
      if (useHlsJs && window.Hls && Hls.isSupported()) {
        try {
          var tmp = new Hls();
          var out = { width: 0, height: 0, duration: NaN };
          var haveLvls = false,
            haveDur = false;

          tmp.on(Hls.Events.MANIFEST_PARSED, function (e, data) {
            var lvls = (data && data.levels) || tmp.levels || [];
            var best = bestLevel(lvls);
            if (best && best.width && best.height) {
              out.width = best.width;
              out.height = best.height;
              haveLvls = true;
            }
          });
          tmp.on(Hls.Events.LEVEL_LOADED, function (e, data) {
            if (data && data.details && isFinite(data.details.totalduration)) {
              out
                .duration = data.details.totalduration;
              haveDur = true;
            }
          });
          tmp.on(Hls.Events.ERROR, function () {
            try { tmp.destroy(); } catch (_) { } resolve(
              out);
          });
          tmp.on(Hls.Events.LEVEL_LOADED, function () {
            try { tmp.destroy(); } catch (
            _) { } resolve(out);
          });

          tmp.loadSource(src);
          return;
        } catch (_) {
          resolve({ width: 0, height: 0, duration: NaN });
          return;
        }
      }

      function parseMaster(masterText) {
        var lines = masterText.split(/\r?\n/);
        var bestW = 0,
          bestH = 0,
          firstMedia = null,
          lastInf = null;
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
            lastInf = line;
          } else if (lastInf && line && line[0] !== '#') {
            if (!firstMedia) firstMedia = line.trim();
            var m = /RESOLUTION=(\d+)x(\d+)/.exec(lastInf);
            if (m) {
              var w = parseInt(m[1], 10),
                h = parseInt(m[2], 10);
              if (w > bestW) {
                bestW = w;
                bestH = h;
              }
            }
            lastInf = null;
          }
        }
        return { bestW: bestW, bestH: bestH, media: firstMedia };
      }

      function sumDuration(mediaText) {
        var dur = 0,
          re = /#EXTINF:([\d.]+)/g,
          m;
        while ((m = re.exec(mediaText))) dur += parseFloat(m[1]);
        return dur;
      }

      fetch(src, { credentials: 'omit', cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('master');
        return r.text();
      }).then(function (master) {
        var info = parseMaster(master);
        if (!info.media) {
          resolve({
            width: info.bestW || 0,
            height: info.bestH || 0,
            duration: NaN
          });
          return;
        }
        var mediaUrl = resolveUrl(src, info.media);
        return fetch(mediaUrl, { credentials: 'omit', cache: 'no-store' }).then(function (
          r) {
          if (!r.ok) throw new Error('media');
          return r.text();
        }).then(function (mediaText) {
          resolve({
            width: info.bestW || 0,
            height: info.bestH || 0,
            duration: sumDuration(mediaText)
          });
        });
      }).catch(function () { resolve({ width: 0, height: 0, duration: NaN }); });
    });
  }

  function initBunnyPlayerFirstClickUnmute() {
    const cover = document.querySelector('.custom-player__cover-unmute');
    if (!cover) return;

    function onDocClick(e) {
      const root = e.target.closest('.custom-player');
      if (!root) return;

      const v = root.querySelector('[data-player-video]');
      if (!v) return;

      const isMuteBtn = e.target.closest('[data-player-control="mute"]');
      if (!isMuteBtn) {
        v.muted = false;
        v.removeAttribute('muted');
        root.setAttribute('data-player-muted', 'false');
      }

      cover.style.display = 'none';
      document.removeEventListener('click', onDocClick, true);
    }

    document.addEventListener('click', onDocClick, true);
  }
  initBunnyPlayerFirstClickUnmute();

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      var openPlayer = null;
      window.__bunnyPlayers.forEach(function (entry) {
        if (entry.player.getAttribute('data-player-open') === 'true') {
          openPlayer = entry;
        }
      });
      if (openPlayer) window.closePlayerById(openPlayer.id);
    }
  });
}

function initBunnyPlayerMirror(player, mainVideo) {
  var mirrorRoot = player.querySelector('[data-player-mirror-init]');
  if (!mirrorRoot || mirrorRoot._mirrorBound) return;
  mirrorRoot._mirrorBound = true;

  var mirrorVideo = mirrorRoot.querySelector('[data-player-mirror-video]');
  if (!mirrorVideo) return;

  var mirrorSrc = mirrorRoot.getAttribute('data-player-mirror-src') || '';
  if (!mirrorSrc) { mirrorRoot.setAttribute('data-player-mirror-status', 'idle'); return; }

  function setMirrorStatus(s) {
    if (mirrorRoot.getAttribute('data-player-mirror-status') !== s) {
      mirrorRoot.setAttribute('data-player-mirror-status', s);
    }
  }

  var isSafariNative = !!mirrorVideo.canPlayType && !!mirrorVideo.canPlayType(
    'application/vnd.apple.mpegurl');
  var canUseHlsJs = !!(window.Hls && Hls.isSupported()) && !isSafariNative;

  mirrorVideo.muted = true;
  mirrorVideo.setAttribute('muted', '');
  mirrorVideo.setAttribute('playsinline', '');
  mirrorVideo.setAttribute('webkit-playsinline', '');
  mirrorVideo.playsInline = true;
  if (typeof mirrorVideo.disableRemotePlayback !== 'undefined') mirrorVideo.disableRemotePlayback =
    true;

  var attached = false;
  var retryCount = 0;
  var retryTimer = null;
  var maxRetries = 3;
  var h = null;
  var lastTimeTick = 0;
  var stallWatch = null;

  function clearWatch() {
    if (stallWatch) {
      clearTimeout(stallWatch);
      stallWatch = null;
    }
  }

  function armWatch() {
    clearWatch();
    var startTime = mirrorVideo.currentTime || 0;
    stallWatch = setTimeout(function () {
      var advanced = isFinite(mirrorVideo.currentTime) && (mirrorVideo.currentTime > startTime +
        0.01);
      if (!advanced && !mirrorVideo.paused) scheduleRetry();
    }, 2000);
  }

  function scheduleRetry() {
    if (retryCount >= maxRetries) { setMirrorStatus('error'); return; }
    retryCount++;
    clearTimeout(retryTimer);
    clearWatch();
    setMirrorStatus('loading');
    retryTimer = setTimeout(function () {
      attached = false;
      if (h) { try { h.destroy(); } catch (_) { } h = null; }
      try { mirrorVideo.pause(); } catch (_) { }
      try {
        mirrorVideo.removeAttribute('src');
        mirrorVideo.load();
      } catch (_) { }
      attachMirrorOnce();
      if (!mainVideo.paused) { try { mirrorVideo.play().catch(function () { }); } catch (_) { } }
    }, 400 * Math.pow(2, retryCount));
  }

  function attachMirrorOnce() {
    if (attached) return;
    attached = true;
    setMirrorStatus('attaching');

    try { mirrorVideo.pause(); } catch (_) { }
    try {
      mirrorVideo.removeAttribute('src');
      mirrorVideo.load();
    } catch (_) { }

    if (isSafariNative) {
      mirrorVideo.src = mirrorSrc;
    } else if (canUseHlsJs) {
      h = new Hls({ maxBufferLength: 8 });
      h.attachMedia(mirrorVideo);
      h.on(Hls.Events.MEDIA_ATTACHED, function () { h.loadSource(mirrorSrc); });
      h.on(Hls.Events.ERROR, function (_, data) {
        if (data && data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try { h.startLoad(); } catch (_) { }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { h.recoverMediaError(); } catch (_) { }
          } else {
            try { h.destroy(); } catch (_) { }
            h = null;
            scheduleRetry();
          }
        }
      });
      mirrorRoot._hls = h;
    } else {
      mirrorVideo.src = mirrorSrc;
    }
  }

  function hardSyncTime() {
    if (!isFinite(mainVideo.currentTime)) return;
    try { mirrorVideo.currentTime = mainVideo.currentTime; } catch (_) { }
  }

  // Minimal kick that emulates your manual play/pause fix
  function kickMirror() {
    try { mirrorVideo.pause(); } catch (_) { }
    try { mirrorVideo.play().catch(function () { }); } catch (_) { }
  }

  mainVideo.addEventListener('play', function () {
    retryCount = 0;
    attachMirrorOnce();
    try {
      mirrorVideo.play().then(function () { armWatch(); }).catch(function () {
        scheduleRetry
          ();
      });
    } catch (_) { scheduleRetry(); }
  });

  mainVideo.addEventListener('pause', function () {
    clearWatch();
    try { mirrorVideo.pause(); } catch (_) { }
  });

  mainVideo.addEventListener('seeking', hardSyncTime);
  mainVideo.addEventListener('seeked', hardSyncTime);

  mainVideo.addEventListener('timeupdate', function () {
    var a = mainVideo.currentTime,
      b = mirrorVideo.currentTime,
      d = mainVideo.duration || 0;

    // Detect wrap to start
    if (d && a < 0.05 && lastTimeTick > d - 0.2) {
      try { mirrorVideo.currentTime = 0; } catch (_) { }
      kickMirror(); // ← force decoder to refresh like your manual toggle
    } else if (isFinite(a) && isFinite(b) && Math.abs(a - b) > 0.2) {
      hardSyncTime();
    }

    lastTimeTick = a;
  });

  mainVideo.addEventListener('ratechange', function () {
    mirrorVideo.playbackRate = mainVideo.playbackRate || 1;
  });

  mainVideo.addEventListener('ended', function () {
    clearWatch();
    try { mirrorVideo.pause(); } catch (_) { }
    try { mirrorVideo.currentTime = 0; } catch (_) { }
    if (mainVideo.loop) { kickMirror(); }
  });

  mirrorVideo.addEventListener('loadedmetadata', function () { setMirrorStatus('ready'); });
  mirrorVideo.addEventListener('canplay', function () { setMirrorStatus('ready'); });
  mirrorVideo.addEventListener('playing', function () {
    setMirrorStatus('playing');
    armWatch();
  });
  mirrorVideo.addEventListener('pause', function () {
    setMirrorStatus('paused');
    clearWatch();
  });
  mirrorVideo.addEventListener('waiting', function () {
    setMirrorStatus('loading');
    armWatch();
  });
  mirrorVideo.addEventListener('stalled', function () {
    setMirrorStatus('loading');
    armWatch();
  });
  mirrorVideo.addEventListener('error', function () { scheduleRetry(); });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearWatch(); try { mirrorVideo.pause(); } catch (_) { } }
    else if (!mainVideo.paused) {
      try {
        mirrorVideo.play().then(armWatch).catch(
          function () { scheduleRetry(); });
      } catch (_) { scheduleRetry(); }
    }
  });

  setMirrorStatus('idle');
}

function init404() {
  const canvas = document.querySelector('[data-404-trail]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  const OPT = {
    img: 'https://cdn.prod.website-files.com/68a5787bba0829184628bd51/68f0af4021330d68b3e9d0e6_404-img.avif',
    speedMobile: 100,
    speedDesktop: 250,
    cornerMobile: 10,
    cornerDesktop: 20,
    trailLife: 5,
    trailGap: 10,
    gifStagger: 0.05,
    gifMax: 10,
    fadeDur: 0.25
  };

  const GIFS = [
    'https://osmo.b-cdn.net/website/404-gifs/Tim%20And%20Eric%20Omg%20GIF.gif',
    'https://osmo.b-cdn.net/website/404-gifs/Oh%20My%20God%20Wow%20GIF%20by%209Now.gif',
    'https://osmo.b-cdn.net/website/404-gifs/Reaction%20Ok%20GIF.gif',
    'https://osmo.b-cdn.net/website/404-gifs/Happy%20My%20Song%20GIF%20by%20Justin.gif',
    'https://osmo.b-cdn.net/website/404-gifs/Jimmy%20Fallon%20Reaction%20GIF%20by%20The%20Tonight%20Show%20Starring%20Jimmy%20Fallon.gif',
    'https://osmo.b-cdn.net/website/404-gifs/Happy%20Winnie%20The%20Pooh%20GIF%20by%20Leon%20Denise.gif',
    'https://osmo.b-cdn.net/website/404-gifs/america%20burn%20GIF.gif',
    'https://osmo.b-cdn.net/website/404-gifs/Proud%20Of%20You%20Yes%20GIF.gif',
    'https://osmo.b-cdn.net/website/404-gifs/Sacha%20Baron%20Cohen%20Thumbs%20Up%20GIF%20by%20Amazon%20Prime%20Video.gif',
    'https://osmo.b-cdn.net/website/404-gifs/The%20Office%20Party%20Hard%20GIF.gif',
    'https://osmo.b-cdn.net/website/404-gifs/Noice%20Thats%20Nice%20GIF%20(1).gif'
  ];

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const trailGap2 = OPT.trailGap * OPT.trailGap;

  const state = {
    viewW: 0,
    viewH: 0,
    w: 0,
    h: 0,
    x: 60,
    y: 60,
    vx: 0,
    vy: 0,
    last: { x: 60, y: 60 },
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    cornerTol: 40,
    trail: [],
    spriteAlpha: 1,
    fade: null
  };

  let speed = window.innerWidth <= 767 ? OPT.speedMobile : OPT.speedDesktop;
  state.cornerTol = window.innerWidth <= 767 ? OPT.cornerMobile : OPT.cornerDesktop;

  let isBurst = false;
  let isPaused = false;

  const sprite = new Image();
  sprite.crossOrigin = 'anonymous';
  sprite.src = OPT.img;

  const gifCache = new Map();
  const loadImg = url => gifCache.get(url) || gifCache.set(url, new Promise(res => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => res(true);
    i.onerror = () => res(false);
    i.src = url;
  })).get(url);

  const preloadGifs = () => {
    const kick = () => setTimeout(() => GIFS.forEach(loadImg), 350);
    if ('requestIdleCallback' in window) requestIdleCallback(kick, { timeout: 2000 });
    else window.addEventListener('load', kick, { once: true });
  };

  function setCenterPosition() {
    state.x = (state.viewW - state.w) * 0.5;
    state.y = (state.viewH - state.h) * 0.5;
  }

  function setDiagonalDirection() {
    const dirs = [
      { x: 1, y: 1 }, // SE
      { x: -1, y: 1 }, // SW
      { x: 1, y: -1 }, // NE
      { x: -1, y: -1 } // NW
    ];
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    state.vx = d.x * speed;
    state.vy = d.y * speed;
  }

  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      vw = window.innerWidth;
    const oldSignX = Math.sign(state.vx) || 1;
    const oldSignY = Math.sign(state.vy) || 1;

    speed = vw <= 767 ? OPT.speedMobile : OPT.speedDesktop;
    state.cornerTol = vw <= 767 ? OPT.cornerMobile : OPT.cornerDesktop;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    state.viewW = w;
    state.viewH = h;

    const base = vw >= 992 ? vw * 0.20 : vw >= 768 ? vw * 0.22 : vw * 0.35;
    const ratio = sprite.width && sprite.height ? sprite.width / sprite.height : 1;
    state.h = base;
    state.w = base * ratio;

    state.minX = 0;
    state.minY = 0;
    state.maxX = state.viewW - state.w;
    state.maxY = state.viewH - state.h;

    state.x = Math.min(Math.max(state.x, state.minX), Math.max(state.minX, state.maxX));
    state.y = Math.min(Math.max(state.y, state.minY), Math.max(state.minY, state.maxY));

    state.vx = oldSignX * Math.abs(speed);
    state.vy = oldSignY * Math.abs(speed);
  }

  function cornerZone(x, y) {
    const t = state.cornerTol;
    const nx = x <= state.minX + t || x >= state.maxX - t;
    const ny = y <= state.minY + t || y >= state.maxY - t;
    return nx && ny;
  }

  function startFade(to, now) {
    state.fade = { from: state.spriteAlpha, to, start: now, dur: OPT.fadeDur };
  }

  function applyFade(now) {
    if (!state.fade) return;
    const { from, to, start, dur } = state.fade;
    const t = Math.min(1, Math.max(0, (now - start) / dur));
    state.spriteAlpha = from + (to - from) * t;
    if (t >= 1) state.fade = null;
  }

  async function triggerCorner() {
    if (isBurst || !GIFS.length) return;
    isBurst = true;
    isPaused = true;
    startFade(0, performance.now() / 1000);

    const wrap = document.querySelector('[data-gif-wrap]');
    if (!wrap) {
      isBurst = false;
      isPaused = false;
      startFade(1, performance.now() / 1000); return;
    }
    const items = wrap.querySelectorAll('[data-gif-item]');
    if (!items.length) {
      isBurst = false;
      isPaused = false;
      startFade(1, performance.now() / 1000); return;
    }

    items.forEach(el => el.innerHTML = '');

    const hiddenTags = document.querySelector('.nf-overlay__tags');

    for (let i = 0; i < Math.min(GIFS.length, items.length); i++) {
      await loadImg(GIFS[i]);

      // append the GIF image
      const img = document.createElement('img');
      img.src = GIFS[i];
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'eager';
      img.style.cssText = 'display:block;width:100%;height:auto;';
      items[i].appendChild(img);

      if (i === 8 && hiddenTags) {
        items[i].classList.add('is--9');
        hiddenTags.removeAttribute('hidden');
        hiddenTags.style.display = '';
        items[i].appendChild(hiddenTags.cloneNode(true));

        if (window.gsap) {
          gsap.fromTo(hiddenTags, { autoAlpha: 0, scale: 0.9 }, {
            autoAlpha: 1, scale: 1,
            duration: 0.25, ease: 'back.out(1.5)', delay: i * OPT.gifStagger
          });
        }
      }

      if (window.gsap) {
        gsap.fromTo(items[i], { opacity: 0, scale: 0.9 }, {
          opacity: 1, scale: 1, duration: 0.25,
          ease: 'back.out(1.5)', delay: i * OPT.gifStagger
        });
        gsap.to('.notfound__inner', { autoAlpha: 0, duration: 0.25 });
      }

      await new Promise(r => setTimeout(r, OPT.gifStagger * 1000));
    }

    setTimeout(() => {
      if (window.gsap) {
        gsap.to(items, { opacity: 0, scale: 0.95, duration: 0.3 });
        gsap.to('.notfound__inner', { autoAlpha: 1, duration: 0.3 });
      } else {
        items.forEach(el => el.style.opacity = '0');
      }

      // restart from center in a random diagonal
      setCenterPosition();
      setDiagonalDirection();
      state.last.x = state.x;
      state.last.y = state.y;

      startFade(1, performance.now() / 1000);
      isPaused = false;
      isBurst = false;
    }, OPT.gifMax * 1000);
  }

  sprite.onload = () => {
    resize();
    setCenterPosition();
    setDiagonalDirection();
    state.last.x = state.x;
    state.last.y = state.y;

    window.addEventListener('resize', resize, { passive: true });
    preloadGifs();

    let last = performance.now() / 1000;

    function frame(ts) {
      const now = ts / 1000;
      const dt = Math.min(0.033, Math.max(0, now - last));
      last = now;

      applyFade(now);

      if (!isPaused) {
        state.x += state.vx * dt;
        state.y += state.vy * dt;

        let hitX = false,
          hitY = false;
        if (state.x <= state.minX) {
          state.x = state.minX;
          state.vx = Math.abs(state.vx);
          hitX = true;
        }
        if (state.x >= state.maxX) {
          state.x = state.maxX;
          state.vx = -Math.abs(state.vx);
          hitX = true;
        }
        if (state.y <= state.minY) {
          state.y = state.minY;
          state.vy = Math.abs(state.vy);
          hitY = true;
        }
        if (state.y >= state.maxY) {
          state.y = state.maxY;
          state.vy = -Math.abs(state.vy);
          hitY = true;
        }

        if ((hitX && hitY) ||
          cornerZone(state.x, state.y) ||
          (hitX && (state.y <= state.minY + state.cornerTol || state.y >= state.maxY - state
            .cornerTol)) ||
          (hitY && (state.x <= state.minX + state.cornerTol || state.x >= state.maxX - state
            .cornerTol))) {
          triggerCorner();
        }

        const dx = state.x - state.last.x,
          dy = state.y - state.last.y;
        if (dx * dx + dy * dy >= trailGap2) {
          state.trail.push({ x: state.x, y: state.y, t: now });
          state.last.x = state.x;
          state.last.y = state.y;
        }
      }

      ctx.clearRect(0, 0, state.viewW, state.viewH);

      const cutoff = now - OPT.trailLife;
      let i = 0;
      while (i < state.trail.length && state.trail[i].t < cutoff) i++;
      if (i) state.trail.splice(0, i);

      for (let j = 0; j < state.trail.length; j++) {
        const g = state.trail[j],
          age = (now - g.t) / OPT.trailLife;
        const alpha = Math.max(0, Math.min(1, 1 - age * age));
        const sc = 1 - 0.1 * age;
        ctx.globalAlpha = alpha * 0.9;
        ctx.drawImage(sprite, g.x, g.y, state.w * sc, state.h * sc);
      }

      ctx.globalAlpha = state.spriteAlpha;
      ctx.drawImage(sprite, state.x, state.y, state.w, state.h);
      ctx.globalAlpha = 1;

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  };
}

function initIconAppAnimation() {
  const wrap = document.querySelector('[data-app-wrap]');
  if (!wrap) return;

  const cursorW = wrap.querySelector(".svg-app__cursor");
  const cursorBase = wrap.querySelector(".svg-app__cursor-c.is--base");
  const cursorClick = wrap.querySelector(".svg-app__cursor-c.is--click");
  const cursorAdd = wrap.querySelector(".svg-app__cursor-add");
  const cursorContents = Array.from([".svg-app__cursor-i", ".svg-app__cursor-t",
    ".svg-app__cursor-add"
  ])

  const appWrap = wrap.querySelector(".svg-app__el");
  const dropzone = appWrap.querySelector(".svg-app__body-drop");
  const text1 = appWrap.querySelector("#svg-app-text1");
  const text2 = appWrap.querySelector("#svg-app-text2");

  const bgIcon = wrap.querySelector(".svg-app__bg-icon");

  async function setDropText() {
    text1.textContent = "Aaaand let go"
    text2.textContent = "we'll do the rest."
  }

  async function resetText() {
    text1.textContent = "Click below to paste your <svg>"
    text2.textContent = "or drop your .svg file below"
  }

  let tl = gsap.timeline({
    paused: true,
    repeat: -1,
    repeatDelay: 0.5,
    defaults: {
      duration: 1.2,
    },
    scrollTrigger: {
      trigger: wrap,
      start: "top bottom",
      end: "bottom top",
      toggleActions: "play pause resume pause"
    }
  })

  tl.fromTo(cursorW, { x: "45em", y: "12em" }, { x: "0em", y: "0em", ease: "power2.inOut" })
    .set(cursorBase, { autoAlpha: 0 }, ">-=0.5")
    .set(cursorClick, { autoAlpha: 1 }, "<")
    .set(cursorAdd, { autoAlpha: 1 }, "<")
    .fromTo(dropzone, { background: "rgba(0,0,0,0.1)" }, {
      background: "rgba(0,0,0,0.2)",
      ease: "none", duration: 0.25
    }, "<")
    .call(setDropText, null, "<+=0.2")

    // hide app etc
    .fromTo(
      appWrap, { clipPath: "inset(0px 0px 0em 0px round 0.375em)" }, {
        clipPath: "inset(0px 0px 19em 0px round 0.375em)",
      duration: 0.8
    }, ">+=1")
    .fromTo(cursorContents, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.25 }, "<")
    .set(cursorBase, { autoAlpha: 1 }, "<")
    .set(cursorClick, { autoAlpha: 0 }, "<")
    .fromTo(bgIcon, { autoAlpha: 0, rotate: -90, scale: 0.7 }, {
      autoAlpha: 1, rotate: 0,
      scale: 1
    }, "<+=0.1")

    // move cursor up and out again
    .to(cursorW, { x: "4.25em", y: "-12.75em", ease: "power3.inOut", duration: 1.8 }, "<+=1")
    .set(dropzone, { background: "rgba(0,0,0,0.1)" }, "<")
    .call(resetText, null, "<")
    .to(cursorW, { scale: 0.75, repeat: 1, yoyo: true, duration: 0.25 })
    .to(appWrap, { clipPath: "inset(0px 0px 0em 0px round 0.375em)" })
    .to(cursorW, { x: "45em", y: "12em" }, "<")
}

function initPlayfulCardsReveal() {
  const wrappers = document.querySelectorAll('[data-playful-cards-wrap]')

  if (wrappers.length) {
    wrappers.forEach(w => {
      const cards = w.querySelectorAll('[data-playful-cards-item]')

      const st = gsap.from(cards, {
        yPercent: 25,
        xPercent: 25,
        autoAlpha: 0,
        duration: 0.8,
        ease: "expo.out",
        rotate: gsap.utils.wrap([9, 6, 3]),
        stagger: { each: 0.1, from: "end" },
        scrollTrigger: {
          trigger: w,
          start: 'clamp(top 60%)',
          once: true,
        }
      });
    })
  }

}