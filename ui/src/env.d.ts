/// <reference types="astro/client" />

interface CcEventsApi {
  subscribe(topic: string, fn: (data: unknown, topic: string) => void): () => void;
  unsubscribe(topic: string, fn: (data: unknown, topic: string) => void): void;
  publish(topic: string, data: unknown): void;
  status(): { ws: string; webtransport: string };
}

interface Window {
  __ccEvents?: CcEventsApi;
  __ccTheme?: { set(mode: string): void; get(): string };
  __ccSidebar?: { toggle(): void; get(): boolean };
  __TAURI__?: {
    core: { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> };
    window: { getCurrentWindow(): { setTheme(theme: string): Promise<void> } };
  };
}
