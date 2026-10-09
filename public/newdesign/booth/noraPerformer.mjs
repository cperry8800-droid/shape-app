// Nora the performer: poses a loaded VRM as a DJ working real gear.
//
// What this module owns, and why each piece exists:
//   • STAGE LOOK — the VRM ships as MToon (cel shading + ink outlines), which is the single
//     biggest reason Nora read as "an avatar". Club light on physically-based materials
//     reads as a person in a booth, so every MToon material is swapped for a
//     MeshStandardMaterial that keeps its texture, and the outline pass is dropped.
//   • OUTFIT + HEADPHONES — a dark outfit and a pair of over-ear DJ headphones are the two
//     cheapest cues that say "DJ" before any motion does.
//   • ARM IK — an analytic two-bone solver on the NORMALIZED humanoid bones, so a hand lands
//     ON the jog / fader / knob the choreography names, instead of floating near it.
//   • GROOVE — head nod, knee bounce and a weight shift locked to the measured beat, plus an
//     automatic forward lean when a target is beyond the arm's reach (real DJs lean in).
//
// Pure-ish: no DOM, no Math.random / Date.now. The caller passes world-space targets and a
// beat phase every frame. Works with @pixiv/three-vrm 3.x.

const DEG = Math.PI / 180;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Critically damped spring toward a target (Vector3), per-hand state.
function springTo(state, target, dt, omega) {
  // x'' = -2ωx' - ω²(x - target)
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const det = 1 / (f + hhoo);
  for (const k of ['x', 'y', 'z']) {
    const x = state.pos[k], v = state.vel[k], xt = target[k];
    const detX = f * x + dt * v + hhoo * xt;
    const detV = v + hoo * (xt - x);
    state.pos[k] = detX * det;
    state.vel[k] = detV * det;
  }
}

// The same spring on one number ({ x, v }).
const HAND_VMAX = 1.4; // m/s — a relaxed reach, not a slap
const HAND_AMAX = 14;  // m/s² — from rest to full reach speed in about a tenth of a second

function spring1(st, target, dt, omega) {
  const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo, det = 1 / (f + hhoo);
  const x = st.x, v = st.v;
  st.x = (f * x + dt * v + hhoo * target) * det;
  st.v = (v + hoo * (target - x)) * det;
}

/**
 * Swap MToon for physically-based materials so club lighting reads as skin, cloth and hair.
 * Returns a restore() that puts the original materials back (the booth can toggle looks).
 */
// Skin's light wraps a little past the terminator and warms as it goes (light scatters under skin);
// a hard Lambert cut-off is one of the things that reads as plastic. Applied to the diffuse term of
// every direct light (spots, points); specular keeps its own hard dotNL.
function wrapDiffuse(THREE, wrap, tint) {
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  const line = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );';
  if (chunk.split(line).length !== 2) return null; // three moved the line: skip the effect, never break the shader
  const t = tint.map((v) => v.toFixed(3)).join(', ');
  return chunk.replace(line, [
    'float noraNL = dot( geometryNormal, directLight.direction );',
    'vec3 noraIrr = saturate( ( noraNL + ' + wrap.toFixed(3) + ' ) / ' + (1 + wrap).toFixed(3) + ' ) * directLight.color;',
    '#ifdef USE_SHEEN',
    '  noraIrr *= sheenEnergyComp;',
    '#endif',
    'noraIrr *= mix( vec3( ' + t + ' ), vec3( 1.0 ), smoothstep( -0.15, 0.45, noraNL ) );',
    'reflectedLight.directDiffuse += noraIrr * BRDF_Lambert( material.diffuseContribution );',
  ].join('\n'));
}

export function applyStageLook(THREE, root, { outfit = 0x16181b, hairTint = null, quality = 'high', ceiling = false } = {}) {
  const hi = quality !== 'low';
  const skinChunk = wrapDiffuse(THREE, 0.32, [1.0, 0.6, 0.5]);
  const clothChunk = wrapDiffuse(THREE, 0.18, [1.0, 1.0, 1.0]);
  const saved = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const orig = obj.material;
    const list = Array.isArray(orig) ? orig : [orig];
    const name = (list[0] && list[0].name) || '';
    // MToon's outline is a second material entry drawn with an inverted hull.
    const surface = list.find((m) => m && !/outline/i.test(m.name || '')) || list[0];
    const isCloth = /CLOTH/i.test(name);
    const isSkin = /SKIN/i.test(name);
    const isHair = /HAIR/i.test(name);
    const isEye = /EYE|FACE_?(Eyeline|Brow)|Eyeline|Brow|Highlight/i.test(name);
    // High tier: physical materials for the sheen (soft grazing light on skin peach-fuzz, hair and
    // cotton). The phone tier keeps MeshStandard, so it pays nothing for this batch.
    const Mat = hi && (isSkin || isHair || isCloth) ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new Mat({
      map: surface.map || null,
      color: new THREE.Color(1, 1, 1),
      roughness: isSkin ? 0.56 : isHair ? 0.42 : isCloth ? 0.86 : 0.7,
      metalness: 0,
      transparent: !!surface.transparent,
      alphaTest: surface.alphaTest || 0,
      depthWrite: surface.depthWrite !== false,
      side: surface.side,
      normalMap: surface.normalMap || null,
    });
    if (isCloth) m.color.setHex(outfit);             // dark booth outfit over the texture detail
    if (isHair && hairTint != null) m.color.setHex(hairTint);
    if (isSkin) { m.color.setRGB(0.72, 0.56, 0.47); } // the texture is anime-pale (~0.95): pull it down to a real skin albedo so a club key light doesn't blow it out to white under bloom
    if (isEye) { m.roughness = 0.3; }
    if (m.isMeshPhysicalMaterial) {
      if (isSkin) { m.specularIntensity = 0.6; m.sheen = 0.45; m.sheenRoughness = 0.55; m.sheenColor = new THREE.Color(0.95, 0.62, 0.5); }
      if (isHair) { m.sheen = 0.14; m.sheenRoughness = 0.45; m.sheenColor = new THREE.Color(0.4, 0.28, 0.2); m.roughness = 0.5; } // more sheen read as blonde under the rims from behind
      if (isCloth) { m.sheen = 0.6; m.sheenRoughness = 0.75; m.sheenColor = new THREE.Color(0.3, 0.31, 0.34); }
    }
    // A soft ceiling on Nora's own brightness. The club's key, top and screen lights stack on the
    // backs of her hands and her crown, and anything above the bloom threshold (0.82) turns into a
    // white glow — which is what made her read as a lit mannequin. Past a knee (0.55) the
    // brightness is compressed hard (slope 0.15), which leaves the room's lighting as tuned and
    // keeps her out of the bloom. Skin gets one more thing: the tone-mapper greys out anything
    // this bright, so a hand on the jog under three stage lights came out mannequin-white even
    // when clamped — the brightest skin is pulled toward the skin albedo instead, so it stays a
    // pale tan. Hair and eyes keep their hue (no pull), or the eye whites would go pink.
    // ⚠ RETIRED BY THE 2026-09-29 RELIGHT, kept behind { ceiling: true } for comparison: once the
    // truss light stopped landing square on the backs of her hands, her skin sits well under the bloom
    // threshold without a clamp (measured with handprobe.cjs), and a clamp flattens real highlights.
    const warm = isSkin ? 0.65 : 0.0;
    const wrapChunk = isSkin ? skinChunk : isCloth ? clothChunk : null;
    m.onBeforeCompile = (sh) => {
      if (wrapChunk) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', wrapChunk);
      if (ceiling) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
        '#include <opaque_fragment>\n{ float noraL = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722)); if (noraL > 0.55) { float noraK = 0.55 + (noraL - 0.55) * 0.15; vec3 noraC = gl_FragColor.rgb * (noraK / noraL); float noraW = smoothstep(0.55, 1.3, noraL) * ' + warm.toFixed(2) + '; noraC = mix(noraC, vec3(0.76, 0.59, 0.50) * (noraK / 0.62), noraW); gl_FragColor.rgb = noraC; } }');
    };
    m.customProgramCacheKey = () => 'noraStage6-' + (ceiling ? 'ceil' + warm : 'free') + (wrapChunk ? (isSkin ? '-wS' : '-wC') : '');
    m.name = name + '_stage';
    saved.push([obj, orig, obj.geometry.groups.slice()]);
    obj.material = m;
    // Drop the outline group so one material covers the whole mesh.
    if (Array.isArray(orig) && obj.geometry.groups.length > 1) obj.geometry.clearGroups();
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
  return function restore() {
    for (const [obj, orig, groups] of saved) {
      obj.material.dispose();
      obj.material = orig;
      obj.geometry.clearGroups();
      for (const g of groups) obj.geometry.addGroup(g.start, g.count, g.materialIndex);
    }
  };
}

/** Over-ear DJ headphones, parented to the head bone. */
function buildHeadphones(THREE, headNode, scale) {
  const g = new THREE.Group();
  g.name = 'NoraHeadphones';
  const shell = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.35, metalness: 0.2 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.95 });
  const band = new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.5, metalness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.3, metalness: 0.9 });
  const R = 0.098; // headband radius (normalized-rig metres, pre-scale)
  const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0085, 10, 48, Math.PI * 1.02), band);
  arc.rotation.set(0, Math.PI / 2, 0); // arc spans left↔right over the crown
  arc.rotation.z = -0.01;
  arc.position.set(0, 0.075, 0.0);
  arc.rotation.x = 0; // stands in the Y-X plane after the Y turn
  arc.scale.set(1, 1.08, 1);
  g.add(arc);
  const cups = [];
  for (const side of [1, -1]) {
    const cup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.047, 0.03, 28), shell);
    body.rotation.z = Math.PI / 2;
    const cushion = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.012, 10, 28), pad);
    cushion.rotation.y = Math.PI / 2;
    cushion.position.x = -side * 0.016;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.0025, 6, 28), trim);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * 0.016;
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.012), trim);
    yoke.position.set(side * 0.004, 0.045, 0);
    cup.add(body, cushion, ring, yoke);
    cup.position.set(side * 0.092, 0.0, 0.0);
    g.add(cup);
    cups.push(cup);
  }
  // Classic one-ear look: the LEFT cup (character's left = +X in the normalized rig) is
  // pushed back off the ear so she can hear the room.
  cups[0].rotation.z = -0.35;
  cups[0].position.set(0.098, 0.018, -0.03);
  g.position.set(0, 0.058, 0.004);
  headNode.add(g);
  g.userData.dispose = () => {
    g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    shell.dispose(); pad.dispose(); band.dispose(); trim.dispose();
  };
  g.userData.cups = cups;
  return g;
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const SEGS = ['Proximal', 'Intermediate', 'Distal'];

export class NoraPerformer {
  /**
   * @param {object} o
   * @param {typeof import('three')} o.THREE
   * @param {object} o.vrm        a loaded VRM (three-vrm 3.x)
   * @param {number} [o.height]   target standing height in metres
   * @param {{x:number,y:number,z:number}} [o.stand]  floor position of the hips' projection
   */
  constructor({ THREE, vrm, height = 1.7, stand = { x: 0, y: 0, z: 0.36 }, look = 'stage', headphones = true, quality = 'high', ceiling = false }) {
    this.THREE = THREE;
    this.vrm = vrm;
    const h = vrm.humanoid;
    this.bone = (n) => h.getNormalizedBoneNode(n);
    // Native height: head bone + ~the head itself.
    const head = this.bone('head');
    vrm.scene.updateMatrixWorld(true);
    const hp = new THREE.Vector3(); head.getWorldPosition(hp);
    const native = (hp.y - vrm.scene.position.y) / vrm.scene.scale.y + 0.16;
    this.scale = height / native;
    vrm.scene.scale.setScalar(this.scale);
    vrm.scene.rotation.y = Math.PI;            // VRM1 fronts +Z; the DJ faces −Z (the crowd)
    vrm.scene.position.set(stand.x, stand.y, stand.z);
    this.stand = stand;
    this._restoreLook = look === 'stage' ? applyStageLook(THREE, vrm.scene, { quality, ceiling }) : null;
    this.headphones = headphones ? buildHeadphones(THREE, head, this.scale) : null;

    // Rest bone lengths (normalized rig, pre-scale), read once.
    this.arm = {};
    for (const side of ['left', 'right']) {
      const U = this.bone(side + 'UpperArm'), L = this.bone(side + 'LowerArm'), H = this.bone(side + 'Hand');
      this.arm[side] = {
        U, L, H,
        l1: L.position.length(), l2: H.position.length(),
        r1: L.position.clone().normalize(), r2: H.position.clone().normalize(),
        state: null, // spring state, world space
        grip: 0,
      };
    }
    this._v = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => new THREE.Vector3());
    this._q = [0, 1, 2, 3].map(() => new THREE.Quaternion());
    this._m = new THREE.Matrix4();
    this.lean = 0.12;        // radians forward, current
    this.lookTarget = new THREE.Object3D();
    this.lookTarget.name = 'NoraLookTarget';
    vrm.scene.parent ? vrm.scene.parent.add(this.lookTarget) : null;
    if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;
    this.expr = { happy: 0, relaxed: 0.25, blink: 0 };
    // Smoothed motion state: nothing on the body is assigned straight from a signal, so a
    // change in energy, a tempo re-settle or a new look target eases in instead of snapping.
    this.sm = {
      dip: { x: 0, v: 0 }, sway: { x: 0, v: 0 }, energy: { x: 0.4, v: 0 }, drop: { x: 0, v: 0 },
      yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, nod: { x: 0, v: 0 },
      shrug: { left: 0, right: 0 },
    };
  }

  /** Attach the look target to the scene the VRM lives in (call after scene.add(vrm.scene)). */
  attach(scene) { if (!this.lookTarget.parent) scene.add(this.lookTarget); }

  /**
   * One frame.
   * @param {number} dt seconds
   * @param {object} f
   *   f.t          seconds (monotonic)
   *   f.beat       float beats (from the beat clock), used for the groove phase
   *   f.kick       0..1 kick envelope
   *   f.energy     0..1 overall level (drives groove amplitude)
   *   f.hands      { left:{ pos:Vector3 (contact point, world), palm:'down'|'pinch'|'ear'|'air'|'rest', grip:0..1 }, right:{…} }
   *   f.look       Vector3 world point to look at
   *   f.drop       0..1 (hands-up energy)
   */
  update(dt, f) {
    const THREE = this.THREE;
    const vrm = this.vrm;
    const b = this.bone;
    const sm = this.sm;
    const sdt = Math.min(dt, 0.05);                       // springs never take a huge step (a stalled tab)
    const t = f.t || 0;
    const beat = f.beat || 0;
    const ph = beat - Math.floor(beat);                   // 0..1 within the beat
    spring1(sm.energy, clamp(f.energy == null ? 0.6 : f.energy, 0, 1), sdt, 3);
    spring1(sm.drop, f.drop || 0, sdt, 4);
    const energy = sm.energy.x, drop = sm.drop.x;

    // ── The groove. ──────────────────────────────────────────────────────────
    // A body on a house beat does not twitch on the kick: it settles INTO the beat and rises
    // out of it, so the dip is a raised cosine with its low point just after the beat, and
    // the whole thing is smoothed once more so a tempo re-settle cannot make it jump.
    const dipRaw = 0.5 + 0.5 * Math.cos((ph - 0.07) * Math.PI * 2);
    spring1(sm.dip, dipRaw, sdt, 30);
    spring1(sm.sway, Math.sin(beat * Math.PI), sdt, 12);   // weight shift, one side per beat
    const dip = sm.dip.x, sway = sm.sway.x;
    const amp = 0.45 + 0.55 * energy + 0.35 * drop;         // how much of the groove the room earns
    // Breath (14 a minute) and a slow drift nobody notices but everyone misses when it is gone.
    const breath = Math.sin(t * 1.5);
    const drift = 0.5 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.91 + 1.7);

    // ── Reach: lean in when a target is beyond the arm. ──────────────────────
    const needLean = this._leanFor(f.hands);
    this.lean += (needLean - this.lean) * clamp(dt * 3, 0, 1);

    // ── Body (normalized bones, VRM-local: +Z forward, +X = her left). ────────
    const hips = b('hips'), spine = b('spine'), chest = b('chest'), upper = b('upperChest'), neck = b('neck'), head = b('head');
    hips.userData.restY ?? (hips.userData.restY = hips.position.y);
    hips.userData.restX ?? (hips.userData.restX = hips.position.x);
    hips.position.y = hips.userData.restY - 0.012 - dip * 0.022 * amp;
    hips.position.x = hips.userData.restX + sway * 0.012 * amp;   // the weight actually moves
    hips.rotation.set(dip * 0.012 * amp, sway * 0.07 * amp, sway * 0.035 * amp);
    spine.rotation.set(this.lean * 0.45 + dip * 0.015 * amp, -sway * 0.04 * amp, -sway * 0.02 * amp + drift * 0.01);
    chest.rotation.set(this.lean * 0.35 + breath * 0.012, -sway * 0.02 * amp, 0);
    // shoulders counter the hips (the twist that reads as dancing rather than rocking)
    if (upper) upper.rotation.set(this.lean * 0.2 + dip * 0.01 * amp, -sway * 0.05 * amp, sway * 0.01 * amp);
    // Knees give on the beat; the loaded leg gives a little more.
    for (const s of ['left', 'right']) {
      const ul = b(s + 'UpperLeg'), ll = b(s + 'LowerLeg'), ft = b(s + 'Foot');
      const load = s === 'left' ? Math.max(0, sway) : Math.max(0, -sway);
      const k = 0.08 + dip * 0.085 * amp + load * 0.04 * amp + this.lean * 0.3;
      ul.rotation.set(-k, 0, 0);
      ll.rotation.set(k * 2, 0, 0);
      ft.rotation.set(-k, 0, 0);
    }
    // Shoulders shrug toward a high reach (headphone lift, hands in the air).
    for (const s of ['left', 'right']) {
      const sh = b(s + 'Shoulder'); if (!sh) continue;
      const h = f.hands && f.hands[s];
      const want = h && (h.palm === 'ear' || h.palm === 'air') ? (h.palm === 'air' ? 0.22 : 0.12) : 0;
      sm.shrug[s] += (want - sm.shrug[s]) * clamp(dt * 4, 0, 1);
      sh.rotation.set(0, 0, (s === 'left' ? 1 : -1) * (sm.shrug[s] + breath * 0.006));
    }

    // ── Head: eased toward what she is doing, nodding into the beat. ─────────
    vrm.scene.updateMatrixWorld(true);
    const lookW = f.look || this._v[7].set(0, 1.2, -4);
    this.lookTarget.position.copy(lookW);
    const hw = this._v[0]; neck.getWorldPosition(hw);
    const toL = this._v[1].copy(lookW).sub(hw);
    const pq = this._q[0]; neck.parent.getWorldQuaternion(pq);
    toL.applyQuaternion(pq.invert());
    // A DJ over the gear glances DOWN at it far more than sideways, so the turn is scaled and
    // the pitch capped: a head pitched straight down turns a crowd-side shot into a scalp.
    const yawT = clamp(Math.atan2(toL.x, toL.z) * 0.62, -38 * DEG, 38 * DEG);
    const pitchT = clamp(Math.atan2(-toL.y, Math.hypot(toL.x, toL.z)), -20 * DEG, 36 * DEG);
    spring1(sm.yaw, yawT + drift * 0.03, sdt, 6);           // a glance takes about a third of a second
    spring1(sm.pitch, pitchT, sdt, 6);
    spring1(sm.nod, dip * (0.05 + 0.07 * energy + 0.05 * drop), sdt, 20);
    const net = sm.pitch.x - this.lean * 0.8;               // the lean already tips the head; keep the face up
    neck.rotation.set(net * 0.4, sm.yaw.x * 0.45, 0);
    head.rotation.set(net * 0.6 + sm.nod.x, sm.yaw.x * 0.55 + drift * 0.015, -sway * 0.035 * amp);

    vrm.scene.updateMatrixWorld(true);

    // ── Arms ─────────────────────────────────────────────────────────────────
    this._groove = { dip, sway, amp, energy, t };
    for (const side of ['left', 'right']) this._solveArm(side, f.hands ? f.hands[side] : null, dt, f);

    // ── Face ─────────────────────────────────────────────────────────────────
    const em = vrm.expressionManager;
    if (em) {
      const blinkCycle = (t * 1000) % 3700;
      const blink = blinkCycle < 110 ? 1 : 0;
      this.expr.happy += (drop * 0.8 + energy * 0.15 - this.expr.happy) * clamp(dt * 3, 0, 1);
      em.setValue('happy', this.expr.happy);
      em.setValue('relaxed', clamp(0.35 - this.expr.happy * 0.3, 0, 1));
      em.setValue('blink', blink);
    }
    vrm.update(dt);
  }

  // Forward lean needed so the farthest hand target is within reach.
  _leanFor(hands) {
    if (!hands) return 0.1;
    const s = this.scale;
    let deficit = 0;
    for (const side of ['left', 'right']) {
      const h = hands[side];
      if (!h || !h.pos || h.palm === 'ear' || h.palm === 'air') continue;
      // Shoulder height/offset estimate in world (standing upright).
      const shoulderY = this.stand.y + 1.293 * s;
      const shoulderZ = this.stand.z;
      const dz = shoulderZ - h.pos.z, dy = shoulderY - h.pos.y;
      const dxs = Math.abs(h.pos.x - this.stand.x) - 0.11 * s;
      const d = Math.hypot(dz, dy, Math.max(0, dxs));
      const reach = (this.arm.left.l1 + this.arm.left.l2 + 0.06) * s;
      deficit = Math.max(deficit, d - reach * 0.93);
    }
    return clamp(0.1 + deficit * 1.6, 0.06, 0.42);
  }

  _solveArm(side, hand, dt, f) {
    const THREE = this.THREE;
    const A = this.arm[side];
    const { U, L, H } = A;
    const sgn = side === 'left' ? 1 : -1;  // character's left is +X in VRM-local
    const s = this.scale;
    const v = this._v;

    // Default relaxed target when the choreography gives none: hand resting on the table edge.
    const S = v[0]; U.getWorldPosition(S);
    const want = v[1];
    let palm = 'rest';
    const g = this._groove || { dip: 0, sway: 0, amp: 0.5, energy: 0.5, t: 0 };
    if (hand && hand.pos) { want.copy(hand.pos); palm = hand.palm || 'down'; }
    else want.set(this.stand.x - sgn * 0.26, 0.97, this.stand.z - 0.2); // world: her left = −X
    if (palm === 'rest') {
      // a resting hand is not parked: it rides the body's dip and drifts a little
      want.y -= g.dip * 0.012 * g.amp;
      want.x += 0.008 * Math.sin(g.t * 0.8 + (side === 'left' ? 0 : 2.1));
      want.z += 0.006 * Math.sin(g.t * 0.53 + (side === 'left' ? 1.3 : 0));
    } else if (palm === 'air') {
      // hands in the air pump into the beat
      want.y += (0.03 + 0.06 * g.energy) * (1 - g.dip) * g.amp;
      want.x += sgn * 0.02 * g.sway * g.amp;
    }

    // Contact point → wrist: the palm centre sits ~0.075 m past the wrist along the fingers
    // and a pad-thickness above what it touches.
    const fingerDir = v[2], palmN = v[3];
    this._handBasis(side, palm, want, S, fingerDir, palmN);
    const wrist = v[4].copy(want).addScaledVector(fingerDir, -0.075 * s / 1.1).addScaledVector(palmN, -0.022);
    if (palm === 'air') wrist.copy(want);

    // Smooth travel with a small lift so a hand arcs between controls instead of sliding.
    if (!A.state) A.state = { pos: wrist.clone(), vel: new THREE.Vector3(), prev: wrist.clone() };
    // Softer than a servo: a move to a control takes ~0.45 s and eases in, a hand in the air is
    // looser still. A critically damped spring starts a long move with its hardest push, so the
    // wrist's speed is also capped: past HAND_VMAX the move keeps its direction and loses the
    // snap (measured before the cap: 34 m/s² at the start of a reach, i.e. a visible jolt).
    const sdt = Math.min(dt, 0.05);
    A.state.prev.copy(A.state.pos);
    const v0 = v[8].copy(A.state.vel);
    springTo(A.state, wrist, sdt, palm === 'air' ? 6 : palm === 'rest' ? 5 : 8.5);
    // Ease in as well as out: the change of velocity per step is capped (HAND_AMAX), so a
    // reach builds up over ~0.1 s instead of leaving at full speed, and the speed itself is
    // capped. Both keep the spring's direction; only its urgency is trimmed.
    const dv = v[9].copy(A.state.vel).sub(v0);
    const dvMax = HAND_AMAX * sdt;
    if (dv.length() > dvMax) A.state.vel.copy(v0).addScaledVector(dv, dvMax / dv.length());
    let speed = A.state.vel.length();
    if (speed > HAND_VMAX) { A.state.vel.multiplyScalar(HAND_VMAX / speed); speed = HAND_VMAX; }
    A.state.pos.copy(A.state.prev).addScaledVector(A.state.vel, sdt);
    const P = v[6].copy(A.state.pos);
    // A travelling hand lifts off the gear and arcs; the lift follows the hand's SPEED, so it
    // is the same on a 30 fps phone and a 120 Hz desktop — and it is smoothed, or the lift
    // itself would be a 5 cm jump on the step the hand sets off.
    A.state.lift = (A.state.lift || 0) + (clamp(speed * 0.09, 0, 0.055) - (A.state.lift || 0)) * Math.min(1, sdt * 14);
    P.y += A.state.lift;

    // Two-bone IK in world space.
    const l1 = A.l1 * s, l2 = A.l2 * s;
    const toP = v[1].copy(P).sub(S);
    let d = toP.length();
    const dmin = Math.abs(l1 - l2) + 1e-3, dmax = l1 + l2 - 1e-3;
    d = clamp(d, dmin, dmax);
    const dir = toP.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    // Pole: elbows out to the side, down and back.
    const pole = v[7].set(-sgn * 0.5, -0.85, 0.3); // world: her left side is −X — elbows down and a little out, not winged
    const perp = pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = v[5].copy(S).addScaledVector(dir, a).addScaledVector(perp, hgt);
    const Pc = v[4].copy(S).addScaledVector(dir, d);

    // Aim the upper arm at the elbow.
    const q = this._q[1];
    const d1 = v[6].copy(E).sub(S).normalize();
    U.parent.getWorldQuaternion(q);
    d1.applyQuaternion(q.invert());
    U.quaternion.setFromUnitVectors(A.r1, d1);
    U.updateMatrixWorld(true);
    // Aim the forearm at the wrist.
    const d2 = v[6].copy(Pc).sub(E).normalize();
    U.getWorldQuaternion(q);
    d2.applyQuaternion(q.invert());
    L.quaternion.setFromUnitVectors(A.r2, d2);
    L.updateMatrixWorld(true);

    // Hand orientation from the basis.
    this._setHandWorld(side, H, fingerDir, palmN);

    // Fingers: curl for grip, splay flat on a platter, point up in the air.
    const grip = hand && hand.grip != null ? hand.grip : (palm === 'pinch' ? 0.75 : palm === 'rest' ? 0.35 : 0.15);
    A.grip += (grip - A.grip) * clamp(dt * 8, 0, 1);
    const curl = A.grip;
    // A relaxed hand is not four identical fingers: the index stays straighter, the little
    // finger curls most.
    const FINGER_K = { Index: 0.85, Middle: 1.0, Ring: 1.1, Little: 1.2 };
    for (const fi of FINGERS) {
      SEGS.forEach((seg, i) => {
        const n = this.bone(side + fi + seg);
        if (!n) return;
        const c = curl * (FINGER_K[fi] || 1) * (i === 0 ? 0.9 : i === 1 ? 1.1 : 0.7);
        n.rotation.set(0, 0, -sgn * c); // flex toward the palm (palm faces −Y in the rest pose)
      });
    }
    const th = this.bone(side + 'ThumbProximal');
    if (th) th.rotation.set(0, -sgn * (0.2 + curl * 0.5), 0);
  }

  // World-space finger direction and palm normal for a hand shape at a contact point.
  _handBasis(side, palm, contact, shoulder, fingerDir, palmN) {
    const sgn = side === 'left' ? -1 : 1; // world X of her side (her left = −X)
    switch (palm) {
      case 'ear':
        fingerDir.set(0, 1, 0.15).normalize();
        palmN.set(-sgn, 0, 0);                   // palm faces the head
        break;
      case 'air':
        fingerDir.set(sgn * 0.15, 1, -0.2).normalize();
        palmN.set(0, 0, -1);                     // palm to the crowd
        break;
      case 'pinch':
        // Fingers point forward-down onto a fader cap / knob.
        fingerDir.set(0, -0.55, -1).normalize();
        palmN.set(-sgn * 0.35, -0.9, 0.2).normalize();
        break;
      case 'rest':
        fingerDir.set(-sgn * 0.25, -0.15, -1).normalize();
        palmN.set(0, -1, 0);
        break;
      default: // 'down' — palm flat on the platter, fingers pointing away from her
        fingerDir.copy(contact).sub(shoulder).setY(0).normalize();
        if (!isFinite(fingerDir.x)) fingerDir.set(0, 0, -1);
        palmN.set(0, -1, 0);
    }
    // Orthogonalize palm against fingers.
    palmN.addScaledVector(fingerDir, -palmN.dot(fingerDir)).normalize();
  }

  _setHandWorld(side, H, fingerDir, palmN) {
    const THREE = this.THREE;
    // Rest (normalized, VRM-local): left fingers +X, right fingers −X, palms −Y.
    const X = this._v[6].copy(fingerDir);
    if (side === 'right') X.negate();
    const Y = this._v[7].copy(palmN).negate();
    const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
    Y.crossVectors(Z, X).normalize();
    this._m.makeBasis(X, Y, Z);
    // That basis is the hand's frame in WORLD axes, but the rest frame is the VRM scene's
    // frame (rotated π about Y), so compose with the scene rotation.
    const qScene = this._q[2]; this.vrm.scene.getWorldQuaternion(qScene);
    const qWorld = this._q[3].setFromRotationMatrix(this._m);
    // The basis above was built in "world == VRM-local" terms; express relative to the scene.
    const qLocalFrame = qScene.clone().invert().multiply(qWorld);
    // Hand world = scene * qLocalFrame; hand local = parentWorld⁻¹ * handWorld.
    const handWorld = qScene.multiply(qLocalFrame);
    const pq = this._q[0]; H.parent.getWorldQuaternion(pq);
    H.quaternion.copy(pq.invert().multiply(handWorld));
  }

  /** World position of a named body point for the camera director. */
  point(name, out) {
    const n = this.bone(name);
    return n ? n.getWorldPosition(out) : out.set(this.stand.x, 1.5, this.stand.z);
  }

  dispose() {
    if (this._restoreLook) this._restoreLook();
    if (this.headphones) { this.headphones.parent && this.headphones.parent.remove(this.headphones); this.headphones.userData.dispose(); }
    if (this.lookTarget.parent) this.lookTarget.parent.remove(this.lookTarget);
  }
}
