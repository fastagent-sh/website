/* Renders one social card per post into public/og/, from the post's own title.
   Not part of the build — run it after adding or renaming a post:
     npm run og:posts

   Two shapes on purpose: a card with a title is the post's, and posts without
   an `image` frontmatter keep the site card, so nothing silently changes. The
   output is committed for the same reason public/social-preview.png is: sharp
   resolves fonts against the machine, so the rendering is not host-independent. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { CARD, MONO, escapeXml } from "./og-theme.mjs";

const BLOG_DIR = new URL("../src/content/blog/", import.meta.url);
const OUT_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 84;
const TITLE_SIZE = 56;
const MAX_LINES = 4;

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const data = { tags: [] };
  let list = null;
  for (const line of match[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && list) {
      list.push(item[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (!field) continue;
    list = null;
    const value = field[2].trim().replace(/^["']|["']$/g, "");
    if (value) data[field[1]] = value;
    else if (field[1] === "tags") list = data.tags;
  }
  return data;
}

/* Rough mono advance: 0.6em. Exact enough for wrapping, and the renderer is
   checked by eye before the PNGs are committed. */
function wrap(title, size, width) {
  const perLine = Math.floor(width / (size * 0.6));
  const lines = [];
  let line = "";
  for (const word of title.split(/\s+/)) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= perLine) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, MAX_LINES);
}

mkdirSync(`${OUT_DIR}og/`, { recursive: true });
const posts = readdirSync(BLOG_DIR)
  .filter((file) => file.endsWith(".md"))
  .map((file) => ({ file, data: frontmatter(readFileSync(new URL(file, BLOG_DIR), "utf8")) }))
  .filter(({ data }) => data.title && data.image);

for (const { data } of posts) {
  const lines = wrap(data.title, TITLE_SIZE, WIDTH - PAD * 2);
  const startY = HEIGHT / 2 - ((lines.length - 1) * TITLE_SIZE * 1.25) / 2 + 10;
  const title = lines
    .map(
      (text, index) =>
        `<text x="${PAD}" y="${Math.round(startY + index * TITLE_SIZE * 1.25)}" font-family="${MONO}" font-size="${TITLE_SIZE}" font-weight="600" fill="${CARD.headline}">${escapeXml(text)}</text>`,
    )
    .join("\n  ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="${CARD.ground}"/>
      <stop offset="1" stop-color="${CARD.groundFar}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.18" r="0.6">
      <stop stop-color="${CARD.glow}"/>
      <stop offset="1" stop-color="${CARD.glowFade}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  <text x="${PAD}" y="150" font-family="${MONO}" font-size="26" fill="${CARD.accent}"># blog</text>
  ${title}
  <text x="${PAD}" y="${HEIGHT - 64}" font-family="${MONO}" font-size="26" fill="${CARD.sub}">fastagent.sh</text>
  <text x="${WIDTH - PAD}" y="${HEIGHT - 64}" text-anchor="end" font-family="${MONO}" font-size="26" fill="${CARD.dim}">${escapeXml(data.tags[0] ?? "blog")}</text>
</svg>
`;

  const relative = data.image.replace(/^\//, "");
  writeFileSync(`${OUT_DIR}${relative}`, await sharp(Buffer.from(svg)).png().toBuffer());
  console.log(`wrote public/${relative} — ${data.title}`);
}
