-- =====================================================================================
-- A program's public preview: names, weeks and days. Sets, loads, cues and videos unlock on
-- purchase, with one free preview video per program (the owner, 2026-10-29).
--
-- get_coach_sale_plans and get_coach_sale_plans_by_user are anon-callable. Since 2026-10-09 a
-- meal plan goes through sale_plan_preview_detail and comes out as counts and two sample meals,
-- but a program only lost `builder`. The app saves a program's outline as `detail.blocks`
-- (builderToOutlineBlocks: every row of every week with its sets, reps, load, rest, tempo, cue,
-- per-set ladder and clip, and the text "Bench press — 3 × 8 · 60 kg"), and `detail.media`
-- holds the coach's workout clips. So anyone with the anon key read every program whole. On
-- 2026-10-29 one program was published, saved from the website (no `blocks`), so nothing has
-- leaked yet; the next one saved in the app would have.
--
-- Now a program's detail comes out as (sale_plan_program_preview):
--   preview:   true
--   blocks:    from `builder` (what delivery reads, planOutline.mjs), each named row as
--              { week, day, dayName?, weekday?, name, equipment?, muscle?, text: name }, in
--              delivery order, at most 40; `weeks`, how many weeks the builder holds (at most
--              52), since 40 rows rarely reach the last one; and `firstWeek`, the first week
--              with a named row as its days { week, day, dayName?, weekday?, moves }, counted
--              past the 40 (so a first day of 40 moves still leaves its later days), within the
--              same 400-row scan. With no builder, or an outline-only one, the text
--              outline instead (`detail.blocks`, the first 40): a weekday line ("Mon — Push",
--              its head a weekday and nothing else) or week line ("Week 3 — Peak") whole, as
--              the structure; any other line cut to the exercise name before its separator.
--              "Monster walk — 3 × 10" is an exercise, not Monday: it comes out "Monster walk",
--              which the preview still reads as the weekday line it always read it as.
--   media:     one video (the program's own `builder.video`, else the first clip), then up to
--              seven images
--   note, buildType: as they are, when they are text
-- and nothing else. The JS mirror bsProgramReduce (planPreview.mjs) is this function's oracle in
-- the tests; on ASCII text the two agree exactly (Unicode case and whitespace can differ, which
-- changes only how a coach's own line is classed, never what else comes out).
--
-- A meal plan is unchanged: sale_plan_preview_detail is the 2026-10-09 body with the program
-- branch calling the new function. The owner's own rows (the editor), the purchased-plan function
-- and delivery read the full document as before. One transaction; re-runnable.
-- =====================================================================================

begin;
set local lock_timeout = '10s';

-- Text as the preview cleans it: the first 2000 characters, control characters out, spaces
-- trimmed, then capped.
create or replace function public.sale_plan_program_clean(t text, max_len integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select left(btrim(regexp_replace(left(coalesce(t, ''), 2000), '[\x01-\x1f\x7f]', '', 'g')), max_len);
$$;

-- One line of a text outline as the preview may show it (bsProgramLine): a weekday line (its head
-- a weekday, "Mon" to "Sunday", and nothing more) or a week line whole, anything else cut to the exercise name before its separator (an em dash, en dash or
-- colon with something after it), or, with no separator, before a " · " that has a number after
-- it, as bsAssignExercise reads a line.
create or replace function public.sale_plan_program_line(t text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_head text;
  v_week text[];
  v_dot integer;
begin
  if t is null or t = '' then return ''; end if;
  v_head := substring(t from '^([^—–:]*)[—–:].');
  if lower(btrim(coalesce(v_head, t))) ~ '^(mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\.?$' then
    return t;
  end if;
  v_week := regexp_match(t, '^ *week *([0-9]{1,2})(?![0-9A-Za-z_])', 'i');
  if v_week is not null and v_week[1]::integer between 1 and 52 then
    return t;
  end if;
  if v_head is not null then return btrim(v_head); end if;
  v_dot := position('·' in t);
  if v_dot > 0 and substr(t, v_dot + 1) ~ '[0-9]' then
    return btrim(left(t, v_dot - 1));
  end if;
  return t;
end;
$$;

create or replace function public.sale_plan_program_preview(p_detail jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_builder jsonb := p_detail->'builder';
  v_media_in jsonb := case when jsonb_typeof(p_detail->'media') = 'array' then p_detail->'media' else '[]'::jsonb end;
  v_blocks jsonb := '[]'::jsonb;
  v_images jsonb;
  v_video text;
  v_out jsonb;
  v_count integer := 0;
  v_visits integer := 0;
  v_day_name text;
  v_weekday jsonb;
  v_name text;
  v_equipment text;
  v_muscle text;
  v_line text;
  v_weeks integer;
  v_first integer;
  v_last_day integer;
  v_first_week jsonb := '[]'::jsonb;
  w record;
  d record;
  b record;
  r record;
begin
  if jsonb_typeof(p_detail) <> 'object' then return p_detail; end if;

  -- The outline. The builder's rows, in delivery order: the first 52 weeks, 14 days a week, 12
  -- blocks a day and 40 rows a block, at most 400 rows looked at and 40 kept.
  if jsonb_typeof(v_builder) = 'object' and jsonb_typeof(v_builder->'weeks') = 'array'
     and (v_builder->'outlineOnly') is distinct from 'true'::jsonb then
    v_weeks := least(jsonb_array_length(v_builder->'weeks'), 52);
    <<rows>>
    for w in select e, n from jsonb_array_elements(v_builder->'weeks') with ordinality as x(e, n) where n <= 52 order by n loop
      -- Past the first week with 40 rows kept, there is nothing left to keep or count.
      exit rows when v_count >= 40 and v_first is not null;
      continue when jsonb_typeof(w.e) <> 'object' or jsonb_typeof(w.e->'days') <> 'array';
      for d in select e, n from jsonb_array_elements(w.e->'days') with ordinality as x(e, n) where n <= 14 order by n loop
        continue when jsonb_typeof(d.e) <> 'object' or jsonb_typeof(d.e->'blocks') <> 'array';
        v_day_name := case when jsonb_typeof(d.e->'name') = 'string' then public.sale_plan_program_clean(d.e->>'name', 80) else '' end;
        v_weekday := case when jsonb_typeof(d.e->'weekday') = 'number'
                            and (d.e->>'weekday')::numeric between 0 and 6
                            and (d.e->>'weekday')::numeric = floor((d.e->>'weekday')::numeric)
                       then to_jsonb((d.e->>'weekday')::numeric::integer) end;
        for b in select e, n from jsonb_array_elements(d.e->'blocks') with ordinality as x(e, n) where n <= 12 order by n loop
          continue when jsonb_typeof(b.e) <> 'object' or jsonb_typeof(b.e->'rows') <> 'array';
          for r in select e, n from jsonb_array_elements(b.e->'rows') with ordinality as x(e, n) where n <= 40 order by n loop
            v_visits := v_visits + 1;
            exit rows when v_visits > 400;
            continue when jsonb_typeof(r.e) <> 'object' or jsonb_typeof(r.e->'name') <> 'string';
            v_name := public.sale_plan_program_clean(r.e->>'name', 120);
            continue when v_name = '';
            v_equipment := case when jsonb_typeof(r.e->'equipment') = 'string' then public.sale_plan_program_clean(r.e->>'equipment', 60) else '' end;
            v_muscle := case when jsonb_typeof(r.e->'muscle') = 'string' then public.sale_plan_program_clean(r.e->>'muscle', 60) else '' end;
            -- The first week's days, each with how many named moves it has.
            if v_first is null then v_first := w.n - 1; end if;
            if w.n - 1 = v_first then
              if v_last_day is distinct from d.n - 1 then
                v_first_week := v_first_week || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                  'week', w.n - 1, 'day', d.n - 1, 'dayName', nullif(v_day_name, ''), 'weekday', v_weekday, 'moves', 1)));
                v_last_day := d.n - 1;
              else
                v_first_week := jsonb_set(v_first_week, array[(jsonb_array_length(v_first_week) - 1)::text, 'moves'],
                  to_jsonb((v_first_week->-1->>'moves')::integer + 1));
              end if;
            end if;
            continue when v_count >= 40;
            v_blocks := v_blocks || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
              'week', w.n - 1, 'day', d.n - 1, 'dayName', nullif(v_day_name, ''), 'weekday', v_weekday,
              'name', v_name, 'equipment', nullif(v_equipment, ''), 'muscle', nullif(v_muscle, ''), 'text', v_name)));
            v_count := v_count + 1;
          end loop;
        end loop;
      end loop;
    end loop;
  else
    -- No builder: the text outline's first 40 lines, each a string or an object's text.
    for b in select e, n
             from jsonb_array_elements(case when jsonb_typeof(p_detail->'blocks') = 'array' then p_detail->'blocks' else '[]'::jsonb end) with ordinality as x(e, n)
             where n <= 40 order by n loop
      v_line := public.sale_plan_program_line(public.sale_plan_program_clean(case jsonb_typeof(b.e)
        when 'string' then b.e #>> '{}'
        when 'object' then case when jsonb_typeof(b.e->'text') = 'string' then b.e->>'text' end
        end, 120));
      if v_line <> '' then v_blocks := v_blocks || jsonb_build_array(v_line); end if;
    end loop;
  end if;

  -- The one free video: the program's own, else the first clip among the first 40 media. Then
  -- up to seven images. A link is http(s) and at most 2048 characters.
  if jsonb_typeof(v_builder) = 'object' and jsonb_typeof(v_builder->'video') = 'string' then
    v_video := btrim(v_builder->>'video');
  end if;
  if v_video is null or v_video !~* '^https?://' or length(v_video) > 2048 then
    v_video := null;
    select x.e->>'url' into v_video
    from jsonb_array_elements(v_media_in) with ordinality as x(e, n)
    where n <= 40 and jsonb_typeof(x.e) = 'object' and x.e->'type' = '"video"'::jsonb
      and jsonb_typeof(x.e->'url') = 'string' and (x.e->>'url') ~* '^https?://' and length(x.e->>'url') <= 2048
    order by n
    limit 1;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('type', 'image', 'url', s.e->>'url') order by s.n), '[]'::jsonb) into v_images
  from (
    select x.e, x.n
    from jsonb_array_elements(v_media_in) with ordinality as x(e, n)
    where n <= 40 and jsonb_typeof(x.e) = 'object' and (x.e->'type') is distinct from '"video"'::jsonb
      and jsonb_typeof(x.e->'url') = 'string' and (x.e->>'url') ~* '^https?://' and length(x.e->>'url') <= 2048
    order by n
    limit 7
  ) s;

  v_out := jsonb_build_object(
    'preview', true,
    'blocks', v_blocks,
    'media', case when v_video is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('type', 'video', 'url', v_video)) end || v_images);
  if v_weeks is not null then v_out := v_out || jsonb_build_object('weeks', v_weeks, 'firstWeek', v_first_week); end if;
  if jsonb_typeof(p_detail->'note') = 'string' then v_out := v_out || jsonb_build_object('note', p_detail->'note'); end if;
  if jsonb_typeof(p_detail->'buildType') = 'string' then v_out := v_out || jsonb_build_object('buildType', p_detail->'buildType'); end if;
  return v_out;
end;
$$;

-- The 2026-10-09 function, unchanged for a meal plan; a program now goes through the function above.
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
  if p_kind is distinct from 'meal_plan' then return public.sale_plan_program_preview(v); end if;
  v := v - 'builder';

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

revoke all on function public.sale_plan_program_clean(text, integer) from public;
revoke all on function public.sale_plan_program_clean(text, integer) from anon;
revoke all on function public.sale_plan_program_clean(text, integer) from authenticated;
revoke all on function public.sale_plan_program_line(text) from public;
revoke all on function public.sale_plan_program_line(text) from anon;
revoke all on function public.sale_plan_program_line(text) from authenticated;
revoke all on function public.sale_plan_program_preview(jsonb) from public;
revoke all on function public.sale_plan_program_preview(jsonb) from anon;
revoke all on function public.sale_plan_program_preview(jsonb) from authenticated;
revoke all on function public.sale_plan_preview_detail(text, jsonb) from public;
revoke all on function public.sale_plan_preview_detail(text, jsonb) from anon;
revoke all on function public.sale_plan_preview_detail(text, jsonb) from authenticated;

-- =====================================================================================
-- Guard: the end state, asserted. Every RAISE takes exactly the arguments its format names.
do $guard$
declare
  f record;
  v_oid oid;
  v_secdef boolean;
  v_cfg text;
  v_src text;
  v jsonb;
begin
  for f in
    select * from (values
      ('get_coach_sale_plans', 'p_provider_role text, p_provider_id bigint', true),
      ('get_coach_sale_plans_by_user', 'p_user_id uuid', true),
      ('sale_plan_preview_detail', 'p_kind text, p_detail jsonb', false),
      ('sale_plan_program_preview', 'p_detail jsonb', false),
      ('sale_plan_program_line', 't text', false),
      ('sale_plan_program_clean', 't text, max_len integer', false)
    ) as t(name, args, public_read)
  loop
    select p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''), p.prosrc
      into v_oid, v_secdef, v_cfg, v_src
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
    if f.public_read and position('public.sale_plan_preview_detail(cp.kind, cp.detail)' in v_src) = 0 then
      raise exception '%(%) does not reduce the detail it returns', f.name, f.args;
    end if;
    if f.public_read <> has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception '%(%): anon EXECUTE must be %', f.name, f.args, f.public_read;
    end if;
    if f.public_read <> has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception '%(%): authenticated EXECUTE must be %', f.name, f.args, f.public_read;
    end if;
    v_oid := null; v_secdef := null; v_cfg := null; v_src := null;
  end loop;

  -- A program saved in the app: names, weeks and days out; the prescription, the cues, the clips
  -- and anything else in the detail stay in.
  v := public.sale_plan_preview_detail('program', '{"buildType": "program", "note": "n", "goal": "secret goal",
    "builder": {"video": "https://v.example/intro.mp4", "weeks": [
      {"days": [{"name": "Push", "weekday": 0, "blocks": [{"kind": "main", "rows": [
        {"name": "Bench press", "sets": 3, "reps": "8", "load": 61, "loadType": "kg", "cue": "secret cue", "tempo": "3010", "rest": "90s", "video": "https://clip.example/1", "equipment": "Barbell", "muscle": "Chest"},
        {"name": "  ", "sets": 3}]}]}]},
      {"days": [{"name": "Pull", "weekday": 2.0, "blocks": [{"rows": [{"name": "Row: chest-supported", "sets": 4, "reps": "10", "load": 41}]}]}]}]},
    "blocks": [{"name": "Bench press", "sets": 3, "load": 61, "cue": "secret cue", "text": "Bench press — 3 × 8 · 61 kg"}],
    "media": [{"type": "video", "url": "https://clip.example/2"}, {"type": "image", "url": "https://img.example/1.jpg"}, {"url": "javascript:alert(1)"}]}'::jsonb);
  if v <> '{"preview": true, "buildType": "program", "note": "n", "weeks": 2,
      "firstWeek": [{"week": 0, "day": 0, "dayName": "Push", "weekday": 0, "moves": 1}],
      "blocks": [{"week": 0, "day": 0, "dayName": "Push", "weekday": 0, "name": "Bench press", "equipment": "Barbell", "muscle": "Chest", "text": "Bench press"},
                 {"week": 1, "day": 0, "dayName": "Pull", "weekday": 2, "name": "Row: chest-supported", "text": "Row: chest-supported"}],
      "media": [{"type": "video", "url": "https://v.example/intro.mp4"}, {"type": "image", "url": "https://img.example/1.jpg"}]}'::jsonb then
    raise exception 'sale_plan_preview_detail: a program is not cut to its names: %', v::text;
  end if;
  -- A text outline: weekday and week lines whole, an exercise line cut to its name, and with no
  -- program video the first clip is the free one.
  v := public.sale_plan_preview_detail('program', '{"blocks": ["Mon — Push", "Week 2: Build", "Back squat — 4 × 6 · RPE 8", {"text": "Plank · 3 × 30s"}, "Curl · 3x12", "Monster walk — 3 × 10", " ", 7],
    "media": [{"type": "image", "url": "https://img.example/1.jpg"}, {"type": "video", "url": "https://clip.example/2"}, {"type": "video", "url": "https://clip.example/3"}]}'::jsonb);
  if v->'blocks' <> '["Mon — Push", "Week 2: Build", "Back squat", "Plank", "Curl", "Monster walk"]'::jsonb
     or v->'media' <> '[{"type": "video", "url": "https://clip.example/2"}, {"type": "image", "url": "https://img.example/1.jpg"}]'::jsonb
     or v ? 'note' then
    raise exception 'sale_plan_preview_detail: a text outline is not cut to its names: %', v::text;
  end if;
  -- An outline-only builder reads the text outline.
  v := public.sale_plan_preview_detail('workout', '{"builder": {"outlineOnly": true, "weeks": [{"days": [{"name": "Day 1", "blocks": [{"rows": [{"name": "Hidden"}]}]}]}]}, "blocks": ["Squat — 5 × 5"]}'::jsonb);
  if v->'blocks' <> '["Squat"]'::jsonb then
    raise exception 'sale_plan_preview_detail: an outline-only program does not read its text: %', v::text;
  end if;
  -- A meal plan as before: a uniform week keeps the legacy shape with the first two meals.
  v := public.sale_plan_preview_detail('meal_plan', '{"builder": {"weeks": []}, "media": [{"type": "video", "url": "https://clip.example/m"}], "blocks": ["Breakfast · Oats", "Lunch · Bowl", "Dinner · Fish"]}'::jsonb);
  if v ? 'builder' or v ? 'days' or (v->>'perDay') is distinct from 'false' or (v->>'blocksCount')::integer <> 3
     or jsonb_array_length(v->'blocks') <> 2 or jsonb_array_length(v->'media') <> 1 then
    raise exception 'sale_plan_preview_detail: a meal plan changed: %', v::text;
  end if;
end
$guard$;

commit;
