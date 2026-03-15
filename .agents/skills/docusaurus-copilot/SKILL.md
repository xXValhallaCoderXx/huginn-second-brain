---
name: docusaurus-copilot
description: "Master guide for building rich, modern Docusaurus documentation and documentation websites. Use when creating or improving Docusaurus docs, MDX content, docs information architecture, sidebars, versioning, search, blog/pages, swizzling, theming, i18n, deployment, or when asked to make documentation more polished, interactive, discoverable, and customer-impressive instead of generic."
license: Apache-2.0
metadata:
  author: GitHub Copilot
  version: "1.0.0"
---

# Docusaurus Copilot

Build documentation that feels like a product experience, not an afterthought.

This skill helps an AI agent design, write, structure, enrich, and validate Docusaurus documentation using current Docusaurus capabilities and a high quality bar for UX, maintainability, discoverability, and visual polish.

## Core mindset

Documentation is part of the product surface.

Do not ship bland docs that merely exist. Ship docs that:

- help users complete real tasks quickly
- reduce support load
- feel trustworthy and polished
- guide discovery, not just reference storage
- use interactivity only when it genuinely improves understanding
- remain maintainable for the team after launch

## Critical rules

### 1. Do not trust stale Docusaurus knowledge

Docusaurus evolves. Before making meaningful changes, inspect the project and verify how the site is configured.

Check at minimum:

- `package.json`
- `docusaurus.config.js|ts|mjs`
- `sidebars.js|ts`
- `docs/`, `blog/`, `src/pages/`, `src/components/`, `src/css/`
- `i18n/`, `versioned_docs/`, `versioned_sidebars/`, `static/`
- existing swizzled files in `src/theme/`

If the local project does not reveal enough, consult current Docusaurus docs.

## 2. Prefer the smallest effective customization

Use this escalation ladder:

1. Content structure and front matter
2. Built-in Markdown/MDX features
3. Reusable React components in `src/components`
4. CSS variables, global CSS, CSS modules
5. Theme config and official plugins
6. Wrap swizzled components
7. Eject components only when necessary

Wrapping is safer than ejecting. CSS is safer than swizzling. Reusable components are safer than duplicating JSX in many docs.

## 3. Optimize for user outcomes, not page count

Before writing, identify:

- primary audiences
- top user tasks
- likely entry points from search
- upgrade / migration pain points
- places where users need comparison, validation, troubleshooting, or confidence

## 4. Feature-rich does not mean noisy

Use advanced features deliberately. Avoid gimmicks.

Good richness:

- synchronized tabs for OS / language / framework choices
- live examples when they reduce ambiguity
- diagrams for systems and flows
- structured admonitions for risk and decision points
- version-aware navigation and search
- landing pages that help users choose the right path

Bad richness:

- animation for its own sake
- duplicated content across tabs
- giant hero sections on every page
- too many custom components with no reuse strategy
- fragile swizzles for problems CSS could solve

## Workflow

### 1. Diagnose the current docs product

Identify what kind of Docusaurus site this is or should be:

- docs-first product docs
- docs + marketing pages
- docs + engineering blog / changelog
- multi-product or multi-instance docs
- versioned API / SDK docs
- multilingual documentation

Then inventory:

- route model (`docs`, `blog`, `pages`, docs-only mode, blog-only mode)
- navigation model (navbar, sidebars, breadcrumbs, generated indices)
- discoverability model (search, tags, authors, TOC, version dropdown)
- visual model (theme tokens, custom CSS, swizzles)
- content model (tutorials, concepts, reference, troubleshooting, release notes)

### 2. Design the information architecture

Use clear content layers:

- **Start here**: onboarding, quickstart, install, hello world
- **Learn**: conceptual guides, core mental models, architecture
- **Build**: task-oriented tutorials and recipes
- **Reference**: APIs, configuration, schemas, CLI, components
- **Operate**: deployment, security, observability, troubleshooting
- **Change**: release notes, migrations, deprecations, version differences

Prefer short pathways over sprawling trees.

Good IA patterns:

- generated index pages for category-level orientation
- sidebars that mirror user goals instead of internal org charts
- tags for cross-cutting topics like migration, security, performance, AI, SDK
- blog for release storytelling and engineering narratives
- docs for durable task/reference content

### 3. Choose the right Docusaurus primitive

Use:

- **Docs plugin** for structured documentation with sidebars, versions, tags, and doc UX
- **Blog plugin** for releases, changelogs, engineering stories, author pages, feeds
- **Pages plugin** for landing pages, comparison pages, docs homepages, campaign pages, calculators, or interactive guides
- **MDX** for mixing prose with components
- **Reusable React components** for repeated UI patterns and interactive teaching aids

### 4. Make the docs genuinely useful

When writing or refactoring content:

- start with the task, not the feature
- include prerequisites and decision points early
- show realistic examples, not toy abstractions only
- explain why, when, and trade-offs—not just how
- add troubleshooting where users actually fail
- add migration guidance where upgrades cause friction
- include links to adjacent next steps

### 5. Use Docusaurus features aggressively but intentionally

Consult [`references/docusaurus-capabilities.md`](references/docusaurus-capabilities.md) and [`references/feature-rich-docs-playbook.md`](references/feature-rich-docs-playbook.md).

Reach first for these patterns:

- tabs with `groupId` for OS / package manager / framework selection
- query-string tabs when sharable state matters
- code block titles, line highlights, line numbers, and multi-package-manager support
- live code blocks when users benefit from immediate experimentation
- admonitions with meaningful semantics and custom variants if needed
- inline TOCs on long conceptual pages
- Mermaid diagrams for architecture, flows, and decision trees
- KaTeX for mathematical or algorithmic documentation
- blog feeds, authors, and tags for release communication
- versions only when the product truly needs them
- i18n only with a clear translation workflow
- search with correct contextual behavior

### 6. Make it look premium

Push beyond default styling when it serves clarity:

- tune Infima variables for brand alignment and accessible contrast
- design strong landing pages and category pages
- highlight important sidebar items where appropriate
- use custom components for callouts, feature matrices, interactive sandboxes, diagrams, and comparison blocks
- customize search styling so it feels native to the site
- use pages and blog content to create a coherent docs product, not isolated pages

Prefer maintainable approaches:

- CSS variables and modules first
- stable theme class names first
- wrap safe components before ejecting unsafe ones

### 7. Engineer for discoverability and trust

Always consider:

- page titles and descriptions
- Open Graph images for shareability
- explicit heading IDs when links must remain stable
- clean slugs and predictable routes
- edit links where collaboration matters
- last updated metadata where trust matters
- search index health after structural changes
- version-aware and locale-aware search behavior

### 8. Validate like a product owner

Before considering docs done, verify:

- navigation is coherent
- no route collisions exist
- `baseUrl`, `url`, and static asset handling are correct
- sidebars and generated indices match the content model
- search can find the new material
- tabs/admonitions/MDX compile correctly
- interactive examples are worth their complexity
- versioning and i18n decisions are justified, not cargo-culted
- the docs feel better, not just longer

Use [`references/quality-checklist.md`](references/quality-checklist.md) as the completion bar.

## Decision heuristics

### When to use docs vs blog vs pages

- Use **docs** for evergreen task/reference content.
- Use **blog** for release notes, announcements, engineering updates, migration stories, narrative explainers, and author-led thought pieces.
- Use **pages** for polished entry points, product overviews, interactive explainers, and custom journeys.

### When to use MDX vs plain Markdown

- Use plain Markdown for straightforward, durable content.
- Use MDX when interactivity, reusable UI, diagrams, or embedded React components materially improve understanding.
- If JSX starts becoming dense or repeated, move it into a reusable component file.

### When to use versioning

Use versioning only when users truly need multiple active doc sets. Keep the number of active versions small. If only one version matters operationally, do not create a version labyrinth.

### When to use i18n

Use i18n when there is a real translation workflow and ownership model. Avoid enabling it without a plan for content updates, translation freshness, and asset localization.

### When to swizzle

Ask in order:

1. Can CSS solve this?
2. Can front matter, theme config, or a built-in component solve this?
3. Can a wrapper solve this?
4. Is ejecting worth the maintenance cost?

## Anti-patterns

Avoid:

- copying the same setup instructions into many pages instead of using partials/components
- burying troubleshooting at the end of giant pages
- using versioning for every patch release
- breaking base URLs with hard-coded asset paths in JSX
- relying on fragile relative imports in versioned or translated docs
- turning every caution into a warning box
- swizzling unsafe components without documenting why
- defaulting to generic landing pages when users need guided decision-making

## Deliverables this skill should encourage

Depending on the task, produce some combination of:

- improved IA and sidebar structure
- richer doc pages with tabs/admonitions/TOCs/diagrams/live examples
- polished landing pages in `src/pages`
- reusable MDX/React components
- stronger search, versioning, and tagging setup
- better SEO/share metadata
- author/tag/feed support for blog-driven documentation programs
- documented rationale for any swizzle or plugin addition

## Example prompts this skill should handle well

- “Turn this Docusaurus docs section into a premium onboarding experience.”
- “Add OS-specific tabs and package-manager-specific install flows across the docs.”
- “Refactor these docs so they are version-aware and easier to search.”
- “Create a docs homepage and category pages that guide users by task.”
- “Add rich MDX components, diagrams, and live examples to explain this architecture.”
- “Improve this Docusaurus site without making it harder to maintain.”
- “Build release-note and changelog flows with blog authors, tags, and feeds.”

## Reference bundle

- [`references/docusaurus-capabilities.md`](references/docusaurus-capabilities.md)
- [`references/feature-rich-docs-playbook.md`](references/feature-rich-docs-playbook.md)
- [`references/quality-checklist.md`](references/quality-checklist.md)
