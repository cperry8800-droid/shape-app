// Mutation spec for the reviewed-revision verdicts and the listing owner cascade (2026-10-13):
// each mutation undoes one guard; the tests below must fail on every one. (The behaviour itself was
// probed on a PostgreSQL 16 copy; the runner does not run Postgres.)
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/review-revision-2026-10-13.mutations.mjs --fail-on-skipped
const SQL = 'supabase-migrations/2026-10-13-review-revision-and-listing-owner-cascade.sql';
const ACTIONS = 'src/app/dashboard/credentials/actions.ts';
const PAGE = 'src/app/dashboard/credentials/page.tsx';

export default {
  test: 'node --test tests/credential-review-revision.test.mjs tests/coach-application-review.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'the revision is a per-row counter again', file: SQL,
      find: "  new.revision := nextval('public.provider_credentials_revision_seq');",
      replace: "  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;" },
    { name: 'approval ignores the reviewed revision', file: SQL,
      find: '   where owner_id = p_owner and revision = p_revision;',
      replace: '   where owner_id = p_owner;' },
    { name: 'a changed credential reads as missing', file: SQL,
      find: '      return -1;\n',
      replace: '      return null;\n' },
    { name: 'the three-argument approval survives', file: SQL,
      find: 'drop function if exists public.approve_provider_credential(uuid, uuid, text);\n',
      replace: '' },
    { name: 'the coach cannot read the revision', file: SQL,
      find: 'grant select (revision) on table public.provider_credentials to authenticated;',
      replace: '' },
    { name: 'a deleted coach leaves their trainer listing', file: SQL,
      find: 'add constraint trainers_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;',
      replace: 'add constraint trainers_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete set null;' },
    { name: 'approval sends no revision', file: ACTIONS,
      find: '    p_revision: revision,\n',
      replace: '' },
    { name: 'a rejection ignores the reviewed revision', file: ACTIONS,
      find: "      review_notes: notes || 'Credentials could not be verified.',\n      verified_at: null,\n    })\n    .eq('owner_id', ownerId)\n    .eq('revision', revision)",
      replace: "      review_notes: notes || 'Credentials could not be verified.',\n      verified_at: null,\n    })\n    .eq('owner_id', ownerId)" },
    { name: 'a request for changes on a changed credential is reported as done', file: ACTIONS,
      find: '  if (!requested?.length) await notRecorded(admin, ownerId);\n',
      replace: '' },
    { name: 'a form without a version is accepted', file: ACTIONS,
      find: "  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Reload the page: this review form has no credential version.');",
      replace: '' },
    { name: 'the form drops the version on screen', file: PAGE,
      find: '        <input type="hidden" name="revision" value={String(row.revision)} />\n',
      replace: '' },
  ],
};
