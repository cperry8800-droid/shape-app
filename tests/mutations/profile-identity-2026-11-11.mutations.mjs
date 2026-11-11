// Mutation spec for one Edit profile (You on About), the dragged cover, followers on the stage and the
// name migration (2026-11-11-identity-name-location.sql): each mutation undoes one guard, and the suites
// below must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/profile-identity-2026-11-11.mutations.mjs --fail-on-skipped
const SQL = 'supabase-migrations/2026-11-11-identity-name-location.sql';
const PC = 'public/newdesign/profileCustom.mjs';
const DK = 'public/newdesign/livingDesktop.jsx';
const CPW = 'public/newdesign/coachProfileWeb.jsx';
const LPP = 'public/newdesign/livingProfilePage.jsx';
const APP = 'mobile-app/src/broadsheet/BSTrainerProfile.jsx';
const MIY = 'mobile-app/src/broadsheet/BSMakeItYours.jsx';

export default {
  test: 'node --test tests/identity-name-location-migration.test.mjs tests/cover-position.test.mjs tests/profile-identity-web.test.mjs tests/coach-spotlight.test.mjs tests/web-coach-climb.test.mjs tests/screenshot-fit.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // The migration.
    { name: 'the sync copies an overlong name', file: SQL,
      find: "  if n = '' or char_length(n) > 80 then return new; end if;",
      replace: "  if n = '' then return new; end if;" },
    { name: 'a photo save rewrites the name', file: SQL,
      find: "  if tg_op = 'UPDATE' and btrim(coalesce(old.data->>'name', '')) = n then return new; end if;\n",
      replace: '' },
    { name: 'the sync renames every trainer listing', file: SQL,
      find: '  update public.trainers set name = n where owner_id = new.user_id and name is distinct from n;',
      replace: '  update public.trainers set name = n where name is distinct from n;' },
    { name: 'the sync runs with elevated rights', file: SQL,
      find: 'returns trigger\nlanguage plpgsql\n',
      replace: 'returns trigger\nlanguage plpgsql\nsecurity definer\n' },
    { name: 'a locked card shows the location', file: SQL,
      find: "    case when (select can_view from acc) then nullif(btrim((select d->>'location' from ident)), '') end\n",
      replace: "    nullif(btrim((select d->>'location' from ident)), '')\n" },
    { name: 'the card loses its grant', file: SQL,
      find: 'grant execute on function public.get_public_profile(uuid) to authenticated;\n',
      replace: '' },
    { name: 'the backfill copies an overlong name', file: SQL,
      find: "   and char_length(btrim(g.data->>'name')) <= 80\n",
      replace: '' },
    // The dragged spot.
    { name: 'a dragged spot past the frame is kept', file: PC,
      find: '  return { x: Math.max(0, Math.min(100, Math.round(x))), y: Math.max(0, Math.min(100, Math.round(y))) };',
      replace: '  return { x: Math.round(x), y: Math.round(y) };' },
    { name: 'every dragged spot is the centre stop', file: PC,
      find: "  return p.y < 36 ? 'top' : p.y > 65 ? 'bottom' : 'center';",
      replace: "  return 'center';" },
    { name: 'the look drops the dragged spot', file: PC,
      find: '  if (pos) out.pos = pos;\n',
      replace: '' },
    { name: 'a cover ignores the dragged spot', file: PC,
      find: '  if (p) return `${p.x}% ${p.y}%`;\n',
      replace: '' },
    { name: 'Reset keeps the old spot', file: DK,
      find: '    else delete out.pos;\n',
      replace: '' },
    { name: 'a dragged spot leaves the old stop', file: DK,
      find: '    if (pos) { out.pos = pos; out.focus = plib && plib.bsLookFocusOf ? plib.bsLookFocusOf(pos) : out.focus; }',
      replace: '    if (pos) { out.pos = pos; }' },
    { name: 'the app editor keeps a spot for a new stop', file: MIY,
      find: '      const pos = look.focus === seed.look.focus ? bsLookPos(initial && initial.look && initial.look.pos) : null;',
      replace: '      const pos = bsLookPos(initial && initial.look && initial.look.pos);' },
    // You on About.
    { name: 'every identity field is written', file: DK,
      find: '    const idPatch = idState === "ready" && idf ? Object.fromEntries([...idTouched.current].map((k) => [k, idf[k]])) : {};',
      replace: '    const idPatch = idState === "ready" && idf ? { ...idf } : {};' },
    { name: 'the photo is never saved', file: DK,
      find: '        if (photoTouched) await lib.saveAccountDocPatch(window.shapeDb, "client_identity", { photo: photo || null }, uid);\n',
      replace: '' },
    { name: 'a save does not announce the identity', file: DK,
      find: '      try { window.dispatchEvent(new Event("shape:identity")); } catch (e) {}\n',
      replace: '' },
    { name: 'an oversized photo is accepted', file: DK,
      find: ' && v.length <= 400000 ? v : null;',
      replace: ' ? v : null;' },
    { name: 'the profile page does not read again on an identity save', file: LPP,
      find: 'window.addEventListener("shape:identity", again);',
      replace: '' },
    // The coach page.
    { name: 'the website quote is the sign-up goal again', file: CPW,
      find: '(live ? (customBio || (row && (row.goal || row.bio)))',
      replace: '(live ? ((row && (row.goal || row.bio)))' },
    { name: 'the app quote is the sign-up goal again', file: APP,
      find: '(customBio || (live && live.goal) || (live && live.bio) || person.bio)',
      replace: '((live && live.goal) || (live && live.bio) || person.bio)' },
    { name: 'no listing portrait without an account photo', file: CPW,
      find: '(row && row.avatar) || media.portrait || null',
      replace: '(row && row.avatar) || null' },
    { name: 'the edit link does not open the editor', file: CPW,
      find: '      if (params.get("edit") !== "profile") return;\n',
      replace: '      return;\n' },
    { name: 'no followers on the stage', file: CPW,
      find: '  const followRow = live && follow ? (',
      replace: '  const followRow = false ? (' },
    { name: 'the dashboard stage ignores a short window', file: CPW,
      find: '      .cpw[data-in-dash] .cpw-stage-grid{grid-template-columns:clamp(200px,min(max(230px,19vw),33.4vh),300px) minmax(0,1fr);',
      replace: '      .cpw[data-in-dash] .cpw-stage-grid{grid-template-columns:clamp(230px,19vw,300px) minmax(0,1fr);' },
  ],
};
