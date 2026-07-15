// Real-time Nora avatar stage. Loads a VRM, attaches to an existing AnalyserNode, and runs
// a 30 fps render loop driving the rig from the pure driver. Framework-agnostic ESM so both
// the web page (import map) and the mobile Vite app can load it. WebGL — verified on-device.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { computeBands, computeRigParams } from './noraReactive.mjs';

const FRAME_MS = 1000 / 30;

export class NoraStage {
  constructor({ canvas, analyser, modelUrl }) {
    this.canvas = canvas;
    this.analyser = analyser;                 // an existing AnalyserNode (caller owns the audio graph)
    this.modelUrl = modelUrl;
    this.vrm = null;
    this._raf = 0;
    this._last = 0;
    this._clock = new THREE.Clock();
    this._freq = new Uint8Array(analyser ? analyser.frequencyBinCount : 256);

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this._resize();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, this._aspect(), 0.1, 20);
    this.camera.position.set(0, 1.3, 2.2);     // framed bust-to-decks
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1, 2, 2);
    const fill = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(key, fill);
  }

  _aspect() { return (this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1); }
  _resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  async load() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(this.modelUrl);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    // Face the camera. rotateVRM0 normalizes a legacy VRM0 model to the VRM1
    // orientation (a no-op for a VRM1 model), so any avatar we swap in lands the
    // same way. three-vrm loads our VRM1 already fronting the +Z camera — the old
    // unconditional `rotation.y = Math.PI` spun it 180° and showed only its back.
    VRMUtils.rotateVRM0(vrm);
    this.scene.add(vrm.scene);
    this.vrm = vrm;
    return vrm;
  }

  start() {
    if (this._raf) return;
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      if (now - this._last < FRAME_MS) return; // 30 fps cap
      this._last = now;
      const dt = this._clock.getDelta();
      if (this.analyser) this.analyser.getByteFrequencyData(this._freq);
      const params = computeRigParams(computeBands(this._freq), now);
      this._apply(params);
      if (this.vrm) this.vrm.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _apply(p) {
    const vrm = this.vrm; if (!vrm) return;
    const h = vrm.humanoid;
    const head = h && h.getNormalizedBoneNode('head');
    const spine = h && h.getNormalizedBoneNode('spine');
    const lUpper = h && h.getNormalizedBoneNode('leftUpperArm');
    const rUpper = h && h.getNormalizedBoneNode('rightUpperArm');
    if (head) head.rotation.x = p.headBob * 0.4;
    if (spine) spine.rotation.z = p.spineSway;
    // Arms rest down at ~|1.2| rad on Z; raise toward the decks as armRaise→1.
    if (lUpper) lUpper.rotation.z = 1.2 - p.armRaise * 0.5;
    if (rUpper) rUpper.rotation.z = -1.2 + p.armRaise * 0.5;
    const em = vrm.expressionManager;
    if (em) {
      em.setValue('happy', p.expression);
      em.setValue('blink', p.blink);
    }
  }

  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } }

  dispose() {
    this.stop();
    if (this.vrm) { VRMUtils.deepDispose(this.vrm.scene); this.vrm = null; }
    this.renderer.dispose();
  }
}
