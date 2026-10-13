// Mutation spec for 2026-10-13-listing-badge-follows-credential.sql: each mutation undoes one
// guard; tests/listing-badge-follows-credential.test.mjs must fail on every one. (The behaviour
// itself was probed on a PostgreSQL 16 scaffold; the runner does not run Postgres.)
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/listing-badge-follows-credential-2026-10-13.mutations.mjs --fail-on-skipped
const SQL = 'supabase-migrations/2026-10-13-listing-badge-follows-credential.sql';
const HELPER = 'src/lib/coach-verification.ts';

export default {
  test: 'node --test tests/listing-badge-follows-credential.test.mjs',
  timeoutMs: 60_000,
  mutations: [
    { name: 'a pending credential keeps the badge', file: SQL,
      find: "  elsif new.review_status is distinct from 'approved' then",
      replace: "  elsif new.review_status = 'rejected' then" },
    { name: 'a deleted credential keeps the badge', file: SQL,
      find: "  if tg_op = 'DELETE' then\n    perform public.clear_listing_verified(old.owner_id);\n  elsif",
      replace: "  if false then\n    perform public.clear_listing_verified(old.owner_id);\n  elsif" },
    { name: 'the trigger fires on updates only', file: SQL,
      find: '  after insert or update or delete on public.provider_credentials',
      replace: '  after update on public.provider_credentials' },
    { name: 'the trigger function runs as the coach', file: SQL,
      find: "language plpgsql\nsecurity definer\nset search_path to 'public', 'pg_temp'",
      replace: "language plpgsql\nset search_path to 'public', 'pg_temp'" },
    { name: 'the clear function becomes a definer', file: SQL,
      find: "returns integer\nlanguage sql\nset search_path",
      replace: "returns integer\nlanguage sql\nsecurity definer\nset search_path" },
    { name: 'members can call the clear function', file: SQL,
      find: 'revoke all on function public.clear_listing_verified(uuid) from public, anon, authenticated;',
      replace: 'revoke all on function public.clear_listing_verified(uuid) from public;' },
    { name: 'the nutritionist listing keeps its badge', file: SQL,
      find: '    update public.nutritionists set verified = false, verified_at = null\n    where owner_id = p_owner and verified',
      replace: '    update public.nutritionists set verified_at = verified_at\n    where owner_id = p_owner and verified' },
    { name: 'another coach is cleared too', file: SQL,
      find: '    update public.trainers set verified = false, verified_at = null\n    where owner_id = p_owner and verified',
      replace: '    update public.trainers set verified = false, verified_at = null\n    where verified' },
    { name: 'approval badges a coach with no credential row', file: SQL,
      find: '  if not found then\n    return null;\n  end if;\n  update public.trainers set verified = true',
      replace: '  update public.trainers set verified = true' },
    { name: 'approval badges before it approves', file: SQL,
      find: "     set review_status = 'approved', reviewed_by = p_reviewer, reviewed_at = v_now,",
      replace: "     set reviewed_by = p_reviewer, reviewed_at = v_now," },
    { name: 'members can call the approval', file: SQL,
      find: 'revoke all on function public.approve_provider_credential(uuid, uuid, text) from public, anon, authenticated;',
      replace: 'revoke all on function public.approve_provider_credential(uuid, uuid, text) from anon;' },
    { name: 'the helper clears one table at a time again', file: HELPER,
      find: "  const { data, error } = await admin.rpc('clear_listing_verified', { p_owner: ownerId });",
      replace: "  const { data, error } = await admin.from('trainers').update({ verified: false }).eq('owner_id', ownerId);" },
  ],
};
