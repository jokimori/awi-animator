import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createAwi } from './awi.js';
import { createAura, AWI_LAYER } from './aura.js';
import { CHANNELS, CH, GROUPS, PRESETS, buildPreset, samplePose, defaultPose, normalizePose, newId } from './anim.js';

const FPS = 30;
const STORE = 'awi-animator:v1';
const SPIRIT = { jelly: 0.6, flow: 0.6, soft: 0.6, grain: 0.5 };
const $ = (s) => document.querySelector(s);

/* ───────────── escena ───────────── */
const canvas = $('#view');
const BG = '#f4eee8';
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.environmentIntensity = 0.45;
const envFor = (r) => { const pm = new THREE.PMREMGenerator(r); const t = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); return t; };
scene.environment = envFor(renderer);

scene.add(new THREE.HemisphereLight('#ffffff', '#d9c6b8', 0.4));
const key = new THREE.DirectionalLight('#ffffff', 1.7);
key.position.set(2.5, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 6, bottom: -2, near: 1, far: 25 });
key.shadow.radius = 6; key.shadow.blurSamples = 16; key.shadow.bias = -0.0004;
scene.add(key);
const fill = new THREE.DirectionalLight('#ffe6d6', 0.45); fill.position.set(-5, 2.5, 4); scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// sombra de contacto suave
const blob = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(60,40,30,0.55)'); gr.addColorStop(0.5, 'rgba(60,40,30,0.22)'); gr.addColorStop(1, 'rgba(60,40,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.003; scene.add(m); return m;
})();

const awi = createAwi();
scene.add(awi.root);
// AWI vive en su propia capa para el render "aura"; luces y sombra lo siguen viendo
awi.root.traverse((o) => { if (o.isMesh) o.layers.set(AWI_LAYER); });
scene.traverse((o) => { if (o.isLight) o.layers.enable(AWI_LAYER); });
key.shadow.camera.layers.enable(AWI_LAYER);
const aura = createAura(renderer);
const auraOpts = (p, time) => ({ soft: p.soft ?? SPIRIT.soft, grain: p.grain ?? SPIRIT.grain, time });

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
function frameCamera(cam, aspect) {
  const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  let d = 5.5 / (2 * tanH);                         // ~5.5 u de alto visibles
  d = Math.max(d, 4.6 / (2 * tanH * aspect));      // ~4.6 u de ancho visibles
  cam.aspect = aspect; cam.position.set(0, 2.05, d); cam.lookAt(0, 1.45, 0); cam.updateProjectionMatrix();
}
function makeRenderer(cv, opts = {}) {
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, ...opts });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.VSMShadowMap;
  return r;
}
function poseScene(p) {
  awi.apply(p);
  const s = 1 / (1 + p.posY * 0.9);
  blob.position.x = p.posX; blob.scale.set(2.5 * (0.7 + 0.3 * s), 1.15 * (0.7 + 0.3 * s), 1);
  blob.material.opacity = 0.25 + 0.75 * s;
}

/* ───────────── estado ───────────── */
let proj = loadProject() || buildPreset('neutro');
let time = 0;
let playing = false;
let selectedId = null;
let exporting = false;
const undoStack = [];

function loadProject() {
  try { const raw = localStorage.getItem(STORE); if (!raw) return null; return sanitize(JSON.parse(raw)); } catch { return null; }
}
function sanitize(p) {
  if (!p || !Array.isArray(p.keys)) throw new Error('Archivo de proyecto inválido');
  const keys = p.keys.filter((k) => typeof k.t === 'number').map((k) => ({ id: newId(), t: Math.min(0.999, Math.max(0, k.t)), pose: normalizePose(k.pose) })).sort((a, b) => a.t - b.t);
  return { preset: typeof p.preset === 'string' ? p.preset : null, duration: clamp(+p.duration || 2, 0.5, 20), speed: clamp(+p.speed || 1, 0.1, 4), loop: p.loop !== false, ...Object.fromEntries(Object.entries(SPIRIT).map(([k, d]) => [k, clamp(typeof p[k] === 'number' ? p[k] : d, 0, 1)])), keys: keys.length ? keys : [{ id: newId(), t: 0, pose: defaultPose() }] };
}
let saveTimer = 0;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(serialize())); } catch {} }, 250); }
const serialize = () => ({ app: 'awi-animator', version: 1, preset: proj.preset, duration: proj.duration, speed: proj.speed, loop: proj.loop, jelly: proj.jelly, flow: proj.flow, soft: proj.soft, grain: proj.grain, keys: proj.keys.map(({ t, pose }) => ({ t, pose })) });
function pushUndo() { undoStack.push(JSON.stringify(proj)); if (undoStack.length > 60) undoStack.shift(); }
function undo() { const s = undoStack.pop(); if (!s) return; proj = JSON.parse(s); if (!proj.keys.find((k) => k.id === selectedId)) selectedId = null; time = Math.min(time, proj.duration - 1e-4); changed(); }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
const snap = (t) => Math.round(t * FPS) / FPS;
const sortKeys = () => proj.keys.sort((a, b) => a.t - b.t);
const keyAt = (tt) => proj.keys.find((k) => Math.abs(k.t * proj.duration - tt) < 0.5 / FPS);
const currentPose = () => samplePose(proj, time);

/* ───────────── edición ───────────── */
let editBurst = false;
function beginEdit() { if (!editBurst) { pushUndo(); editBurst = true; } }
function endEdit() { editBurst = false; }
function editValues(vals) {
  setPlaying(false);
  beginEdit();
  let k = keyAt(time);
  if (!k) {
    k = { id: newId(), t: clamp(snap(time) / proj.duration, 0, 0.999), pose: currentPose() };
    proj.keys.push(k); sortKeys();
    time = k.t * proj.duration;
  }
  for (const [id, v] of Object.entries(vals)) k.pose[id] = clamp(v, CH[id].min, CH[id].max);
  selectedId = k.id;
  proj.preset = proj.preset && !proj.preset.endsWith('*') ? proj.preset + '*' : proj.preset;
  changed();
}
function addKey() {
  setPlaying(false);
  if (keyAt(time)) { selectedId = keyAt(time).id; return changed(); }
  pushUndo();
  const k = { id: newId(), t: clamp(snap(time) / proj.duration, 0, 0.999), pose: currentPose() };
  proj.keys.push(k); sortKeys(); selectedId = k.id; time = k.t * proj.duration; changed();
}
function deleteKey() {
  const k = proj.keys.find((x) => x.id === selectedId) || keyAt(time);
  if (!k) return;
  if (proj.keys.length <= 1) { flash('Tiene que quedar al menos un keyframe.'); return; }
  pushUndo(); proj.keys = proj.keys.filter((x) => x !== k); selectedId = null; changed();
}
function jumpKey(dir) {
  setPlaying(false);
  const ts = proj.keys.map((k) => k.t * proj.duration);
  const eps = 0.5 / FPS;
  const t = dir > 0 ? ts.find((x) => x > time + eps) ?? ts[0] : [...ts].reverse().find((x) => x < time - eps) ?? ts[ts.length - 1];
  seek(t); selectedId = keyAt(t)?.id || null; renderTimeline();
}
function applyPreset(id) {
  pushUndo();
  proj = { ...buildPreset(id), ...Object.fromEntries(Object.keys(SPIRIT).map((k) => [k, proj[k] ?? SPIRIT[k]])) };
  selectedId = null; time = 0; changed(); setPlaying(true);
}
function seek(t) { time = clamp(t, 0, proj.duration - 1e-4); }

/* ───────────── panel ───────────── */
const presetsEl = $('#presets');
for (const [id, p] of Object.entries(PRESETS)) {
  const b = document.createElement('button'); b.className = 'preset'; b.dataset.id = id;
  b.innerHTML = `<i style="background:${p.color}"></i><span>${p.label}</span>`;
  b.onclick = () => applyPreset(id);
  presetsEl.append(b);
}
// controles globales del "espíritu" (no son keyframes)
const spiritEl = document.createElement('section'); spiritEl.className = 'pgroup';
spiritEl.innerHTML = `<div class="plabel">Espíritu del bosque</div>
  <div class="ctl"><div class="ctl-top"><label for="s-jelly">Bruma</label><output id="o-jelly"></output></div><input type="range" id="s-jelly" min="0" max="1" step="0.01"><div class="ctl-hint"><span>firme</span><span>etérea</span></div></div>
  <div class="ctl"><div class="ctl-top"><label for="s-flow">Degradado vivo</label><output id="o-flow"></output></div><input type="range" id="s-flow" min="0" max="1" step="0.01"><div class="ctl-hint"><span>quieto</span><span>fluye</span></div></div>
  <div class="ctl"><div class="ctl-top"><label for="s-soft">Difuminado</label><output id="o-soft"></output></div><input type="range" id="s-soft" min="0" max="1" step="0.01"><div class="ctl-hint"><span>nítido</span><span>aura</span></div></div>
  <div class="ctl"><div class="ctl-top"><label for="s-grain">Grano</label><output id="o-grain"></output></div><input type="range" id="s-grain" min="0" max="1" step="0.01"><div class="ctl-hint"><span>limpio</span><span>aerógrafo</span></div></div>`;
document.getElementById('groups').after(spiritEl); // Espíritu del bosque va al final
for (const k of Object.keys(SPIRIT)) {
  const inp = spiritEl.querySelector('#s-' + k);
  inp.addEventListener('pointerdown', () => pushUndo());
  inp.addEventListener('input', () => { proj[k] = +inp.value; changed(); });
}
const groupsEl = $('#groups');
const ctlEls = {};
GROUPS.forEach((g, gi) => {
  const d = document.createElement('details'); d.className = 'pgroup'; d.open = innerWidth > 860 || gi === 0;
  d.innerHTML = `<summary class="plabel">${g.label}</summary>`;
  for (const c of CHANNELS.filter((c) => c.g === g.id)) {
    const row = document.createElement('div'); row.className = 'ctl';
    row.innerHTML = `<div class="ctl-top"><label for="c-${c.id}">${c.label}</label><output></output></div>
      <input type="range" id="c-${c.id}" min="${c.min}" max="${c.max}" step="${c.step}">
      <div class="ctl-hint"><span>${c.hint[0]}</span><span>${c.hint[1]}</span></div>`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    input.addEventListener('input', () => { editValues({ [c.id]: +input.value }); });
    input.addEventListener('change', endEdit);
    row.querySelector('label').addEventListener('dblclick', () => { editValues({ [c.id]: c.def }); endEdit(); });
    ctlEls[c.id] = { row, input, out };
    d.append(row);
  }
  groupsEl.append(d);
});
const fmt = (c, v) => (c.unit === '°' ? Math.round(v) + '°' : v.toFixed(2));
function syncPanel(p) {
  const k = keyAt(time);
  for (const c of CHANNELS) {
    const e = ctlEls[c.id];
    if (document.activeElement !== e.input || playing) e.input.value = p[c.id];
    e.out.textContent = fmt(c, p[c.id]);
    e.row.classList.toggle('keyed', !!k);
  }
}
$('#resetPose').onclick = () => { editValues(defaultPose()); endEdit(); }; // pose neutra completa: centrado, en el piso y de frente

/* ───────────── línea de tiempo ───────────── */
const tlScroll = $('#tlScroll'), tlTrack = $('#tlTrack'), tlLane = $('#tlLane'), tlRuler = $('#tlRuler'), tlHead = $('#tlHead');
let trackW = 600;
function renderTimeline() {
  const pxPerSec = innerWidth < 860 ? 150 : 120;
  trackW = Math.max(tlScroll.clientWidth - 2, proj.duration * pxPerSec);
  tlTrack.style.width = trackW + 'px';
  let html = '';
  const steps = Math.round(proj.duration * 10);
  for (let i = 0; i <= steps; i++) {
    const t = i / 10, major = i % 5 === 0;
    html += `<div class="tick${major ? ' major' : ''}" style="left:${(t / proj.duration) * trackW}px">${major ? `<span>${t.toFixed(1)}s</span>` : ''}</div>`;
  }
  tlRuler.innerHTML = html;
  tlLane.innerHTML = proj.keys.map((k) => `<div class="kf${k.id === selectedId ? ' sel' : ''}" data-id="${k.id}" style="left:${k.t * trackW}px" title="${(k.t * proj.duration).toFixed(2)} s"></div>`).join('') + '<div class="tl-end"></div>';
}
function updateHead() {
  const x = (time / proj.duration) * trackW;
  tlHead.style.transform = `translateX(${x}px)`;
  if (playing) { const sl = tlScroll.scrollLeft, w = tlScroll.clientWidth; if (x < sl || x > sl + w - 20) tlScroll.scrollLeft = x - 20; }
}
let drag = null;
tlTrack.addEventListener('pointerdown', (e) => {
  const rect = tlTrack.getBoundingClientRect();
  const kfEl = e.target.closest('.kf');
  setPlaying(false);
  if (kfEl) {
    const k = proj.keys.find((x) => x.id === kfEl.dataset.id);
    selectedId = k.id; seek(k.t * proj.duration);
    drag = { type: 'key', k, el: kfEl, x0: e.clientX, moved: false, rect };
    kfEl.classList.add('dragging');
  } else {
    drag = { type: 'scrub', rect };
    if (e.pointerType === 'touch') { drag.type = 'tap'; drag.x0 = e.clientX; }
    else seek(((e.clientX - rect.left) / trackW) * proj.duration);
    selectedId = keyAt(time)?.id || null;
  }
  tlTrack.setPointerCapture(e.pointerId);
  renderTimeline(); refresh();
});
tlTrack.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const x = e.clientX - drag.rect.left;
  if (drag.type === 'key') {
    if (!drag.moved && Math.abs(e.clientX - drag.x0) < 4) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; }
    const t = clamp(snap((x / trackW) * proj.duration), 0, proj.duration - 1 / FPS);
    const collide = proj.keys.some((o) => o !== drag.k && Math.abs(o.t * proj.duration - t) < 0.5 / FPS);
    if (!collide) { drag.k.t = t / proj.duration; seek(t); drag.el.style.left = drag.k.t * trackW + 'px'; }
  } else if (drag.type === 'scrub') {
    seek((x / trackW) * proj.duration); selectedId = keyAt(time)?.id || null;
  }
  refresh();
});
const endDrag = () => {
  if (!drag) return;
  if (drag.type === 'tap') { seek(((drag.x0 - drag.rect.left) / trackW) * proj.duration); selectedId = keyAt(time)?.id || null; }
  if (drag.type === 'key' && drag.moved) { sortKeys(); proj.preset = proj.preset && !proj.preset.endsWith('*') ? proj.preset + '*' : proj.preset; save(); }
  drag = null; renderTimeline(); refresh();
};
tlTrack.addEventListener('pointerup', endDrag);
tlTrack.addEventListener('pointercancel', () => { drag = null; renderTimeline(); });
addEventListener('resize', () => { resize(); renderTimeline(); });

/* ───────────── controles de reproducción ───────────── */
const app = $('.app');
function setPlaying(v) { const was = playing; playing = v; app.classList.toggle('playing', v); if (v && !proj.loop && time >= proj.duration - 1e-3) time = 0; if (was !== v && typeof refresh === 'function') refresh(); }
$('#playBtn').onclick = () => setPlaying(!playing);
$('#toStart').onclick = () => { seek(0); selectedId = keyAt(0)?.id || null; renderTimeline(); refresh(); };
$('#loopBtn').onclick = () => { pushUndo(); proj.loop = !proj.loop; changed(); };
$('#addKey').onclick = addKey;
$('#delKey').onclick = deleteKey;
$('#prevKey').onclick = () => jumpKey(-1);
$('#nextKey').onclick = () => jumpKey(1);
$('#undoBtn').onclick = undo;
const durInput = $('#durInput');
durInput.addEventListener('change', () => {
  const v = clamp(+durInput.value || proj.duration, 0.5, 20);
  if (v === proj.duration) { durInput.value = v; return; }
  pushUndo(); time = (time / proj.duration) * v; proj.duration = v; changed();
});
const speedSel = $('#speedSel');
speedSel.addEventListener('change', () => { pushUndo(); proj.speed = +speedSel.value; changed(); });

addEventListener('keydown', (e) => {
  if (e.target.matches('input[type=number], select, textarea') || $('#exportDlg').open) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.target.matches('input[type=range]') && e.key.startsWith('Arrow')) return;
  if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === 'k' || e.key === 'K') addKey();
  else if (e.key === 'Delete' || e.key === 'Backspace') deleteKey();
  else if (e.key === 'ArrowRight') { setPlaying(false); seek(time + 1 / FPS); selectedId = keyAt(time)?.id || null; renderTimeline(); refresh(); }
  else if (e.key === 'ArrowLeft') { setPlaying(false); seek(time - 1 / FPS); selectedId = keyAt(time)?.id || null; renderTimeline(); refresh(); }
});

/* ───────────── arrastrar a AWI en el visor ───────────── */
const raycaster = new THREE.Raycaster();
raycaster.layers.set(AWI_LAYER);
const ndc = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
let awiDrag = null;
function pointerToNdc(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); }
canvas.addEventListener('pointerdown', (e) => {
  pointerToNdc(e);
  if (!raycaster.intersectObjects(awi.pickables, false).length) return;
  const p0 = new THREE.Vector3(); raycaster.ray.intersectPlane(dragPlane, p0);
  const pose = currentPose();
  awiDrag = { p0, x: pose.posX, y: pose.posY };
  canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing');
});
canvas.addEventListener('pointermove', (e) => {
  pointerToNdc(e);
  if (!awiDrag) { if (e.pointerType === 'mouse') canvas.classList.toggle('can-grab', raycaster.intersectObjects(awi.pickables, false).length > 0); return; }
  const p = new THREE.Vector3(); if (!raycaster.ray.intersectPlane(dragPlane, p)) return;
  editValues({ posX: awiDrag.x + p.x - awiDrag.p0.x, posY: Math.max(0, awiDrag.y + p.y - awiDrag.p0.y) });
});
const endAwi = () => { if (!awiDrag) return; awiDrag = null; endEdit(); canvas.classList.remove('grabbing'); };
canvas.addEventListener('pointerup', endAwi); canvas.addEventListener('pointercancel', endAwi);

/* ───────────── refresco ───────────── */
let hintTimer = 0, hintMsg = '';
function flash(msg) { hintMsg = msg; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintMsg = ''; refresh(); }, 2400); refresh(); }
function changed() { for (const k in SPIRIT) proj[k] ??= SPIRIT[k]; awi.settings.jelly = proj.jelly; awi.settings.flow = proj.flow; save(); renderTimeline(); refresh(); }
function refresh() {
  const p = currentPose();
  if (!exporting) poseScene(p);
  syncPanel(p);
  updateHead();
  $('#tlTime').textContent = `${time.toFixed(2)} / ${proj.duration.toFixed(2)} s`;
  $('#roTime').textContent = time.toFixed(2) + ' s';
  $('#roKeys').textContent = proj.keys.length;
  $('#roSpeed').textContent = proj.speed + '×';
  const base = proj.preset?.replace('*', '');
  $('#roPreset').textContent = base ? PRESETS[base].label + (proj.preset.endsWith('*') ? ' (editado)' : '') : 'Personalizado';
  presetsEl.querySelectorAll('.preset').forEach((b) => b.classList.toggle('on', b.dataset.id === base));
  $('#loopBtn').classList.toggle('on', proj.loop);
  for (const k of Object.keys(SPIRIT)) { const inp = document.getElementById('s-' + k); if (document.activeElement !== inp) inp.value = proj[k] ?? SPIRIT[k]; document.getElementById('o-' + k).textContent = (proj[k] ?? SPIRIT[k]).toFixed(2); }
  if (document.activeElement !== durInput) durInput.value = proj.duration;
  speedSel.value = String(proj.speed);
  const k = keyAt(time);
  const hint = $('#editHint');
  if (hintMsg) hint.textContent = hintMsg;
  else if (playing) hint.innerHTML = `<span class="dot off"></span>Reproduciendo · pausá para editar`;
  else if (k) hint.innerHTML = `<span class="dot"></span>Editando keyframe ${proj.keys.indexOf(k) + 1} · <b>${(k.t * proj.duration).toFixed(2)} s</b>`;
  else hint.innerHTML = `<span class="dot off"></span>Al mover un control se crea un keyframe en <b>${snap(time).toFixed(2)} s</b>`;
  $('#delKey').disabled = !k && !selectedId;
}

function resize() {
  const r = canvas.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(r.width, r.height, false);
  frameCamera(camera, r.width / Math.max(1, r.height));
}
let last = performance.now(), uiTick = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!exporting) {
    if (playing) {
      time += dt * proj.speed;
      if (time >= proj.duration) { if (proj.loop) time %= proj.duration; else { time = proj.duration - 1e-4; setPlaying(false); } }
      poseScene(currentPose());
      updateHead();
      if (++uiTick % 3 === 0) refresh();
    }
    awi.update(dt, now / 1000);
    aura.render(scene, camera, auraOpts(proj, now / 1000));
  }
  requestAnimationFrame(loop);
}
resize(); changed();
setPlaying(true);
// compila los shaders en paralelo antes del primer cuadro (evita el congelamiento inicial)
const showReady = () => $('#loading').classList.add('done');
(renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve()).catch(() => {}).finally(() => { requestAnimationFrame(loop); requestAnimationFrame(showReady); });
new ResizeObserver(() => { resize(); renderTimeline(); updateHead(); }).observe(canvas);

/* ───────────── abrir proyecto ───────────── */
$('#openBtn').onclick = () => $('#openFile').click();
$('#openFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { const p = sanitize(JSON.parse(await f.text())); pushUndo(); proj = p; time = 0; selectedId = null; changed(); flash('Proyecto abierto: ' + f.name); }
  catch (err) { flash('No se pudo abrir: ' + err.message); }
});

/* ───────────── exportación ───────────── */
const dlg = $('#exportDlg');
let service = null; // { blender: bool }
async function checkService() {
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 1500);
    const r = await fetch('api/health', { signal: ctl.signal }); service = r.ok ? await r.json() : null;
  } catch { service = null; }
  $('#blendNote').innerHTML = service?.blender
    ? 'Proyecto editable en Blender, generado por el servicio de exportación.'
    : 'Proyecto editable en Blender. Sin servicio de exportación activo: se descarga un kit (.glb + script) que lo arma en Blender en un paso.';
}
$('#exportBtn').onclick = () => { setPlaying(false); $('#pngTime').textContent = time.toFixed(2) + ' s'; checkService(); $('#jobs').innerHTML = ''; dlg.showModal(); };
$('#fMp4').addEventListener('change', (e) => $('#mp4Opts').classList.toggle('off', !e.target.checked));
$('#fPng').addEventListener('change', (e) => $('#pngOpts').classList.toggle('off', !e.target.checked));

const baseName = () => `awi_${(proj.preset || 'personalizado').replace('*', '_editado')}_${proj.duration}s`;
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}
function jobRow(label) {
  const li = document.createElement('li'); li.className = 'job';
  li.innerHTML = `<span>${label}</span><div class="bar"><i></i></div><span class="pct">0%</span><div class="msg">En cola…</div>`;
  $('#jobs').append(li);
  return {
    progress(f, msg) { li.querySelector('i').style.width = (f * 100).toFixed(0) + '%'; li.querySelector('.pct').textContent = (f * 100).toFixed(0) + '%'; if (msg) li.querySelector('.msg').innerHTML = msg; },
    ok(msg) { li.classList.add('ok'); this.progress(1, msg); li.querySelector('.pct').textContent = '✓'; },
    err(msg) { li.classList.add('err'); li.querySelector('.pct').textContent = '✕'; li.querySelector('.msg').textContent = msg; },
  };
}
$('#doExport').onclick = async () => {
  const pngAt = time;
  const want = { png: $('#fPng').checked, mp4: $('#fMp4').checked, glb: $('#fGlb').checked, blend: $('#fBlend').checked, json: $('#fJson').checked };
  if (!Object.values(want).some(Boolean)) { $('#jobs').innerHTML = '<li class="job err"><div class="msg">Elegí al menos un formato.</div></li>'; return; }
  const btn = $('#doExport'); btn.disabled = true; $('#jobs').innerHTML = '';
  const snapshot = JSON.parse(JSON.stringify(proj));
  const rows = {};
  if (want.mp4) rows.mp4 = jobRow('MP4');
  if (want.glb) rows.glb = jobRow('.glb');
  if (want.blend) rows.blend = jobRow('.blend');
  if (want.json) rows.json = jobRow('.json');
  if (want.png) rows.png = jobRow('PNG');
  let glbCache = null;
  const getGlb = async () => (glbCache ||= await buildGLB(snapshot));
  try {
    if (want.png) {
      try { rows.png.progress(0.4, 'Renderizando la foto…'); const { b, w, h } = await exportPNG(snapshot, pngAt); rows.png.ok(`Descargado · ${w}×${h} · ${pngAt.toFixed(2)} s · ${(b.size / 1048576).toFixed(1)} MB.`); }
      catch (e) { console.error(e); rows.png.err('No se pudo generar el PNG: ' + e.message); }
    }
    if (want.json) { download(new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' }), baseName() + '.json'); rows.json.ok('Descargado.'); }
    if (want.glb) {
      try { rows.glb.progress(0.3, 'Muestreando la animación…'); const b = await getGlb(); download(b, baseName() + '.glb'); rows.glb.ok(`Descargado · ${(b.size / 1024).toFixed(0)} KB · clip de ${(snapshot.duration / snapshot.speed).toFixed(2)} s a ${FPS} fps.`); }
      catch (e) { console.error(e); rows.glb.err('No se pudo generar el .glb: ' + e.message); }
    }
    if (want.blend) {
      try { await exportBlend(snapshot, getGlb, rows.blend); }
      catch (e) { console.error(e); rows.blend.err('No se pudo generar el .blend: ' + e.message); }
    }
    if (want.mp4) {
      try {
        const [w, h] = $('#mp4Size').value.split('x').map(Number);
        const b = await exportMP4(snapshot, { w, h, bg: $('#mp4Bg').value, loops: snapshot.loop ? +$('#mp4Loops').value : 1 }, (f) => rows.mp4.progress(f, 'Renderizando cuadros…'));
        download(b, `${baseName()}_${w}x${h}.mp4`);
        rows.mp4.ok(`Descargado · ${(b.size / 1048576).toFixed(1)} MB · ${w}×${h} · ${FPS} fps.`);
      } catch (e) { console.error(e); rows.mp4.err(e.message); }
    }
  } finally { btn.disabled = false; exporting = false; refresh(); }
};

// Recorre la animación cuadro a cuadro (tiempo real = tiempo de animación / velocidad).
function frameTimes(p, loops = 1) {
  const real = (p.duration / p.speed) * loops;
  const n = Math.max(1, Math.round(real * FPS));
  return { n, anim: (i) => (i / FPS) * p.speed };
}

async function buildGLB(p) {
  exporting = true;
  try {
    const { n, anim } = frameTimes(p);
    const count = n + 1;
    const times = new Float32Array(count);
    const nodes = awi.animNodes.map((o) => ({ o, pos: new Float32Array(count * 3), quat: new Float32Array(count * 4), scl: new Float32Array(count * 3) }));
    const morphs = awi.morphMeshes.map((m) => ({ m, w: new Float32Array(count * m.morphTargetInfluences.length) }));
    for (let i = 0; i < count; i++) {
      times[i] = i / FPS;
      awi.apply(samplePose(p, anim(i)));
      for (const r of nodes) { r.o.position.toArray(r.pos, i * 3); r.o.quaternion.toArray(r.quat, i * 4); r.o.scale.toArray(r.scl, i * 3); }
      for (const r of morphs) r.m.morphTargetInfluences.forEach((v, j) => (r.w[i * r.m.morphTargetInfluences.length + j] = v));
    }
    const tracks = [];
    for (const r of nodes) {
      tracks.push(new THREE.VectorKeyframeTrack(`${r.o.name}.position`, times, r.pos));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${r.o.name}.quaternion`, times, r.quat));
      tracks.push(new THREE.VectorKeyframeTrack(`${r.o.name}.scale`, times, r.scl));
    }
    for (const r of morphs) tracks.push(new THREE.NumberKeyframeTrack(`${r.m.name}.morphTargetInfluences`, times, r.w));
    const clip = new THREE.AnimationClip('AWI_' + (p.preset || 'personalizado').replace('*', '_editado'), times[count - 1], tracks);
    awi.apply(samplePose(p, 0));
    const res = await new GLTFExporter().parseAsync(awi.root, { binary: true, animations: [clip] });
    return new Blob([res], { type: 'model/gltf-binary' });
  } finally { exporting = false; poseScene(currentPose()); }
}

async function exportBlend(p, getGlb, row) {
  row.progress(0.15, 'Generando modelo animado…');
  const glb = await getGlb();
  if (service?.blender) {
    row.progress(0.4, 'Blender está armando el proyecto en el servicio de exportación…');
    const frames = Math.round((p.duration / p.speed) * FPS);
    const r = await fetch(`api/blend?fps=${FPS}&frames=${frames}&name=${encodeURIComponent(baseName())}`, { method: 'POST', body: glb, headers: { 'Content-Type': 'model/gltf-binary' } });
    if (!r.ok) throw new Error((await r.text().catch(() => '')) || `el servicio respondió ${r.status}`);
    const b = await r.blob(); download(b, baseName() + '.blend');
    row.ok(`Descargado · ${(b.size / 1048576).toFixed(1)} MB · abre en Blender con rig y animación.`);
    return;
  }
  row.progress(0.6, 'Armando kit para Blender…');
  const [{ zipSync, strToU8 }, script] = await Promise.all([import('fflate'), fetch('blender/awi_to_blend.py').then((r) => { if (!r.ok) throw new Error('falta blender/awi_to_blend.py'); return r.text(); })]);
  const name = baseName();
  const readme = `AWI · kit para Blender\n\n1. Descomprimí esta carpeta.\n2. En una terminal, dentro de la carpeta:\n\n   blender -b -P awi_to_blend.py -- ${name}.glb ${name}.blend\n\n   (opcional, también renderiza el MP4 con Blender)\n   blender -b -P awi_to_blend.py -- ${name}.glb ${name}.blend ${name}.mp4\n\nO abrí Blender > Scripting > abrí awi_to_blend.py > Run Script (busca el .glb al lado del script).\n\nEl .blend queda con la cámara frontal fija, luces, fondo crema y la animación a ${FPS} fps.\n`;
  const zip = zipSync({ [`${name}/${name}.glb`]: new Uint8Array(await glb.arrayBuffer()), [`${name}/awi_to_blend.py`]: strToU8(script), [`${name}/LEEME.txt`]: strToU8(readme) });
  download(new Blob([zip], { type: 'application/zip' }), name + '_blender_kit.zip');
  row.ok(`Sin servicio de Blender activo: descargué un kit. Corré <code>blender -b -P awi_to_blend.py -- ${name}.glb ${name}.blend</code> para obtener el .blend.`);
}

async function exportMP4(p, { w, h, bg, loops }, onProgress) {
  if (!('VideoEncoder' in window)) throw new Error('Este navegador no puede codificar MP4. Usá Chrome, Edge o Safari actualizados.');
  const cfgs = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640032'].map((codec) => ({ codec, width: w, height: h, bitrate: 10_000_000, framerate: FPS, avc: { format: 'avc' } }));
  let config = null;
  for (const c of cfgs) { try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch {} }
  if (!config) throw new Error(`Este navegador no puede codificar H.264 a ${w}×${h}. Probá otro formato o Chrome.`);
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h, frameRate: FPS }, fastStart: 'in-memory' });
  let encErr = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (encErr = e) });
  enc.configure(config);

  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const r = makeRenderer(cv, { preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(w, h, false);
  const cam = camera.clone(); frameCamera(cam, w / h);
  const auraX = createAura(r);
  const prevBg = scene.background, prevEnv = scene.environment;
  const env = envFor(r);
  exporting = true;
  try {
    scene.background = new THREE.Color(bg); scene.environment = env;
    const { n, anim } = frameTimes(p, loops);
    const savedSettings = { ...awi.settings };
    Object.assign(awi.settings, { jelly: p.jelly ?? SPIRIT.jelly, flow: p.flow ?? SPIRIT.flow });
    awi.resetJelly();
    // precalentar la gelatina con una vuelta completa para que el loop arranque "vivo"
    if (p.loop) { const w = frameTimes(p, 1); for (let i = 0; i < w.n; i++) { poseScene(samplePose(p, w.anim(i))); awi.update(1 / FPS, (i - w.n) / FPS); } }
    for (let i = 0; i < n; i++) {
      if (encErr) throw encErr;
      poseScene(samplePose(p, anim(i)));
      awi.update(1 / FPS, i / FPS);
      if (i === n - 1) Object.assign(awi.settings, savedSettings);
      auraX.render(scene, cam, auraOpts(p, i / FPS));
      const vf = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: i % FPS === 0 }); vf.close();
      if (enc.encodeQueueSize > 8) await new Promise((res) => enc.addEventListener('dequeue', res, { once: true }));
      if (i % 4 === 0) { onProgress(i / n); await new Promise((res) => setTimeout(res, 0)); }
    }
    await enc.flush();
    if (encErr) throw encErr;
    muxer.finalize();
    onProgress(1);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } catch (e) {
    throw new Error('Falló la codificación del video: ' + (e.message || e));
  } finally {
    try { enc.state !== 'closed' && enc.close(); } catch {}
    scene.background = prevBg; scene.environment = prevEnv; env.dispose(); auraX.dispose(); r.dispose(); r.forceContextLoss?.();
    exporting = false; awi.resetJelly(); poseScene(currentPose());
  }
}

// Foto fija en alta resolución (mismo render que el MP4)
async function renderStill(p, { w = 2048, h = 2048, bg = BG, t = 0 } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const transparent = bg === 'transparent';
  const r = makeRenderer(cv, { preserveDrawingBuffer: true, alpha: transparent }); r.setPixelRatio(1); r.setSize(w, h, false);
  if (transparent) r.setClearColor(0x000000, 0);
  const cam = camera.clone(); frameCamera(cam, w / h);
  const auraX = createAura(r), env = envFor(r);
  const prevBg = scene.background, prevEnv = scene.environment;
  exporting = true;
  try {
    scene.background = transparent ? null : new THREE.Color(bg); scene.environment = env;
    Object.assign(awi.settings, { jelly: p.jelly ?? SPIRIT.jelly, flow: p.flow ?? SPIRIT.flow });
    awi.resetJelly();
    const steps = Math.round(Math.max(t, 1 / FPS) * FPS);
    for (let i = 0; i <= steps; i++) { poseScene(samplePose(p, (i / FPS) * p.speed)); awi.update(1 / FPS, i / FPS); }
    poseScene(samplePose(p, t * p.speed)); awi.update(1e-4, t); // pose exacta del momento elegido
    auraX.render(scene, cam, auraOpts(p, t));
    return await new Promise((res) => cv.toBlob(res, 'image/png'));
  } finally {
    scene.background = prevBg; scene.environment = prevEnv; env.dispose(); auraX.dispose(); r.dispose(); r.forceContextLoss?.();
    exporting = false; awi.resetJelly(); changed();
  }
}

async function exportPNG(p, at) {
  const [w, h] = $('#pngSize').value.split('x').map(Number);
  const b = await renderStill(p, { w, h, bg: $('#pngBg').value, t: at / p.speed });
  download(b, `${baseName()}_${at.toFixed(2)}s_${w}x${h}.png`);
  return { b, w, h };
}
$('#pngBtn').onclick = async () => {
  setPlaying(false);
  const btn = $('#pngBtn'); btn.disabled = true; flash('Generando PNG…');
  try { const { w, h } = await exportPNG(JSON.parse(JSON.stringify(proj)), time); flash(`PNG descargado · ${w}×${h} · ${time.toFixed(2)} s`); }
  catch (e) { console.error(e); flash('No se pudo generar el PNG: ' + e.message); }
  finally { btn.disabled = false; }
};

window.__awiDebug = { renderer, scene, camera, aura, awi, poseScene, currentPose: () => currentPose() };
window.__awi = { exportPNG, renderStill, buildPreset, get proj() { return proj; }, buildGLB, exportMP4, samplePose };
