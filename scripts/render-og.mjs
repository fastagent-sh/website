/* Renders public/social-preview.png (the OG card).
   Not part of the build — run it by hand after editing this file:
     npm run og

   The card keeps its own colors on purpose. It is a poster, not a surface of
   the site: it is seen alone in a feed, at thumbnail size, next to other
   cards, so it is tuned for punch — near-black ground, one teal glow, a white
   headline — rather than for agreement with the page palette in theme.ts.
   That means a palette change does *not* require re-rendering it; changing
   this file does. `npm run check` only compares the PNG's corner to
   CARD.ground — enough to catch a ground drift, blind to everything else, so
   re-render whenever you touch this file.

   CARD.accent is deliberately the pre-Catppuccin teal, not the site's green:
   this composition — near-black ground, one teal glow, a white headline — was
   kept by an explicit call because it reads harder in a feed. If the wordmark
   should agree with the site instead, swap it for mocha.green and re-render.

   The PNG is committed because the output is not host-independent: sharp
   rasterises through librsvg, which resolves font families against the
   machine's installed fonts. Eyeball the result before committing. */
import sharp from "sharp";

export const CARD = {
  ground: "#11151a",
  groundFar: "#080a0d",
  glow: "#15383d",
  glowFade: "#0d0f12",
  accent: "#45cbd3",
  headline: "#f1f4f7",
  sub: "#9ba3ae",
  paneBg: "#111419",
  paneLine: "#303741",
  paneText: "#a3abb6",
};

const sans = "ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
const mono = "ui-monospace,SFMono-Regular,Consolas,monospace";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="${CARD.ground}"/>
      <stop offset="1" stop-color="${CARD.groundFar}"/>
    </linearGradient>
    <radialGradient id="r" cx="70%" cy="12%" r="75%">
      <stop stop-color="${CARD.glow}" stop-opacity=".72"/>
      <stop offset="1" stop-color="${CARD.glowFade}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect width="1200" height="630" fill="url(#r)"/>
  <g font-family="${sans}">
    <text x="78" y="110" fill="${CARD.accent}" font-size="25" font-weight="700" letter-spacing="3">FASTAGENT</text>
    <text x="78" y="225" fill="${CARD.headline}" font-size="64" font-weight="720">Vibe first. Then FastAgent.</text>
    <text x="78" y="290" fill="${CARD.sub}" font-size="31">Turn an agent directory into a live service.</text>
    <g transform="translate(78 360)">
      <rect width="1044" height="154" rx="18" fill="${CARD.paneBg}" stroke="${CARD.paneLine}"/>
      <text x="28" y="48" fill="${CARD.accent}" font-family="${mono}" font-size="22">agent/</text>
      <text x="28" y="88" fill="${CARD.paneText}" font-family="${mono}" font-size="22">├── persona.md  ├── skills/  ├── tools/  └── channels/</text>
      <text x="28" y="128" fill="${CARD.headline}" font-family="${mono}" font-size="22">npm i @fastagent-sh/fastagent</text>
    </g>
  </g>
</svg>
`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = new URL("../public/social-preview.png", import.meta.url);
  await sharp(Buffer.from(svg)).png().toFile(out.pathname);
  console.log("wrote public/social-preview.png");
}
