/* Single source of brand/site constants, shared by both rendering surfaces:
   the custom layout (Site.astro, pages) and the Starlight config. */
export const SITE = "https://fastagent.sh";
export const DESCRIPTION =
  "An agent is just a directory — FastAgent serves it as a live service on GitHub, Telegram, or any channel you compose. No rewrite, no new format, no platform.";
export const OG_IMAGE = {
  url: `${SITE}/social-preview.png`,
  width: "1200",
  height: "630",
  alt: "FastAgent — Vibe first. Then FastAgent.",
};
export const BLOG_DESCRIPTION = "Releases, design writeups, and what's shipping next — from the FastAgent team.";
/** The agent-facing install prompt — the hero card and the closing CTA both copy it. */
export const DEFAULT_PROMPT = "Read https://fastagent.sh/start.md and build an agent in this project.";
