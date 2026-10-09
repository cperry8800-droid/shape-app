-- =====================================================================================
-- The open half of C2 (2026-10-08 security review, item 3 of its follow-ups): a meal plan's
-- menus are the product, and the public sale-plan functions handed every caller all of them.
--
-- The storefront preview (planPreview.mjs, the "what's inside" sheet) SHOWS, before a purchase:
-- the seven day labels with a meal COUNT each, the first day's first two meals, and "+N more ·
-- unlocked when you buy". It never renders a locked meal's text. But get_coach_sale_plans and
-- get_coach_sale_plans_by_user returned `detail.blocks` and `detail.days` whole, so anyone with
-- the anon key read every menu of every published plan by calling the function directly.
--
-- Now the two functions hand out what the preview shows and nothing more, for a meal plan:
--   preview:     true
--   perDay:      whether any day's delivered menu differs from Monday's (bsPlanWeek's rule)
--   blocksCount: the default menu's meal count
--   blocks:      the default menu's first two meals, only when the first day with meals is one
--                that inherits the default; otherwise []
--   days:        each authored day as { dow, count, blocks }, blocks holding that day's first
--                two meals only for the first day with meals, else []
-- Every other key (note, media, buildType, the goal/diet/cals meta) passes through; `builder`
-- stays out (C2, #2280). A program's detail is unchanged by this file.
--
-- Two text rules, both the app's own. A block COUNTS as a meal, and may be one of the two kept,
-- by the preview's rule (planPreview.mjs blockText: a string, or an object's `text`, cleaned and
-- trimmed, non-empty); `perDay` compares days by delivery's rule (planOutline.mjs
-- deliveredTexts: `String(((b && b.text != null) ? b.text : b) || '').trim()`), as bsPlanWeek
-- does. Both scan a day's first 40 blocks. The JS mirror bsPreviewReduce in planPreview.mjs is
-- this function's oracle in the tests.
--
-- The owner's own rows (the editor), the purchased-plan function and delivery read the full
-- document as before. One transaction; re-runnable.
-- =====================================================================================

begin;
set local lock_timeout = '10s';

-- The text a block DELIVERS. Mirrors the app: a string is itself; an object delivers its
-- `text` when that is not null, else "[object Object]" (JavaScript's String of an object); a
-- number delivers its digits unless it is 0; `true` delivers "true"; `false`, null and an
-- empty array deliver nothing. Always trimmed.
create or replace function public.sale_plan_block_text(b jsonb)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v jsonb := b;
begin
  if v is not null and jsonb_typeof(v) = 'object' then
    if v ? 'text' and jsonb_typeof(v->'text') <> 'null' then
      v := v->'text';
    else
      return '[object Object]';
    end if;
  end if;
  if v is null then return ''; end if;
  return btrim(case jsonb_typeof(v)
    when 'string' then v #>> '{}'
    when 'number' then case when (v #>> '{}')::numeric = 0 then '' else v #>> '{}' end
    when 'boolean' then case when v = 'true'::jsonb then 'true' else '' end
    when 'object' then '[object Object]'
    when 'array' then case when jsonb_array_length(v) = 0 then '' else '[array]' end
    else '' end);
end;
$$;

-- The text the PREVIEW reads off a block (planPreview.mjs blockText): a string, or an object's
-- non-null `text` as JavaScript's String of it, control characters stripped, trimmed; anything
-- else is nothing. (A number 0 reads "0" here and nothing in delivery; the preview's rule is
-- the one that counts meals on the sheet.)
create or replace function public.sale_plan_block_preview_text(b jsonb)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v jsonb := b;
  t text;
begin
  if v is null then return ''; end if;
  if jsonb_typeof(v) = 'object' then
    if v ? 'text' and jsonb_typeof(v->'text') <> 'null' then
      v := v->'text';
    else
      return '';
    end if;
  elsif jsonb_typeof(v) <> 'string' then
    return '';
  end if;
  t := case jsonb_typeof(v)
    when 'string' then v #>> '{}'
    when 'number' then v #>> '{}'
    when 'boolean' then v #>> '{}'
    when 'object' then '[object Object]'
    when 'array' then case when jsonb_array_length(v) = 0 then '' else '[array]' end
    else '' end;
  return btrim(regexp_replace(left(t, 2000), '[\x01-\x1f\x7f]', '', 'g'));
end;
$$;

create or replace function public.sale_plan_preview_detail(p_kind text, p_detail jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v jsonb := coalesce(p_detail, '{}'::jsonb);
  v_default jsonb;
  v_authored jsonb[] := array_fill(null::jsonb, array[7]);
  v_count integer[] := array_fill(0, array[7]);
  v_key text[] := array_fill(''::text, array[7]);
  v_first2 jsonb[] := array_fill('[]'::jsonb, array[7]);
  v_default_count integer := 0;
  v_perday boolean := false;
  v_sample integer := null;
  v_days jsonb := '[]'::jsonb;
  v_blocks jsonb := '[]'::jsonb;
  r record;
  v_dow numeric;
  v_list jsonb;
  v_c integer;
  v_k text;
  v_f jsonb;
  i integer;
begin
  if jsonb_typeof(v) <> 'object' then return v; end if;
  v := v - 'builder';
  if p_kind is distinct from 'meal_plan' then return v; end if;

  v_default := case when jsonb_typeof(v->'blocks') = 'array' then v->'blocks' else '[]'::jsonb end;

  -- The authored days: the first seven entries, an object with an integer dow 0..6 and an
  -- array of blocks, the first entry per dow (bsPlanWeek's selection, exactly).
  if jsonb_typeof(v->'days') = 'array' then
    for r in select e, n from jsonb_array_elements(v->'days') with ordinality as x(e, n) where n <= 7 order by n loop
      if jsonb_typeof(r.e) <> 'object' or jsonb_typeof(r.e->'dow') <> 'number' or jsonb_typeof(r.e->'blocks') <> 'array' then
        continue;
      end if;
      v_dow := (r.e->>'dow')::numeric;
      if v_dow <> floor(v_dow) or v_dow < 0 or v_dow > 6 then continue; end if;
      i := v_dow::integer + 1;
      if v_authored[i] is not null then continue; end if;
      v_authored[i] := r.e->'blocks';
    end loop;
  end if;

  -- Each resolved day, over its first 40 blocks: the meals the preview counts and the first
  -- two of them (the originals, so the preview parses them as it always has), and a key of
  -- the delivered texts for the perDay comparison.
  for i in 1..7 loop
    v_list := coalesce(v_authored[i], v_default);
    select coalesce(count(*), 0), coalesce(jsonb_agg(e order by n) filter (where rn <= 2), '[]'::jsonb)
      into v_c, v_f
    from (
      select e, n, row_number() over (order by n) as rn
      from (
        select e, n, public.sale_plan_block_preview_text(e) as t
        from jsonb_array_elements(v_list) with ordinality as x(e, n)
        where n <= 40
      ) s
      where t <> ''
    ) s2;
    select coalesce(string_agg(t, chr(31) order by n), '') into v_k
    from (select n, public.sale_plan_block_text(e) as t from jsonb_array_elements(v_list) with ordinality as x(e, n) where n <= 40) s
    where t <> '';
    v_count[i] := v_c; v_key[i] := v_k; v_first2[i] := v_f;
    if v_sample is null and v_count[i] > 0 then v_sample := i; end if;
  end loop;
  select coalesce(count(*), 0) into v_default_count
  from (select public.sale_plan_block_preview_text(e) as t from jsonb_array_elements(v_default) with ordinality as x(e, n) where n <= 40) s
  where t <> '';

  for i in 2..7 loop
    if v_key[i] <> v_key[1] then v_perday := true; end if;
  end loop;

  -- The output: counts for every authored day, the sample day's first two meals, nothing else.
  for i in 1..7 loop
    if v_authored[i] is not null then
      v_days := v_days || jsonb_build_array(jsonb_build_object(
        'dow', i - 1,
        'count', v_count[i],
        'blocks', case when v_sample = i then v_first2[i] else '[]'::jsonb end));
    end if;
  end loop;
  if v_sample is not null and v_authored[v_sample] is null then
    v_blocks := v_first2[v_sample];
  end if;

  v := v || jsonb_build_object('preview', true, 'perDay', v_perday, 'blocksCount', v_default_count, 'blocks', v_blocks);
  if jsonb_typeof(p_detail->'days') = 'array' then
    v := v || jsonb_build_object('days', v_days);
  end if;
  return v;
end;
$$;

revoke all on function public.sale_plan_block_text(jsonb) from public;
revoke all on function public.sale_plan_block_text(jsonb) from anon;
revoke all on function public.sale_plan_block_text(jsonb) from authenticated;
revoke all on function public.sale_plan_block_preview_text(jsonb) from public;
revoke all on function public.sale_plan_block_preview_text(jsonb) from anon;
revoke all on function public.sale_plan_block_preview_text(jsonb) from authenticated;
revoke all on function public.sale_plan_preview_detail(text, jsonb) from public;
revoke all on function public.sale_plan_preview_detail(text, jsonb) from anon;
revoke all on function public.sale_plan_preview_detail(text, jsonb) from authenticated;

-- The two public functions, as #2280 left them, with the reduction in place of `- 'builder'`.
create or replace function public.get_coach_sale_plans(p_provider_role text, p_provider_id bigint)
returns table(id uuid, kind text, name text, meta text, price text, category text, detail jsonb)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with own as (
    select case
      when p_provider_role = 'nutritionist' then (select owner_id from nutritionists where id = p_provider_id)
      else (select owner_id from trainers where id = p_provider_id)
    end as oid
  )
  select cp.id, cp.kind, cp.name, cp.meta, cp.price,
    lower(coalesce(nullif(cp.detail->>'buildType', ''), case when cp.kind = 'meal_plan' then 'meal' else 'program' end)) as category,
    public.sale_plan_preview_detail(cp.kind, cp.detail) as detail
  from coach_plans cp
  where cp.owner_id = (select oid from own)
    and cp.published = true
  order by cp.created_at desc
  limit 80;
$$;

create or replace function public.get_coach_sale_plans_by_user(p_user_id uuid)
returns table(id uuid, kind text, name text, meta text, price text, category text, provider_id bigint, provider_role text, detail jsonb)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select cp.id, cp.kind, cp.name, cp.meta, cp.price,
    lower(coalesce(nullif(cp.detail->>'buildType', ''), case when cp.kind = 'meal_plan' then 'meal' else 'program' end)) as category,
    case when cp.kind = 'meal_plan'
      then (select id from nutritionists where owner_id = cp.owner_id limit 1)
      else (select id from trainers where owner_id = cp.owner_id limit 1)
    end as provider_id,
    case when cp.kind = 'meal_plan' then 'nutritionist' else 'trainer' end as provider_role,
    public.sale_plan_preview_detail(cp.kind, cp.detail) as detail
  from coach_plans cp
  where cp.owner_id = p_user_id
    and cp.published = true
  order by cp.created_at desc
  limit 80;
$$;

-- =====================================================================================
-- Guard: the end state, asserted. Every RAISE takes exactly the arguments its format names.
do $guard$
declare
  f record;
  v_oid oid;
  v_secdef boolean;
  v_cfg text;
  v jsonb;
begin
  for f in
    select * from (values
      ('get_coach_sale_plans', 'p_provider_role text, p_provider_id bigint', true),
      ('get_coach_sale_plans_by_user', 'p_user_id uuid', true),
      ('sale_plan_preview_detail', 'p_kind text, p_detail jsonb', false),
      ('sale_plan_block_text', 'b jsonb', false),
      ('sale_plan_block_preview_text', 'b jsonb', false)
    ) as t(name, args, public_read)
  loop
    select p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
      into v_oid, v_secdef, v_cfg
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f.name
      and pg_get_function_identity_arguments(p.oid) = f.args;
    if v_oid is null then
      raise exception '%(%) is missing after this migration', f.name, f.args;
    end if;
    if position('pg_temp' in v_cfg) = 0 then
      raise exception '%(%) is not pinned to pg_temp', f.name, f.args;
    end if;
    if f.public_read and not v_secdef then
      raise exception '%(%) is not SECURITY DEFINER', f.name, f.args;
    end if;
    if f.public_read <> has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception '%(%): anon EXECUTE must be %', f.name, f.args, f.public_read;
    end if;
    if f.public_read <> has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception '%(%): authenticated EXECUTE must be %', f.name, f.args, f.public_read;
    end if;
    v_oid := null; v_secdef := null; v_cfg := null;
  end loop;

  -- The reduction, on a fixture: Monday authored empty, Tuesday inherits the default (3 meals),
  -- Wednesday authored (2), a junk day dropped. The first day with meals is Tuesday, which
  -- inherits, so the default keeps its first two meals and Wednesday keeps none.
  v := public.sale_plan_preview_detail('meal_plan', '{"builder": {"weeks": []}, "note": "n", "media": [], "blocks": ["Breakfast · Oats", "  ", "Lunch · Bowl", {"text": "Dinner · Fish"}], "days": [{"dow": 2, "blocks": ["Breakfast · Eggs", "Lunch · Soup"]}, {"dow": 0, "blocks": []}, {"dow": 9, "blocks": ["x"]}, {"dow": 2, "blocks": ["dup"]}]}'::jsonb);
  if v ? 'builder' or (v->>'preview') is distinct from 'true' or (v->>'perDay') is distinct from 'true'
     or (v->>'blocksCount')::integer <> 3 or jsonb_array_length(v->'blocks') <> 2 or v->>'note' <> 'n' then
    raise exception 'sale_plan_preview_detail: the default menu is not reduced as expected: %', v::text;
  end if;
  if (select count(*) from jsonb_array_elements(v->'days')) <> 2
     or (select sum(jsonb_array_length(d->'blocks')) from jsonb_array_elements(v->'days') d) <> 0
     or (select sum((d->>'count')::integer) from jsonb_array_elements(v->'days') d) <> 2 then
    raise exception 'sale_plan_preview_detail: the authored days are not reduced as expected: %', v::text;
  end if;
  -- A per-day plan whose first day is authored keeps that day's sample and no default text.
  v := public.sale_plan_preview_detail('meal_plan', '{"blocks": ["Breakfast · Oats", "Lunch · Bowl"], "days": [{"dow": 0, "blocks": ["Breakfast · Eggs", "Lunch · Soup", "Dinner · Stew"]}]}'::jsonb);
  if jsonb_array_length(v->'blocks') <> 0 or jsonb_array_length(v->'days'->0->'blocks') <> 2 or (v->'days'->0->>'count')::integer <> 3 then
    raise exception 'sale_plan_preview_detail: an authored first day is not the sample: %', v::text;
  end if;
  -- A uniform week (no days) keeps the legacy shape with the first two meals and a count.
  v := public.sale_plan_preview_detail('meal_plan', '{"blocks": ["Breakfast · Oats", "Lunch · Bowl", "Dinner · Fish"]}'::jsonb);
  if v ? 'days' or (v->>'perDay') is distinct from 'false' or (v->>'blocksCount')::integer <> 3 or jsonb_array_length(v->'blocks') <> 2 then
    raise exception 'sale_plan_preview_detail: a uniform week is not reduced as expected: %', v::text;
  end if;
  -- A program's detail is untouched beyond `builder`.
  v := public.sale_plan_preview_detail('program', '{"builder": {"weeks": []}, "blocks": ["Mon — Push", "Wed — Pull", "Fri — Legs"]}'::jsonb);
  if v ? 'builder' or v ? 'preview' or jsonb_array_length(v->'blocks') <> 3 then
    raise exception 'sale_plan_preview_detail: a program''s outline changed: %', v::text;
  end if;
end
$guard$;

commit;
