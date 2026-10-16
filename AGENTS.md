<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working memory

`docs/WORKLOG.md` holds the current rules, the code map and the open items. Read it
before starting work. It has no changelog, because the PR description records what
shipped. When a PR changes a rule or leaves something open, edit that section of the
file in the same PR, replacing the old line rather than adding a correction under it.
History up to 2026-10-16 is in `docs/WORKLOG-ARCHIVE-*.md`; grep an archive, and
never `cat` or `@`-import one.

## Review guidelines

Don't review `src/lib/warroom.ts` or anything under `docs/`. They record work that has
shipped, and the owner has ruled that Codex doesn't review War Room changes. Review
only the code in the PR.

@docs/WORKLOG.md
