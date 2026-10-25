// WHETHER THE PLAN READ ANSWERED FOR ONE PART. /api/client/plan holds two parts, `training` and
// `meals`. ShapePlan.get resolves null when the request fails, and the route sends `read: false` on a
// part whose table read failed (Codex P2 on #2449). Both used to look like "no plan", so Train offered
// a member with a coach's plan the Build door, and Eat said "No meals planned". A screen asks this
// before it treats a missing plan as none. A server that predates `read` counts as read.
export function bsPlanPartRead(p, part) {
  const x = p && typeof p === 'object' && p.ok !== false ? p[part] : null;
  return !!(x && typeof x === 'object' && x.read !== false);
}

// The parts the weekly check-in asks adherence for: a part with a plan, and a part the read could
// not answer, so a failed read asks every question (as a check-in did before the plan was read).
export function bsPlanCheckinParts(p) {
  const ask = (part) => !bsPlanPartRead(p, part) || !!p[part].hasPlan;
  return { training: ask('training'), nutrition: ask('meals') };
}
