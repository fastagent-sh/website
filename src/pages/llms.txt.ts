// Root /llms.txt — sectioned index for AI agents.
import { getIndexedTopLevel } from "@cloudflare/nimbus-docs";
import { config } from "virtual:nimbus/config";

import { DETAILS, SECTIONS } from "../site";

export const prerender = true;

export async function GET() {
  const { leaves, groups } = await getIndexedTopLevel();

  const lines = [
    `# ${config.title}`,
    "",
    config.description ?? "Documentation index for AI agents.",
    "",
    DETAILS,
    "",
    `Full corpus (all pages, one document): ${new URL("/llms-full.txt", config.site).href}`,
    "",
    "## Sections",
    "",
  ];

  // Sort leaves + groups alphabetically into a single stable list.
  type Row = { key: string; line: string };
  const rows: Row[] = [];

  for (const leaf of leaves) {
    const description = leaf.description ? ` — ${leaf.description}` : "";
    rows.push({
      key: leaf.url,
      line: `- [${leaf.title}](${new URL(leaf.markdownUrl, config.site).href})${description}`,
    });
  }

  for (const group of groups) {
    // Older doc versions have their own /<v>/llms.txt; don't list them here.
    // Hidden ones get no index file at all (see [section]/llms.txt.ts), so
    // linking one would be a promise the build doesn't keep.
    if (group.kind === "version" || group.hidden) continue;
    rows.push({
      key: `/${group.slug}`,
      line: `- [${SECTIONS[group.slug]?.label ?? group.label}](${new URL(`/${group.slug}/llms.txt`, config.site).href})${SECTIONS[group.slug] ? ` — ${SECTIONS[group.slug].description}` : ""}`,
    });
  }

  /* Alphabetical, except the primary section leads: read top-down, an agent
     should meet the documentation before the blog. */
  rows.sort((a, b) => (a.key === "/docs" ? "" : a.key).localeCompare(b.key === "/docs" ? "" : b.key));
  for (const row of rows) lines.push(row.line);

  /* Everything above is one hop from its page. These are the pages the reading
     order actually starts with, named here so the first useful one is one hop
     away rather than two — the promotion the old index carried, same five:
     the docs landing, the three pages a person is sent through first, and
     ai-start, which is the page written for the reader of this file. Titles
     come from the entries, so a renamed page renames here. */
  const members = new Map(groups.flatMap((g) => g.members.map((m) => [m.entry.id, m])));
  const start = ["docs", "docs/quickstart", "docs/ai-start", "docs/overview", "docs/configuration"].map((id) => {
    const item = members.get(id);
    // Renamed upstream: fail the build rather than quietly drop the promotion.
    if (!item) throw new Error(`llms.txt promotes "${id}", which is not a page`);
    return item;
  });
  lines.push(
    "",
    "## Start here",
    "",
    ...start.map((item) => `- [${item.title}](${new URL(item.markdownUrl, config.site).href})`),
  );

  /* The pages above are the site; these are the two doors into it that are
     not pages. start.md is the runbook a coding agent is pointed at from the
     landing, and the skill is the same text under the discovery well-known
     path — an agent that found this file should not have to guess either. */
  lines.push(
    "",
    "## For coding agents",
    "",
    `- [Build an agent](${new URL("/start.md", config.site).href}) — the guided start: new project, existing files, or embedded in an app.`,
    `- [Agent skill](${new URL("/.well-known/agent-skills/fastagent/SKILL.md", config.site).href}) — the same guide as an installable skill.`,
    `- [Source](https://github.com/fastagent-sh/fastagent) · [npm](https://www.npmjs.com/package/@fastagent-sh/fastagent)`,
  );

  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
