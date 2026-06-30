import gsap from "./lib/gsap-setup";

// Core nav interactions ported from Osmo's js/main.js:
// the menu toggle, scroll-direction state, rotating button labels, and the
// reveal animation. The heavier marquee / modal / sitemap behaviours from the
// original 5k-line file are intentionally left out (see report).

function debounceOnWidthChange(fn: () => void, wait = 200): () => void {
  let prevWidth = window.innerWidth;
  let t: number | undefined;
  return () => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => {
      if (window.innerWidth === prevWidth) return;
      prevWidth = window.innerWidth;
      fn();
    }, wait);
  };
}

function initNavToggle() {
  document.querySelectorAll("[data-nav-toggle]").forEach((el) => {
    el.addEventListener("click", function (this: Element) {
      const action = this.getAttribute("data-nav-toggle");
      const nav = document.querySelector("[data-nav-status]");
      if (!nav) return;
      if (action === "toggle") {
        nav.setAttribute(
          "data-nav-status",
          nav.getAttribute("data-nav-status") === "active" ? "not-active" : "active",
        );
      } else if (action === "close") {
        nav.setAttribute("data-nav-status", "not-active");
      }
    });
  });
}

function initDetectScrollingDirection() {
  let last = 0;
  let pending = false;
  const threshold = 10;
  const thresholdTop = 50;

  window.addEventListener(
    "scroll",
    () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(last - y) >= threshold) {
          const started = y > thresholdTop;
          const direction = y > last ? "down" : "up";
          document
            .querySelectorAll("[data-scrolling-started]")
            .forEach((el) => el.setAttribute("data-scrolling-started", started ? "true" : "false"));
          document
            .querySelectorAll("[data-scrolling-direction]")
            .forEach((el) => el.setAttribute("data-scrolling-direction", direction));
          last = y;
        }
        pending = false;
      });
    },
    { passive: true },
  );
}

function initRotateButtonsCalc() {
  const yk = 30;
  const has = (el: Element, a: string, t: string) =>
    (el.getAttribute(a) || "").toLowerCase().split(/\s+/).includes(t);
  const respFull = (b: Element) =>
    (has(b, "data-responsive", "mobile") && innerWidth <= 479) ||
    (has(b, "data-responsive", "landscape") && innerWidth <= 767) ||
    (has(b, "data-responsive", "tablet") && innerWidth <= 991);
  const maxChars = (b: Element) =>
    Math.max(
      ...[...b.querySelectorAll(".button-label")].map(
        (l) => (l.textContent || "").trim().length || 0,
      ),
      0,
    );
  const yFromChars = (c: number) => Math.round(100 + yk * (12 + 6 * c));

  const update = (b: Element) => {
    const c = maxChars(b);
    let y = yFromChars(c);
    if ((b as HTMLElement).dataset.size === "full" || respFull(b)) y *= 3;
    y = Math.max(100, Math.min(y, 10000));
    (b as HTMLElement).style.setProperty("--y", `${y}%`);
  };

  const btns = document.querySelectorAll("[data-button-rotate]");
  if (!btns.length) return;

  window.addEventListener(
    "resize",
    debounceOnWidthChange(() => {
      document.querySelectorAll("[data-button-rotate]").forEach(update);
    }, 200),
  );

  btns.forEach((b) => {
    if (!b.querySelectorAll(".button-label").length) return;
    update(b);
    document.fonts?.ready?.then(() => update(b));
  });
}

function initRotateButtonsAnim() {
  const els = document.querySelectorAll("[data-button-rotate-hover]");
  if (!els.length) return;

  els.forEach((el) => {
    const root =
      el.closest("[data-button-rotate]") ||
      el.closest(".button") ||
      el.closest("button.tag") ||
      el.closest(".square-button") ||
      el;
    const trigger = el.closest("[data-hover]") || el;

    if ((el as any)._rotBound) return;
    (el as any)._rotBound = true;

    let lastTs = 0;
    const COOLDOWN = 100;
    const canTrigger = () => {
      const now = performance.now();
      if (now - lastTs < COOLDOWN) return false;
      lastTs = now;
      return true;
    };

    const run = () => {
      let items = root.querySelectorAll(".button-label, .button-icon");
      if (!items.length) items = [el] as any;

      if ((root as any)._rotTl) {
        (root as any)._rotTl.kill();
        (root as any)._rotTl = null;
        gsap.set(items, { clearProps: "rotation" });
      }

      const r = Number.parseFloat(getComputedStyle(root as Element).getPropertyValue("--r")) || 120;
      const isFull = (root as HTMLElement).dataset?.size === "full";

      (root as any)._rotTl = gsap.to(items, {
        rotation: `+=${r}`,
        duration: isFull ? 0.75 : 0.5,
        ease: "osmo",
        stagger: 0.075,
        overwrite: "auto",
        onComplete: () => {
          gsap.set(items, { clearProps: "rotation" });
          (root as any)._rotTl = null;
        },
      });
    };

    trigger.addEventListener("pointerenter", () => {
      if (canTrigger()) run();
    });
    trigger.addEventListener("pointerleave", () => {
      canTrigger();
    });
  });
}

function initNavReveal() {
  const tl = gsap.timeline();
  tl.set(".nav", { autoAlpha: 1 });
  tl.from(".nav-bar", { yPercent: -125, ease: "expo.out", duration: 1 }, 0.25);
}

export function closeNav() {
  document.querySelectorAll("[data-nav-status]").forEach((el) => {
    el.setAttribute("data-nav-status", "not-active");
  });
}

export function initNav() {
  initNavReveal();
  initNavToggle();
  initDetectScrollingDirection();
  initRotateButtonsCalc();
  initRotateButtonsAnim();
}

if (document.readyState !== "loading") {
  initNav();
} else {
  document.addEventListener("DOMContentLoaded", initNav);
}
