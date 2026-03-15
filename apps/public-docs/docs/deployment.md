---
title: Deployment notes
---

# Deployment notes

This Docusaurus app builds to static files inside `apps/public-docs/build`.

## Build locally

```bash
pnpm build:public-docs
```

## Hosting options

This site is a strong fit for static hosting such as:

- Vercel
- Netlify
- Cloudflare Pages
- GitHub Pages

If you deploy it from a monorepo-capable host, point the site root at:

```text
apps/public-docs
```

Then use the default Docusaurus build output directory:

```text
build
```
