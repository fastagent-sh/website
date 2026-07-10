# FastAgent website

This repository owns the public landing page, rendered documentation, blog, and brand assets for fastagent.sh.

- Framework behavior and onboarding source live in `vendor/fastagent/docs/`, pinned from `fastagent-sh/fastagent`.
- Never edit `src/content/docs/docs/`, `src/generated/`, or `public/start.md`; `npm run sync:docs` regenerates them.
- Blog posts live in `src/content/docs/blog/`.
- Keep the site static: Astro, Starlight, and vanilla CSS. Do not add a client framework, CMS, database, or SSR without a demonstrated need.
- Run `npm run check && npm run build` before opening a PR.
- Maintainer-authored PRs may self-merge after required checks; external-contributor PRs require one maintainer approval.
