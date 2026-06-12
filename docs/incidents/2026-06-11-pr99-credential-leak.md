# Incident: credential leak in PR #99 closing comment

**Date discovered:** flagged by Strategic Review #122; remediated 2026-06-11 (issue #123).
**Severity:** high — public exposure of a GitHub PAT and nine third-party API keys.

## What happened

The closing comment on PR #99 (comment id `4681916331`, posted 2026-06-11T14:58Z) was
written with `gh pr close 99 --comment "... the obsolete `local` branch ..."` from an
interactive zsh session. The unescaped backticks around `local` were interpreted as
command substitution; in cmdsubst context zsh's `local` builtin prints every shell
variable, so the entire environment — including exported secrets — was spliced into
the comment body and published on the public PR.

## Exposed credentials

| Variable | Status |
|----------|--------|
| `CR_PAT` (GitHub PAT, `ghp_…`) | **Dead.** Audited first per #123: API probe on 2026-06-11 returned `401 Bad credentials`, so the token is already revoked or expired. No live repo-write exposure remains. Scopes could not be enumerated for a dead token. |
| `ANTHROPIC_API_KEY` | Rotation pending — requires human operator |
| `OPENAI_API_KEY` | Rotation pending — requires human operator |
| `XAI_API_KEY` / `GROK_API_KEY` (same value) | Rotation pending — requires human operator |
| `HF_TOKEN` | Rotation pending — requires human operator |
| `REPLICATE_API_TOKEN` | Rotation pending — requires human operator |
| `KAGGLE_API_TOKEN` | Rotation pending — requires human operator |
| `NPM_CONFIG_TOKEN` | Rotation pending — requires human operator |
| `DENO_DEPLOY_TOKEN` | Rotation pending — requires human operator |

Token values are deliberately not reproduced here.

## Remediation performed (2026-06-11, agent)

1. **`CR_PAT` scope audit (first, per acceptance criteria):** confirmed dead via 401
   response — see table above.
2. **Comment removed:** comment `4681916331` was **deleted** (not edited) via
   `gh api`, because GitHub keeps prior revisions of edited comments publicly
   visible in the edit-history dropdown. Deletion verified by a follow-up 404.
3. **Closure context preserved:** a sanitized replacement comment (id `4683771276`)
   restating the original closure rationale was posted on PR #99 before deletion.

## Outstanding actions (human operator required)

Tracked in **issue #135** ("Rotate the nine leaked third-party API keys from
the PR #99 credential leak"), so the pending rotations stay open after #123
auto-closes when PR #131 merges.

- Rotate all nine third-party keys above in their respective dashboards
  (Anthropic, OpenAI, xAI, Hugging Face, Replicate, Kaggle, npm, Deno Deploy).
  Agent has no access to these accounts.
- Confirm in GitHub settings that the dead `CR_PAT` was deliberately revoked
  (vs. expired) and that no replacement PAT carries broader scope than needed.
- Assume the values were harvested during the ~exposure window (the comment was
  public and the review noted it verified live across two synthesis runs):
  check provider usage logs for anomalous activity.

## Prevention

- Never pass prose containing backticks to `gh ... --comment` from zsh/bash;
  use `--body-file` / heredocs, or single-quote the argument.
- Keep secrets out of the interactive shell environment where possible
  (use a secrets manager or per-command env injection).
