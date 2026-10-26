// beamHaze.mjs — the haze a beam lights on its way: a soft, wide glow around every narrow beam.
//
// In a real club a sharpy beam is a bright core inside a softer column of lit haze several times
// wider, fading out from the core. In the booth the beams were hairlines on black, and read as lines
// drawn over the picture, not light in the air (owner, 2026-10-26: "its needs to look more real on
// website and app"). addBeamHaze gives a beam mesh that sheath: a second instanced cone, `widen`
// times wider, which shares the beam mesh's instance matrices and colours. It costs one draw call
// and no per-frame work. It is drawn additively and dim, brightest along the core and gone at its
// edge, and like the beams it swells with the level and never flashes.

const HAZE_VERT = /* glsl */`
attribute vec3 aColor;
#ifdef HAZE_INTENSITY
attribute float aIntensity;
#endif
varying vec3 vColor;
varying float vAlong;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vEnd;
void main() {
  vColor = aColor;
  #ifdef HAZE_INTENSITY
  vColor *= aIntensity;
  #endif
  vAlong = clamp(-position.y, 0.0, 1.0);
  // how squarely the beam points at the camera (1 straight down its axis)
  mat4 M = modelMatrix * instanceMatrix;
  vEnd = dot(normalize(mat3(M) * vec3(0.0, -1.0, 0.0)), normalize(cameraPosition - (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz));
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormalV = normalize(mat3(modelViewMatrix * instanceMatrix) * normal);
  gl_Position = projectionMatrix * mv;
}`;

const HAZE_FRAG = /* glsl */`
uniform float uGain;
uniform float uFogDensity;
varying vec3 vColor;
varying float vAlong;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vEnd;
void main() {
  // how near the core this fragment's line of sight passes: 1 on the axis, 0 at the sheath's edge
  float facing = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
  float core = pow(facing, 2.6);
  // strongest near the lens, thinning as the light spreads; gone well before the beam ends
  float fall = pow(1.0 - vAlong, 1.6);
  float depth = -vViewPos.z;
  // a sheath the camera is inside of, or nearly, fades out instead of filling the frame
  float nearFade = smoothstep(1.5, 6.0, depth);
  float fog = exp(-uFogDensity * uFogDensity * depth * depth * 0.6);
  // seen end-on the whole sheath lands on one disc round the lens, a floating orb: it fades out
  float side = 1.0 - smoothstep(0.55, 0.85, vEnd);
  gl_FragColor = vec4(vColor * core * fall * nearFade * fog * side * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * A haze sheath for an instanced beam mesh whose cone has its apex at the origin, opens along −y over
 * a unit length, has unit radius at the far end, and is scaled per instance by (R, length, R).
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {import('three').InstancedMesh} o.beams   the beam mesh (its aColor, and aIntensity if any)
 * @param {number} o.lensRadius  the beam's radius at the lens, in the cone's unit (lens / R)
 * @param {number} [o.widen]     how many times wider the sheath is than the beam
 * @param {number} [o.gain]      the sheath's brightness against the beam's colour
 * @param {number} [o.fogDensity]
 * @param {number} [o.segments]
 * @returns {{ mesh: import('three').InstancedMesh, uniforms: object, dispose(): void }}
 */
export function addBeamHaze({ THREE, beams, lensRadius, widen = 7, gain = 0.035, fogDensity = 0.012, segments = 16 }) {
  const geo = new THREE.CylinderGeometry(lensRadius * 2.5, widen, 1, segments, 1, true);
  geo.translate(0, -0.5, 0);
  const src = beams.geometry.attributes;
  geo.setAttribute('aColor', src.aColor);
  if (src.aIntensity) geo.setAttribute('aIntensity', src.aIntensity);
  const uniforms = { uGain: { value: gain }, uFogDensity: { value: fogDensity } };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: HAZE_VERT, fragmentShader: HAZE_FRAG,
    defines: src.aIntensity ? { HAZE_INTENSITY: '' } : {},
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, beams.count);
  // the beams' own matrices: they move together with no copying
  mesh.instanceMatrix = beams.instanceMatrix;
  mesh.name = (beams.name || 'beams') + 'Haze';
  mesh.frustumCulled = false;
  mesh.renderOrder = (beams.renderOrder || 0) - 1;
  return {
    mesh, uniforms,
    dispose() {
      // the shared attributes belong to the beam mesh
      geo.deleteAttribute('aColor');
      if (src.aIntensity) geo.deleteAttribute('aIntensity');
      geo.dispose(); mat.dispose();
    },
  };
}
