# Diagnosis: The Convert-to-Work Stall (Sprint #148 / Issues #141–#147)

**Issue:** #153 — Strategic Review #152, *Recommended Path Forward*, item 1
**Tracker:** #160
**Date:** 2026-06-16
**Type:** Process / meta diagnosis, plus one functional config fix
(`caretta.toml` command invocation — see "A second, technical cause" below)

---

## What happened

The complete endorsed roadmap from the prior cycle was filed and then closed
`NOT_PLANNED` the same day: the #141–#148 batch produced **zero implementing
commits** of its own — no `implement #N …` commit, branch, or PR for any item
in the batch.

| Issue | Title | Created | Closed (`NOT_PLANNED`) |
|---|---|---|---|
| #141 | Confirm PR #99 credential rotation | 14:55:39Z | 15:50:07Z |
| #142 | Audio-Control Router Phase 1 | 14:55:43Z | 15:50:07Z |
| #143 | OSC-controlled preset morphing | 14:55:46Z | 15:50:08Z |
| #144 | Shader visual regression harness | 14:55:50Z | 15:50:08Z |
| #145 | Ableton Link sync | 14:55:53Z | 15:50:09Z |
| #146 | Re-file Ableton Extensions spike | 14:55:56Z | 15:50:09Z |
| #147 | Revive ShaderToy browser & import | 14:56:08Z | 15:50:10Z |
| #148 | Sprint plan | 14:56:23Z | 15:50:11Z |

All eight closed inside a 4-second window, ~55 minutes after filing, with **no
closing comment, no implementation branch, and no PR on any of them**. Ideation
#150 (15:55Z) then re-proposed the identical set verbatim.

## Diagnosis: a missing executor-dispatch step, not a planning failure

The most defensible reading of the evidence is that **the issues were never
handed to an implementation agent**. They were filed by the planning workflow,
sat untouched, and were then swept closed in a single automated batch by a
sprint-rollover / housekeeping pass before any executor was dispatched. The
batch never entered the work queue.

The contrast with the project's *successful* history makes this concrete. Every
landed item in `git log` is a commit of the form `implement #N: … (#PR)` —
produced by an executor that branched (`agent/issue-N`), opened a PR, and merged
it. The #141–#148 batch produced none of these artifacts. The break is
**specifically between "issue filed" and "executor dispatched on a branch"** —
the convert-to-work step — not anywhere in planning or implementation
themselves.

### Why the alternative explanations fit the evidence less well

- **Planning-agent reset?** No — planning kept running fine. It re-proposed the
  *identical* set in #150 immediately afterward. The generator is healthy; its
  output simply never gets consumed.
- **Scope too large?** No — the individual items are sized S/M, and several
  (#143 preset morphing, #142 router) explicitly compose already-shipped
  systems (preset bundles, transition curves, the #113 spike). Nothing was
  attempted-and-abandoned for size; nothing was attempted at all.
- **Bad dependencies / blocking graph?** No — six of seven children are Layer 0
  with no dependencies. They could have started immediately and did not.

The only stage with no artifacts on either side is dispatch. That is the
primary stall.

### A second, technical cause: a broken verification command

Dispatch is necessary but not sufficient. This PR also ships a real functional
fix in `caretta.toml`: the test and format commands were declared as a single
argv token —

```toml
command = ["bun install && bun run test"]
```

— which is handed to `exec` verbatim as one program literally named
`bun install && bun run test`. No shell ever interprets the `&&`, so the command
cannot run at all. The fix wraps it in a shell:

```toml
command = ["sh", "-c", "bun install && bun run test"]
```

This matters even though the #141–#148 batch left no branch behind: **any**
executor that *was* dispatched would hit this broken verification/format step,
error out before it could land, and produce no merged PR. So the two causes are
complementary, not competing:

- The **missing-dispatch** thesis best explains *this specific batch*, because
  the batch produced zero artifacts on either side (no branch, no failed CI run,
  no abandoned PR) — the signature of work that was never queued.
- The **broken-command** misconfiguration is a standing hazard that would have
  blocked landing for *any* dispatched executor regardless. Even once dispatch
  is fixed, leaving this in place would surface as a new failure mode (executor
  runs, verification errors, no PR), so it is fixed here rather than deferred.

It is therefore inaccurate to describe this PR as "no feature code": it contains
one behavior-changing fix, called out explicitly above so the diff and the
diagnosis agree.

## The fix: every re-issued item carries a named execution path before scheduling

Re-filing the same items without a dispatch path would just reproduce the loop.
This sprint (tracker #160) attaches an explicit owner and execution path to each
re-issued item. The **owner is the caretta implementation workflow running on a
dedicated per-issue branch** (`agent/issue-N`) — the same mechanism that
produced every successful `implement #N … (#PR)` commit in history. This
document is itself the first item executed under that path (issue #153, branch
`agent/issue-153`), demonstrating the path is live rather than asserted.

| Re-issued item | Prior (dead) issue | Owner / execution path |
|---|---|---|
| #153 Diagnose the stall | — | Implementation workflow → `agent/issue-153` → this doc → PR |
| #154 Confirm PR #99 rotation | #141 | Implementation workflow → branch → confirmation + incident note (secret rotation itself is a manual GitHub-settings action) |
| #155 Audio-Control Router Phase 1 | #142 | Implementation workflow → branch → bridge code (builds on spike #113) → PR |
| #156 OSC-controlled preset morphing | #143 | Implementation workflow → branch → bridge/controls code → PR |
| #157 Ableton Link sync | #145 | Implementation workflow → branch → bridge code → PR |
| #158 Re-file Ableton Extensions spike (time-boxed) | #146 | Implementation workflow → branch → spike doc under `docs/spikes/` → PR |
| #159 Revive ShaderToy browser & import | #147 | Implementation workflow → branch → PR; **gated** on the Shader Visual Regression Harness (manual control-plane follow-up) |

Two items from the dead sprint deliberately do **not** become executable
children this cycle, with an explicit reason rather than silent omission:

- **Shader Visual Regression Harness** (was #144) and the **CI Performance Gate +
  WASM size budget** require `.github/workflows/**` changes. Per the immutable
  CI control-plane policy, sprint/tracker branches cannot touch `.github/**`, so
  these are routed to a **maintainer on the control plane** and tracked as manual
  follow-ups in #160. #159 is gated behind the harness precondition accordingly.

## Guardrail against recurrence

The stall recurs whenever filing and dispatch are decoupled. Concretely, to
break the loop:

1. **No item is scheduled without a named execution path** (owner + branch +
   deliverable), as tabled above. An item with no path is not "planned," it is
   parked.
2. **A re-filed item must name the prior dead issue it supersedes** so an
   identical re-proposal is visibly a *retry of a stall*, not fresh planning.
3. **Items requiring `.github/**` are routed to the maintainer control plane up
   front**, not filed as executable children that an executor cannot satisfy and
   will close unimplemented.
4. **A sprint is "done" only when each child has either a merged PR or an
   explicit blocker comment** — never a silent batch `NOT_PLANNED` closure with
   no artifact, which is the exact signature this diagnosis identified.
