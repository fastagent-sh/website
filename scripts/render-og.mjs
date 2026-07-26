/* Renders public/social-preview.png (the OG card).
   Not part of the build — run it by hand after editing this file:
     npm run og

   The card keeps its own colors on purpose. It is a poster, not a surface of
   the site: it is seen alone in a feed, at thumbnail size, next to other
   cards, so it is tuned for punch — near-black ground, one teal glow — rather
   than for agreement with the page palette in theme.ts. That means a palette
   change does *not* require re-rendering it; changing this file does.
   `npm run check` only compares the PNG's corner to CARD.ground — enough to
   catch a ground drift, blind to everything else, so re-render whenever you
   touch this file.

   CARD.accent is deliberately the pre-Catppuccin teal, not the site's green:
   it reads harder in a feed, and it is the one cool hue that agrees with the
   silver-gradient wordmark instead of competing with it. If the card should
   agree with the site instead, swap it for mocha.green and re-render.

   The composition is logo → claim → proof: the wordmark carries the identity
   (it is the brand's best-drawn asset, and as a PNG it renders identically on
   every machine), the mono claim says what the thing is, and a terminal
   window replays the site's hero in four lines. The mark rises behind the
   window as a watermark. Type is mono because the site is mono — the headline
   used to be sans, which is what made the card read as any other dev-tool ad.

   The top-right credit is pi (pi.dev), the built-in harness: it is the one
   name a reader may already trust, and it costs a corner. It replaced the
   domain, which the feed prints under the card anyway. Keep it truthful — the
   harness is swappable, so this reads "built on", not "requires". The mark is
   pi's own, from their press kit — it spells the name, so nothing spells it
   again next to it.

   The PNG is committed because the output is not host-independent: sharp
   rasterises through librsvg, which resolves font families against the
   machine's installed fonts. IBM Plex Mono — the site's face — is not assumed
   to be installed, so this falls back to the platform mono. Eyeball the
   result before committing. */
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { brandIcons } from "../src/components/brand-icons.ts";

/* pi's mark, from the same entry the page's credit lockups draw — one copy of
   the path, whichever surface renders it. A brand icon may also be a bare
   24×24 path string; this one is not, and a silent switch would render an
   undefined viewBox, which librsvg drops without a word. */
const pi = brandIcons["pi"];
if (typeof pi === "string") throw new Error("the pi icon is now a bare path — give it a viewBox here");

export const CARD = {
  ground: "#11151a",
  groundFar: "#080a0d",
  glow: "#15383d",
  glowFade: "#0d0f12",
  accent: "#45cbd3",
  headline: "#f1f4f7",
  sub: "#9ba3ae",
  paneBg: "#0b0e12",
  paneBar: "#141920",
  paneLine: "#2b323c",
  paneText: "#c3cad4",
  dim: "#6b7480",
  ok: "#8fdc8a",
  str: "#e6c68a",
};

const mono = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const dataUri = (file) =>
  `data:image/png;base64,${readFileSync(new URL(`../public/${file}`, import.meta.url)).toString("base64")}`;

/* Terminal transcript — the hero's two acts (HeroMock.astro), condensed. */
const line = (y, spans) =>
  `<text x="30" y="${y}" font-size="21" xml:space="preserve">${spans
    .map(([t, fill]) => `<tspan fill="${fill}">${t}</tspan>`)
    .join("")}</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="${CARD.ground}"/>
      <stop offset="1" stop-color="${CARD.groundFar}"/>
    </linearGradient>
    <radialGradient id="r" cx="72%" cy="10%" r="70%">
      <stop stop-color="${CARD.glow}" stop-opacity=".8"/>
      <stop offset="1" stop-color="${CARD.glowFade}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect width="1200" height="630" fill="url(#r)"/>

  <!-- the mark, rising behind the terminal window -->
  <image href="${dataUri("logo-mark.png")}" x="846" y="-16" width="440" height="440" opacity=".07"/>

  <g font-family="${mono}">
    <text x="78" y="92" fill="${CARD.accent}" font-size="22" letter-spacing="1.2"># ship your agent as a live service</text>
    <!-- built on [mark]. The mark spells "pi", so the name is not set twice;
         the text is right-anchored, so other font metrics move it away from
         the mark rather than into it. -->
    <text x="1076" y="93" fill="${CARD.dim}" font-size="25" text-anchor="end">built on</text>
    <svg x="1088" y="66" width="34" height="34" viewBox="${pi.viewBox}">${pi.body.replaceAll("currentColor", CARD.accent)}</svg>

    <image href="${dataUri("logo.png")}" x="70" y="112" width="386" height="135"/>

    <text x="78" y="300" fill="${CARD.headline}" font-size="42" font-weight="600">An agent is just a directory.</text>
    <text x="78" y="342" fill="${CARD.sub}" font-size="24">No rewrite, no new format, no platform.</text>

    <g transform="translate(78 372)">
      <rect width="1044" height="216" rx="14" fill="${CARD.paneBg}" stroke="${CARD.paneLine}"/>
      <path d="M0 14a14 14 0 0 1 14-14h1016a14 14 0 0 1 14 14v28H0z" fill="${CARD.paneBar}"/>
      <line x1="0" y1="42" x2="1044" y2="42" stroke="${CARD.paneLine}"/>
      <g><circle cx="30" cy="21" r="5" fill="#f38ba8"/><circle cx="48" cy="21" r="5" fill="#f9e2af"/><circle cx="66" cy="21" r="5" fill="#a6e3a1"/></g>
      <text x="90" y="27" fill="${CARD.dim}" font-size="17">~/support-agent</text>
      <rect x="948" y="10" width="66" height="23" rx="11" fill="${CARD.accent}" opacity=".16"/>
      <text x="981" y="26" fill="${CARD.accent}" font-size="15" letter-spacing="1.4" text-anchor="middle">LIVE</text>
      ${line(86, [
        ["❯ ", CARD.accent],
        ["claude ", CARD.headline],
        ['"read fastagent.sh/start.md, build a support agent"', CARD.str],
      ])}
      ${line(124, [
        ["✓ ", CARD.ok],
        ["wrote persona.md · skills/ · tools/ · ", CARD.paneText],
        ["channels/", CARD.accent],
      ])}
      ${line(162, [
        ["❯ ", CARD.accent],
        ["fastagent dev", CARD.headline],
      ])}
      ${line(200, [
        ["[fastagent] ", CARD.dim],
        ["github · telegram · slack · feishu · http", CARD.paneText],
        [" — listening on ", CARD.dim],
        [":8787", CARD.accent],
      ])}
    </g>
  </g>
</svg>
`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = new URL("../public/social-preview.png", import.meta.url);
  await sharp(Buffer.from(svg)).png().toFile(out.pathname);
  console.log("wrote public/social-preview.png");
}
