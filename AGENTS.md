<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working memory

Ongoing build/deploy conventions, the mobile architecture map, and a running
changelog of what we've shipped live in **`docs/WORKLOG.md`** — read it before
starting work, and append a dated entry whenever something ships. The live log is
size-capped (`tests/worklog-size.test.mjs`); when that test fails, run
`node scripts/worklog-archive.mjs` — older entries move, byte-identical, into
`docs/WORKLOG-ARCHIVE-<YYYY-MM>.md`. Grep an archive; never `cat` or `@`-import one.

@docs/WORKLOG.md
