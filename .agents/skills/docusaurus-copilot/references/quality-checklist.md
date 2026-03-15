# Docusaurus documentation quality checklist

Use this checklist before calling a Docusaurus documentation task complete.

## Strategy

- [ ] The target audience is explicit or inferable.
- [ ] The primary user task is clear.
- [ ] The page or section has a clear purpose: onboarding, concept, task, reference, troubleshooting, migration, or release.
- [ ] The structure helps users get to success faster.

## Architecture and navigation

- [ ] The content belongs in docs, blog, or pages for a clear reason.
- [ ] Sidebar organization reflects user goals, not internal team structure.
- [ ] Category/landing pages exist where users need orientation.
- [ ] Links to adjacent next steps are present.
- [ ] There are no obvious route collisions.

## Content quality

- [ ] The opening explains what the user can do here.
- [ ] Prerequisites are explicit when needed.
- [ ] Examples are realistic enough to be useful.
- [ ] Trade-offs or caveats are surfaced where they matter.
- [ ] Troubleshooting exists where failure is likely.
- [ ] Duplication is minimized.

## Docusaurus feature usage

- [ ] Tabs are used where user variants matter.
- [ ] Code blocks are titled/highlighted when it improves comprehension.
- [ ] Admonitions are meaningful, not decorative.
- [ ] TOC behavior is intentional on long pages.
- [ ] Diagrams are used where they explain better than prose.
- [ ] Interactive features are worth their maintenance cost.

## Search, SEO, and trust

- [ ] Titles and descriptions are specific.
- [ ] Slugs are clean and stable.
- [ ] Important headings have stable IDs when deep links matter.
- [ ] Search can surface the new/updated content.
- [ ] Version/locale-aware search behavior is respected.
- [ ] Share metadata and images are considered where useful.

## Theming and polish

- [ ] The page feels visually coherent with the site.
- [ ] Contrast and readability are acceptable in light and dark mode.
- [ ] Static assets are referenced safely for the configured `baseUrl`.
- [ ] Custom styling uses the least risky mechanism that works.

## Maintainability

- [ ] Repeated JSX/content patterns were extracted when appropriate.
- [ ] Swizzles are justified and minimized.
- [ ] Unsafe ejections are avoided unless necessary.
- [ ] Versioning is only used when truly needed.
- [ ] i18n is only used with a plausible workflow.
- [ ] Added plugins/themes/components have a clear payoff.

## Finish line

- [ ] The docs are clearer, more useful, or more impressive than before.
- [ ] The result feels intentional—not default, not generic, not noisy.
- [ ] A customer or evaluator would likely judge the documentation more favorably after this change.
