import * as THREE from 'three'

/**
 * Procedural FUI ground for arbitrary areas: dark slate base, 10 m / 50 m LV95 grid, 1 m contours with 5 m index
 * lines, all anti-aliased in the fragment shader and faded when they get denser than the screen can show.
 * Same lighting model as the baked texture (base colour + 0.55 emission).
 */
export function fuiGroundMaterial(E0: number, N0: number, Z0: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.95, metalness: 0 })
  // Local x is east and -z is north. Retain the origin modulo the largest
  // grid spacing to anchor lines at absolute LV95 multiples without sending
  // million-metre coordinates to the fragment shader (which loses precision).
  const u = {
    uOff: { value: new THREE.Vector2(((E0 % 50) + 50) % 50, ((N0 % 50) + 50) % 50) },
    uZ0: { value: Z0 },
    cBase: { value: new THREE.Color(0x1e2329) },
    cMinor: { value: new THREE.Color(0x2a3139) },
    cMajor: { value: new THREE.Color(0x4d5b67) },
    cContour: { value: new THREE.Color(0x243d43) },
    cIndex: { value: new THREE.Color(0x3a7078) },
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFui;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFui = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFui;
        uniform vec2 uOff; uniform float uZ0;
        uniform vec3 cBase, cMinor, cMajor, cContour, cIndex;
        float fuiLine(float coord, float spacing, float px) {
          float p = coord / spacing;
          float f = abs(fract(p - 0.5) - 0.5);
          float w = fwidth(p);
          float line = 1.0 - smoothstep(0.0, w * px, f);
          return line * (1.0 - smoothstep(0.18, 0.45, w));   // fade when denser than ~3 px
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float gx = vFui.x + uOff.x, gy = -vFui.z + uOff.y;
        float h = vFui.y + uZ0;
        float minor = max(fuiLine(gx, 10.0, 1.0), fuiLine(gy, 10.0, 1.0));
        float major = max(fuiLine(gx, 50.0, 1.4), fuiLine(gy, 50.0, 1.4));
        float contour = fuiLine(h, 1.0, 1.0);
        float index = fuiLine(h, 5.0, 1.3);
        vec3 fui = cBase;
        fui = mix(fui, cContour, contour * 0.7);
        fui = mix(fui, cIndex, index);
        fui = mix(fui, cMinor, minor * 0.75);
        fui = mix(fui, cMajor, major);
        diffuseColor.rgb = fui;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = fui * emissive;   // emissive uniform = colour * intensity (white * 0.55)`)
  }
  mat.customProgramCacheKey = () => 'fui-ground'
  return mat
}
