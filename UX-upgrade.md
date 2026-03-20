# Huginn — UX Upgrade Brief

> **Purpose**: Design brief for a UI/UX designer to redesign Huginn's web dashboard.
> All screens currently use inline styles with no design system. We need a polished, cohesive UI with light and dark modes.

---

## What is Huginn?

Huginn is a **self-hosted personal AI assistant** — one account, one personality, one memory, accessible from any linked channel (web chat, Telegram, future: Discord/WhatsApp).

The name comes from Norse mythology: **Huginn** ("thought") is one of Odin's two ravens that flies across the world gathering information and returning with knowledge. The app embodies this — a personal AI companion that learns your preferences, speaks in your configured voice, and follows you across communication channels.

### Target User

Solo self-hosters and developers who want a personal AI they fully own and control. Technical enough to deploy, but the dashboard itself should feel simple and focused — not developer-tooling.

---

## Theme Direction

### Colour Identity

Huginn is a **raven** — the palette should evoke:

- **Raven-black / deep charcoal** — primary dark tones
- **Moonlit blue-violet** — accent colour (the night sky the raven flies through)
- **Warm amber / gold** — secondary accent (Odin's wisdom, raven's eye)
- **Muted stone / fog** — neutral backgrounds

Think: **Norse mythology meets modern minimalism**. Not medieval or heavy — clean, atmospheric, slightly moody.

### Light Mode
- Off-white / warm gray backgrounds
- Dark charcoal text
- Blue-violet primary accent
- Amber for highlights and CTAs

### Dark Mode
- Deep charcoal / near-black backgrounds
- Light gray / off-white text
- Blue-violet primary (brighter shade for contrast)
- Amber for highlights and CTAs

### Typography Suggestion
- A clean sans-serif for UI text (Inter, Geist, or similar)
- Monospace for code blocks, personality file content, and account IDs

---

## Current Screens (5 total)

### Screen 1 — Landing / Sign-In (`/`)

**Purpose**: Unauthenticated entry point. The user signs in with Google OAuth.

**Current state**: Barebones centered layout — "Huginn" heading, "Your personal AI assistant" subtitle, single blue Google sign-in button.

**What it contains**:
- App title + tagline
- Google OAuth sign-in button
- Redirects to `/dashboard` on success

**Design notes**:
- This is the first impression — should convey Huginn's identity
- Consider a subtle raven motif or atmospheric background
- Could show a brief value proposition (1-2 sentences about what Huginn does)
- The sign-in button should be prominent but not the entire page

---

### Screen 2 — Dashboard (`/dashboard`)

**Purpose**: The main hub after sign-in. Shows account info, personality file editor, and channel connection status.

**Current state**: Single scrolling page with three stacked sections, basic inline styles, `system-ui` font.

**What it contains**:

#### Navigation Bar
- "💬 Chat" link button → `/chat`
- "Sign out" button
- (Future: more navigation items as features grow)

#### Account Info Section
- Email address
- Display name (or "—" if not set)
- Account ID (monospace, for debugging — could be collapsible/hidden)

#### Personality Editor (×2 — SOUL.md and IDENTITY.md)
- **View mode**: Displays file content in a `<pre>` block with an "Edit" button
- **Edit mode**: Large textarea + "reason for change" input + Save/Cancel buttons
- SOUL.md = the AI's core personality and values
- IDENTITY.md = biographical info, preferences, communication style
- Content is markdown-like plaintext
- Save is disabled until both content and reason are provided

#### Connected Channels Section
- Shows each channel (currently only Telegram)
- **If linked**: Shows "✅ Connected" + "Unlink" button (with confirmation dialog)
- **If not linked**: Shows "Not connected" + "Connect" button → navigates to `/link/telegram`

**Design notes**:
- The personality editor is the most-used feature — it should feel spacious and pleasant for writing
- Consider a card-based layout rather than stacked sections
- The channel status could be more visual (icons, toggle-style, status badges)
- Account info is secondary — could collapse into a settings section or sidebar
- The "reason for change" input is important for version history — don't hide it, but keep it lightweight

---

### Screen 3 — Chat (`/chat`)

**Purpose**: Real-time streaming chat with the Huginn AI agent. This is how users test and interact with their configured personality via the web.

**Current state**: Messenger-style layout — header bar, scrollable message area, input footer. Basic bubble styling.

**What it contains**:

#### Header
- "← Dashboard" back link
- "💬 Chat with Huginn" title
- "New Chat" button (clears conversation, starts fresh thread)

#### Message Area
- **Empty state**: "Send a message to start chatting" + hint about editing personality on dashboard
- **User messages**: Right-aligned blue bubbles
- **Assistant messages**: Left-aligned light gray bubbles
- **Streaming indicator**: "●●●" pulsing dots while AI is responding

#### Error Banner
- Red banner below messages when connection/streaming fails
- Displays error text

#### Input Footer
- Auto-expanding textarea (grows with content, max ~150px)
- Placeholder: "Type a message… (Shift+Enter for newline)"
- "Send" button (disabled while streaming or input empty)
- Enter sends, Shift+Enter adds newline

**Design notes**:
- This should feel like a quality chat app (WhatsApp/iMessage level polish)
- Consider adding user avatar (initial letter) and a raven icon for Huginn's messages
- Markdown rendering in assistant messages would be a nice future addition
- The streaming dots could be a subtle raven animation
- Dark mode is especially important here — most chat happens in dark mode

---

### Screen 4 — Telegram Linking (`/link/telegram`)

**Purpose**: Connect the user's Telegram account to Huginn via a one-time linking code. After linking, messages sent to the Telegram bot are routed to the user's Huginn personality.

**Current state**: Centered layout with conditional rendering based on linking state.

**What it contains (3 states)**:

#### State A — Linking Code Ready (with deep link)
- Page title: "Link Telegram"
- **"Open in Telegram →" button** — Telegram-blue, opens Telegram app with pre-filled /start command
- **QR code** — 200×200px SVG, scannable with phone camera to open Telegram deep link
- Label: "Or scan with your phone"
- Instruction: "Click Start in Telegram to complete the link"
- Expiry notice: "This code expires in 10 minutes. Waiting for confirmation…"
- "← Back to Dashboard" link

#### State B — Linking Code Ready (fallback, no deep link)
- Same as A but without the button/QR
- Shows the raw code in large bold text (e.g., `LINK-A3F2`)
- Instructions to manually send `/link CODE` to the bot

#### State C — Success
- "✅ Telegram Linked!" heading
- "Your Telegram account is now connected to Huginn."
- "Send a message to your bot to start chatting!"
- "Back to Dashboard" button

**Design notes**:
- The deep link + QR flow is the primary path — make it prominent and obvious
- The QR code should be in a clean white card (works in both light/dark modes)
- The "waiting for confirmation" state should feel alive (subtle animation, progress indicator)
- Success state should feel celebratory but brief — the user wants to go use it
- Consider a step indicator: Generate → Scan/Click → Confirm

---

### Screen 5 — Root Layout (`__root.tsx`)

**Purpose**: HTML shell wrapping all pages. Sets `<title>`, meta tags, and provides the document structure.

**Design notes**:
- This is where the global CSS reset, font imports, and theme provider would live
- Dark/light mode toggle should be accessible from every page (likely in nav bar)

---

## Interactive Behaviours to Preserve

| Behaviour | Screen | Mechanism |
|-----------|--------|-----------|
| Google OAuth sign-in | Landing | Better Auth social login |
| Auth guard + redirect | All authenticated routes | beforeLoad check |
| Inline personality editing | Dashboard | Toggle between view/edit modes |
| Save with required reason | Dashboard | Form validation (both fields required) |
| Unlink with confirmation | Dashboard | Browser confirm dialog → API call |
| Real-time streaming chat | Chat | Server-Sent Events (SSE) |
| Auto-expanding textarea | Chat | JS height calculation (max ~150px) |
| Auto-scroll on new messages | Chat | Smooth scroll to bottom |
| Enter to send, Shift+Enter newline | Chat | Keyboard handler |
| Linking code generation | Telegram linking | API call on page mount |
| 3-second polling for confirmation | Telegram linking | setInterval → checkTelegramLinked |
| Deep link opens Telegram app | Telegram linking | `https://t.me/BOT?start=CODE` URL |
| QR code for mobile linking | Telegram linking | qrcode.react SVG component |

---

## Tech Constraints

- **Framework**: React 19 + TanStack Start (file-based routing with SSR)
- **No component library currently** — designer can suggest one (Shadcn/ui, Radix, etc.)
- **QR codes**: Using `qrcode.react` (SVG-based, works great)
- **No CSS framework currently** — Tailwind CSS is the preferred direction
- **Light + Dark mode required** — CSS custom properties or Tailwind's `dark:` variant
- **Mobile responsive** — Dashboard and chat should work on phone screens
- **Future screens will include**: settings page, conversation history, memory viewer, more channel connections (Discord, WhatsApp)

---

## Deliverables Requested

1. **Colour system** — Primary, secondary, accent, neutral, error, success tokens for light + dark
2. **Typography scale** — Heading, body, caption, monospace sizes
3. **Screen designs** for all 5 screens (light + dark variants)
4. **Component inventory** — Buttons, inputs, cards, badges, nav bar, chat bubbles, etc.
5. **Empty/loading/error states** for each screen
6. **Mobile responsive layouts** (at minimum: chat + dashboard)
7. **Dark/light mode toggle** placement and behaviour
