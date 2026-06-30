import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

// Osmo's signature easing, matching the original main.js: CustomEase.create("osmo", ...)
if (!gsap.parseEase("osmo")) {
  CustomEase.create("osmo", "0.625, 0.05, 0, 1");
}

gsap.defaults({ ease: "osmo", duration: 0.6 });

export default gsap;
