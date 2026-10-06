// One reading of a logged set's load, in pounds.
//
// The train and progress APIs report weight in pounds (volume7dLb, totalVolumeLb,
// the strength series, the windowed PRs), and the pages convert to the reader's
// unit. A set is logged in the member's own unit, recorded in
// `workout_set_logs.load_unit`: the app's logger writes it (`_setLogUnit` in
// shapeBackend.js) and older rows were backfilled (2026-06-26). So a load is
// converted to pounds BEFORE it is summed or compared. Adding the typed numbers
// called 100 kg "100 lb", and a member logging both units had kilograms and pounds
// added together. The factor is the one `get_my_lift_prs` uses (2026-09-10).
export const KG_PER_LB = 0.45359237;

export function setLoadUnit(unit: unknown): 'kg' | 'lb' {
  return String(unit ?? 'lb').toLowerCase().includes('kg') ? 'kg' : 'lb';
}

export function setLoadLb(load: number, unit: unknown): number {
  return setLoadUnit(unit) === 'kg' ? load / KG_PER_LB : load;
}
