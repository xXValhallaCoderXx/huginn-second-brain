---
name: obsidian
description: Work with Obsidian vaults (plain Markdown notes) and automate via obsidian-cli.
homepage: https://help.obsidian.md
metadata: {"clawdbot":{"emoji":"💎","requires":{"bins":["obsidian-cli"]},"install":[{"id":"brew","kind":"brew","formula":"yakitrak/yakitrak/obsidian-cli","bins":["obsidian-cli"],"label":"Install obsidian-cli (brew)"}]}}
---

# Obsidian

Obsidian vault = a normal folder on disk.

Vault structure (typical)
- Notes: `*.md` (plain text Markdown; edit with any editor)
- Config: `.obsidian/` (workspace + plugin settings; usually don’t touch from scripts)
- Canvases: `*.canvas` (JSON)
- Attachments: whatever folder you chose in Obsidian settings (images/PDFs/etc.)

## Find the active vault(s)

Obsidian desktop tracks vaults here (source of truth):
- `~/Library/Application Support/obsidian/obsidian.json`

`obsidian-cli` resolves vaults from that file; vault name is typically the **folder name** (path suffix).

Fast “what vault is active / where are the notes?”
- If you’ve already set a default: `obsidian-cli print-default --path-only`
- Otherwise, read `~/Library/Application Support/obsidian/obsidian.json` and use the vault entry with `"open": true`.

Notes
- Multiple vaults common (iCloud vs `~/Documents`, work/personal, etc.). Don’t guess; read config.
- Avoid writing hardcoded vault paths into scripts; prefer reading the config or using `print-default`.

## obsidian-cli quick start

Pick a default vault (once):
- `obsidian-cli set-default "<vault-folder-name>"`
- `obsidian-cli print-default` / `obsidian-cli print-default --path-only`

Search
- `obsidian-cli search-content “query” --no-interactive` (search inside notes; shows snippets + lines)
- `obsidian-cli list | grep -i “query”` (search note names)
- `obsidian-cli search` (interactive fuzzy finder — **only works in a terminal**, NOT in scripts/automation)

Create / Append / Overwrite
- `obsidian-cli create “Folder/New note” --content “...”` — create new note
- `obsidian-cli create “Folder/Existing note” --content “...” --append` — append to existing note
- `obsidian-cli create “Folder/Existing note” --content “...” --overwrite` — replace note contents
- `obsidian-cli create “Folder/Note” --open` — create and open in Obsidian (requires Obsidian desktop)

Read
- `obsidian-cli print “Folder/Note”` — print note contents to stdout

Move/rename (safe refactor)
- `obsidian-cli move "old/path/note" "new/path/note"`
- Updates `[[wikilinks]]` and common Markdown links across the vault (this is the main win vs `mv`).

Delete
- `obsidian-cli delete "path/note"`

Prefer direct edits when appropriate: open the `.md` file and change it; Obsidian will pick it up.

## IMPORTANT: Search-first workflow

**Never create a note without searching first.** Always run:
1. `obsidian-cli search-content "key terms" --no-interactive` — check note contents
2. `obsidian-cli list | grep -i "topic"` — check note names

If a related note exists, **update it** instead of creating a duplicate. Read with `obsidian-cli print "note"`, then use `--append` or `--overwrite` to write changes. Only use `create` (without flags) for genuinely new topics.
