// cinematic.mjs — the desktop "cinematic" tier: a concert-film finish on top of the booth's render.
//
// The owner: "i want this to be as cinematic as possible". The handoff's offer was reflections, haze,
// depth of field, grain and a final grade; this is the part of that a browser can afford every frame
// on a desktop GPU, as post passes that share one scene render:
//
//   scene        the scene into its own 4× MSAA half-float target WITH a depth texture (the composer's
//                own targets ping-pong, so a depth read off them would alternate frames), then a
//                sanitize copy (NaN/Inf to black, HDR clamped) into the chain — it replaces RenderPass
//   shafts       light shafts off the LED wall: its bright pixels (found by reconstructing world z from
//                depth, so a lit deck screen or a lens never counts) are smeared toward the sun on
//                the wall at quarter resolution, so Nora, the rig and the crowd's heads cut dark bars
//                through the haze in front of the screen
//   focus        depth of field: a gather over a golden-angle disc, each tap counted only if its own
//                circle of confusion reaches this pixel, so a sharp foreground never smears onto the
//                blurred background behind it (nor the reverse). The lens is set per shot: shallow on
//                the hands and the face, deep on the room
//   streaks      anamorphic flares: the brightest lights (lenses, the sun) drawn out sideways in a cool
//                blue-white, at quarter resolution
//   film         after tone mapping: split-toned grade (cool shadows, warm highlights), a gentle
//                S-curve, lens fringing toward the corners, a vignette, fine grain, and 2.39:1 bars
//                on a landscape frame (the HUD sits on them)
//
// No textures, no pictures, nothing that flashes: the shafts swell with the level, the grain is
// fine luminance noise (held still under reduced motion). Pure GLSL; the only inputs are the scene,
// its depth and the numbers update() is handed.

const FSQ_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// shared: linear view depth from the depth texture
const DEPTH_FN = /* glsl */`
  uniform float uNear, uFar;
  float viewZ(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }`;

const SANITIZE_FRAG = /* glsl */`
  uniform sampler2D tDiffuse; varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
    gl_FragColor = min(c, vec4(32.0));
  }`;

// 1. the wall's light, isolated: bright pixels whose world z says they are the LED wall (the stage end)
const SHAFT_MASK_FRAG = /* glsl */`
  uniform sampler2D tDiffuse, tDepth; uniform mat4 uProjInv, uCamWorld; uniform float uWallZ, uWallX;
  varying vec2 vUv;
  ${DEPTH_FN}
  void main() {
    float d = texture2D(tDepth, vUv).x;
    vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
    vec3 w = (uCamWorld * vec4(v.xyz, 1.0)).xyz;
    float wall = step(uWallZ, w.z) * step(abs(w.x), uWallX) * step(d, 0.99999);
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * smoothstep(0.18, 1.1, l) * wall, 1.0);
  }`;

// 2. a radial smear toward the light (two passes: the second, longer, reads the first)
const SHAFT_BLUR_FRAG = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uLight; uniform float uSpread, uDecay;
  varying vec2 vUv;
  void main() {
    const int N = 28;
    vec2 step = (vUv - uLight) * uSpread / float(N);
    vec2 uv = vUv; vec3 acc = vec3(0.0); float wt = 1.0, norm = 0.0;
    for (int i = 0; i < N; i++) {
      acc += texture2D(tDiffuse, uv).rgb * wt; norm += wt;
      wt *= uDecay; uv -= step;
    }
    gl_FragColor = vec4(acc / norm, 1.0);
  }`;

// 3. depth of field (and the shafts added in first: they are light in the air, so they blur with it)
const DOF_FRAG = /* glsl */`
  uniform sampler2D tDiffuse, tDepth, tShafts;
  uniform vec2 uTexel; uniform float uFocus, uAperture, uMaxCoc, uShaft; uniform vec3 uShaftTint;
  varying vec2 vUv;
  ${DEPTH_FN}
  float zAt(vec2 uv) { return viewZ(texture2D(tDepth, uv).x); }
  float cocZ(float z) { return min(uAperture * abs(z - uFocus) / max(z, 1e-3), uMaxCoc); }
  vec3 scene(vec2 uv) { return texture2D(tDiffuse, uv).rgb + texture2D(tShafts, uv).rgb * uShaftTint * uShaft; }
  void main() {
    vec3 c0 = scene(vUv);
    if (uMaxCoc < 0.5) { gl_FragColor = vec4(c0, 1.0); return; }
    float z0 = zAt(vUv), r0 = cocZ(z0);
    const int N = 28;
    vec3 acc = c0; float wsum = 1.0;
    for (int i = 0; i < N; i++) {
      float fi = float(i) + 0.5;
      float r = sqrt(fi / float(N)) * uMaxCoc;
      float a = fi * 2.39996323;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
      float zi = zAt(uv), ri = cocZ(zi);
      // a tap counts if its own blur circle reaches this pixel (a blurred foreground spills over what
      // is sharp behind it); a tap BEHIND this pixel also needs this pixel's own circle to reach it,
      // so a blurred background never haloes over a sharp subject in front of it
      float reach = smoothstep(r - 1.0, r + 0.5, ri);
      float behind = step(z0 * 1.02 + 0.03, zi);
      float w = reach * mix(1.0, smoothstep(r - 1.0, r + 0.5, r0), behind);
      acc += scene(uv) * w; wsum += w;
    }
    gl_FragColor = vec4(acc / wsum, 1.0);
  }`;

// 4. anamorphic streaks: bright pass, then a wide horizontal smear
const STREAK_BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tDiffuse; uniform float uThresh; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * max(l - uThresh, 0.0) / max(l, 1e-3), 1.0);
  }`;
const STREAK_BLUR_FRAG = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uStep; varying vec2 vUv;
  void main() {
    vec3 acc = vec3(0.0); float norm = 0.0;
    for (int i = -6; i <= 6; i++) {
      float w = exp(-float(i * i) / 18.0);
      acc += texture2D(tDiffuse, vUv + uStep * float(i)).rgb * w; norm += w;
    }
    gl_FragColor = vec4(acc / norm, 1.0);
  }`;
const STREAK_ADD_FRAG = /* glsl */`
  uniform sampler2D tDiffuse, tStreak; uniform vec3 uTint; uniform float uAmount; varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + texture2D(tStreak, vUv).rgb * uTint * uAmount, 1.0); }`;

// 5. the film finish, on display-referred colour (after OutputPass)
const FILM_FRAG = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uGrain, uVignette, uFringe, uBars;
  varying vec2 vUv;
  float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  void main() {
    vec2 d = vUv - 0.5;
    float asp = uRes.x / uRes.y;
    vec2 e = d * vec2(asp, 1.0);
    // lens fringing: red and blue pulled apart toward the corners
    vec2 f = d * uFringe * dot(e, e);
    vec3 c = vec3(texture2D(tDiffuse, vUv - f).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + f).b);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // split tone: cool, slightly teal shadows; warm highlights
    c += vec3(-0.012, 0.004, 0.018) * (1.0 - smoothstep(0.0, 0.4, l));
    c *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), smoothstep(0.45, 1.0, l));
    // a gentle S-curve and a touch more colour
    c = clamp(c, 0.0, 1.0);
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
    float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l2), c, 1.07);
    // vignette
    c *= mix(1.0, smoothstep(1.25, 0.25, length(e * vec2(0.9, 1.1))), uVignette);
    // grain: fine, luminance-weighted (strongest in the mids, as film's is)
    float n = hash(vUv * uRes + vec2(uTime * 61.0, uTime * 17.0)) + hash(vUv * uRes * 1.37 - vec2(uTime * 23.0, uTime * 47.0)) - 1.0;
    c += n * uGrain * (0.35 + 0.65 * (1.0 - abs(l2 * 2.0 - 1.0)));
    // optional 2.39:1 bars: uBars is the half-height of the picture (0.51 = no bars)
    float bar = step(uBars, abs(d.y));
    gl_FragColor = vec4(mix(clamp(c, 0.0, 1.0), vec3(0.0), bar), 1.0);
  }`;

/**
 * The lens for a shot: shallow on the hands and the face, deeper on the booth, deep on the room.
 * aperture is the far-field blur in px at 720 lines; maxCoc its cap. Pure.
 */
export const LENS = {
  jog: { aperture: 11, maxCoc: 11 }, mixer: { aperture: 11, maxCoc: 11 }, screen: { aperture: 12, maxCoc: 12 },
  // the face and profile shots aim at the head bone (the skull's centre); the eyes are nearer the lens
  face: { aperture: 10, maxCoc: 10, focusOffset: -0.09 }, profile: { aperture: 9, maxCoc: 9, focusOffset: -0.06 },
  // these two look OUT over the crowd; their aim point is a spot on the floor far away, so the lens
  // focuses on the people who fill the frame instead (focusAt, metres from the camera) and Nora, in
  // front of the lens, falls soft
  shoulder: { aperture: 3.5, maxCoc: 5, focusAt: 5.5 }, behind: { aperture: 3.5, maxCoc: 5, focusAt: 6.5 }, wide: { aperture: 4, maxCoc: 5 },
  overhead: { aperture: 3, maxCoc: 4 },
  club: { aperture: 1.2, maxCoc: 2.5 }, atrium: { aperture: 1.0, maxCoc: 2.5 }, panorama: { aperture: 1.2, maxCoc: 2.5 },
  crane: { aperture: 1.5, maxCoc: 3 }, drone: { aperture: 1.0, maxCoc: 2.5 },
  // from a few hundred metres over the bay: everything at infinity, so almost no blur at all
  arrival: { aperture: 0.6, maxCoc: 1.5 },
  free: { aperture: 3, maxCoc: 4 },
};
export function lensFor(shot) { return LENS[shot] || LENS.free; }

/**
 * How strongly the wall throws shafts, from where its light lands in clip space (x, y in −1…1 when on
 * screen, w < 0 behind the camera): full while the source is in or near the frame, fading out as it
 * leaves (the smear is toward the source, so an off-frame source still casts, but only so far). Pure.
 */
export function shaftVisibility(ndcX, ndcY, w) {
  if (!(w > 0)) return 0;
  const m = Math.max(Math.abs(ndcX), Math.abs(ndcY));
  return m <= 1.2 ? 1 : m >= 2.6 ? 0 : 1 - (m - 1.2) / 1.4;
}

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {typeof import('three/addons/postprocessing/Pass.js').Pass} o.Pass
 * @param {typeof import('three/addons/postprocessing/Pass.js').FullScreenQuad} o.FullScreenQuad
 * @param {import('three').Scene} o.scene
 * @param {import('three').PerspectiveCamera} o.camera
 * @param {number} [o.samples]  MSAA samples for the scene render
 * @param {boolean} [o.reducedMotion]
 * @param {boolean} [o.bars]    2.39:1 letterbox (landscape frames only)
 */
export function createCinematic({ THREE, Pass, FullScreenQuad, scene, camera, samples = 4, reducedMotion = false, bars = false, wall = { z: 5.2, x: 10.4, light: [0, 8.2, 5.5] } }) {
  const HF = THREE.HalfFloatType;
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: FSQ_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
  const rt = (w, h) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: HF, depthBuffer: false });
  const near = { value: camera.near }, far = { value: camera.far };
  let W = 1, H = 1;

  // ── the scene, with depth ──────────────────────────────────────────────────────────────
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: HF, samples, depthTexture: new THREE.DepthTexture(1, 1) });
  sceneRT.texture.name = 'cine.scene';
  const depthTex = sceneRT.depthTexture;
  const sanitize = mat(SANITIZE_FRAG, { tDiffuse: { value: sceneRT.texture } });
  const fsqSan = new FullScreenQuad(sanitize);

  class ScenePass extends Pass {
    constructor() { super(); this.needsSwap = true; }
    setSize(w, h) { sceneRT.setSize(w, h); }
    render(renderer, writeBuffer) {
      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      fsqSan.render(renderer);
    }
    dispose() { sceneRT.dispose(); sanitize.dispose(); fsqSan.dispose(); }
  }

  // ── shafts + focus (one pass in the chain; the shafts render to their own small targets) ──
  const sh = { a: rt(1, 1), b: rt(1, 1) };
  const uMask = { tDiffuse: { value: null }, tDepth: { value: depthTex }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uWallZ: { value: wall.z }, uWallX: { value: wall.x }, uNear: near, uFar: far };
  const mMask = mat(SHAFT_MASK_FRAG, uMask), fsqMask = new FullScreenQuad(mMask);
  const uBlur = { tDiffuse: { value: null }, uLight: { value: new THREE.Vector2(0.5, 0.5) }, uSpread: { value: 0.35 }, uDecay: { value: 0.955 } };
  const mBlur = mat(SHAFT_BLUR_FRAG, uBlur), fsqBlur = new FullScreenQuad(mBlur);
  const uDof = {
    tDiffuse: { value: null }, tDepth: { value: depthTex }, tShafts: { value: sh.a.texture },
    uTexel: { value: new THREE.Vector2() }, uFocus: { value: 6 }, uAperture: { value: 0 }, uMaxCoc: { value: 0 },
    uShaft: { value: 0 }, uShaftTint: { value: new THREE.Color(1.0, 0.86, 0.72) }, uNear: near, uFar: far,
  };
  const mDof = mat(DOF_FRAG, uDof), fsqDof = new FullScreenQuad(mDof);

  class FocusPass extends Pass {
    constructor() { super(); this.needsSwap = true; }
    setSize(w, h) {
      W = w; H = h;
      sh.a.setSize(Math.ceil(w / 4), Math.ceil(h / 4)); sh.b.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
      uDof.uTexel.value.set(1 / w, 1 / h);
    }
    render(renderer, writeBuffer, readBuffer) {
      if (uDof.uShaft.value > 0.001) {
        uMask.tDiffuse.value = readBuffer.texture;
        renderer.setRenderTarget(sh.a); fsqMask.render(renderer);
        uBlur.tDiffuse.value = sh.a.texture; uBlur.uSpread.value = 0.3; uBlur.uDecay.value = 0.95;
        renderer.setRenderTarget(sh.b); fsqBlur.render(renderer);
        uBlur.tDiffuse.value = sh.b.texture; uBlur.uSpread.value = 0.75; uBlur.uDecay.value = 0.965;
        renderer.setRenderTarget(sh.a); fsqBlur.render(renderer);
      }
      uDof.tDiffuse.value = readBuffer.texture;
      uDof.tShafts.value = sh.a.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      fsqDof.render(renderer);
    }
    dispose() { sh.a.dispose(); sh.b.dispose(); mMask.dispose(); mBlur.dispose(); mDof.dispose(); fsqMask.dispose(); fsqBlur.dispose(); fsqDof.dispose(); }
  }

  // ── streaks ────────────────────────────────────────────────────────────────────────────
  const st = { a: rt(1, 1), b: rt(1, 1) };
  const uBright = { tDiffuse: { value: null }, uThresh: { value: 1.6 } };
  const mBright = mat(STREAK_BRIGHT_FRAG, uBright), fsqBright = new FullScreenQuad(mBright);
  const uSB = { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() } };
  const mSB = mat(STREAK_BLUR_FRAG, uSB), fsqSB = new FullScreenQuad(mSB);
  const uAdd = { tDiffuse: { value: null }, tStreak: { value: st.a.texture }, uTint: { value: new THREE.Color(0.55, 0.78, 1.0) }, uAmount: { value: 0.32 } };
  const mAdd = mat(STREAK_ADD_FRAG, uAdd), fsqAdd = new FullScreenQuad(mAdd);
  let SW = 1;
  class StreakPass extends Pass {
    constructor() { super(); this.needsSwap = true; }
    setSize(w, h) { SW = Math.ceil(w / 4); st.a.setSize(SW, Math.ceil(h / 4)); st.b.setSize(SW, Math.ceil(h / 4)); }
    render(renderer, writeBuffer, readBuffer) {
      uBright.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(st.a); fsqBright.render(renderer);
      // three widening smears: 1, 3.5 and 12 texels a tap (13 taps each): a long thin line
      let src = st.a, dst = st.b;
      for (const k of [1, 3.5, 12]) {
        uSB.tDiffuse.value = src.texture; uSB.uStep.value.set(k / SW, 0);
        renderer.setRenderTarget(dst); fsqSB.render(renderer);
        [src, dst] = [dst, src];
      }
      uAdd.tDiffuse.value = readBuffer.texture; uAdd.tStreak.value = src.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      fsqAdd.render(renderer);
    }
    dispose() { st.a.dispose(); st.b.dispose(); mBright.dispose(); mSB.dispose(); mAdd.dispose(); fsqBright.dispose(); fsqSB.dispose(); fsqAdd.dispose(); }
  }

  // ── film ──────────────────────────────────────────────────────────────────────────────
  const uFilm = { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uGrain: { value: 0.045 }, uVignette: { value: 0.42 }, uFringe: { value: 0.0032 }, uBars: { value: 0.51 } };
  const mFilm = mat(FILM_FRAG, uFilm), fsqFilm = new FullScreenQuad(mFilm);
  class FilmPass extends Pass {
    constructor() { super(); this.needsSwap = true; }
    // bars only on a landscape frame: on a tall one 2.39:1 would leave a sliver of picture
    setSize(w, h) { uFilm.uRes.value.set(w, h); uFilm.uBars.value = bars && w / h >= 1.5 ? Math.min(0.51, (w / 2.39) / h / 2) : 0.51; }
    render(renderer, writeBuffer, readBuffer) {
      uFilm.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      fsqFilm.render(renderer);
    }
    dispose() { mFilm.dispose(); fsqFilm.dispose(); }
  }

  const passes = { scene: new ScenePass(), focus: new FocusPass(), streaks: new StreakPass(), film: new FilmPass() };

  // ── per frame ─────────────────────────────────────────────────────────────────────────
  const light = new THREE.Vector4(), lens = { focus: 6, aperture: 0, maxCoc: 0, shot: null };
  let grainT = 0;
  /**
   * @param {object} s
   * @param {number} s.dt
   * @param {string} s.shot       the director's shot id (or 'free')
   * @param {number} s.focus      metres to what the shot is looking at
   * @param {number} [s.level]    0…1 music level (the shafts swell with it)
   * @param {number} [s.drop]     0…1
   * @param {boolean} [s.shafts]  false while the LED wall is not in the set (the exterior)
   */
  function update({ dt = 1 / 60, shot = 'free', focus = 6, level = 0, drop = 0, shafts = true } = {}) {
    near.value = camera.near; far.value = camera.far;
    camera.updateMatrixWorld();
    uMask.uProjInv.value.copy(camera.projectionMatrixInverse);
    uMask.uCamWorld.value.copy(camera.matrixWorld);
    // the lens: a cut changes it at once (each shot is a camera already focused); within a shot the
    // focus follows what it is looking at, eased as a focus puller would
    const L = lensFor(shot), s = H / 720;
    const k = shot !== lens.shot ? 1 : 1 - Math.exp(-Math.min(dt, 0.25) / 0.12);
    lens.shot = shot;
    lens.focus += (Math.max(0.3, (L.focusAt || focus) + (L.focusOffset || 0)) - lens.focus) * k;
    lens.aperture += (L.aperture - lens.aperture) * k;
    lens.maxCoc += (L.maxCoc - lens.maxCoc) * k;
    uDof.uFocus.value = lens.focus;
    uDof.uAperture.value = lens.aperture * s;
    uDof.uMaxCoc.value = lens.maxCoc * s;
    // the shafts: toward the sun on the wall, as strong as the source is in view
    light.set(wall.light[0], wall.light[1], wall.light[2], 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    const vis = shaftVisibility(light.x / light.w, light.y / light.w, light.w);
    uBlur.uLight.value.set((light.x / light.w) * 0.5 + 0.5, (light.y / light.w) * 0.5 + 0.5);
    uDof.uShaft.value = shafts ? vis * (0.55 + 0.35 * level + 0.25 * drop) : 0;
    // grain: moves every frame, held still under reduced motion
    if (!reducedMotion) grainT = (grainT + 0.618034) % 97.0;
    uFilm.uTime.value = grainT;
  }

  function dispose() { for (const p of Object.values(passes)) p.dispose(); }

  return { passes, update, dispose, depthTexture: depthTex, lens };
}
