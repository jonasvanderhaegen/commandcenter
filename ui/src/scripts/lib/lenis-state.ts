import type Lenis from "lenis";

let _lenis: Lenis | null = null;

export const getLenis = (): Lenis | null => _lenis;
export const setLenis = (l: Lenis | null): void => {
  _lenis = l;
  (window as unknown as { __appLenis: Lenis | null }).__appLenis = l;
};
