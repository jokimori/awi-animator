// Formato interno de animación: keyframes de pose completa (todos los canales),
// tiempo normalizado 0..1 respecto de la duración. Los presets son secuencias de esos mismos keyframes.

export const GROUPS = [
  { id: 'cara', label: 'Expresión' },
  { id: 'forma', label: 'Forma y estado' },
  { id: 'brazos', label: 'Brazos' },
  { id: 'piernas', label: 'Piernas' },
  { id: 'pos', label: 'Posición' },
];

export const CHANNELS = [
  { id: 'eyeOpen', g: 'cara', label: 'Apertura de ojos', min: 0, max: 1.2, step: 0.01, def: 1, hint: ['cerrados', 'abiertos'] },
  { id: 'eyeHappy', g: 'cara', label: 'Ojos felices', min: 0, max: 1, step: 0.01, def: 0, hint: ['neutros', 'arquitos'] },
  { id: 'eyeTilt', g: 'cara', label: 'Inclinación de ojos', min: -25, max: 25, step: 1, def: 0, unit: '°', hint: ['enojado  \\ /', 'triste  / \\'] },
  { id: 'lookX', g: 'cara', label: 'Mirada horizontal', min: -1, max: 1, step: 0.01, def: 0, hint: ['izquierda', 'derecha'] },
  { id: 'lookY', g: 'cara', label: 'Mirada vertical', min: -1, max: 1, step: 0.01, def: 0, hint: ['abajo', 'arriba'] },
  { id: 'mouthSmile', g: 'cara', label: 'Sonrisa', min: -1, max: 1, step: 0.01, def: 0, hint: ['ceño', 'sonrisa'] },
  { id: 'mouthOpen', g: 'cara', label: 'Boca abierta', min: 0, max: 1, step: 0.01, def: 0, hint: ['cerrada', 'abierta'] },
  { id: 'agit', g: 'forma', label: 'Agitación', min: 0, max: 1, step: 0.01, def: 0.15, hint: ['calma', 'agitado'] },
  { id: 'warm', g: 'forma', label: 'Calidez del degradado', min: -0.6, max: 0.6, step: 0.01, def: 0, hint: ['más azul', 'más naranja'] },
  { id: 'squash', g: 'forma', label: 'Estirar / aplastar', min: -0.4, max: 0.4, step: 0.01, def: 0, hint: ['estirado', 'aplastado'] },
  { id: 'inflado', g: 'forma', label: 'Inflado', min: 0, max: 1, step: 0.01, def: 0, hint: ['normal', 'inflado'] },
  { id: 'caido', g: 'forma', label: 'Caído', min: 0, max: 1, step: 0.01, def: 0, hint: ['erguido', 'caído'] },
  { id: 'estirado', g: 'forma', label: 'Copete alto', min: 0, max: 1, step: 0.01, def: 0, hint: ['normal', 'alto'] },
  { id: 'armLRaise', g: 'brazos', label: 'Izquierdo · subir', min: -20, max: 170, step: 1, def: 0, unit: '°', hint: ['abajo', 'arriba'] },
  { id: 'armLSwing', g: 'brazos', label: 'Izquierdo · adelante', min: -80, max: 80, step: 1, def: 0, unit: '°', hint: ['atrás', 'adelante'] },
  { id: 'armRRaise', g: 'brazos', label: 'Derecho · subir', min: -20, max: 170, step: 1, def: 0, unit: '°', hint: ['abajo', 'arriba'] },
  { id: 'armRSwing', g: 'brazos', label: 'Derecho · adelante', min: -80, max: 80, step: 1, def: 0, unit: '°', hint: ['atrás', 'adelante'] },
  { id: 'sit', g: 'piernas', label: 'Parado / sentado', min: 0, max: 1, step: 0.01, def: 0, hint: ['parado', 'sentado'] },
  { id: 'legLStep', g: 'piernas', label: 'Izquierda · paso', min: -50, max: 50, step: 1, def: 0, unit: '°', hint: ['atrás', 'adelante'] },
  { id: 'legRStep', g: 'piernas', label: 'Derecha · paso', min: -50, max: 50, step: 1, def: 0, unit: '°', hint: ['atrás', 'adelante'] },
  { id: 'legSpread', g: 'piernas', label: 'Apertura', min: -5, max: 30, step: 1, def: 0, unit: '°', hint: ['juntas', 'abiertas'] },
  { id: 'posX', g: 'pos', label: 'Posición horizontal', min: -2.5, max: 2.5, step: 0.01, def: 0, hint: ['izquierda', 'derecha'] },
  { id: 'posY', g: 'pos', label: 'Altura (salto)', min: 0, max: 2, step: 0.01, def: 0, hint: ['piso', 'aire'] },
  { id: 'turn', g: 'pos', label: 'Giro', min: -90, max: 90, step: 1, def: 0, unit: '°', hint: ['izquierda', 'derecha'] },
  { id: 'lean', g: 'pos', label: 'Inclinación lateral', min: -30, max: 30, step: 1, def: 0, unit: '°', hint: ['izquierda', 'derecha'] },
  { id: 'bow', g: 'pos', label: 'Inclinación adelante', min: -20, max: 30, step: 1, def: 0, unit: '°', hint: ['atrás', 'adelante'] },
];
export const CH = Object.fromEntries(CHANNELS.map((c) => [c.id, c]));
export const defaultPose = () => Object.fromEntries(CHANNELS.map((c) => [c.id, c.def]));
export const normalizePose = (p) => { const d = defaultPose(); for (const k in d) if (typeof p?.[k] === 'number' && isFinite(p[k])) d[k] = p[k]; return d; };

let _id = 0;
export const newId = () => 'k' + Date.now().toString(36) + (_id++).toString(36);

// Presets: cada keyframe hereda la pose anterior y sobrescribe lo indicado.
const PRESET_DEFS = {
  neutro: { label: 'Neutro', color: '#9aa3b5', duration: 3, base: {}, keys: [
    [0, {}], [1.2, { squash: 0.035, armLRaise: 4, armRRaise: 4 }], [1.9, {}], [2.0, { eyeOpen: 0.08 }], [2.12, { eyeOpen: 1 }],
  ] },
  emocionado: { label: 'Emocionado', color: '#ff8a45', duration: 1.6,
    base: { eyeHappy: 1, mouthSmile: 1, mouthOpen: 0.35, warm: 0.12, agit: 0.45 }, keys: [
    [0, { squash: 0.2, posY: 0, armLRaise: 35, armRRaise: 35, lean: 0, legLStep: 0, legRStep: 0 }],
    [0.16, { squash: -0.18, posY: 0.55, armLRaise: 150, armRRaise: 150, mouthOpen: 0.75, legLStep: 15, legRStep: -15, lean: -6 }],
    [0.32, { squash: -0.06, posY: 0.8, armLRaise: 165, armRRaise: 165 }],
    [0.52, { squash: 0.1, posY: 0.04, armLRaise: 60, armRRaise: 60, legLStep: 0, legRStep: 0 }],
    [0.62, { squash: 0.2, posY: 0, armLRaise: 35, armRRaise: 35, mouthOpen: 0.35, lean: 0 }],
    [0.78, { squash: -0.18, posY: 0.55, armLRaise: 150, armRRaise: 150, mouthOpen: 0.75, legLStep: -15, legRStep: 15, lean: 6 }],
    [0.94, { squash: -0.06, posY: 0.8, armLRaise: 165, armRRaise: 165 }],
    [1.14, { squash: 0.1, posY: 0.04, armLRaise: 60, armRRaise: 60, legLStep: 0, legRStep: 0 }],
    [1.24, { squash: 0.2, posY: 0, armLRaise: 35, armRRaise: 35, mouthOpen: 0.35, lean: 0 }],
  ] },
  triste: { label: 'Triste', color: '#4f6fd8', duration: 4,
    base: { warm: -0.25, agit: 0.04, caido: 0.45, eyeOpen: 1, eyeTilt: 16, lookY: -0.45, mouthSmile: -0.8, armLRaise: -4, armRRaise: -4, armLSwing: 8, armRSwing: 8, squash: 0.06 }, keys: [
    [0, { lean: 0, turn: 0 }],
    [1.0, { lean: -4, turn: -6, squash: 0.1 }],
    [2.0, { lean: 0, turn: 0, squash: 0.15, lookY: -0.6, eyeOpen: 1 }],
    [2.45, { eyeOpen: 1 }], [2.55, { eyeOpen: 0.08 }], [2.7, { eyeOpen: 1 }],
    [3.0, { lean: 4, turn: 6, squash: 0.08, lookY: -0.45, eyeOpen: 1 }],
  ] },
  entusiasmado: { label: 'Entusiasmado', color: '#2a9d6f', duration: 2.4,
    base: { eyeOpen: 1.1, mouthSmile: 1, mouthOpen: 0.3, estirado: 0.35, armLRaise: 20, warm: 0.08, agit: 0.3 }, keys: [
    [0, { posX: -0.2, turn: 10, armRRaise: 120, posY: 0, squash: 0.05, legLStep: 0, legRStep: 0 }],
    [0.3, { posX: -0.1, turn: 5, armRRaise: 162, posY: 0.15, squash: -0.08, legLStep: 22 }],
    [0.6, { posX: 0, turn: 0, armRRaise: 120, posY: 0, squash: 0.06, legLStep: 0, mouthOpen: 0.6 }],
    [0.9, { posX: 0.1, turn: -5, armRRaise: 162, posY: 0.15, squash: -0.08, legRStep: 22 }],
    [1.2, { posX: 0.2, turn: -10, armRRaise: 120, posY: 0, squash: 0.05, legRStep: 0, mouthOpen: 0.3 }],
    [1.5, { posX: 0.1, turn: -5, armRRaise: 162, posY: 0.15, squash: -0.08, legLStep: 22 }],
    [1.8, { posX: 0, turn: 0, armRRaise: 120, posY: 0, squash: 0.06, legLStep: 0, mouthOpen: 0.6 }],
    [2.1, { posX: -0.1, turn: 5, armRRaise: 162, posY: 0.15, squash: -0.08, legRStep: 22, mouthOpen: 0.3 }],
  ] },
  enojado: { label: 'Enojado', color: '#e0483a', duration: 2,
    base: { warm: 0.4, agit: 0.8, inflado: 0.5, squash: 0.08, eyeOpen: 0.85, eyeTilt: -22, mouthSmile: -1, mouthOpen: 0.12, armLRaise: 22, armRRaise: 22, armLSwing: -25, armRSwing: -25, lookY: -0.3, bow: 12 }, keys: [
    [0, { posY: 0, legLStep: 0, legRStep: 0, posX: 0 }],
    [0.2, { legLStep: 30, posY: 0.12, squash: -0.04 }],
    [0.35, { legLStep: 0, posY: 0, squash: 0.17, posX: 0.04, bow: 17 }],
    [0.45, { posX: -0.04, armLRaise: 32, armRRaise: 12 }],
    [0.55, { posX: 0.03, armLRaise: 12, armRRaise: 32 }],
    [0.68, { posX: 0, squash: 0.08, armLRaise: 22, armRRaise: 22, bow: 12 }],
    [1.0, { legRStep: 30, posY: 0.12, squash: -0.04 }],
    [1.15, { legRStep: 0, posY: 0, squash: 0.17, posX: -0.04, bow: 17 }],
    [1.25, { posX: 0.04, armLRaise: 12, armRRaise: 32 }],
    [1.35, { posX: -0.03, armLRaise: 32, armRRaise: 12 }],
    [1.48, { posX: 0, squash: 0.08, armLRaise: 22, armRRaise: 22, bow: 12 }],
  ] },
  meditando: { label: 'Meditando', color: '#8f7fd6', duration: 6,
    base: { sit: 1, eyeHappy: 0.5, mouthSmile: 0.25, armLRaise: 30, armRRaise: 30, armLSwing: 50, armRSwing: 50, agit: 0.03, warm: -0.08, posY: 0.1 }, keys: [
    [0, { posY: 0.1, squash: 0 }],
    [1.5, { posY: 0.2, squash: -0.05, armLRaise: 35, armRRaise: 35 }],
    [3, { posY: 0.1, squash: 0.04, armLRaise: 30, armRRaise: 30 }],
    [4.5, { posY: 0.2, squash: -0.05, armLRaise: 35, armRRaise: 35 }],
  ] },
  curioso: { label: 'Curioso', color: '#d9a84c', duration: 3.2, prop: 'lupa',
    base: { armRRaise: 18, armRSwing: 72, armLRaise: 10, lookX: 0.12, lookY: 0.05, eyeOpen: 1.15, bow: 6, mouthSmile: 0.15, mouthOpen: 0.25, agit: 0.2 }, keys: [
    [0, { turn: 0, lookX: 0.12, armRSwing: 72 }],
    [0.9, { turn: -12, lookX: 0.2, armRSwing: 78, armRRaise: 24, bow: 10 }],
    [1.5, { eyeOpen: 1.15 }], [1.6, { eyeOpen: 0.08 }], [1.72, { eyeOpen: 1.15 }],
    [2.2, { turn: 8, lookX: 0.05, armRSwing: 68, armRRaise: 14, bow: 4 }],
  ] },
  leyendo: { label: 'Leyendo', color: '#2f7d5d', duration: 4, prop: 'libro',
    base: { armLRaise: 28, armRRaise: 28, armLSwing: 80, armRSwing: 80, lookY: -0.6, eyeOpen: 0.85, mouthSmile: 0.2, agit: 0.05, bow: 5 }, keys: [
    [0, { lookX: -0.3 }], [1.6, { lookX: 0.3 }], [1.85, { lookX: -0.3 }],
    [2.6, { eyeOpen: 0.85 }], [2.7, { eyeOpen: 0.08 }], [2.82, { eyeOpen: 0.85 }],
    [3.6, { lookX: 0.2 }],
  ] },
  cine: { label: 'En el cine', color: '#e23a3f', duration: 3, prop: 'cine',
    base: { sit: 1, eyeOpen: 1.15, mouthSmile: 0.3, agit: 0.1, armLRaise: 18, armLSwing: 55, armRRaise: 18, armRSwing: 55 }, keys: [
    [0, { armRSwing: 55, armRRaise: 18, mouthOpen: 0 }],
    [0.55, { armRSwing: 82, armRRaise: 58, mouthOpen: 0.5 }],
    [0.85, { armRSwing: 55, armRRaise: 18, mouthOpen: 0.1 }],
    [1.05, { mouthOpen: 0.35 }], [1.25, { mouthOpen: 0 }],
    [2.0, { lookX: 0.15 }], [2.6, { lookX: -0.1 }],
  ] },
  botanico: { label: 'Botánico', color: '#5daf6c', duration: 3, prop: 'botanico',
    base: { armRRaise: 70, armRSwing: 20, turn: -14, lookX: 0.45, lookY: -0.35, eyeHappy: 0.85, mouthSmile: 0.6, agit: 0.08, lean: 4 }, keys: [
    [0, { armRRaise: 68, squash: 0 }],
    [1.5, { armRRaise: 76, squash: 0.03 }],
  ] },
};
export const PRESETS = Object.fromEntries(Object.entries(PRESET_DEFS).map(([id, p]) => [id, { label: p.label, color: p.color }]));

export function buildPreset(id) {
  const def = PRESET_DEFS[id];
  // el aplastamiento de los presets se suaviza para no perder la silueta de AWI
  const soften = (o) => ('squash' in o ? { ...o, squash: o.squash * 0.55 } : o);
  let pose = { ...defaultPose(), ...soften(def.base) };
  const keys = def.keys.map(([t, over]) => { pose = { ...pose, ...soften(over) }; return { id: newId(), t: t / def.duration, pose: { ...pose } }; });
  return { preset: id, duration: def.duration, speed: 1, loop: true, prop: def.prop || 'ninguno', keys };
}

// Interpolación Catmull-Rom no uniforme por canal (con cierre cíclico si loop).
export function samplePose(proj, time) {
  const keys = proj.keys;
  if (!keys.length) return defaultPose();
  if (keys.length === 1) return { ...keys[0].pose };
  let u = time / proj.duration;
  let ext;
  if (proj.loop) {
    u = ((u % 1) + 1) % 1;
    const n = keys.length;
    ext = [keys[n - 2], keys[n - 1]].map((k) => ({ t: k.t - 1, pose: k.pose }))
      .concat(keys, [keys[0], keys[1]].map((k) => ({ t: k.t + 1, pose: k.pose })));  } else {
    u = Math.min(1, Math.max(0, u));
    if (u <= keys[0].t) return { ...keys[0].pose };
    if (u >= keys[keys.length - 1].t) return { ...keys[keys.length - 1].pose };
    ext = keys;
  }
  let i = 0;
  while (i < ext.length - 2 && !(ext[i].t <= u && u < ext[i + 1].t)) i++;
  const k1 = ext[i], k2 = ext[i + 1], k0 = ext[i - 1] || k1, k3 = ext[i + 2] || k2;
  const dt = Math.max(1e-6, k2.t - k1.t);
  const s = Math.min(1, Math.max(0, (u - k1.t) / dt));
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const out = {};
  for (const c of CHANNELS) {
    const p0 = k0.pose[c.id], p1 = k1.pose[c.id], p2 = k2.pose[c.id], p3 = k3.pose[c.id];
    const d02 = k2.t - k0.t, d13 = k3.t - k1.t;
    const m1 = d02 > 1e-6 ? ((p2 - p0) / d02) * dt : 0;
    const m2 = d13 > 1e-6 ? ((p3 - p1) / d13) * dt : 0;
    const v = h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
    out[c.id] = Math.min(c.max, Math.max(c.min, v));
  }
  return out;
}
