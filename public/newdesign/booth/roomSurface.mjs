// roomSurface.mjs — the surface drawn on the side rooms' floors and walls (clubVenue.mjs, 2c).
//
// The lounge and the bar are unlit geometry with their lamps baked into the vertices, and every
// floor, wall and ceiling was one baked colour: a block-out (owner, 2026-11-16, of the live room
// beside its pictures: "is the club itsself improved. The nightclub im talking about", then asked
// for this room upgraded). This patches three's basic material so the fragment shader lays a surface
// over that baked light from the point's place in the room alone. No texture and no UVs, so it
// costs a phone nothing to download and a few instructions a pixel to draw:
//
//   floors   boards 20 cm wide running the room's length, each its own tone, staggered end joints,
//            a dark line between boards, and a polish that lifts where the eye grazes the floor
//   walls    upholstered panels 1.2 m wide: a shadow line between them, each a shade its own,
//            fuller in the middle than at its seams
//   ceilings left as the bake has them
//
// ⚠ THE PATTERN FADES WHERE IT IS SMALL. A board under a few pixels across would shimmer as the
// camera drifts, and nothing in the room may flicker; fwidth() measures how fast the pattern runs
// across the screen and the pattern goes to its mean before it can alias.
//
// Pure: a function of the shader object three hands onBeforeCompile. No three import, no DOM.

const VARYINGS = 'varying vec3 vRoomPos;\nvarying vec3 vRoomNrm;';

/** Patch a MeshBasicMaterial's shader (the object onBeforeCompile receives) with the rooms' surface. */
export function patchRoomSurface(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${VARYINGS}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRoomPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vRoomNrm = mat3(modelMatrix) * normal;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\n${VARYINGS}\nfloat roomHash(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }`)
    .replace('#include <color_fragment>', [
      '#include <color_fragment>',
      '{',
      '  vec3 rn = normalize(vRoomNrm);',
      '  vec3 rp = vRoomPos;',
      '  if (rn.y > 0.6) {',
      '    float u = rp.x / 0.2;',
      '    float board = floor(u);',
      '    float v = (rp.z + roomHash(vec2(board, 3.0)) * 1.6) / 1.6;',
      '    float fade = clamp(1.0 - fwidth(u) * 3.0, 0.0, 1.0);',
      '    float tone = roomHash(vec2(board, floor(v)));',
      '    float fu = fract(u), fv = fract(v);',
      '    float joint = smoothstep(0.0, 0.04, fu) * smoothstep(0.0, 0.04, 1.0 - fu) * smoothstep(0.0, 0.005, fv) * smoothstep(0.0, 0.005, 1.0 - fv);',
      '    diffuseColor.rgb *= mix(1.0, (0.74 + 0.5 * tone) * mix(0.45, 1.0, joint), fade);',
      '    float fres = pow(1.0 - max(dot(normalize(cameraPosition - rp), rn), 0.0), 3.0);',
      '    diffuseColor.rgb *= 1.0 + 2.2 * fres;',
      '  } else if (rn.y > -0.6) {',
      '    float u = (abs(rn.x) > 0.5 ? rp.z : rp.x) / 1.2;',
      '    float fade = clamp(1.0 - fwidth(u) * 3.0, 0.0, 1.0);',
      '    float fu = fract(u);',
      '    float seam = smoothstep(0.0, 0.014, fu) * smoothstep(0.0, 0.014, 1.0 - fu);',
      '    float bulge = 0.86 + 0.14 * sin(fu * 3.14159265);',
      '    diffuseColor.rgb *= mix(1.0, (0.88 + 0.24 * roomHash(vec2(floor(u), 7.0))) * mix(0.4, 1.0, seam) * bulge, fade);',
      '  }',
      '}',
    ].join('\n'));
  return sh;
}
