/* The invariants this site states in prose and cannot otherwise enforce:
     · contrast floors for the role pairs it actually paints
     · every rule painting --term-bg also pins color-scheme: dark
     · no token is used that nothing defines
     · every hero-mock line has an animation cue
     · the committed rasters were re-exported after the palette moved
     · the CSS-only tabs still cover every embed framework
   Run it as `npm run check`: this reads the generated tokens.css, which
   `precheck` writes. */
import { readdirSync, readFileSync } from "node:fs";

import sharp from "sharp";

import { nimbus, roles, term, themeColor } from "../src/theme.ts";
import { CARD } from "./render-og.mjs";

const srcDir = new URL("../src/", import.meta.url);
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const problems = [];

/* ── contrast ──────────────────────────────────────────────────────────── */

const LIGHT = 0;
const DARK = 1;
const luminance = (hex) => {
  const parts = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
};
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/* [foreground, background, floor], checked in both modes. Text goes on three
   surfaces — the page, the cards raised off it, and the recessed band — and
   the ladder is not symmetric: Mocha's cards are *lighter* than its page while
   Latte's are lighter than nothing, so a pair that clears on --bg can fail on
   --bg-elevated. Each surface is sampled.
   The floor is AA (4.5) unless a comment says why it is lower. */
const rolePairs = [
  ...["bg", "bg-elevated", "panel"].flatMap((surface) => [
    ["text", surface, 4.5],
    ["text-soft", surface, 4.5],
    ["muted", surface, 4.5],
    ["accent", surface, 4.5],
  ]),
  /* The micro-label tier: uppercase mono at 0.68–0.74rem, decorative. Latte
     has no darker step before it collides with --muted, so it sits below AA
     and is pinned at what the palette delivers today. */
  ["muted-2", "bg", 4.05],
  ["muted-2", "bg-elevated", 4.36],
  ["muted-2", "panel", 3.72],
  ["accent-ink", "accent", 4.5],
  /* The event chips (.ev-*) label a turn's phases in these hues, as page text
     on --bg, so they answer to the text floor. They already clear it. */
  ...["red", "blue", "sapphire"].map((hue) => [hue, "bg", 4.5]),
  /* These two only draw borders, chips and icon fills — the 3:1 WCAG asks of
     non-text UI. As text they appear inside the panes, as Mocha on crust. */
  ...["yellow", "teal"].map((hue) => [hue, "bg", 3]),
];
for (const [fg, bg, floor] of rolePairs) {
  for (const [mode, side] of [["light", LIGHT], ["dark", DARK]]) {
    const got = ratio(roles[fg][side], roles[bg][side]);
    if (got < floor) {
      problems.push(`${mode}: --${fg} on --${bg} is ${got.toFixed(2)}:1, floor ${floor}:1`);
    }
  }
}

/* The --term-* pairs only: the page roles painted inside a pinned pane resolve
   to their Mocha side there, and are covered by the dark half of rolePairs. */
const termPairs = [
  ["text", "bg", 4.5],
  ["muted", "bg", 4.5],
  ["comment", "bg", 4.5],
];
for (const [fg, bg, floor] of termPairs) {
  const got = ratio(term[fg], term[bg]);
  if (got < floor) {
    problems.push(`pane: --term-${fg} on --term-${bg} is ${got.toFixed(2)}:1, floor ${floor}:1`);
  }
}

/* The docs shell paints from --nb-*, which src/theme.ts aliases to the roles
   above. The aliasing is the point of failure the pairs above cannot see: a
   token pointed at the wrong role reads fine as a name and fails as a color.
   So the docs surfaces are sampled under their own names.
   Ink on the three docs surfaces, plus the button that inverts them. */
const docsPairs = [
  ...["background", "card", "muted", "accent"].flatMap((surface) => [
    ["foreground", surface, 4.5],
    ["muted-foreground", surface, 4.5],
    ["primary", surface, 4.5],
  ]),
  ["primary-foreground", "primary", 4.5],
  /* Status hues label an aside's title and border on the page. */
  ...["info", "danger"].map((hue) => [hue, "background", 4.5]),
  ...["warning", "success"].map((hue) => [hue, "background", 3]),
];
for (const [fg, bg, floor] of docsPairs) {
  for (const [mode, side] of [["light", LIGHT], ["dark", DARK]]) {
    const got = ratio(nimbus[fg][side], nimbus[bg][side]);
    if (got < floor) {
      problems.push(`${mode} docs: --nb-${fg} on --nb-${bg} is ${got.toFixed(2)}:1, floor ${floor}:1`);
    }
  }
}

/* ── panes pin their own color-scheme ──────────────────────────────────── */

/* --term-bg is Mocha in both modes, but the roles a pane's children read are
   light-dark(). `color-scheme: dark` on the pane is what makes those resolve
   to Mocha inside it; without it a Latte page paints light text on crust.
   Scope note: this reads rules that paint --term-bg in a stylesheet, which is
   how every pane is written today. A pane introduced through an inline style,
   or one that paints --term-bar instead, is outside what this can see. */
const styled = readdirSync(srcDir, { recursive: true })
  .filter((f) => /\.(astro|css)$/.test(f))
  .map((f) => [f, readFileSync(new URL(f, srcDir), "utf8")]);

let panes = 0;
for (const [file, src] of styled) {
  for (const [rule] of src.matchAll(/\{[^{}]*background(?:-color)?:\s*var\(--term-bg\)[^{}]*\}/g)) {
    panes += 1;
    if (!/color-scheme:\s*dark/.test(rule)) {
      problems.push(`${file}: a rule paints --term-bg without pinning color-scheme: dark`);
    }
  }
}
if (!panes) throw new Error("no --term-bg panes found: the pane scan is broken");

/* The panes are the exception to the mode wiring, so the wiring itself has to
   hold — and it is what every color on the site now hangs from. Two claims: a
   document with no attribute (JavaScript off) resolves dark, and the light
   signal both shells write reaches color-scheme. */
const base = read("../src/styles/base.css");
const modeWiring = [
  [/(^|\})\s*html\s*\{[^}]*color-scheme:\s*dark/m, "a document with no mode attribute gets dark"],
  [/html\[data-mode="light"\][^{]*\{[^}]*color-scheme:\s*light/, "the light mode both shells signal"],
];
for (const [pattern, claim] of modeWiring) {
  if (!pattern.test(base)) problems.push(`base.css no longer wires ${claim}`);
}

/* Both shells have to agree on how that signal is written and where it is
   kept: one localStorage key, and data-mode spelled out for light as well as
   dark (site.css keys rules on it, and the docs' wordmark swap does too). */
for (const shell of ["../src/layouts/Site.astro", "../src/layouts/BaseLayout.astro"]) {
  const src = read(shell);
  if (!/"ui-mode"/.test(src)) problems.push(`${shell} no longer reads the shared "ui-mode" key`);
  if (!/data-mode|dataset\.mode/.test(src)) problems.push(`${shell} no longer writes data-mode`);
}

/* ── every /docs/ link points at a page that exists ────────────────────── */

/* The docs are copied from vendor/fastagent, and sync-fastagent-docs.mjs
   rewrites their relative .md links into site routes. It checks that a link
   stays inside docs/, not that its target is there — so a page renamed
   upstream leaves a live link to a 404. Nimbus' own link rule can't cover
   this: its linter walks .mdx, and this content is .md (MDX would parse the
   angle brackets and braces in the prose as JSX).
   Both halves of the map are checked here: the links inside the pages, and
   the slugs the sidebar in astro.config.mjs names. */
const docsDir = new URL("docs/", new URL("content/docs/", srcDir));
const docSlugs = new Set(
  readdirSync(docsDir, { recursive: true })
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/${f}`.replaceAll("\\", "/").toLowerCase().replace(/\.md$/, "").replace(/\/index$/, "")),
);
if (docSlugs.size < 10) throw new Error("docs collection looks empty: run npm run sync:docs");

const routeSlug = (href) => href.replace(/^\//, "").replace(/\/$/, "").toLowerCase();
const deadLinks = new Set();
/* Everything that links into the docs, not just the docs themselves: the
   landing page carries a dozen of these hrefs, the header and the footer a
   few, a blog post a couple more, and an upstream rename breaks all of them
   exactly as easily. Every .astro file this repo holds, plus the blog, plus
   the docs — markdown link and HTML href, which between them is how every one
   of these links is written. */
const linkSources = [
  ...readdirSync(docsDir, { recursive: true })
    .filter((f) => f.endsWith(".md"))
    .map((f) => [`docs/${f}`, readFileSync(new URL(f, docsDir), "utf8")]),
  ...styled.filter(([f]) => f.endsWith(".astro")),
  ...readdirSync(new URL("content/blog/", srcDir), { recursive: true })
    .filter((f) => f.endsWith(".md"))
    .map((f) => [`blog/${f}`, readFileSync(new URL(`content/blog/${f}`, srcDir), "utf8")]),
];
for (const [file, src] of linkSources) {
  for (const [, href] of src.matchAll(/(?:\]\(|href=")(\/docs\/[^)"\s#]*)/g)) {
    if (!docSlugs.has(routeSlug(href))) deadLinks.add(`${file} → ${href}`);
  }
}
if (deadLinks.size) {
  problems.push(`docs links with no page behind them: ${[...deadLinks].join(", ")}`);
}

const config = read("../astro.config.mjs");
const sidebar = config.slice(config.indexOf("sidebar: {"), config.indexOf("export default"));
const navSlugs = [
  ...[...sidebar.matchAll(/"(docs(?:\/[\w-]+)*)"/g)].map(([, slug]) => slug),
  ...[...sidebar.matchAll(/link: "(\/docs\/[^"]*)"/g)].map(([, href]) => routeSlug(href)),
];
if (navSlugs.length < 10) throw new Error("the sidebar scan found nothing: astro.config.mjs changed shape");
const navMisses = navSlugs.filter((slug) => !docSlugs.has(slug));
if (navMisses.length) problems.push(`sidebar entries with no page: ${navMisses.join(", ")}`);
/* And the other way: a page nothing links to is a page nobody finds. */
const orphans = [...docSlugs].filter((slug) => !navSlugs.includes(slug));
if (orphans.length) problems.push(`docs pages missing from the sidebar: ${orphans.join(", ")}`);

/* ── brand marks that would vanish on the light page ───────────────────── */

/* Third-party marks keep the vendor's color and are decorative — each is
   labelled in text beside it — so they answer to no contrast floor. What they
   cannot do is disappear: below this ratio the mark reads as a missing icon,
   and site.css remaps it to the nearest palette hue. */
const VANISH = 1.6;
const brandColors = [
  ...new Set(
    [...read("../src/pages/index.astro").matchAll(/color: "(#[0-9a-f]{6})"/gi)]
      .map(([, hex]) => hex.toLowerCase()),
  ),
];
if (!brandColors.length) throw new Error("no brand colors found: the ecosystem scan is broken");
const remapped = new Set(
  [...read("../src/styles/site.css").matchAll(/path\[fill="(#[0-9a-f]{6})"\]/gi)]
    .map(([, hex]) => hex.toLowerCase()),
);
const vanishing = brandColors.filter(
  (hex) => ratio(hex, roles.bg[LIGHT]) < VANISH && !remapped.has(hex),
);
if (vanishing.length) {
  problems.push(
    `brand marks that disappear on the light page and have no remap: ${vanishing.join(", ")}`,
  );
}

/* ── the rasters that bake the palette in ──────────────────────────────── */

/* Sample a fraction across the image rather than a fixed pixel, so a re-export
   at another size still lands in the same place. */
const pixel = async (file, xFraction, yFraction) => {
  const image = sharp(new URL(`../public/${file}`, import.meta.url).pathname);
  const { width, height } = await image.metadata();
  const raw = await image
    .extract({
      left: Math.round(width * xFraction),
      top: Math.round(height * yFraction),
      width: 1,
      height: 1,
    })
    .ensureAlpha()
    .raw()
    .toBuffer();
  if (raw[3] === 0) return `transparent at ${xFraction}×${yFraction}`;
  return `#${[...raw.subarray(0, 3)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

/* Two committed rasters, two different owners. The OG card is a poster with
   its own colors (scripts/render-og.mjs says why), so it answers to CARD; the
   favicon is a UI surface sitting next to the page in a browser tab, so its
   tile answers to the page background. Both are hand-run, both can go stale. */
const baked = [
  ["social-preview.png", await pixel("social-preview.png", 0.004, 0.004), CARD.ground, "npm run og"],
  ["favicon.png", await pixel("favicon.png", 0.5, 0.95), themeColor.dark, "re-export it"],
];
for (const [file, got, expected, how] of baked) {
  if (got !== expected.toLowerCase()) {
    problems.push(`${file} is stale: painted ${got}, the palette says ${expected} (${how})`);
  }
}

/* ── no token is used that nothing defines ────────────────────────────── */

/* Renaming a role is a sweep across CSS and markup, and a missed one is
   silent: `var(--gone)` resolves to nothing and the property falls back to
   inherited or initial, which on a dark pane usually still looks plausible.
   Two sets count as defined elsewhere: Tailwind generates --tw-*, and Shiki
   writes --shiki-* onto the tokens it emits. Everything else has to exist. */
const names = (src, pattern) => [...src.matchAll(pattern)].map(([, name]) => name);
const DEFINE = /(--[\w-]+):/g;
const USE = /var\((--[\w-]+)/g;

/* A .astro component's <style> is scoped: what it defines is invisible to
   every other file, so only the shared sheets contribute to the global set. */
const globalSheets = styled.filter(([f]) => f.startsWith("styles/")).map(([, src]) => src);
const globalTokens = new Set(
  [...globalSheets, read("../src/styles/tokens.css")].flatMap((src) => names(src, DEFINE)),
);

const used = new Set();
for (const [file, src] of styled) {
  const local = new Set([...globalTokens, ...names(src, DEFINE)]);
  for (const name of names(src, USE)) {
    used.add(name);
    if (!local.has(name) && !/^--(tw|shiki)-/.test(name)) {
      problems.push(`${file}: var(${name}) is never defined where that file can see it`);
    }
  }
}

/* ── every mock line has a cue ─────────────────────────────────────────── */

/* The hero terminal reveals its lines on a 26s loop, one keyframe per cue
   (HeroMock.astro says why that cannot collapse). Every line starts at
   opacity 0, so a line whose class has no animation-name rule is invisible
   forever — and nothing else about the page looks broken. */
const mock = read("../src/components/HeroMock.astro");
const cued = new Set(
  [...mock.matchAll(/^\s*\.([\w-]+)\s*\{\s*animation-name:/gm)].map(([, cls]) => cls),
);
const lines = [...mock.matchAll(/class="tl ([\w\- ]+)"/g)];
if (lines.length !== (mock.match(/class="tl[ "]/g) ?? []).length) {
  throw new Error("the hero mock's line markup changed shape: the cue scan reads nothing");
}
const uncued = lines
  .flatMap(([, classes]) => classes.split(/\s+/))
  .filter((cls) => cls !== "gap" && cls !== "caret-line" && !cued.has(cls));
if (uncued.length) {
  problems.push(`hero mock lines that would never fade in: ${[...new Set(uncued)].join(", ")}`);
}

/* ── the CSS-only tabs have a hand-written ceiling ─────────────────────── */

/* Each tab needs an `input:nth-of-type(N):checked ~ ...` pair written out by
   hand in site.css. The ceiling is the highest N those lists reach — read it
   from them rather than restating it, so the two cannot drift. */
const css = read("../src/styles/site.css");
const reach = (pattern) =>
  Math.max(0, ...[...css.matchAll(pattern)].map(([, n]) => Number(n)));
/* Three lists have to agree: the checked label, its focus ring, and the panel.
   A tab wired in two of the three is worse than one wired in none. */
const lists = {
  "checked label": reach(/input:nth-of-type\((\d+)\):checked ~ .tabs-labels/g),
  "focus ring": reach(/input:nth-of-type\((\d+)\):focus-visible/g),
  panel: reach(/input:nth-of-type\((\d+)\):checked ~ pre/g),
};
const reached = Object.values(lists);
if (new Set(reached).size > 1) {
  problems.push(
    `the tab selector lists disagree: ${Object.entries(lists).map(([k, v]) => `${k} ${v}`).join(", ")}`,
  );
}
const TAB_LIMIT = Math.min(...reached);
if (Math.max(...reached) === 0) {
  throw new Error("no tab selectors found in site.css: the ceiling scan is broken");
}
const tabs = read("../src/pages/index.astro").match(/const embedFrameworks = \[([\s\S]*?)\n\];/);
if (!tabs) throw new Error("embedFrameworks is gone from index.astro");
/* Count the `id:` keys rather than the braces: one per framework, and immune
   to how the literal is wrapped. */
const tabCount = (tabs[1].match(/\bid:\s*"/g) ?? []).length;
if (!tabCount) throw new Error("embedFrameworks parsed as empty: the tab scan is broken");
if (tabCount > TAB_LIMIT) {
  problems.push(
    `${tabCount} embed frameworks but the CSS-only tabs only wire ${TAB_LIMIT}` +
      " (extend the nth-of-type lists in site.css)",
  );
}

if (problems.length) {
  for (const line of problems) console.error(line);
  process.exit(1);
}
console.log(
  `site: ${(rolePairs.length + docsPairs.length) * 2 + termPairs.length} contrast pairs pass,` +
    ` ${panes} panes pinned, ${baked.length} rasters current,` +
    ` ${docSlugs.size} docs pages linked and in the sidebar,` +
    ` ${used.size} tokens used, ${cued.size} mock cues,` +
    ` ${tabCount}/${TAB_LIMIT} tabs wired`,
);
