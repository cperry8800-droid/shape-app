-- Restore missing RLS policies — messages, conversation_participants,
-- conversations (insert/update), community_likes, community_comments.
--
-- These tables had RLS ENABLED but their policies were missing on the live DB
-- (a partial migration apply / dropped-without-recreate), which is deny-all for
-- normal roles — silently breaking 1:1 DMs/chat sends + reads and the
-- like/comment engagement writes. The policy bodies below are copied verbatim
-- from their original migrations (2026-05-02-conversations-messages.sql,
-- 2026-05-02-community-feed.sql). This file deliberately does NOT touch
-- community_posts (preserves the 2026-06-09 'profile' visibility read policy)
-- and does NOT redefine any functions. Idempotent; safe to re-run.

-- ── conversations (read already present; restore insert + update) ────────────
drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations"
  on public.conversations for select
  to authenticated
  using (public.can_access_conversation(id));

drop policy if exists "clients create direct conversations" on public.conversations;
create policy "clients create direct conversations"
  on public.conversations for insert
  to authenticated
  with check (kind = 'direct' and client_id = auth.uid());

drop policy if exists "participants update conversations" on public.conversations;
create policy "participants update conversations"
  on public.conversations for update
  to authenticated
  using (public.can_access_conversation(id))
  with check (public.can_access_conversation(id));

-- ── conversation_participants ────────────────────────────────────────────────
drop policy if exists "participants read participants" on public.conversation_participants;
create policy "participants read participants"
  on public.conversation_participants for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists "users add self to conversation" on public.conversation_participants;
create policy "users add self to conversation"
  on public.conversation_participants for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_access_conversation(conversation_id));

-- ── messages ─────────────────────────────────────────────────────────────────
drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages"
  on public.messages for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid() and public.can_access_conversation(conversation_id));

-- ── community_likes ──────────────────────────────────────────────────────────
drop policy if exists "read visible community likes" on public.community_likes;
create policy "read visible community likes"
  on public.community_likes for select
  to anon, authenticated
  using (public.can_view_community_post(post_id));

drop policy if exists "users like visible community posts" on public.community_likes;
create policy "users like visible community posts"
  on public.community_likes for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_view_community_post(post_id));

drop policy if exists "users unlike own community likes" on public.community_likes;
create policy "users unlike own community likes"
  on public.community_likes for delete
  to authenticated
  using (user_id = auth.uid());

-- ── community_comments ───────────────────────────────────────────────────────
drop policy if exists "read visible community comments" on public.community_comments;
create policy "read visible community comments"
  on public.community_comments for select
  to anon, authenticated
  using (public.can_view_community_post(post_id));

drop policy if exists "users comment on visible community posts" on public.community_comments;
create policy "users comment on visible community posts"
  on public.community_comments for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_view_community_post(post_id));

drop policy if exists "users delete own community comments" on public.community_comments;
create policy "users delete own community comments"
  on public.community_comments for delete
  to authenticated
  using (user_id = auth.uid());
