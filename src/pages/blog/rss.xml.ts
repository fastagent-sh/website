import { getCollection } from "astro:content";

const site = "https://fastagent.sh";

const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export async function GET() {
  const posts = (await getCollection("blog")).sort((a, b) => +b.data.date - +a.data.date);

  const items = posts
    .map(
      (p) => `    <item>
      <title>${escape(p.data.title)}</title>
      <link>${site}/blog/${p.id}/</link>
      <guid>${site}/blog/${p.id}/</guid>
      <pubDate>${p.data.date.toUTCString()}</pubDate>
      <description>${escape(p.data.excerpt)}</description>
${p.data.tags.map((t) => `      <category>${escape(t)}</category>`).join("\n")}
    </item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>FastAgent Blog</title>
    <link>${site}/blog/</link>
    <description>Releases, design writeups, and what's shipping next — from the FastAgent team.</description>
    <language>en</language>
    <atom:link href="${site}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
