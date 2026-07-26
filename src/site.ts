/* Single source of brand/site constants, shared by both rendering surfaces:
   the custom layout (Site.astro, pages) and the Nimbus config. */
export const SITE = "https://fastagent.sh";
export const DESCRIPTION =
  "An agent is just a directory — FastAgent serves it as a live service on GitHub, Telegram, Slack, Feishu, or any channel you compose. No rewrite, no new format, no platform.";
export const OG_IMAGE = {
  url: `${SITE}/social-preview.png`,
  width: "1200",
  height: "630",
  alt: "FastAgent — an agent is just a directory; FastAgent serves it as a live service on any channel.",
};
export const BLOG_DESCRIPTION = "Releases, design writeups, and what's shipping next — from the FastAgent team.";

/* What a reader has to know before the first page makes sense — the framing
   sentence of the agent index, and the one thing the description leaves out. */
export const DETAILS =
  "FastAgent is harness-, model-, and infra-neutral (the Agent Handler SPEC calls the harness the engine — same seam). The built-in harness is pi.";

/* The sections of the site, as they are named to an agent. The slug is a path
   segment; these are what /llms.txt calls each hop, and how the per-section
   index introduces itself. A section with no entry here falls back to its
   slug, which reads as a path where a sentence belongs. */
export const SECTIONS: Record<string, { label: string; description: string }> = {
  docs: {
    label: "Documentation",
    description: "Guides and reference: quickstart, configuration, embedding, channels, deployment, and the Agent Handler SPEC.",
  },
  blog: {
    label: "Blog",
    description: BLOG_DESCRIPTION,
  },
};
/** The agent-facing install prompt — the hero card and the closing CTA both copy it. */
export const DEFAULT_PROMPT = "Read https://fastagent.sh/start.md and build an agent in this project.";
