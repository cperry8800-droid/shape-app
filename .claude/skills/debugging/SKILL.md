---
name: debugging
description: >-
  Use when something is broken, erroring, or not behaving as expected —
  a runtime error, a visual change that "isn't showing up", a failing
  build/deploy, wrong output, or flaky behavior. Apply before guessing at
  fixes: this skill enforces reproduce → isolate → root-cause → verify.
---

# Debugging

Find the actual cause before changing code. Symptom-patching wastes
iterations (and, here, deploy cycles and money).

## The loop

1. **Reproduce deterministically.** Exact page/route, viewport, inputs,
   auth state, steps. If you can't reproduce it, you can't fix it — say so.
2. **Read the real error.** Stack trace, console, network tab, build log,
   runtime logs. Don't theorize past an error message you haven't read.
3. **Isolate.** Bisect: which commit, which file, which line, which CSS
   rule, which breakpoint. Binary-search the change set. Minimize to the
   smallest failing case.
4. **Form one hypothesis** that explains *all* the symptoms, and a cheap
   test that would falsify it. If the hypothesis only explains some
   symptoms, it's wrong.
5. **Confirm before fixing.** Instrument (log, temporary marker, devtools)
   and prove the cause. Then fix the root cause, not the symptom.
6. **Verify the fix** against the original repro *and* check you didn't
   regress the golden path.

## "I changed it but I don't see it" — checklist (common here)

Before touching code again, rule these out in order:

- **Did it deploy?** Check the production deployment is `READY` on the
  *merge* commit, not a stale one. A PR pushed ≠ live.
- **Browser cache.** Hard reload (Cmd/Ctrl+Shift+R). Static HTML/CSS and
  referenced SVG/PNG cache hard. Bump `?v=N` on swapped assets.
- **Right element?** The visible thing may be a different rule than the
  one you changed — e.g. a `::before`/`::after`, a more-specific selector,
  an inline style, or a different component/variant entirely. Grep the
  deployed file for *every* place the color/size/text is set.
- **Right surface?** This repo has three (Next app, newdesign, mobile)
  plus a parallel hero vs feat-row phone. Confirm which one the screenshot
  is from.
- **Specificity / !important / cascade order** overriding your change.
- **Parallel session / branch** changed the same file (has happened here —
  check recent deploys for other branches touching the file).

## Bug classes seen in this codebase

- **Nested media-query inversion**: a smaller breakpoint setting a *larger*
  value than a wider one. Always read every `@media` block for the
  property before "fixing" sizing.
- **UTF-8 mojibake**: `â€"`, `Â·`, `�` from a lost-byte/Latin-1 save.
  Fix by restoring real glyphs and keeping the file UTF-8.
- **Pseudo-element framing**: visible borders/edges coming from
  `::before`/`::after`, not the element's own `background`.
- **Stale local checkout**: working tree behind `origin/main` by many
  commits; `git fetch` + reset before diagnosing "it's not there".

## Discipline

- One change at a time when isolating; revert it if it doesn't move the
  needle. Don't stack speculative fixes.
- Never use a destructive shortcut (force reset, skip hooks, delete state)
  to make an error "go away" — find why it's there.
- If the premise is wrong, stop and re-state the problem rather than
  fixing the wrong thing faster.
- Report what you proved, not what you assume: "confirmed X by Y", not
  "should be fixed".
