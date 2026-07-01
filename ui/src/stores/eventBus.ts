// nanostores for cc-mcp's event bus connection state (Astro's own answer to
// "Pinia for Astro" -- a tiny framework-agnostic store, not tied to any
// component island). Doesn't fix the astro:page-load / listener-rewiring
// class of bug the sidebar/theme had (that's a DOM re-attachment problem,
// unrelated to state persistence -- window globals and localStorage already
// carried that state fine); this exists so the live WS/WebTransport client
// objects and connection status are available to any future component,
// island, or plain script via `nanostores` rather than only through
// `window.__ccEvents`.
import { atom } from "nanostores";

export type TransportStatus = "connecting" | "connected" | "closed" | "unsupported";

/** The live WebSocket instance, or null before connecting / after closing. */
export const $wsClient = atom<WebSocket | null>(null);
export const $wsStatus = atom<TransportStatus>("connecting");

/** The live WebTransport instance, or null before connecting / after closing. */
export const $webtransportClient = atom<WebTransport | null>(null);
export const $webtransportStatus = atom<TransportStatus>("unsupported");
