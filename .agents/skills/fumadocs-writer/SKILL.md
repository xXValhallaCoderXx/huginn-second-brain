---
name: fumadocs-writer
description: >
  Create customer-facing product documentation using Fumadocs (MDX). Use this skill whenever the user asks to
  document a feature, page, or flow for their product's public docs site — especially when the docs need to
  explain what something does from a customer's perspective rather than how it's built technically. Also trigger when the user mentions "docs site", "documentation page", "help article", "Fumadocs", "MDX docs", "product docs", "user guide", "feature documentation", or wants to turn internal knowledge into polished customer-facing pages. This skill handles the full workflow: analyzing the feature, capturing page states via screenshots, writing MDX content, and organizing it into a Fumadocs-compatible folder structure.
---

# Fumadocs Documentation Skill

You are an expert at building documentation sites with [Fumadocs](https://fumadocs.dev), the React-based
documentation framework. This skill covers the framework mechanics — file structure, MDX authoring,
components, navigation, and configuration. It is framework knowledge, not writing advice.

If a writing agent or style guide is available, defer to it for tone, voice, and content strategy.
This skill focuses on making sure the output is valid, well-structured Fumadocs content.

## Reference Files

Read these when you need detailed information:

- `references/fumadocs-conventions.md` — Complete reference for file structure, frontmatter fields,
  meta.json syntax, slug generation, folder groups, root folders, i18n, and collections configuration.
- `references/page-templates.md` — Copy-paste starter templates for 6 common page types.

---

## File Structure

Fumadocs uses file-system-based routing. Your content directory maps directly to URLs and sidebar navigation.

```
content/
└── docs/
    ├── meta.json              # Root-level navigation config
    ├── index.mdx              # → /docs
    ├── getting-started.mdx    # → /docs/getting-started
    └── payments/
        ├── meta.json          # Section-level navigation config
        ├── index.mdx          # → /docs/payments
        ├── send-payment.mdx   # → /docs/payments/send-payment
        └── img/               # Screenshots for this section
```

Key rules:

- `index.mdx` in a folder becomes the folder's landing page (slug drops the "index")
- Folder names become URL segments — use lowercase kebab-case
- No two pages can have the same slug (Fumadocs uses slugs to determine active nav items)
- Wrap folder names in parentheses `(group-name)` to group files without affecting URLs

## Frontmatter

Every MDX file needs YAML frontmatter:

```yaml
---
title: Page Title
description: One-sentence summary for SEO and metadata.
---
```

`title` is required. `description` is strongly recommended. You can also use `icon` and `full` (full-width layout).

## meta.json

Controls navigation ordering and section display. Place one in every folder.

```json
{
  "title": "Section Name",
  "pages": [
    "index",
    "---Getting Started---",
    "quickstart",
    "first-payment",
    "---Reference---",
    "settings",
    "..."
  ]
}
```

The `pages` array supports: page filenames, `---Label---` separators, `...` (rest operator for remaining
pages alphabetically), `!page` (exclude from rest), `[Text](url)` (external links), and `...folder`
(extract/inline a folder's children).

For root-level navigation isolation (separate doc sections with independent sidebars), add `"root": true`.

## Components

Import the default set:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
```

Or import specific components for use in MDX files:

### Callout — contextual tips, warnings, errors

```mdx
<Callout type="info">Helpful context or a tip.</Callout>

<Callout type="warn">Something the reader should be careful about.</Callout>

<Callout type="error">Destructive or irreversible action warning.</Callout>
```

### Steps + Step — sequential workflows

```mdx
<Steps>
<Step>
### Step heading

Step content here. Images, code blocks, and other MDX all work inside steps.

</Step>
<Step>
### Next step

More content.

</Step>
</Steps>
```

This is the most important component for product documentation. Any multi-step workflow should use it.

### Tabs + Tab — alternative approaches or platforms

```mdx
<Tabs items={['Option A', 'Option B']}>
  <Tab value="Option A">Content for A</Tab>
  <Tab value="Option B">Content for B</Tab>
</Tabs>
```

Tabs support persistent and shared values — if a reader picks "macOS" in one Tabs group, all Tabs groups
with the same items will switch too.

### Cards + Card — navigation hubs

```mdx
<Cards>
  <Card title="Feature Name" href="/docs/section/feature">
    Short description of what the reader will find.
  </Card>
</Cards>
```

Use on landing/overview pages to link out to sub-pages.

### Other Components

| Component                         | Use Case                                  |
| --------------------------------- | ----------------------------------------- |
| `<Accordion>`                     | Collapsible FAQ sections, optional detail |
| `<ImageZoom>`                     | Click-to-enlarge screenshots              |
| `<Files>` + `<Folder>` + `<File>` | Display file tree structures              |
| `<TypeTable>`                     | Auto-generated prop/type documentation    |
| `<Banner>`                        | Site-wide announcement banners            |

## Screenshot Workflow

When documenting a feature with a live product URL, capture screenshots using browser automation tools:

1. **Navigate** to the feature URL
2. **Read the page** to understand the current state
3. **Capture a screenshot** of the viewport
4. **Interact** (click, fill forms) to advance to the next state
5. **Repeat** for each meaningful state

### Which states to capture

For each page or flow step, think about what the user sees at different points:

- **Default/landing** — first arrival
- **Empty state** — before any data exists (often overlooked, very valuable for new users)
- **In-progress** — mid-workflow with partial input
- **Success** — after completing the action
- **Error** — the most common failure case

### File naming convention

Save screenshots alongside the docs in an `img/` folder:

```
content/docs/<section>/img/<feature>-<state>.png
```

Example: `content/docs/payments/img/batch-payout-empty.png`

Reference them in MDX with standard markdown images or `<ImageZoom>`:

```mdx
![Description of what the reader sees](/docs/payments/img/batch-payout-empty.png)
```

---

## Code Blocks

Standard fenced code blocks with syntax highlighting work in MDX:

````mdx
```ts
const total = items.reduce((sum, item) => sum + item.amount, 0);
```
````

### Code block titles

Add a `title` attribute to label a code block with a filename or description:

````mdx
```ts title="src/utils/calculate.ts"
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}
```
````

### Line highlighting

Highlight specific lines using metadata after the language identifier:

````mdx
```tsx {1,4-6}
import React from 'react';

function MyComponent() {
  if (true) {
    return <div>Bar</div>;
  }
}
```
````

Or use magic comments for inline control:

````mdx
```ts
function example() {
  // highlight-next-line
  return 'This line is highlighted!';

  // highlight-start
  return 'This range is highlighted!';
  // highlight-end
}
```
````

### Explicit heading IDs

Set stable anchor links for headings so they survive title rewording:

```mdx
### My Custom Heading {#stable-anchor}

[Link to that heading](#stable-anchor)
```

---

## Authoring Workflows

### Writing a new document

1. **Create the file** — Add a new `.mdx` file in the appropriate `content/docs/` subdirectory.
2. **Add frontmatter** — Start with `title` (required) and `description` (recommended).
3. **Write content** — Use clear headings (`##`, `###`), Fumadocs components, and concise prose.
4. **Update `meta.json`** — Add the page filename to the `pages` array in the folder's `meta.json`
   so it appears in the sidebar at the correct position.
5. **Verify links** — Ensure all internal links resolve to real pages and image paths are correct.

### Updating an existing document

1. **Locate the file** — Find the correct `.mdx` file inside `content/docs/`.
2. **Edit content** — Make the necessary changes.
3. **Check frontmatter** — Ensure `title` and `description` still accurately reflect the content.
4. **Check `meta.json`** — If you renamed the file, update the `pages` entry in `meta.json`.

---

## Common Pitfalls

- **Do NOT use HTML `<table>` tags** — Use Markdown pipe tables instead.
- **Do NOT use absolute URL paths for internal links** — Use relative file paths or Fumadocs slug paths.
- **Verify `meta.json` entries** — Every filename in the `pages` array must match an actual `.mdx` file
  (without extension). A mismatch causes the page to silently disappear from navigation.
- **Do NOT forget empty lines around JSX components** — MDX requires blank lines before and after
  block-level JSX components (`<Steps>`, `<Callout>`, etc.) to parse correctly.
- **Do NOT duplicate slugs** — No two pages can produce the same URL slug. Fumadocs uses slugs to
  determine active navigation items.

## Page Planning

Deciding how to structure documentation for a feature:

**Single page** when the feature can be explained in ~800 words or fewer. Use for simple settings pages,
single-action features, or reference content.

**Multi-page section** when the feature has distinct sub-workflows. Create a folder with:

- `index.mdx` as the overview/hub page (use Cards to link to sub-pages)
- One MDX file per major sub-workflow
- A `meta.json` controlling page order

**Navigation principles:**

- Most common tasks go first in the `pages` array
- Use `---Label---` separators to group related pages
- End with `...` to catch unlisted pages
- Name sections by what readers want to do: "Send Payments", "Track Expenses" — not by UI layout

## MDX Page Skeleton

A solid starting structure for any doc page:

```mdx
---
title: Action-Oriented Title
description: What the reader will learn or accomplish.
---

Brief intro — what this feature does and when you'd use it (1-2 sentences).

<Callout type="info">Prerequisites or important context before starting.</Callout>

<Steps>
<Step>
### Action verb heading

What to do, why, and what to expect.

![What the screen looks like at this point](/docs/section/img/screenshot.png)

</Step>
<Step>
### Next action

Continue the workflow.

</Step>
</Steps>

## Related

- [Related Page](/docs/section/page) — brief context on when to use it
```

## Quality Checklist

Before delivering documentation output, verify:

- [ ] Every MDX file has `title` and `description` in frontmatter
- [ ] Every folder has a `meta.json` with logical page ordering
- [ ] Steps component used for any multi-step workflow
- [ ] Screenshots saved in `img/` subdirectories with descriptive names
- [ ] Cross-references link related pages together
- [ ] No orphaned pages (everything reachable from meta.json or links)
- [ ] Slugs don't conflict (no duplicate URLs)
