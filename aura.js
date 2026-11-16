// Render "aura": AWI se dibuja solo (capa 1) en un render target, se difumina y se compone
// sobre el fondo con bordes que se desvanecen, uniones fundidas y grano de aerógrafo.
import * as THREE from 'three';

export const AWI_LAYER = 1;

const VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
const BLUR = /* glsl */`
uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec4 s = texture2D( tMap, vUv ) * 0.2270270270;
  s += ( texture2D( tMap, vUv + uDir * 1.3846153846 ) + texture2D( tMap, vUv - uDir * 1.3846153846 ) ) * 0.3162162162;
  s += ( texture2D( tMap, vUv + uDir * 3.2307692308 ) + texture2D( tMap, vUv - uDir * 3.2307692308 ) ) * 0.0702702703;
  gl_FragColor = s;
}`;
const COMPOSITE = /* glsl */`
uniform sampler2D tSharp; uniform sampler2D tBlur; uniform sampler2D tWide;
uniform float uGrain; uniform float uSoft; uniform float uTime; uniform vec2 uRes; uniform float uPx; varying vec2 vUv;
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
void main() {
  vec4 s = texture2D( tSharp, vUv );   // premultiplicado
  vec4 b = texture2D( tBlur, vUv );    // difuminado medio (uniones)
  vec4 w = texture2D( tWide, vUv );    // difuminado amplio (halo exterior)
  // cuánto "adentro" está el píxel: cerca del borde manda la versión difusa
  float core = smoothstep( 0.5, 0.9, b.a );
  vec4 c = mix( b, s, core );
  // el color interior se suaviza un poco (los rasgos quedan como luces suaves)
  vec3 sc = s.rgb / max( s.a, 1e-4 ), bc = b.rgb / max( b.a, 1e-4 );
  vec3 col = mix( c.rgb / max( c.a, 1e-4 ), mix( sc, bc, 0.14 * uSoft ), core );
  float a = c.a;
  // halo amplio que se funde con el fondo
  vec3 wc = w.rgb / max( w.a, 1e-4 );
  wc = mix( wc, wc * 0.55 + vec3( 0.45 ), 0.35 );  // el halo se aclara, como bruma
  float halo = w.a * ( 1.0 - a ) * 0.5 * uSoft;
  col = mix( col, wc, halo / max( a + halo, 1e-4 ) );
  a = a + halo;
  // grano tipo aerógrafo: más fuerte en los bordes, sutil en el interior
  float n = hash( floor( vUv * uRes / uPx ) + floor( uTime * 24.0 ) * 17.0 ) - 0.5;
  float edge = 1.0 - core;
  a = clamp( a + n * uGrain * ( 0.3 + 2.2 * edge ) * a, 0.0, 1.0 );
  col *= 1.0 + n * uGrain * 0.6;
  gl_FragColor = vec4( col, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createAura(renderer) {
  const make = (samples = 0) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer: samples > 0 });
  const rtSharp = make(4), rtA = make(), rtB = make(), rtC = make(), rtD = make();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const blurMat = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VS, fragmentShader: BLUR, depthTest: false, depthWrite: false, toneMapped: false });
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tSharp: { value: rtSharp.texture }, tBlur: { value: rtB.texture }, tWide: { value: rtD.texture }, uGrain: { value: 0.1 }, uSoft: { value: 0.6 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 } },
    vertexShader: VS, fragmentShader: COMPOSITE, transparent: true, depthTest: false, depthWrite: false,
  });
  const size = new THREE.Vector2();
  let W = 1, H = 1;
  const clear = new THREE.Color();

  function setSize() {
    renderer.getDrawingBufferSize(size);
    if (size.x === W && size.y === H) return;
    W = size.x; H = size.y;
    rtSharp.setSize(W, H);
    const hw = Math.max(1, Math.ceil(W / 2)), hh = Math.max(1, Math.ceil(H / 2));
    rtA.setSize(hw, hh); rtB.setSize(hw, hh);
    const qw = Math.max(1, Math.ceil(W / 4)), qh = Math.max(1, Math.ceil(H / 4));
    rtC.setSize(qw, qh); rtD.setSize(qw, qh);
    compMat.uniforms.uRes.value.set(W, H);
    compMat.uniforms.uPx.value = Math.max(1, Math.round(renderer.getPixelRatio()));
  }
  function blur(src, tmp, dst, radiusPx, w, h) {
    quad.material = blurMat;
    const steps = [1, 0.75, 0.5, 0.32, 0.18];
    let from = src;
    for (const k of steps) {
      blurMat.uniforms.tMap.value = from.texture; blurMat.uniforms.uDir.value.set((radiusPx * k) / w / 4.2, 0);
      renderer.setRenderTarget(tmp); renderer.render(quad, cam);
      blurMat.uniforms.tMap.value = tmp.texture; blurMat.uniforms.uDir.value.set(0, (radiusPx * k) / h / 4.2);
      renderer.setRenderTarget(dst); renderer.render(quad, cam);
      from = dst;
    }
  }

  function render(scene, camera, { soft = 0.6, grain = 0.5, time = 0 } = {}) {
    setSize();
    const prevMask = camera.layers.mask, prevBg = scene.background, prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clear);
    // 1 · AWI solo, fondo transparente
    camera.layers.set(AWI_LAYER);
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rtSharp); renderer.clear(); renderer.render(scene, camera);
    scene.background = prevBg;
    renderer.setClearColor(clear, prevAlpha);
    // 2 · difuminados (medio para uniones, amplio para el halo), relativos al alto de la imagen
    // borde: banda fina para que brazos y piernas sigan nítidos por dentro; halo: más amplio, solo hacia afuera
    const rEdge = H * (0.0008 + 0.003 * soft);
    const rHalo = H * (0.003 + 0.011 * soft);
    blur(rtSharp, rtA, rtB, rEdge / 2, rtA.width, rtA.height);
    blur(rtSharp, rtC, rtD, rHalo / 4, rtC.width, rtC.height);
    // 3 · fondo (AWI invisible pero sigue proyectando sombra)
    camera.layers.set(0);
    renderer.setRenderTarget(null); renderer.render(scene, camera);
    // 4 · composición
    compMat.uniforms.uSoft.value = soft; compMat.uniforms.uGrain.value = 0.32 * grain; compMat.uniforms.uTime.value = time;
    const auto = renderer.autoClear; renderer.autoClear = false;
    quad.material = compMat; renderer.render(quad, cam);
    renderer.autoClear = auto;
    camera.layers.mask = prevMask;
  }
  function dispose() { [rtSharp, rtA, rtB, rtC, rtD].forEach((t) => t.dispose()); blurMat.dispose(); compMat.dispose(); quad.geometry.dispose(); }
  return { render, dispose };
}
