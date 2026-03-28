# Fumadocs Conventions Reference

This file covers the technical details of how Fumadocs organizes content. Refer to this when you need to
know the exact file formats, frontmatter fields, or folder structure rules.

## Table of Contents

1. [File Structure](#file-structure)
2. [Frontmatter](#frontmatter)
3. [meta.json](#metajson)
4. [Slug Generation](#slug-generation)
5. [Folder Groups](#folder-groups)
6. [Root Folders](#root-folders)
7. [i18n Support](#i18n-support)
8. [Built-in Components](#built-in-components)
9. [Collections Configuration](#collections-configuration)

---

## File Structure

Fumadocs uses file-system-based routing. Your content lives in a directory (typically `content/docs/`) and
the folder structure directly maps to URL paths and sidebar navigation.

```
content/
└── docs/
    ├── meta.json              # Root navigation config
    ├── index.mdx              # Landing page → /docs
    ├── getting-started.mdx    # → /docs/getting-started
    └── payments/
        ├── meta.json          # Section navigation config
        ├── index.mdx          # → /docs/payments
        ├── send-payment.mdx   # → /docs/payments/send-payment
        └── batch-payouts.mdx  # → /docs/payments/batch-payouts
```

## Frontmatter

Every MDX file uses YAML frontmatter at the top:

```yaml
---
title: Page Title
description: A brief summary for SEO and page metadata
icon: IconName          # Optional — requires custom icon handler
full: true              # Optional — use full-width layout
---
```

Required fields: `title`
Recommended fields: `title`, `description`

The frontmatter schema can be extended in `source.config.ts` if the project needs custom fields.

## meta.json

Place a `meta.json` file in any folder to control how that section appears in navigation.

### Standard folder meta.json

```json
{
  "title": "Section Display Name",
  "icon": "IconName",
  "defaultOpen": true,
  "collapsible": true,
  "pages": [
    "index",
    "getting-started",
    "---Advanced---",
    "advanced-feature",
    "..."
  ]
}
```

### Root folder meta.json

```json
{
  "title": "Documentation",
  "description": "Product documentation",
  "root": true
}
```

Root folders create isolated navigation contexts — only pages within the active root show in the sidebar.

### Pages array syntax

| Syntax | What it does |
|--------|-------------|
| `"page-name"` | Include a page by filename (without extension) |
| `"./subfolder"` | Include a subfolder |
| `"---Label---"` | Visual separator with a label |
| `"..."` | All remaining items alphabetically |
| `"z...a"` | All remaining items reverse alphabetically |
| `"...folder"` | Inline a folder's children (extract) |
| `"!page-name"` | Exclude from the rest (`...`) operator |
| `"[Text](url)"` | External link |
| `"external:[Text](url)"` | External link (explicit) |

## Slug Generation

Slugs are derived from file paths relative to the content directory:

| File Path | Generated Slug | URL |
|-----------|---------------|-----|
| `./dir/page.mdx` | `['dir', 'page']` | `/docs/dir/page` |
| `./dir/index.mdx` | `['dir']` | `/docs/dir` |
| `./page.mdx` | `['page']` | `/docs/page` |

**Important:** No two pages can have the same slug. Fumadocs uses the slug to determine active navigation.

## Folder Groups

Wrap a folder name in parentheses to make it a "group" — it organizes files without affecting URLs:

```
content/docs/
└── (guides)/
    ├── setup.mdx      # → /docs/setup  (not /docs/guides/setup)
    └── advanced.mdx    # → /docs/advanced
```

This is useful for organizing your content directory without creating deep URL hierarchies.

## Root Folders

Mark a folder as `root: true` in its meta.json to create an isolated navigation section. This is useful
for products with distinct areas (e.g., separate "User Guide" and "Admin Guide" sections).

## i18n Support

Fumadocs supports two internationalization patterns:

**Dot notation** (default):
```
page.mdx          # Default language
page.cn.mdx       # Chinese
meta.json          # Default
meta.cn.json       # Chinese
```

**Directory structure:**
```
en/page.mdx
cn/page.mdx
```

Configure in `lib/i18n.ts`:
```typescript
export const i18n: I18nConfig = {
  parser: 'dot'  // or 'dir'
};
```

## Built-in Components

Import default MDX components:
```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
```

### Available Components

**Callout** — tips, warnings, errors
```mdx
<Callout type="info">Helpful tip here.</Callout>
<Callout type="warn">Be careful about this.</Callout>
<Callout type="error">This action cannot be undone.</Callout>
```

**Steps + Step** — sequential workflows
```mdx
<Steps>
<Step>
### First step title
Content for step one.
</Step>
<Step>
### Second step title
Content for step two.
</Step>
</Steps>
```

**Tabs + Tab** — alternative approaches or platform-specific content
```mdx
<Tabs items={['Option A', 'Option B']}>
<Tab value="Option A">Content for option A</Tab>
<Tab value="Option B">Content for option B</Tab>
</Tabs>
```

**Cards + Card** — navigation grids linking to sub-pages
```mdx
<Cards>
<Card title="Payments" href="/docs/payments">
Send and receive payments.
</Card>
<Card title="Accounting" href="/docs/accounting">
Track your transactions.
</Card>
</Cards>
```

**Accordion** — collapsible FAQ or optional detail
```mdx
<Accordion title="Frequently asked questions">
Content that's hidden by default.
</Accordion>
```

**ImageZoom** — click-to-enlarge images
```mdx
<ImageZoom src="/docs/section/img/screenshot.png" alt="Description" />
```

**Files / Folder** — display file trees
```mdx
<Files>
<Folder name="src" defaultOpen>
<File name="index.ts" />
<File name="config.ts" />
</Folder>
</Files>
```

## Collections Configuration

Define content collections in `source.config.ts`:

```typescript
import { defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
});
```

This creates two collections: one for doc files (.md/.mdx) and one for meta files (.json). The `loader()`
API then generates the page tree and provides data for rendering.
