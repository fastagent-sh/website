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

const problems = [];
for (const surface of surfaces) {
  const body = readFileSync(new URL(surface, dist), "utf8");
  if (!body.trim()) problems.push(`${surface} is empty`);
  for (const [, path] of body.matchAll(new RegExp(`${SITE}(/[^)\\s>"']*)`, "g"))) {
    const file = target(clean(path)).replace(/^\//, "");
    if (!file || existsSync(new URL(file, dist))) continue;
    problems.push(`${surface} points at ${path}, which the build does not emit`);
  }
}

/* And the other way: a page the site serves but no index names is a page an
   agent has to guess at. Only the .md twins are checked — the HTML pages have
   the sitemap, which @astrojs/sitemap builds from the same routes.
   llms-full.txt is not an index: it is generated from the same entry list the
   twins are, so it names every twin by construction and would answer this
   question before it was asked. The indexes are the files that can drift. */
const indexed = new Set(
  surfaces
    .filter((f) => f === "llms.txt" || f.endsWith("/llms.txt"))
    .flatMap((f) => [...readFileSync(new URL(f, dist), "utf8").matchAll(new RegExp(`${SITE}(/[^)\\s>"']*)`, "g"))])
    .map(([, path]) => clean(path).replace(/^\//, "")),
);
const orphans = files.filter((f) => f.endsWith("/index.md") && !indexed.has(f));
if (orphans.length) problems.push(`markdown pages no llms.txt names: ${orphans.join(", ")}`);

if (problems.length) {
  for (const line of problems) console.error(line);
  process.exit(1);
}
const bytes = surfaces.reduce((sum, f) => sum + statSync(new URL(f, dist)).size, 0);
console.log(
  `agent surfaces: ${surfaces.length} files, ${(bytes / 1024).toFixed(0)} kB, every link resolves`,
);
