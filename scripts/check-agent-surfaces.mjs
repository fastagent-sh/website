/* Every link the agent surfaces hand out has to resolve in dist/.

   The contract is on the build, not on the sources: /llms.txt and its
   per-section indexes are generated from whatever collections the framework
   happens to index, and the .md twin route decides which of those actually
   get a file. Those two lists drifting apart is silent — the index keeps
   advertising a URL that nothing emits — so this walks the built surfaces and
   resolves every site URL they name against dist/.

   Runs as `postbuild`; `npm run build` is enough to trigger it. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";

import { SITE } from "../src/site.ts";

const dist = new URL("../dist/", import.meta.url);
const files = readdirSync(dist, { recursive: true }).map((f) => f.replaceAll("\\", "/"));
const surfaces = files.filter((f) => f.endsWith(".txt") || f.endsWith(".md"));
if (!surfaces.some((f) => f === "llms.txt")) {
  throw new Error("dist/llms.txt is missing: the agent index did not build");
}

/* A site URL maps to a file the way the static host serves it: a path with an
   extension is the file itself, anything else is that directory's index.html.
   These URLs are also read out of prose, where one can end a sentence, so the
   trailing punctuation comes off first — no path of ours ends in any of it. */
const clean = (path) => path.replace(/[.,;:!?]+$/, "");
const target = (path) => (/\.[a-z0-9]+$/i.test(path) ? path : `${path.replace(/\/$/, "")}/index.html`);

const isIndex = (f) => f === "llms.txt" || f.endsWith("/llms.txt");
/* `.` and `/` in the origin would otherwise be pattern syntax; over-matching
   is the wrong way for a link check to fail. */
const ORIGIN = SITE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const problems = [];
let links = 0;
for (const surface of surfaces) {
  const body = readFileSync(new URL(surface, dist), "utf8");
  if (!body.trim()) problems.push(`${surface} is empty`);
  /* Links are checked in the indexes only. A twin and the full corpus carry
     the page bodies, which are copied from vendor/fastagent — a URL written
     in that prose is upstream's to fix, and holding this build hostage to it
     would be checking someone else's invariant. */
  if (!isIndex(surface)) continue;
  let named = 0;
  for (const [, path] of body.matchAll(new RegExp(`${ORIGIN}(/[^)\\s>"']*)`, "g"))) {
    links += 1;
    named += 1;
    const file = target(clean(path)).replace(/^\//, "");
    if (existsSync(new URL(file, dist))) continue;
    problems.push(`${surface} points at ${path}, which the build does not emit`);
  }
  /* Per file, not just in total: an index that lists nothing is the drift
     this script was written for, and the totals below would hide it behind
     the indexes that still work. */
  if (!named) problems.push(`${surface} names no pages`);
}
/* A scan that matches nothing passes silently, which is the failure this
   whole script exists to prevent: relative links, or a moved origin, and
   "every link resolves" would be a statement about an empty set. */
if (!links) problems.push("no site URLs found in the agent surfaces: the link scan is broken");

/* The pages advertise their own twin too — `rel="alternate" type="text/markdown"`
   in the head, and the visible "View as Markdown" / "view as markdown" link.
   Those hrefs are built by the page from its own URL, while the file is built
   by a route from the entry's; nothing above reads HTML, so this is where the
   two are held to the same answer. */
let advertised = 0;
let directives = 0;
/* Which index each page hands to an agent — used further down, where an index
   counts as reachable if a page points at it. */
const namedByPage = new Set();
for (const page of files.filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(new URL(page, dist), "utf8");
  const offers = [
    ...[...html.matchAll(/<link rel="alternate" type="text\/markdown" href="([^"]+)"/g)].map(
      ([, href]) => ["twin", href],
    ),
    // The screen-reader directive names this page's twin *and* its index.
    ...[...html.matchAll(/data-ai-agent-directive[^>]*>([\s\S]*?)<\/aside>/g)].flatMap(([, block]) =>
      [...block.matchAll(/href="([^"]+)"/g)].map(([, href]) => ["directive", href]),
    ),
  ];
  for (const [kind, href] of offers) {
    if (kind === "twin") advertised += 1;
    else directives += 1;
    const path = clean(href.startsWith(SITE) ? href.slice(SITE.length) : href).replace(/^\//, "");
    namedByPage.add(path);
    if (!existsSync(new URL(path, dist))) {
      problems.push(`${page} offers ${href}, which the build does not emit`);
    }
  }
}
if (!advertised) problems.push("no page advertises a markdown alternate: the head scan is broken");
if (!directives) problems.push("no page carries an agent directive: the directive scan is broken");

/* And the other way: a page the site serves but no index names is a page an
   agent has to guess at. Only the .md twins are checked — the HTML pages have
   the sitemap, which @astrojs/sitemap builds from the same routes.
   llms-full.txt is not an index and is skipped: it is one document, not a
   list of URLs to follow. What can drift is the twin route's own path list
   against the indexes — the route filtered itself to one collection once
   while /blog/llms.txt kept advertising the twins it no longer emitted, and
   this is the direction that catches that.
   A twin has to be named by an index — the pages don't count here, because
   every page links its own twin and the question would answer itself. An
   index has the weaker test: named by another index, or pointed at by a page,
   which is how a per-version index (deliberately absent from the root index,
   since a version is reached by URL rather than by discovery) stays legal. */
const namedByIndex = new Set(
  surfaces
    .filter(isIndex)
    .flatMap((f) => [...readFileSync(new URL(f, dist), "utf8").matchAll(new RegExp(`${ORIGIN}(/[^)\\s>"']*)`, "g"))])
    .map(([, path]) => clean(path).replace(/^\//, "")),
);
const orphans = [
  ...files.filter((f) => /(^|\/)index\.md$/.test(f) && !namedByIndex.has(f)),
  ...files.filter((f) => /\/llms\.txt$/.test(f) && !namedByIndex.has(f) && !namedByPage.has(f)),
];
if (orphans.length) problems.push(`agent files nothing points at: ${orphans.join(", ")}`);

if (problems.length) {
  for (const line of problems) console.error(line);
  process.exit(1);
}
const bytes = surfaces.reduce((sum, f) => sum + statSync(new URL(f, dist)).size, 0);
console.log(
  `agent surfaces: ${surfaces.length} files, ${(bytes / 1024).toFixed(0)} kB, ${links} links,` +
    ` ${advertised} twins and ${directives} directive links offered, every one resolves`,
);
