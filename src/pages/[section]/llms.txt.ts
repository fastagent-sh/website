/**
 * Per-section /<section>/llms.txt — the sub-index the root `/llms.txt`
 * hops into. One rule for an agent: a link there of the shape
 * `/<section>/llms.txt` is answered here.
 *
 * This site has two sections, one per content collection — `/docs` and
 * `/blog`. (The framework would also raise a multi-page folder inside the
 * primary collection into a section; ours is flat, so `docs/design/**`
 * lists inside `/docs/llms.txt` rather than getting its own.)
 *
 * `getIndexedTopLevel()` decides which sections exist and what they
 * contain; this route just renders one file per section it returns.
 */

import { getIndexedTopLevel, type IndexedEntry } from "@cloudflare/nimbus-docs";
import { config } from "virtual:nimbus/config";

import { SECTIONS } from "../../site";

export const prerender = true;

interface SectionProps {
  slug: string;
  label: string;
  members: IndexedEntry[];
}

export async function getStaticPaths() {
  const { groups } = await getIndexedTopLevel();
  return groups
    // Versioning: hidden versions don't get a per-section llms.txt
    // index. They're URL-reachable for direct navigation, but every
    // agent-discovery surface should treat them as if they don't exist.
    .filter((group) => !group.hidden)
    .map((group) => ({
      params: { section: group.slug },
      props: {
        slug: group.slug,
        label: group.label,
        members: group.members,
      } as SectionProps,
    }));
}

export async function GET({ props }: { props: SectionProps }) {
  const { slug, label, members } = props;

  /* The framework labels a section with its slug — a path segment where a
     name belongs. src/site.ts holds the names. */
  const section = SECTIONS[slug];
  const lines = [`# ${section?.label ?? label}`, ""];
  if (section) lines.push(section.description, "");
  lines.push("## Pages", "");

  for (const item of members) {
    const description = item.description ? ` — ${item.description}` : "";
    lines.push(
      `- [${item.title}](${new URL(item.markdownUrl, config.site).href})${description}`,
    );
  }

  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
