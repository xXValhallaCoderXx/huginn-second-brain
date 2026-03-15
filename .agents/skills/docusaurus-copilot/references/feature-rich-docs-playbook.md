# Feature-rich docs playbook

Use this playbook to move from "technically correct" documentation to documentation users actually enjoy using.

## The bar

A strong Docusaurus docs experience should feel:

- fast to navigate
- visually coherent
- trustworthy
- actionable
- discoverable from search
- helpful under pressure
- opinionated where users need guidance

## Start with user flows, not page templates

For each doc area, identify:

- who lands here
- what they are trying to do
- what they already know
- what can go wrong
- what they should do next

Then design the page around that flow.

## Content patterns that outperform bland docs

### 1. Guided quickstarts

Use when users want first success fast.

Include:

- prerequisites
- minimal install path
- the smallest working example
- what success looks like
- next-step links to deepen knowledge

### 2. Decision pages

Use for framework choice, architecture choice, cloud choice, migration path, or feature comparison.

Good tools:

- tabs
- comparison tables
- admonitions for trade-offs
- diagrams for architecture differences
- landing pages via `src/pages`

### 3. Task recipes

Use for high-intent actions.

Structure:

- problem statement
- prerequisites
- steps
- expected result
- troubleshooting
- related recipes

### 4. Concept + implementation pages

Use for difficult mental models.

Structure:

- intuition first
- architecture or lifecycle diagram
- example
- edge cases
- reference links

### 5. Troubleshooting pages

These should be searchable and brutally practical.

Use:

- symptom-based headings
- copy-pastable fixes
- error message snippets
- “why this happens” explanations
- escalation paths

### 6. Release and migration storytelling

Use the blog for:

- release highlights
- migration guides
- deprecations
- author perspectives
- rollout notes

Then link durable technical steps back into docs.

## Best Docusaurus UX levers

### Tabs

Great for:

- OS-specific steps
- package manager choices
- language variants
- API style differences
- cloud provider choices

Guidance:

- use `groupId` for recurring choices
- use `queryString` when people need to share a preselected state
- do not duplicate huge blocks without reason

### Code blocks

Make examples easier to scan:

- add titles showing file paths
- highlight changed or critical lines
- use line numbers selectively
- add language-specific or package-manager-specific switching
- use live code only when interactivity adds clarity

### Admonitions

Use for meaning, not decoration.

Suggested semantics:

- `note`: context / clarification
- `tip`: recommended path / productivity win
- `info`: neutral but important concept
- `warning`: risky path or important caveat
- `danger`: destructive or security-sensitive action

### Diagrams

Use diagrams for:

- request flows
- system architecture
- branching decisions
- lifecycle/state transitions
- onboarding pathways

If prose is taking too many paragraphs to explain a flow, diagram it.

### Inline TOC

Use on long narrative or reference pages where readers benefit from seeing structure near the top of the content.

### Blog + docs together

A mature docs program uses both:

- docs = durable truth
- blog = timely storytelling

### Search as a feature

Treat search as part of the UX, not an afterthought.

If search is enabled:

- make titles and descriptions specific
- keep headings meaningful
- ensure crawlers index the right versions/locales
- re-crawl after major structural changes

## Design polish tactics

### Make the landing pages do real work

The homepage or docs homepage should answer:

- what this product does
- who it is for
- where to start
- what path fits this user
- where to find migration/reference/troubleshooting

### Build better category pages

Use generated index pages or custom pages to introduce a section before users dive into leaf pages.

A strong category page can include:

- what this section covers
- who it is for
- recommended reading order
- featured guides
- comparison links

### Improve visual hierarchy

Use:

- clean headings
- short intro paragraphs
- scannable lists
- embedded components for repeated patterns
- restrained but intentional color accents

### Use reusable components for signature patterns

Examples:

- feature comparison grid
- architecture callout
- rollout status badge
- beta/GA lifecycle marker
- API stability indicator
- “what happens next” component

## Maintainability rules

- if JSX repeats, extract a component
- if tags repeat, standardize a tags file
- if authors repeat, use an authors map
- if swizzles exist, document why
- if versioning exists, justify why each version remains live
- if i18n exists, make sure owners and workflows exist

## Quality smells

Watch for these warnings:

- pages feel long but still don’t answer key questions
- users must read five pages before first success
- every page starts with generic marketing copy
- tabs duplicate content instead of focusing it
- sidebars mirror team structure instead of user tasks
- search returns stale or wrong-version content
- examples are trivial and unrealistic
- landing pages are pretty but do not route users well

## Premium docs ideas

Reach for these when they serve the product:

- synced install tabs across the site
- live playgrounds for high-value APIs
- visual architecture diagrams
- “choose your path” landing pages
- release narrative blog posts linked to exact migration docs
- custom admonition types for support policy, lifecycle stage, or rollout state
- themed search that feels native to the brand
- author pages for engineering education credibility
- shareable tab state via query strings for support/debugging workflows

## Final principle

The best documentation pages reduce uncertainty.

When deciding whether to add content or interactivity, ask:

- does this reduce uncertainty?
- does this help a real task?
- does this make the next step clearer?
- can the team maintain it?

If yes, ship it.
If not, simplify.
