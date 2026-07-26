/**
 * Per-page `/<slug>/index.md` — the clean-markdown alternate for every
 * indexable entry of the primary `docs` collection.
 *
 * The starter filters this route to the primary collection and expects a
 * sibling route per collection. This site has two — `docs` and `blog` — and
 * `/llms.txt` indexes both, so one route serves both instead: the slug comes
 * from each entry's own canonical URL, which already carries the collection's
 * mount prefix, and a copy of this file per collection would only be a place
 * for the two to drift.
 *
 * The starter's `.mdx` twin (the authored source, JSX intact) is not
 * installed here: these pages are `.md` copies of vendor/fastagent, so the
 * markdown below *is* the source and a second URL claiming otherwise would
 * be a lie. `Source:` points upstream instead.
 */

import { getIndexedEntries, renderEntryAsMarkdown, type IndexedEntry } from "@cloudflare/nimbus-docs";
import { config } from "virtual:nimbus/config";

export const prerender = true;

interface SlugProps {
  item: IndexedEntry;
}

export async function getStaticPaths() {
  const indexed = await getIndexedEntries();
  return indexed.map((item) => ({
    // The home page (`item.url === "/"`) emits at `/index.md`; Astro's
    // rest-segment treats `undefined` as "no segment", so the URL is
    // `/index.md` rather than `/index/index.md`. Every other page emits at
    // `<its own URL>/index.md` — the convention `<page>/index.md`, and the
    // URL `/llms.txt` advertises for it.
    params: { slug: item.url.replace(/^\/|\/$/g, "") || undefined },
    props: { item } as SlugProps,
  }));
}

export async function GET({ props }: { props: SlugProps }) {
  const { item } = props;
  const { entry, title, description, version } = item;
  const data = (entry.data ?? {}) as Record<string, unknown>;
  const rawImage = data.socialImage;
  const socialImage =
    typeof rawImage === "string" && rawImage.length > 0
      ? rawImage
      : config.socialImage;

  const markdown = renderEntryAsMarkdown(entry);

  const body = [
    "---",
    `title: ${JSON.stringify(title)}`,
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    ...(socialImage
      ? [`image: ${JSON.stringify(new URL(socialImage, config.site).href)}`]
      : []),
    ...(version ? [`version: ${JSON.stringify(version)}`] : []),
    "---",
    "",
    "> Documentation Index",
    `> Fetch the complete documentation index at: ${new URL("/llms.txt", config.site).href}`,
    "> Use this file to discover all available pages before exploring further.",
    "",
    `# ${title}`,
    "",
    markdown,
    "",
    // The file this page was rendered from, in the repository that owns it.
    `Source: ${typeof data.editUrl === "string" ? data.editUrl : new URL(item.url, config.site).href}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
