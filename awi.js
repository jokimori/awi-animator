// AWI — espíritu del bosque. Modelo procedural con "rig" jerárquico + morph targets,
// material aterciopelado con degradado vivo y cuerpo gelatinoso (resortes + ondulación en shader).
// Jerarquía (nombres únicos, se conservan en el .glb):
//   AWI_root (piso, posición/giro/inclinación)
//    ├─ AWI_bodyPivot (base del cuerpo, aplastar/estirar)
//    │   └─ AWI_body (malla con morphs: Inflado, Caido, Estirado)
//    │        └─ AWI_face → AWI_eyeL / AWI_eyeR (morph "Feliz") y AWI_mouth (morphs Sonrisa/Ceno/Abierta)
//    ├─ AWI_armL / AWI_armR (hombros)
//    └─ AWI_legL / AWI_legR (caderas)
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createProps } from './props.js';

// Paleta (sRGB) tomada de la ilustración original
const C = { deep: '#0a2077', blue: '#1366ff', orange: '#ff8a47', limb: '#2343d6' };
const srgbVec = (hex) => { const t = {}; new THREE.Color(hex).getRGB(t, THREE.SRGBColorSpace); return new THREE.Vector3(t.r, t.g, t.b); };

/* ───────────── silueta: unión suave de elipsoides (SDF) ───────────── */
function ell(px, py, pz, e) {
  let x = px - e.c[0], y = py - e.c[1];
  const z = pz - (e.c[2] || 0);
  if (e.a) { const ca = Math.cos(-e.a), sa = Math.sin(-e.a); const nx = x * ca - y * sa; y = x * sa + y * ca; x = nx; }
  const [rx, ry, rz] = e.r;
  // Math.sqrt en vez de Math.hypot: hypot es muy lento y esto se evalúa millones de veces al armar el modelo
  const ax = x / rx, ay = y / ry, az = z / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function sdf(x, y, z, S) {
  let d = ell(x, y, z, S.bottom);
  d = smin(d, ell(x, y, z, S.dome), S.k);
  d = smin(d, ell(x, y, z, S.bulge), S.k);
  // la hendidura entre cúpula y copete solo se marca en la silueta; de frente y de atrás se funde liso
  const kl = (S.kLobe ?? S.k) + 0.55 * Math.min(1, Math.max(0, (Math.abs(z) - 0.08) / 0.5));
  d = smin(d, ell(x, y, z, S.lobe), kl);
  return d;
}
// Medidas en unidades del cuerpo (centro en el origen), calcadas de la ilustración
const SHAPES = {
  base: {
    bottom: { c: [0, -0.22], r: [1.1, 0.74, 0.86] },
    dome:   { c: [-0.32, 0.43, 0.02], r: [0.78, 0.8, 0.76] },
    bulge:  { c: [0.56, -0.04, 0.02], r: [0.56, 0.62, 0.72] },
    lobe:   { c: [0.53, 0.62], r: [0.45, 0.8, 0.58], a: -0.1 },
    k: 0.38, kLobe: 0.22,
  },
  Inflado: {
    bottom: { c: [0, -0.18], r: [1.2, 0.82, 0.95] },
    dome:   { c: [-0.28, 0.32, 0.02], r: [0.92, 0.84, 0.86] },
    bulge:  { c: [0.56, -0.02, 0.02], r: [0.66, 0.72, 0.82] },
    lobe:   { c: [0.52, 0.6], r: [0.48, 0.76, 0.62], a: -0.1 },
    k: 0.45, kLobe: 0.28,
  },
  Caido: {
    bottom: { c: [0, -0.32], r: [1.2, 0.66, 0.9] },
    dome:   { c: [-0.32, 0.12, 0.02], r: [0.82, 0.66, 0.76] },
    bulge:  { c: [0.6, -0.12, 0.02], r: [0.6, 0.58, 0.72] },
    lobe:   { c: [0.62, 0.5], r: [0.45, 0.78, 0.57], a: -0.28 },
    k: 0.4, kLobe: 0.34,
  },
  Estirado: {
    bottom: { c: [0, -0.2], r: [1.06, 0.76, 0.84] },
    dome:   { c: [-0.3, 0.54, 0.02], r: [0.77, 0.84, 0.74] },
    bulge:  { c: [0.54, 0.02, 0.02], r: [0.54, 0.64, 0.7] },
    lobe:   { c: [0.47, 0.86], r: [0.43, 0.96, 0.56], a: -0.08 },
    k: 0.38, kLobe: 0.28,
  },
};
export const BODY_MORPHS = ['Inflado', 'Caido', 'Estirado'];
const ORIGIN_Y = 0.12; // punto interior desde el que se proyecta cada dirección

function surfacePoint(dx, dy, dz, S) {
  let lo = 0.3, hi = 2.6; // AWI siempre cae entre estos radios: menos pasos para la misma precisión
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (sdf(dx * m, ORIGIN_Y + dy * m, dz * m, S) < 0) lo = m; else hi = m; }
  const t = (lo + hi) / 2; return [dx * t, ORIGIN_Y + dy * t, dz * t];
}

// degradado sin animación (para el .glb / Blender)
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function gradientSRGB(x, y, z, out) {
  const gb = sstep(-0.6, 0.9, 0.5 * x + 0.7 * y + 0.45 * z);
  const gf = sstep(0.34, 0.98, x + 0.35 * (y - 0.27) ** 2 - 0.08 * z);
  const d = new THREE.Color(C.deep), b = new THREE.Color(C.blue), o = new THREE.Color(C.orange);
  const lerp = (a, c, t) => a + (c - a) * t;
  out.setRGB(...[0, 1, 2].map((i) => { const k = ['r', 'g', 'b'][i]; const blue = lerp(d[k], b[k], gb); return lerp(blue, o[k], gf); }), THREE.SRGBColorSpace);
  return out;
}

function buildBodyGeometry() {
  let g = new THREE.IcosahedronGeometry(1, 44);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position, n = pos.count;
  const dirs = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize(); v.toArray(dirs, i * 3); }
  const make = (S) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(surfacePoint(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2], S), i * 3); return a; };
  const base = make(SHAPES.base);
  const geo = new THREE.BufferGeometry();
  geo.setIndex(g.index);
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.computeVertexNormals();
  const col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) gradientSRGB(base[i * 3], base[i * 3 + 1], base[i * 3 + 2], c).toArray(col, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
  const baseN = geo.attributes.normal.array;
  const targets = { base: geo };
  for (const name of BODY_MORPHS) {
    const p = make(SHAPES[name]);
    const tmp = new THREE.BufferGeometry(); tmp.setIndex(g.index); tmp.setAttribute('position', new THREE.BufferAttribute(p, 3)); tmp.computeVertexNormals();
    const tn = tmp.attributes.normal.array, dp = new Float32Array(n * 3), dn = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) { dp[i] = p[i] - base[i]; dn[i] = tn[i] - baseN[i]; }
    const pa = new THREE.BufferAttribute(dp, 3); pa.name = name; const na = new THREE.BufferAttribute(dn, 3); na.name = name;
    geo.morphAttributes.position.push(pa); geo.morphAttributes.normal.push(na);
    targets[name] = tmp;
  }
  return { geo, targets };
}

/* ───────────── ojos y boca: cápsulas barridas (morph-compatibles) ───────────── */
function capsulePositions(s, along = 22, radial = 24, cap = 10, flat = 0.32) {
  const [p0, p1, p2] = s.p.map((q) => new THREE.Vector2(q[0], q[1])); const r = s.r;
  const bez = (t) => new THREE.Vector2().addScaledVector(p0, (1 - t) ** 2).addScaledVector(p1, 2 * (1 - t) * t).addScaledVector(p2, t * t);
  const tan = (t) => new THREE.Vector2().addScaledVector(p1.clone().sub(p0), 2 * (1 - t)).addScaledVector(p2.clone().sub(p1), 2 * t).normalize();
  const rings = [];
  const c0 = bez(0), T0 = tan(0), c1 = bez(1), T1 = tan(1);
  for (let k = 0; k < cap; k++) { const a = (Math.PI / 2) * k / cap; rings.push([c0.clone().addScaledVector(T0, -r * Math.cos(a)), T0, r * Math.sin(a)]); }
  for (let i = 0; i <= along; i++) { const t = i / along; rings.push([bez(t), tan(t), r]); }
  for (let k = cap - 1; k >= 0; k--) { const a = (Math.PI / 2) * k / cap; rings.push([c1.clone().addScaledVector(T1, r * Math.cos(a)), T1, r * Math.sin(a)]); }
  const out = new Float32Array(rings.length * radial * 3); let o = 0;
  for (const [c, T, rr] of rings) {
    const nx = -T.y, ny = T.x;
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      out[o++] = c.x + rr * Math.cos(th) * nx; out[o++] = c.y + rr * Math.cos(th) * ny; out[o++] = rr * Math.sin(th) * flat;
    }
  }
  return { out, ringCount: rings.length, radial };
}
function featureGeometry(baseShape, morphs) {
  const b = capsulePositions(baseShape);
  const idx = [];
  for (let a = 0; a < b.ringCount - 1; a++) for (let j = 0; j < b.radial; j++) {
    const j2 = (j + 1) % b.radial, A = a * b.radial;
    const i0 = A + j, i1 = A + j2, i2 = A + b.radial + j, i3 = A + b.radial + j2;
    idx.push(i0, i1, i2, i1, i3, i2);
  }
  const geo = new THREE.BufferGeometry(); geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(b.out, 3)); geo.computeVertexNormals();
  geo.morphTargetsRelative = true; geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
  for (const [name, s] of Object.entries(morphs)) {
    const p = capsulePositions(s).out;
    const tmp = new THREE.BufferGeometry(); tmp.setIndex(idx); tmp.setAttribute('position', new THREE.BufferAttribute(p, 3)); tmp.computeVertexNormals();
    const dp = p.map((v, i) => v - b.out[i]); const dn = tmp.attributes.normal.array.map((v, i) => v - geo.attributes.normal.array[i]);
    const pa = new THREE.BufferAttribute(dp, 3); pa.name = name; const na = new THREE.BufferAttribute(dn, 3); na.name = name;
    geo.morphAttributes.position.push(pa); geo.morphAttributes.normal.push(na);
  }
  return geo;
}
const EYE = { p: [[0, -0.105], [0, 0], [0, 0.105]], r: 0.103 };
const EYE_HAPPY = { p: [[-0.13, -0.06], [0, 0.2], [0.13, -0.06]], r: 0.05 };
// ojo entrecerrado: la cápsula se acorta pero conserva sus puntas redondas
const EYE_SHORT = { p: [[0, -0.012], [0, 0], [0, 0.012]], r: 0.1 };
// ojo cerrado como rayita: paso intermedio natural entre ojo neutro y arquito feliz
const EYE_LINE = { p: [[-0.11, 0], [0, 0], [0.11, 0]], r: 0.045 };
const MOUTH = { p: [[-0.077, 0], [0, 0], [0.077, 0]], r: 0.037 };
const MOUTH_MORPHS = {
  Sonrisa: { p: [[-0.115, 0.05], [0, -0.08], [0.115, 0.05]], r: 0.034 },
  Ceno:    { p: [[-0.105, -0.045], [0, 0.075], [0.105, -0.045]], r: 0.034 },
  Abierta: { p: [[-0.04, 0], [0, 0], [0.04, 0]], r: 0.078 },
  // combinaciones propias para que sonrisa + boca abierta no se superpongan
  SonrisaAbierta: { p: [[-0.1, 0.035], [0, -0.11], [0.1, 0.035]], r: 0.058 },
  CenoAbierta:    { p: [[-0.095, -0.03], [0, 0.1], [0.095, -0.03]], r: 0.052 },
};

/* ───────────── shader: degradado vivo + gelatina ───────────── */
const BODY_PIVOT_Y = 0.34;   // base del cuerpo en el espacio de AWI
const BODY_CENTER = 0.95;    // centro del cuerpo respecto de su base
const ARM_Y = -0.4;          // hombros respecto al centro
const EYE_X = 0.385, EYE_Y = 0.27, MOUTH_Y = 0.055;
const BODY_BASE = 0.3, BODY_HEIGHT = 2.55;
const SIT_DROP = 0.3; // cuánto baja el cuerpo al sentarse

/* ── brazos: "porotitos" con las dos puntas siempre redondas ──
   El largo cambia con un morph que estira solo el tramo recto, así las puntas nunca se afinan. */
const ARM_TOP = 0.1, ARM_R1 = 0.135, ARM_R2 = 0.162;   // hombro (metido en el cuerpo) y mano, un poco más gordita
const ARM_L0 = 0.8, ARM_L1 = 2.2;                       // rango de la forma (el largo usado es fijo)
const ARM_LEN = 1.25;                                   // largo de los brazos de AWI
const armTotal = (L) => 0.415 * L + ARM_TOP;            // la punta de la mano queda en -0.415·L
function armProfile(L) {
  const len = Math.max(0.01, armTotal(L) - ARM_R1 - ARM_R2), pts = [], N = 12;
  for (let i = 0; i <= N; i++) { const a = (i / N) * (Math.PI / 2); pts.push(new THREE.Vector2(ARM_R1 * Math.sin(a), -ARM_R1 + ARM_R1 * Math.cos(a))); }
  for (let i = 0; i <= N; i++) { const a = (i / N) * (Math.PI / 2); pts.push(new THREE.Vector2(ARM_R2 * Math.cos(a), -ARM_R1 - len - ARM_R2 * Math.sin(a))); }
  pts[pts.length - 1].x = 0.0001;
  return pts.reverse(); // de abajo hacia arriba: así las caras miran hacia afuera
}
function armGeometry() {
  const base = new THREE.LatheGeometry(armProfile(ARM_L0), 32), long = new THREE.LatheGeometry(armProfile(ARM_L1), 32);
  base.computeVertexNormals(); long.computeVertexNormals();
  base.morphTargetsRelative = true;
  const dp = long.attributes.position.array.map((v, i) => v - base.attributes.position.array[i]);
  const dn = long.attributes.normal.array.map((v, i) => v - base.attributes.normal.array[i]);
  const pa = new THREE.BufferAttribute(dp, 3); pa.name = 'Largo'; const na = new THREE.BufferAttribute(dn, 3); na.name = 'Largo';
  base.morphAttributes.position = [pa]; base.morphAttributes.normal = [na];
  return base;
}
// largo del brazo: el morph puede pasar de 1 (se estira más allá del rango si la lupa lo necesita)
function setArmLen(arm, L) {
  arm.userData.L = L;
  arm.children[0].morphTargetInfluences[0] = (L - ARM_L0) / (ARM_L1 - ARM_L0);
}

const VERT_HEAD = /* glsl */`
uniform mat4 uRoot; uniform mat4 uRootInv; uniform vec3 uJig; uniform float uDs; uniform float uTime; uniform float uWobble;
uniform float uBase; uniform float uHeight; uniform vec3 uCenter; uniform float uMT; uniform float uAgit; varying vec3 vAwi;
// deformación viva del cuerpo en el espacio de AWI
vec3 awiDeform( vec3 ap ) {
  float hh = clamp( ( ap.y - uBase ) / uHeight, 0.0, 1.0 );
  float wj = hh * hh * ( 3.0 - 2.0 * hh );
  float soft = smoothstep( 0.08, 0.45, hh );
  vec3 q = ap;
  q.y = uBase + ( ap.y - uBase ) * ( 1.0 - uDs );
  q.xz = uCenter.xz + ( ap.xz - uCenter.xz ) * ( 1.0 + uDs * 0.55 * soft );
  q += uJig * wj;
  vec3 cc = ap - uCenter;
  // lóbulos suaves que respiran (un poco más vivos si está agitado), sin perder la silueta
  float wob = sin( cc.x * 1.9 + uMT * 0.8 ) * sin( cc.y * 1.6 - uMT * 0.6 )
            + 0.5 * sin( cc.z * 2.2 + cc.y * 1.4 + uMT * 0.95 )
            + 0.3 * uAgit * sin( cc.x * 3.2 - cc.z * 2.5 + uMT * 2.0 ) * sin( cc.y * 2.7 + uMT * 1.5 );
  q += normalize( cc + vec3( 1e-4 ) ) * wob * uWobble * soft;
  // balanceo suave alrededor de la base
  float sw = 0.025 * sin( uMT * 0.5 ) * ( 1.0 + uAgit );
  vec2 rel = vec2( q.x - uCenter.x, q.y - uBase );
  vec2 rot = vec2( rel.x * cos( sw ) - rel.y * sin( sw ), rel.x * sin( sw ) + rel.y * cos( sw ) );
  q.xy = mix( q.xy, vec2( uCenter.x, uBase ) + rot, smoothstep( 0.0, 0.3, hh ) );
  return q;
}
`;
const VERT_BODY = /* glsl */`
vec4 awiW = modelMatrix * vec4( transformed, 1.0 );
vec3 ap = ( uRootInv * awiW ).xyz;
vAwi = ap;
#ifdef AWI_FEAT
// ojos y boca: se mueven con el cuerpo como una pieza rígida, sin deformarse
vec3 apC = ( uRootInv * modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
vec3 q = ap + ( awiDeform( apC ) - apC );
#else
vec3 q = awiDeform( ap );
#endif
vec4 mvPosition = viewMatrix * ( uRoot * vec4( q, 1.0 ) );
gl_Position = projectionMatrix * mvPosition;
`;
const FRAG_HEAD = /* glsl */`
uniform float uTime; uniform float uFlow; uniform float uWarm; uniform float uGlow; uniform float uHaze; uniform float uRim; uniform vec3 uCenter;
uniform vec3 uDeep; uniform vec3 uBlue; uniform vec3 uOrange; uniform vec3 uLimb; varying vec3 vAwi;
`;
const FRAG_GRAD = /* glsl */`
vec3 gp0 = vAwi - uCenter;
// remolinos internos tipo vidrio líquido: el espacio del degradado se deforma y fluye
vec3 gp = gp0;
gp.xy += 0.32 * uFlow * vec2( sin( gp0.y * 2.1 + uTime * 0.9 + sin( gp0.z * 1.7 - uTime * 0.6 ) ), cos( gp0.x * 1.9 - uTime * 0.7 + sin( gp0.y * 1.3 + uTime * 0.5 ) ) );
gp.z += 0.22 * uFlow * sin( gp0.x * 1.5 + gp0.y * 1.2 + uTime * 0.8 );
float n1 = sin( gp.x * 2.2 + uTime * 0.55 ) * sin( gp.y * 1.8 - uTime * 0.42 );
float n2 = 0.5 * sin( gp.y * 2.5 + gp.x * 1.3 + uTime * 0.72 ) + 0.5 * sin( gp.z * 2.1 - gp.x * 0.8 - uTime * 0.5 );
float gb = smoothstep( -0.6, 0.9, 0.5 * gp.x + 0.7 * gp.y + 0.45 * gp.z + 0.16 * n1 * uFlow );
vec3 gcol = mix( uDeep, uBlue, gb );
float gy = gp.y - 0.27;
float gf = smoothstep( 0.34, 0.98, gp.x + 0.35 * gy * gy - 0.08 * gp.z + 0.14 * n2 * uFlow + uWarm );
gcol = mix( gcol, uOrange, gf );
// vetas de luz que viajan por dentro
float caust = pow( 0.5 + 0.5 * sin( gp.x * 3.1 + gp.y * 2.3 - uTime * 1.1 ), 6.0 ) * 0.22 * uFlow;
gcol += caust * mix( vec3( 0.55, 0.75, 1.0 ), vec3( 1.0, 0.8, 0.6 ), gf );
#ifdef AWI_LIMB
gcol = mix( uLimb, gcol, 0.22 );
#endif
diffuseColor.rgb = pow( gcol, vec3( 2.2 ) );
`;

export function createAwi() {
  const U = {
    uRoot: { value: new THREE.Matrix4() }, uRootInv: { value: new THREE.Matrix4() },
    uJig: { value: new THREE.Vector3() }, uDs: { value: 0 }, uTime: { value: 0 }, uWobble: { value: 0.012 },
    uBase: { value: BODY_BASE }, uHeight: { value: BODY_HEIGHT }, uCenter: { value: new THREE.Vector3(0, BODY_PIVOT_Y + BODY_CENTER, 0) },
    uFlow: { value: 0.6 }, uWarm: { value: 0 }, uGlow: { value: 0.07 }, uHaze: { value: 0.15 }, uRim: { value: 0.7 },
    uMT: { value: 0 }, uAgit: { value: 0 },
    uDeep: { value: srgbVec(C.deep) }, uBlue: { value: srgbVec(C.blue) }, uOrange: { value: srgbVec(C.orange) }, uLimb: { value: srgbVec(C.limb) },
  };
  const patch = (m, kind) => {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      const rigid = kind === 'feat' || kind === 'prop'; // rasgos y objetos: se mueven con el cuerpo sin deformarse
      sh.vertexShader = (rigid ? '#define AWI_FEAT\n' : '') + VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', VERT_BODY);
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader;
      if (!rigid) {
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n' + (kind === 'limb' ? '#define AWI_LIMB\n' : '') + FRAG_GRAD)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;\nfloat awiFr = 1.0 - clamp( dot( normalize( vNormal ), normalize( vViewPosition ) ), 0.0, 1.0 );\ntotalEmissiveRadiance += mix( diffuseColor.rgb, vec3( 0.55, 0.6, 0.75 ), 0.35 ) * pow( awiFr, 2.2 ) * uHaze;\ntotalEmissiveRadiance += mix( diffuseColor.rgb * 1.8, vec3( 0.85, 0.93, 1.0 ), 0.55 ) * pow( awiFr, 3.2 ) * uRim;');
      }
    };
    m.customProgramCacheKey = () => 'awi-' + kind;
    return m;
  };
  // vidrio líquido: barniz brillante, reflejos e iridiscencia suave
  const velvet = (color, vertexColors) => new THREE.MeshPhysicalMaterial({
    color, vertexColors, roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.32,
    iridescence: 0.45, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 400], envMapIntensity: 0.55,
  });
  const bodyMat = patch(velvet('#ffffff', true), 'body');
  const limbMat = patch(velvet(C.limb, false), 'limb');
  const featMat = patch(new THREE.MeshStandardMaterial({ color: '#fffaf6', roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0.32 }), 'feat');

  const root = new THREE.Group(); root.name = 'AWI_root';
  const bodyPivot = new THREE.Group(); bodyPivot.name = 'AWI_bodyPivot'; bodyPivot.position.y = BODY_PIVOT_Y; root.add(bodyPivot);
  const { geo, targets } = buildBodyGeometry();
  const body = new THREE.Mesh(geo, bodyMat); body.name = 'AWI_body'; body.position.y = BODY_CENTER; bodyPivot.add(body);

  // medir la superficie (también en cada morph) para apoyar cara y brazos
  // la superficie se mide directo sobre la forma (SDF): mucho más rápido que lanzar rayos contra la malla
  const bisect = (f, lo, hi) => { for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } return (lo + hi) / 2; };
  const frontZ = (S, x, y) => bisect((z) => sdf(x, y, z, S), 0, 2.5);
  const sideX = (S, s) => s * bisect((x) => sdf(s * x, ARM_Y, 0, S), 0, 3);
  const FACE_Y = 0.18;
  const faceZ0 = frontZ(SHAPES.base, 0, FACE_Y);
  const faceDZ = BODY_MORPHS.map((n) => frontZ(SHAPES[n], 0, FACE_Y) - faceZ0);
  const sideR0 = sideX(SHAPES.base, 1), sideRD = BODY_MORPHS.map((n) => sideX(SHAPES[n], 1) - sideR0);
  const sideL0 = sideX(SHAPES.base, -1), sideLD = BODY_MORPHS.map((n) => sideX(SHAPES[n], -1) - sideL0);

  const face = new THREE.Group(); face.name = 'AWI_face'; body.add(face);
  face.position.z = faceZ0;
  // orienta cada rasgo según la normal de la superficie donde se apoya
  const orient = (g, x, y, lift) => {
    const e = 0.04, z = frontZ(SHAPES.base, x, y);
    const dzdx = (frontZ(SHAPES.base, x + e, y) - frontZ(SHAPES.base, x - e, y)) / (2 * e);
    const dzdy = (frontZ(SHAPES.base, x, y + e) - frontZ(SHAPES.base, x, y - e)) / (2 * e);
    g.position.set(x, y, z - faceZ0 + lift);
    g.userData.rx = Math.atan(dzdy); g.userData.ry = -Math.atan(dzdx);
    g.rotation.set(g.userData.rx, g.userData.ry, 0);
  };
  const eyeGeo = featureGeometry(EYE, { Feliz: EYE_HAPPY, Corto: EYE_SHORT, Linea: EYE_LINE });
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.name = s < 0 ? 'AWI_eyeL' : 'AWI_eyeR';
    orient(g, s * EYE_X + 0.01, EYE_Y, 0.012);
    const m = new THREE.Mesh(eyeGeo, featMat); m.name = g.name + '_mesh'; g.add(m); face.add(g); return g;
  });
  const mouth = new THREE.Group(); mouth.name = 'AWI_mouth';
  orient(mouth, 0.01, MOUTH_Y, 0.008);
  const mouthMesh = new THREE.Mesh(featureGeometry(MOUTH, MOUTH_MORPHS), featMat); mouthMesh.name = 'AWI_mouth_mesh'; mouth.add(mouthMesh); face.add(mouth);

  const armGeo = armGeometry();
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group(); a.name = s < 0 ? 'AWI_armL' : 'AWI_armR';
    const m = new THREE.Mesh(armGeo, limbMat); m.name = a.name + '_mesh';
    m.position.set(s * 0.03, ARM_TOP, 0.04); a.add(m); root.add(a); return a;
  });
  const legs = [-1, 1].map((s) => {
    const l = new THREE.Group(); l.name = s < 0 ? 'AWI_legL' : 'AWI_legR';
    l.position.set(s * 0.35, 0.52, 0.04);
    l.rotation.order = 'YXZ'; // así "sentado" apunta la pierna hacia adelante y después la cruza hacia adentro
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.205, 0.11, 12, 28), limbMat); m.name = l.name + '_mesh';
    m.position.y = -0.265; l.add(m); root.add(l); return l;
  });
  const props = createProps({ root, arms, face, eyes, setArmLen, patch: (m) => patch(m, 'prop') });
  root.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });

  const D2R = Math.PI / 180;
  let lastSquash = 0, lastAgit = 0.15, mt = 0, gt = 0, pt = 0;
  function apply(p) {
    root.position.set(p.posX, p.posY, 0);
    root.rotation.set((p.bow ?? 0) * D2R, p.turn * D2R, -p.lean * D2R);
    // sentado: el cuerpo baja hasta el piso (con un leve aplastamiento por el peso) y las piernas se cruzan adelante
    const sit = THREE.MathUtils.clamp(p.sit ?? 0, 0, 1), drop = SIT_DROP * sit;
    const sq = p.squash + 0.04 * sit;
    const sy = 1 - sq, sxz = 1 / Math.sqrt(Math.max(0.2, sy));
    lastSquash = sq;
    bodyPivot.position.y = BODY_PIVOT_Y - drop;
    bodyPivot.scale.set(sxz, sy, sxz);
    U.uBase.value = BODY_BASE - drop; U.uCenter.value.y = BODY_PIVOT_Y + BODY_CENTER - drop;
    const w = [p.inflado, p.caido, p.estirado];
    for (let i = 0; i < 3; i++) body.morphTargetInfluences[i] = w[i];
    face.position.set(p.lookX * 0.12, p.lookY * 0.09, faceZ0 + w.reduce((s, v, i) => s + v * faceDZ[i], 0));
    face.rotation.set(-p.lookY * 0.025, p.lookX * 0.1, 0);
    face.position.z += Math.abs(p.lookY) * 0.025 + Math.abs(p.lookX) * 0.02; // que la cara no se hunda al mirar
    eyes.forEach((e, i) => {
      const s = i === 0 ? -1 : 1;
      e.rotation.set(e.userData.rx, e.userData.ry, s * p.eyeTilt * D2R);
      // apertura: la cápsula se acorta (sigue redonda) y recién al parpadear se achata
      const o = p.eyeOpen, ez = p.eyeSize ?? 1, h = p.eyeHappy;
      let shortW = THREE.MathUtils.clamp((1 - o) / 0.5, 0, 1);
      let sqY = o < 0.5 ? Math.max(0.12, o / 0.5) : 1 + Math.max(0, o - 1) * 0.6;
      // ojos felices en dos tramos naturales: el ojo se cierra en rayita y la rayita se curva en arquito
      let happyW = 0, lineW = 0;
      if (h < 0.5) { const k = THREE.MathUtils.smoothstep(h, 0, 0.5); sqY *= 1 - 0.82 * k; }
      else { const k = THREE.MathUtils.smoothstep(h, 0.5, 1); lineW = 1 - k; happyW = k; shortW = 0; sqY = o < 0.5 ? Math.max(0.12, o / 0.5) : 1; }
      // se compensa el aplastamiento del cuerpo para que el ojo no se deforme
      e.scale.set(ez / sxz, (ez * sqY) / sy, ez / sxz);
      const ei = e.children[0].morphTargetInfluences;
      ei[0] = happyW; ei[1] = shortW; ei[2] = lineW;
    });
    mouth.scale.set(1 / sxz, 1 / sy, 1 / sxz);
    const mi = mouthMesh.morphTargetInfluences;
    // mezcla bilineal: cada combinación de sonrisa/ceño y apertura tiene su propia forma
    const sm = Math.max(0, p.mouthSmile), fr = Math.max(0, -p.mouthSmile), op = p.mouthOpen;
    mi[0] = sm * (1 - op); mi[1] = fr * (1 - op); mi[2] = op * (1 - sm - fr); mi[3] = sm * op; mi[4] = fr * op;
    const armY = BODY_PIVOT_Y - drop + (BODY_CENTER + ARM_Y) * sy;
    arms.forEach((a, i) => {
      const s = i === 0 ? -1 : 1;
      const x = s > 0 ? w.reduce((t, v, k) => t + v * sideRD[k], sideR0) : w.reduce((t, v, k) => t + v * sideLD[k], sideL0);
      a.position.set((x - s * 0.07) * sxz, armY, 0.02);
      const raise = ((i === 0 ? p.armLRaise : p.armRRaise) + 9) * D2R, swing = (i === 0 ? p.armLSwing : p.armRSwing) * D2R;
      a.rotation.set(-swing, 0, s * raise);
      // largo del brazo (crece desde el hombro; la mano y lo que sostiene van en la punta)
      setArmLen(a, ARM_LEN); // proporción fija de AWI
    });
    legs.forEach((l, i) => {
      const s = i === 0 ? -1 : 1;
      l.position.set(s * (0.35 - 0.04 * sit), 0.52 - drop, 0.04 + 0.2 * sit);
      l.rotation.set(-((i === 0 ? p.legLStep : p.legRStep) + 84 * sit) * D2R, -s * 40 * sit * D2R, s * p.legSpread * D2R);
    });
    U.uWarm.value = p.warm ?? 0;
    lastAgit = p.agit ?? 0.15;
    root.updateMatrixWorld(true);
    props.follow();
  }

  /* ── gelatina: un resorte sigue la "copa" del cuerpo y otro el aplastamiento ── */
  const J = { p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0, sv: 0, init: false };
  const target = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), off = new THREE.Vector3();
  const settings = { jelly: 0.6, flow: 0.6 };
  function resetJelly() { J.init = false; J.v.set(0, 0, 0); J.sv = 0; mt = 0; gt = 0; pt = 0; }
  function update(dt, time) {
    body.localToWorld(target.set(0.15, 1.2, 0));
    if (!J.init || J.p.distanceTo(target) > 2) { J.p.copy(target); J.v.set(0, 0, 0); J.s = lastSquash; J.sv = 0; J.init = true; }
    const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
    // como un líquido: sigue con algo de vaivén, sin rebotar como gelatina
    const k = 26, c = 7.8, ks = 38, cs = 9.5;
    for (let i = 0; i < steps; i++) {
      const ax = k * (target.x - J.p.x) - c * J.v.x, ay = k * (target.y - J.p.y) - c * J.v.y, az = k * (target.z - J.p.z) - c * J.v.z;
      J.v.x += ax * h; J.v.y += ay * h; J.v.z += az * h; J.p.addScaledVector(J.v, h);
      const as = ks * (lastSquash - J.s) - cs * J.sv; J.sv += as * h; J.s += J.sv * h;
    }
    off.subVectors(J.p, target).multiplyScalar(settings.jelly * 0.55);
    if (off.length() > 0.22) off.setLength(0.22);
    root.getWorldQuaternion(tmpQ).invert(); off.applyQuaternion(tmpQ);
    U.uJig.value.copy(off);
    U.uDs.value = THREE.MathUtils.clamp((J.s - lastSquash) * settings.jelly * 0.6, -0.1, 0.1);
    U.uWobble.value = 0.003 + 0.0085 * settings.jelly + 0.014 * lastAgit;
    U.uFlow.value = settings.flow;
    // relojes integrados: la agitación acelera el movimiento sin saltos
    mt += dt * (0.5 + 1.4 * lastAgit);
    gt += dt * (0.2 + 0.55 * settings.flow + 0.6 * lastAgit);
    U.uMT.value = mt; U.uAgit.value = lastAgit; U.uTime.value = gt;
    U.uRoot.value.copy(root.matrixWorld); U.uRootInv.value.copy(root.matrixWorld).invert();
    pt += dt; props.update(pt);
  }

  const animNodes = [root, bodyPivot, face, ...eyes, mouth, ...arms, ...legs, ...props.nodes];
  const morphMeshes = [body, eyes[0].children[0], eyes[1].children[0], mouthMesh, arms[0].children[0], arms[1].children[0]];
  return {
    root, apply, update, resetJelly, settings, animNodes, morphMeshes,
    setProp: (n) => props.set(n), get prop() { return props.current; }, liveOnly: props.liveOnly,
    pickables: [body, ...arms.map((a) => a.children[0]), ...legs.map((l) => l.children[0])],
  };
}
