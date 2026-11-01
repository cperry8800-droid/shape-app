-- A reply in a channel (owner, 2026-11-01: "build the day dividers and swipe to reply").
--
-- Swipe a message left in a chat thread and what you send quotes it. A direct message keeps the
-- quote in messages.metadata.reply, a column it already has (live boosts, photos and shared
-- grocery lists ride there too). A channel's messages have no such column, so a channel reply
-- would lose its quote: this adds channel_messages.metadata, a jsonb object defaulting to {}, the
-- same shape as messages.metadata.
--
-- The quote is the sender's own input, read strictly in the app (chatReply.mjs keeps only short
-- strings, and the thread draws the quoted message itself when it is loaded), and a row is capped
-- at 4 KB of metadata so a client cannot store a novel in it. No policy changes: "members post
-- channel messages" (sender_id = auth.uid() and a member of the channel) and the visible-channel
-- read policy cover the new column as they cover the row. Realtime publishes the whole row.
--
-- Until this runs, the app still works: a channel's history reads every column (select *), and a
-- channel reply that cannot store its quote is sent without it. One transaction, re-runnable, a
-- guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

alter table public.channel_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.channel_messages'::regclass
      and conname = 'channel_messages_metadata_shape'
  ) then
    alter table public.channel_messages
      add constraint channel_messages_metadata_shape
      check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096);
  end if;
end $$;

-- Guard: the column and its check are there, with the shape the app writes.
do $$
declare
  v_type text;
  v_default text;
  v_nullable text;
begin
  select data_type, column_default, is_nullable into v_type, v_default, v_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'channel_messages' and column_name = 'metadata';
  if v_type is distinct from 'jsonb' then
    raise exception 'channel_messages.metadata is missing or not jsonb (%)', coalesce(v_type, 'missing');
  end if;
  if v_nullable <> 'NO' or v_default not like '''{}''::jsonb%' then
    raise exception 'channel_messages.metadata must be not null with an empty-object default (%, %)', v_nullable, v_default;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.channel_messages'::regclass
      and conname = 'channel_messages_metadata_shape'
      and pg_get_constraintdef(oid) like '%jsonb_typeof(metadata)%object%'
      and pg_get_constraintdef(oid) like '%pg_column_size(metadata) <= 4096%'
  ) then
    raise exception 'channel_messages lost its metadata shape check';
  end if;
end $$;

commit;
