#!/usr/bin/env bash
# vault-healthcheck.sh — verify obsidian-cli + Syncthing are working correctly
# Run inside the container or locally to diagnose sync or write issues.

set -uo pipefail

PASS=0
FAIL=0
WARN=0
TEST_NOTE=".huginn-healthcheck-$(date +%s)"

pass() { PASS=$((PASS + 1)); printf "  ✓ %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "  ✗ %s\n" "$1"; }
warn() { WARN=$((WARN + 1)); printf "  ⚠ %s\n" "$1"; }
section() { printf "\n── %s ──\n" "$1"; }

cleanup() {
  obsidian-cli delete "$TEST_NOTE" 2>/dev/null || true
}
trap cleanup EXIT

# ── 1. obsidian-cli reachable ──
section "Binary"

if command -v obsidian-cli &>/dev/null; then
  pass "obsidian-cli found: $(command -v obsidian-cli)"
else
  fail "obsidian-cli not found in PATH"
  echo "Cannot continue without obsidian-cli."
  exit 1
fi

# ── 2. Default vault ──
section "Default Vault"

VAULT_NAME=$(obsidian-cli print-default 2>&1 | head -1)
VAULT_PATH=$(obsidian-cli print-default --path-only 2>&1)

if [ $? -eq 0 ] && [ -n "$VAULT_PATH" ] && [ "$VAULT_PATH" != "" ]; then
  pass "Default vault configured: $VAULT_NAME"
  pass "Vault path: $VAULT_PATH"
else
  fail "print-default failed — no vault configured"
  echo "  Fix: obsidian-cli set-default <vault-path>"
fi

# ── 3. Vault path exists and is writable ──
section "Filesystem"

if [ -d "$VAULT_PATH" ]; then
  pass "Vault directory exists"
else
  fail "Vault directory does not exist: $VAULT_PATH"
fi

if [ -w "$VAULT_PATH" ]; then
  pass "Vault directory is writable"
else
  fail "Vault directory is NOT writable (permission issue)"
fi

# Count notes
NOTE_COUNT=$(find "$VAULT_PATH" -name '*.md' -not -path '*/.obsidian/*' 2>/dev/null | wc -l | tr -d ' ')
if [ "$NOTE_COUNT" -gt 0 ]; then
  pass "Vault contains $NOTE_COUNT .md files"
else
  warn "Vault is empty (0 .md files) — might be a wrong path"
fi

# ── 4. Create ──
section "Create Note"

CREATE_OUT=$(obsidian-cli create "$TEST_NOTE" --content "healthcheck line 1" 2>&1)
CREATE_RC=$?
if [ $CREATE_RC -eq 0 ]; then
  pass "create succeeded"
else
  fail "create failed (rc=$CREATE_RC): $CREATE_OUT"
fi

# Verify file landed on disk
if [ -f "$VAULT_PATH/${TEST_NOTE}.md" ]; then
  pass "File appeared on disk: ${TEST_NOTE}.md"
else
  fail "File NOT found on disk after create (expected: $VAULT_PATH/${TEST_NOTE}.md)"
fi

# ── 5. Print (read back) ──
section "Read Note"

PRINT_OUT=$(obsidian-cli print "$TEST_NOTE" 2>&1)
PRINT_RC=$?
if [ $PRINT_RC -eq 0 ]; then
  pass "print succeeded"
  if echo "$PRINT_OUT" | grep -q "healthcheck line 1"; then
    pass "Content matches what was written"
  else
    fail "Content mismatch — wrote 'healthcheck line 1', got: $PRINT_OUT"
  fi
else
  fail "print failed (rc=$PRINT_RC): $PRINT_OUT"
fi

# ── 6. Append ──
section "Append to Note"

APPEND_OUT=$(obsidian-cli create "$TEST_NOTE" --content "healthcheck line 2" --append 2>&1)
APPEND_RC=$?
if [ $APPEND_RC -eq 0 ]; then
  pass "create --append succeeded"
else
  fail "create --append failed (rc=$APPEND_RC): $APPEND_OUT"
fi

# Verify both lines present
PRINT2_OUT=$(obsidian-cli print "$TEST_NOTE" 2>&1)
if echo "$PRINT2_OUT" | grep -q "healthcheck line 1"; then
  pass "Original content preserved after append"
else
  fail "Original content LOST after append — obsidian-cli may be overwriting instead"
fi
if echo "$PRINT2_OUT" | grep -q "healthcheck line 2"; then
  pass "Appended content present"
else
  fail "Appended content missing"
fi

# ── 7. Search ──
section "Search"

# IMPORTANT: 'obsidian-cli search' is interactive-only — it does NOT accept a
# positional argument. If AGENTS.md tells the bot to run
#   obsidian-cli search "topic"
# that command WILL FAIL every time. Only search-content takes a query arg.

SEARCH_OUT=$(obsidian-cli search "healthcheck" 2>&1)
SEARCH_RC=$?
if [ $SEARCH_RC -eq 0 ]; then
  pass "search with positional arg works"
else
  fail "search with positional arg FAILS (rc=$SEARCH_RC)"
  echo "       'obsidian-cli search <query>' is not supported — it's interactive only"
  echo "       AGENTS.md tells the bot to use this, so name-based search is broken!"
  echo "       Fix: use 'obsidian-cli list' + grep, or search-content instead"
fi

SC_OUT=$(obsidian-cli search-content "healthcheck line" --no-interactive 2>&1)
SC_RC=$?
if [ $SC_RC -eq 0 ] && echo "$SC_OUT" | grep -qi "healthcheck"; then
  pass "search-content --no-interactive found the test note"
else
  fail "search-content failed (rc=$SC_RC): $SC_OUT"
fi

# Test list (the working alternative for browsing by name)
LIST_OUT=$(obsidian-cli list 2>&1)
LIST_RC=$?
if [ $LIST_RC -eq 0 ]; then
  pass "list command works (use this + grep for name search)"
else
  fail "list command failed (rc=$LIST_RC)"
fi

# ── 8. Overwrite ──
section "Overwrite"

OW_OUT=$(obsidian-cli create "$TEST_NOTE" --content "replaced content" --overwrite 2>&1)
OW_RC=$?
if [ $OW_RC -eq 0 ]; then
  pass "create --overwrite succeeded"
else
  fail "create --overwrite failed (rc=$OW_RC): $OW_OUT"
fi

OW_READ=$(obsidian-cli print "$TEST_NOTE" 2>&1)
if echo "$OW_READ" | grep -q "replaced content"; then
  pass "Overwrite content correct"
else
  fail "Overwrite content mismatch: $OW_READ"
fi
if echo "$OW_READ" | grep -q "healthcheck line"; then
  fail "Old content still present after overwrite — overwrite flag not working"
else
  pass "Old content properly replaced"
fi

# ── 9. Delete ──
section "Delete"

DEL_OUT=$(obsidian-cli delete "$TEST_NOTE" 2>&1)
DEL_RC=$?
if [ $DEL_RC -eq 0 ]; then
  pass "delete succeeded"
else
  fail "delete failed (rc=$DEL_RC): $DEL_OUT"
fi

if [ ! -f "$VAULT_PATH/${TEST_NOTE}.md" ]; then
  pass "File removed from disk"
else
  fail "File still exists after delete"
fi

# ── 10. Shell escaping stress test ──
section "Shell Escaping"

TRICKY_CONTENT='Line with "double quotes" and '\''single quotes'\''
Line with $VARIABLE and $(command) and `backticks`
Line with special chars: & | > < ; # ! @ %
Line with markdown: **bold** _italic_ `code` [[wikilink]]'

ESC_OUT=$(obsidian-cli create "$TEST_NOTE" --content "$TRICKY_CONTENT" 2>&1)
ESC_RC=$?
if [ $ESC_RC -eq 0 ]; then
  pass "create with special characters succeeded"
else
  fail "create with special characters failed (rc=$ESC_RC): $ESC_OUT"
fi

ESC_READ=$(obsidian-cli print "$TEST_NOTE" 2>&1)
ESCAPE_ISSUES=0
for needle in 'double quotes' 'single quotes' '$VARIABLE' '$(command)' '[[wikilink]]'; do
  if ! echo "$ESC_READ" | grep -qF "$needle"; then
    fail "Shell escaping lost: $needle"
    ESCAPE_ISSUES=$((ESCAPE_ISSUES + 1))
  fi
done
if [ $ESCAPE_ISSUES -eq 0 ]; then
  pass "All special characters preserved"
else
  warn "Some content was mangled by shell expansion ($ESCAPE_ISSUES issues)"
fi

# ── 11. Syncthing ──
section "Syncthing (vault sync)"

if pgrep -f "syncthing" >/dev/null 2>&1; then
  pass "Syncthing process is running"
else
  fail "Syncthing process not running -- vault sync is disabled"
fi

ST_GUI="http://localhost:8384"
ST_STATUS=$(curl -sf "$ST_GUI/rest/noauth/health" 2>&1)
if [ $? -eq 0 ]; then
  pass "Syncthing GUI responding at $ST_GUI"
else
  warn "Syncthing GUI not responding (may still be starting)"
fi

# ── Summary ──
section "Summary"
printf "  %d passed, %d failed, %d warnings\n" "$PASS" "$FAIL" "$WARN"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "  Some checks failed. The bot may write inconsistently."
  echo "  Fix the failures above, then re-run this script."
  exit 1
else
  echo ""
  echo "  Obsidian toolchain is healthy."
  exit 0
fi
