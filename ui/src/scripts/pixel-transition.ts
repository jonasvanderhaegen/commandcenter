import barba from "@barba/core";
import Lenis from "lenis";
import gsap from "./lib/gsap-setup";
import { setLenis } from "./lib/lenis-state";
import { closeNav } from "./nav";
import "lenis/dist/lenis.css";

// Simplified, self-contained port of Osmo's Barba setup.
// The original js/main.js drives a pixel-grid wipe through GSAP ScrollTrigger /
// Observer / SplitText plugins loaded as globals. Here we keep the same Barba
// lifecycle (init + leave/enter + lenis re-sync) but run a lightweight overlay
// wipe + container crossfade so a transition reliably plays between / and /faq.

history.scrollRestoration = "manual";

let lenis: Lenis | null = null;

const rmMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = rmMQ.matches;
rmMQ.addEventListener?.("change", (e) => (reducedMotion = e.matches));

function initLenis() {
  if (lenis) return;
  lenis = new Lenis({ lerp: 0.165, wheelMultiplier: 1.25 });
  setLenis(lenis);
  gsap.ticker.add((time) => lenis!.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function setThemeFromTrigger(data: any) {
  const link = data.trigger?.closest?.("a[href]") as HTMLAnchorElement | null;
  const href = link ? link.href : data.next?.url?.href || location.href;
  let path = "/";
  try {
    path = new URL(href, location.origin).pathname;
  } catch {}
  const theme = path.replace(/\/+$/, "") === "" || path === "/" ? "light" : "light";
  document.querySelector(".transition")?.setAttribute("data-transition-theme", theme);
  document.querySelector(".nav")?.setAttribute("data-nav-theme", theme);
}

function overlay() {
  return document.querySelector<HTMLElement>(".transition");
}

barba.hooks.leave(() => {
  closeNav();
  lenis?.stop();
});

barba.hooks.enter((data: any) => {
  initBarbaNavUpdate(data);
});

barba.hooks.afterEnter(() => {
  window.scrollTo(0, 0);
  if (lenis) {
    lenis.resize();
    lenis.start();
  }
});

barba.init({
  timeout: 7000,
  preventRunning: true,
  prevent: ({ el }) =>
    el.getAttribute("data-barba-p") === "true" || el.hasAttribute("data-barba-prevent"),
  transitions: [
    {
      name: "default",

      once() {
        initLenis();
        const el = overlay();
        if (el) gsap.set(el, { autoAlpha: 0 });
      },

      async leave(data: any) {
        setThemeFromTrigger(data);
        const el = overlay();
        const tl = gsap.timeline();
        if (reducedMotion) {
          tl.set(data.current.container, { autoAlpha: 0 });
          return tl;
        }
        if (el) tl.to(el, { autoAlpha: 1, duration: 0.35, ease: "osmo" }, 0);
        tl.to(data.current.container, { autoAlpha: 0, duration: 0.35, ease: "osmo" }, 0);
        return tl;
      },

      enter(data: any) {
        window.scrollTo(0, 0);
        const el = overlay();
        const tl = gsap.timeline();
        gsap.set(data.next.container, { autoAlpha: 0 });
        if (reducedMotion) {
          tl.set(data.next.container, { autoAlpha: 1 });
          if (el) tl.set(el, { autoAlpha: 0 });
          return tl;
        }
        tl.to(data.next.container, { autoAlpha: 1, duration: 0.45, ease: "osmo" }, 0.1);
        if (el) tl.to(el, { autoAlpha: 0, duration: 0.4, ease: "osmo" }, 0.1);
        return tl;
      },
    },
  ],
});

function initBarbaNavUpdate(data: any) {
  // Keep nav aria-current / active classes in sync with the incoming page.
  if (!data.next?.html) return;
  const tpl = document.createElement("template");
  tpl.innerHTML = data.next.html.trim();
  const nextNav = tpl.content.querySelector(".nav");
  const currentNav = document.querySelector(".nav");
  if (!nextNav || !currentNav) return;

  const nextLinks = Array.from(nextNav.querySelectorAll("a[href]")) as HTMLAnchorElement[];
  const currentLinks = Array.from(currentNav.querySelectorAll("a[href]")) as HTMLAnchorElement[];
  const len = Math.min(nextLinks.length, currentLinks.length);
  for (let i = 0; i < len; i++) {
    const ac = nextLinks[i].getAttribute("aria-current");
    if (ac !== null) currentLinks[i].setAttribute("aria-current", ac);
    else currentLinks[i].removeAttribute("aria-current");
  }
}
