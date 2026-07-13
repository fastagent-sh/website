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

Before opening a pull request:

```bash
npm run check
npm run build
```

## Content ownership

- Landing pages, blog posts, and brand assets are authored here.
- Framework documentation is authored in [`fastagent-sh/fastagent`](https://github.com/fastagent-sh/fastagent/tree/main/docs).
- `npm run sync:docs` renders the pinned `vendor/fastagent` revision. Generated documentation is not committed.

## Deployment

The static Astro build in `dist/` deploys through Cloudflare Workers Static Assets. Production is `https://fastagent.sh`.

CI deploys automatically on every push to `main` (the `deploy` job in `.github/workflows/ci.yml`, authenticated by the `CLOUDFLARE_API_TOKEN` repo secret). `npm run deploy` remains as the manual break-glass path.
