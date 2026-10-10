// Mutation spec for Club Shape's exterior and the arrival shot (2026-10-10): the venue drawn in code
// that stands in for the model (clubExterior.mjs), the venue model in the booth (clubShapeModel.mjs)
// and the switch that keeps the live booth inside until there is one (noraBoothState.mjs), the
// checker that holds a model to the brief (scripts/club-shape-model/check-venue.mjs), the flight in
// and its cut to Nora (noraDirector.mjs), and the set swap and the shafts' switch in the two pages
// (noraBooth.mjs, the prototype's main.mjs, cinematic.mjs). Each mutation breaks one promise
// tests/booth-exterior.test.mjs or tests/club-shape-model.test.mjs makes. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/club-shape-exterior-2026-10-10.mutations.mjs --fail-on-skipped
const EXT = 'public/newdesign/booth/clubExterior.mjs';
const DIR = 'public/newdesign/booth/noraDirector.mjs';
const HOST = 'public/newdesign/booth/noraBooth.mjs';
const PROTO = 'prototypes/nora-booth/src/main.mjs';
const CINE = 'public/newdesign/booth/cinematic.mjs';
const MODEL = 'public/newdesign/booth/clubShapeModel.mjs';
const STATE = 'public/newdesign/booth/noraBoothState.mjs';
const CHECK = 'scripts/club-shape-model/check-venue.mjs';

export default {
  test: 'node --test tests/booth-exterior.test.mjs tests/club-shape-model.test.mjs tests/booth-cinematic.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── the venue's geometry ──
    { name: 'footprintK measures against a footprint a tenth too big', file: EXT,
      find: '  return Math.hypot(dx, dz) / outline(Math.atan2(dz, dx));', replace: '  return Math.hypot(dx, dz) / (outline(Math.atan2(dz, dx)) * 1.1);' },
    { name: 'the footprint loses its pinch: an oval again', file: EXT,
      find: ' - 0.26 * bump(th, 0.22, 0.16)', replace: ' - 0 * bump(th, 0.22, 0.16)' },
    { name: 'the mouth ends on the ground, not on the rim', file: EXT,
      find: '  const y = VENUE.RIM_H + (VENUE.LIP_H - VENUE.RIM_H) * Math.pow(s, 0.7);', replace: '  const y = (VENUE.LIP_H - VENUE.RIM_H) * Math.pow(s, 0.7);' },
    { name: 'the back edge peaks on −x, not +x as in the picture', file: EXT,
      find: 'Math.pow(clamp(t, 0, 1), 0.58)', replace: 'Math.pow(clamp(t, 0, 1), 1.7)' },
    { name: 'the back edge stands no higher than the mouth', file: EXT,
      find: '  return [x, VENUE.RIM_H + (VENUE.BACK_H - VENUE.RIM_H) * edgeRise(t), z];', replace: '  return [x, VENUE.RIM_H + (VENUE.LIP_H - VENUE.RIM_H) * edgeRise(t), z];' },
    { name: 'the shell slopes down to the back, its face turned away from the bowl', file: EXT,
      find: '  const y = lerp(L[1], K[1], s * s) - VENUE.SAG', replace: '  const y = lerp(L[1], VENUE.RIM_H, s * s) - VENUE.SAG' },
    { name: 'the top terrace stops a step below the rim', file: EXT,
      find: '  return FLOOR_Y + ((i + 1) * (RIM_H - FLOOR_Y)) / TIERS;', replace: '  return FLOOR_Y + (i * (RIM_H - FLOOR_Y)) / TIERS;' },
    { name: 'the ribbon runs round the back of the rim, under the shell', file: EXT,
      find: '    const th = lerp(VENUE.TH_B, VENUE.TH_A + 2 * Math.PI, i / nRim);', replace: '    const th = lerp(VENUE.TH_A, VENUE.TH_B, i / nRim);' },
    { name: 'the ribbon stays down on the rim behind the shell', file: EXT,
      find: '    return [x + Math.cos(th) * 0.3, y + 0.35, z + Math.sin(th) * 0.3];', replace: '    return [x + Math.cos(th) * 0.3, VENUE.RIM_H + 0.35, z + Math.sin(th) * 0.3];' },
    { name: 'the ribbon leaves a gap where the edge climbs out of the rim', file: EXT,
      find: '      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 1.5) {', replace: '      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 15) {' },
    // ── the set switch ──
    { name: 'the switch hides what was already hidden, and shows it on the way back', file: EXT,
      find: '        for (const o of scene.children) if (o !== keep && o.visible) { o.visible = false; hidden.add(o); }', replace: '        for (const o of scene.children) if (o !== keep) { o.visible = false; hidden.add(o); }' },
    { name: 'the switch hides the exterior too', file: EXT,
      find: '        for (const o of scene.children) if (o !== keep && o.visible) {', replace: '        for (const o of scene.children) if (o.visible) {' },
    { name: 'the switch forgets what it hid', file: EXT,
      find: ' o.visible = false; hidden.add(o); }', replace: ' o.visible = false; }' },
    // ── the exterior's lifecycle ──
    { name: 'the exterior shows when it is not asked to', file: EXT,
      find: '    group.visible = outside;\n', replace: '    group.visible = true;\n' },
    { name: 'dispose leaves its geometries', file: EXT,
      find: "    for (const d of disposables) if (d && typeof d.dispose === 'function') d.dispose();\n", replace: '' },
    // ── the flight ──
    { name: 'the flight ends inside the stage', file: DIR,
      find: '  { p: [0, 12, -14], t: [0, 7, 15], fov: 46 },', replace: '  { p: [0, 2, 9], t: [0, 7, 15], fov: 46 },' },
    { name: 'the flight skims the rim', file: DIR,
      find: '  { p: [0, 27, -62], t: [0, 7, 10], fov: 52 },', replace: '  { p: [0, 8, -62], t: [0, 7, 10], fov: 52 },' },
    { name: 'the flight keeps one speed all the way down', file: DIR,
      find: 'cum.push(cum[i - 1] + d / (6 + Math.max(0, (p[1] + q[1]) / 2)));', replace: 'cum.push(cum[i - 1] + d);' },
    // ── the director's rules ──
    { name: 'the arrival cuts to any shot, not the drone on Nora', file: DIR,
      find: "        const next = this.shot === 'arrival' && !this.exclude.has('drone') ? 'drone'", replace: "        const next = false ? 'drone'" },
    { name: 'a glide into and out of the arrival', file: DIR,
      find: " && next !== 'arrival' && this.shot !== 'arrival';", replace: ';' },
    { name: 'reduced motion still picks the arrival', file: DIR,
      find: "    if (reducedMotion || !arrival) this.exclude.add('arrival');\n", replace: "    if (!arrival) this.exclude.add('arrival');\n" },
    { name: 'reduced motion opens on the arrival', file: DIR,
      find: "this.shot = reducedMotion || !arrival ? 'club' : 'arrival';", replace: "this.shot = !arrival ? 'club' : 'arrival';" },
    { name: 'a booth with nowhere to fly still picks the arrival', file: DIR,
      find: "    if (reducedMotion || !arrival) this.exclude.add('arrival');\n", replace: "    if (reducedMotion) this.exclude.add('arrival');\n" },
    { name: 'a booth with nowhere to fly opens on the arrival', file: DIR,
      find: "this.shot = reducedMotion || !arrival ? 'club' : 'arrival';", replace: "this.shot = reducedMotion ? 'club' : 'arrival';" },
    { name: 'a restarted clock restarts the shot', file: DIR,
      find: '    this.shotStartBar = bar - done;\n', replace: '    this.shotStartBar = bar;\n' },
    { name: 'a restarted clock carries a finished shot past its end', file: DIR,
      find: 'const done = clamp(this._bar - this.shotStartBar, 0, this.shotBars);', replace: 'const done = Math.max(0, this._bar - this.shotStartBar);' },
    { name: 'the director forgets the bar it saw', file: DIR,
      find: '    const whole = Math.floor(bar);\n    this._bar = bar;\n', replace: '    const whole = Math.floor(bar);\n' },
    // ── the venue model in the booth ──
    { name: 'the ribbon stays under the bloom threshold', file: MODEL,
      find: '    const k = RIBBON_GLOW * (RM ? 1', replace: '    const k = 1 * (RM ? 1' },
    { name: 'the ribbon ignores the music', file: MODEL,
      find: ' : 1 + 0.25 * Math.max(0, Math.min(1, level || 0)));', replace: ' : 1 + 0 * Math.max(0, Math.min(1, level || 0)));' },
    { name: 'the ribbon pulses under reduced motion', file: MODEL,
      find: '    const k = RIBBON_GLOW * (RM ? 1 : ', replace: '    const k = RIBBON_GLOW * (false ? 1 : ' },
    { name: 'the ribbon glows in a material another part shares', file: MODEL,
      find: '        const k = own(src.clone());', replace: '        const k = src;' },
    { name: 'the model keeps its own blank screen', file: MODEL,
      find: '    for (const m of meshesOf(screen)) m.material = mat;\n', replace: '' },
    { name: 'a second sea under the model\'s own water', file: MODEL,
      find: '  if (!findNamed(model, VENUE_NODES.water)) {', replace: '  if (true) {' },
    { name: 'the venue model shows when it is not asked to', file: MODEL,
      find: '    group.visible = outside;\n', replace: '    group.visible = true;\n' },
    { name: 'the venue model leaks what it was given', file: MODEL,
      find: '      for (const d of bag) if (d && typeof d.dispose === \'function\') d.dispose();\n', replace: '' },
    { name: 'the live booth flies in to the stand-in', file: STATE,
      find: 'export const CLUB_SHAPE_MODEL = Object.freeze({ path: null, desktop: null });', replace: "export const CLUB_SHAPE_MODEL = Object.freeze({ path: 'club-shape/venue.glb', desktop: null });" },
    { name: 'a desktop gets the phone file', file: STATE,
      find: "  const path = quality === 'high' && model.desktop ? model.desktop : model.path;", replace: '  const path = model.path;' },
    // ── the checker ──
    { name: 'the checker lets a screen in centimetres through', file: CHECK,
      find: '      if (off > SCREEN.tol || ', replace: '      if (false && ' },
    { name: 'the checker lets a flat ribbon through', file: CHECK,
      find: '      if (b.max[1] < F.rise[0] || ', replace: '      if (false && ' },
    { name: 'the checker lets a lit material through', file: CHECK,
      find: '    if (!unlit && !emissive) errors.push(', replace: '    if (false) errors.push(' },
    { name: 'the checker lets Draco through', file: CHECK,
      find: '    if (UNDECODABLE[x]) errors.push(', replace: '    if (false) errors.push(' },
    { name: 'the checker ignores the triangle budget', file: CHECK,
      find: '  if (tris > budget.triangles) errors.push(', replace: '  if (false) errors.push(' },
    { name: 'the checker ignores the texture budget', file: CHECK,
      find: '  if (maxPx > budget.maxTexturePx) errors.push(', replace: '  if (false) errors.push(' },
    { name: 'the checker turns a node the wrong way', file: CHECK,
      find: '    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,', replace: '    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z + y * w)) * sx, 0,' },
    { name: 'the checker applies a child before its parent', file: CHECK,
      find: '    const W = mul(M, localMatrix(nodes[i] || {}));', replace: '    const W = mul(localMatrix(nodes[i] || {}), M);' },
    { name: 'the checker reads a normalised accessor as floats', file: CHECK,
      find: '  const k = acc.normalized && NORM[acc.componentType] ? NORM[acc.componentType] : 1;', replace: '  const k = 1;' },
    // ── the pages and the lens ──
    { name: 'the booth leaves the hall standing in the exterior', file: HOST,
      find: '        sets.apply(out);\n', replace: '' },
    { name: 'the booth flies in with nowhere to fly', file: HOST,
      find: "exclude: portrait ? [] : ['face'], arrival: !!exterior });", replace: "exclude: portrait ? [] : ['face'] });" },
    { name: 'the booth builds the rejected stand-in', file: HOST,
      find: '        exterior = createVenueModel({ THREE, scene: g.scene, quality, reducedMotion });', replace: '        exterior = createExterior({ THREE, scene: g.scene, quality, reducedMotion });' },
    { name: 'a viewer locks the arrival with no outside', file: HOST,
      find: " && (mode !== 'arrival' || exterior)) ? mode : 'auto';", replace: ") ? mode : 'auto';" },
    { name: 'the booth keeps the hall camera range outside', file: HOST,
      find: 'camera.near = out ? EXTERIOR_DIMS.NEAR : CAM_NEAR;', replace: 'camera.near = CAM_NEAR;' },
    { name: 'the booth shines the LED wall\'s shafts over the exterior', file: HOST,
      find: 'level: bands.level, drop, shafts: !outside });', replace: 'level: bands.level, drop });' },
    { name: 'the preview counts a free camera as outside', file: PROTO,
      find: "const out = director.mode !== 'free' && director.shot === 'arrival';", replace: "const out = director.shot === 'arrival';" },
    { name: 'the shafts ignore their switch', file: CINE,
      find: '    uDof.uShaft.value = shafts ? vis * (0.55 + 0.35 * level + 0.25 * drop) : 0;', replace: '    uDof.uShaft.value = vis * (0.55 + 0.35 * level + 0.25 * drop);' },
    { name: 'the arrival has no lens', file: CINE,
      find: '  arrival: { aperture: 0.6, maxCoc: 1.5 },\n', replace: '' },
  ],
};
