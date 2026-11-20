import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Film grade: vignette, warm split-tone, subtle lens fringing, fade. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.55 },
    uFade: { value: 0 },
    uWarmth: { value: 1 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uFade, uWarmth, uAspect;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0) / max(uAspect, 1.0));
      // tiny chromatic fringe towards the edges
      vec2 off = c * r * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // warm highlights, wine-tinted shadows
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 shadowTint = vec3(0.09, 0.015, 0.03);
      vec3 highTint = vec3(1.04, 0.98, 0.9);
      col = mix(col + shadowTint * (1.0 - l) * 0.35 * uWarmth, col * highTint, smoothstep(0.2, 0.9, l));
      float v = smoothstep(0.85, 0.15, r * (0.9 + uVignette * 0.6));
      col *= mix(1.0 - uVignette * 0.85, 1.0, v);
      col = mix(col, vec3(0.02, 0.004, 0.008), uFade);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createComposer(renderer, scene, camera, { samples = 4, bloomScale = 1 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * bloomScale, size.y * bloomScale), 0.55, 0.45, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  return { composer, bloom, grade };
}
