# Incident Note: PR #99 Credential Leak

**Incident:** Repository secrets were exposed in a comment on PR #99.
**Tracking issue:** #154 (re-file of the previously-closed #141).
**Tracker:** #160.
**Source:** Strategic Review #152 — Recommended Path Forward, item 2.
**Status:** Redaction verified; **rotation unconfirmed — issue stays OPEN until every key below is confirmed rotated.**

---

## What happened

A set of repository/organization secrets was exposed in a comment on PR #99 and
remained public for multiple cycles before the comment was redacted. The leaking
comment now returns **HTTP 404**, so redaction is verified. However, the keys
were public long enough that they must be treated as compromised, and **rotation
cannot be verified from the repository** — secret values are never present in the
repo, so rotation is a GitHub repo-settings (control-plane) action a maintainer
must perform and confirm out of band.

The prior tracking issue (#141) was closed `NOT_PLANNED` without rotation being
confirmed, which left this loop open and unowned. #154 re-files the tracking so
the loop has an owner and stays open until closed by confirmation.

---

## Affected secrets

`CR_PAT` is listed first and **must be audited first**: assume it carries
repo-write scope until proven otherwise, and prefer reducing its scope to the
minimum required (or replacing it with a fine-grained token) when it is rotated.

| # | Secret | Rotated? | Notes |
|---|--------|----------|-------|
| 0 | `CR_PAT` | ☐ pending | Audit scope first; assume repo-write until proven otherwise. |
| 1 | `ANTHROPIC_API_KEY` | ☐ pending | |
| 2 | `OPENAI_API_KEY` | ☐ pending | |
| 3 | `XAI_API_KEY` / `GROK_API_KEY` | ☐ pending | Same vendor (xAI); rotate both aliases. |
| 4 | `HF_TOKEN` | ☐ pending | |
| 5 | `REPLICATE_API_TOKEN` | ☐ pending | |
| 6 | `KAGGLE_API_TOKEN` | ☐ pending | |
| 7 | `NPM_CONFIG_TOKEN` | ☐ pending | |
| 8 | `DENO_DEPLOY_TOKEN` | ☐ pending | |

---

## Confirmation checklist (maintainer / control-plane)

Rotation is a **manual GitHub repo-settings action**, not a repo file change. A
maintainer must:

1. **Audit `CR_PAT` scope first.** Determine its actual permissions; assume
   repo-write until proven otherwise. Revoke and reissue with least privilege.
2. Revoke and reissue each remaining secret at its provider, then update the
   GitHub Actions secret value.
3. For each row above, tick the box and add the rotation date once confirmed.
4. When all rows are confirmed, close #154 with a comment referencing this note.

Until every box is ticked, treat all listed credentials as compromised and
**keep #154 open**.

---

## Verification status

- Redaction of the leaking PR #99 comment: **verified** (returns HTTP 404).
- Key rotation: **unverifiable from the repository** — pending maintainer
  confirmation per the checklist above.
