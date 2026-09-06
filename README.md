# fastagent.sh

The public website, rendered documentation, and blog for [FastAgent](https://github.com/fastagent-sh/fastagent).

## Development

Clone with the documentation source:

```bash
git clone --recurse-submodules https://github.com/fastagent-sh/website.git
cd website
npm install
npm run dev
```

Node 22.18 or newer — the build scripts import TypeScript directly.

Before opening a pull request:

```bash
npm run check
npm run build
```

## Stack

Astro, static output, deployed to Cloudflare Workers Static Assets.

- `/docs/*` runs on [Nimbus](https://nimbus-docs.com), Cloudflare's Astro documentation framework. Its starter files live in this repo and are edited here; `nimbus.json` tracks what came from the registry, and `npx nimbus-docs outdated` reports what upstream has moved on.
- The landing page and the blog use a hand-written shell (`src/layouts/Site.astro`); the 404 runs on the docs shell, so a missed URL still lands somewhere with search and navigation.
- Both read one palette (`src/theme.ts`) and one mode switch, so crossing between them keeps the reader's theme.

Every docs page also ships a Markdown twin at `/docs/<slug>/index.md`, indexed by `/llms.txt` and `/llms-full.txt`. `/start.md` is the agent development guide for humans and coding agents; the same guide is discoverable at `/.well-known/agent-skills/`.

## Content ownership

- Landing pages, blog posts, and brand assets are authored here.
- Framework documentation is authored in [`fastagent-sh/fastagent`](https://github.com/fastagent-sh/fastagent/tree/main/docs).
- `npm run sync:docs` renders the pinned `vendor/fastagent` revision. Generated documentation is not committed.

## Updating FastAgent content

Pin a published release rather than an untagged development revision:

```bash
git -C vendor/fastagent fetch origin tag vX.Y.Z
git -C vendor/fastagent checkout --detach vX.Y.Z
npm run sync:docs
```

Review the upstream release notes and documentation diff. Add new pages to `sidebar.items` in `astro.config.mjs`, then review the landing page's examples, supported integrations, and tutorials against that release. Keep historical publication dates; date substantive tutorial updates in the article. Both site headers, homepage metadata, and `/llms.txt` read the generated package version.

Run `npm run check && npm run build` and commit the submodule pointer with the authored changes. Updating the source checkout alone does not update the site's pinned documentation.

## Deployment

The static Astro build in `dist/` deploys through Cloudflare Workers Static Assets. Production is `https://fastagent.sh`.

CI deploys automatically on every push to `main` (the `deploy` job in `.github/workflows/ci.yml`, authenticated by the `CLOUDFLARE_API_TOKEN` repo secret). `npm run deploy` remains as the manual break-glass path.
