# Page Templates

Use these as starting points for different types of documentation pages. Copy the relevant template,
then adapt it to the specific feature you're documenting.

## Table of Contents

1. [Feature Overview Page](#feature-overview-page)
2. [Step-by-Step Guide](#step-by-step-guide)
3. [Getting Started / Quickstart](#getting-started--quickstart)
4. [Settings / Configuration Page](#settings--configuration-page)
5. [Section Landing Page](#section-landing-page)
6. [FAQ / Troubleshooting Page](#faq--troubleshooting-page)

---

## Feature Overview Page

Use when introducing a feature that has multiple sub-pages beneath it. This page answers "what is this
and why should I care?" and then points customers to the right sub-page.

```mdx
---
title: Feature Name
description: One sentence explaining what customers can do with this feature.
---

import { Cards, Card, Callout } from 'fumadocs-ui/components';

Brief paragraph explaining what this feature does and who it's for. Focus on the customer benefit,
not the technical capability. One to two sentences max.

## What you can do

<Cards>
<Card title="Task Name" href="/docs/section/task-page">
Brief description of what this sub-page covers.
</Card>
<Card title="Another Task" href="/docs/section/another-page">
Brief description.
</Card>
</Cards>

## Key concepts

If the feature involves concepts the customer needs to understand (like "workspaces" or "roles"),
explain them here in plain language. Keep definitions short — one to two sentences each.

**Term**: What it means in the context of what the customer is trying to do.

**Another term**: Its customer-facing explanation.
```

---

## Step-by-Step Guide

The most common template. Use for any feature that involves a workflow with distinct steps.

```mdx
---
title: Action-Oriented Title (e.g., "Send a Batch Payout")
description: What the customer will accomplish by following this guide.
---

import { Steps, Step, Callout, ImageZoom } from 'fumadocs-ui/components';

Short introduction — one to two sentences explaining what this workflow does and when a customer
would use it.

<Callout type="info">
**Before you begin:** List any prerequisites here — account setup, required permissions, etc.
Link to the relevant pages.
</Callout>

<Steps>
<Step>
### Action verb + what to do

Explain what the customer should do and why. Keep it concise.

![What the customer should see at this point](/docs/section/img/feature-state.png)

</Step>
<Step>
### Next action

More instructions. If there are important choices to make at this step, explain the options briefly.

</Step>
<Step>
### Final action

What the customer does to complete the workflow.

![The success state — what it looks like when done](/docs/section/img/feature-success.png)

</Step>
</Steps>

## What happens next

Brief explanation of what the customer should expect after completing the workflow (e.g., "Your
payment will be processed within 24 hours. You can track its status on the Payments page.").

## Related

- [Related Feature](/docs/section/related) — when to use this instead
- [Troubleshooting](/docs/section/troubleshooting) — if something went wrong
```

---

## Getting Started / Quickstart

Use for the first page a new customer should read. Gets them to a meaningful "aha" moment as fast
as possible.

```mdx
---
title: Get Started with [Product/Feature]
description: Set up your account and [accomplish first meaningful action] in under 5 minutes.
---

import { Steps, Step, Callout, Tabs, Tab } from 'fumadocs-ui/components';

Welcome paragraph — one to two sentences about what the customer will accomplish by the end of
this page. Set a time expectation if possible ("This takes about 5 minutes").

<Steps>
<Step>
### Sign up / Create your account

The absolute first thing they need to do. Include a direct link to the signup page if applicable.

</Step>
<Step>
### Set up [the first important thing]

The minimum configuration to get value from the product.

![What the setup screen looks like](/docs/getting-started/img/setup.png)

</Step>
<Step>
### [Do the first meaningful action]

Walk them through the core action that demonstrates the product's value.

![The result — the "aha" moment](/docs/getting-started/img/first-success.png)

</Step>
</Steps>

## What's next?

<Cards>
<Card title="Explore [Core Feature]" href="/docs/core-feature">
Now that you're set up, learn about the main thing the product does.
</Card>
<Card title="Invite Your Team" href="/docs/team/invite">
Get your colleagues on board.
</Card>
</Cards>
```

---

## Settings / Configuration Page

Use for pages that document a settings panel or configuration area. These tend to be reference-style
rather than workflow-style.

```mdx
---
title: [Section] Settings
description: Customize how [feature area] works for your account/organization.
---

import { Callout } from 'fumadocs-ui/components';

Brief intro explaining where to find these settings and what they control.

![The settings page](/docs/settings/img/settings-overview.png)

## Setting Name

What this setting controls, in terms of what it changes for the customer. Mention the default value.

<Callout type="info">
Changing this setting affects [scope — e.g., all team members, only new transactions, etc.].
</Callout>

## Another Setting

Description and impact. If there are specific options to choose from, list them:

- **Option A** — what happens when you choose this
- **Option B** — what happens when you choose this

## Another Setting

Continue for each meaningful setting. Group related settings under shared headings if the page
has many settings.
```

---

## Section Landing Page

Use as the `index.mdx` for a folder that contains multiple sub-pages. This is a navigation hub.

```mdx
---
title: Section Name
description: Everything you need to know about [this area of the product].
---

import { Cards, Card } from 'fumadocs-ui/components';

One to two sentences of context about this section — what it covers and who it's for.

<Cards>
<Card title="Page Title" href="/docs/section/page">
What the customer will learn or do on this page.
</Card>
<Card title="Another Page" href="/docs/section/another">
Description.
</Card>
<Card title="Third Page" href="/docs/section/third">
Description.
</Card>
</Cards>
```

---

## FAQ / Troubleshooting Page

Use for common questions or problems customers encounter with a feature.

```mdx
---
title: [Feature] FAQ
description: Answers to common questions about [feature].
---

import { Accordion } from 'fumadocs-ui/components';

## Common questions

<Accordion title="Question phrased as the customer would ask it?">
Direct answer, followed by steps to resolve if applicable. Link to relevant docs pages for
more detail.
</Accordion>

<Accordion title="Another common question?">
Answer.
</Accordion>

## Troubleshooting

<Accordion title="Symptom the customer sees (e.g., 'My payment is stuck')">
Explanation of why this happens and what to do about it.
</Accordion>

## Still need help?

If you couldn't find an answer here, [contact support](link) and we'll help you out.
```
