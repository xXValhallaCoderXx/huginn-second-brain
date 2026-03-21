# HEARTBEAT.md — Scheduled Tasks

Inspired by NanoClaw's HEARTBEAT.md pattern.  
Each task is human-readable. The scheduler in `src/scheduler.ts` reads this file and registers each enabled task as a cron job.

---

## Daily Briefing

**Description:** Morning briefing delivered via Telegram. Summarises today's calendar events and surfaces a personalised focus suggestion.

**Schedule:** `0 7 * * *` (7:00 AM every day)

**Enabled:** true

**Workflow:** `daily-briefing`

---

<!-- Additional scheduled tasks can be added below using the same format. -->

<!-- ## Personality Refinement

**Description:** Nightly review of Observational Memory observations. Proposes updates to SOUL.md / IDENTITY.md for user approval in the next morning briefing.

**Schedule:** `0 23 * * *` (11:00 PM every day)

**Enabled:** false

**Workflow:** `personality-refinement`

--- -->

<!-- ## Weekly Reflection

**Description:** Weekly trend analysis across OM reflections. Generates a summary and commits knowledge vault changes.

**Schedule:** `0 8 * * 0` (8:00 AM every Sunday)

**Enabled:** false

**Workflow:** `weekly-reflection`

--- -->
