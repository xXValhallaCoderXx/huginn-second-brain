---
title: Incident playbook
---

# Incident playbook

Document how the team should respond when production behavior goes sideways.

## Suggested template

1. Symptom
2. Immediate checks
3. Likely causes
4. Mitigation steps
5. Recovery verification
6. Follow-up actions

## Useful Huginn checks

- verify `/telegram/health`
- verify webhook configuration
- confirm Railway environment variables
- inspect recent deploys and runtime logs
- validate the active Telegram bot token

## After-action updates

Every real incident should leave this site better than it was before.
