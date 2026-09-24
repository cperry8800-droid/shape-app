-- Privacy and its audience cleanup commit or roll back together, including
-- saves from older app clients. Existing owner RLS applies to every statement.
create or replace function public.shape_sync_workout_privacy()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  audience text;
begin
  if new.kind <> 'client_settings' then return new; end if;
  audience := case
    when coalesce(new.data->>'shareWorkoutData', 'On') = 'Off'
      or coalesce(new.data->>'profileVisibility', 'Public') = 'Private' then 'private'
    when coalesce(new.data->>'profileVisibility', 'Public') = 'Just friends' then 'followers'
    else 'public'
  end;

  -- History only becomes more private. Manual posts retain their own audience.
  if audience = 'private' then
    update public.community_posts set privacy = 'private'
      where author_id = new.user_id and source_provider is not null
        and privacy in ('public', 'community', 'followers');
  elsif audience = 'followers' then
    update public.community_posts set privacy = 'followers'
      where author_id = new.user_id and source_provider is not null
        and privacy in ('public', 'community');
  end if;

  if audience = 'private' then
    delete from public.user_activity_live where user_id = new.user_id;
  else
    update public.user_activity_live set visibility = audience
      where user_id = new.user_id and visibility is distinct from audience;
  end if;
  return new;
end;
$$;

revoke all on function public.shape_sync_workout_privacy() from public, anon, authenticated;
drop trigger if exists shape_sync_workout_privacy on public.user_goals;
create trigger shape_sync_workout_privacy
  after insert or update of data on public.user_goals
  for each row execute function public.shape_sync_workout_privacy();
