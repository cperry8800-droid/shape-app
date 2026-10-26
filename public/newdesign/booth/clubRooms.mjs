// clubRooms.mjs — Club Shape's two side rooms, as numbers: where they open off the hall and how big
// they are. Pure (no three), so the venue that builds them (clubVenue.mjs, 2c), the director that
// films them (noraDirector.mjs) and the tests all read the same figures.
//
// Owner, 2026-10-26: "i also want to create spearate side rooms/lounges and views of those". On the
// left, the VIP lounge; on the right, the cocktail bar. Each opens off the dance floor through the
// ground tier's fourth column bay of eight, where two private boxes gave way to a doorway.
//
// Venue frame (clubVenue.mjs): metres, +y up, the stage at +z; the hall's outer walls stand at
// |x| 14 … 14.3, the lounge glass at |x| 12.2, the floor at y −0.66 and the ground tier's slab
// underside at y 3.15.

export const SIDE_ROOMS = Object.freeze({
  // the doorway: between the lounge-glass columns at the bay lines z −25.39 and −19.13 (bay 3 of 8
  // from the far glass, z −44.2 … 5.95), full height under the ground tier's slab
  door: Object.freeze({ bay: 3, z0: -25.394, z1: -19.125 }),
  x0: 14.3,       // each room starts at the hall wall's outside face: x = side · (x0 + d)
  depth: 9.5,     // d from 0 (the hall wall) to the room's back wall
  z0: -30.26,     // its length along the hall, centred on the doorway
  z1: -14.26,
  floorY: -0.66,
  ceilY: 3.15,    // level with the slab underside, so the doorway is the room's own height
  lounge: -1,     // the VIP lounge is on the left (−x) …
  bar: 1,         // … the cocktail bar on the right (+x)
});

/** World x of a point `d` metres into the room on side `s` (−1 the lounge, +1 the bar). */
export const roomX = (s, d) => s * (SIDE_ROOMS.x0 + d);

/** Is (x, y, z) inside a side room's walls (with `pad` metres to spare from each)? */
export function inSideRoom(x, y, z, pad = 0) {
  const R = SIDE_ROOMS, ax = Math.abs(x);
  return ax > R.x0 + pad && ax < R.x0 + R.depth - pad && z > R.z0 + pad && z < R.z1 - pad && y > R.floorY + pad && y < R.ceilY - pad;
}
