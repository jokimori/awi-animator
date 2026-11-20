// Objetos que AWI puede usar: lupa, libro, cine (pochoclos + anteojos 3D) y botánico (maceta + regadera).
// Son piezas suaves, mate, que siguen al personaje (y su ondulación) sin deformarse.
import * as THREE from 'three';

export const PROPS = { ninguno: 'Ninguno', lupa: 'Lupa', libro: 'Libro', cine: 'Cine', botanico: 'Botánico' };

// generador pseudoaleatorio fijo: los pochoclos y las hojas quedan siempre iguales
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function roundedRect(shape, x, y, w, h, r) {
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

export function createProps({ root, arms, face, eyes, patch }) {
  const mat = (color, o = {}) => patch(new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45, ...o }));
  const mesh = (geo, m, parent, name) => { const x = new THREE.Mesh(geo, m); x.name = name; x.castShadow = true; parent.add(x); return x; };
  const group = (name, parent) => { const g = new THREE.Group(); g.name = name; parent.add(g); return g; };
  // punto de agarre en la punta de cada brazo (el eje -y del brazo apunta hacia afuera del hombro)
  const hands = arms.map((a, i) => { const g = group(i ? 'AWI_handR' : 'AWI_handL', a); g.position.set(i ? 0.03 : -0.03, -0.37, 0.07); return g; });

  /* ── lupa: el aro delante del ojo derecho (agrandándolo) y el mango bajando hacia la mano ── */
  const lupa = group('AWI_prop_lupa', face);
  {
    const e = eyes[1].position;
    lupa.position.set(e.x + 0.04, e.y + 0.01, e.z + 0.3);
    lupa.rotation.z = 0.7; lupa.scale.setScalar(1.45);
  }
  const wood = mat('#7a4a2c', { roughness: 0.7 }), brass = mat('#d9a84c', { roughness: 0.3, metalness: 0.6, clearcoat: 0.6 });
  mesh(new THREE.TorusGeometry(0.155, 0.03, 18, 56), brass, lupa, 'AWI_lupa_aro');
  const lens = mesh(new THREE.CircleGeometry(0.152, 56), mat('#d8efff', { transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }), lupa, 'AWI_lupa_vidrio');
  lens.castShadow = false;
  mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.05, 20), brass, lupa, 'AWI_lupa_virola').position.y = -0.21;
  mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.3, 20), wood, lupa, 'AWI_lupa_mango').position.y = -0.38;

  /* ── libro abierto (sostenido delante del pecho, páginas hacia la cara) ── */
  const libro = group('AWI_prop_libro', root);
  libro.position.set(0.02, 0.9, 0.82); libro.rotation.x = -0.85; libro.scale.setScalar(2.0);
  const pageTex = canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#f7efdf'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(70,60,50,0.35)';
    for (let y = 40; y < h - 30; y += 22) g.fillRect(28, y, w - 56 - ((y * 7) % 50), 6);
  });
  const pageMat = mat('#ffffff', { map: pageTex, roughness: 0.85, clearcoat: 0 });
  const coverTex = canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#2f7d5d'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2d27a'; g.fillRect(40, 70, w - 80, 14); g.fillRect(70, 100, w - 140, 8);
    g.beginPath(); g.arc(w / 2, 230, 46, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2f7d5d'; g.beginPath(); g.arc(w / 2 + 16, 220, 40, 0, Math.PI * 2); g.fill();
  });
  const coverMat = mat('#2f7d5d', { roughness: 0.6 }), coverFront = mat('#ffffff', { map: coverTex, roughness: 0.6 });
  for (const s of [-1, 1]) {
    const half = group('AWI_libro_mitad' + (s < 0 ? 'I' : 'D'), libro);
    half.rotation.z = -s * 0.2;
    mesh(new THREE.BoxGeometry(0.3, 0.04, 0.42), pageMat, half, 'AWI_libro_hojas').position.set(s * 0.155, 0, 0);
    mesh(new THREE.BoxGeometry(0.325, 0.02, 0.45), [coverMat, coverMat, coverMat, s > 0 ? coverFront : coverMat, coverMat, coverMat], half, 'AWI_libro_tapa').position.set(s * 0.165, -0.03, 0);
  }
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 12), coverMat, libro, 'AWI_libro_lomo').rotation.x = Math.PI / 2;
  libro.children.at(-1).position.y = -0.03;

  /* ── cine: anteojos 3D (en la cara) + balde de pochoclos ── */
  const anteojos = group('AWI_prop_anteojos', face);
  const ez = eyes[0].position.z, ey = eyes[0].position.y, ex = Math.abs(eyes[0].position.x);
  anteojos.position.set(0.01, ey + 0.02, ez + 0.08); anteojos.scale.set(1.18, 1.05, 1);
  const frameShape = roundedRect(new THREE.Shape(), -0.56, -0.17, 1.12, 0.34, 0.1);
  for (const s of [-1, 1]) frameShape.holes.push(roundedRect(new THREE.Path(), s * ex - 0.175, -0.13, 0.35, 0.26, 0.06));
  const frame = mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 }), mat('#f6f2ea', { roughness: 0.5 }), anteojos, 'AWI_anteojos_marco');
  frame.position.z = -0.02;
  for (const s of [-1, 1]) {
    const l = mesh(new THREE.PlaneGeometry(0.36, 0.27), mat(s < 0 ? '#ff2f4a' : '#20c4ff', { transparent: true, opacity: 0.72, roughness: 0.1, clearcoat: 1, depthWrite: false }), anteojos, 'AWI_anteojos_lente' + (s < 0 ? 'I' : 'D'));
    l.position.set(s * ex, 0, 0); l.castShadow = false;
  }
  const balde = group('AWI_prop_pochoclos', root);
  balde.position.set(-0.05, 0.42, 1.02); balde.scale.setScalar(1.3);
  const stripes = canvasTex(512, 64, (g, w, h) => { const n = 12; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#fbf6ee' : '#e23a3f'; g.fillRect((i * w) / n, 0, w / n + 1, h); } });
  mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.38, 36, 1, true), mat('#ffffff', { map: stripes, side: THREE.DoubleSide, roughness: 0.6 }), balde, 'AWI_balde');
  mesh(new THREE.CircleGeometry(0.16, 36), mat('#e23a3f'), balde, 'AWI_balde_fondo').rotation.x = Math.PI / 2;
  balde.children.at(-1).position.y = -0.19;
  mesh(new THREE.TorusGeometry(0.22, 0.014, 8, 48), mat('#fbf6ee'), balde, 'AWI_balde_borde').rotation.x = Math.PI / 2;
  balde.children.at(-1).position.y = 0.19;
  const rnd = rng(7), cream = mat('#fff3d4', { roughness: 0.9, clearcoat: 0 }), butter = mat('#ffd768', { roughness: 0.85, clearcoat: 0 });
  const kernel = new THREE.IcosahedronGeometry(0.056, 1);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.19, h = 0.18 + (0.11 * (1 - r / 0.19)) + rnd() * 0.04;
    const k = mesh(kernel, rnd() < 0.3 ? butter : cream, balde, 'AWI_pochoclo' + i);
    k.position.set(Math.cos(a) * r, h, Math.sin(a) * r); k.scale.setScalar(0.75 + rnd() * 0.5); k.rotation.set(rnd() * 3, rnd() * 3, 0); k.castShadow = false;
  }

  /* ── botánico: maceta con plantita + regadera (en la mano derecha) ── */
  const maceta = group('AWI_prop_maceta', root);
  maceta.position.set(1.9, 0, 0.45);
  const terracota = mat('#c8683f', { roughness: 0.8, clearcoat: 0 });
  mesh(new THREE.CylinderGeometry(0.2, 0.145, 0.32, 32), terracota, maceta, 'AWI_maceta').position.y = 0.16;
  mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 40), terracota, maceta, 'AWI_maceta_borde').rotation.x = Math.PI / 2;
  maceta.children.at(-1).position.y = 0.32;
  const soil = mesh(new THREE.CircleGeometry(0.185, 32), mat('#5a3a28', { roughness: 1, clearcoat: 0 }), maceta, 'AWI_maceta_tierra');
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.3;
  const planta = group('AWI_planta', maceta); planta.position.y = 0.3;
  const leafGeo = new THREE.SphereGeometry(1, 18, 12), leafA = mat('#5daf6c', { roughness: 0.6 }), leafB = mat('#3d8b55', { roughness: 0.6 });
  const stemMat = mat('#4b8a4f');
  const lr = rng(3);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + lr() * 0.4, tall = 0.16 + lr() * 0.16;
    const stem = group('AWI_tallo' + i, planta); stem.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    mesh(new THREE.CylinderGeometry(0.008, 0.012, tall, 6), stemMat, stem, 'AWI_tallo_m' + i).position.y = tall / 2;
    const leaf = mesh(leafGeo, i % 2 ? leafA : leafB, stem, 'AWI_hoja' + i);
    leaf.scale.set(0.075, 0.016, 0.14); leaf.position.y = tall; leaf.rotation.set(0.5, a, 0);
  }
  mesh(new THREE.SphereGeometry(0.045, 16, 12), mat('#ff9fb8', { roughness: 0.5 }), planta, 'AWI_pimpollo').position.y = 0.34;
  // la regadera cuelga de la mano derecha (sigue su posición, no su giro, para quedar siempre "colgando")
  const regadera = group('AWI_prop_regadera', root);
  regadera.scale.setScalar(1.35);
  const sage = mat('#86bdb6', { roughness: 0.45, clearcoat: 0.5 });
  const cuerpo = group('AWI_regadera_cuerpo', regadera); cuerpo.rotation.z = -0.8;
  mesh(new THREE.CylinderGeometry(0.135, 0.155, 0.24, 30), sage, cuerpo, 'AWI_regadera_tanque').position.y = -0.27;
  mesh(new THREE.TorusGeometry(0.105, 0.022, 10, 26, Math.PI), sage, cuerpo, 'AWI_regadera_asa').position.y = -0.13;
  const spout = group('AWI_regadera_pico', cuerpo); spout.position.set(0.11, -0.3, 0); spout.rotation.z = -0.95;
  mesh(new THREE.CylinderGeometry(0.016, 0.028, 0.36, 12), sage, spout, 'AWI_regadera_tubo').position.y = 0.18;
  mesh(new THREE.ConeGeometry(0.05, 0.07, 18, 1, true), sage, spout, 'AWI_regadera_flor').position.y = 0.38;
  const tip = new THREE.Object3D(); tip.position.y = 0.42; spout.add(tip);
  // gotitas de agua que caen del pico a la tierra
  const agua = group('AWI_prop_agua', root);
  const dropMat = new THREE.MeshPhysicalMaterial({ color: '#7cc8ff', roughness: 0.05, transparent: true, opacity: 0.9, clearcoat: 1 });
  const dropGeo = new THREE.SphereGeometry(0.034, 12, 8);
  const drops = Array.from({ length: 8 }, (_, i) => { const d = new THREE.Mesh(dropGeo, dropMat); d.name = 'AWI_gota' + i; agua.add(d); return d; });

  const SETS = { ninguno: [], lupa: [lupa], libro: [libro], cine: [anteojos, balde], botanico: [maceta, regadera, agua] };
  const ALL = [lupa, libro, anteojos, balde, maceta, regadera, agua];
  let current = 'ninguno';
  function set(name) {
    current = SETS[name] ? name : 'ninguno';
    for (const g of ALL) g.visible = SETS[current].includes(g);
  }
  set('ninguno');

  const v = new THREE.Vector3(), a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
  // se llama al final de apply(): la regadera sigue a la mano (también queda en el .glb)
  function follow() {
    if (current !== 'botanico') return;
    root.updateMatrixWorld(true);
    regadera.position.copy(root.worldToLocal(hands[1].getWorldPosition(v)));
  }
  // animación en vivo: el agua cae y la plantita se mece
  function update(t) {
    if (current !== 'botanico') return;
    planta.rotation.z = Math.sin(t * 1.3) * 0.04; planta.rotation.x = Math.sin(t * 0.9) * 0.03;
    regadera.updateMatrixWorld(true);
    root.worldToLocal(tip.getWorldPosition(a0));
    a1.set(maceta.position.x, 0.31, maceta.position.z);
    drops.forEach((d, i) => {
      const u = (t * 1.25 + i / drops.length) % 1;
      d.position.set(a0.x + (a1.x - a0.x) * u, a0.y + (a1.y - a0.y) * u * u, a0.z + (a1.z - a0.z) * u);
      d.scale.setScalar(u > 0.92 ? (1 - u) / 0.08 : 1);
    });
  }
  return { set, follow, update, get current() { return current; }, liveOnly: [agua], nodes: [regadera] };
}
