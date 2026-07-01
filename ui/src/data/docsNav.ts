export type DocsPage = { slug: string; title: string };
export type DocsSection = { label: string; pages: DocsPage[] };

export const docsSections: DocsSection[] = [
  {
    label: "Overview",
    pages: [{ slug: "", title: "Introduction" }],
  },
  {
    label: "AI Fundamentals",
    pages: [
      { slug: "ai/hosts", title: "LLMs vs. LLM hosts" },
      { slug: "ai/agents", title: "What is an AI coding agent" },
      { slug: "ai/prompting", title: "Prompting basics" },
      { slug: "ai/lsp", title: "What is an LSP" },
      { slug: "ai/mcp", title: "Tools & MCP" },
    ],
  },
  {
    label: "About CommandCenter",
    pages: [
      { slug: "projects", title: "Projects" },
      { slug: "processes", title: "Processes" },
      { slug: "agents", title: "Agents" },
      { slug: "credentials", title: "Credential store" },
      { slug: "mcp-server", title: "MCP server" },
      { slug: "app-shell", title: "App shell" },
      { slug: "theming", title: "Theming" },
    ],
  },
];

/** Flattened prev/next across all sections, in nav order. */
export function getDocsPrevNext(currentSlug: string): {
  prev: DocsPage | null;
  next: DocsPage | null;
} {
  const flat = docsSections.flatMap((s) => s.pages);
  const i = flat.findIndex((p) => p.slug === currentSlug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? flat[i - 1] : null,
    next: i < flat.length - 1 ? flat[i + 1] : null,
  };
}
