(function () {
'use strict';
const $ = (s) => document.querySelector(s);
function fail(msg) { const f = $('#fail'); f.hidden = false; f.querySelector('p').textContent = msg; }
if (!window.THREE) { fail('No se pudo cargar Three.js. Revisa tu conexión y vuelve a abrir la página.'); return; }

// ───────────────────────── utilidades ─────────────────────────
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const ease = (p) => p * p * (3 - 2 * p);
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function mulberry(seed) {
  return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rnd = mulberry(20261113);              // semilla fija: el mundo siempre es el mismo
const rr = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const rand = (a, b) => a + (b - a) * Math.random();
const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ───────────────────────── render ─────────────────────────
const canvas = $('#c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { fail('Tu navegador no pudo iniciar los gráficos 3D (WebGL). Prueba con otro navegador o dispositivo.'); return; }
const COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = new THREE.Color(0xd6f0ff);
scene.background = FOG.clone();
scene.fog = new THREE.Fog(FOG.getHex(), 60, 300);
const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 800);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const skyMesh = (() => {
  const g = new THREE.SphereGeometry(520, 24, 14);
  const P = g.attributes.position, col = new Float32Array(P.count * 3);
  const top = new THREE.Color(0x3f9ef5), mid = new THREE.Color(0x9bd6ff), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const h = P.getY(i) / 520;
    if (h < 0) c.copy(FOG); else if (h < 0.22) c.copy(FOG).lerp(mid, h / 0.22); else c.copy(mid).lerp(top, (h - 0.22) / 0.78);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; m.frustumCulled = false; scene.add(m); return m;
})();

const hemi = new THREE.HemisphereLight(0xf2f9ff, 0xb6c296, 0.58);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 0.62);
sun.castShadow = true;
sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
const SH = 42;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH; sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
scene.add(sun); scene.add(sun.target);
const SUN_OFF = new THREE.Vector3(38, 58, 42);

// ───────────────────────── geometría compartida ─────────────────────────
const GC = {};
const geoCache = (k, make) => GC[k] || (GC[k] = make());
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const gCyl = (ratio, seg) => geoCache('c' + ratio + '_' + seg, () => new THREE.CylinderGeometry(ratio, 1, 1, seg));
const gSph = (seg) => geoCache('s' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(5, Math.round(seg * 0.7))));
const gCone = (seg) => geoCache('k' + seg, () => new THREE.ConeGeometry(1, 1, seg));
const gIco = (d) => geoCache('i' + d, () => new THREE.IcosahedronGeometry(1, d));
function flat(g) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }
const G_ROCK = flat(new THREE.DodecahedronGeometry(1, 0));
const G_PYR = flat(new THREE.ConeGeometry(1, 1, 4)).rotateY(Math.PI / 4);

function roundedBox(w, h, d, r, s) {
  s = s || 8;
  const g = new THREE.BoxGeometry(w, h, d, s, s, s), P = g.attributes.position, N = g.attributes.normal;
  const H = [w / 2, h / 2, d / 2]; r = Math.min(r, H[0], H[1], H[2]);
  const v = [0, 0, 0], inner = [0, 0, 0];
  for (let i = 0; i < P.count; i++) {
    v[0] = P.getX(i); v[1] = P.getY(i); v[2] = P.getZ(i);
    let len = 0;
    for (let a = 0; a < 3; a++) {
      const u = v[a] / H[a], au = Math.abs(u), sg = u < 0 ? -1 : 1;
      v[a] = au <= 0.25 ? (u / 0.25) * (H[a] - r) : sg * (H[a] - r + r * (au - 0.25) / 0.75);
      inner[a] = clamp(v[a], -(H[a] - r), H[a] - r);
      len += (v[a] - inner[a]) * (v[a] - inner[a]);
    }
    len = Math.sqrt(len) || 1;
    const nx = (v[0] - inner[0]) / len, ny = (v[1] - inner[1]) / len, nz = (v[2] - inner[2]) / len;
    P.setXYZ(i, inner[0] + nx * r, inner[1] + ny * r, inner[2] + nz * r); N.setXYZ(i, nx, ny, nz);
  }
  return g;
}
const gRBox = (w, h, d, r) => geoCache('r' + [w, h, d, r].join('_'), () => roundedBox(w, h, d, r, 8));

function lathe(pts, seg) {
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(p[0], 0.0005), p[1])), seg || 30);
  g.rotateY(Math.PI);                                       // costura hacia atrás
  const P = g.attributes.position, N = g.attributes.normal; let bi = 0, br = -1;
  for (let i = 0; i < P.count; i++) { const r = Math.hypot(P.getX(i), P.getZ(i)); if (r > br) { br = r; bi = i; } }
  if (P.getX(bi) * N.getX(bi) + P.getZ(bi) * N.getZ(bi) < 0) {   // normales hacia dentro: voltear
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
    for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
  }
  return g;
}
function smoothNormals(g) {
  g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal, map = new Map(), keys = new Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const k = Math.round(P.getX(i) * 400) + '_' + Math.round(P.getY(i) * 400) + '_' + Math.round(P.getZ(i) * 400);
    keys[i] = k; let a = map.get(k); if (!a) { a = [0, 0, 0]; map.set(k, a); }
    a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i);
  }
  for (let i = 0; i < P.count; i++) { const a = map.get(keys[i]), l = Math.hypot(a[0], a[1], a[2]) || 1; N.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  return g;
}
function whiteColors(g) { const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }

// ───────────────────────── Batch: muchas piezas, una sola malla ─────────────────────────
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bp = new THREE.Vector3(),
  _bs = new THREE.Vector3(), _bv = new THREE.Vector3(), _bn = new THREE.Matrix3(), _bc = new THREE.Color();
function nonIndexed(g) { if (!g.index) return g; return g.userData.ni || (g.userData.ni = g.toNonIndexed()); }
class Batch {
  constructor() { this.p = []; this.n = []; this.c = []; }
  addGeo(geo, color, m) {
    const g = nonIndexed(geo), P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    _bn.getNormalMatrix(m); if (color != null) _bc.set(color);
    for (let i = 0; i < P.count; i++) {
      _bv.fromBufferAttribute(P, i).applyMatrix4(m); this.p.push(_bv.x, _bv.y, _bv.z);
      _bv.fromBufferAttribute(N, i).applyMatrix3(_bn).normalize(); this.n.push(_bv.x, _bv.y, _bv.z);
      if (color != null) this.c.push(_bc.r, _bc.g, _bc.b); else this.c.push(C.getX(i), C.getY(i), C.getZ(i));
    }
    return this;
  }
  add(geo, color, x, y, z, sx, sy, sz, rx, ry, rz) {
    _bm.compose(_bp.set(x, y, z), _bq.setFromEuler(_be.set(rx || 0, ry || 0, rz || 0)), _bs.set(sx, sy, sz));
    return this.addGeo(geo, color, _bm);
  }
  box(c, x, y, z, w, h, d, ry, rx, rz) { return this.add(G_BOX, c, x, y, z, w, h, d, rx, ry, rz); }
  rbox(c, x, y, z, w, h, d, r, ry) { return this.add(gRBox(w, h, d, r), c, x, y, z, 1, 1, 1, 0, ry, 0); }
  cyl(c, x, y, z, rt, rb, h, seg, rx, rz) { return this.add(gCyl(Math.round(rt / rb * 1000) / 1000, seg || 10), c, x, y, z, rb, h, rb, rx, 0, rz); }
  sph(c, x, y, z, rx, ry, rz, seg) { if (ry == null) ry = rx; if (rz == null) rz = rx; return this.add(gSph(seg || 12), c, x, y, z, rx, ry, rz); }
  cone(c, x, y, z, r, h, seg, ry) { return this.add(gCone(seg || 8), c, x, y, z, r, h, r, 0, ry, 0); }
  ico(c, x, y, z, rx, ry, rz, d) { if (ry == null) ry = rx; if (rz == null) rz = rx; return this.add(gIco(d == null ? 1 : d), c, x, y, z, rx, ry, rz); }
  rock(c, x, y, z, rx, ry, rz, rot) { return this.add(G_ROCK, c, x, y, z, rx, ry == null ? rx : ry, rz == null ? rx : rz, 0, rot || 0, 0); }
  merge(o, x, y, z, ry, s) {
    s = s || 1; _bm.compose(_bp.set(x, y, z), _bq.setFromEuler(_be.set(0, ry || 0, 0)), _bs.set(s, s, s)); _bn.getNormalMatrix(_bm);
    for (let i = 0; i < o.p.length; i += 3) {
      _bv.set(o.p[i], o.p[i + 1], o.p[i + 2]).applyMatrix4(_bm); this.p.push(_bv.x, _bv.y, _bv.z);
      _bv.set(o.n[i], o.n[i + 1], o.n[i + 2]).applyMatrix3(_bn).normalize(); this.n.push(_bv.x, _bv.y, _bv.z);
      this.c.push(o.c[i], o.c[i + 1], o.c[i + 2]);
    }
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  }
  mesh(mat, shadow) {
    const m = new THREE.Mesh(this.geometry(), mat || MAT_SCENERY);
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    return m;
  }
}
const MAT_SCENERY = new THREE.MeshLambertMaterial({ vertexColors: true });
const MAT_SOFT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
const MAT_CAR = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.12 });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = MAX_ANISO; return t;
}

// ───────────────────────── colisiones ─────────────────────────
const boxes = [], circles = [];
const solidBox = (x0, x1, z0, z1) => boxes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
const solidCircle = (x, z, r) => circles.push({ x, z, r });
function pushOutBox(pos, r, b) {
  if (pos.x < b.x0 - r || pos.x > b.x1 + r || pos.z < b.z0 - r || pos.z > b.z1 + r) return false;
  const cx = clamp(pos.x, b.x0, b.x1), cz = clamp(pos.z, b.z0, b.z1), dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) { const d = Math.sqrt(d2); pos.x = cx + dx / d * r; pos.z = cz + dz / d * r; }
  else {
    const l = pos.x - b.x0, rg = b.x1 - pos.x, t = pos.z - b.z0, bt = b.z1 - pos.z, m = Math.min(l, rg, t, bt);
    if (m === l) pos.x = b.x0 - r; else if (m === rg) pos.x = b.x1 + r; else if (m === t) pos.z = b.z0 - r; else pos.z = b.z1 + r;
  }
  return true;
}
function pushOutCircle(pos, r, cx, cz, cr) {
  const dx = pos.x - cx, dz = pos.z - cz, R = r + cr, d2 = dx * dx + dz * dz;
  if (d2 >= R * R || d2 < 1e-9) return false;
  const d = Math.sqrt(d2); pos.x = cx + dx / d * R; pos.z = cz + dz / d * R; return true;
}
// para quien acompaña a Tamachin (conejo, vecina): que no atraviese paredes ni troncos
function resolveAgent(pos, r) { for (const b of boxes) pushOutBox(pos, r, b); for (const c of circles) pushOutCircle(pos, r, c.x, c.z, c.r); }

// ───────────────────────── partículas (sprites) ─────────────────────────
function glyphTex(draw) { return canvasTex(64, 64, draw); }
function heartPath(g, cx, cy, s) {
  g.beginPath(); g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.7, cy - s * 1.1, cx, cy - s * 0.35);
  g.bezierCurveTo(cx + s * 0.7, cy - s * 1.1, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.9); g.closePath();
}
function starPath(g, cx, cy, R, r, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, q = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
  g.closePath();
}
const INK = '#231d3b';
const PTEX = {
  heart: glyphTex((g) => { heartPath(g, 32, 32, 20); g.fillStyle = '#ff5c8a'; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); }),
  star: glyphTex((g) => { starPath(g, 32, 34, 26, 12, 5); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); }),
  spark: glyphTex((g) => { starPath(g, 32, 32, 28, 7, 4); g.fillStyle = '#fff6b8'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#ffb81f'; g.stroke(); }),
  zzz: glyphTex((g) => { g.font = '900 54px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = INK; g.strokeText('Z', 32, 34); g.fillStyle = '#bfe3ff'; g.fillText('Z', 32, 34); }),
  excl: glyphTex((g) => { g.font = '900 58px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = INK; g.strokeText('!', 32, 34); g.fillStyle = '#ffd23f'; g.fillText('!', 32, 34); }),
  note: glyphTex((g) => { g.font = '900 52px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.lineJoin = 'round'; g.strokeStyle = INK; g.strokeText('♪', 32, 34); g.fillStyle = '#ffffff'; g.fillText('♪', 32, 34); }),
  tear: glyphTex((g) => { g.beginPath(); g.moveTo(32, 8); g.bezierCurveTo(52, 34, 48, 56, 32, 56); g.bezierCurveTo(16, 56, 12, 34, 32, 8); g.fillStyle = '#6ec6ff'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke(); }),
  puff: glyphTex((g) => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 28); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }),
  splash: glyphTex((g) => { g.beginPath(); g.arc(32, 32, 20, 0, TAU); g.fillStyle = 'rgba(210,240,255,.95)'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#69b9ee'; g.stroke(); }),
  mist: glyphTex((g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(236,250,255,.9)'); gr.addColorStop(0.55, 'rgba(214,240,255,.45)'); gr.addColorStop(1, 'rgba(214,240,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }),
  crumb: glyphTex((g) => { g.beginPath(); g.arc(32, 32, 17, 0, TAU); g.fillStyle = '#ffe08a'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); }),
};
const PMAT = {};
for (const k in PTEX) PMAT[k] = new THREE.SpriteMaterial({ map: PTEX[k], transparent: true, depthWrite: false });
const PDEF = {
  heart: { vy: 1.3, grav: -0.2, life: 1.5, size: 0.42, spread: 0.5 }, star: { vy: 2.6, grav: 5, life: 1.0, size: 0.4, spread: 2.2 },
  spark: { vy: 1.4, grav: 0, life: 0.8, size: 0.36, spread: 1.4 }, zzz: { vy: 0.8, grav: -0.1, life: 1.9, size: 0.4, spread: 0.25 },
  excl: { vy: 1.0, grav: 0, life: 0.9, size: 0.5, spread: 0 }, note: { vy: 1.2, grav: -0.1, life: 1.5, size: 0.42, spread: 0.6 },
  tear: { vy: 0.2, grav: 5, life: 0.9, size: 0.24, spread: 0.3 }, puff: { vy: 1.1, grav: -0.4, life: 0.9, size: 0.6, spread: 0.6 },
  splash: { vy: 3.2, grav: 9, life: 0.7, size: 0.22, spread: 1.8 },
  mist: { vy: 0.1, grav: 0.35, life: 1.7, size: 0.8, spread: 0.75 }, crumb: { vy: 1.8, grav: 8, life: 0.55, size: 0.12, spread: 1.1 },
};
const particles = [];
for (let i = 0; i < 90; i++) { const s = new THREE.Sprite(PMAT.heart); s.visible = false; scene.add(s); particles.push({ s, t: 0, life: 0, vx: 0, vy: 0, vz: 0, grav: 0, size: 1 }); }
let pCursor = 0;
function emit(type, x, y, z, o) {
  const d = PDEF[type]; o = o || {};
  const p = particles[pCursor]; pCursor = (pCursor + 1) % particles.length;
  p.s.material = PMAT[type]; p.s.position.set(x, y, z); p.s.visible = true;
  const sp = o.spread != null ? o.spread : d.spread;
  p.vx = rand(-sp, sp); p.vz = rand(-sp, sp); p.vy = (o.vy != null ? o.vy : d.vy) * rand(0.8, 1.2);
  p.grav = d.grav; p.life = (o.life || d.life) * rand(0.85, 1.15); p.t = 0; p.size = (o.size || d.size);
  p.s.scale.setScalar(0.001);
}
function burst(type, x, y, z, n, o) { for (let i = 0; i < n; i++) emit(type, x + rand(-0.3, 0.3), y + rand(-0.2, 0.2), z + rand(-0.3, 0.3), o); }
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.s.visible) continue;
    p.t += dt; const k = p.t / p.life;
    if (k >= 1) { p.s.visible = false; continue; }
    p.vy -= p.grav * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    const sc = p.size * (k < 0.15 ? k / 0.15 : k > 0.65 ? (1 - k) / 0.35 : 1);
    p.s.scale.setScalar(Math.max(0.001, sc));
  }
}

// ───────────────────────── globos de texto (DOM) ─────────────────────────
const bubbleLayer = $('#bubbles'), bubbles = [];
for (let i = 0; i < 5; i++) { const el = document.createElement('div'); el.className = 'bubble'; bubbleLayer.appendChild(el); bubbles.push({ el, who: null, until: 0 }); }
let clock = 0;                                             // tiempo de juego en segundos
function say(who, text, dur) {
  let b = bubbles.find((q) => q.who === who && q.until > clock) || bubbles.find((q) => q.until <= clock) || bubbles.reduce((a, q) => (q.until < a.until ? q : a));
  b.who = who; b.until = clock + (dur || 2.8); b.el.textContent = text; b.el.classList.add('on');
}
const _pv = new THREE.Vector3();
function updateBubbles(W, H) {
  for (const b of bubbles) {
    if (!b.who) continue;
    if (b.until <= clock) { b.el.classList.remove('on'); b.who = null; continue; }
    b.who.bubblePos(_pv); _pv.project(camera);
    if (_pv.z > 1 || _pv.z < -1 || Math.abs(_pv.x) > 1.08 || _pv.y > 1.15 || _pv.y < -1.05) { b.el.style.opacity = 0; continue; }
    b.el.style.opacity = '';
    const x = clamp((_pv.x * 0.5 + 0.5) * W, 70, W - 70), y = Math.max(50, (-_pv.y * 0.5 + 0.5) * H);
    b.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%) translateY(-12px)';
  }
}
let toastT = 0; const toastEl = $('#toast');
function toast(text, dur) { toastEl.textContent = text; toastEl.classList.add('on'); toastT = dur || 3.5; }

// ───────────────────────── sonido (sintetizado, sin archivos) ─────────────────────────
const snd = { ctx: null, on: true };
function unlockAudio() {
  if (!snd.on || snd.ctx) { if (snd.ctx && snd.ctx.state === 'suspended') snd.ctx.resume().catch(() => {}); return; }
  try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) snd.ctx = new AC(); } catch (e) { snd.ctx = null; }
}
function tone(f0, f1, dur, type, vol, delay) {
  const c = snd.ctx; if (!c || !snd.on || c.state !== 'running') return;
  try {
    const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
  } catch (e) { /* sin sonido */ }
}
const SFX = {
  jump: () => tone(320, 660, 0.16, 'sine', 0.06),
  pop: () => tone(680, 1150, 0.1, 'triangle', 0.06),
  talk: () => { for (let i = 0; i < 3; i++) tone(rand(480, 900), rand(480, 900), 0.07, 'square', 0.022, i * 0.085); },
  honk: () => { tone(392, 392, 0.24, 'square', 0.035); tone(494, 494, 0.24, 'square', 0.035); },
  hit: () => tone(280, 55, 0.42, 'sawtooth', 0.07),
  splash: () => tone(950, 180, 0.26, 'triangle', 0.05),
  dizzy: () => { tone(620, 300, 0.45, 'sine', 0.05); tone(300, 620, 0.45, 'sine', 0.04, 0.3); },
  nice: () => { tone(523, 523, 0.1, 'triangle', 0.05); tone(784, 784, 0.16, 'triangle', 0.05, 0.1); },
  fridgeOpen: () => { tone(150, 85, 0.2, 'sine', 0.08); tone(1250, 1900, 0.4, 'sine', 0.022, 0.1); tone(1660, 2490, 0.34, 'sine', 0.018, 0.2); },
  fridgeShut: () => { tone(180, 70, 0.22, 'triangle', 0.08); tone(90, 60, 0.12, 'sine', 0.06, 0.02); },
  munch: () => { tone(rand(230, 320), 120, 0.06, 'square', 0.028); tone(rand(260, 360), 140, 0.05, 'square', 0.022, 0.08); },
  yay: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, i === 3 ? 0.3 : 0.12, 'triangle', 0.05, i * 0.1)),
  low: () => { tone(420, 330, 0.22, 'sine', 0.045); tone(330, 260, 0.3, 'sine', 0.04, 0.2); },
};

// ───────────────────────── Tamachin: formas ─────────────────────────
function profCircle(R, sy, n) { const p = []; n = n || 18; for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + Math.PI * i / n; p.push([R * Math.cos(a), (R + R * Math.sin(a)) * (sy || 1)]); } return p; }
const PROF_EGG = (() => { const p = []; for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + Math.PI * i / 20; p.push([0.58 * Math.cos(a) * (1 - 0.17 * Math.sin(a)), 0.73 + 0.73 * Math.sin(a)]); } return p; })();
const PROF_DROP = (() => { const p = [], R = 0.6; for (let i = 0; i <= 9; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * i / 9; p.push([R * Math.cos(a), R + R * Math.sin(a)]); } for (let i = 1; i <= 12; i++) { const u = i / 12; p.push([R * Math.pow(1 - u, 1.3) * (1 + 1.3 * u), R + 0.95 * u]); } return p; })();
const PROF_GHOST = (() => { const p = [[0, 0.22], [0.42, 0.2], [0.63, 0.04], [0.6, 0.3], [0.575, 0.55], [0.56, 0.74]]; for (let i = 1; i <= 10; i++) { const a = (Math.PI / 2) * i / 10; p.push([0.56 * Math.cos(a), 0.74 + 0.56 * Math.sin(a)]); } return p; })();
const PROF_STEM = [[0, 0], [0.4, 0], [0.48, 0.1], [0.47, 0.35], [0.43, 0.6], [0.4, 0.8], [0, 0.82]];
const PROF_CAP = [[0, 0.7], [0.55, 0.68], [0.85, 0.72], [0.88, 0.84], [0.76, 1.06], [0.52, 1.25], [0.25, 1.34], [0, 1.37]];

const SHAPES = {
  bola:     { label: 'Bola',     prof: profCircle(0.62),        H: 1.24, eyeY: 0.74, eyeX: 0.25, eyeR: 0.235, mouthY: 0.43, handY: 0.5,  footX: 0.24 },
  huevo:    { label: 'Huevo',    prof: PROF_EGG,                H: 1.46, eyeY: 0.84, eyeX: 0.235, eyeR: 0.225, mouthY: 0.52, handY: 0.55, footX: 0.24 },
  gota:     { label: 'Gota',     prof: PROF_DROP,               H: 1.55, eyeY: 0.68, eyeX: 0.245, eyeR: 0.23, mouthY: 0.38, handY: 0.45, footX: 0.24 },
  cubito:   { label: 'Cubito',   flatZ: 0.49,                   H: 1.14, eyeY: 0.7,  eyeX: 0.255, eyeR: 0.225, mouthY: 0.38, handY: 0.5,  footX: 0.26, handX: 0.6 },
  gatito:   { label: 'Gatito',   prof: profCircle(0.62, 0.95),  H: 1.5,  eyeY: 0.7,  eyeX: 0.25, eyeR: 0.23, mouthY: 0.4,  handY: 0.46, footX: 0.24, nose: true },
  fantasma: { label: 'Fantasma', prof: PROF_GHOST,              H: 1.3,  eyeY: 0.86, eyeX: 0.235, eyeR: 0.22, mouthY: 0.56, handY: 0.55, footX: 0.24, feet: false, float: 0.2 },
  hongo:    { label: 'Hongo',    prof: PROF_STEM,               H: 1.37, eyeY: 0.43, eyeX: 0.215, eyeR: 0.195, mouthY: 0.19, handY: 0.3,  footX: 0.24, face: 'cream', mouthS: 0.8 },
  estrella: { label: 'Estrella', flatZ: 0.285,                  H: 1.36, eyeY: 0.72, eyeX: 0.2,  eyeR: 0.195, mouthY: 0.47, handY: 0.6,  footX: 0.4, handX: 0.6, hands: false, mouthS: 0.9 },
};
function rAt(d, y) {
  const p = d.prof; if (!p) return 0.55;
  for (let i = p.length - 2; i >= 0; i--) {
    const a = p[i], b = p[i + 1];
    if (y >= a[1] && y <= b[1] && b[1] > a[1]) return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1]));
  }
  return 0.3;
}
function faceZ(d, x, y) { if (d.flatZ !== undefined) return d.flatZ; const r = rAt(d, y); return Math.sqrt(Math.max(r * r - x * x, 0.004)); }

function starGeo() {
  const sh = new THREE.Shape(), V = [];
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 0.92; V.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m0 = mid(V[9], V[0]); sh.moveTo(m0[0], m0[1]);
  for (let i = 0; i < 10; i++) { const m = mid(V[i], V[(i + 1) % 10]); sh.quadraticCurveTo(V[i][0], V[i][1], m[0], m[1]); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.12, bevelSegments: 5, curveSegments: 8, steps: 1 });
  g.translate(0, 0, -0.15); g.scale(0.82, 0.82, 0.92); return smoothNormals(g);
}
function ghostGeo() {
  const g = lathe(PROF_GHOST, 36), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (y < 0.32 && Math.hypot(x, z) > 0.5) { const k = (0.32 - y) / 0.32; P.setY(i, y + 0.13 * k * (0.5 + 0.5 * Math.sin(6 * Math.atan2(x, z)))); }
  }
  return g;
}
const PARTS = {};
function shapeParts(name) {
  if (PARTS[name]) return PARTS[name];
  const d = SHAPES[name]; let parts;
  switch (name) {
    case 'cubito': parts = [{ g: roundedBox(1.12, 1.12, 0.98, 0.3, 12), m: 'body', p: [0, 0.58, 0] }]; break;
    case 'estrella': parts = [{ g: starGeo(), m: 'body', p: [0, 0.62, 0] }]; break;
    case 'fantasma': parts = [{ g: ghostGeo(), m: 'body' }]; break;
    case 'gatito': {
      const ear = new THREE.ConeGeometry(0.21, 0.42, 14), inn = new THREE.ConeGeometry(0.12, 0.26, 10), ball = gSph(12);
      parts = [{ g: lathe(d.prof, 32), m: 'body' },
        { g: ear, m: 'body', p: [-0.36, 1.13, 0], r: [0, 0, 0.4] }, { g: ear, m: 'body', p: [0.36, 1.13, 0], r: [0, 0, -0.4] },
        { g: inn, m: 'pink', p: [-0.355, 1.1, 0.08], r: [0, 0, 0.4] }, { g: inn, m: 'pink', p: [0.355, 1.1, 0.08], r: [0, 0, -0.4] },
        { g: ball, m: 'alt', p: [0, 0.3, -0.62], s: [0.14, 0.14, 0.14] }, { g: ball, m: 'alt', p: [0.1, 0.5, -0.72], s: [0.12, 0.12, 0.12] }, { g: ball, m: 'alt', p: [0.05, 0.7, -0.68], s: [0.1, 0.1, 0.1] }];
      break;
    }
    case 'hongo': {
      const ball = gSph(12);
      parts = [{ g: lathe(PROF_STEM, 28), m: 'cream' }, { g: lathe(PROF_CAP, 32), m: 'body' }];
      [[0.5, 1.12, 0.55], [-0.58, 1.08, 0.4], [0.05, 1.3, 0.2], [-0.2, 1.17, -0.6], [0.6, 1.05, -0.4], [0.1, 0.98, 0.84]].forEach((q, i) => {
        const s = 0.1 + (i % 3) * 0.025; parts.push({ g: ball, m: 'white', p: [q[0] * 0.92, q[1] - 0.02, q[2] * 0.92], s: [s, s * 0.7, s] });
      });
      break;
    }
    default: parts = [{ g: lathe(d.prof, 32), m: 'body' }];
  }
  return (PARTS[name] = parts);
}

// ───────────────────────── Tamachin: cara ─────────────────────────
const MOODS = {
  contento:  { label: 'Contento',  lid: -1.5,  mouth: 'open',  blush: true, bounce: 1.25, speed: 1 },
  triste:    { label: 'Triste',    lid: -0.6,  lidZ: 0.4,  mouth: 'frown', look: [0, -0.55], droop: 0.14, bounce: 0.5, speed: 0.68 },
  asombrado: { label: 'Asombrado', lid: -1.57, eyeS: 1.22, pupilS: 0.55, mouth: 'o', speed: 1 },
  enojado:   { label: 'Enojado',   lid: -0.62, lidZ: -0.45, pupilS: 0.85, mouth: 'frown', speed: 1.12, bounce: 0.8 },
  dormido:   { label: 'Dormido',   lid: 1.12,  mouth: 'tiny',  droop: 0.08, bounce: 0.4, speed: 0.55 },
  enamorado: { label: 'Enamorado', lid: -1.5,  special: 'heart', mouth: 'smile', blush: true, speed: 0.95 },
  mareado:   { label: 'Mareado',   lid: -1.5,  special: 'spiral', mouth: 'wavy', speed: 0.8, hidden: true },
};
const TEX_SPIRAL = canvasTex(128, 128, (g) => {
  g.translate(64, 64); g.strokeStyle = '#231d3b'; g.lineWidth = 11; g.lineCap = 'round'; g.beginPath();
  for (let a = 0; a < TAU * 2.6; a += 0.1) { const r = 4 + a * 3.2; g[a ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.stroke();
});
const TEX_HEART = canvasTex(128, 128, (g) => { heartPath(g, 64, 62, 44); g.fillStyle = '#ff3f7f'; g.fill(); g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(44, 44, 9, 6, -0.6, 0, TAU); g.fill(); });
const G_EYE = new THREE.SphereGeometry(1, 28, 18), G_PUPIL = new THREE.SphereGeometry(0.5, 20, 14), G_GLINT = new THREE.SphereGeometry(0.13, 10, 8),
  G_LID = new THREE.SphereGeometry(1.1, 28, 12, 0, TAU, 0, Math.PI / 2), G_RIM = new THREE.TorusGeometry(1.1, 0.05, 6, 28, Math.PI),
  G_SPECIAL = new THREE.CircleGeometry(0.7, 24), G_BALL = new THREE.SphereGeometry(1, 14, 10);
const M_WHITE = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22 }), M_PUPIL = new THREE.MeshStandardMaterial({ color: 0x1c1730, roughness: 0.2 }),
  M_GLINT = new THREE.MeshBasicMaterial({ color: 0xffffff }), M_LINE = new THREE.MeshBasicMaterial({ color: 0x2b2145 }),
  M_MOUTH = new THREE.MeshBasicMaterial({ color: 0x3a1830 }), M_TONGUE = new THREE.MeshBasicMaterial({ color: 0xff7c9c }),
  M_PINK = new THREE.MeshStandardMaterial({ color: 0xff9db8, roughness: 0.7 }), M_CREAM = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.5 }),
  M_SPOT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
const CREAM = new THREE.Color(0xfff1d6);
const G_MOUTH = {
  open: new THREE.CircleGeometry(0.145, 22, Math.PI, Math.PI), tongue: new THREE.CircleGeometry(0.06, 14),
  arc: new THREE.TorusGeometry(0.1, 0.021, 8, 18, Math.PI), o: new THREE.CircleGeometry(0.068, 20), tiny: new THREE.CircleGeometry(0.036, 14),
  wavy: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([-3, -2, -1, 0, 1, 2, 3].map((i) => new THREE.Vector3(i * 0.05, (i % 2 ? 0.03 : -0.03), 0))), 24, 0.019, 6),
};
function makeEye(lidMat, specMat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G_EYE, M_WHITE));
  const pupilG = new THREE.Group(), pupil = new THREE.Mesh(G_PUPIL, M_PUPIL), glint = new THREE.Mesh(G_GLINT, M_GLINT);
  pupil.scale.z = 0.35; glint.position.set(0.17, 0.2, 0.12); glint.scale.z = 0.5; pupilG.add(pupil, glint); g.add(pupilG);
  const special = new THREE.Mesh(G_SPECIAL, specMat); special.position.z = 1.06; special.visible = false; g.add(special);
  const lidG = new THREE.Group(); lidG.rotation.order = 'ZXY';
  const rim = new THREE.Mesh(G_RIM, M_LINE); rim.rotation.x = Math.PI / 2;
  lidG.add(new THREE.Mesh(G_LID, lidMat), rim); g.add(lidG);
  return { g, pupilG, special, lidG };
}
const TRICK_DUR = { hop: 0.7, spin: 0.85, flip: 0.8, dance: 1.7, wave: 1.3, giggle: 0.9, wink: 0.9, shake: 0.8, bow: 1.0 };
const _tv = new THREE.Vector3();

function makeTamachin(o) {
  const T = { shape: null, def: null, mood: 'contento', scale: o.scale || 1, time: Math.random() * 10, walk: 0, sq: 0, sqV: 0, lid: [-1.5, -1.5],
    lx: 0, ly: 0, es: 1, blinkT: 1 + Math.random() * 3, blink: 0, trick: null, trickT: 0, flat: false, flatK: 0, lie: 0, lieK: 0, dz: 0, emitT: Math.random() };
  const root = new THREE.Group(), sway = new THREE.Group(), flipG = new THREE.Group(), core = new THREE.Group(), squash = new THREE.Group(),
    bodyG = new THREE.Group(), faceG = new THREE.Group();
  root.add(sway); sway.add(flipG); flipG.add(core); core.add(squash); squash.add(bodyG, faceG);
  root.scale.setScalar(T.scale); T.group = root; T.pos = root.position;
  const mats = { body: new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.02 }), alt: new THREE.MeshStandardMaterial({ roughness: 0.5 }), cream: M_CREAM, white: M_SPOT, pink: M_PINK };
  const lidMat = new THREE.MeshStandardMaterial({ roughness: 0.42 });
  const specMat = new THREE.MeshBasicMaterial({ map: TEX_SPIRAL, transparent: true, depthWrite: false });
  const eyes = [makeEye(lidMat, specMat), makeEye(lidMat, specMat)]; eyes.forEach((e) => faceG.add(e.g));
  const mouthG = new THREE.Group(); faceG.add(mouthG);
  const mouths = {};
  { const open = new THREE.Group(), tg = new THREE.Mesh(G_MOUTH.tongue, M_TONGUE); tg.position.set(0, -0.095, 0.004); tg.scale.set(1.25, 0.7, 1);
    open.add(new THREE.Mesh(G_MOUTH.open, M_MOUTH), tg); open.position.y = 0.05; mouths.open = open;
    const smile = new THREE.Mesh(G_MOUTH.arc, M_MOUTH); smile.rotation.z = Math.PI; smile.position.y = 0.04; mouths.smile = smile;
    const frown = new THREE.Mesh(G_MOUTH.arc, M_MOUTH); frown.position.y = -0.06; mouths.frown = frown;
    const mo = new THREE.Mesh(G_MOUTH.o, M_MOUTH); mo.scale.y = 1.25; mouths.o = mo;
    mouths.tiny = new THREE.Mesh(G_MOUTH.tiny, M_MOUTH); mouths.wavy = new THREE.Mesh(G_MOUTH.wavy, M_MOUTH);
    for (const k in mouths) { mouths[k].visible = false; mouthG.add(mouths[k]); } }
  const nose = new THREE.Mesh(G_BALL, M_PINK); nose.scale.set(0.05, 0.036, 0.03); faceG.add(nose);
  const cheeks = [new THREE.Mesh(G_BALL, M_PINK), new THREE.Mesh(G_BALL, M_PINK)]; cheeks.forEach((c) => { c.scale.set(0.085, 0.06, 0.028); faceG.add(c); });
  const feet = [new THREE.Mesh(G_BALL, mats.alt), new THREE.Mesh(G_BALL, mats.alt)]; feet.forEach((f) => { f.scale.set(0.17, 0.11, 0.24); f.castShadow = true; core.add(f); });
  const hands = [new THREE.Mesh(G_BALL, mats.alt), new THREE.Mesh(G_BALL, mats.alt)]; hands.forEach((h) => { h.scale.setScalar(0.105); core.add(h); });
  const halo = new THREE.Group(); core.add(halo);
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(PMAT.star); s.scale.setScalar(0.3); const a = i * TAU / 3; s.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); halo.add(s); }
  halo.visible = false;

  T.setShape = (name) => {
    if (!SHAPES[name]) name = 'bola';
    T.shape = name; const d = T.def = SHAPES[name];
    while (bodyG.children.length) bodyG.remove(bodyG.children[0]);
    for (const p of shapeParts(name)) {
      const m = new THREE.Mesh(p.g, mats[p.m]);
      if (p.p) m.position.set(p.p[0], p.p[1], p.p[2]); if (p.r) m.rotation.set(p.r[0], p.r[1], p.r[2]); if (p.s) m.scale.set(p.s[0], p.s[1], p.s[2]);
      m.castShadow = true; bodyG.add(m);
    }
    eyes.forEach((e, i) => {
      const sg = i ? 1 : -1, x = sg * d.eyeX, fz = faceZ(d, x, d.eyeY);
      e.g.position.set(x, d.eyeY, fz - d.eyeR * 0.62 * 0.32);
      e.g.rotation.y = d.flatZ !== undefined ? 0 : sg * 0.55 * Math.asin(clamp(d.eyeX / rAt(d, d.eyeY), -0.9, 0.9));
    });
    const my = d.mouthY, slope = (faceZ(d, 0, my + 0.04) - faceZ(d, 0, my - 0.04)) / 0.08;
    mouthG.position.set(0, my, faceZ(d, 0, my) + 0.03); mouthG.rotation.x = Math.atan(slope) * 0.9; mouthG.scale.setScalar(d.mouthS || 1);
    nose.visible = !!d.nose; nose.position.set(0, my + 0.13, faceZ(d, 0, my + 0.13) + 0.01);
    const cx = d.eyeX + d.eyeR * 0.85, cy = d.eyeY - d.eyeR * 1.0;
    cheeks.forEach((c, i) => { const sg = i ? 1 : -1; c.position.set(sg * cx, cy, faceZ(d, cx, cy) - 0.005); c.rotation.y = d.flatZ !== undefined ? 0 : sg * Math.asin(clamp(cx / rAt(d, cy), -0.95, 0.95)) * 0.9; });
    if (d.handX === undefined && d.prof) d.handX = rAt(d, d.handY) + 0.05;
    hands.forEach((h) => { h.visible = d.hands !== false; });
    core.position.y = -d.H / 2; halo.position.y = d.H + 0.22;
    lidMat.color.copy(d.face === 'cream' ? CREAM : mats.body.color);
  };
  T.setColor = (hex) => {
    T.color = hex; mats.body.color.set(hex); mats.alt.color.set(hex).offsetHSL(0.01, 0.02, -0.13);
    if (T.def) lidMat.color.copy(T.def.face === 'cream' ? CREAM : mats.body.color);
  };
  T.setMood = (name) => {
    if (!MOODS[name]) name = 'contento';
    T.mood = name; const m = MOODS[name];
    for (const k in mouths) mouths[k].visible = k === m.mouth;
    cheeks.forEach((c) => { c.visible = !!m.blush; });
    eyes.forEach((e) => { e.special.visible = !!m.special; e.pupilG.visible = !m.special; e.special.rotation.z = 0; e.special.scale.set(1, 1, 1); });
    if (m.special) { specMat.map = m.special === 'heart' ? TEX_HEART : TEX_SPIRAL; specMat.needsUpdate = true; }
    halo.visible = name === 'mareado';
  };
  T.poke = (v) => { T.sqV += v; };
  T.doTrick = (type) => { T.trick = type; T.trickT = 0; };
  T.headPos = (v) => v.set(0, T.def.H + 0.1, 0).applyMatrix4(root.matrixWorld);
  T.bubblePos = (v) => v.set(root.position.x, root.position.y + (T.def.H + 0.25) * T.scale * (1 - 0.7 * T.flatK) * (1 - 0.6 * T.lieK), root.position.z);

  T.update = (dt, st) => {
    T.time += dt; const t = T.time, d = T.def, m = MOODS[T.mood];
    const sp = Math.min(st.speed || 0, 1.7), amp = Math.min(sp, 1.25);
    if (sp > 0.05) T.walk += dt * (7 + sp * 5.5);
    const ph = T.walk;
    let hop = 0, yaw = 0, flipX = 0, swayZ = 0, swayX = 0, wave = 0, sqAdd = 0, wink = 0;
    if (T.trick) {
      T.trickT += dt; const p = T.trickT / TRICK_DUR[T.trick];
      if (p >= 1) T.trick = null;
      else switch (T.trick) {
        case 'hop': hop = Math.abs(Math.sin(p * TAU)) * 0.5; break;
        case 'spin': yaw = ease(p) * TAU * 2; hop = Math.sin(p * Math.PI) * 0.25; break;
        case 'flip': flipX = ease(p) * TAU; hop = Math.sin(p * Math.PI) * 1.0; break;
        case 'dance': swayZ = Math.sin(p * TAU * 3) * 0.32; hop = Math.abs(Math.sin(p * TAU * 3)) * 0.16; yaw = Math.sin(p * TAU * 1.5) * 0.5; wave = 1; break;
        case 'wave': wave = 1; swayZ = Math.sin(p * TAU * 2) * 0.08; break;
        case 'giggle': sqAdd = Math.sin(p * TAU * 6) * 0.09; break;
        case 'wink': wink = 1; swayZ = 0.14 * Math.sin(p * Math.PI); break;
        case 'shake': yaw = Math.sin(p * TAU * 3.5) * 0.5 * (1 - p); break;
        case 'bow': swayX = Math.sin(p * Math.PI) * 0.5; break;
      }
    }
    T.dz = damp(T.dz, T.mood === 'mareado' ? 1 : (st.wobble || 0) * 0.45, 4, dt);
    T.lieK = damp(T.lieK, T.lie, 6, dt);
    sway.rotation.z = swayZ + Math.sin(t * 4.3) * 0.26 * T.dz;
    sway.rotation.x = swayX + amp * 0.09 + (m.droop || 0) * (1 - T.lieK) + Math.cos(t * 3.4) * 0.2 * T.dz - T.lieK * 1.32;
    flipG.rotation.set(flipX, yaw + (st.spinY || 0), 0);
    flipG.position.y = d.H / 2 + hop;
    T.sqV += (-170 * T.sq - 13 * T.sqV) * dt; T.sq = clamp(T.sq + T.sqV * dt, -0.5, 0.6);
    const s = T.sq + Math.sin(t * 2.3) * 0.013 + sqAdd;
    T.flatK = damp(T.flatK, T.flat ? 1 : 0, T.flat ? 20 : 9, dt);
    const fy = lerp(1, 0.14, T.flatK), fx = lerp(1, 1.5, T.flatK);
    squash.scale.set((1 - s * 0.5) * fx, (1 + s) * fy, (1 - s * 0.5) * fx);
    const bob = st.air ? 0 : Math.abs(Math.sin(ph)) * 0.075 * amp * (m.bounce || 1);
    squash.position.y = bob + (d.float ? d.float + Math.sin(t * 2.1) * 0.05 : 0);
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1, a = ph + (i ? Math.PI : 0), f = feet[i], h = hands[i];
      f.visible = d.feet !== false && T.flatK < 0.5;
      f.position.set(sg * d.footX, 0.09 + Math.max(0, Math.cos(a)) * 0.14 * amp + (st.air ? 0.07 : 0), 0.05 + Math.sin(a) * 0.2 * amp);
      const up = wave && i ? 1 : 0;
      h.position.set(sg * (d.handX + up * 0.12 + (up ? Math.sin(t * 16) * 0.07 : 0)), (d.handY + up * 0.34 + bob + (d.float || 0)) * fy, 0.1 - Math.sin(a) * 0.13 * amp);
    }
    if (T.mood !== 'dormido') { T.blinkT -= dt; if (T.blinkT < 0) { T.blink = 0.13; T.blinkT = 1.8 + Math.random() * 3.5; } }
    T.blink = Math.max(0, T.blink - dt);
    T.es = damp(T.es, m.eyeS || 1, 10, dt);
    let lx = st.lookX, ly = st.lookY;
    if (lx === undefined) { lx = (m.look ? m.look[0] : 0) + Math.sin(t * 0.7) * 0.25; ly = m.look ? m.look[1] : 0; }
    if (st.wobble) { lx += Math.cos(t * 13) * 0.7 * st.wobble; ly += Math.sin(t * 13) * 0.7 * st.wobble; }
    T.lx = damp(T.lx, clamp(lx, -1, 1), 12, dt); T.ly = damp(T.ly, clamp(ly, -1, 1), 12, dt);
    for (let i = 0; i < 2; i++) {
      const e = eyes[i], sg = i ? 1 : -1;
      const target = (T.blink > 0 || (wink && i === 0)) ? 1.25 : m.lid;
      T.lid[i] = damp(T.lid[i], target, T.blink > 0 ? 45 : 14, dt);
      e.lidG.rotation.set(T.lid[i], 0, -sg * (m.lidZ || 0));
      const R = d.eyeR * T.es; e.g.scale.set(R, R * 1.1, R * 0.62);
      e.pupilG.scale.setScalar(m.pupilS || 1);
      e.pupilG.position.set(T.lx * 0.4, T.ly * 0.4, 0.9 - 0.085 * (T.lx * T.lx + T.ly * T.ly));
      if (m.special === 'spiral') e.special.rotation.z -= dt * 9 * sg;
      else if (m.special) { const k = 1 + Math.sin(t * 6) * 0.1; e.special.scale.set(k, k, 1); }
    }
    if (halo.visible) halo.rotation.y += dt * 4.5;
    T.emitT -= dt;
    if (T.emitT <= 0) {
      T.emitT = 1;
      if (st.near !== false && !T.flat) {
        const hp = T.headPos(_tv);
        switch (T.mood) {
          case 'enamorado': emit('heart', hp.x + rand(-0.4, 0.4), hp.y, hp.z); T.emitT = 0.55; break;
          case 'dormido': emit('zzz', hp.x + 0.35, hp.y, hp.z); T.emitT = 0.95; break;
          case 'triste': emit('tear', hp.x + rand(-0.3, 0.3), hp.y - 0.55 * T.scale, hp.z + 0.5 * T.scale); T.emitT = 1.1; break;
          case 'enojado': emit('puff', hp.x + rand(-0.4, 0.4), hp.y, hp.z); T.emitT = 0.55; break;
          case 'asombrado': emit('excl', hp.x, hp.y + 0.2, hp.z); T.emitT = 2.8; break;
          case 'contento': if (sp < 0.05 && Math.random() < 0.35) emit('note', hp.x + rand(-0.4, 0.4), hp.y, hp.z); T.emitT = 2.2; break;
        }
      }
    }
  };
  T.setColor(o.color || '#ffc93c'); T.setShape(o.shape || 'bola'); T.setMood(o.mood || 'contento');
  scene.add(root);
  return T;
}

// ───────────────────────── mundo: medidas ─────────────────────────
// Ciudad: de -62 a 62 en X y Z. La casa está en la manzana central y su puerta mira al sur (+Z, hacia la cámara).
// Al norte: parque → portón → 100 m de camino → bosque (Z ≤ -160) con río, puente y claro.
const ROADS = [-24, 24], RW = 4;
const BLOCKS = [[-62, -28], [-20, 20], [28, 62]];
const FOREST_Z = -160, LIMIT = 61.3;
const NORTH_Z = -268;                     // borde norte del bosque: más allá empiezan las montañas (05-norte.js)
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pathX = (z) => 5 * Math.sin((-z - 62) / 20) * sstep(12, 30, Math.abs(z + 205));
const riverZ = (x) => -205 + 6 * Math.sin(x / 16) + 2.5 * Math.sin(x / 7 + 1);
const RIVER_HALF = 4.4;
const BR = { x: 0, z: riverZ(0) };
const onBridge = (x, z) => Math.abs(x - BR.x) < 1.9 && Math.abs(z - BR.z) < 7.6;
function riverDepth(x, z) { if (z > -186 || z < -224) return 0; const d = RIVER_HALF - Math.abs(z - riverZ(x)); return d <= 0 ? 0 : -0.55 * Math.min(1, d / 1.3); }
function groundY(x, z) { if (z < NORTH_Z) return terrainY(x, z); if (onBridge(x, z)) { const u = (z - BR.z) / 7.6; return 0.8 * (1 - u * u); } return riverDepth(x, z); }   // montañas: 05-norte.js
const HOUSE = { x0: -6, x1: 6, z0: -13, z1: -4, h: 3.6 };
const CLEAR = [{ x: pathX(-240), z: -240, r: 8.5 }, { x: -35, z: -186, r: 9 }, { x: 36, z: -236, r: 9 }, { x: BR.x, z: BR.z - 13, r: 5 }];
const TRUNK = '#8a5a3a', WOOD = '#b98552', STONE = '#d9d2c2';

// listas para instanciar al final
const trees = [], flowers = [], tufts = [], bushes = [], rocks = [];
function addTree(type, x, z, s, solid) { trees.push({ type, x, z, s, ry: rnd() * TAU, k: 1, tint: rr(0.86, 1.06) }); if (solid !== false) solidCircle(x, z, 0.36 * s); }
const FLOWER_COLS = ['#ff6b9d', '#ffd23f', '#ffffff', '#ff8a5c', '#c58bff', '#7cc8ff'];
const addFlower = (x, z) => flowers.push({ x, z, s: rr(0.8, 1.35), color: pick(FLOWER_COLS) });
function freeSpot(x, z, pathGap) {
  if (z < -60 && z > -250 && Math.abs(x - pathX(z)) < (pathGap || 3.2)) return false;
  if (z < -186 && z > -224 && Math.abs(z - riverZ(x)) < 7.6) return false;
  for (const c of CLEAR) if (Math.hypot(x - c.x, z - c.z) < c.r) return false;
  return true;
}

// ───────────────────────── suelo ─────────────────────────
const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#8fd16b'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { g.fillStyle = pick(['#86c962', '#98d974', '#80c45d', '#a1dd7d']); g.globalAlpha = 0.5; g.beginPath(); g.ellipse(rr(8, w - 8), rr(8, h - 8), rr(2, 7), rr(1, 4), rnd() * 3, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(260, 260);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ map: grassTex }));
ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -100); ground.receiveShadow = true; scene.add(ground);
const decal = (o) => Object.assign({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, o);

const cityTex = canvasTex(2048, 2048, (g, S) => {
  const K = S / 128, X = (x) => (x + 64) * K, Z = (z) => (z + 64) * K;
  const rect = (x0, z0, x1, z1, fill) => { g.fillStyle = fill; g.fillRect(X(x0), Z(z0), (x1 - x0) * K, (z1 - z0) * K); };
  const SAND = '#ecdcb4', ASPH = '#4b4e5a', WHITE = '#f4f1e8';
  rect(-64, -64, 64, 64, '#8fd16b');
  rect(-62.6, -62.6, 62.6, 62.6, '#ddd6c6');
  g.strokeStyle = 'rgba(120,110,95,.2)'; g.lineWidth = 1.5; g.beginPath();
  for (let v = -62; v <= 62; v += 1.3) { g.moveTo(X(v), Z(-62.6)); g.lineTo(X(v), Z(62.6)); g.moveTo(X(-62.6), Z(v)); g.lineTo(X(62.6), Z(v)); }
  g.stroke();
  BLOCKS.forEach((bx, i) => BLOCKS.forEach((bz, j) => {
    const x0 = bx[0] + (i > 0 ? 2.8 : 0.6), x1 = bx[1] - (i < 2 ? 2.8 : 0.6), z0 = bz[0] + (j > 0 ? 2.8 : 0.6), z1 = bz[1] - (j < 2 ? 2.8 : 0.6);
    rect(x0, z0, x1, z1, i === 1 && j < 2 ? (j === 1 ? '#93d470' : '#8bd06c') : '#cfc7b6');
  }));
  // jardín de la casa: senderos
  rect(-1.1, -4, 1.1, 17.4, SAND); rect(-1.1, -3.4, 10.1, -1.8, SAND); rect(8.4, -15.8, 10.1, -1.8, SAND);
  rect(-0.85, -15.8, 10.1, -14.2, SAND); rect(-0.85, -17.4, 0.85, -14.2, SAND); rect(10.1, -3.4, 17.4, -1.8, SAND);
  // parque
  rect(-1.3, -62.6, 1.3, -27.2, SAND); rect(-17.2, -46.3, 17.2, -43.7, SAND);
  g.fillStyle = SAND; g.beginPath(); g.arc(X(0), Z(-45), 6.3 * K, 0, TAU); g.fill();
  // calles
  for (const r of ROADS) { rect(r - RW - 0.28, -64, r + RW + 0.28, 64, WHITE); rect(-64, r - RW - 0.28, 64, r + RW + 0.28, WHITE); }
  for (const r of ROADS) { rect(r - RW, -64, r + RW, 64, ASPH); rect(-64, r - RW, 64, r + RW, ASPH); }
  for (let i = 0; i < 9000; i++) {
    const r = pick(ROADS), a = rr(-64, 64), b = r + rr(-RW, RW - 0.2); g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)';
    if (rnd() < 0.5) g.fillRect(X(a), Z(b), rr(1, 5), rr(1, 3)); else g.fillRect(X(b), Z(a), rr(1, 3), rr(1, 5));
  }
  for (const r of ROADS) for (let v = -63; v < 63; v += 3.2) {
    if (ROADS.some((c) => Math.abs(v + 0.8 - c) < 8.6)) continue;
    rect(r - 0.09, v, r + 0.09, v + 1.6, '#ffe07a'); rect(v, r - 0.09, v + 1.6, r + 0.09, '#ffe07a');
  }
  for (const ix of ROADS) for (const iz of ROADS) {
    for (let k = 0; k < 8; k++) {
      const o = -RW + 0.25 + k;
      rect(ix - 6.9, iz + o, ix - 4.5, iz + o + 0.5, WHITE); rect(ix + 4.5, iz + o, ix + 6.9, iz + o + 0.5, WHITE);
      rect(ix + o, iz - 6.9, ix + o + 0.5, iz - 4.5, WHITE); rect(ix + o, iz + 4.5, ix + o + 0.5, iz + 6.9, WHITE);
    }
    rect(ix - 7.75, iz + 0.15, ix - 7.45, iz + 3.9, WHITE); rect(ix + 7.45, iz - 3.9, ix + 7.75, iz - 0.15, WHITE);
    rect(ix - 3.9, iz - 7.75, ix - 0.15, iz - 7.45, WHITE); rect(ix + 0.15, iz + 7.45, ix + 3.9, iz + 7.75, WHITE);
  }
});
const cityGround = new THREE.Mesh(new THREE.PlaneGeometry(128, 128), new THREE.MeshLambertMaterial(decal({ map: cityTex })));
cityGround.rotation.x = -Math.PI / 2; cityGround.position.y = 0.03; cityGround.receiveShadow = true; scene.add(cityGround);

function ribbon(n, at, halfW, y, vScale) {
  const pos = [], uv = [], idx = [], nor = [];
  let prev = at(0), dist = 0;
  for (let i = 0; i <= n; i++) {
    const q = at(i / n), q2 = at(Math.min(1, i / n + 0.001)), q1 = at(Math.max(0, i / n - 0.001));
    let tx = q2.x - q1.x, tz = q2.z - q1.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    dist += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q;
    pos.push(q.x - tz * halfW, y, q.z + tx * halfW, q.x + tz * halfW, y, q.z - tx * halfW); nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, dist * vScale, 1, dist * vScale);
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
const pathTex = canvasTex(64, 64, (g) => { g.fillStyle = '#e3c894'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 90; i++) { g.fillStyle = pick(['#d8bb84', '#ecd5a6', '#cfb078']); g.fillRect(rnd() * 64, rnd() * 64, rr(1, 5), rr(1, 4)); } });
pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping;
const pathMat = new THREE.MeshLambertMaterial(decal({ map: pathTex, side: THREE.DoubleSide }));
for (const seg of [[-62.5, BR.z + 7.3], [BR.z - 7.3, -246]]) {
  const m = new THREE.Mesh(ribbon(70, (t) => { const z = lerp(seg[0], seg[1], t); return { x: pathX(z), z }; }, 1.5, 0.04, 0.4), pathMat);
  m.receiveShadow = true; scene.add(m);
}

// ───────────────────────── piezas urbanas ─────────────────────────
const cityB = new Batch();
const PF_LAMP = new Batch().cyl('#3b4252', 0, 2.3, 0, 0.07, 0.11, 4.6, 8).box('#3b4252', 0.5, 4.55, 0, 1.1, 0.09, 0.09)
  .cyl('#3b4252', 1.0, 4.5, 0, 0.14, 0.26, 0.16, 10).sph('#fff3b0', 1.0, 4.36, 0, 0.2, 0.15, 0.2);
const PF_BENCH = new Batch().box(WOOD, 0, 0.47, 0, 1.7, 0.1, 0.5).box(WOOD, 0, 0.85, -0.24, 1.7, 0.5, 0.09)
  .box('#3b4252', -0.7, 0.23, 0, 0.09, 0.46, 0.46).box('#3b4252', 0.7, 0.23, 0, 0.09, 0.46, 0.46);
const PF_HYDRANT = new Batch().cyl('#ef4b4b', 0, 0.32, 0, 0.13, 0.16, 0.64, 10).sph('#ef4b4b', 0, 0.66, 0, 0.14).box('#ef4b4b', 0, 0.42, 0, 0.44, 0.12, 0.12).cyl('#d63c3c', 0, 0.04, 0, 0.2, 0.2, 0.08, 10);
const PF_BIN = new Batch().cyl('#3aa37f', 0, 0.45, 0, 0.3, 0.25, 0.9, 12).cyl('#2c8566', 0, 0.92, 0, 0.32, 0.32, 0.08, 12);
const PF_PLANTER = new Batch().box('#c9825b', 0, 0.3, 0, 1.5, 0.6, 0.7).ico('#57c06a', -0.4, 0.75, 0, 0.36).ico('#4db460', 0.1, 0.8, 0.05, 0.42).ico('#62cc76', 0.5, 0.72, -0.05, 0.3)
  .sph('#ff6b9d', -0.3, 1.05, 0.15, 0.1).sph('#ffd23f', 0.25, 1.15, 0.1, 0.1).sph('#ffffff', 0.55, 0.98, 0.1, 0.09);
const PF_PORTAL = new Batch().box('#17151f', 0, 1.9, 5, 8.2, 3.8, 11).box('#cfc9bd', -4.55, 2.2, 0.9, 0.9, 4.4, 3).box('#cfc9bd', 4.55, 2.2, 0.9, 0.9, 4.4, 3)
  .box('#cfc9bd', 0, 4.3, 0.9, 10, 0.95, 3).box('#b8b1a3', 0, 4.3, -0.62, 1.4, 1.25, 0.2).sph('#7cc260', 0, -2.5, 11, 11, 11, 11, 24);

const WALLS = ['#f6a9a3', '#f9d98d', '#a9dccb', '#b9c6f2', '#f4efe4', '#f0b184', '#9fd3ee', '#d7b8ec'];
const winTex = WALLS.map((wall) => {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.035)'; g.fillRect(rnd() * 256, rnd() * 256, rr(2, 12), rr(1, 3)); }
    for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 4; cy++) {
      const x = cx * 64 + 13, y = cy * 64 + 9;
      g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x - 4, y - 4, 46, 52);
      g.fillStyle = pick(['#8fc7f5', '#7db5e6', '#a9d8fb', '#ffe9a6', '#6ea4d8']); g.fillRect(x, y, 38, 44);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, y, 38, 9);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x + 17.5, y, 3, 44); g.fillRect(x - 7, y + 46, 52, 5);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
});
const AWN = ['#ff6b6b', '#ffb347', '#4fc3a1', '#5aa9ff', '#f78fb3', '#b28dff'];
function shopfront(w, R) {
  const b = new Batch(), aw = Math.min(w - 1.2, 8), hue = AWN[Math.floor((R || rnd)() * AWN.length)];
  b.box('#fbf7ee', 0, 1.6, 0.03, aw, 3.2, 0.1);
  b.box('#6b4a35', -aw / 2 + 0.95, 1.1, 0.1, 1.1, 2.2, 0.1).box('#ffd76a', -aw / 2 + 1.33, 1.1, 0.17, 0.08, 0.08, 0.06);
  b.box('#ffffff', 0.52, 1.45, 0.08, aw - 2.0, 1.7, 0.1).box('#bfe6ff', 0.52, 1.45, 0.11, aw - 2.3, 1.4, 0.1);
  b.box(hue, 0, 2.95, 0.62, aw + 0.3, 0.14, 1.3, 0, 0.3).box('#ffffff', 0, 2.72, 1.2, aw + 0.3, 0.22, 0.06);
  b.box(hue, 0, 3.85, 0.1, aw * 0.5, 0.62, 0.16).box('#ffffff', 0, 3.85, 0.19, aw * 0.5 - 0.3, 0.3, 0.03);
  return b;
}
const occluders = [];
function building(x0, x1, z0, z1, h, fronts, R) {                // R: semilla propia (Valle Alegre); sin ella, la de casa
  R = R || rnd; const RR = (a, b) => a + (b - a) * R();
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, si = Math.floor(R() * WALLS.length);
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const tx = Math.max(1, Math.round(w / 2.7)) / 4, tz = Math.max(1, Math.round(d / 2.7)) / 4, ty = Math.max(1, Math.round(h / 3)) / 4;
  for (let i = 0; i < 24; i++) { const f = i >> 2; if (f === 2 || f === 3) continue; uv.setXY(i, uv.getX(i) * (f < 2 ? tz : tx), uv.getY(i) * ty); }
  const side = new THREE.MeshLambertMaterial({ map: winTex[si] }), roof = new THREE.MeshLambertMaterial({ color: new THREE.Color(WALLS[si]).multiplyScalar(0.66) });
  const m = new THREE.Mesh(g, [side, side, roof, roof, side, side]); m.position.set(cx, h / 2, cz); m.castShadow = m.receiveShadow = true; scene.add(m);
  const b = new Batch(), trim = new THREE.Color(WALLS[si]).multiplyScalar(0.8).getHex();
  b.box(trim, cx, h + 0.2, z0 + 0.15, w + 0.3, 0.5, 0.3).box(trim, cx, h + 0.2, z1 - 0.15, w + 0.3, 0.5, 0.3);
  b.box(trim, x0 + 0.15, h + 0.2, cz, 0.3, 0.5, d - 0.3).box(trim, x1 - 0.15, h + 0.2, cz, 0.3, 0.5, d - 0.3);
  b.box('#8d8894', cx, 0.25, cz, w + 0.14, 0.5, d + 0.14);
  const k = R(), ox = RR(-w * 0.2, w * 0.2), oz = RR(-d * 0.2, d * 0.2);
  if (k < 0.38) { b.cyl('#c9b79c', cx + ox, h + 1.5, cz + oz, 1.1, 1.1, 1.6, 12).cone('#8a6a4a', cx + ox, h + 2.65, cz + oz, 1.3, 0.7, 12); for (const a of [0.8, 2.4, 4, 5.6]) b.cyl('#6b5a4a', cx + ox + Math.cos(a) * 0.8, h + 0.35, cz + oz + Math.sin(a) * 0.8, 0.07, 0.07, 0.7, 6); }
  else if (k < 0.72) { b.box('#d7dbe0', cx + ox, h + 0.5, cz + oz, 1.6, 1.0, 1.2).box('#b9bec6', cx + ox + 2, h + 0.4, cz + oz + 0.5, 1.1, 0.8, 1.1).cyl('#9aa0aa', cx + ox - 1.6, h + 1.2, cz + oz - 0.8, 0.05, 0.05, 2.4, 6); }
  else { b.box('#9a6540', cx + ox, h + 0.25, cz + oz, w * 0.45, 0.5, d * 0.4).ico('#57c06a', cx + ox - 0.8, h + 0.9, cz + oz, 0.75).ico('#62cc76', cx + ox + 0.9, h + 0.85, cz + oz + 0.3, 0.65).sph('#ff6b9d', cx + ox, h + 0.7, cz + oz - 0.4, 0.2); }
  for (const f of fronts) b.merge(shopfront(f.w, R), f.x, 0, f.z, f.ry);
  const pm = new THREE.MeshLambertMaterial({ vertexColors: true }); scene.add(b.mesh(pm));
  solidBox(x0, x1, z0, z1);
  const pad = (ry) => (fronts.some((f) => Math.abs(f.ry - ry) < 0.01) ? 1.35 : 0);   // los toldos sobresalen de la fachada
  occluders.push({ x0, x1, z0, z1, h, mats: [side, roof, pm], op: 1, padW: pad(-Math.PI / 2), padE: pad(Math.PI / 2) });
}
function genBlock(i, j) {
  const bx = BLOCKS[i], bz = BLOCKS[j], rs = { w: i > 0, e: i < 2, n: j > 0, s: j < 2 };
  const ix0 = bx[0] + (rs.w ? 3.7 : 2.4), ix1 = bx[1] - (rs.e ? 3.7 : 2.4), iz0 = bz[0] + (rs.n ? 3.7 : 2.4), iz1 = bz[1] - (rs.s ? 3.7 : 2.4);
  const sx = lerp(ix0, ix1, rr(0.42, 0.58)), sz = lerp(iz0, iz1, rr(0.42, 0.58)), gap = 1.3;
  [[ix0, sx - gap, iz0, sz - gap], [sx + gap, ix1, iz0, sz - gap], [ix0, sx - gap, sz + gap, iz1], [sx + gap, ix1, sz + gap, iz1]].forEach((L) => {
    const x0 = L[0], x1 = L[1], z0 = L[2], z1 = L[3], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (rnd() < 0.14) {
      addTree(1, cx - 2.5, cz - 1.5, 0.85); addTree(1, cx + 2.8, cz + 2, 0.75);
      cityB.merge(PF_BENCH, cx, 0, cz + 0.5, 0); solidCircle(cx, cz + 0.5, 0.7); cityB.merge(PF_PLANTER, cx + 3, 0, cz - 3, 0); solidCircle(cx + 3, cz - 3, 0.8);
      for (let q = 0; q < 8; q++) addFlower(cx + rr(-5, 5), cz + rr(-5, 5));
      return;
    }
    const fr = [];
    if (rs.s && z1 === iz1) fr.push({ x: cx, z: z1, ry: 0, w: x1 - x0 });
    if (rs.n && z0 === iz0 && rnd() < 0.6) fr.push({ x: cx, z: z0, ry: Math.PI, w: x1 - x0 });
    if (rs.e && x1 === ix1) fr.push({ x: x1, z: cz, ry: Math.PI / 2, w: z1 - z0 });
    if (rs.w && x0 === ix0) fr.push({ x: x0, z: cz, ry: -Math.PI / 2, w: z1 - z0 });
    building(x0, x1, z0, z1, j === 2 ? pick([6, 7, 8, 9, 10, 12]) : pick([7, 9, 10, 12, 14, 16, 19]), fr);
  });
}
function sidewalkProps(i, j) {
  const bx = BLOCKS[i], bz = BLOCKS[j], sides = [];
  if (j < 2) sides.push({ ax: 'x', c: bz[1] - 0.9, a: bx[0], b: bx[1], ry: -Math.PI / 2 });
  if (j > 0) sides.push({ ax: 'x', c: bz[0] + 0.9, a: bx[0], b: bx[1], ry: Math.PI / 2 });
  if (i < 2) sides.push({ ax: 'z', c: bx[1] - 0.9, a: bz[0], b: bz[1], ry: 0 });
  if (i > 0) sides.push({ ax: 'z', c: bx[0] + 0.9, a: bz[0], b: bz[1], ry: Math.PI });
  for (const s of sides) {
    let n = 0;
    for (let v = s.a + 7; v <= s.b - 7; v += 6.6, n++) {
      const x = s.ax === 'x' ? v : s.c, z = s.ax === 'x' ? s.c : v;
      if (i === 1 && s.ax === 'x' && Math.abs(x) < 2.6) continue;
      if (i === 1 && j === 1 && s.ax === 'z' && Math.abs(z + 2.6) < 2.6) continue;
      if (n % 2 === 0) addTree(1, x, z, rr(0.62, 0.78));
      else {
        cityB.merge(PF_LAMP, x, 0, z, s.ry); solidCircle(x, z, 0.18);
        const q = rnd(), ox = s.ax === 'x' ? 1.6 : 0, oz = s.ax === 'x' ? 0 : 1.6;
        if (q < 0.3) { cityB.merge(PF_HYDRANT, x + ox, 0, z + oz, 0); solidCircle(x + ox, z + oz, 0.22); }
        else if (q < 0.6) { cityB.merge(PF_BIN, x + ox, 0, z + oz, 0); solidCircle(x + ox, z + oz, 0.34); }
      }
    }
  }
}
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { sidewalkProps(i, j); if (i === 1 && j < 2) continue; genBlock(i, j); }

// semáforos: cuatro postes por cruce, cada uno mira a los autos que llegan
const INTERS = [];
const LAMP_GEO = new THREE.SphereGeometry(0.25, 12, 10);
const LMAT = { r1: new THREE.MeshBasicMaterial({ color: 0xff3b30 }), r0: new THREE.MeshBasicMaterial({ color: 0x4a1512 }), y1: new THREE.MeshBasicMaterial({ color: 0xffd60a }),
  y0: new THREE.MeshBasicMaterial({ color: 0x4d4108 }), g1: new THREE.MeshBasicMaterial({ color: 0x30e36b }), g0: new THREE.MeshBasicMaterial({ color: 0x0e4222 }) };
ROADS.forEach((ix, a) => ROADS.forEach((iz, b) => {
  const I = { x: ix, z: iz, k: a * 2 + b, poles: [] }; INTERS.push(I);
  [['EW', -4.75, 4.75], ['EW', 4.75, -4.75], ['NS', -4.75, -4.75], ['NS', 4.75, 4.75]].forEach((q) => {
    const x = ix + q[1], z = iz + q[2];
    cityB.cyl('#3b4252', x, 2.2, z, 0.09, 0.12, 4.4, 8).box('#2a2d38', x, 4.9, z, 0.56, 1.75, 0.34); solidCircle(x, z, 0.2);
    const lamps = [5.45, 4.9, 4.35].map((y) => { const m = new THREE.Mesh(LAMP_GEO, LMAT.r0); m.position.set(x, y, z); scene.add(m); return m; });
    I.poles.push({ axis: q[0], lamps });
  });
}));
const interAt = (x, z) => INTERS.find((I) => I.x === x && I.z === z);
function lightState(I, axis, t) {
  const p = (t + I.k * 4.25) % 17;
  if (axis === 'NS') return p < 6 ? 'g' : p < 7.5 ? 'y' : 'r';
  return p >= 8.5 && p < 14.5 ? 'g' : p >= 14.5 && p < 16 ? 'y' : 'r';
}
function updateLights(t) {
  for (const I of INTERS) for (const P of I.poles) {
    const s = lightState(I, P.axis, t);
    P.lamps[0].material = s === 'r' ? LMAT.r1 : LMAT.r0; P.lamps[1].material = s === 'y' ? LMAT.y1 : LMAT.y0; P.lamps[2].material = s === 'g' ? LMAT.g1 : LMAT.g0;
  }
}

// túneles en los extremos de las calles y setos alrededor de la ciudad
for (const r of ROADS) {
  cityB.merge(PF_PORTAL, r, 0, -60, Math.PI); solidBox(r - 5, r + 5, -64, -59.5); solidCircle(r, -71, 10.9);
  cityB.merge(PF_PORTAL, r, 0, 60, 0); solidBox(r - 5, r + 5, 59.5, 64);
  cityB.merge(PF_PORTAL, -60, 0, r, -Math.PI / 2); solidBox(-64, -59.5, r - 5, r + 5);
  cityB.merge(PF_PORTAL, 60, 0, r, Math.PI / 2); solidBox(59.5, 64, r - 5, r + 5);
}
const HEDGE = '#4fae5a', HEDGE2 = '#5fc06a';
function hedge(x0, z0, x1, z1) {
  const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  cityB.rbox(HEDGE, cx, 0.9, cz, horiz ? len : 1.6, 1.8, horiz ? 1.6 : len, 0.5);
  for (let d = 2; d < len - 1; d += rr(3, 5)) { const t = d / len; cityB.ico(HEDGE2, lerp(x0, x1, t), 1.7, lerp(z0, z1, t), rr(0.8, 1.1), rr(0.5, 0.7), rr(0.8, 1.0)); }
}
hedge(-64, -63.2, -5, -63.2); hedge(5, -63.2, 64, -63.2); hedge(-64, 63.2, 64, 63.2); hedge(-63.2, -64, -63.2, 64); hedge(63.2, -64, 63.2, 64);
solidBox(-64, -4.9, -64.2, -62.4); solidBox(4.9, 64, -64.2, -62.4);
for (const sx of [-1, 1]) { cityB.rbox(STONE, sx * 5.1, 1.4, -63.2, 1.3, 2.8, 1.9, 0.2).sph('#ffd76a', sx * 5.1, 3.15, -63.2, 0.42); }

// ───────────────────────── la casa de Tamachin ─────────────────────────
const house = (() => {
  const H = HOUSE, WT = 0.3, WALL = '#fff0cf', ROOF = '#f0625a', cz = (H.z0 + H.z1) / 2;
  const mk = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  const wallsB = new Batch(), frontB = new Batch(), roofB = new Batch(), furnB = new Batch();
  wallsB.box(WALL, 0, H.h / 2, H.z0 + WT / 2, 12, H.h, WT).box(WALL, H.x0 + WT / 2, H.h / 2, cz, WT, H.h, 9).box(WALL, H.x1 - WT / 2, H.h / 2, cz, WT, H.h, 9);
  wallsB.box('#e7d3a8', 0, 0.12, H.z0 + WT + 0.03, 11.4, 0.24, 0.06).box('#bfe6ff', 2.9, 2.3, H.z0 + WT / 2, 1.8, 1.1, WT + 0.08).box('#ffffff', 2.9, 2.3, H.z0 + WT / 2, 2.0, 1.3, WT + 0.04);
  wallsB.box('#ffffff', -4.4, 2.5, H.z0 + WT + 0.04, 1.3, 1.0, 0.06).box('#8fd6ff', -4.4, 2.5, H.z0 + WT + 0.06, 1.1, 0.8, 0.06).sph('#ffd23f', -4.1, 2.65, H.z0 + WT + 0.1, 0.16, 0.16, 0.03).box('#57c06a', -4.4, 2.2, H.z0 + WT + 0.09, 1.1, 0.2, 0.02);
  const fz = H.z1 - WT / 2, lw = -1.15 - H.x0;
  frontB.box(WALL, (H.x0 - 1.15) / 2, H.h / 2, fz, lw, H.h, WT).box(WALL, (H.x1 + 1.15) / 2, H.h / 2, fz, lw, H.h, WT).box(WALL, 0, 3.2, fz, 2.3, 0.8, WT);
  for (const sx of [-1, 1]) {
    frontB.box('#ffffff', sx * 3.6, 1.95, fz, 1.95, 1.65, WT + 0.04).box('#bfe6ff', sx * 3.6, 1.95, fz, 1.7, 1.4, WT + 0.08)
      .box('#ffffff', sx * 3.6, 1.95, fz, 0.08, 1.4, WT + 0.12).box('#ffffff', sx * 3.6, 1.95, fz, 1.7, 0.08, WT + 0.12)
      .box('#a8683f', sx * 3.6, 1.02, H.z1 + 0.2, 1.95, 0.3, 0.4);
    for (let q = -2; q <= 2; q++) frontB.sph(FLOWER_COLS[(q + 5 + (sx > 0 ? 1 : 0)) % 4], sx * 3.6 + q * 0.4, 1.28, H.z1 + 0.22, 0.14);
  }
  frontB.box(ROOF, 0, 3.05, H.z1 + 0.55, 3.0, 0.14, 1.3, 0, 0.32).box('#d9d2c2', 0, 0.07, H.z1 + 0.6, 2.8, 0.14, 1.2).box('#ff9f6b', 0, 0.16, H.z1 + 0.6, 1.6, 0.04, 0.8)
    .sph('#fff3b0', 1.6, 2.5, H.z1 + 0.12, 0.16);
  roofB.add(G_PYR, ROOF, 0, H.h + 0.2 + 1.5, cz, 13.7 / 1.4142, 3.0, 10.7 / 1.4142).box('#f3e7cf', 0, H.h + 0.1, cz, 12.9, 0.2, 9.9)
    .box('#c8553d', 3.4, H.h + 1.9, cz - 1.2, 0.95, 2.2, 0.95).box('#a8442f', 3.4, H.h + 3.05, cz - 1.2, 1.2, 0.2, 1.2).sph('#ffd76a', 0, H.h + 3.3, cz, 0.3);
  // muebles
  furnB.box('#b07a4f', -4.4, 0.3, -10.9, 2.2, 0.6, 3.4).rbox('#fffaf0', -4.4, 0.69, -10.9, 2.0, 0.28, 3.2, 0.1).rbox('#ff8a7a', -4.4, 0.78, -10.3, 2.08, 0.22, 2.0, 0.08)
    .sph('#ffffff', -4.4, 0.92, -12.1, 0.62, 0.17, 0.36).box('#9a6540', -4.4, 0.9, -12.56, 2.2, 1.3, 0.14); solidBox(-5.5, -3.3, -12.6, -9.2);
  furnB.box('#b07a4f', -2.8, 0.35, -12.3, 0.7, 0.7, 0.6).cyl('#8a6a4a', -2.8, 0.9, -12.3, 0.04, 0.1, 0.4, 8).cone('#ffe9a8', -2.8, 1.25, -12.3, 0.28, 0.36, 12); solidBox(-3.15, -2.45, -12.6, -12.0);
  furnB.box('#9a6540', -0.9, 1.2, -12.5, 2.4, 2.4, 0.5);
  for (let lv = 0; lv < 3; lv++) { let x = -1.95; while (x < 0.05) { const w = rr(0.12, 0.24), hh = rr(0.42, 0.6); furnB.box(pick(['#ff6b6b', '#ffd23f', '#4fc3a1', '#5aa9ff', '#c58bff', '#ff9f6b', '#f4f1e8']), x + w / 2, 0.32 + lv * 0.72 + hh / 2, -12.3, w, hh, 0.3); x += w + 0.02; } furnB.box('#b98552', -0.9, 0.28 + lv * 0.72, -12.28, 2.3, 0.06, 0.42); }
  solidBox(-2.1, 0.3, -12.8, -12.25);
  furnB.box('#f4f1e8', 3.0, 0.5, -12.3, 3.0, 1.0, 0.9).box('#8fd1c1', 3.0, 1.03, -12.3, 3.1, 0.08, 1.0).box('#3b4252', 2.2, 1.08, -12.3, 0.9, 0.04, 0.7).cyl('#c9ced6', 3.7, 1.08, -12.3, 0.3, 0.3, 0.05, 14)
    .cyl('#ff8a5c', 2.0, 1.2, -12.35, 0.16, 0.14, 0.2, 10).cyl('#ffd23f', 2.45, 1.17, -12.2, 0.13, 0.13, 0.14, 10); solidBox(1.5, 4.5, -12.75, -11.85);
  // refri: caja hueca con repisas y comida; la puerta va aparte, con bisagra a la derecha (ver `fridge` abajo)
  const MINT = '#8fd9c8', FX = 5.15, FZ = -12.25;
  furnB.rbox(MINT, FX, 1.15, FZ - 0.3, 1.1, 2.3, 0.4, 0.14).box(MINT, FX - 0.51, 1.15, FZ, 0.08, 2.3, 1.0).box(MINT, FX + 0.51, 1.15, FZ, 0.08, 2.3, 1.0)
    .box(MINT, FX, 2.26, FZ, 1.1, 0.08, 1.0).box(MINT, FX, 0.08, FZ, 1.1, 0.16, 1.0).box('#dff3fb', FX, 1.62, FZ + 0.05, 0.94, 0.06, 0.88)
    .box('#ffffff', FX, 0.66, FZ + 0.05, 0.94, 0.035, 0.84).box('#ffffff', FX, 1.14, FZ + 0.05, 0.94, 0.035, 0.84)
    .box('#ffffff', FX - 0.24, 0.42, FZ + 0.1, 0.22, 0.46, 0.22).box('#5aa9ff', FX - 0.24, 0.44, FZ + 0.215, 0.18, 0.16, 0.01).cone('#5aa9ff', FX - 0.24, 0.72, FZ + 0.1, 0.16, 0.14, 4, Math.PI / 4)
    .cyl('#ffb347', FX + 0.12, 0.28, FZ + 0.12, 0.13, 0.16, 0.2, 14).cyl('#ffd27a', FX + 0.12, 0.39, FZ + 0.12, 0.12, 0.12, 0.02, 14).cyl('#ffffff', FX + 0.12, 0.17, FZ + 0.12, 0.2, 0.2, 0.02, 14)
    .cyl('#ff5d73', FX + 0.33, 0.92, FZ + 0.06, 0.07, 0.07, 0.4, 10).cyl('#ffffff', FX + 0.33, 1.13, FZ + 0.06, 0.04, 0.05, 0.06, 8)
    .add(gCyl(1, 14), '#58b368', FX - 0.08, 0.84, FZ + 0.1, 0.2, 0.08, 0.2, Math.PI / 2, 0, 0).add(gCyl(1, 14), '#ff5d73', FX - 0.08, 0.84, FZ + 0.12, 0.17, 0.081, 0.17, Math.PI / 2, 0, 0)
    .rbox('#d9c27a', FX - 0.3, 0.76, FZ + 0.12, 0.34, 0.16, 0.14, 0.06).sph('#ffffff', FX + 0.08, 1.21, FZ + 0.2, 0.06, 0.08, 0.06).sph('#ffffff', FX + 0.2, 1.21, FZ + 0.18, 0.06, 0.08, 0.06)
    .cyl('#c58bff', FX - 0.2, 1.8, FZ + 0.08, 0.14, 0.12, 0.26, 12).cyl('#fff4d6', FX + 0.18, 1.75, FZ + 0.08, 0.16, 0.14, 0.18, 12).cyl('#ff9db8', FX + 0.18, 1.86, FZ + 0.08, 0.16, 0.16, 0.03, 12);
  solidBox(4.6, 5.7, -12.75, -11.75);
  furnB.cyl('#d9a066', 2.9, 0.8, -8.2, 1.0, 1.0, 0.1, 22).cyl('#b98552', 2.9, 0.4, -8.2, 0.12, 0.24, 0.8, 10).cyl('#ffffff', 2.6, 0.87, -8.0, 0.24, 0.2, 0.04, 14).sph('#ff6b6b', 2.6, 0.97, -8.0, 0.11)
    .cyl('#7cc8ff', 3.3, 0.94, -8.4, 0.09, 0.08, 0.18, 10).cyl('#ff9f6b', 1.45, 0.28, -8.2, 0.3, 0.3, 0.56, 14).cyl('#4fc3a1', 4.35, 0.28, -8.2, 0.3, 0.3, 0.56, 14);
  solidCircle(2.9, -8.2, 0.98); solidCircle(1.45, -8.2, 0.3); solidCircle(4.35, -8.2, 0.3);
  furnB.rbox('#7c9cff', -5.0, 0.38, -6.6, 1.2, 0.56, 3.0, 0.16).rbox('#6a8aee', -5.52, 0.86, -6.6, 0.36, 0.95, 3.0, 0.14).rbox('#6a8aee', -5.0, 0.6, -8.05, 1.2, 0.5, 0.3, 0.12).rbox('#6a8aee', -5.0, 0.6, -5.15, 1.2, 0.5, 0.3, 0.12)
    .rbox('#ffd23f', -5.2, 0.82, -7.3, 0.3, 0.5, 0.5, 0.12).rbox('#ff8a7a', -5.2, 0.82, -5.95, 0.3, 0.5, 0.5, 0.12); solidBox(-5.7, -4.4, -8.2, -5.0);
  furnB.box('#9a6540', -2.0, 0.3, -6.6, 0.5, 0.6, 1.9).box('#22222b', -2.05, 1.2, -6.6, 0.1, 1.0, 1.7).box('#22222b', -2.0, 0.68, -6.6, 0.3, 0.14, 0.5); solidBox(-2.3, -1.7, -7.6, -5.6);
  furnB.cyl('#ffd76a', 0.6, 0.065, -8.0, 2.3, 2.3, 0.03, 30).cyl('#ff8a7a', 0.6, 0.075, -8.0, 1.7, 1.7, 0.03, 30).cyl('#fffaf0', 0.6, 0.085, -8.0, 1.0, 1.0, 0.03, 30);
  furnB.cyl('#c8553d', 5.1, 0.3, -4.95, 0.36, 0.26, 0.6, 12).ico('#57c06a', 5.1, 1.0, -4.95, 0.5, 0.6, 0.5).ico('#62cc76', 4.9, 1.45, -4.9, 0.36).ico('#4db460', 5.25, 1.3, -5.1, 0.34); solidCircle(5.1, -4.95, 0.4);
  furnB.cyl('#3b4252', -5.3, 0.9, -4.75, 0.04, 0.04, 1.8, 6).cyl('#3b4252', -5.3, 0.03, -4.75, 0.22, 0.24, 0.06, 12).cone('#ffe9a8', -5.3, 1.9, -4.75, 0.34, 0.44, 14);
  furnB.sph('#ff6b9d', -1.0, 0.3, -10.6, 0.26).cyl('#fff', 4.0, 2.7, H.z0 + WT + 0.04, 0.36, 0.36, 0.06, 20, Math.PI / 2).cyl('#3b4252', 4.0, 2.7, H.z0 + WT + 0.08, 0.04, 0.04, 0.02, 8, Math.PI / 2);
  const mWalls = mk(), mFront = mk(), mRoof = mk();
  const walls = wallsB.mesh(mWalls), front = frontB.mesh(mFront), roof = roofB.mesh(mRoof); scene.add(walls, front, roof, furnB.mesh());
  solidBox(H.x0 - 0.1, H.x1 + 0.1, H.z0 - 0.1, H.z0 + WT + 0.05); solidBox(H.x0 - 0.1, H.x0 + WT + 0.05, H.z0, H.z1); solidBox(H.x1 - WT - 0.05, H.x1 + 0.1, H.z0, H.z1);
  solidBox(H.x0 - 0.1, -1.15, H.z1 - WT - 0.05, H.z1 + 0.05); solidBox(1.15, H.x1 + 0.1, H.z1 - WT - 0.05, H.z1 + 0.05);
  const floorTex = canvasTex(256, 256, (g) => { g.fillStyle = '#e2b886'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d9ad79' : '#e8c190'; g.fillRect(0, i * 32, 256, 30); g.fillStyle = 'rgba(120,80,40,.25)'; g.fillRect((i * 97) % 256, i * 32, 2, 30); g.fillRect((i * 53 + 120) % 256, i * 32, 2, 30); } });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(11.7, 8.75), new THREE.MeshLambertMaterial(decal({ map: floorTex, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.05, cz); floor.receiveShadow = true; scene.add(floor);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x2bb3a3, roughness: 0.5 });
  const doorPivot = new THREE.Group(); doorPivot.position.set(-1.08, 0, fz);
  const door = new THREE.Mesh(gRBox(2.16, 2.7, 0.14, 0.06), doorMat); door.position.set(1.08, 1.37, 0); door.castShadow = true;
  const knob = new THREE.Mesh(G_BALL, new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 0.3, metalness: 0.4 })); knob.scale.setScalar(0.09); knob.position.set(1.85, 1.3, 0.1);
  doorPivot.add(door, knob); scene.add(doorPivot);
  const tvMat = new THREE.MeshBasicMaterial({ color: 0x15151c });
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.84), tvMat); tv.position.set(-2.105, 1.2, -6.6); tv.rotation.y = -Math.PI / 2; scene.add(tv);
  // refri: puerta con bisagra, fondo que se ilumina y luz que se derrama al suelo (sin luces reales: no recompila materiales)
  const fridge = (() => {
    const pivot = new THREE.Group(); pivot.position.set(FX + 0.55, 0, FZ + 0.5);
    const db = new Batch().rbox(MINT, -0.55, 1.15, 0.06, 1.12, 2.3, 0.12, 0.05).box('#ffffff', -1.0, 1.95, 0.135, 0.07, 0.42, 0.06).box('#ffffff', -1.0, 1.15, 0.135, 0.07, 0.62, 0.06)
      .box('#6fbfae', -0.55, 1.62, 0.125, 1.06, 0.03, 0.02).box('#7fcfbd', -0.55, 1.15, -0.005, 1.0, 2.15, 0.02)
      .box('#ffffff', -0.55, 0.62, -0.07, 0.9, 0.04, 0.12).box('#ffffff', -0.55, 1.22, -0.07, 0.9, 0.04, 0.12)
      .cyl('#ffd23f', -0.8, 0.78, -0.08, 0.05, 0.05, 0.28, 8).cyl('#ff8a5c', -0.6, 0.76, -0.08, 0.06, 0.06, 0.24, 8).cyl('#9bd34a', -0.36, 0.79, -0.08, 0.05, 0.05, 0.3, 8)
      .sph('#ffffff', -0.75, 1.3, -0.08, 0.05, 0.065, 0.05).sph('#ffffff', -0.6, 1.3, -0.08, 0.05, 0.065, 0.05).sph('#ffffff', -0.45, 1.3, -0.08, 0.05, 0.065, 0.05)
      .sph('#ff6b9d', -0.3, 2.0, 0.14, 0.09, 0.09, 0.03).sph('#ffd23f', -0.75, 0.6, 0.14, 0.08, 0.08, 0.03);
    const door = db.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })); pivot.add(door); scene.add(pivot);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0x9fb7c0 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 2.08), panelMat); panel.position.set(FX, 1.16, FZ - 0.09); scene.add(panel);
    const glowTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 40, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(225,246,255,1)'); gr.addColorStop(0.5, 'rgba(190,232,255,.5)'); gr.addColorStop(1, 'rgba(190,232,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.6), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(FX - 0.15, 0.07, FZ + 1.75); pool.visible = false; scene.add(pool);
    const beamTex = canvasTex(64, 128, (g) => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(225,246,255,.85)'); gr.addColorStop(1, 'rgba(225,246,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
      const sd = g.createLinearGradient(0, 0, 64, 0); sd.addColorStop(0, 'rgba(0,0,0,1)'); sd.addColorStop(0.25, 'rgba(0,0,0,0)'); sd.addColorStop(0.75, 'rgba(0,0,0,0)'); sd.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = sd; g.fillRect(0, 0, 64, 128); });
    // haz de luz: tres caras (arriba, izquierda, derecha) de la boca del refri hacia el piso
    const n0 = [[FX - 0.47, 2.2], [FX + 0.47, 2.2], [FX + 0.47, 0.16], [FX - 0.47, 0.16]], z0 = FZ + 0.5, z1 = FZ + 2.4, far = [[FX - 1.1, 1.0], [FX + 0.9, 1.0], [FX + 0.9, 0.08], [FX - 1.1, 0.08]];
    const pos = [], uv = [];
    for (const [a, b] of [[0, 1], [1, 2], [3, 0]]) {
      pos.push(n0[a][0], n0[a][1], z0, n0[b][0], n0[b][1], z0, far[b][0], far[b][1], z1, n0[a][0], n0[a][1], z0, far[b][0], far[b][1], z1, far[a][0], far[a][1], z1);
      uv.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);                  // v=1 en la boca del refri (la textura va de brillante arriba a nada abajo)
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(bg, beamMat); beam.visible = false; scene.add(beam);
    return { pivot, door, panelMat, poolMat, pool, beamMat, beam, open: 0, v: 0, target: 0 };
  })();
  return { walls, front, roof, mWalls, mFront, mRoof, doorPivot, doorMat, tvMat, tvOn: false, oWalls: 1, oFront: 1, oRoof: 1, doorA: 0, fridge };
})();

// jardín
const gardenB = new Batch();
function fence(b, x0, z0, x1, z1, col) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.4)), horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i <= n; i++) { const t = i / n; b.box(col, lerp(x0, x1, t), 0.48, lerp(z0, z1, t), 0.14, 0.96, 0.14).cone(col, lerp(x0, x1, t), 1.03, lerp(z0, z1, t), 0.11, 0.16, 4, Math.PI / 4); }
  for (const y of [0.34, 0.72]) b.box(col, cx, y, cz, horiz ? len : 0.07, 0.1, horiz ? 0.07 : len);
  solidBox(Math.min(x0, x1) - 0.08, Math.max(x0, x1) + 0.08, Math.min(z0, z1) - 0.08, Math.max(z0, z1) + 0.08);
}
{ const F = 16.6, W = '#fffdf6';
  fence(gardenB, -F, F, -1.7, F, W); fence(gardenB, 1.7, F, F, F, W); fence(gardenB, -F, -F, -1.7, -F, W); fence(gardenB, 1.7, -F, F, -F, W);
  fence(gardenB, -F, -F, -F, F, W); fence(gardenB, F, -F, F, -4.3, W); fence(gardenB, F, -0.9, F, F, W);
  addTree(1, -11.5, 9, 1.0); addTree(1, 12, 10.5, 0.92); addTree(0, -13, -9.5, 1.0); addTree(1, 13.2, -12.5, 0.85); addTree(0, -12.5, -1, 0.8);
  for (let x = -5.6; x <= 5.6; x += 0.55) { if (Math.abs(x) < 1.7) continue; addFlower(x + rr(-0.1, 0.1), -3.0 + rr(-0.25, 0.25)); }
  for (let q = 0; q < 46; q++) addFlower(rr(-15, 15), rr(-15, 15));
  bushes.push({ x: -6.9, z: -4.6, s: 0.9 }, { x: 6.9, z: -4.6, s: 0.9 }, { x: -7, z: -12, s: 1.1 }, { x: 7.1, z: -11, s: 1.0 }, { x: -14.5, z: 14.5, s: 1.2 }, { x: 14.8, z: 14.6, s: 1.0 });
  gardenB.cyl('#8a6a4a', 2.5, 0.55, 15.4, 0.06, 0.06, 1.1, 6).rbox('#ef4b4b', 2.5, 1.2, 15.4, 0.42, 0.34, 0.6, 0.1).box('#ffd23f', 2.74, 1.34, 15.5, 0.04, 0.3, 0.08); solidCircle(2.5, 15.4, 0.25);
  gardenB.merge(PF_BENCH, -9, 0, 4, Math.PI / 2); solidCircle(-9, 4, 0.75);
  gardenB.cyl('#d9d2c2', 10.5, 0.06, 5, 2.5, 2.6, 0.12, 22).cyl('#69c3f0', 10.5, 0.13, 5, 2.2, 2.2, 0.04, 22).cyl('#58b368', 9.8, 0.16, 4.4, 0.4, 0.4, 0.02, 10).cyl('#58b368', 11.2, 0.16, 5.8, 0.32, 0.32, 0.02, 10).sph('#ff8fb1', 9.8, 0.2, 4.4, 0.1);
  for (let a = 0; a < TAU; a += 0.7) gardenB.rock('#c9c2b2', 10.5 + Math.cos(a) * 2.6, 0.12, 5 + Math.sin(a) * 2.6, rr(0.2, 0.34), 0.2, rr(0.2, 0.3), a);
}

// ───────────────────────── parque ─────────────────────────
const parkB = new Batch();
{ const PZ = -45;
  parkB.cyl(STONE, 0, 0.3, PZ, 2.7, 2.85, 0.6, 26).cyl('#69c3f0', 0, 0.56, PZ, 2.42, 2.42, 0.1, 26).cyl(STONE, 0, 1.1, PZ, 0.3, 0.42, 1.6, 12)
    .cyl(STONE, 0, 1.95, PZ, 1.05, 0.5, 0.26, 18).cyl('#69c3f0', 0, 2.07, PZ, 0.94, 0.94, 0.06, 18).sph('#9fdcff', 0, 2.4, PZ, 0.3);
  solidCircle(0, PZ, 2.9);
  for (const q of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) { parkB.merge(PF_BENCH, q[0], 0, PZ + q[1], Math.atan2(-q[0], -q[1])); solidCircle(q[0], PZ + q[1], 0.75); }
  for (const q of [[-14, -34], [-9, -56], [-15.5, -51], [13.5, -34.5], [9, -57], [15.5, -52], [-6.5, -33], [6.5, -33], [-16, -40], [16, -41]]) addTree(rnd() < 0.25 ? 0 : 1, q[0], q[1], rr(0.85, 1.1));
  for (const q of [[-3.2, -37], [3.2, -37], [-3.2, -54], [3.2, -54]]) { parkB.merge(PF_LAMP, q[0], 0, q[1], q[0] < 0 ? 0 : Math.PI); solidCircle(q[0], q[1], 0.18); }
  for (let q = 0; q < 70; q++) { const x = rr(-18, 18), z = rr(-60, -31); if (Math.abs(x) < 2.2 || Math.abs(z - PZ) < 2.2 || Math.hypot(x, z - PZ) < 7) continue; addFlower(x, z); }
  for (const q of [[-18, -31], [18, -31], [-18.5, -59], [18.5, -59], [-10, -47.8], [10, -42.2]]) bushes.push({ x: q[0], z: q[1], s: rr(0.9, 1.3) });
  // columpio
  const sx = -10.5, sz = -38;
  for (const ex of [-1.7, 1.7]) for (const ez of [-0.9, 0.9]) parkB.cyl('#ef4b4b', sx + ex, 1.25, sz + ez * 0.55, 0.06, 0.06, 2.65, 8, -ez * 0.38, 0);
  parkB.cyl('#ef4b4b', sx, 2.5, sz, 0.07, 0.07, 3.6, 8, 0, Math.PI / 2);
  for (const ex of [-0.8, 0.8]) parkB.box('#ffd23f', sx + ex, 0.62, sz, 0.6, 0.07, 0.3).box('#3b4252', sx + ex - 0.26, 1.55, sz, 0.025, 1.9, 0.025).box('#3b4252', sx + ex + 0.26, 1.55, sz, 0.025, 1.9, 0.025);
  solidCircle(sx - 1.7, sz, 0.5); solidCircle(sx + 1.7, sz, 0.5);
  // subibaja
  parkB.cone('#5aa9ff', 11, 0.3, -38, 0.4, 0.6, 10).box('#ffb347', 11, 0.66, -38, 3.6, 0.1, 0.4, 0, 0, 0.2).box('#3b4252', 9.5, 0.6, -38, 0.06, 0.4, 0.5).box('#3b4252', 12.5, 1.2, -38, 0.06, 0.4, 0.5);
  solidCircle(11, -38, 0.5);
}

// ───────────────────────── camino al bosque ─────────────────────────
const meadowB = new Batch();
const signs = [];
function sign(text, x, z, w) {
  const tex = canvasTex(512, 160, (g, W, Hh) => {
    g.fillStyle = '#b98552'; g.fillRect(0, 0, W, Hh);
    g.strokeStyle = 'rgba(90,55,25,.3)'; g.lineWidth = 3; for (let y = 22; y < Hh; y += 26) { g.beginPath(); g.moveTo(0, y + rr(-4, 4)); g.bezierCurveTo(W * 0.3, y + rr(-8, 8), W * 0.6, y + rr(-8, 8), W, y + rr(-4, 4)); g.stroke(); }
    g.strokeStyle = '#7a5230'; g.lineWidth = 12; g.strokeRect(6, 6, W - 12, Hh - 12);
    let fs = 78; g.textAlign = 'center'; g.textBaseline = 'middle';
    do { g.font = '900 ' + fs + 'px Nunito, "Trebuchet MS", Arial, sans-serif'; fs -= 4; } while (g.measureText(text).width > W - 60 && fs > 20);
    g.fillStyle = '#fff8e6'; g.fillText(text, W / 2, Hh / 2 + 4);
  });
  const h = w * 160 / 512, m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x, 2.25, z + 0.08); scene.add(m); signs.push(m);
  meadowB.box('#8a5a34', x, 2.25, z, w + 0.12, h + 0.12, 0.12).cyl(TRUNK, x - w * 0.32, 1.1, z - 0.12, 0.09, 0.11, 2.2, 8).cyl(TRUNK, x + w * 0.32, 1.1, z - 0.12, 0.09, 0.11, 2.2, 8);
  solidCircle(x - w * 0.32, z - 0.12, 0.16); solidCircle(x + w * 0.32, z - 0.12, 0.16);
}
sign('Bosque 100 m ↑', 4.6, -67, 3.3);
sign('Bosque 50 m ↑', pathX(-110) + 4.2, -110, 3.1);
sign('Ciudad ↓', pathX(-150) - 4.2, -152, 2.4);
for (let z = -70, n = 0; z > -156; z -= 7, n++) { const sx = n % 2 ? 1 : -1, x = pathX(z) + sx * 2.3; meadowB.cyl(WOOD, x, 0.45, z, 0.09, 0.11, 0.9, 7).sph('#8a5a34', x, 0.93, z, 0.12); }
for (let q = 0; q < 260; q++) { const x = rr(-60, 60), z = rr(-158, -66); if (freeSpot(x, z, 1.9) && Math.hypot(Math.abs(x) - 24, z + 71) > 11.5) addFlower(x, z); }
for (let q = 0; q < 320; q++) { const x = rr(-60, 60), z = rr(-158, -66); if (freeSpot(x, z, 1.8)) tufts.push({ x, z, s: rr(0.8, 1.5) }); }
for (let q = 0; q < 18; q++) { const x = rr(-58, 58), z = rr(-156, -84); if (freeSpot(x, z, 7) && Math.hypot(x + 26, z + 112) > 6) addTree(rnd() < 0.35 ? 0 : 1, x, z, rr(0.9, 1.25)); }
for (let q = 0; q < 16; q++) { const x = rr(-58, 58), z = rr(-156, -68); if (freeSpot(x, z, 3)) bushes.push({ x, z, s: rr(0.8, 1.4) }); }
for (let q = 0; q < 12; q++) { const x = rr(-58, 58), z = rr(-156, -68); if (freeSpot(x, z, 3)) rocks.push({ x, z, s: rr(0.35, 0.8) }); }
// molino
const WM = { x: -26, z: -112 };
meadowB.cyl('#f4efe4', WM.x, 3.2, WM.z, 1.3, 2.0, 6.4, 12).cone('#c8553d', WM.x, 7.3, WM.z, 1.75, 1.9, 12).box('#6b4a35', WM.x, 1.0, WM.z + 1.82, 1.0, 2.0, 0.2)
  .box('#bfe6ff', WM.x, 3.9, WM.z + 1.52, 0.7, 0.8, 0.2).cyl('#6b4a35', WM.x, 5.6, WM.z + 1.5, 0.16, 0.16, 0.9, 8, Math.PI / 2);
solidCircle(WM.x, WM.z, 2.1);
const windmill = new THREE.Group(); windmill.position.set(WM.x, 5.6, WM.z + 1.95);
{ const b = new Batch(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; b.box('#8a5a34', Math.cos(a) * 2.1, Math.sin(a) * 2.1, 0, 4.2, 0.12, 0.08, 0, 0, a).box('#fff8e6', Math.cos(a) * 2.5 - Math.sin(a) * 0.45, Math.sin(a) * 2.5 + Math.cos(a) * 0.45, 0.02, 3.0, 0.8, 0.04, 0, 0, a); } b.sph('#6b4a35', 0, 0, 0.05, 0.28); windmill.add(b.mesh()); }
scene.add(windmill);
for (const q of [[20, -95, 0.3], [23.2, -97.5, 1.2], [21.5, -92, 2.2]]) { meadowB.cyl('#e8c96a', q[0], 0.72, q[1], 0.72, 0.72, 1.3, 16, Math.PI / 2, 0).cyl('#d6b352', q[0], 0.72, q[1], 0.5, 0.5, 1.32, 12, Math.PI / 2, 0); solidCircle(q[0], q[1], 0.85); }
meadowB.cyl(TRUNK, -12, 1.0, -88, 0.07, 0.07, 2.0, 6).box(TRUNK, -12, 1.45, -88, 1.5, 0.08, 0.08).sph('#f2d39b', -12, 2.1, -88, 0.26).cone('#c8553d', -12, 2.45, -88, 0.4, 0.4, 10).box('#5aa9ff', -12, 1.3, -88, 0.6, 0.7, 0.2); solidCircle(-12, -88, 0.2);

// ───────────────────────── bosque ─────────────────────────
const forestB = new Batch();
{ const ax = pathX(FOREST_Z);
  forestB.cyl(TRUNK, ax - 2.7, 2.6, FOREST_Z, 0.3, 0.42, 5.2, 9).cyl(TRUNK, ax + 2.7, 2.6, FOREST_Z, 0.3, 0.42, 5.2, 9).cyl('#7a4f32', ax, 5.0, FOREST_Z, 0.26, 0.26, 6.6, 9, 0, Math.PI / 2)
    .ico('#38ad6c', ax - 2.9, 5.5, FOREST_Z, 0.9).ico('#46bd78', ax + 2.9, 5.5, FOREST_Z, 0.9);
  solidCircle(ax - 2.7, FOREST_Z, 0.45); solidCircle(ax + 2.7, FOREST_Z, 0.45);
  const tex = canvasTex(512, 128, (g, W, Hh) => { g.fillStyle = '#8a5a34'; g.fillRect(0, 0, W, Hh); g.strokeStyle = '#5f3d22'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, Hh - 10); g.font = '900 84px Nunito, "Trebuchet MS", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff8e6'; g.fillText('BOSQUE', W / 2, Hh / 2 + 5); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshLambertMaterial({ map: tex })); m.position.set(ax, 4.2, FOREST_Z + 0.1); scene.add(m);
  forestB.box('#5f3d22', ax, 4.2, FOREST_Z, 3.5, 0.95, 0.14);
}
for (let gx = -58; gx <= 58; gx += 7.6) for (let gz = -164; gz >= -258; gz -= 7.6) {
  if (rnd() < 0.1) continue; const x = gx + rr(-2.6, 2.6), z = gz + rr(-2.6, 2.6);
  if (freeSpot(x, z, 3.6)) addTree(rnd() < 0.56 ? 0 : 1, x, z, rr(0.9, 1.45));
}
for (let z = -68; z >= -268; z -= 4.8) for (const sx of [-1, 1]) addTree(rnd() < 0.6 ? 0 : 1, sx * rr(65.5, 70), z + rr(-1.5, 1.5), rr(1.1, 1.6), false);
for (let x = -70; x <= 70; x += 4.8) addTree(rnd() < 0.7 ? 0 : 1, x + rr(-1.5, 1.5), rr(-271, -266.5), rr(1.2, 1.7), false);
for (let q = 0; q < 60; q++) { const x = rr(-60, 60), z = rr(-260, -162); if (freeSpot(x, z, 2.6)) bushes.push({ x, z, s: rr(0.8, 1.5) }); }
for (let q = 0; q < 34; q++) { const x = rr(-60, 60), z = rr(-260, -162); if (freeSpot(x, z, 2.6)) { const s = rr(0.4, 1.1); rocks.push({ x, z, s }); if (s > 0.7) solidCircle(x, z, s * 0.75); } }
for (let q = 0; q < 150; q++) { const x = rr(-60, 60), z = rr(-260, -162); if (freeSpot(x, z, 1.9)) addFlower(x, z); }
for (let q = 0; q < 380; q++) { const x = rr(-60, 60), z = rr(-262, -160); if (freeSpot(x, z, 1.8)) tufts.push({ x, z, s: rr(0.9, 1.7) }); }
for (let q = 0; q < 34; q++) {
  const x = rr(-58, 58), z = rr(-258, -164); if (!freeSpot(x, z, 2.2)) continue; const s = rr(0.7, 1.3);
  forestB.cyl('#fff1d6', x, 0.16 * s, z, 0.07 * s, 0.1 * s, 0.32 * s, 8).sph(rnd() < 0.7 ? '#ef4b4b' : '#ffb347', x, 0.33 * s, z, 0.24 * s, 0.15 * s, 0.24 * s)
    .sph('#ffffff', x + 0.1 * s, 0.43 * s, z + 0.08 * s, 0.045 * s).sph('#ffffff', x - 0.12 * s, 0.4 * s, z + 0.02 * s, 0.04 * s).sph('#ffffff', x, 0.45 * s, z - 0.1 * s, 0.04 * s);
}
// río y puente
const waterTex = canvasTex(128, 256, (g) => {
  g.fillStyle = '#55b6ea'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 46; i++) { g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(40,130,200,.45)'; g.lineWidth = rr(1.5, 4); g.lineCap = 'round'; const x = rr(8, 120), y = rr(0, 256), l = rr(14, 44); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rr(-6, 6), y + l / 2, x, y + l); g.stroke(); }
});
waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
const riverAt = (t) => { const x = lerp(-80, 80, t); return { x, z: riverZ(x) }; };
const bank = new THREE.Mesh(ribbon(80, riverAt, RIVER_HALF + 1.1, 0.03, 0.1), new THREE.MeshLambertMaterial(decal({ color: 0xe6d3a3, side: THREE.DoubleSide })));
bank.receiveShadow = true; scene.add(bank);
const riverGeo = ribbon(80, riverAt, RIVER_HALF, 0.07, 0.07);
const river = new THREE.Mesh(riverGeo, new THREE.MeshLambertMaterial(decal({ map: waterTex, transparent: true, opacity: 0.93, side: THREE.DoubleSide, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
river.receiveShadow = true; scene.add(river);
for (let q = 0; q < 22; q++) {
  const x = rr(-60, 60); if (Math.abs(x) < 5) continue; const z = riverZ(x) + rr(-3.6, 3.6);
  if (q % 3 === 0) forestB.rock('#b9b3a6', x, 0.1, z, rr(0.35, 0.7), rr(0.25, 0.4), rr(0.35, 0.6), rnd() * 3);
  else forestB.cyl('#58b368', x, 0.1, z, 0.42, 0.42, 0.03, 12).sph(q % 2 ? '#ff8fb1' : '#ffffff', x + 0.1, 0.16, z, 0.1, 0.07, 0.1);
}
for (let q = 0; q < 46; q++) { const x = rr(-60, 60); if (Math.abs(x) < 4) continue; const z = riverZ(x) + (rnd() < 0.5 ? -1 : 1) * rr(4.5, 5.3), h = rr(0.8, 1.5); forestB.cyl('#6cbf5a', x, h / 2, z, 0.025, 0.04, h, 5).cyl('#7a4f32', x, h + 0.08, z, 0.05, 0.05, 0.26, 6); }
for (let k = -7; k <= 7; k++) {
  const z = BR.z + k, u = k / 7.6, gy = 0.8 * (1 - u * u), rx = Math.atan(1.6 * u / 7.6);
  forestB.box(k % 2 ? '#b98552' : '#a9774a', BR.x, gy - 0.07, z, 3.7, 0.14, 0.94, 0, rx);
  if (k < 7) { const u2 = (k + 0.5) / 7.6, gy2 = 0.8 * (1 - u2 * u2), rx2 = Math.atan(1.6 * u2 / 7.6); for (const sx of [-1, 1]) forestB.box('#7a4f32', BR.x + sx * 1.78, gy2 + 0.95, z + 0.5, 0.09, 0.09, 1.06, 0, rx2); }
  if (k % 2 === 1 || k === -7 || k === 7) for (const sx of [-1, 1]) forestB.cyl('#7a4f32', BR.x + sx * 1.78, gy + 0.48, z, 0.07, 0.08, 1.0, 7);
}
for (const dz of [-3, 3]) for (const sx of [-1, 1]) forestB.cyl('#6b4a35', BR.x + sx * 1.5, -0.1, BR.z + dz, 0.16, 0.18, 1.4, 8);
for (const sx of [-1, 1]) solidBox(BR.x + sx * 1.63, BR.x + sx * 1.93, BR.z - 7, BR.z + 7);   // barandales: al puente solo se sube por los extremos
// claro con fogata
const CAMP = CLEAR[0];
for (let a = 0; a < TAU; a += 0.62) forestB.rock('#aaa397', CAMP.x + Math.cos(a) * 0.95, 0.14, CAMP.z + Math.sin(a) * 0.95, 0.24, 0.2, 0.22, a);
forestB.cyl(TRUNK, CAMP.x, 0.2, CAMP.z, 0.11, 0.11, 1.3, 7, Math.PI / 2, 0.5).cyl(TRUNK, CAMP.x, 0.26, CAMP.z, 0.11, 0.11, 1.3, 7, Math.PI / 2, -0.7).cyl('#5f3d22', CAMP.x, 0.32, CAMP.z, 0.1, 0.1, 1.2, 7, 0.2, Math.PI / 2);
solidCircle(CAMP.x, CAMP.z, 1.1);
for (const q of [[-3.6, 0.6, 0.3], [3.2, 1.6, -0.5], [0.4, 3.9, 1.5]]) { forestB.cyl(TRUNK, CAMP.x + q[0], 0.36, CAMP.z + q[1], 0.36, 0.36, 2.2, 10, Math.PI / 2, q[2]); solidCircle(CAMP.x + q[0], CAMP.z + q[1], 0.75); }
const STUMP = { x: CAMP.x + 4.2, z: CAMP.z - 3.2 };
forestB.cyl(TRUNK, STUMP.x, 0.55, STUMP.z, 0.5, 0.62, 1.1, 12).cyl('#d9b98a', STUMP.x, 1.11, STUMP.z, 0.46, 0.46, 0.03, 12); solidCircle(STUMP.x, STUMP.z, 0.66);
const flames = [];
for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(gCone(8), new THREE.MeshBasicMaterial({ color: [0xff7a1a, 0xffb81f, 0xffe46b][i] })); m.position.set(CAMP.x + [0, 0.18, -0.12][i], 0.7, CAMP.z + [0, 0.1, -0.1][i]); m.scale.set(0.42 - i * 0.1, 1.1 - i * 0.2, 0.42 - i * 0.1); scene.add(m); flames.push(m); }
forestB.cyl(TRUNK, -22, 0.4, -176, 0.4, 0.45, 5, 10, Math.PI / 2, 0.4); solidBox(-24.4, -19.6, -177, -175);
forestB.cyl(TRUNK, 24, 0.4, -250, 0.4, 0.45, 4.4, 10, Math.PI / 2, -0.9); solidBox(22.2, 25.8, -251.6, -248.4);
// arbustos de bayas: se comen y vuelven a crecer. Tienen su propia semilla para no mover nada de lo que se generó antes.
const BERRY_KINDS = [{ name: 'arándanos', color: '#4b62d6', leaf: '#3f9a52' }, { name: 'frambuesas', color: '#ff4f7b', leaf: '#4aa85a' }, { name: 'moras', color: '#5a2d6e', leaf: '#3a8f4c' }];
const berryBushes = [];
const berryMesh = (() => {
  const rb = mulberry(5150), r2 = (a, b) => a + (b - a) * rb();
  const okSpot = (x, z) => freeSpot(x, z, 3.4) && trees.every((t) => Math.hypot(t.x - x, t.z - z) > 2.4 + 0.4 * t.s) && bushes.every((b) => Math.hypot(b.x - x, b.z - z) > 2.2)
    && rocks.every((r) => Math.hypot(r.x - x, r.z - z) > 1.8) && Math.hypot(x + 22, z + 176) > 4 && Math.hypot(x - 24, z + 250) > 4 && Math.hypot(x - STUMP.x, z - STUMP.z) > 3;
  for (let tries = 0; berryBushes.length < 16 && tries < 800; tries++) {
    const z = r2(-256, -166), x = berryBushes.length % 2 === 0 ? pathX(z) + (rb() < 0.5 ? -1 : 1) * r2(3.8, 9) : r2(-56, 56);   // la mitad cerca del camino
    if (!okSpot(x, z) || berryBushes.some((b) => Math.hypot(b.x - x, b.z - z) < 7)) continue;
    berryBushes.push({ x, z, s: r2(0.95, 1.2), kind: BERRY_KINDS[berryBushes.length % 3], berries: [] });
  }
  let n = 0;
  for (const b of berryBushes) {
    const s = b.s;
    forestB.ico(b.kind.leaf, b.x, 0.5 * s, b.z, 0.78 * s, 0.6 * s, 0.78 * s).ico('#4fb460', b.x + 0.45 * s, 0.42 * s, b.z + 0.2 * s, 0.5 * s, 0.42 * s, 0.5 * s).ico('#5cc06c', b.x - 0.42 * s, 0.44 * s, b.z - 0.12 * s, 0.48 * s, 0.4 * s, 0.48 * s);
    solidCircle(b.x, b.z, 0.62 * s);
    for (let i = 0; i < 8; i++) {                                     // al frente y a los lados: lo que ve la cámara
      const a = Math.PI / 2 + (i / 7 - 0.5) * 3.3 + r2(-0.15, 0.15), el = r2(0.12, 0.95), R = 0.76 * s;
      b.berries.push({ i: n++, x: b.x + Math.cos(a) * Math.cos(el) * R, y: 0.5 * s + Math.sin(el) * 0.56 * s, z: b.z + Math.sin(a) * Math.cos(el) * R * 0.95, k: 1, back: 0 });
    }
  }
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 7), new THREE.MeshLambertMaterial(), n);
  for (const b of berryBushes) for (const q of b.berries) { m.setColorAt(q.i, _bc.set(b.kind.color)); }
  m.frustumCulled = false; m.castShadow = true; scene.add(m); return m;
})();
const _bpm = new THREE.Matrix4();
function setBerry(b, q) { const s = 0.118 * b.s * Math.max(0.001, q.k); berryMesh.setMatrixAt(q.i, _bpm.makeScale(s, s, s).setPosition(q.x, q.y, q.z)); }
for (const b of berryBushes) for (const q of b.berries) setBerry(b, q);

scene.add(cityB.mesh(), gardenB.mesh(), parkB.mesh(), meadowB.mesh(), forestB.mesh());

// colinas y nubes de fondo
{ const b = new Batch();
  // lo que quedaba donde ahora están las montañas de verdad no se dibuja, pero se siguen sacando los mismos números al azar
  const keep = (z, r) => z + r < NORTH_Z ? new Batch() : b;        // colinas que se meterían en la franja de las montañas
  for (let z = -40; z >= -320; z -= 70) for (const sx of [-1, 1]) { const c = pick(['#86cc68', '#7cc260', '#92d473']), x = sx * rr(118, 150), zz = z + rr(-15, 15), rx = rr(48, 62), ry = rr(40, 52), rz = rr(48, 62); keep(zz, -rz).ico(c, x, -22, zz, rx, ry, rz, 2); }
  for (let x = -150; x <= 150; x += 75) { const xx = x + rr(-15, 15), rx = rr(55, 70), ry = rr(46, 60); keep(-335, -55).ico('#7cc260', xx, -24, -335, rx, ry, 55, 2); }
  for (const q of [[-250, -180, 80], [250, -150, 85]]) b.cone('#93a8c9', q[0], q[2] / 2 - 4, q[1], q[2] * 0.75, q[2], 7).cone('#f4f8ff', q[0], q[2] * 0.82 - 4, q[1], q[2] * 0.272, q[2] * 0.36, 7);
  const m = b.mesh(MAT_SCENERY, false); scene.add(m);
}
const clouds = [];
{ const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 9; i++) {
    const b = new Batch(); for (let k = 0; k < 5; k++) b.ico('#ffffff', (k - 2) * rr(4.5, 6), rr(-1, 1.5), rr(-2, 2), rr(4, 7), rr(3, 4.5), rr(4, 6), 1);
    const m = new THREE.Mesh(b.geometry(), mat); m.position.set(rr(-260, 260), rr(48, 80), rr(-420, -40)); m.scale.setScalar(rr(0.9, 1.7)); scene.add(m); clouds.push(m);
  }
}

// ───────────────────────── instancias: árboles, flores, hierba, arbustos, rocas ─────────────────────────
const _im = new THREE.Matrix4(), _iq = new THREE.Quaternion(), _ip = new THREE.Vector3(), _is = new THREE.Vector3(), _ie = new THREE.Euler(), _ic = new THREE.Color();
const TREE_GEO = [
  new Batch().cyl(TRUNK, 0, 0.8, 0, 0.2, 0.3, 1.6, 7).cone('#2f9e62', 0, 2.3, 0, 1.7, 2.2, 9).cone('#38ad6c', 0, 3.5, 0, 1.35, 2.0, 9).cone('#46bd78', 0, 4.6, 0, 1.0, 1.8, 9).geometry(),
  new Batch().cyl(TRUNK, 0, 1.2, 0, 0.24, 0.34, 2.4, 7).ico('#5cc46a', 0, 3.7, 0, 1.75, 1.6, 1.75).ico('#4fb85f', 0.95, 3.1, 0.3, 1.15).ico('#69cf76', -0.85, 3.3, -0.35, 1.1).geometry(),
];
const TREE_H = [5.5, 5.3], TREE_R = [1.5, 1.9];
const treeMesh = [0, 1].map((type) => {
  const list = trees.filter((t) => t.type === type), m = new THREE.InstancedMesh(TREE_GEO[type], new THREE.MeshLambertMaterial({ vertexColors: true }), list.length);
  list.forEach((t, i) => { t.idx = i; m.setColorAt(i, _ic.setRGB(t.tint, t.tint, t.tint * 0.96)); });
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m;
});
function setTreeMatrix(t) {
  _im.compose(_ip.set(t.x, 0, t.z), _iq.setFromEuler(_ie.set(0, t.ry, 0)), _is.set(t.s * (1 + (1 - t.k) * 0.25), t.s * t.k, t.s * (1 + (1 - t.k) * 0.25)));
  treeMesh[t.type].setMatrixAt(t.idx, _im);
}
trees.forEach(setTreeMatrix);
function instanced(geo, list, fn, shadow, tint) {
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), list.length);
  list.forEach((it, i) => { fn(it); m.setMatrixAt(i, _im); m.setColorAt(i, _ic.set(tint && it.color ? it.color : '#ffffff')); });
  m.frustumCulled = false; m.castShadow = !!shadow; m.receiveShadow = true; scene.add(m); return m;
}
const flowersOk = flowers.filter((f) => !(f.x > HOUSE.x0 - 1 && f.x < HOUSE.x1 + 1 && f.z > HOUSE.z0 - 1 && f.z < HOUSE.z1 - 0.2) && !(Math.abs(f.x) < 1.4 && f.z > -4 && f.z < 18) && Math.hypot(f.x - 10.5, f.z - 5) > 2.8);
instanced(new Batch().cyl('#4aa35a', 0, 0.2, 0, 0.02, 0.028, 0.4, 5).geometry(), flowersOk, (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.identity(), _is.set(f.s, f.s, f.s)));
instanced(new Batch().ico('#ffffff', 0, 0.44, 0, 0.14, 0.095, 0.14, 0).geometry(), flowersOk, (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.identity(), _is.set(f.s, f.s, f.s)), false, true);
instanced(new Batch().ico('#ffb81f', 0, 0.51, 0, 0.06, 0.05, 0.06, 0).geometry(), flowersOk, (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.identity(), _is.set(f.s, f.s, f.s)));
instanced(new Batch().cone('#6fbf55', 0, 0.16, 0, 0.07, 0.34, 4).cone('#7ccb62', 0.09, 0.12, 0.03, 0.06, 0.26, 4).cone('#63b34a', -0.07, 0.13, -0.05, 0.06, 0.28, 4).geometry(), tufts,
  (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.setFromEuler(_ie.set(0, f.x * 7, 0)), _is.set(f.s, f.s, f.s)));
instanced(new Batch().ico('#57c06a', 0, 0.5, 0, 0.8, 0.6, 0.8).ico('#4db460', 0.5, 0.4, 0.2, 0.55, 0.45, 0.55).ico('#66cc78', -0.45, 0.42, -0.15, 0.5, 0.42, 0.5).geometry(), bushes,
  (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.setFromEuler(_ie.set(0, f.x * 3, 0)), _is.set(f.s, f.s, f.s)), true);
bushes.forEach((f) => solidCircle(f.x, f.z, 0.6 * f.s));
instanced(new Batch().rock('#b3ada1', 0, 0.35, 0, 1, 0.7, 0.85).geometry(), rocks, (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.setFromEuler(_ie.set(0, f.x * 5, 0)), _is.set(f.s, f.s, f.s)), true);

// ───────────────────────── autos ─────────────────────────
function carGeo(type, paint) {
  const b = new Batch(), GL = '#2d3b55', TY = '#22222b';
  if (type === 'bus') {
    b.rbox(paint, 0, 1.6, 0, 2.3, 2.4, 8, 0.34).box(GL, 0, 2.12, 0, 2.34, 0.82, 6.8).box(GL, 0, 2.02, 0, 1.9, 0.98, 8.04).box('#ffffff', 0, 1.22, 0, 2.33, 0.18, 7.9);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(TY, sx * 1.1, 0.46, sz * 2.7, 0.46, 0.46, 0.32, 14, 0, Math.PI / 2).cyl('#c9ced6', sx * 1.1, 0.46, sz * 2.7, 0.2, 0.2, 0.34, 10, 0, Math.PI / 2);
    for (const sx of [-1, 1]) b.sph('#fff6c4', sx * 0.8, 0.85, 4.0, 0.18, 0.14, 0.07).sph('#ff4d4d', sx * 0.8, 0.9, -4.0, 0.16, 0.12, 0.07);
    b.box('#ffd23f', 0, 2.62, 3.96, 1.4, 0.3, 0.12);
  } else {
    b.rbox(paint, 0, 0.62, 0, 1.9, 0.7, 4.2, 0.24).rbox(paint, 0, 1.2, -0.25, 1.7, 0.66, 2.2, 0.26).box(GL, 0, 1.24, -0.25, 1.74, 0.36, 1.5).box(GL, 0, 1.24, -0.25, 1.3, 0.36, 2.24);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(TY, sx * 0.93, 0.36, sz * 1.3, 0.36, 0.36, 0.3, 14, 0, Math.PI / 2).cyl('#c9ced6', sx * 0.93, 0.36, sz * 1.3, 0.17, 0.17, 0.32, 10, 0, Math.PI / 2);
    for (const sx of [-1, 1]) b.sph('#fff6c4', sx * 0.6, 0.68, 2.08, 0.17, 0.13, 0.07).sph('#ff4d4d', sx * 0.62, 0.7, -2.08, 0.16, 0.11, 0.07);
    b.box('#d7dbe0', 0, 0.36, 2.04, 1.7, 0.16, 0.16).box('#d7dbe0', 0, 0.36, -2.04, 1.7, 0.16, 0.16);
    if (type === 'taxi') b.box('#231d3b', 0, 1.62, -0.25, 0.7, 0.2, 0.3).box('#231d3b', 0, 0.74, 0, 1.92, 0.1, 2.4);
  }
  return b.geometry();
}
const lanes = [];
for (const r of ROADS) lanes.push({ axis: 'z', dir: 1, fixed: r - 2, road: r }, { axis: 'z', dir: -1, fixed: r + 2, road: r }, { axis: 'x', dir: 1, fixed: r + 2, road: r }, { axis: 'x', dir: -1, fixed: r - 2, road: r });
for (const L of lanes) { L.lightAxis = L.axis === 'z' ? 'NS' : 'EW'; L.stops = ROADS.map((c) => ({ pos: c - L.dir * 7.7, I: L.axis === 'z' ? interAt(L.road, c) : interAt(c, L.road) })); }
const cars = [];
const PAINTS = ['#ff6b6b', '#5aa9ff', '#4fc3a1', '#ffffff', '#c58bff', '#ff9f6b', '#2f3a56', '#f78fb3'];
function addCar(L, s, type, paint) {
  const mesh = new THREE.Mesh(carGeo(type, paint), MAT_CAR); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  mesh.rotation.y = L.axis === 'z' ? (L.dir > 0 ? 0 : Math.PI) : (L.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const bus = type === 'bus';
  const c = { L, s, v: 0, vmax: rr(7.5, 10.5) * (bus ? 0.8 : 1), half: bus ? 4.05 : 2.15, hw: bus ? 1.2 : 1.0, h: bus ? 2.8 : 1.55, mesh, pause: 0, honkT: 0, stuck: 0, x: 0, z: 0 };
  c.bubblePos = (v) => v.set(c.x, c.h + 0.5, c.z); cars.push(c);
}
lanes.forEach((L, i) => {
  const n = i % 3 === 0 ? 1 : 2;
  for (let k = 0; k < n; k++) addCar(L, -62 + k * 58 + rr(0, 26), (i === 2 || i === 5) && k === 0 ? 'bus' : (i === 0 || i === 7) ? 'taxi' : 'auto', (i === 0 || i === 7) ? '#ffcf33' : (i === 2 || i === 5) && k === 0 ? pick(['#ff8a5c', '#4fc3a1']) : pick(PAINTS));
});
const carBox = { x0: 0, x1: 0, z0: 0, z1: 0 };
function carRect(c, pad) {
  const a = c.L.axis === 'x';
  carBox.x0 = c.x - (a ? c.half : c.hw) - pad; carBox.x1 = c.x + (a ? c.half : c.hw) + pad; carBox.z0 = c.z - (a ? c.hw : c.half) - pad; carBox.z1 = c.z + (a ? c.hw : c.half) + pad; return carBox;
}
function updateCars(dt, t) {
  for (const c of cars) { c.x = c.L.axis === 'x' ? c.s : c.L.fixed; c.z = c.L.axis === 'x' ? c.L.fixed : c.s; }
  const P = player, inCity = P.pos.z > -66;
  for (const c of cars) {
    const L = c.L, dir = L.dir, ax = L.axis === 'x'; let gap = 999, cross = false, honk = false;
    const front = c.s + dir * c.half;
    for (const st of L.stops) {
      const d = (st.pos - front) * dir; if (d < -0.6 || d > 40) continue;
      const s = lightState(st.I, L.lightAxis, t); if (s === 'r' || (s === 'y' && d > 2.5)) gap = Math.min(gap, d);
    }
    for (const o of cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z, fwd = (ax ? dx : dz) * dir; if (fwd <= 0 || fwd > 30) continue;
      const lat = Math.abs(ax ? dz : dx), same = o.L.axis === L.axis;
      if (lat < c.hw + (same ? o.hw : o.half) + 0.25) {
        if (!same && c.stuck > 5) continue;
        const g = fwd - c.half - (same ? o.half : o.hw) - 1.6; if (g < gap) gap = g; if (!same && g < 1.5) cross = true;
      }
    }
    if (inCity && P.state !== 'fly') {
      const dx = P.pos.x - c.x, dz = P.pos.z - c.z, fwd = (ax ? dx : dz) * dir, lat = Math.abs(ax ? dz : dx);
      if (fwd > 0 && lat < c.hw + 0.8 && P.pos.y < 1.6) { const g = fwd - c.half - 1.3; if (g < 7) { gap = Math.min(gap, g); honk = true; } }
    }
    let target = c.vmax; if (c.pause > 0) { c.pause -= dt; target = 0; }
    if (gap < 999) target = Math.min(target, Math.sqrt(Math.max(0, 18 * gap)));
    c.v = c.v < target ? Math.min(target, c.v + 4.5 * dt) : Math.max(target, c.v - 13 * dt);
    c.stuck = cross && c.v < 0.3 ? c.stuck + dt : Math.max(0, c.stuck - dt * 3);
    c.s += dir * c.v * dt; if (c.s * dir > 74) c.s -= dir * 148;
    c.x = ax ? c.s : L.fixed; c.z = ax ? L.fixed : c.s;
    c.mesh.position.set(c.x, Math.sin(t * 9 + c.vmax * 7) * 0.012 * Math.min(1, c.v / 4), c.z);
    c.honkT -= dt;
    if (honk && c.v < 3.5 && c.honkT <= 0) { c.honkT = rand(1.8, 2.8); say(c, choose(['¡Piii, piii!', '¡Cuidado, Tamachin!', '¡Bip, bip!', '¡Muévete, porfa!']), 1.4); SFX.honk(); }
  }
}

// ───────────────────────── vecinos (otros tamachines) ─────────────────────────
const LINES = {
  contento: ['¡Hola! ¡Qué lindo día para pasear!', '¿Ya fuiste al bosque? Sal por el portón del parque.', 'Dicen que el búho del bosque lo sabe todo.', '¡Me gustan tus ojotes!', 'Cruza cuando los autos tengan rojo, ¿sí?'],
  triste: ['Se me cayó el helado…', 'Hoy nadie me ha saludado…', 'Extraño a mi amigo el conejo.'],
  enojado: ['¡Un auto casi me aplasta! ¡Grr!', '¡Alguien pisó mis flores!', '¡Hmpf! Ese semáforo tarda una eternidad.'],
  asombrado: ['¡Oh! ¿Viste eso? ¡Cambió el semáforo!', '¡Guau! ¿Vienes desde tu casa?', '¡Increíble! Pasó un autobús enorme.'],
  dormido: ['Zzz… cinco minutitos más…', 'Mmm… ¿ya es de día?', 'Zzz… sueño con gelatina…'],
  enamorado: ['Ay… el parque está tan bonito hoy…', '¿Me acompañas a ver la fuente?', 'Suspiro… qué ojos tan grandes tienes.'],
  mareado: ['Uy… todo da vueltas…'],
};
const npcs = [];
// rutas cerradas: una polilínea que se recorre por distancia. Al trazar una, que no pase por sólidos (bancas, arbustos, árboles).
function pathLoop(pts) {
  const segs = []; let L = 0;
  pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ x: a[0], z: a[1], tx: (b[0] - a[0]) / len, tz: (b[1] - a[1]) / len, s: L }); L += len; });
  return { segs, L };
}
function rectLoop(x0, x1, z0, z1) { return pathLoop([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]); }
function ringLoop(cx, cz, r, n) { const p = []; for (let i = 0; i < n; i++) p.push([cx + Math.cos(i * TAU / n) * r, cz + Math.sin(i * TAU / n) * r]); return pathLoop(p); }
function loopAt(R, t, out) {
  t = ((t % R.L) + R.L) % R.L;
  let q = R.segs[0]; for (const s of R.segs) { if (s.s > t) break; q = s; }
  const u = t - q.s; out.x = q.x + q.tx * u; out.z = q.z + q.tz * u; out.tx = q.tx; out.tz = q.tz; return out;
}
const blockLoop = (i, j) => rectLoop(BLOCKS[i][0] + 2, BLOCKS[i][1] - 2, BLOCKS[j][0] + 2, BLOCKS[j][1] - 2);
function addNPC(o) {                                  // o.rng: semilla propia (Valle Alegre); sin ella, la de casa
  const R = o.rng || rnd, RR = (a, b) => a + (b - a) * R();
  const T = makeTamachin({ shape: o.shape, color: o.color, mood: o.mood, scale: o.scale || RR(1.0, 1.22) });
  const n = { T, name: o.name, kind: 'vecino', loop: o.loop || null, t: o.loop ? R() * o.loop.L : R() * 9, dir: R() < 0.5 ? 1 : -1, speed: RR(1.4, 2.1) * (MOODS[o.mood].speed || 1),
    pause: RR(0, 3), heading: R() * TAU, talkT: 0, lines: o.lines || null, li: 0, home: o.home || null, mood0: o.mood, cheer: 0, count: 0, pos: T.pos, bubblePos: T.bubblePos };
  if (o.home) { T.pos.set(o.home.x, 0, o.home.z); n.heading = o.home.ry || 0; }
  else { loopAt(n.loop, n.t, _lp); T.pos.set(_lp.x, 0, _lp.z); }
  npcs.push(n); return n;
}
const _lp = { x: 0, z: 0, tx: 0, tz: 0 };
addNPC({ name: 'Pompón', shape: 'bola', color: '#ff8a5c', mood: 'contento', loop: blockLoop(0, 0) });
addNPC({ name: 'Chispa', shape: 'estrella', color: '#ffd23f', mood: 'asombrado', loop: blockLoop(2, 0) });
addNPC({ name: 'Mota', shape: 'gatito', color: '#c58bff', mood: 'contento', loop: blockLoop(0, 1) });
addNPC({ name: 'Nube', shape: 'fantasma', color: '#f4f1e8', mood: 'dormido', loop: blockLoop(2, 1) });
addNPC({ name: 'Kiwi', shape: 'huevo', color: '#9bd34a', mood: 'enojado', loop: blockLoop(0, 2) });
addNPC({ name: 'Tofu', shape: 'cubito', color: '#7cd4e8', mood: 'triste', loop: blockLoop(1, 2) });
addNPC({ name: 'Lulú', shape: 'gota', color: '#ff6b9d', mood: 'enamorado', loop: blockLoop(2, 2) });
addNPC({ name: 'Bombón', shape: 'hongo', color: '#ff5d5d', mood: 'contento', loop: blockLoop(1, 1) });
addNPC({ name: 'Pistacho', shape: 'bola', color: '#35c9a0', mood: 'contento', loop: ringLoop(0, -45, 4.25, 24) });   // entre la fuente (r 2.9) y las bancas
addNPC({ name: 'Canela', shape: 'gatito', color: '#e8a063', mood: 'asombrado',                                     // esquinas recortadas por los arbustos
  loop: pathLoop([[-14.6, -60], [14.6, -60], [17.6, -57], [17.6, -34], [14.6, -31], [-14.6, -31], [-17.6, -34], [-17.6, -57]]) });
addNPC({ name: 'Musgo', shape: 'hongo', color: '#58b368', mood: 'contento', home: { x: CAMP.x - 3.4, z: CAMP.z - 3, ry: 0.5 },
  lines: ['Bienvenido al claro. La fogata siempre está calientita.', 'El búho de ese tronco responde cualquier pregunta.', 'Si caminas despacio, los conejos no huyen.'] });
addNPC({ name: 'Rocío', shape: 'gota', color: '#7c9cff', mood: 'enamorado', home: { x: BR.x + 3.2, z: BR.z - 12, ry: 0.2 },
  lines: ['El río baja desde las montañas nevadas.', '¿Viste saltar a los peces?', 'Cruza por el puente… o mójate los pies.'] });

function updateNPCs(dt) {
  const P = player.pos;
  for (const n of npcs) {
    const T = n.T, dx = P.x - n.pos.x, dz = P.z - n.pos.z, d = Math.hypot(dx, dz);
    let speed = 0; n.talkT = Math.max(0, n.talkT - dt);
    if (n.cheer > 0) { n.cheer -= dt; if (n.cheer <= 0) T.setMood(n.mood0); }
    T.group.visible = d < 160 || !!n.follow;              // lejos son unos cuantos píxeles y muchas mallas (desde una cima se ve todo el pueblo)
    if (n.goto && n.talkT <= 0) {                     // camina a un lugar fijo (al terminar un encargo) y ahí se queda
      const ex = n.goto.x - n.pos.x, ez = n.goto.z - n.pos.z, ed = Math.hypot(ex, ez);
      if (ed < 0.12) n.goto = null;
      else { const sp = Math.min(1.8, ed * 3); n.pos.x += ex / ed * sp * dt; n.pos.z += ez / ed * sp * dt; n.heading += angDiff(n.heading, Math.atan2(ex, ez)) * Math.min(1, dt * 8); speed = sp / 3.2; }
      T.group.rotation.y = n.heading; T.update(dt, { speed, near: d < 45 }); continue;
    }
    if (n.follow) {                                   // acompaña a Tamachin un poco detrás y a un lado; n.follow decide si llegó o se perdió
      const tx = P.x - Math.sin(player.heading) * 1.9 + Math.cos(player.heading) * 0.9, tz = P.z - Math.cos(player.heading) * 1.9 - Math.sin(player.heading) * 0.9;
      const ex = tx - n.pos.x, ez = tz - n.pos.z, ed = Math.hypot(ex, ez);
      if (ed > 0.5 && d > 1.7) {
        const sp = clamp(ed * 1.8, 1.4, 7.8); n.pos.x += ex / ed * sp * dt; n.pos.z += ez / ed * sp * dt; resolveAgent(n.pos, 0.45 * T.scale);
        n.heading += angDiff(n.heading, Math.atan2(ex, ez)) * Math.min(1, dt * 8); speed = sp / 3.2;
      } else n.heading += angDiff(n.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 6);
      T.group.rotation.y = n.heading; T.update(dt, { speed, near: true });
      n.follow(n, d); continue;
    }
    if (d > 75) continue;
    const facing = n.talkT > 0 || d < 2.4;
    if (facing) n.heading += angDiff(n.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 7);
    else if (n.loop) {
      if (n.pause > 0) n.pause -= dt;
      else {
        n.t += n.dir * n.speed * dt; loopAt(n.loop, n.t, _lp); n.pos.x = _lp.x; n.pos.z = _lp.z;
        n.heading += angDiff(n.heading, Math.atan2(_lp.tx * n.dir, _lp.tz * n.dir)) * Math.min(1, dt * 8); speed = n.speed / 3.2;
        if (Math.random() < dt * 0.11) { n.pause = rand(1.5, 4); if (Math.random() < 0.3) n.dir *= -1; }
      }
    } else if (n.home) n.heading += angDiff(n.heading, (n.home.ry || 0) + Math.sin(clock * 0.4 + n.t) * 0.6) * Math.min(1, dt * 2);
    T.group.rotation.y = n.heading;
    T.update(dt, facing ? { speed: 0, near: d < 45, lookX: 0, lookY: 0.15 } : { speed, near: d < 45 });
  }
}
function talkTo(n) {
  const T = n.T; n.talkT = 3.4; let line = n.onTalk ? n.onTalk(n) : null;    // los encargos hablan primero
  if (line) { /* ya está */ }
  else if ((n.mood0 === 'triste' || n.mood0 === 'enojado') && T.mood === n.mood0 && ++n.count >= 2) {
    n.count = 0; T.setMood('contento'); n.cheer = 25; line = '¡Gracias por escucharme! Ya me siento mejor.';
    burst('heart', n.pos.x, 1.8, n.pos.z, 5); SFX.nice();
  } else line = n.lines ? n.lines[n.li++ % n.lines.length] : choose(LINES[T.mood] || LINES.contento);
  say(n, line, 3.4); SFX.talk(); T.doTrick(T.mood === 'dormido' ? 'giggle' : choose(['hop', 'wave', 'giggle'])); gain('diversion', 0.06, 'charla' + n.name, 12);
  player.T.doTrick('wave'); player.heading = Math.atan2(n.pos.x - player.pos.x, n.pos.z - player.pos.z);
}

// ───────────────────────── criaturas del bosque ─────────────────────────
const creatures = [], interacts = [];
function nearPlayer(o) { return Math.hypot(player.pos.x - o.pos.x, player.pos.z - o.pos.z); }
function wetAt(x, z) { return riverDepth(x, z) < -0.1 && !onBridge(x, z); }

function makeRabbit(x, z, col) {
  const b = new Batch();
  b.sph(col, 0, 0.3, 0, 0.26, 0.24, 0.34).sph(col, 0, 0.5, 0.26, 0.19).sph(col, -0.08, 0.8, 0.2, 0.05, 0.2, 0.04).sph(col, 0.08, 0.8, 0.2, 0.05, 0.2, 0.04)
    .sph('#ffb3c7', -0.08, 0.8, 0.225, 0.028, 0.14, 0.02).sph('#ffb3c7', 0.08, 0.8, 0.225, 0.028, 0.14, 0.02).sph('#ffffff', 0, 0.3, -0.33, 0.1)
    .sph('#201a2a', -0.1, 0.55, 0.41, 0.036).sph('#201a2a', 0.1, 0.55, 0.41, 0.036).sph('#ff8fab', 0, 0.48, 0.45, 0.03)
    .sph(col, -0.13, 0.06, 0.2, 0.07, 0.06, 0.13).sph(col, 0.13, 0.06, 0.2, 0.07, 0.06, 0.13).sph(col, -0.16, 0.08, -0.12, 0.08, 0.08, 0.16).sph(col, 0.16, 0.08, -0.12, 0.08, 0.08, 0.16);
  const mesh = b.mesh(MAT_SOFT); mesh.scale.setScalar(1.25); mesh.position.set(x, 0, z); scene.add(mesh);
  const o = { kind: 'conejo', mesh, pos: mesh.position, home: { x, z }, tx: x, tz: z, hopP: 0, hopSpeed: 0, rest: 0, wait: rand(0, 3), follow: 0, scare: 0, heading: rand(0, TAU), side: rand(-1, 1), range: 5, clickR: 0.6,
    buddy: null, stuckT: 0, onLost: null, onStuck: null };
  o.bubblePos = (v) => v.set(o.pos.x, o.pos.y + 1.25, o.pos.z);
  o.update = (dt) => {
    const P = player.pos, dxp = P.x - o.pos.x, dzp = P.z - o.pos.z, dp = Math.hypot(dxp, dzp);
    o.follow = Math.max(0, o.follow - dt); o.scare = Math.max(0, o.scare - dt);
    if (o.follow > 0 && dp > 32) { o.follow = 0; if (o.onLost) o.onLost(o); }          // se quedó muy atrás
    if (o.buddy) { const B = o.buddy; o.tx = B.pos.x - Math.sin(B.heading) * 1.3 + o.side * 0.5; o.tz = B.pos.z - Math.cos(B.heading) * 1.3; }
    else if (o.follow > 0) { o.tx = P.x - Math.sin(player.heading) * 1.7 + o.side; o.tz = P.z - Math.cos(player.heading) * 1.7; }
    else if (dp < 3.2 && player.speedN > 1.3 && o.scare <= 0) { o.tx = o.pos.x - dxp / dp * 5; o.tz = o.pos.z - dzp / dp * 5; o.scare = 2; o.rest = 0; emit('excl', o.pos.x, 1.1, o.pos.z); }
    else if (o.scare <= 0) { o.wait -= dt; if (o.wait <= 0) { o.wait = rand(2, 6); const a = rand(0, TAU), r = rand(0, o.range); o.tx = o.home.x + Math.cos(a) * r; o.tz = o.home.z + Math.sin(a) * r; } }
    const dx = o.tx - o.pos.x, dz = o.tz - o.pos.z, d = Math.hypot(dx, dz);
    if (o.hopP > 0) {
      o.hopP += dt / 0.36; const k = Math.min(1, o.hopP);
      o.pos.x += Math.sin(o.heading) * o.hopSpeed * dt; o.pos.z += Math.cos(o.heading) * o.hopSpeed * dt; o.pos.x = clamp(o.pos.x, -60, 60);
      o.pos.y = Math.sin(k * Math.PI) * 0.4; mesh.rotation.x = -Math.cos(k * Math.PI) * 0.28;
      if (o.follow > 0 || o.buddy) resolveAgent(o.pos, 0.3);
      if (o.hopP >= 1) { o.hopP = 0; o.pos.y = 0; mesh.rotation.x = 0; o.rest = (o.follow > 0 || o.scare > 0 || o.buddy) ? 0.03 : rand(0.1, 0.35); }
    } else {
      o.rest -= dt;
      if (d > 0.8) {
        o.heading += angDiff(o.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
        if (o.rest <= 0) {
          const sp = (o.follow > 0 || o.scare > 0 || o.buddy) ? clamp(d / 0.36, 3, 8) : 2.6;
          if (wetAt(o.pos.x + Math.sin(o.heading) * sp * 0.4, o.pos.z + Math.cos(o.heading) * sp * 0.4)) {
            o.rest = 0.6; o.tx = o.pos.x; o.tz = o.pos.z;
            if (o.follow > 0 && (o.stuckT += 0.6) > 2.4 && o.onStuck) { o.onStuck(o); o.stuckT = -20; }   // no nada: hay que cruzar por el puente
          }
          else { o.hopP = 0.001; o.hopSpeed = sp; if (o.stuckT > 0) o.stuckT = 0; }
        }
      } else if (dp < 4.5) o.heading += angDiff(o.heading, Math.atan2(dxp, dzp)) * Math.min(1, dt * 5);
    }
    mesh.rotation.y = o.heading;
  };
  o.interact = () => { if (o.buddy) { say(o, '(no se separa de Tofu)', 2); burst('heart', o.pos.x, 0.9, o.pos.z, 2); return; }
    o.follow = petRabbit(o); o.scare = 0; burst('heart', o.pos.x, 0.9, o.pos.z, 3); say(o, choose(['¡Hop, hop!', '(mueve la naricita)', '¡Te sigo!']), 2.2); SFX.nice(); };
  creatures.push(o); interacts.push({ pos: o.pos, range: 3.2, label: 'Acariciar al conejo', act: o.interact, who: o });
  return o;
}
function makeFrog(x, side) {
  const b = new Batch(), G = '#5ec25a';
  b.sph(G, 0, 0.2, 0, 0.28, 0.2, 0.32).sph('#c9f0a8', 0, 0.14, 0.08, 0.22, 0.14, 0.26).sph(G, -0.13, 0.4, 0.14, 0.1).sph(G, 0.13, 0.4, 0.14, 0.1)
    .sph('#ffffff', -0.13, 0.42, 0.2, 0.075).sph('#ffffff', 0.13, 0.42, 0.2, 0.075).sph('#201a2a', -0.13, 0.43, 0.26, 0.04).sph('#201a2a', 0.13, 0.43, 0.26, 0.04)
    .sph(G, -0.26, 0.08, -0.1, 0.12, 0.08, 0.18).sph(G, 0.26, 0.08, -0.1, 0.12, 0.08, 0.18).sph(G, -0.2, 0.05, 0.24, 0.07, 0.05, 0.1).sph(G, 0.2, 0.05, 0.24, 0.07, 0.05, 0.1);
  const mesh = b.mesh(MAT_SOFT), z = riverZ(x) + side * 5.5; mesh.position.set(x, 0, z); scene.add(mesh);
  const o = { kind: 'rana', mesh, pos: mesh.position, side, jump: null, croakT: rand(1, 5), heading: side > 0 ? Math.PI : 0, cool: 0, clickR: 0.5 };
  o.bubblePos = (v) => v.set(o.pos.x, o.pos.y + 0.95, o.pos.z);
  o.leap = (tx, tz, hgt) => { o.jump = { t: 0, fx: o.pos.x, fz: o.pos.z, tx, tz, h: hgt }; o.heading = Math.atan2(tx - o.pos.x, tz - o.pos.z) || o.heading; };
  o.update = (dt) => {
    o.cool = Math.max(0, o.cool - dt);
    if (o.jump) {
      const j = o.jump; j.t += dt / 0.55; const k = Math.min(1, j.t);
      o.pos.set(lerp(j.fx, j.tx, k), Math.sin(k * Math.PI) * j.h, lerp(j.fz, j.tz, k)); mesh.scale.set(1, 1 + Math.sin(k * Math.PI) * 0.25, 1);
      if (k >= 1) { o.jump = null; o.pos.y = 0; mesh.scale.set(1, 1, 1); }
    } else {
      o.croakT -= dt;
      if (o.croakT < 0.25) { const k = 1 + Math.sin((0.25 - o.croakT) / 0.25 * Math.PI) * 0.18; mesh.scale.set(k, 2 - k, k); }
      if (o.croakT <= 0) { o.croakT = rand(3, 7); mesh.scale.set(1, 1, 1); }
      if (o.cool <= 0 && nearPlayer(o) < 2.0) { const nx = clamp(o.pos.x + rand(3, 6) * (Math.random() < 0.5 ? -1 : 1), -56, 56); o.leap(nx, riverZ(nx) + o.side * rand(5.2, 6.4), 0.9); o.cool = 1.2; }
    }
    mesh.rotation.y = o.heading;
  };
  o.interact = () => { say(o, choose(['¡Croac!', '¡Croac, croac!', '¡Ribbit!']), 1.8); o.leap(o.pos.x, o.pos.z, 1.1); o.cool = 2.5; emit('note', o.pos.x, 1, o.pos.z); tone(180, 120, 0.18, 'square', 0.05); tone(200, 130, 0.18, 'square', 0.05, 0.22); };
  creatures.push(o); interacts.push({ pos: o.pos, range: 3.0, label: 'Saludar a la rana', act: o.interact, who: o });
}
const G_LEG = new THREE.CylinderGeometry(0.065, 0.05, 0.9, 6).translate(0, -0.45, 0);
const M_DEERLEG = new THREE.MeshStandardMaterial({ color: 0xb57a48, roughness: 0.75 });
function makeDeer(home) {
  const g = new THREE.Group(), C = '#c98a55', b = new Batch();
  b.sph(C, 0, 1.08, 0, 0.36, 0.38, 0.8).sph('#e8c39e', 0, 0.98, 0.3, 0.3, 0.3, 0.45).sph('#ffffff', 0, 1.22, -0.78, 0.11);
  for (const q of [[0.14, 1.42, -0.2], [-0.16, 1.4, 0.1], [0.05, 1.44, 0.32], [-0.08, 1.43, -0.45], [0.2, 1.36, 0.2]]) b.sph('#fff3df', q[0], q[1], q[2], 0.055, 0.03, 0.055);
  const body = b.mesh(MAT_SOFT); g.add(body);
  const hb = new Batch();
  hb.cyl(C, 0, 0.3, 0.14, 0.13, 0.19, 0.75, 8, 0.45).sph(C, 0, 0.7, 0.36, 0.2, 0.2, 0.27).sph('#e8c39e', 0, 0.63, 0.58, 0.11, 0.1, 0.14).sph('#3a2a2a', 0, 0.65, 0.71, 0.045)
    .sph('#201a2a', -0.17, 0.75, 0.46, 0.04).sph('#201a2a', 0.17, 0.75, 0.46, 0.04).sph(C, -0.23, 0.86, 0.3, 0.06, 0.11, 0.035).sph(C, 0.23, 0.86, 0.3, 0.06, 0.11, 0.035);
  for (const sx of [-1, 1]) hb.cyl('#f2e3c6', sx * 0.1, 1.08, 0.3, 0.02, 0.03, 0.42, 5, 0, -sx * 0.25).cyl('#f2e3c6', sx * 0.2, 1.2, 0.3, 0.015, 0.02, 0.22, 5, 0, -sx * 0.9).cyl('#f2e3c6', sx * 0.12, 1.3, 0.34, 0.015, 0.02, 0.2, 5, 0.5, 0);
  const headG = new THREE.Group(); headG.position.set(0, 1.25, 0.62); headG.add(hb.mesh(MAT_SOFT)); g.add(headG);
  const legs = [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.5], [0.2, -0.5]].map((q) => { const m = new THREE.Mesh(G_LEG, M_DEERLEG); m.position.set(q[0], 0.92, q[1]); m.castShadow = true; g.add(m); return m; });
  g.scale.setScalar(1.15); g.position.set(home.x, 0, home.z); scene.add(g);
  const o = { kind: 'venado', mesh: g, pos: g.position, home, tx: home.x, tz: home.z, wait: rand(1, 4), heading: rand(0, TAU), ph: 0, scare: 0, greet: 0, graze: 0, clickR: 1.0 };
  o.bubblePos = (v) => v.set(o.pos.x, 2.6, o.pos.z);
  o.update = (dt) => {
    const P = player.pos, dxp = P.x - o.pos.x, dzp = P.z - o.pos.z, dp = Math.hypot(dxp, dzp);
    o.scare = Math.max(0, o.scare - dt); o.greet = Math.max(0, o.greet - dt);
    if (o.greet <= 0 && o.scare <= 0 && dp < 4.5 && player.speedN > 1.3) { o.scare = 2.5; const a = Math.atan2(o.home.x - o.pos.x - dxp, o.home.z - o.pos.z - dzp); o.tx = clamp(o.pos.x + Math.sin(a) * 8, -57, 57); o.tz = o.pos.z + Math.cos(a) * 8; emit('excl', o.pos.x, 2.6, o.pos.z); }
    else if (o.scare <= 0 && o.greet <= 0) { o.wait -= dt; if (o.wait <= 0) { o.wait = rand(4, 9); const a = rand(0, TAU), r = rand(1, 7); o.tx = o.home.x + Math.cos(a) * r; o.tz = o.home.z + Math.sin(a) * r; o.graze = Math.random() < 0.6 ? 1 : 0; } }
    const dx = o.tx - o.pos.x, dz = o.tz - o.pos.z, d = Math.hypot(dx, dz); let moving = false, headX = 0;
    if (o.greet > 0) { o.heading += angDiff(o.heading, Math.atan2(dxp, dzp)) * Math.min(1, dt * 5); headX = Math.sin(clamp((2.6 - o.greet) / 1.2, 0, 1) * Math.PI) * 0.7; }
    else if (d > 0.5) {
      const sp = o.scare > 0 ? 5 : 1.4; o.heading += angDiff(o.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 4);
      const nx = o.pos.x + Math.sin(o.heading) * sp * dt, nz = o.pos.z + Math.cos(o.heading) * sp * dt;
      if (!wetAt(nx, nz)) { o.pos.x = nx; o.pos.z = nz; moving = true; o.ph += dt * sp * 3.2; } else { o.tx = o.pos.x; o.tz = o.pos.z; }
    } else if (o.graze) headX = 1.05 + Math.sin(clock * 3) * 0.05;
    headG.rotation.x = damp(headG.rotation.x, headX, 5, dt);
    legs.forEach((m, i) => { m.rotation.x = moving ? Math.sin(o.ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 : damp(m.rotation.x, 0, 8, dt); });
    g.position.y = moving ? Math.abs(Math.sin(o.ph)) * 0.04 : 0; g.rotation.y = o.heading;
  };
  o.interact = () => { o.greet = 2.6; o.scare = 0; o.tx = o.pos.x; o.tz = o.pos.z; burst('heart', o.pos.x, 2.3, o.pos.z, 4); say(o, choose(['El venado te hace una reverencia.', '(te olfatea con cariño)', 'El venado agacha la cabeza para que lo acaricies.']), 2.8); SFX.nice(); };
  creatures.push(o); interacts.push({ pos: o.pos, range: 3.6, label: 'Acariciar al venado', act: o.interact, who: o });
}
function makeOwl() {
  const b = new Batch(), C = '#9a6b45', D = '#7a5232';
  b.sph(C, 0, 0.42, 0, 0.3, 0.4, 0.28).sph('#e8cfa8', 0, 0.36, 0.14, 0.22, 0.3, 0.18).sph('#ffffff', -0.12, 0.6, 0.22, 0.11, 0.11, 0.06).sph('#ffffff', 0.12, 0.6, 0.22, 0.11, 0.11, 0.06)
    .sph('#231d3b', -0.12, 0.6, 0.27, 0.05, 0.05, 0.03).sph('#231d3b', 0.12, 0.6, 0.27, 0.05, 0.05, 0.03).sph('#ffb347', 0, 0.5, 0.29, 0.04, 0.06, 0.05)
    .cone(D, -0.17, 0.84, 0, 0.07, 0.2, 5).cone(D, 0.17, 0.84, 0, 0.07, 0.2, 5).sph(D, -0.29, 0.4, 0, 0.08, 0.28, 0.2).sph(D, 0.29, 0.4, 0, 0.08, 0.28, 0.2)
    .sph('#ffb347', -0.1, 0.04, 0.12, 0.06, 0.04, 0.09).sph('#ffb347', 0.1, 0.04, 0.12, 0.06, 0.04, 0.09);
  const mesh = b.mesh(MAT_SOFT); mesh.scale.setScalar(1.3); mesh.position.set(STUMP.x, 1.12, STUMP.z); scene.add(mesh);
  const o = { kind: 'búho', mesh, pos: mesh.position, heading: 0, li: 0, hop: 0, clickR: 0.7 };
  const wisdom = ['Uuh, uuh. Quien cruza con el semáforo en rojo, cruza tranquilo.', 'Uuh. El río nace en las montañas y nunca tiene prisa.', 'Uuh, uuh. Si te mareas, quédate quieto y respira.', 'Uuh. Los conejos confían en quien camina despacio.', 'Uuh, uuh. Tu casa queda al sur, siguiendo el camino.'];
  o.bubblePos = (v) => v.set(o.pos.x, o.pos.y + 1.4, o.pos.z);
  o.update = (dt) => {
    const d = nearPlayer(o); if (d < 14) o.heading += angDiff(o.heading, Math.atan2(player.pos.x - o.pos.x, player.pos.z - o.pos.z)) * Math.min(1, dt * 3);
    o.hop = Math.max(0, o.hop - dt * 2.2); mesh.position.y = 1.12 + Math.sin(o.hop * Math.PI) * 0.3; mesh.rotation.y = o.heading; mesh.rotation.z = Math.sin(clock * 1.3) * 0.05;
  };
  o.interact = () => { say(o, wisdom[o.li++ % wisdom.length], 4.2); o.hop = 1; tone(330, 260, 0.3, 'sine', 0.06); tone(300, 240, 0.35, 'sine', 0.06, 0.35); };
  creatures.push(o); interacts.push({ pos: o.pos, range: 3.6, label: 'Escuchar al búho', act: o.interact, who: o });
}
const butterflies = [];
const G_WING_R = new THREE.CircleGeometry(0.17, 8).rotateX(-Math.PI / 2).translate(0.17, 0, 0), G_WING_L = new THREE.CircleGeometry(0.17, 8).rotateX(-Math.PI / 2).translate(-0.17, 0, 0);
function makeButterfly(x, z, col) {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
  const wr = new THREE.Mesh(G_WING_R, mat), wl = new THREE.Mesh(G_WING_L, mat), body = new THREE.Mesh(G_BOX, M_LINE); body.scale.set(0.035, 0.035, 0.26);
  g.add(wr, wl, body); scene.add(g);
  butterflies.push({ g, wr, wl, home: { x, z }, cx: x, cz: z, a: rand(0, TAU), r: rand(0.6, 2.2), y: rand(0.8, 1.9), sp: rand(0.9, 1.8) * (Math.random() < 0.5 ? -1 : 1), ph: rand(0, 9) });
}
function updateButterflies(dt) {
  const P = player, calm = P.idleT > 2.2 && P.state === 'normal';
  let attracted = 0;
  for (const b of butterflies) {
    const dh = Math.hypot(P.pos.x - b.home.x, P.pos.z - b.home.z);
    if (dh > 60) continue;
    const att = calm && dh < 9 && attracted < 5; if (att) attracted++;
    b.cx = damp(b.cx, att ? P.pos.x : b.home.x, 1.3, dt); b.cz = damp(b.cz, att ? P.pos.z : b.home.z, 1.3, dt);
    const r = att ? 0.9 : b.r, y = att ? 2.3 : b.y;
    b.a += dt * b.sp; b.ph += dt * 18;
    b.g.position.set(b.cx + Math.cos(b.a) * r, y + Math.sin(b.a * 2.3 + b.ph * 0.05) * 0.3, b.cz + Math.sin(b.a) * r);
    b.g.rotation.y = -b.a + (b.sp > 0 ? 0 : Math.PI);
    const f = 0.25 + Math.abs(Math.sin(b.ph)) * 1.0; b.wr.rotation.z = f; b.wl.rotation.z = -f;
  }
}
const fishes = [];
for (let i = 0; i < 3; i++) {
  const b = new Batch(), C = ['#ff8a3c', '#ffd23f', '#ff6b9d'][i];
  b.sph(C, 0, 0, 0, 0.11, 0.15, 0.36).add(gCone(6), C, 0, 0, -0.42, 0.15, 0.22, 0.03, Math.PI / 2, 0, 0).sph('#201a2a', -0.08, 0.04, 0.24, 0.03).sph('#201a2a', 0.08, 0.04, 0.24, 0.03);
  const m = b.mesh(MAT_SOFT); m.visible = false; scene.add(m); fishes.push({ m, t: -rand(0.5, 4), x: 0, z0: 0, dir: 1 });
}
function updateFish(dt) {
  if (player.pos.z > -150 || player.pos.z < NORTH_Z) return;
  for (const f of fishes) {
    f.t += dt;
    if (f.t < 0) continue;
    if (!f.m.visible) {
      const bx = fishBias();                       // con el encargo de los peces, saltan cerca de quien espera en la orilla
      f.x = clamp(bx != null ? bx + rand(-4, 4) : player.pos.x + rand(-22, 22), -58, 58); if (Math.abs(f.x - BR.x) < 3) f.x += 6;
      f.dir = Math.random() < 0.5 ? 1 : -1; f.z0 = riverZ(f.x) - f.dir * 1.6; f.m.visible = true; burst('splash', f.x, 0.2, f.z0, 4); fishJumped(f);
    }
    const k = f.t / 0.9;
    if (k >= 1) { f.m.visible = false; burst('splash', f.x, 0.2, f.z0 + f.dir * 3.2, 4); if (Math.hypot(player.pos.x - f.x, player.pos.z - f.z0) < 25) SFX.splash(); f.t = -rand(1.5, 5); continue; }
    f.m.position.set(f.x, Math.sin(k * Math.PI) * 1.3, f.z0 + f.dir * 3.2 * k);
    f.m.rotation.set(-Math.cos(k * Math.PI) * 1.0 * f.dir, f.dir > 0 ? 0 : Math.PI, 0); f.m.rotation.order = 'YXZ';
  }
}
[[14, -130, '#ffffff'], [-20, -102, '#d9b38c'], [-14, -172, '#ffffff'], [24, -181, '#b9b3ad'], [-20, -232, '#d9b38c'], [12, -250, '#ffffff']].forEach((q) => makeRabbit(q[0], q[1], q[2]));
[[-34, 1], [-13, -1], [15, 1], [36, -1], [50, 1]].forEach((q) => makeFrog(q[0], q[1]));
makeDeer({ x: CLEAR[1].x, z: CLEAR[1].z }); makeDeer({ x: CLEAR[2].x, z: CLEAR[2].z });
makeOwl();
for (let i = 0; i < 16; i++) { const z = i < 8 ? rr(-155, -70) : rr(-255, -165), x = rr(-45, 45); makeButterfly(x, z, pick(['#ff8fb1', '#ffd23f', '#8fd6ff', '#c58bff', '#ffffff', '#ff9f6b'])); }
for (let i = 0; i < 4; i++) makeButterfly(rr(-14, 14), rr(-58, -32), pick(['#ff8fb1', '#ffd23f', '#8fd6ff']));
makeButterfly(-4, 8, '#ffd23f'); makeButterfly(8, 11, '#ff8fb1');

// ───────────────────────── el norte: medidas ─────────────────────────
// Más allá del bosque (Z < NORTH_Z) hay tres picos de 400 m; a 1 km del bosque está Valle Alegre y, después, un bosque
// sin fin que se genera alrededor de Tamachin mientras camina. Todo lo de aquí usa sus propias semillas (mulberry):
// `rnd` es del mundo de casa y cualquier llamada extra movería lo que se genera después.
const Z_TOWN_S = -1288, Z_TOWN_N = -1416, Z_FOREST2 = -1440, X_MOUNT = 340, TOWN_Z = -1352;
const PEAKS = [
  { name: 'Pico Malvavisco', x: -300, z: -715, top: 400, r: 520, flag: '#ff8fb1' },
  { name: 'Pico Gelatina', x: 0, z: -770, top: 400, r: 520, flag: '#ffb347' },
  { name: 'Pico Turrón', x: 300, z: -715, top: 400, r: 520, flag: '#35c9a0' },
];
// la cordillera sigue a los lados y dos lomas encierran el valle del pueblo
const RANGE = PEAKS.concat([
  { x: -660, z: -760, top: 380, r: 560 }, { x: 660, z: -760, top: 380, r: 560 }, { x: -540, z: -1190, top: 250, r: 400 }, { x: 540, z: -1190, top: 250, r: 400 },
  { x: -235, z: TOWN_Z, top: 130, r: 165 }, { x: 235, z: TOWN_Z, top: 130, r: 165 },
]);
// perfil de cada cerro: más empinado arriba y suave abajo, con la cima redondeada (radio 6 % de la base)
const CAP = 0.06, CAP_B = 0.75 * Math.sqrt(1 - CAP) / CAP, CAP_A = Math.pow(1 - CAP, 1.5) + CAP_B * CAP * CAP;
const peakF = (d) => (d >= 1 ? 0 : d < CAP ? CAP_A - CAP_B * d * d : Math.pow(1 - d, 1.5)) / CAP_A;
function mountainH(x, z) {
  if (z > NORTH_Z || z < Z_FOREST2) return 0;
  let h = 0;
  for (const p of RANGE) { const d = Math.hypot(x - p.x, z - p.z) / p.r; if (d < 1) h = Math.max(h, p.top * peakF(d)); }
  if (h > 0.5) {                                                   // crestas suaves; las cimas quedan limpias
    const m = Math.min(1, h / 60) * (1 - sstep(320, 380, h));
    h += m * (9 * Math.sin(x * 0.031 + 1.3) * Math.sin(z * 0.027 + 0.7) + 5 * Math.sin(x * 0.071 - z * 0.053) + 2.5 * Math.sin(x * 0.13 + z * 0.11));
  }
  return Math.max(0, h) * sstep(NORTH_Z, NORTH_Z - 30, z) * sstep(Z_FOREST2, Z_FOREST2 + 30, z);
}
// rejilla de alturas: la malla y los pies de Tamachin usan los mismos triángulos
const TG = { x0: -720, z0: NORTH_Z, s: 8, nx: 181, nz: 148 };              // filas hacia el norte: z = z0 - j·s
const TH = new Float32Array(TG.nx * TG.nz);
for (let j = 0; j < TG.nz; j++) for (let i = 0; i < TG.nx; i++) TH[j * TG.nx + i] = mountainH(TG.x0 + i * TG.s, TG.z0 - j * TG.s);
function terrainY(x, z) {
  const fx = (x - TG.x0) / TG.s, fz = (TG.z0 - z) / TG.s;
  if (fx < 0 || fz < 0 || fx >= TG.nx - 1 || fz >= TG.nz - 1) return 0;
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * TG.nx + i;
  const h00 = TH[k], h10 = TH[k + 1], h01 = TH[k + TG.nx], h11 = TH[k + TG.nx + 1];
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
const slopeAt = (x, z) => Math.hypot(terrainY(x + 1, z) - terrainY(x - 1, z), terrainY(x, z + 1) - terrainY(x, z - 1)) / 2;

// ───────────────────────── montañas: malla ─────────────────────────
// Sombreado suave: normales y colores salen de la rejilla (no de cada losa), así no se notan las costuras.
// Color por altura y pendiente: pasto, pasto alto, roca y nieve. Lo llano no se dibuja: ahí se ve el pasto de siempre.
const terrain = (() => {
  const hAt = (i, j) => TH[clamp(j, 0, TG.nz - 1) * TG.nx + clamp(i, 0, TG.nx - 1)];
  const GR = new THREE.Color('#8fd16b'), GR2 = new THREE.Color('#82c562'), HI = new THREE.Color('#63a354'), RK = new THREE.Color('#aaa295'), SN = new THREE.Color('#dfe7f1'), c = new THREE.Color(), n = new THREE.Vector3();
  const grain = canvasTex(128, 128, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); const R = mulberry(77);       // grano gris: el color lo ponen los vértices
    for (let i = 0; i < 500; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.012 + R() * 0.022).toFixed(3) + ')'; g.beginPath(); g.ellipse(R() * 128, R() * 128, 0.8 + R() * 2, 0.5 + R() * 1.3, R() * 3, 0, TAU); g.fill(); } });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grain }), TILE = 24, tiles = [];   // en losas de 192 m: se dibuja solo lo que se ve
  for (let tj = 0; tj < TG.nz - 1; tj += TILE) for (let ti = 0; ti < TG.nx - 1; ti += TILE) {
    const j1 = Math.min(tj + TILE, TG.nz - 1), i1 = Math.min(ti + TILE, TG.nx - 1), W = i1 - ti + 1, pos = [], nor = [], col = [], uv = [], idx = [];
    for (let j = tj; j <= j1; j++) for (let i = ti; i <= i1; i++) {
      const h = hAt(i, j), dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * TG.s), dz = -(hAt(i, j + 1) - hAt(i, j - 1)) / (2 * TG.s);
      n.set(-dx, 1, -dz).normalize(); pos.push(TG.x0 + i * TG.s, h > 0.05 ? h : -0.15, TG.z0 - j * TG.s); nor.push(n.x, n.y, n.z); uv.push(i * TG.s / 6, j * TG.s / 6);
      const x = TG.x0 + i * TG.s, z = TG.z0 - j * TG.s, wob = Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.sin(x * 0.037 - z * 0.051) * 0.5;
      c.copy(GR).lerp(GR2, 0.5 + 0.5 * wob);
      if (h > 120) c.lerp(HI, Math.min(1, (h - 120) / 170));
      c.lerp(RK, clamp((0.8 - n.y) * 3.2, 0, 1) * 0.85 + clamp((h - 270) / 50, 0, 1) * 0.6);
      c.lerp(SN, clamp((h - 322 - 12 * wob) / 22, 0, 1));
      col.push(c.r, c.g, c.b);
    }
    for (let j = tj; j < j1; j++) for (let i = ti; i < i1; i++) {
      if (hAt(i, j) <= 0.05 && hAt(i + 1, j) <= 0.05 && hAt(i, j + 1) <= 0.05 && hAt(i + 1, j + 1) <= 0.05) continue;
      const a = (j - tj) * W + (i - ti), b = a + 1, d = a + W, e = d + 1; idx.push(a, b, d, e, d, b);   // mismo corte que terrainY
    }
    if (!idx.length) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); tiles.push(m);
  }
  return tiles;
})();

// ───────────────────────── límites del mundo ─────────────────────────
// Ancho caminable por franja: casa, montañas, pueblo y su prado, bosque sin fin (sin límite).
// Las líneas quedan justo antes de las filas de árboles de cada borde: lo que se ve como límite son los árboles, no una pared en el pasto.
const BAND_EDGES = [NORTH_Z - 6.5, Z_TOWN_S + 4.5, Z_FOREST2 - 6.5];   // a 3 m o más de los troncos: si no, las copas lo tapan
function xLimitAt(z) { return z > BAND_EDGES[0] ? LIMIT : z > BAND_EDGES[1] ? X_MOUNT : z > BAND_EDGES[2] ? LIMIT : Infinity; }
function keepInWorld(pos) {
  if (pos.z > LIMIT) pos.z = LIMIT;
  const ax = Math.abs(pos.x), lim = xLimitAt(pos.z); if (ax <= lim) return;
  let bz = null, bd = Infinity;                                    // volver a la franja de la que venía, o de lado: lo más corto
  for (const e of BAND_EDGES) for (const z of [e + 0.001, e - 0.001]) { const d = Math.abs(z - pos.z); if (ax <= xLimitAt(z) && d < bd) { bd = d; bz = z; } }
  if (ax - lim <= bd) pos.x = Math.sign(pos.x) * lim; else pos.z = bz;
}
// colisiones del norte en una rejilla (los arreglos globales se recorren completos en cada cuadro)
const NCELL = 24, ngrid = new Map();
function northCircle(x, z, r) { const k = Math.floor(x / NCELL) + ',' + Math.floor(z / NCELL); let a = ngrid.get(k); if (!a) ngrid.set(k, (a = [])); a.push({ x, z, r }); }
function northCollide(pos, r) {
  if (pos.z > NORTH_Z + 6) return;
  const cx = Math.floor(pos.x / NCELL), cz = Math.floor(pos.z / NCELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = ngrid.get((cx + i) + ',' + (cz + j)); if (a) for (const c of a) pushOutCircle(pos, r, c.x, c.z, c.r); }
  forestCollide(pos, r);
}

// ───────────────────────── árboles que se agachan (en el shader) ─────────────────────────
// Los árboles del norte son miles: en vez de recorrerlos en cada cuadro, el vertex shader agacha a los que quedan entre
// la cámara y Tamachin (misma prueba que updateScenery hace con los de casa). uDuck = (x, z de Tamachin, x, z de la cámara).
const duckU = { uDuck: { value: new THREE.Vector4(0, 0, 0, 10) }, uDuckR: { value: 1 } };
const DUCK_GLSL = `#include <begin_vertex>
#ifdef USE_INSTANCING
{ vec3 io = instanceMatrix[3].xyz; float sc = length(instanceMatrix[0].xyz);
  float dz = io.z - uDuck.y, back = max(1.0, uDuck.w - uDuck.y);
  float rx = uDuck.x + (uDuck.z - uDuck.x) * clamp(dz / back, 0.0, 1.0), reach = (2.4 + 5.5 * sc) * uDuckR;
  float k = smoothstep(0.3, 1.2, dz) * (1.0 - smoothstep(reach - 1.5, reach, dz)) * (1.0 - smoothstep(1.7 * sc + 0.6, 1.7 * sc + 1.6, abs(io.x - rx)));
  transformed.y *= 1.0 - 0.72 * k; transformed.xz *= 1.0 + 0.25 * k; }
#endif`;
function duckify(m) {
  m.onBeforeCompile = (sh) => { sh.uniforms.uDuck = duckU.uDuck; sh.uniforms.uDuckR = duckU.uDuckR; sh.vertexShader = 'uniform vec4 uDuck;\nuniform float uDuckR;\n' + sh.vertexShader.replace('#include <begin_vertex>', DUCK_GLSL); };
  m.customProgramCacheKey = () => 'agacharse'; return m;
}
const duckDepth = duckify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));   // la sombra también se agacha
// misma geometría, otra esfera envolvente: así cada sector o casilla se recorta solo cuando no se ve (no se libera nunca: comparte búferes)
function geoView(base, center, radius) {
  const g = new THREE.BufferGeometry(); for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
  if (base.index) g.setIndex(base.index); g.boundingSphere = new THREE.Sphere(center, radius); return g;
}

// ───────────────────────── vegetación fija del norte (montañas, pueblo) ─────────────────────────
const SKIND = {
  pine: { geo: TREE_GEO[0], duck: true, shadow: true }, oak: { geo: TREE_GEO[1], duck: true, shadow: true },
  rock: { geo: new Batch().rock('#b3ada1', 0, 0.35, 0, 1, 0.7, 0.85).geometry(), shadow: true },
  bush: { geo: new Batch().ico('#57c06a', 0, 0.5, 0, 0.8, 0.6, 0.8).ico('#4db460', 0.5, 0.4, 0.2, 0.55, 0.45, 0.55).ico('#66cc78', -0.45, 0.42, -0.15, 0.5, 0.42, 0.5).geometry(), shadow: true },
  tuft: { geo: new Batch().cone('#6fbf55', 0, 0.16, 0, 0.07, 0.34, 4).cone('#7ccb62', 0.09, 0.12, 0.03, 0.06, 0.26, 4).cone('#63b34a', -0.07, 0.13, -0.05, 0.06, 0.28, 4).geometry() },
};
for (const k in SKIND) { const d = SKIND[k]; d.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); if (d.duck) duckify(d.mat); d.list = []; }
function addStatic(kind, x, y, z, s, ry, tint) { SKIND[kind].list.push({ x, y, z, s, ry, tint: tint || 1 }); }
function buildStatic() {                                           // un InstancedMesh por tipo y por sector de 120 m
  for (const k in SKIND) {
    const d = SKIND[k], groups = new Map();
    for (const it of d.list) { const key = Math.floor(it.x / 120) + ',' + Math.floor(it.z / 120); let a = groups.get(key); if (!a) groups.set(key, (a = [])); a.push(it); }
    for (const items of groups.values()) {
      const c = new THREE.Vector3(); for (const it of items) c.add(_ip.set(it.x, it.y, it.z)); c.divideScalar(items.length);
      let rad = 0; for (const it of items) rad = Math.max(rad, c.distanceTo(_ip.set(it.x, it.y, it.z)) + 7 * it.s);
      const m = new THREE.InstancedMesh(geoView(d.geo, c, rad), d.mat, items.length);
      items.forEach((it, i) => { _im.compose(_ip.set(it.x, it.y, it.z), _iq.setFromEuler(_ie.set(0, it.ry, 0)), _is.set(it.s, it.s, it.s)); m.setMatrixAt(i, _im); m.setColorAt(i, _ic.setRGB(it.tint, it.tint, it.tint * 0.96)); });
      m.frustumCulled = true;                                     // en r128 un InstancedMesh viene sin recorte; esta esfera sí envuelve a todos
      m.castShadow = !!d.shadow; m.receiveShadow = true; if (d.duck) m.customDepthMaterial = duckDepth; scene.add(m);
    }
  }
}
const northB = new Batch();
function northSign(text, x, z, w, ry) {
  const y0 = groundY(x, z), tex = canvasTex(512, 160, (g, W, Hh) => {
    g.fillStyle = '#b98552'; g.fillRect(0, 0, W, Hh); g.strokeStyle = '#7a5230'; g.lineWidth = 12; g.strokeRect(6, 6, W - 12, Hh - 12);
    let fs = 78; g.textAlign = 'center'; g.textBaseline = 'middle';
    do { g.font = '900 ' + fs + 'px Nunito, "Trebuchet MS", Arial, sans-serif'; fs -= 4; } while (g.measureText(text).width > W - 60 && fs > 20);
    g.fillStyle = '#fff8e6'; g.fillText(text, W / 2, Hh / 2 + 4);
  });
  const h = w * 160 / 512, c = Math.cos(ry || 0), s = Math.sin(ry || 0), m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x + s * 0.08, y0 + 2.25, z + c * 0.08); m.rotation.y = ry || 0; scene.add(m);
  northB.box('#8a5a34', x, y0 + 2.25, z, w + 0.12, h + 0.12, 0.12, ry || 0);
  for (const sx of [-1, 1]) { const px = x + c * sx * w * 0.32 - s * 0.12, pz = z - s * sx * w * 0.32 - c * 0.12; northB.cyl(TRUNK, px, y0 + 1.1, pz, 0.09, 0.11, 2.4, 8); solidCircle(px, pz, 0.16); }
}

// ───────────────────────── sendero: del claro de la fogata, por el Pico Gelatina, a Valle Alegre ─────────────────────────
const TRAIL_GAP_X = 4.4;                                          // entre los árboles del borde; el sendero rodea un pino que hay en medio
const TRAIL = (() => {
  const P = PEAKS[1], pts = [[CAMP.x, CAMP.z - 3], [5.6, -249], [5.8, -258], [4.6, -266], [TRAIL_GAP_X, -271]];
  const zS = -284, zTop = P.z + CAP * P.r + 3, zN0 = P.z - CAP * P.r - 3, zN1 = Z_TOWN_S + 14;   // el zigzag termina antes del seto del pueblo
  for (let i = 1; i <= 90; i++) { const s = i / 90, A = 55 * Math.pow(1 - s, 0.8) * sstep(0, 0.08, s); pts.push([A * Math.sin(s * TAU * 2.5), lerp(zS, zTop, s)]); }   // zigzag que se angosta al subir
  pts.push([0, P.z]);
  for (let i = 0; i <= 90; i++) { const s = i / 90, A = 55 * Math.pow(s, 0.8) * sstep(0, 0.08, 1 - s); pts.push([-A * Math.sin(s * TAU * 2.5), lerp(zN0, zN1, s)]); }
  pts.push([0, Z_TOWN_S + 2], [0, Z_TOWN_S - 8]);
  return pts;
})();
function nearTrail(x, z, d) {
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const a = TRAIL[i], b = TRAIL[i + 1]; if (Math.max(a[1], b[1]) + d < z || Math.min(a[1], b[1]) - d > z) continue;
    const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez, t = L2 ? clamp(((x - a[0]) * ex + (z - a[1]) * ez) / L2, 0, 1) : 0;
    if (Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t) < d) return true;
  }
  return false;
}
// cinta del sendero pegada al terreno: cada orilla toma la altura del suelo bajo ella
function terrainRibbon(pts, halfW, lift, step) {
  const P = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) P.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]); }
  P.push(pts[pts.length - 1]);
  const pos = [], uv = [], idx = []; let dist = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (i) dist += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    for (const sd of [1, 0, -1]) { const x = P[i][0] - tz * halfW * sd, z = P[i][1] + tx * halfW * sd; pos.push(x, Math.max(0, groundY(x, z)) + lift, z); uv.push(0.5 - sd * 0.5, dist * 0.4); }
    if (i) { const q = i * 3; idx.push(q - 3, q, q - 2, q - 2, q, q + 1, q - 2, q + 1, q - 1, q - 1, q + 1, q + 2); }   // tres filas: sigue la curva del cerro
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, pathMat); m.receiveShadow = true; scene.add(m); return m;
}
terrainRibbon(TRAIL, 1.35, 0.12, 2.5);

// el muro de árboles del borde norte del bosque se vuelve sólido, menos donde pasa el sendero
for (const t of trees) if (t.z < -265.5 && Math.abs(t.x) < 72) {
  if (Math.abs(t.x - TRAIL_GAP_X) < 4.6) { t.s = 0.001; setTreeMatrix(t); } else solidCircle(t.x, t.z, 0.5 * t.s);
}
treeMesh[0].instanceMatrix.needsUpdate = treeMesh[1].instanceMatrix.needsUpdate = true;
solidBox(-72, -3.6, NORTH_Z + 4.6, NORTH_Z + 6); solidBox(12.4, 72, NORTH_Z + 4.6, NORTH_Z + 6);   // como antes, se detiene a unos metros del muro (sin colarse entre troncos); solo se pasa por el sendero
northSign('Montañas ↑', TRAIL_GAP_X - 3.4, -262.5, 2.8);

// ───────────────────────── montañas: árboles, rocas, cimas ─────────────────────────
{ const R = mulberry(9101), r2 = (a, b) => a + (b - a) * R();
  // bordes de la franja de las montañas, para que el límite no sea invisible: filas de pinos al sur (a los lados del bosque y del pueblo) y a los lados
  const edge = (px, pz) => { const s = r2(1.1, 1.6); addStatic('pine', px, terrainY(px, pz) - 0.15, pz, s, R() * TAU, r2(0.85, 1.02)); northCircle(px, pz, 0.95); };
  for (let x = 64.5; x <= X_MOUNT + 6; x += 2.9) for (const sx of [-1, 1]) { edge(sx * x, NORTH_Z - 2.2 - R() * 1.2); edge(sx * x, Z_TOWN_S + 0.4 + R() * 0.8); }
  for (let z = NORTH_Z - 4; z > Z_TOWN_S + 1; z -= 2.9) for (const sx of [-1, 1]) edge(sx * (X_MOUNT + 3.5 + R() * 1.2), z);
  for (let z = NORTH_Z - 9; z > Z_TOWN_S + 8; z -= 12.5) for (let x = -X_MOUNT - 40; x <= X_MOUNT + 40; x += 12.5) {
    const px = x + r2(-5, 5), pz = z + r2(-5, 5), h = terrainY(px, pz), sl = slopeAt(px, pz), u = R(), s = r2(0.9, 1.5), ry = R() * TAU, tint = r2(0.84, 1.04);
    if (nearTrail(px, pz, 3.6) || Math.hypot(px, pz - Z_TOWN_S) < 22 || Math.abs(Math.abs(px) - X_MOUNT - 4) < 3.5 || pz > NORTH_Z - 8 || pz < Z_TOWN_S + 6) continue;
    if (h < 255 && sl < 1.1 && u < 0.46 * (1 - h / 270) + 0.07) { addStatic('pine', px, h - 0.15, pz, s, ry, tint); northCircle(px, pz, 0.36 * s); }
    else if (u > 0.92 && sl < 1.5) { const rs = s * 0.9; addStatic('rock', px, h - 0.2 * rs, pz, rs, ry); if (rs > 0.95) northCircle(px, pz, 0.72 * rs); }
  }
  for (let i = 0; i < 46; i++) {                                   // postes que marcan el sendero
    const p = TRAIL[3 + i * 4]; if (!p) break; const q = TRAIL[4 + i * 4] || p, tx = q[0] - p[0], tz = q[1] - p[1], l = Math.hypot(tx, tz) || 1, x = p[0] + tz / l * 2.1, z = p[1] - tx / l * 2.1, y = terrainY(x, z);
    northB.cyl(WOOD, x, y + 0.45, z, 0.08, 0.1, 1.0, 7).cyl('#ef4b4b', x, y + 0.82, z, 0.105, 0.105, 0.12, 7); northCircle(x, z, 0.14);
  }
  for (const p of PEAKS) {                                         // cima: mojonera de piedras y bandera
    const y = terrainY(p.x, p.z);
    for (let k = 0; k < 7; k++) { const a = k * 0.9; northB.rock('#b9b3a6', p.x - 2.2 + Math.cos(a) * 0.7, y + 0.2 + (k > 4 ? 0.5 : 0), p.z + 1.2 + Math.sin(a) * 0.6, 0.45, 0.32, 0.4, a); }
    northB.cyl('#8a8f99', p.x + 1.6, y + 2.2, p.z, 0.07, 0.08, 4.4, 8).sph('#ffd76a', p.x + 1.6, y + 4.45, p.z, 0.13);
    northB.box(p.flag, p.x + 2.45, y + 3.75, p.z, 1.6, 0.95, 0.06).box('#ffffff', p.x + 2.45, y + 3.75, p.z + 0.04, 0.5, 0.3, 0.02);
    northCircle(p.x + 1.6, p.z, 0.2); northCircle(p.x - 2.2, p.z + 1.2, 0.9);
    p.y = y;
  }
  northSign(PEAKS[1].name + ' · 400 m', PEAKS[1].x - 4.5, PEAKS[1].z + 4, 3.4);
}

// ───────────────────────── Valle Alegre ─────────────────────────
// Un pueblo sin autos: calles empedradas, kiosco en la plaza, mercado al sur y posada con hamaca al norte.
const TBX = [[-62, -28], [-20, 20], [28, 62]], TBZ = TBX.map(([a, b]) => [TOWN_Z + a, TOWN_Z + b]);
const TOWN = { hammock: { x: 8.6, y: 1.05, z: TOWN_Z - 44.6 }, market: { x: 0, z: TOWN_Z + 41.5 }, stalls: [-10.5, 10.5] };   // puestos a los lados: el portón sur da a un pasillo
{ const tex = canvasTex(1024, 1024, (g, S) => {
    const K = S / 128, X = (x) => (x + 64) * K, Z = (z) => (z - TOWN_Z + 64) * K, rect = (x0, z0, x1, z1, f) => { g.fillStyle = f; g.fillRect(X(x0), Z(z0), (x1 - x0) * K, (z1 - z0) * K); };
    const R = mulberry(818), STONE2 = '#d9ccb2', COB = '#c2b59d';
    rect(-64, TOWN_Z - 64, 64, TOWN_Z + 64, '#8fd16b'); rect(-62.6, TOWN_Z - 62.6, 62.6, TOWN_Z + 62.6, STONE2);
    TBX.forEach((bx, i) => TBZ.forEach((bz, j) => { if (i === 1 && j === 0) return; rect(bx[0] + 2.8, bz[0] + 2.8, bx[1] - 2.8, bz[1] - 2.8, i === 1 ? '#e6d8bd' : '#cfc7b6'); }));
    rect(TBX[1][0] + 2.8, TBZ[0][0] + 2.8, TBX[1][1] - 2.8, TBZ[0][1] - 2.8, '#93d470'); rect(-1.4, TOWN_Z - 64, 1.4, TBZ[0][1], STONE2);   // jardín de la posada y su vereda
    for (const r of [-24, 24]) { rect(r - 4, TOWN_Z - 62.6, r + 4, TOWN_Z + 62.6, COB); rect(-62.6, TOWN_Z + r - 4, 62.6, TOWN_Z + r + 4, COB); }
    for (let i = 0; i < 5200; i++) { const r = [-24, 24][i % 2], a = TOWN_Z + (R() * 2 - 1) * 62, b = r + (R() * 2 - 1) * 3.8, w = 0.4 + R() * 0.5; g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(90,70,50,.13)';
      if (i % 4 < 2) g.fillRect(X(b), Z(a), w * K, w * K * 0.8); else g.fillRect(X(a - TOWN_Z), Z(b + TOWN_Z), w * K, w * K * 0.8); }
    g.strokeStyle = 'rgba(150,120,90,.25)'; g.lineWidth = 1.2; g.beginPath();                     // baldosas de la plaza y el mercado
    for (let v = -17; v <= 17; v += 1.7) { g.moveTo(X(v), Z(TOWN_Z - 17)); g.lineTo(X(v), Z(TOWN_Z + 17)); g.moveTo(X(-17), Z(TOWN_Z + v)); g.lineTo(X(17), Z(TOWN_Z + v)); }
    g.stroke(); g.fillStyle = '#d9a066'; g.beginPath(); g.arc(X(0), Z(TOWN_Z), 7.2 * K, 0, TAU); g.fill();
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(128, 128), new THREE.MeshLambertMaterial(decal({ map: tex }))); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, TOWN_Z); m.receiveShadow = true; scene.add(m);
}
const townB = new Batch();
{ const R = mulberry(4242), r2 = (a, b) => a + (b - a) * R(), tp = (arr) => arr[Math.floor(R() * arr.length)];
  // manzanas con casas (todas menos la columna del centro)
  TBX.forEach((bx, i) => TBZ.forEach((bz, j) => {
    if (i === 1) return;
    const rs = { w: i > 0, e: i < 2, n: j > 0, s: j < 2 }, ix0 = bx[0] + (rs.w ? 3.7 : 2.4), ix1 = bx[1] - (rs.e ? 3.7 : 2.4), iz0 = bz[0] + (rs.n ? 3.7 : 2.4), iz1 = bz[1] - (rs.s ? 3.7 : 2.4);
    const sx = lerp(ix0, ix1, r2(0.42, 0.58)), sz = lerp(iz0, iz1, r2(0.42, 0.58)), gap = 1.3;
    [[ix0, sx - gap, iz0, sz - gap], [sx + gap, ix1, iz0, sz - gap], [ix0, sx - gap, sz + gap, iz1], [sx + gap, ix1, sz + gap, iz1]].forEach(([x0, x1, z0, z1]) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (R() < 0.18) { addStatic('oak', cx - 2, 0, cz - 1.5, 0.85); addStatic('oak', cx + 2.6, 0, cz + 2, 0.75); northCircle(cx - 2, cz - 1.5, 0.3); northCircle(cx + 2.6, cz + 2, 0.27);
        townB.merge(PF_BENCH, cx, 0, cz + 0.6, 0); solidCircle(cx, cz + 0.6, 0.7); return; }
      const fr = [];
      if (rs.s && z1 === iz1) fr.push({ x: cx, z: z1, ry: 0, w: x1 - x0 });
      if (rs.n && z0 === iz0 && R() < 0.6) fr.push({ x: cx, z: z0, ry: Math.PI, w: x1 - x0 });
      if (rs.e && x1 === ix1) fr.push({ x: x1, z: cz, ry: Math.PI / 2, w: z1 - z0 });
      if (rs.w && x0 === ix0) fr.push({ x: x0, z: cz, ry: -Math.PI / 2, w: z1 - z0 });
      building(x0, x1, z0, z1, tp([5, 6, 7, 8, 9, 10]), fr, R);
    });
  }));
  // árboles en las banquetas y faroles
  for (const r of [-24, 24]) for (let v = -56; v <= 56; v += 9.5) {
    if (Math.abs(v - r) < 9 || Math.abs(v + r) < 9 || Math.abs(v) < 6) continue;
    for (const sd of [-1, 1]) { const x = r + sd * 4.9, z = TOWN_Z + v, k = Math.round(v / 9.5) % 2; if (k) { addStatic('oak', x, 0, z, r2(0.6, 0.75)); northCircle(x, z, 0.24); } else { townB.merge(PF_LAMP, x, 0, z, sd > 0 ? Math.PI : 0); solidCircle(x, z, 0.18); } }
  }
  // plaza: kiosco al centro, cuatro árboles y bancas mirando al kiosco
  const KZ = TOWN_Z;
  townB.cyl('#f4efe4', 0, 0.3, KZ, 5.2, 5.4, 0.6, 16).cyl('#e6d8bd', 0, 0.62, KZ, 5.0, 5.0, 0.04, 16);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.PI / 8; townB.cyl('#ffffff', Math.cos(a) * 4.4, 2.3, KZ + Math.sin(a) * 4.4, 0.12, 0.14, 3.4, 8); solidCircle(Math.cos(a) * 4.4, KZ + Math.sin(a) * 4.4, 0.18); }
  townB.cone('#ef6b5b', 0, 4.9, KZ, 6.2, 2.4, 8, Math.PI / 8).cone('#ffffff', 0, 6.35, KZ, 0.9, 0.9, 8, Math.PI / 8).sph('#ffd76a', 0, 6.9, KZ, 0.3);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; townB.box('#ffffff', Math.cos(a) * 4.45, 1.05, KZ + Math.sin(a) * 4.45, 0.12, 0.7, 3.2, -a); }
  solidCircle(0, KZ, 5.4);
  for (const q of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) { addStatic('oak', q[0], 0, KZ + q[1], r2(1.0, 1.15)); northCircle(q[0], KZ + q[1], 0.38); }
  for (const q of [[0, -9.6], [0, 9.6], [-9.6, 0], [9.6, 0]]) { townB.merge(PF_BENCH, q[0], 0, KZ + q[1], Math.atan2(-q[0], -q[1])); solidCircle(q[0], KZ + q[1], 0.7); }
  for (const q of [[-15, -6], [15, 6], [-6, 15], [6, -15]]) { townB.merge(PF_PLANTER, q[0], 0, KZ + q[1], 0); solidCircle(q[0], KZ + q[1], 0.8); }
  // mercado: puestos con toldos y huacales de fruta
  const MZ = TOWN.market.z, FR = ['#ef3b3b', '#ff9a1f', '#b3123a', '#7b3fa0', '#4b62d6', '#ff3b4f', '#3f9a46'];
  TOWN.stalls.forEach((sx, si) => {
    const aw = ['#ff6b6b', '#ffd23f', '#4fc3a1'][si];
    townB.box('#b98552', sx, 0.5, MZ, 5.4, 1.0, 1.8).box('#9a6540', sx, 1.02, MZ, 5.5, 0.06, 1.9);
    for (const ex of [-2.6, 2.6]) for (const ez of [-0.85, 0.85]) townB.cyl('#8a5a34', sx + ex, 1.6, MZ + ez, 0.06, 0.06, 3.2, 6);
    for (let k = 0; k < 6; k++) townB.box(k % 2 ? aw : '#ffffff', sx - 2.25 + k * 0.9, 3.2, MZ + 0.15, 0.9, 0.08, 2.4, 0, 0.18);
    for (let c = 0; c < 4; c++) { const cx = sx - 1.9 + c * 1.25, col = FR[(si * 4 + c) % FR.length]; townB.box('#c9965b', cx, 1.2, MZ + 0.35, 1.05, 0.3, 0.75);
      for (let f = 0; f < 6; f++) townB.sph(col, cx - 0.3 + (f % 3) * 0.3, 1.42, MZ + 0.2 + Math.floor(f / 3) * 0.3, col === '#3f9a46' ? 0.2 : 0.13, col === '#3f9a46' ? 0.15 : 0.13, col === '#3f9a46' ? 0.15 : 0.13, 8); }
    solidBox(sx - 2.75, sx + 2.75, MZ - 0.95, MZ + 0.95);
  });
  // posada: casa con letrero y jardín con hamaca
  building(-16.5, -3.5, TOWN_Z - 58, TOWN_Z - 46, 7, [{ x: -10, z: TOWN_Z - 46, ry: 0, w: 13 }], R);
  { const H = TOWN.hammock;
    for (const ex of [-2.2, 2.2]) { townB.cyl(TRUNK, H.x + ex, 1.25, H.z, 0.12, 0.15, 2.5, 8); solidCircle(H.x + ex, H.z, 0.2); }
    addStatic('oak', H.x - 4.6, 0, H.z - 2.5, 0.95); addStatic('oak', H.x + 4.4, 0, H.z - 2.8, 0.9); northCircle(H.x - 4.6, H.z - 2.5, 0.34); northCircle(H.x + 4.4, H.z - 2.8, 0.32);
    const hb = new Batch(); for (let k = 0; k <= 12; k++) { const u = k / 12 - 0.5, y = 0.42 * (1 - 4 * u * u); hb.box(k % 2 ? '#ff8a5c' : '#ffd23f', u * 4.2, -y, 0, 0.36, 0.06, 1.0); }
    TOWN.hammockMesh = hb.mesh(MAT_SOFT); TOWN.hammockMesh.position.set(H.x, 1.62, H.z); scene.add(TOWN.hammockMesh);
    for (let k = 0; k < 24; k++) addStatic('tuft', H.x + (k % 6) * 1.6 - 4, 0, H.z + 3 + Math.floor(k / 6) * 1.5, 1 + (k % 3) * 0.2, k);
  }
  // setos alrededor del pueblo, con portones al sur y al norte
  const hedgeT = (x0, z0, x1, z1) => { const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    townB.rbox(HEDGE, cx, 0.9, cz, horiz ? len : 1.6, 1.8, horiz ? 1.6 : len, 0.5); for (let d = 2; d < len - 1; d += 4) townB.ico(HEDGE2, lerp(x0, x1, d / len), 1.7, lerp(z0, z1, d / len), 0.95, 0.6, 0.9);
    solidBox(Math.min(x0, x1) - (horiz ? 0 : 0.8), Math.max(x0, x1) + (horiz ? 0 : 0.8), Math.min(z0, z1) - (horiz ? 0.8 : 0), Math.max(z0, z1) + (horiz ? 0.8 : 0)); };
  const HN = TOWN_Z - 63.2, HS = TOWN_Z + 63.2;
  hedgeT(-64, HN, -5, HN); hedgeT(5, HN, 64, HN); hedgeT(-64, HS, -5, HS); hedgeT(5, HS, 64, HS); hedgeT(-63.2, HN, -63.2, HS); hedgeT(63.2, HN, 63.2, HS);
  for (const z of [HN, HS]) for (const sx of [-1, 1]) townB.rbox(STONE, sx * 5.1, 1.4, z, 1.3, 2.8, 1.9, 0.2).sph('#ffd76a', sx * 5.1, 3.15, z, 0.42);
  // prado entre el pueblo y el bosque sin fin, con hileras de pinos a los lados
  for (let z = HN - 3; z > Z_FOREST2 + 1; z -= 3.6) for (const sx of [-1, 1]) { const x = sx * r2(62.5, 64), s = r2(1.0, 1.4); addStatic('pine', x, 0, z, s, R() * TAU, r2(0.86, 1)); northCircle(x, z, 0.45 * s); }
  for (let k = 0; k < 90; k++) addStatic('tuft', r2(-58, 58), 0, r2(Z_FOREST2 + 2, HN - 2), r2(0.9, 1.5), R() * 6);
}
northSign('Valle Alegre', 9.5, Z_TOWN_S - 3.2, 3.0);
northSign('Bosque sin fin ↑', -9.5, Z_TOWN_N - 2.5, 3.2);
// sendero del portón norte a la entrada del bosque sin fin
terrainRibbon([[0, Z_TOWN_N + 1], [0, Z_TOWN_N - 8], [forestTrailX(Z_FOREST2 + 6), Z_FOREST2 + 6], [forestTrailX(Z_FOREST2), Z_FOREST2]], 1.35, 0.06, 2.5);
// vecinos de Valle Alegre
{ const R = mulberry(777), tl = (i, j) => rectLoop(TBX[i][0] + 2, TBX[i][1] - 2, TBZ[j][0] + 2, TBZ[j][1] - 2);
  addNPC({ rng: R, name: 'Brisa', shape: 'gota', color: '#4fd1e0', mood: 'contento', loop: tl(0, 1), lines: ['¡Bienvenido a Valle Alegre! ¿De verdad cruzaste las montañas?', 'Desde el Pico Gelatina se ve todo el valle.', 'En la posada, al norte de la plaza, hay una hamaca para descansar.'] });
  addNPC({ rng: R, name: 'Tomate', shape: 'bola', color: '#ff5d5d', mood: 'asombrado', loop: tl(2, 1), lines: ['¡Tres picos! Malvavisco, Gelatina y Turrón. ¿Ya subiste a los tres?', '¡En cada cima hay una bandera de color!', '¡Guau! ¿Vienes desde la ciudad del sur?'] });
  addNPC({ rng: R, name: 'Miel', shape: 'huevo', color: '#ffd23f', mood: 'enamorado', loop: tl(0, 2), lines: ['El bosque del norte no tiene fin… y está lleno de fruta.', 'Hay naranjas, manzanas, granadas, uvas, arándanos, fresas y sandías.', 'Dicen que nadie ha llegado al final del bosque.'] });
  addNPC({ rng: R, name: 'Chabacano', shape: 'gatito', color: '#ffb347', mood: 'contento', loop: tl(2, 0), lines: ['Las granadas son mis favoritas. Búscalas en los árboles del bosque.', 'Las uvas cuelgan de unos techitos de madera.', '¡Miau! ¿Ya probaste la sandía?'] });
  addNPC({ rng: R, name: 'Nopal', shape: 'cubito', color: '#58b368', mood: 'enojado', loop: tl(0, 0), lines: ['¡Hmpf! Alguien se comió todas las fresas.', '¡Grr! Subir la montaña me cansa.', 'Las fresas crecen a ras del suelo, por si no lo sabías.'] });
  addNPC({ rng: R, name: 'Brote', shape: 'hongo', color: '#ff8a5c', mood: 'contento', loop: tl(2, 2), lines: ['¡El kiosco de la plaza es mi lugar favorito!', 'Aquí no pasan autos: puedes caminar por donde quieras.'] });
  addNPC({ rng: R, name: 'Copo', shape: 'fantasma', color: '#dff3ff', mood: 'dormido', home: { x: TOWN.hammock.x - 3.6, z: TOWN.hammock.z + 2.8, ry: 0.6 }, lines: ['Zzz… la hamaca es la más cómoda del valle…', 'Zzz… cinco minutitos…'] });
  addNPC({ rng: R, name: 'Lila', shape: 'estrella', color: '#c58bff', mood: 'contento', home: { x: TOWN.stalls[1] + 1.2, z: TOWN.market.z - 2.3, ry: 0 }, lines: ['¡Fruta fresca del bosque sin fin! Toma la que quieras.', 'Todo lo del mercado viene del bosque, al norte del pueblo.'] });
}

// ───────────────────────── el bosque sin fin ─────────────────────────
// Casillas de 26 m que se generan alrededor de Tamachin con una semilla según su posición: al volver, todo está igual.
// Se dibujan con un InstancedMesh por tipo para todo el bosque; cada casilla ocupa un tramo fijo (su "lugar") de cada uno.
function forestTrailX(z) { const d = Z_FOREST2 - z; return 16 * Math.sin(d / 48) + 8 * Math.sin(d / 19 + 1); }
const FRUITS = {
  naranja: { name: 'naranjas', mk: 'fruit', color: '#ff9a1f', s: 0.18, gain: 0.14, per: 1, line: '¡Mmm! Una naranja jugosa.' },
  manzana: { name: 'manzanas', mk: 'fruit', color: '#ef3b3b', s: 0.17, gain: 0.14, per: 1, line: '¡Ñam! Una manzana crujiente.' },
  uva: { name: 'uvas', mk: 'grapes', s: 1, gain: 0.15, per: 1, line: '¡Uvas dulcitas!' },
  arandano: { name: 'arándanos', mk: 'fruit', color: '#4b62d6', s: 0.075, gain: 0.045, per: 3, line: '¡Arándanos!' },
  sandia: { name: 'sandías', mk: 'melon', s: 1, gain: 0.35, per: 1, big: true, line: '¡Una sandía enterita! ¡Ñam, ñam, ñam!' },
  fresa: { name: 'fresas', mk: 'straw', s: 1, gain: 0.06, per: 2, line: '¡Fresas! ¡Qué dulces!' },
  granada: { name: 'granadas', mk: 'fruit', color: '#b3123a', s: 0.18, gain: 0.16, per: 1, line: '¡Qué rica granada!' },
};
const MELON_GEO = (() => {
  const g = new THREE.SphereGeometry(1, 12, 8).toNonIndexed(), P = g.attributes.position, c = new Float32Array(P.count * 3), A = new THREE.Color('#3f8f44'), B = new THREE.Color('#86d06e');
  for (let i = 0; i < P.count; i += 3) { const ax = P.getX(i) + P.getX(i + 1) + P.getX(i + 2), az = P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2), col = Math.floor((Math.atan2(az, ax) + Math.PI) / TAU * 12) % 2 ? A : B;
    for (let q = 0; q < 3; q++) c.set([col.r, col.g, col.b], (i + q) * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.rotateZ(Math.PI / 2); g.scale(0.44, 0.3, 0.32); g.translate(0, 0.27, 0); return g;
})();
const FK = {                                                       // tipo: geometría, cupo por casilla, sombra, se agacha, color por vértice
  pine: { geo: TREE_GEO[0], cap: 16, shadow: true, duck: true },
  oak: { geo: TREE_GEO[1], cap: 3, shadow: true, duck: true },
  ftree: { geo: new Batch().cyl(TRUNK, 0, 1.0, 0, 0.17, 0.26, 2.0, 7).ico('#5ec46a', 0, 3.0, 0, 1.55, 1.3, 1.55).ico('#52b860', 0.85, 2.65, 0.3, 0.9).ico('#69cf76', -0.8, 2.8, -0.3, 0.9).geometry(), cap: 3, shadow: true, duck: true },
  arbor: { geo: new Batch().cyl(WOOD, -1.25, 1.1, 0, 0.08, 0.1, 2.2, 7).cyl(WOOD, 1.25, 1.1, 0, 0.08, 0.1, 2.2, 7).box(WOOD, 0, 2.18, 0, 2.9, 0.12, 0.14).box(WOOD, 0, 2.18, -0.6, 2.9, 0.1, 0.1).box(WOOD, 0, 2.18, 0.6, 2.9, 0.1, 0.1)
    .ico('#4fae5a', -0.7, 2.36, 0, 0.85, 0.3, 0.8).ico('#5cc06c', 0.55, 2.38, 0.1, 0.9, 0.3, 0.75).ico('#47a352', 0, 2.32, -0.3, 0.7, 0.25, 0.6).geometry(), cap: 1, shadow: true, duck: true },
  bush: { geo: SKIND.bush.geo, cap: 5 },
  patch: { geo: new Batch().ico('#58b368', 0, 0.12, 0, 0.55, 0.16, 0.5).ico('#4fa95c', 0.45, 0.1, 0.2, 0.35, 0.12, 0.3).ico('#62bd6f', -0.4, 0.1, -0.15, 0.35, 0.12, 0.32).geometry(), cap: 2 },
  rock: { geo: SKIND.rock.geo, cap: 1 },
  shroom: { geo: new Batch().cyl('#fff1d6', 0, 0.16, 0, 0.07, 0.1, 0.32, 8).sph('#ef4b4b', 0, 0.33, 0, 0.24, 0.15, 0.24).sph('#ffffff', 0.1, 0.43, 0.08, 0.045).sph('#ffffff', -0.12, 0.4, 0.02, 0.04).sph('#ffffff', 0, 0.45, -0.1, 0.04).geometry(), cap: 2 },
  tuft: { geo: SKIND.tuft.geo, cap: 12 },
  fruit: { geo: new THREE.SphereGeometry(1, 6, 4), cap: 26, plain: true },
  grapes: { geo: (() => { const b = new Batch().cyl('#6b4a35', 0, 0.02, 0, 0.014, 0.014, 0.12, 4), C = ['#7b3fa0', '#8e4fb5', '#6a338c']; let k = 0;
    for (let row = 0; row < 4; row++) { const n = 4 - row, r = 0.05 * (n - 1); for (let i = 0; i < n; i++) { const a = i / n * TAU + row; b.ico(C[k++ % 3], Math.cos(a) * r, -0.07 - row * 0.075, Math.sin(a) * r, 0.055, 0.055, 0.055, 0); } } return b.geometry(); })(), cap: 4 },
  straw: { geo: new Batch().add(gCone(8), '#ff3b4f', 0, 0.075, 0, 0.065, 0.13, 0.065, Math.PI, 0, 0).cone('#58b368', 0, 0.15, 0, 0.075, 0.035, 5).sph('#fff3b0', 0.03, 0.09, 0.05, 0.009).sph('#fff3b0', -0.03, 0.07, 0.05, 0.009).geometry(), cap: 7 },
  melon: { geo: MELON_GEO, cap: 2 },
};
const CS = 26, WIN = { w: 2, n: 2, s: 1 }, SLOTS = (2 * WIN.w + 1) * (WIN.n + WIN.s + 1);
const _z0 = new THREE.Matrix4().makeScale(0, 0, 0);
for (const k in FK) {
  const d = FK[k]; d.mesh = null;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: !d.plain }); if (d.duck) duckify(mat);
  d.mesh = new THREE.InstancedMesh(d.geo, mat, SLOTS * d.cap);
  for (let i = 0; i < SLOTS * d.cap; i++) { d.mesh.setMatrixAt(i, _z0); d.mesh.setColorAt(i, _ic.setRGB(1, 1, 1)); }
  d.mesh.frustumCulled = false; d.mesh.castShadow = !!d.shadow; d.mesh.receiveShadow = true; if (d.duck) d.mesh.customDepthMaterial = duckDepth; d.mesh.visible = false; scene.add(d.mesh);
}
const forest = { live: new Map(), free: Array.from({ length: SLOTS }, (_, i) => i), pci: null, pcj: null, eaten: new Map() };
function genChunk(ci, cj) {
  const R = mulberry(((ci * 73856093) ^ (cj * 19349663) ^ 0x2545f491) | 0), r2 = (a, b) => a + (b - a) * R();
  const x0 = ci * CS, zS = Z_FOREST2 - cj * CS, it = {}, used = [], plants = [], circles = [];
  for (const k in FK) it[k] = [];
  const add = (k, x, y, z, s, ry, tint) => { if (it[k].length >= FK[k].cap) return -1; it[k].push({ x, y, z, s, ry, tint: tint || 1 }); return it[k].length - 1; };
  const free = (x, z, r) => Math.abs(x - forestTrailX(z)) > 2.2 + r && !(z > Z_FOREST2 - 5 && Math.abs(x) > 60) && used.every((u) => Math.hypot(u.x - x, u.z - z) > u.r + r);
  const spot = (r) => { for (let t = 0; t < 12; t++) { const x = x0 + r2(1.2, CS - 1.2), z = zS - r2(1.2, CS - 1.2); if (free(x, z, r)) { used.push({ x, z, r }); return { x, z }; } } return null; };
  const plant = (kind, x, z, range) => { const p = { kind, x, z, range, fruits: [], key: ci + ',' + cj + ',' + plants.length }; plants.push(p); return p; };
  const fruit = (p, mk, x, y, z, s, color) => { const i = add(mk, x, y, z, s, R() * TAU); if (i >= 0) { it[mk][i].color = color; p.fruits.push({ mk, i, x, y, z, s, color, k: 1 }); } };
  if (cj === 0) for (let x = x0 + 1.45; x < x0 + CS; x += 2.9) if (Math.abs(x) > 64) {       // borde sur, a los lados del pueblo: muro de pinos sin huecos
    const z = Z_FOREST2 - 2.2 - R() * 1.0, s = r2(1.1, 1.5); if (add('pine', x, 0, z, s, R() * TAU, r2(0.85, 1)) >= 0) { circles.push({ x, z, r: 0.95 }); used.push({ x, z, r: 1.4 }); }
  }
  const nF = 2 + (R() < 0.45 ? 1 : 0);
  for (let n = 0; n < nF; n++) {                                   // árboles frutales: naranjas, manzanas o granadas al frente de la copa
    const q = spot(2.7); if (!q) continue; const kind = ['naranja', 'manzana', 'granada'][Math.floor(R() * 3)], F = FRUITS[kind], s = kind === 'granada' ? r2(0.82, 0.95) : r2(0.95, 1.15);
    add('ftree', q.x, 0, q.z, s, R() * TAU, r2(0.92, 1.05)); circles.push({ x: q.x, z: q.z, r: 0.3 * s }); const p = plant(kind, q.x, q.z, 3.1);
    for (let f = 0; f < 6; f++) { const a = Math.PI / 2 + (f / 5 - 0.5) * 2.7 + r2(-0.12, 0.12), el = r2(-0.4, 0.55); fruit(p, 'fruit', q.x + Math.cos(a) * Math.cos(el) * 1.52 * s, (3.0 + Math.sin(el) * 1.25) * s, q.z + Math.sin(a) * Math.cos(el) * 1.52 * s, F.s * s, F.color); }
  }
  if (R() < 0.27) { const q = spot(2.4); if (q) {                  // parra de uvas
    add('arbor', q.x, 0, q.z, 1, 0); circles.push({ x: q.x - 1.25, z: q.z, r: 0.15 }, { x: q.x + 1.25, z: q.z, r: 0.15 }); const p = plant('uva', q.x, q.z, 2.7);
    for (let f = 0; f < 4; f++) fruit(p, 'grapes', q.x - 0.95 + f * 0.63, 2.1, q.z + 0.42 - (f % 2) * 0.2, 1, null);
  } }
  for (let n = 0, nb = R() < 0.7 ? 1 : 0; n < nb; n++) {           // arbustos de arándanos
    const q = spot(1.3); if (!q) continue; const s = r2(0.95, 1.15); add('bush', q.x, 0, q.z, s, R() * TAU, 0.82); circles.push({ x: q.x, z: q.z, r: 0.6 * s }); const p = plant('arandano', q.x, q.z, 2.3);
    for (let f = 0; f < 8; f++) { const a = Math.PI / 2 + (f / 7 - 0.5) * 3.2 + r2(-0.15, 0.15), el = r2(0.1, 0.9); fruit(p, 'fruit', q.x + Math.cos(a) * Math.cos(el) * 0.78 * s, (0.5 + Math.sin(el) * 0.56) * s, q.z + Math.sin(a) * Math.cos(el) * 0.74 * s, 0.085 * s, FRUITS.arandano.color); }
  }
  for (let n = 0, ns = R() < 0.6 ? 1 : 0; n < ns; n++) {           // fresas a ras del suelo
    const q = spot(1.0); if (!q) continue; add('patch', q.x, 0, q.z, r2(0.9, 1.1), R() * TAU); const p = plant('fresa', q.x, q.z, 2.1);
    for (let f = 0; f < 7; f++) { const a = Math.PI / 2 + (f / 6 - 0.5) * 3.6, rr2 = r2(0.42, 0.68); fruit(p, 'straw', q.x + Math.cos(a) * rr2, 0.0, q.z + Math.sin(a) * rr2 * 0.9, r2(0.95, 1.15), null); }
  }
  if (R() < 0.24) { const q = spot(1.3); if (q) {                  // sandías con su guía
    add('patch', q.x, 0, q.z, 1.25, R() * TAU, 0.86); const p = plant('sandia', q.x, q.z, 2.4);
    fruit(p, 'melon', q.x - 0.55, 0, q.z + 0.55, r2(0.95, 1.1), null); fruit(p, 'melon', q.x + 0.6, 0, q.z + 0.35, r2(0.85, 1.0), null); circles.push({ x: q.x, z: q.z + 0.45, r: 0.75 });
  } }
  for (let n = 0; n < 7; n++) { const q = spot(1.6); if (!q) continue; const s = r2(0.9, 1.5); if (add('pine', q.x, 0, q.z, s, R() * TAU, r2(0.84, 1.04)) >= 0) circles.push({ x: q.x, z: q.z, r: 0.36 * s }); }
  for (let n = 0; n < 3; n++) { const q = spot(2.0); if (!q) continue; const s = r2(0.9, 1.3); if (add('oak', q.x, 0, q.z, s, R() * TAU, r2(0.86, 1.04)) >= 0) circles.push({ x: q.x, z: q.z, r: 0.34 * s }); }
  for (let n = 0; n < 3; n++) { const q = spot(1.0); if (!q) continue; const s = r2(0.8, 1.4); if (add('bush', q.x, 0, q.z, s, R() * TAU) >= 0) circles.push({ x: q.x, z: q.z, r: 0.6 * s }); }
  for (let n = 0; n < 1; n++) { const q = spot(0.9); if (!q) continue; const s = r2(0.5, 1.1); add('rock', q.x, -0.1, q.z, s, R() * TAU); if (s > 0.75) circles.push({ x: q.x, z: q.z, r: 0.7 * s }); }
  for (let n = 0; n < 2; n++) { const q = spot(0.4); if (q) add('shroom', q.x, 0, q.z, r2(0.7, 1.3), R() * TAU); }
  for (let n = 0; n < 12; n++) { const x = x0 + r2(0, CS), z = zS - r2(0, CS); if (Math.abs(x - forestTrailX(z)) > 1.8) add('tuft', x, 0, z, r2(0.9, 1.6), R() * TAU); }
  for (const p of plants) p.fruits.forEach((f, j) => { const back = forest.eaten.get(p.key + ',' + j); if (back && back > clock) f.k = 0; });   // lo que ya se comió sigue comido
  return { ci, cj, cx: x0 + CS / 2, cz: zS - CS / 2, it, plants, circles, slot: -1 };
}
function writeChunk(c, clear) {
  for (const k in FK) {
    const d = FK[k], base = c.slot * d.cap, list = clear ? [] : c.it[k];
    for (let i = 0; i < d.cap; i++) {
      const q = list[i];
      if (!q) { d.mesh.setMatrixAt(base + i, _z0); continue; }
      _im.compose(_ip.set(q.x, q.y, q.z), _iq.setFromEuler(_ie.set(0, q.ry, 0)), _is.set(q.s, q.s, q.s)); d.mesh.setMatrixAt(base + i, _im);
      d.mesh.setColorAt(base + i, q.color ? _ic.set(q.color) : _ic.setRGB(q.tint, q.tint, q.tint * 0.96));
    }
    d.mesh.instanceMatrix.needsUpdate = true; d.mesh.instanceColor.needsUpdate = true;
  }
  if (!clear) for (const p of c.plants) for (const f of p.fruits) if (f.k < 1) setFruit(c, f, 0);
}
function setFruit(c, f, k) {
  f.k = k; const d = FK[f.mk], s = f.s * Math.max(0.0001, k);
  d.mesh.setMatrixAt(c.slot * d.cap + f.i, k > 0 ? _im.compose(_ip.set(f.x, f.y, f.z), _iq.setFromEuler(_ie.set(0, c.it[f.mk][f.i].ry, 0)), _is.set(s, s, s)) : _z0);
  d.mesh.instanceMatrix.needsUpdate = true;
}
function updateForest() {
  const P = player.pos, pci = Math.floor(P.x / CS), pcj = Math.floor((Z_FOREST2 - P.z) / CS), near = P.z < Z_FOREST2 + 80;
  if (pci === forest.pci && pcj === forest.pcj && near === forest.near) return;
  forest.pci = pci; forest.pcj = pcj; forest.near = near;
  const want = new Set();
  if (near) for (let i = -WIN.w; i <= WIN.w; i++) for (let j = -WIN.s; j <= WIN.n; j++) if (pcj + j >= 0) want.add((pci + i) + ',' + (pcj + j));
  for (const [k, c] of forest.live) if (!want.has(k)) { writeChunk(c, true); forest.free.push(c.slot); forest.live.delete(k); }
  for (const k of want) if (!forest.live.has(k)) { const [ci, cj] = k.split(',').map(Number), c = genChunk(ci, cj); c.slot = forest.free.pop(); writeChunk(c); forest.live.set(k, c); }
  for (const k in FK) FK[k].mesh.visible = forest.live.size > 0;      // fuera del bosque no cuesta nada
}
function forestCollide(pos, r) {
  if (pos.z > Z_FOREST2 + 4) return;
  for (const c of forest.live.values()) if (Math.abs(c.cx - pos.x) < CS && Math.abs(c.cz - pos.z) < CS) for (const q of c.circles) pushOutCircle(pos, r, q.x, q.z, q.r);
}
// la planta con fruta madura más cercana a (x, z), o null
function forestPlantNear(x, z) {
  if (z > Z_FOREST2 + 4) return null; let best = null, bd = Infinity;
  for (const c of forest.live.values()) if (Math.abs(c.cx - x) < CS && Math.abs(c.cz - z) < CS) for (const p of c.plants) { const d = Math.hypot(p.x - x, p.z - z); if (d < p.range && d < bd && p.fruits.some((f) => f.k >= 1)) { bd = d; best = p; p.chunk = c; } }
  return best;
}
let regrowT = 0;
function regrowForest(dt) {
  if ((regrowT -= dt) > 0) return; regrowT = 0.5;
  for (const c of forest.live.values()) for (const p of c.plants) p.fruits.forEach((f, j) => { if (f.k < 1) { const back = forest.eaten.get(p.key + ',' + j); if (!back || back <= clock) { forest.eaten.delete(p.key + ',' + j); setFruit(c, f, 1); } } });
}
// sendero del bosque sin fin: una cinta que se rehace cuando Tamachin avanza (la textura sigue a z, no se mueve)
const ftrail = { mesh: null, z: 1e9 };
function updateForestTrail() {
  const pz = player.pos.z; if (pz > Z_FOREST2 + 90) { if (ftrail.mesh) ftrail.mesh.visible = false; return; }
  if (ftrail.mesh && Math.abs(pz - ftrail.z) < 24) { ftrail.mesh.visible = true; return; }
  ftrail.z = pz; const z0 = Math.min(Z_FOREST2, pz + 60), z1 = pz - 150, n = 90, pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const z = lerp(z0, z1, i / n), x = forestTrailX(z), dx = (forestTrailX(z - 0.5) - forestTrailX(z + 0.5)), l = Math.hypot(dx, 1);
    for (const sd of [1, -1]) { pos.push(x + sd * 1.4 / l, 0.04, z + sd * 1.4 * dx / l); uv.push(sd > 0 ? 0 : 1, -z * 0.4); }
    if (i) { const q = i * 2; idx.push(q - 2, q - 1, q, q - 1, q + 1, q); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (ftrail.mesh) { ftrail.mesh.geometry.dispose(); ftrail.mesh.geometry = g; } else { ftrail.mesh = new THREE.Mesh(g, pathMat); ftrail.mesh.receiveShadow = true; scene.add(ftrail.mesh); }
  ftrail.mesh.visible = true;
}
// desde las cimas se ve el bosque a lo lejos: copas sueltas, sin detalle (se esconden al bajar o al entrar al bosque)
const farForest = (() => {
  const R = mulberry(606), b = new Batch(), C = ['#3f9a52', '#46a65a', '#3a8f4c', '#4fae5a'];
  for (let z = Z_FOREST2 - 30; z > Z_FOREST2 - 1300; z -= 34) for (let x = -900; x <= 900; x += 34) {
    const px = x + (R() - 0.5) * 20, pz = z + (R() - 0.5) * 20; if (Math.abs(px - forestTrailX(pz)) < 6) continue;
    b.ico(C[Math.floor(R() * 4)], px, 3 + R() * 2.5, pz, 12 + R() * 6, 4.5 + R() * 3, 12 + R() * 6, 0);
  }
  const m = b.mesh(MAT_SCENERY, false); m.visible = false; scene.add(m); return m;
})();

buildStatic(); scene.add(northB.mesh(), townB.mesh());
camera.far = 1700; camera.updateProjectionMatrix();                 // desde las cimas se ve el valle entero

// ───────────────────────── cada cuadro ─────────────────────────
const northSeen = {};
function updateNorth(dt) {
  const P = player.pos;
  updateForest(); regrowForest(dt); updateForestTrail();
  farForest.visible = P.y > 60 && P.z > Z_FOREST2 + 150;
  // niebla según la altura: desde arriba se ve lejos
  const alt = Math.max(0, P.y);
  scene.fog.far = damp(scene.fog.far, 300 + alt * 1.6, 1.5, dt); scene.fog.near = damp(scene.fog.near, 60 + alt * 0.8, 1.5, dt);
  if (TOWN.hammockMesh) TOWN.hammockMesh.rotation.x = Math.sin(clock * 1.5) * (player.sleepSpot === 'hamaca' ? 0.1 : 0.03);
  // cimas y lugares nuevos
  for (const p of PEAKS) if (!p.reached && Math.hypot(P.x - p.x, P.z - p.z) < 24 && P.y > p.y - 30) reachSummit(p);
  const zone = P.z < Z_FOREST2 ? 'bosque' : P.z < Z_TOWN_S + 2 ? 'pueblo' : P.z < NORTH_Z ? 'montañas' : null;
  if (zone && !northSeen[zone]) { northSeen[zone] = true; discover(zone); }
}

// ───────────────────────── Tamachin (jugador) ─────────────────────────
const SAVE_KEY = 'tamachin.v1';
const player = { T: makeTamachin({ shape: 'bola', color: '#ffc93c', mood: 'contento', scale: 1.3 }), vx: 0, vz: 0, vy: 0, heading: 0, onGround: true, state: 'normal', r: 0.62,
  baseMood: 'contento', tempMood: null, tempT: 0, onTempEnd: null, inv: 0, idleT: 0, speedN: 0, spin: 0, flySpin: 0, flatT: 0, sleepT: 0, inWater: false, inHouse: false, lastTrick: null, moved: 0,
  needLow: null, needMood: null, busy: null, carry: null };
player.pos = player.T.pos; player.pos.set(0, 0, 3.5); player.bubblePos = player.T.bubblePos;
const ui = { closeup: false, zoom: 1, zoomTarget: 1, zoomIdx: 0 };
const ZOOMS = [1, 0.62, 1.42], ZOOM_LABEL = ['Acercar', 'Alejar', 'Vista normal'];
const ptr = { x: 0, y: 0, active: false, moveT: -9, a: 0, hasA: false, down: false, sx: 0, sy: 0, st: 0, id: null };
const pScreen = { x: 0, y: 0, r: 40 };
const joy = { x: 0, y: 0, id: null };
const keys = {};
let VW = 1, VH = 1, curInteract = null;

// El ánimo que se ve: uno pasajero (truco, susto) > el de una necesidad baja > el que se eligió en el panel.
function applyMood() { player.T.setMood(player.tempMood || player.needMood || player.baseMood); }
function setTemp(mood, dur, onEnd) { player.tempMood = mood; player.tempT = dur; player.onTempEnd = onEnd || null; applyMood(); }
function clearTemp() { player.tempMood = null; player.tempT = 0; player.onTempEnd = null; applyMood(); }

// ───────────────────────── necesidades: panza, energía, diversión ─────────────────────────
// Bajan solas (más rápido al correr). Si una queda baja, manda en el ánimo hasta que se recupera. Nunca pasa nada peor.
const NEEDS = {
  panza: { label: 'Panza', drain: 1 / 900, mood: 'enojado', fill: 'el refri de casa, las bayas del bosque y la fruta del norte',
    lines: ['¡Mi panza hace ruidos!', 'Tengo hambre…', 'Se me antoja algo rico…'], tip: 'Tamachin tiene hambre: abre el refri de casa o come bayas en el bosque.' },
  energia: { label: 'Energía', drain: 1 / 1200, mood: 'dormido', fill: 'una siesta en su cama o en la hamaca de Valle Alegre, y la fogata del bosque',
    lines: ['¡Aaah… qué sueño!', 'Se me cierran los ojitos…', 'Una siesta me caería bien…'], tip: 'Tamachin tiene sueño: llévalo a dormir una siesta en su cama.' },
  diversion: { label: 'Diversión', drain: 1 / 600, mood: 'triste', fill: 'trucos, la tele, la fuente, platicar con los vecinos y acariciar animales',
    lines: ['Me aburro…', '¿Jugamos a algo?', 'Hazme un mimo…'], tip: 'Tamachin se aburre: hazle trucos, platica con los vecinos o mira la tele.' },
};
const NEED_LOW = 0.22, NEED_OK = 0.34;
const needs = { panza: 0.8, energia: 0.85, diversion: 0.75 };
const needGate = {}, needPulse = {};
// sube una necesidad; con `key` solo una vez cada `cd` segundos (para que repetir lo mismo no la llene)
function gain(k, amt, key, cd) {
  if (key) { if ((needGate[key] || 0) > clock) return false; needGate[key] = clock + (cd || 10); }
  const before = needs[k]; needs[k] = clamp(needs[k] + amt, 0, 1); if (needs[k] > before + 0.004) needPulse[k] = clock + 0.7; return true;
}
let needSaveT = 0, lowSayT = 0;
function updateNeeds(dt) {
  const P = player;
  if (P.state === 'sleep') gain('energia', dt / 9);
  else {
    const act = P.speedN > 1.3 ? 1.35 : P.speedN > 0.1 ? 1.1 : 1;   // cruzar las montañas corriendo (unos 5 min) gasta menos de la mitad
    needs.panza = Math.max(0, needs.panza - NEEDS.panza.drain * act * dt);
    needs.energia = Math.max(0, needs.energia - NEEDS.energia.drain * act * dt);
    needs.diversion = Math.max(0, needs.diversion - NEEDS.diversion.drain * dt);
  }
  if (house.tvOn && P.inHouse && P.state === 'normal') gain('diversion', dt * 0.03);
  let worst = null, wv = 1;                                         // la más baja manda, con histéresis para no parpadear
  if (clock > 4) for (const k in NEEDS) { const v = needs[k]; if (v < (P.needLow === k ? NEED_OK : NEED_LOW) && v < wv) { worst = k; wv = v; } }   // tras el saludo
  if (worst !== P.needLow) {
    const was = P.needLow; P.needLow = worst; P.needMood = worst ? NEEDS[worst].mood : null; applyMood();
    if (worst) { if (P.state === 'normal') say(P, choose(NEEDS[worst].lines), 2.6); toast(NEEDS[worst].tip, 5); SFX.low(); lowSayT = 30; }
    else if (was && P.state === 'normal') say(P, '¡Ahora sí, como nuevo!', 2);
  }
  if (worst && (lowSayT -= dt) <= 0) { if (P.state === 'normal') say(P, choose(NEEDS[worst].lines), 2.4); lowSayT = rand(24, 36); }
  if ((needSaveT += dt) > 8) { needSaveT = 0; save(); }
}

// ───────────────────────── encargos ─────────────────────────
// 0: sin descubrir, 1: en curso, 2: hecho. Salen de lo que ya decían los vecinos y la carta del buzón.
const QUESTS = {
  conejo: { title: 'Un amigo para Tofu', hint: 'Acaricia un conejo en el bosque y llévalo caminando hasta Tofu, en la manzana al sur de tu casa.', done: 'Tofu y su conejo pasean juntos.' },
  peces: { title: 'Peces saltarines', hint: 'Quédate quieto en la orilla del río del bosque hasta ver saltar un pez de cerca.', done: 'Viste un pez saltarín de cerca.' },
  fuente: { title: 'Un paseo con Lulú', hint: 'Lulú camina contigo: llévala hasta la fuente del parque, al norte de tu casa.', done: 'Lulú se quedó admirando la fuente.' },
  gelatina: { title: 'Gelatina para Nube', hint: 'Saca una gelatina del refri y llévasela a Nube, en la manzana al este de tu casa.', done: 'Nube probó su gelatina y ya no tiene sueño.' },
  cumbres: { title: 'Tres cumbres', hint: 'Sube a los picos Malvavisco, Gelatina y Turrón, al norte del bosque. Cada cima tiene una bandera.', done: 'Subiste a las tres cimas.', progress: () => summits.length + ' de 3' },
  frutas: { title: 'Las siete frutas', hint: 'Prueba naranjas, manzanas, uvas, arándanos, sandías, fresas y granadas del bosque sin fin, al norte de Valle Alegre.', done: 'Probaste las siete frutas del bosque sin fin.', progress: () => fruitsTasted.length + ' de 7' },
};
function reachSummit(p) {
  p.reached = true; if (summits.includes(p.name)) return;
  summits.push(p.name); const P = player; say(P, '¡Llegué a la cima del ' + p.name + '!', 3); P.T.doTrick('dance'); burst('star', P.pos.x, P.pos.y + 2, P.pos.z, 8); gain('diversion', 0.25);
  if (!quests.cumbres) startQuest('cumbres');
  if (summits.length >= 3) finishQuest('cumbres'); else { toast('Cima del ' + p.name + ': ' + summits.length + ' de 3.', 3.5); SFX.yay(); renderDiary(); save(); }
}
function tasteFruit(kind) {
  if (fruitsTasted.includes(kind)) return; fruitsTasted.push(kind);
  if (!quests.frutas) startQuest('frutas');
  if (fruitsTasted.length >= 7) finishQuest('frutas'); else { toast('Frutas del bosque probadas: ' + fruitsTasted.length + ' de 7.', 3); renderDiary(); save(); }
}
function discover(zone) {
  const T = { montañas: 'Las montañas: tres picos de 400 m. Los postes rojos marcan el sendero al Pico Gelatina.', pueblo: '¡Llegaste a Valle Alegre! Hay mercado, una posada con hamaca y vecinos nuevos.',
    bosque: 'El bosque sin fin: mientras más caminas, más bosque hay. Está lleno de fruta.' };
  toast(T[zone], 5); gain('diversion', 0.12);
}
const quests = { conejo: 0, peces: 0, fuente: 0, gelatina: 0, cumbres: 0, frutas: 0 };
const summits = [], fruitsTasted = [];          // nombres de las cimas alcanzadas y frutas probadas (claves de FRUITS)
function startQuest(id) { if (quests[id]) return; quests[id] = 1; toast('Nuevo encargo: ' + QUESTS[id].title + '. Está en el diario.', 4.5); SFX.pop(); renderDiary(); save(); }
function finishQuest(id) {
  quests[id] = 2; toast('¡Encargo cumplido! ' + QUESTS[id].title, 4.5); SFX.yay(); gain('diversion', 0.3);
  burst('star', player.pos.x, player.pos.y + 1.8, player.pos.z, 6); renderDiary(); save();
}

function save() {
  const P = player, at = P.state === 'sleep' ? (BEDS[P.sleepSpot] || BEDS.cama).exit : P.pos;   // dormido: donde se levanta, no dentro de la cama
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ shape: P.T.shape, color: P.T.color, mood: P.baseMood,
      needs: { panza: +needs.panza.toFixed(3), energia: +needs.energia.toFixed(3), diversion: +needs.diversion.toFixed(3) }, quests, summits, fruits: fruitsTasted,
      x: +at.x.toFixed(2), z: +at.z.toFixed(2), heading: +P.heading.toFixed(2) }));
  } catch (e) { /* sin almacenamiento */ }
}

const TRICKS = ['hop', 'spin', 'flip', 'dance', 'wave', 'giggle', 'wink'];
const TRICK_SAY = { hop: '¡Yupi!', spin: '¡Wiii!', flip: '¡Mira esto!', dance: '¡A bailar!', wave: '¡Hola, hola!', giggle: '¡Ji, ji, ji!', wink: '¡Guiño!' };
function playerTrick() {
  const P = player, T = P.T; if (P.state !== 'normal') return;
  if (T.mood === 'mareado') { say(P, '¡Uy… no me empujes!', 1.6); T.poke(3); return; }
  let t; do { t = choose(TRICKS); } while (t === P.lastTrick); P.lastTrick = t; let line = TRICK_SAY[t];
  if (T.mood === 'dormido') { t = 'giggle'; line = 'Mmm… cinco minutos más…'; }
  else if (T.mood === 'triste') { t = choose(['giggle', 'wave']); line = '…gracias por el mimo.'; }
  else if (T.mood === 'enojado') { t = choose(['spin', 'hop']); line = '¡Hmpf! ¡No me piques!'; }
  T.doTrick(t); T.poke(t === 'giggle' ? 2 : 4); say(P, line, 1.8); SFX.pop(); gain('diversion', 0.035, 'truco', 1.5);
  burst(T.mood === 'triste' ? 'heart' : 'spark', P.pos.x, P.pos.y + 1.7, P.pos.z, 4);
}
function makeDizzy(dur) {
  const P = player; P.spin = 0;
  setTemp('mareado', dur || 5.5, () => { say(P, '¡Uf! Ya pasó.', 1.8); P.T.doTrick('shake'); });
  say(P, choose(['¡Aaay, todo da vueltas!', '¡Uy, uy, uy… me mareé!', '¡Para, para, que me mareo!']), 2.4); SFX.dizzy();
}
function jump() {
  const P = player;
  if (P.state === 'sleep') { wake(); return; }
  if (P.state !== 'normal' || ui.closeup) { if (ui.closeup) playerTrick(); return; }
  if (P.onGround) { P.vy = P.inWater ? 6 : 7.8; P.onGround = false; P.T.poke(3.2); SFX.jump(); }
}
function doAction() {
  const P = player;
  if (P.state === 'sleep') { wake(); return; }
  if (P.state !== 'normal') return;
  if (!ui.closeup && curInteract) curInteract.act(); else playerTrick();
}
function knock(c) {
  const P = player, L = c.L, k = Math.max(6, c.v * 0.9);
  P.state = 'fly'; P.vy = 7.6; P.onGround = false; P.flySpin = 0; clearTemp();
  if (L.axis === 'x') { P.vx = L.dir * k; P.vz = (P.pos.z >= c.z ? 1 : -1) * 3; } else { P.vz = L.dir * k; P.vx = (P.pos.x >= c.x ? 1 : -1) * 3; }
  c.pause = 2.4; c.v = 0; SFX.hit(); burst('star', P.pos.x, 1.4, P.pos.z, 7); say(c, '¡Ay, perdón!', 2);
}
function land() {
  const P = player; P.state = 'flat'; P.flatT = 1.5; P.T.flat = true; P.vx = P.vz = 0;
  burst('star', P.pos.x, 0.8, P.pos.z, 6); say(P, '¡Auch!', 1.4);
  toast('¡Te atropelló un auto! Cruza por el paso de cebra cuando los autos tengan rojo.', 4.5);
}
function getUp() { const P = player; P.state = 'normal'; P.T.flat = false; P.T.poke(5); P.inv = 2.5; P.flySpin = 0; SFX.pop(); makeDizzy(3.6); }
// dormir: en su cama o en la hamaca de Valle Alegre; mientras duerme recupera energía (updateNeeds)
const BEDS = {
  cama: { x: -4.4, y: 1.46, z: -9.85, exit: { x: -2.7, z: -10.4 }, line: '¡Qué buena siesta!' },
  hamaca: { x: TOWN.hammock.x, y: 1.12, z: TOWN.hammock.z, exit: { x: TOWN.hammock.x, z: TOWN.hammock.z + 2.3 }, line: '¡Qué rico se mece la hamaca!' },
};
function goSleep(where) {
  const P = player, b = BEDS[where] || BEDS.cama; P.sleepSpot = BEDS[where] ? where : 'cama';
  P.state = 'sleep'; P.sleepT = 0; P.vx = P.vz = P.vy = 0; P.pos.set(b.x, b.y, b.z); P.heading = 0; P.T.lie = 1;
  setTemp('dormido', 999); say(P, 'Zzz…', 2);
}
function wake() {
  const P = player; if (P.state !== 'sleep' || P.sleepT < 0.8) return; const b = BEDS[P.sleepSpot] || BEDS.cama;
  P.state = 'normal'; P.T.lie = 0; P.pos.set(b.exit.x, groundY(b.exit.x, b.exit.z), b.exit.z); P.sleepSpot = null; clearTemp(); P.T.doTrick('hop'); say(P, b.line, 2); SFX.nice();
}

// ───────────────────────── comer ─────────────────────────
// Lo que sale del refri: piezas propias (no las de la repisa), con el origen en la base.
const FOODS = {
  gelatina: { line: '¡Ñam! Gelatina de mango.', from: [5.27, 0.2, -12.13], make: (b) => b.cyl('#ffffff', 0, 0.02, 0, 0.26, 0.26, 0.04, 18).cyl('#ffb347', 0, 0.15, 0, 0.15, 0.2, 0.24, 18).cyl('#ffd27a', 0, 0.275, 0, 0.14, 0.14, 0.02, 18).sph('#ff5d5d', 0, 0.31, 0, 0.05) },
  tamal: { line: '¡Ñam! Un tamalito recién hecho.', from: [4.85, 0.7, -12.13], make: (b) => b.rbox('#d9c27a', 0, 0.09, 0, 0.42, 0.16, 0.2, 0.07).rbox('#f2c94c', 0.02, 0.12, 0.01, 0.3, 0.12, 0.17, 0.05).cone('#c9b067', -0.26, 0.09, 0, 0.08, 0.14, 6) },
  sandia: { line: '¡Glup! Juguito de sandía.', from: [5.48, 0.72, -12.19], make: (b) => b.cyl('#dff6ff', 0, 0.15, 0, 0.11, 0.09, 0.3, 14).cyl('#ff5d73', 0, 0.13, 0, 0.1, 0.085, 0.24, 14).cyl('#ffffff', 0.05, 0.33, 0, 0.012, 0.012, 0.22, 6, 0, -0.3).add(gCyl(1, 12), '#58b368', -0.1, 0.27, 0, 0.07, 0.02, 0.07, Math.PI / 2, 0, 0.5) },
  helado: { line: '¡Mmm! Helado de vainilla.', from: [5.33, 1.66, -12.17], make: (b) => b.add(gCone(10), '#d9a066', 0, 0.13, 0, 0.1, 0.26, 0.1, Math.PI, 0, 0).sph('#fff4d6', 0, 0.3, 0, 0.12).sph('#ff9db8', 0.03, 0.41, 0.02, 0.09).sph('#ff3b4f', 0.02, 0.51, 0.03, 0.035) },
};
for (const k in FOODS) { const m = new Batch(); FOODS[k].make(m); FOODS[k].mesh = m.mesh(MAT_SOFT); FOODS[k].mesh.visible = false; scene.add(FOODS[k].mesh); }
const berryBits = [0, 1, 2].map(() => { const m = new THREE.Mesh(berryMesh.geometry, new THREE.MeshLambertMaterial()); m.visible = false; scene.add(m); return m; });
const _ev = new THREE.Vector3(), _ev2 = new THREE.Vector3();
// la boca de Tamachin y un punto un poco más adelante (las manos), en el mundo
function mouthAt(v, ahead) { const P = player, sc = P.T.scale, f = 0.6 + (ahead || 0); return v.set(P.pos.x + Math.sin(P.heading) * f * sc, P.pos.y + (P.T.def.mouthY + 0.04) * sc, P.pos.z + Math.cos(P.heading) * f * sc); }
const arc = (out, a, b, k, h) => out.lerpVectors(a, b, k).setY(lerp(a.y, b.y, k) + Math.sin(k * Math.PI) * h);
const turnTo = (P, h, dt, rate) => { P.heading += angDiff(P.heading, h) * Math.min(1, dt * rate); };
// Una secuencia que ocupa a Tamachin unos segundos: no camina ni hace trucos; `cam` acerca la cámara.
function startBusy(seq) { const P = player; P.state = 'busy'; P.busy = seq; seq.t = 0; seq.fired = {}; P.vx = P.vz = 0; }
const once = (s, key, at) => (s.t >= at && !s.fired[key] ? (s.fired[key] = true) : false);

// refri: se acerca, abre con rebote, sale la luz y el frío, la comida vuela a sus manos y se la come a mordidas
function openFridge() {
  const P = player, fr = house.fridge, keep = quests.gelatina === 1 && !P.carry;      // la gelatina de Nube no se come
  const kind = keep ? 'gelatina' : choose(Object.keys(FOODS)), F = FOODS[kind], food = F.mesh;
  const spot = new THREE.Vector3(3.95, P.pos.y, -10.85), from = new THREE.Vector3(...F.from), start = P.pos.clone();
  const toFridge = Math.atan2(5.15 - spot.x, -11.75 - spot.z);
  startBusy({ dur: keep ? 2.6 : 3.3, cam: { x: 4.6, y: 1.0, z: -11.2, ox: -0.9, oy: 2.5, oz: 4.2 },   // entre la mesa y el refri, de frente a Tamachin
    update(dt, t) {
      const s = this;
      if (t < 0.35) { P.pos.lerpVectors(start, spot, ease(t / 0.35)); turnTo(P, toFridge, dt, 10); }
      if (once(s, 'open', 0.3)) { fr.target = 1; SFX.fridgeOpen(); setTemp('asombrado', 1.1); emit('excl', P.pos.x, P.pos.y + 2.0, P.pos.z); P.T.poke(3); }
      for (const [k, at] of [['m1', 0.38], ['m2', 0.55], ['m3', 0.8], ['m4', 1.1]]) if (once(s, k, at)) for (let i = 0; i < 3; i++) emit('mist', rand(4.75, 5.55), rand(0.5, 1.9), -11.6, { spread: 0.9 });
      if (once(s, 'shine', 0.5)) burst('spark', 5.15, 1.4, -11.9, 4);
      if (once(s, 'launch', 0.95)) { food.visible = true; food.scale.setScalar(1); food.position.copy(from); }
      if (t >= 0.9) turnTo(P, 0, dt, 7);                                      // se voltea hacia la cámara con la comida
      if (t >= 0.95 && t < 1.4) { mouthAt(_ev, 0.32).y -= 0.18; arc(food.position, from, _ev, ease((t - 0.95) / 0.45), 0.7); food.rotation.y = (t - 0.95) * 14; }
      if (once(s, 'catch', 1.4)) { P.T.poke(4.5); SFX.pop(); food.rotation.set(0, 0, 0); if (!keep) say(P, F.line, 2.2); else say(P, '¡Una gelatina para Nube!', 2.4); }
      if (t >= 1.4 && !keep) {
        const bites = Math.min(3, Math.floor((t - 1.55) / 0.42) + 1), sc = t < 1.55 ? 1 : Math.pow(0.6, bites) * (bites >= 3 && t > 2.55 ? Math.max(0, 1 - (t - 2.55) / 0.15) : 1);
        mouthAt(_ev, 0.3 - 0.06 * bites).y -= 0.16 - 0.04 * bites; food.position.lerp(_ev, Math.min(1, dt * 12)); food.scale.setScalar(Math.max(0.001, sc));
        for (const [k, at] of [['b1', 1.55], ['b2', 1.97], ['b3', 2.39]]) if (once(s, k, at)) { P.T.poke(2.8); SFX.munch(); mouthAt(_ev2, 0.25); burst('crumb', _ev2.x, _ev2.y, _ev2.z, 4); }
        if (once(s, 'gone', 2.7)) { food.visible = false; burst('heart', P.pos.x, P.pos.y + 1.9, P.pos.z, 5); SFX.nice(); gain('panza', 0.55); gain('diversion', 0.04); setTemp('contento', 2.5); }
      }
      if (t >= 1.4 && keep) { const k = Math.min(1, (t - 1.4) / 0.5); _ev.set(P.pos.x, P.pos.y + (P.T.def.H + 0.35) * P.T.scale, P.pos.z); food.position.lerp(_ev, k); }
      if (once(s, 'close', keep ? 1.9 : 2.05)) fr.target = 0;
    },
    end() { if (keep) P.carry = { kind, mesh: food }; },
  });
}

// comer de una planta: los frutos saltan a su boca uno tras otro (una sandía se come a tres mordidas)
// o.items: [{ mesh, scale, from (Vector3), take() }], o.at: de dónde (para voltear), o.gain, o.line, o.big, o.done()
function eatBits(o) {
  const P = player, n = o.items.length, face = Math.atan2(o.at.x - P.pos.x, o.at.z - P.pos.z), tEnd = 0.15 + (n - 1) * 0.18 + 0.38;
  startBusy({ dur: tEnd + (o.big ? 1.3 : 0.75), cam: null,
    update(dt, t) {
      const s = this; turnTo(P, t < tEnd + 0.1 ? face : 0, dt, 9);
      o.items.forEach((it, i) => {
        const m = it.mesh, t0 = 0.15 + i * 0.18, k = (t - t0) / 0.38;
        if (k >= 0 && k < 1) {
          if (!it.taken) { it.taken = true; m.visible = true; m.scale.setScalar(it.scale); m.rotation.set(0, 0, 0); it.take(); }
          mouthAt(_ev, o.big ? 0.45 : 0.12); if (o.big) _ev.y -= 0.25; arc(m.position, it.from, _ev, k, 0.5); m.rotation.y += dt * 5;
        } else if (k >= 1 && m.visible) {
          if (!o.big) { m.visible = false; P.T.poke(2.4); SFX.munch(); mouthAt(_ev, 0.2); burst('crumb', _ev.x, _ev.y, _ev.z, 2); }
          else {
            const b = Math.floor((t - t0 - 0.38) / 0.32);
            if (b >= 3) m.visible = false;
            else { m.scale.setScalar(it.scale * Math.pow(0.6, b)); if (once(s, 'bite' + b, t0 + 0.38 + b * 0.32)) { P.T.poke(2.8); SFX.munch(); mouthAt(_ev, 0.3); burst('crumb', _ev.x, _ev.y, _ev.z, 4); } }
          }
        }
      });
      if (once(s, 'say', 0.2)) say(P, o.line, 1.9);
      if (once(s, 'full', tEnd + (o.big ? 1.05 : 0.15))) { gain('panza', o.gain); burst('heart', P.pos.x, P.pos.y + 1.8, P.pos.z, 2); if (o.done) o.done(); }
    },
  });
}
// bayas del bosque de casa: hasta tres por bocado
function eatBerries(b) {
  const ripe = b.berries.filter((q) => q.k >= 0.999).slice(0, 3); if (!ripe.length) return;
  const first = !b.tasted; b.tasted = true;
  eatBits({ at: b, gain: 0.06 * ripe.length, line: first ? '¡Ñam! ' + b.kind.name[0].toUpperCase() + b.kind.name.slice(1) + '.' : choose(['¡Qué jugosas!', '¡Ñam, ñam!', '¡Mmm, dulcecitas!']),
    items: ripe.map((q, i) => { const m = berryBits[i]; m.material.color.set(b.kind.color);
      return { mesh: m, scale: 0.118 * b.s, from: new THREE.Vector3(q.x, q.y, q.z), take: () => { q.k = 0; setBerry(b, q); berryMesh.instanceMatrix.needsUpdate = true; q.back = clock + rand(50, 75); } }; }) });
}
// fruta del bosque sin fin y del mercado: piezas que vuelan (tres por tipo, se reusan)
const FLY = {};
function flyMesh(mk, i) {
  const a = FLY[mk] || (FLY[mk] = []);
  if (!a[i]) { a[i] = new THREE.Mesh(FK[mk].geo, new THREE.MeshLambertMaterial({ vertexColors: !FK[mk].plain })); a[i].visible = false; a[i].castShadow = true; scene.add(a[i]); }
  return a[i];
}
function eatPlant(p) {
  const F = FRUITS[p.kind], c = p.chunk, ripe = p.fruits.filter((f) => f.k >= 1).slice(0, F.per); if (!ripe.length) return;
  eatBits({ at: p, gain: F.gain * ripe.length, line: F.line, big: F.big, done: () => tasteFruit(p.kind),
    items: ripe.map((f, i) => { const m = flyMesh(f.mk, i); if (f.color) m.material.color.set(f.color);
      return { mesh: m, scale: f.s, from: new THREE.Vector3(f.x, f.y + (f.mk === 'melon' ? 0.2 : 0), f.z), take: () => { setFruit(c, f, 0); forest.eaten.set(p.key + ',' + p.fruits.indexOf(f), clock + rand(60, 90)); } }; }) });
}
function eatMarket(stall) {
  const kind = choose(Object.keys(FRUITS)), F = FRUITS[kind], m = flyMesh(F.mk, 0), sx = stall + rand(-1.6, 1.6);
  if (F.color) m.material.color.set(F.color);
  eatBits({ at: { x: sx, z: TOWN.market.z }, gain: 0.18, line: choose(['¡Gracias, Lila! ', '¡Qué rico! ', '¡Del mercado! ']) + F.name[0].toUpperCase() + F.name.slice(1) + '.', big: F.big,
    items: [{ mesh: m, scale: F.mk === 'fruit' ? Math.max(0.12, F.s) : 1, from: new THREE.Vector3(sx, 1.45, TOWN.market.z + 0.35), take: () => {} }] });
}
let berryDirty = false;
function updateBerries(dt) {
  for (const b of berryBushes) for (const q of b.berries) if (q.k < 1 && q.back && clock > q.back) { q.k = Math.min(1, q.k + dt * 1.6); setBerry(b, q); berryDirty = true; }
  if (berryDirty) { berryMesh.instanceMatrix.needsUpdate = true; berryDirty = false; }
}
function updateFridge(dt) {
  const fr = house.fridge, was = fr.open;
  fr.v += (fr.target - fr.open) * 95 * dt - fr.v * 8.5 * dt; fr.open = clamp(fr.open + fr.v * dt, -0.04, 1.12);   // resorte: rebota al abrir y al cerrar
  if (fr.target === 0 && was > 0.05 && fr.open <= 0.05) { SFX.fridgeShut(); burst('mist', 5.15, 0.9, -11.55, 3); }
  fr.pivot.rotation.y = Math.max(0, fr.open) * 1.35;                 // abierta queda junto a la pared
  const g = clamp(fr.open * 1.3, 0, 1); fr.panelMat.color.setRGB(lerp(0.62, 0.95, g), lerp(0.72, 0.99, g), lerp(0.75, 1, g));
  fr.poolMat.opacity = g * 0.55; fr.beamMat.opacity = g * 0.42; fr.pool.visible = fr.beam.visible = g > 0.02;
}

// cosas con las que se puede interactuar
for (const n of npcs) interacts.push({ pos: n.pos, range: 3.1, label: 'Hablar con ' + n.name, act: () => talkTo(n), who: n });
interacts.push({ pos: { x: -2.8, z: -10.5 }, range: 1.7, label: 'Dormir una siesta', act: () => goSleep('cama') });
interacts.push({ pos: { x: 5.1, z: -11.2 }, range: 1.7, label: 'Abrir el refri', act: openFridge });
interacts.push({ pos: { x: -3.1, z: -6.6 }, range: 1.7, label: () => (house.tvOn ? 'Apagar la tele' : 'Encender la tele'), act: () => {
  house.tvOn = !house.tvOn; if (house.tvOn) { say(player, '¡Oh, mi programa favorito!', 2.2); setTemp('asombrado', 2.2); SFX.pop(); gain('diversion', 0.06, 'tele', 20); } else house.tvMat.color.set(0x15151c); } });
interacts.push({ pos: { x: 0, z: -45 }, range: 4.4, label: 'Pedir un deseo', act: () => {
  const P = player; say(P, choose(['Deseo… ¡un helado gigante!', 'Deseo… ¡que nunca llueva en domingo!', 'Deseo… ¡un amigo conejo!', 'Deseo… ¡ojos todavía más grandes!']), 2.8);
  burst('spark', 0, 2.6, -45, 8); burst('splash', 0, 2.3, -45, 6); P.T.doTrick('hop'); SFX.nice(); gain('diversion', 0.15, 'fuente', 20); } });
interacts.push({ pos: { x: CAMP.x, z: CAMP.z }, range: 2.7, label: 'Calentarse en la fogata', act: () => {
  const P = player; say(P, '¡Qué calientito!', 2.2); burst('spark', CAMP.x, 1.3, CAMP.z, 6); P.T.doTrick('dance'); if (P.baseMood !== 'contento') setTemp('contento', 5);
  if (gain('energia', 0.15, 'fogata', 20)) gain('diversion', 0.1); } });
interacts.push({ pos: { x: 2.5, z: 15.4 }, range: 1.7, label: 'Abrir el buzón', act: () => {
  if (!quests.peces) { say(player, 'Una carta: «Ven al bosque, hay peces saltarines».', 3.2); startQuest('peces'); SFX.pop(); return; }
  say(player, choose(['Una carta: «Ven al bosque, hay peces saltarines».', 'Una postal del búho: «Uuh, uuh».', 'Un volante: «Gelatina a mitad de precio».', 'El buzón está vacío… ¡y huele a flores!']), 3.2); SFX.pop(); } });
interacts.push({ pos: TOWN.hammock, range: 2.6, label: 'Descansar en la hamaca', act: () => goSleep('hamaca') });
for (const sx of TOWN.stalls) interacts.push({ pos: { x: sx, z: TOWN.market.z + 2.0 }, range: 3.6, label: 'Probar fruta del mercado', act: () => eatMarket(sx) });
for (const b of berryBushes) interacts.push({ pos: { x: b.x, z: b.z }, range: 2.3, label: 'Comer ' + b.kind.name, act: () => eatBerries(b), ok: () => b.berries.some((q) => q.k >= 0.999) });
// platicar y acariciar también divierten (una vez cada tanto por cada quien)
for (const c of creatures) { const f = c.interact; c.interact = () => { f(); gain('diversion', 0.07, 'mimo' + creatures.indexOf(c), 8); }; }
for (const it of interacts) if (it.who && it.who.kind !== 'vecino') it.act = it.who.interact;

// encargos en los vecinos
const npcBy = (name) => npcs.find((n) => n.name === name);
const tofu = npcBy('Tofu'), lulu = npcBy('Lulú'), nube = npcBy('Nube'), rocio = npcBy('Rocío');
tofu.onTalk = () => {
  if (quests.conejo === 2) return Math.random() < 0.5 ? choose(['¡Mi conejo y yo le damos vueltas a la manzana!', '¡Gracias por traerme un amigo!']) : null;
  if (!quests.conejo) { startQuest('conejo'); return 'Extraño a mi amigo el conejo… ¿me traerías uno del bosque?'; }
  return creatures.some((c) => c.kind === 'conejo' && c.follow > 0) ? '¡Ya casi! Tráelo un poquito más cerca.' : 'Los conejos viven en el bosque, al norte. Si caminas despacio, no huyen.';
};
function petRabbit(o) {
  if (quests.conejo !== 1) return 12;
  o.onLost = (r) => { say(r, '(se cansó de seguirte)', 2); toast('El conejo se quedó atrás. Camina sin correr para que te siga.', 4); };
  o.onStuck = () => toast('Los conejos no nadan: cruza el río por el puente.', 4);
  return 1e9;                                                         // te sigue hasta que llegue con Tofu o lo dejes atrás
}
function giveRabbit(r) {
  r.follow = 0; r.buddy = tofu; r.onLost = r.onStuck = null; r.home = { x: r.pos.x, z: r.pos.z };
  tofu.mood0 = 'contento'; tofu.cheer = 0; tofu.T.setMood('contento');
}
lulu.onTalk = (n) => {
  if (quests.fuente === 2) return Math.random() < 0.5 ? '¡La fuente brilla más cuando vienes!' : null;
  if (n.follow) return '¡Vamos! La fuente está en el parque, al norte de tu casa.';
  if (!quests.fuente) startQuest('fuente');
  if (n.loopSaved) { n.loop = n.loopSaved; n.loopSaved = null; n.home = null; }
  n.follow = luluFollow; n.lostAt = 0; return '¿Me acompañas a ver la fuente? ¡Vamos juntos!';
};
function luluFollow(n, d) {
  if (Math.hypot(n.pos.x, n.pos.z + 45) < 10) {                      // ya en la plaza de la fuente (camina un poco detrás de Tamachin)
    n.follow = null; n.loop = null; n.home = LULU_SPOT; n.goto = { x: LULU_SPOT.x, z: LULU_SPOT.z }; finishQuest('fuente'); say(n, '¡Qué bonita! Gracias por acompañarme.', 3); n.T.doTrick('dance'); burst('heart', n.pos.x, 1.8, n.pos.z, 6); return;
  }
  if (d < 26) { n.lostAt = 0; return; }
  if (!n.lostAt) { n.lostAt = clock; say(n, '¡Espérame!', 2); }
  else if (clock - n.lostAt > 7 || d > 60) {                           // se cansa: se queda ahí y luego vuelve a su paseo
    n.follow = null; n.loopSaved = n.loop; n.loop = null; n.home = { x: n.pos.x, z: n.pos.z, ry: n.heading };
    toast('Lulú se cansó de esperar. Platica con ella para intentarlo otra vez.', 4.5);
  }
}
const LULU_SPOT = { x: 2.2, z: -39.6, ry: Math.atan2(-2.2, -5.4) };
nube.onTalk = (n) => {
  if (quests.gelatina === 2) return null;
  if (player.carry && player.carry.kind === 'gelatina') {
    player.carry.mesh.visible = false; player.carry = null; finishQuest('gelatina');
    n.mood0 = 'contento'; n.T.setMood('contento'); burst('heart', n.pos.x, 1.8, n.pos.z, 5); return '¡Gelatina! Ñam… ¡ya se me quitó el sueño!';
  }
  if (!quests.gelatina) { startQuest('gelatina'); return 'Zzz… sueño con gelatina… ¿me traes una del refri?'; }
  return 'Zzz… gelatina… del refri de tu casa… zzz…';
};
npcBy('Tomate').onTalk = () => { if (quests.cumbres) return null; startQuest('cumbres'); return '¡Tres picos! ¿Subes a los tres? En cada cima hay una bandera de color.'; };
npcBy('Miel').onTalk = () => { if (quests.frutas) return null; startQuest('frutas'); return 'El bosque del norte tiene siete frutas. ¿Las pruebas todas?'; };
rocio.onTalk = () => { if (quests.peces) return null; startQuest('peces'); return 'Si esperas quieto en la orilla, los peces saltan cerquita.'; };
// peces: con el encargo en curso saltan cerca de quien espera quieto en la orilla, y verlo de cerca lo cumple
function fishBias() { const P = player; return quests.peces === 1 && P.speedN < 0.4 && Math.abs(P.pos.z - riverZ(P.pos.x)) < 11 ? P.pos.x : null; }
let fishSeenAt = 0;
function fishJumped(f) { if (quests.peces === 1 && !fishSeenAt && Math.hypot(player.pos.x - f.x, player.pos.z - riverZ(f.x)) < 9) fishSeenAt = clock + 0.45; }
function updateQuests(dt) {
  const P = player;
  if (quests.conejo === 1) for (const c of creatures) if (c.kind === 'conejo' && c.follow > 0 && Math.hypot(c.pos.x - tofu.pos.x, c.pos.z - tofu.pos.z) < 3.6) {
    giveRabbit(c); finishQuest('conejo'); tofu.talkT = 3; say(tofu, '¡Mi amigo conejo! ¡Gracias, gracias!', 3.2); say(c, '¡Hop!', 1.6); tofu.T.doTrick('dance'); burst('heart', tofu.pos.x, 1.8, tofu.pos.z, 6); break;
  }
  if (fishSeenAt && clock >= fishSeenAt) { fishSeenAt = 0; if (quests.peces === 1) { finishQuest('peces'); say(P, '¡Un pez saltarín! ¡Lo vi, lo vi!', 2.6); P.T.doTrick('hop'); } }
  if (lulu.loopSaved && Math.hypot(lulu.pos.x - P.pos.x, lulu.pos.z - P.pos.z) > 80) { lulu.loop = lulu.loopSaved; lulu.loopSaved = null; lulu.home = null; }
  if (P.carry) { const m = P.carry.mesh; m.position.set(P.pos.x, P.pos.y + (P.T.def.H + 0.3 + Math.sin(clock * 3) * 0.06) * P.T.scale * (1 - 0.6 * P.T.lieK), P.pos.z); m.rotation.y += dt * 1.2; }
}

// ───────────────────────── entrada: teclado, puntero y táctil ─────────────────────────
window.addEventListener('keydown', (e) => {
  const tg = e.target && e.target.tagName;
  if (tg === 'INPUT') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;              // atajos del navegador (Cmd+C, Ctrl+W…), no del juego
  const c = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(c) >= 0 && tg !== 'BUTTON') e.preventDefault();
  if (e.repeat) return;
  keys[c] = true; unlockAudio();
  if (tg === 'BUTTON' && (c === 'Space' || c === 'Enter')) return;
  if (c === 'Space') jump(); else if (c === 'KeyE' || c === 'Enter') doAction(); else if (c === 'KeyC') togglePanel(); else if (c === 'KeyJ') toggleDiary();
  else if (c === 'Escape') { if (!diaryEl.hidden) toggleDiary(false); else if (ui.closeup) togglePanel(false); }
});
// en macOS no llega keyup de las teclas soltadas mientras Cmd está abajo: al soltar Cmd se liberan todas
window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.key === 'Meta') for (const k in keys) keys[k] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('click', (e) => { const b = e.target && e.target.closest && e.target.closest('button'); if (b && e.detail > 0) b.blur(); });

function setPtr(e) {
  const r = canvas.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.active = true; ptr.moveT = clock;
  const dx = ptr.x - pScreen.x, dy = ptr.y - pScreen.y, dist = Math.hypot(dx, dy);
  if (dist > pScreen.r * 0.3 && dist < Math.max(150, pScreen.r * 5)) {
    const a = Math.atan2(dy, dx);
    if (ptr.hasA) { const d = angDiff(ptr.a, a); if (Math.abs(d) < 1.3 && player.state === 'normal' && player.T.mood !== 'mareado') player.spin += d; }
    ptr.a = a; ptr.hasA = true;
  } else ptr.hasA = false;
}
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') document.body.classList.add('touch');
  unlockAudio(); try { canvas.focus({ preventScroll: true }); } catch (_) { /* sin foco */ }
  if (ptr.id !== null && e.pointerType === 'touch') return;
  ptr.id = e.pointerId; ptr.down = true; ptr.sx = e.clientX; ptr.sy = e.clientY; ptr.st = performance.now(); ptr.hasA = false; setPtr(e);
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
});
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' && e.pointerId !== ptr.id) return; setPtr(e); });
function ptrEnd(e) {
  if (e.pointerId !== ptr.id) return;
  if (e.type === 'pointerup' && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) < 12 && performance.now() - ptr.st < 450) { const r = canvas.getBoundingClientRect(); handleClick(e.clientX - r.left, e.clientY - r.top); }
  ptr.down = false; ptr.id = null; if (e.pointerType !== 'mouse') { ptr.active = false; ptr.hasA = false; }
}
canvas.addEventListener('pointerup', ptrEnd); canvas.addEventListener('pointercancel', ptrEnd);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { ptr.active = false; ptr.hasA = false; } });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); ui.zoomTarget = clamp(ui.zoomTarget * (e.deltaY > 0 ? 1.1 : 0.9), 0.5, 1.6); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const _sv = new THREE.Vector3();
function pxRadius(x, y, z, r) { const d = camera.position.distanceTo(_sv.set(x, y, z)); return r / (d * Math.tan(camera.fov * Math.PI / 360)) * VH / 2; }
function hitTest(px, py, x, y, z, r) {
  _sv.set(x, y, z).project(camera); if (_sv.z > 1) return Infinity;
  const sx = (_sv.x * 0.5 + 0.5) * VW, sy = (-_sv.y * 0.5 + 0.5) * VH, d = Math.hypot(px - sx, py - sy);
  return d < Math.max(22, pxRadius(x, y, z, r)) ? d : Infinity;
}
function handleClick(px, py) {
  const P = player; let best = Infinity, what = null;
  let d = hitTest(px, py, P.pos.x, P.pos.y + 0.8 * P.T.scale * (1 - 0.6 * P.T.lieK), P.pos.z, 0.85 * P.T.scale); if (d < best) { best = d; what = P; }
  for (const n of npcs) { d = hitTest(px, py, n.pos.x, 0.7 * n.T.scale, n.pos.z, 0.8 * n.T.scale); if (d < best) { best = d; what = n; } }
  for (const c of creatures) { d = hitTest(px, py, c.pos.x, c.pos.y + 0.5, c.pos.z, c.clickR); if (d < best) { best = d; what = c; } }
  if (!what) return;
  if (what === P) { if (P.state === 'sleep') wake(); else playerTrick(); return; }
  const dist = Math.hypot(what.pos.x - P.pos.x, what.pos.z - P.pos.z);
  if (what.kind === 'vecino') { if (dist < 6.5 && P.state === 'normal') talkTo(what); else { say(what, '¡Ven, acércate!', 1.8); what.T.doTrick('wave'); what.talkT = 1.8; } }
  else if (dist < 6.5) what.interact(); else emit('excl', what.pos.x, what.pos.y + 1.4, what.pos.z);
}

const joyEl = $('#joy'), knobEl = $('#knob');
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect(), m = r.width / 2 - 20; let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy); if (d > m) { dx *= m / d; dy *= m / d; }
  joy.x = dx / m; joy.y = dy / m; knobEl.style.transform = 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' + dy.toFixed(1) + 'px))';
}
function endJoy(e) { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knobEl.style.transform = 'translate(-50%,-50%)'; }
joyEl.addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); joy.id = e.pointerId; try { joyEl.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ } moveJoy(e); if (player.state === 'sleep') wake(); });
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) moveJoy(e); });
joyEl.addEventListener('pointerup', endJoy); joyEl.addEventListener('pointercancel', endJoy);
$('#tJump').addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); jump(); });
$('#tAct').addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); doAction(); });
if (COARSE) document.body.classList.add('touch');

// ───────────────────────── panel para personalizar ─────────────────────────
const EYES = (y, dx) => '<circle cx="' + (14 - dx) + '" cy="' + y + '" r="2.7" fill="#fff"/><circle cx="' + (14 + dx) + '" cy="' + y + '" r="2.7" fill="#fff"/><circle cx="' + (14 - dx) + '" cy="' + y + '" r="1.2" fill="#231d3b"/><circle cx="' + (14 + dx) + '" cy="' + y + '" r="1.2" fill="#231d3b"/>';
const SHAPE_ICON = {
  bola: '<circle cx="14" cy="15" r="10.5"/>' + EYES(14, 3.7), huevo: '<ellipse cx="14" cy="15" rx="8.6" ry="11.5"/>' + EYES(14.5, 3.4),
  gota: '<path d="M14 1.5C14 1.5 23.5 13 23.5 18a9.5 9.5 0 0 1-19 0C4.5 13 14 1.5 14 1.5z"/>' + EYES(18, 3.6),
  cubito: '<rect x="4" y="5" width="20" height="20" rx="5.5"/>' + EYES(14, 3.8), gatito: '<path d="M4.5 3.5l5.5 5h8l5.5-5v12.5a9.5 9.5 0 0 1-19 0z"/>' + EYES(15, 3.7),
  fantasma: '<path d="M4.5 26V13a9.5 9.5 0 0 1 19 0v13l-3.2-3-3.1 3-3.2-3-3.1 3-3.2-3z"/>' + EYES(13, 3.6),
  hongo: '<path d="M1.5 14.5a12.5 10.5 0 0 1 25 0z"/><rect x="8.5" y="14" width="11" height="12" rx="4.5" fill="#fff1d6" stroke="#231d3b" stroke-width="1.5"/><circle cx="11.8" cy="19.5" r="1.3" fill="#231d3b"/><circle cx="16.2" cy="19.5" r="1.3" fill="#231d3b"/>',
  estrella: '<path d="M14 1.5l3.6 7.6 8.3 1.1-6.1 5.8 1.6 8.3-7.4-4.1-7.4 4.1 1.6-8.3-6.1-5.8 8.3-1.1z" stroke-linejoin="round" stroke="currentColor" stroke-width="2"/>' + EYES(14, 3),
};
const FACE = '<circle cx="14" cy="14" r="11.5" fill="#ffc93c" stroke="#231d3b" stroke-width="2"/>', DOTS = '<circle cx="9.5" cy="12" r="1.7" fill="#231d3b"/><circle cx="18.5" cy="12" r="1.7" fill="#231d3b"/>', LN = ' fill="none" stroke="#231d3b" stroke-width="2" stroke-linecap="round"';
const MOOD_ICON = {
  contento: FACE + DOTS + '<path d="M9 16.5q5 5.5 10 0z" fill="#231d3b"/>', triste: FACE + DOTS + '<path d="M9.5 20q4.5-4.5 9 0"' + LN + '/><path d="M20 15q1.6 2.6 0 3.6-1.6-1 0-3.6z" fill="#6ec6ff"/>',
  asombrado: FACE + '<circle cx="9.5" cy="11.5" r="2.6" fill="#fff" stroke="#231d3b" stroke-width="1.4"/><circle cx="18.5" cy="11.5" r="2.6" fill="#fff" stroke="#231d3b" stroke-width="1.4"/><circle cx="14" cy="19" r="2.4" fill="#231d3b"/>',
  enojado: FACE + DOTS + '<path d="M6.5 8l5 2.6M21.5 8l-5 2.6M9.5 20q4.5-4 9 0"' + LN + '/>', dormido: FACE + '<path d="M7 12.5q2.5 2 5 0M16 12.5q2.5 2 5 0"' + LN + '/><circle cx="14" cy="19" r="1.5" fill="#231d3b"/>',
  enamorado: FACE + '<path d="M9.5 15l-3-3a1.7 1.7 0 0 1 3-1.6 1.7 1.7 0 0 1 3 1.6zM18.5 15l-3-3a1.7 1.7 0 0 1 3-1.6 1.7 1.7 0 0 1 3 1.6z" fill="#ff3f7f"/><path d="M10 18.5q4 3.5 8 0"' + LN + '/>',
};
const SWATCHES = [['#ffc93c', 'Sol'], ['#ff8a5c', 'Mandarina'], ['#ff6b9d', 'Chicle'], ['#c58bff', 'Lavanda'], ['#7c9cff', 'Cielo'], ['#4fd1e0', 'Agua'], ['#35c9a0', 'Menta'], ['#9bd34a', 'Lima'], ['#f4f1e8', 'Nube'], ['#5a5670', 'Carbón']];
const svg = (inner) => '<svg viewBox="0 0 28 28" aria-hidden="true" fill="currentColor">' + inner + '</svg>';
const shapesEl = $('#shapes'), colorsEl = $('#colors'), moodsEl = $('#moods'), pickEl = $('#colorPick');
function optButton(parent, key, label, icon, on) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.dataset.key = key; b.innerHTML = svg(icon) + '<span></span>'; b.lastChild.textContent = label;
  b.addEventListener('click', () => on(key)); parent.appendChild(b);
}
for (const k in SHAPES) optButton(shapesEl, k, SHAPES[k].label, SHAPE_ICON[k], setShape);
for (const k in MOODS) if (!MOODS[k].hidden) optButton(moodsEl, k, MOODS[k].label, MOOD_ICON[k], setMood);
for (const s of SWATCHES) { const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = s[0]; b.dataset.key = s[0]; b.setAttribute('aria-label', 'Color ' + s[1]); b.title = s[1]; b.addEventListener('click', () => setColor(s[0])); colorsEl.appendChild(b); }
pickEl.addEventListener('input', () => setColor(pickEl.value));
function syncPanel() {
  shapesEl.querySelectorAll('.opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === player.T.shape)));
  moodsEl.querySelectorAll('.opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === player.baseMood)));
  colorsEl.querySelectorAll('.sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === player.T.color)));
  if (/^#[0-9a-f]{6}$/i.test(player.T.color)) pickEl.value = player.T.color;
}
function setShape(k) { player.T.setShape(k); player.T.poke(5); burst('spark', player.pos.x, player.pos.y + 1.4, player.pos.z, 5); SFX.pop(); syncPanel(); save(); }
function setColor(c) { player.T.setColor(c); player.T.poke(2.5); syncPanel(); save(); }
function setMood(k) { player.baseMood = k; if (player.state !== 'sleep') clearTemp(); player.T.poke(3); SFX.pop(); syncPanel(); save(); if (player.needLow) toast(NEEDS[player.needLow].tip, 4); }
const panelEl = $('#panel'), bCustom = $('#bCustom');
function togglePanel(on) {
  if (on === undefined) on = panelEl.hidden;
  if (on && player.state === 'sleep') wake();
  if (on && !diaryEl.hidden) toggleDiary(false);
  panelEl.hidden = !on; ui.closeup = on; document.body.classList.toggle('custom', on); bCustom.setAttribute('aria-expanded', String(on)); bCustom.textContent = on ? 'Volver al mundo' : 'Personalizar';
  if (on) { syncPanel(); for (const k in keys) keys[k] = false; }
}

// diario: cómo está Tamachin y los encargos. Se abre con los medidores (o la tecla J).
const diaryEl = $('#diary'), bNeeds = $('#needs'), needListEl = $('#needList'), questListEl = $('#questList'), questNoteEl = $('#questNote');
const needEls = {}; bNeeds.querySelectorAll('.need').forEach((el) => { needEls[el.dataset.k] = { el, bar: el.querySelector('b') }; });
function toggleDiary(on) {
  if (on === undefined) on = diaryEl.hidden;
  if (on && ui.closeup) togglePanel(false);
  diaryEl.hidden = !on; bNeeds.setAttribute('aria-expanded', String(on)); document.body.classList.toggle('diary', on);
  if (on) renderDiary();
}
function renderDiary() {
  if (diaryEl.hidden) return;
  needListEl.innerHTML = Object.keys(NEEDS).map((k) => '<div class="nrow n-' + k + '">' + needEls[k].el.querySelector('svg').outerHTML + '<strong>' + NEEDS[k].label + '</strong><span class="pct"></span>'
    + '<span class="bar"><b></b></span><p>Se llena con ' + NEEDS[k].fill + '.</p></div>').join('');
  const open = Object.keys(QUESTS).filter((k) => quests[k] === 1), done = Object.keys(QUESTS).filter((k) => quests[k] === 2), left = Object.keys(QUESTS).length - open.length - done.length;
  questListEl.innerHTML = open.concat(done).map((k) => '<li class="' + (quests[k] === 2 ? 'done' : '') + '"><strong>' + QUESTS[k].title + '<em>' + (quests[k] === 2 ? 'Hecho' : 'En curso') + '</em></strong><p>'
    + (quests[k] === 2 ? QUESTS[k].done : QUESTS[k].hint + (QUESTS[k].progress ? ' Llevas ' + QUESTS[k].progress() + '.' : '')) + '</p></li>').join('');
  questNoteEl.textContent = left ? (open.length + done.length ? 'Quedan ' + left + ' encargos por descubrir. ' : '') + 'Platica con los vecinos y revisa el buzón: hay quien necesita ayuda.' : '¡Descubriste todos los encargos!';
  syncDiaryNeeds();
}
function syncDiaryNeeds() {
  needListEl.querySelectorAll('.nrow').forEach((row, i) => { const k = Object.keys(NEEDS)[i]; row.querySelector('.pct').textContent = Math.round(needs[k] * 100) + ' %'; row.querySelector('b').style.transform = 'scaleX(' + needs[k].toFixed(3) + ')'; });
}
let needAriaT = 0;
function syncNeedsHud() {
  for (const k in needEls) { const e = needEls[k]; e.bar.style.transform = 'scaleX(' + needs[k].toFixed(3) + ')'; e.el.classList.toggle('low', player.needLow === k || needs[k] < NEED_LOW); e.el.classList.toggle('up', (needPulse[k] || 0) > clock); }
  if (!diaryEl.hidden) syncDiaryNeeds();
  if ((needAriaT -= 1) <= 0) { needAriaT = 5; bNeeds.setAttribute('aria-label', 'Abrir el diario. ' + Object.keys(NEEDS).map((k) => NEEDS[k].label + ' ' + Math.round(needs[k] * 100) + ' %').join(', ')); }
}
bNeeds.addEventListener('click', () => toggleDiary()); $('#dClose').addEventListener('click', () => toggleDiary(false));
// volver al inicio, frente a la casa. Lejos de casa pide un segundo toque: un toque sin querer no debe costar un kilómetro de camino.
const START = { x: 0, z: 3.5 }, bHome = $('#dHome'); let homeArmed = 0;
function goHome() {
  const P = player; if (P.state === 'busy') return;
  if (Math.hypot(P.pos.x - START.x, P.pos.z - START.z) > 40 && !homeArmed) { homeArmed = clock + 4; bHome.textContent = 'Toca otra vez para volver'; return; }
  homeArmed = 0; bHome.textContent = 'Volver al inicio';
  if (P.state === 'sleep') { P.T.lie = 0; P.sleepSpot = null; clearTemp(); }
  P.T.flat = false; P.state = 'normal'; P.vx = P.vz = P.vy = 0; P.flySpin = 0; P.heading = 0; P.onGround = true;
  P.pos.set(START.x, 0, START.z); camInit = false;
  toggleDiary(false); say(P, '¡De vuelta en casa!', 2.2); P.T.doTrick('hop'); burst('spark', P.pos.x, 1.6, P.pos.z, 6); SFX.nice(); save();
}
bHome.addEventListener('click', goHome);
bCustom.addEventListener('click', () => togglePanel()); $('#pClose').addEventListener('click', () => togglePanel(false));
const bZoom = $('#bZoom'), bSound = $('#bSound'), helpEl = $('#help');
bZoom.addEventListener('click', () => { ui.zoomIdx = (ui.zoomIdx + 1) % 3; ui.zoomTarget = ZOOMS[ui.zoomIdx]; bZoom.textContent = ZOOM_LABEL[ui.zoomIdx]; });
bSound.addEventListener('click', () => { snd.on = !snd.on; bSound.textContent = snd.on ? 'Sonido: sí' : 'Sonido: no'; bSound.setAttribute('aria-pressed', String(snd.on)); if (snd.on) { unlockAudio(); SFX.pop(); } });
$('#helpOk').addEventListener('click', () => { helpEl.hidden = true; });

// ───────────────────────── actualización por cuadro ─────────────────────────
function resolvePlayer() {
  const P = player, pos = P.pos, r = P.r;
  for (let it = 0; it < 2; it++) { for (const b of boxes) pushOutBox(pos, r, b); for (const c of circles) pushOutCircle(pos, r, c.x, c.z, c.r); }
  if (pos.z > -66 && clock > 0) for (const c of cars) {             // antes del primer cuadro los autos aún no están en la calle (todos en el origen)
    if (pos.y < c.h * 0.8 && pushOutBox(pos, r * 0.8, carRect(c, 0)) && c.v > 2.2 && P.state === 'normal' && P.inv <= 0) knock(c);
  }
  for (const n of npcs) pushOutCircle(pos, r, n.pos.x, n.pos.z, 0.5 * n.T.scale);
  northCollide(pos, r); keepInWorld(pos);                           // árboles del norte y límites por franja (05-norte.js)
}
function updatePlayer(dt) {
  const P = player, T = P.T, pos = P.pos;
  if (P.tempT > 0) { P.tempT -= dt; if (P.tempT <= 0) { const f = P.onTempEnd; P.tempMood = null; P.onTempEnd = null; applyMood(); if (f) f(); } }
  P.inv = Math.max(0, P.inv - dt);
  let ix = 0, iz = 0, run = false;
  if (P.state === 'normal' && !ui.closeup) {
    ix = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) + joy.x;
    iz = ((keys.KeyS || keys.ArrowDown) ? 1 : 0) - ((keys.KeyW || keys.ArrowUp) ? 1 : 0) + joy.y;
    run = !!(keys.ShiftLeft || keys.ShiftRight) || Math.hypot(joy.x, joy.y) > 0.93;
  } else if (P.state === 'sleep' && P.sleepT > 0.8 && (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight)) wake();
  let mag = Math.hypot(ix, iz); if (mag > 1) { ix /= mag; iz /= mag; mag = 1; }
  const m = MOODS[T.mood];
  if (T.mood === 'mareado' && P.state === 'normal' && !ui.closeup) {
    const a = Math.sin(clock * 1.9), c = Math.cos(a), s = Math.sin(a), x2 = ix * c - iz * s, z2 = ix * s + iz * c;
    ix = x2 + Math.cos(clock * 2.6) * 0.3; iz = z2 + Math.sin(clock * 2.1) * 0.3; mag = Math.min(1, Math.hypot(ix, iz));
  }
  const ms = P.needMood && T.mood === P.needMood ? Math.max(0.8, m.speed || 1) : (m.speed || 1);   // cansado o con hambre camina un poco más lento, no tanto
  let speed = (run ? 8.6 : 5.2) * ms * (P.inWater ? 0.55 : 1);
  if (pos.z < NORTH_Z && mag > 0.08) {                              // cuesta arriba cuesta un poco más
    const gx = (terrainY(pos.x + 1, pos.z) - terrainY(pos.x - 1, pos.z)) / 2, gz = (terrainY(pos.x, pos.z + 1) - terrainY(pos.x, pos.z - 1)) / 2, up = (gx * ix + gz * iz) / mag;
    speed *= up > 0 ? Math.max(0.62, 1 - 0.4 * up) : 1 + Math.min(0.15, -0.15 * up);
  }
  if (P.state === 'normal') {
    if (mag > 0.08) {
      P.vx = damp(P.vx, ix * speed, 12, dt); P.vz = damp(P.vz, iz * speed, 12, dt);
      P.heading += angDiff(P.heading, Math.atan2(ix, iz)) * Math.min(1, dt * 12); P.idleT = 0; P.moved += speed * mag * dt;
    } else {
      P.vx = damp(P.vx, 0, 14, dt); P.vz = damp(P.vz, 0, 14, dt); P.idleT += dt;
      if (ptr.active && clock - ptr.moveT < 0.3 && Math.abs(P.spin) > 1.2) P.heading += angDiff(P.heading, Math.atan2(ptr.x - pScreen.x, ptr.y - pScreen.y)) * Math.min(1, dt * 14);
      else if (ui.closeup) P.heading += angDiff(P.heading, 0) * Math.min(1, dt * 5);
    }
  } else if (P.state === 'fly') { const k = Math.exp(-0.6 * dt); P.vx *= k; P.vz *= k; P.flySpin += dt * 13; }
  else { P.vx = P.vz = 0; }
  if (P.state === 'busy') { const b = P.busy; b.t += dt; b.update(dt, b.t); if (b.t >= b.dur) { P.busy = null; P.state = 'normal'; if (b.end) b.end(); } }

  if (P.state === 'sleep') { P.sleepT += dt; if (P.sleepT > 9) wake(); }
  else {
    pos.x += P.vx * dt; pos.z += P.vz * dt; resolvePlayer();
    const gy = groundY(pos.x, pos.z);
    P.vy -= 22 * dt; pos.y += P.vy * dt;
    if (pos.y <= gy || (P.onGround && P.vy <= 0.01 && pos.y - gy < 0.16 + Math.hypot(P.vx, P.vz) * dt * 1.6)) {   // cuesta abajo no despega
      if (P.vy < -5) { T.poke(-3.2); if (gy < -0.2) { burst('splash', pos.x, 0.3, pos.z, 8); SFX.splash(); } }
      pos.y = gy; P.vy = 0; P.onGround = true; if (P.state === 'fly') land();
    } else P.onGround = false;
    const wet = gy < -0.2 && pos.y < gy + 0.15;
    if (wet && !P.inWater) { burst('splash', pos.x, 0.3, pos.z, 6); SFX.splash(); say(P, '¡Splash!', 1.2); }
    P.inWater = wet;
    if (wet && Math.hypot(P.vx, P.vz) > 1 && Math.random() < dt * 7) emit('splash', pos.x + rand(-0.4, 0.4), 0.25, pos.z + rand(-0.4, 0.4));
    if (P.state === 'flat') { P.flatT -= dt; if (P.flatT <= 0) getUp(); }
  }
  T.group.rotation.y = P.heading;
  P.inHouse = pos.x > HOUSE.x0 + 0.1 && pos.x < HOUSE.x1 - 0.1 && pos.z > HOUSE.z0 + 0.25 && pos.z < HOUSE.z1 - 0.2;
  P.speedN = Math.hypot(P.vx, P.vz) / 5.2;

  // marearse: el puntero da vueltas a su alrededor
  if (P.spin !== 0) { const dec = dt * 1.6; P.spin = Math.abs(P.spin) <= dec ? 0 : P.spin - Math.sign(P.spin) * dec; }
  const wob = clamp((Math.abs(P.spin) - 3) / 9.5, 0, 1);
  if (Math.abs(P.spin) > 12.5 && P.state === 'normal' && T.mood !== 'mareado') makeDizzy(5.5);
  const st = { speed: P.onGround ? P.speedN : 0.25, air: !P.onGround && P.state !== 'sleep', wobble: wob, spinY: P.state === 'fly' ? P.flySpin : 0, near: true };
  if (ptr.active && clock - ptr.moveT < 2.5 && P.state !== 'sleep') {
    const k = Math.cos(P.heading), sc = Math.max(30, pScreen.r * 3);
    st.lookX = clamp((ptr.x - pScreen.x) / sc, -1, 1) * (k >= 0 ? 1 : -1); st.lookY = clamp(-(ptr.y - (pScreen.y - pScreen.r * 0.3)) / sc, -1, 1);
  }
  T.update(dt, st);
}

const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), _cp = new THREE.Vector3(), _ct = new THREE.Vector3(); let camInit = false, camSlope = 0.7;
// Adelanto: la cámara mira hacia donde camina Tamachin, sobre todo al sur, donde la vista es corta (la cámara está al sur).
// Metros a zoom 1 y fuera de casa. Solo cambia mientras camina: al detenerse se conserva, para poder mirar lo que viene.
const LEAD = { south: 4.4, north: 1.4, side: 0.35, grow: 1.6, maxRate: 5, house: 0.3 };
const camLead = { x: 0, z: 0, k: 1 }, CAM_D0 = Math.hypot(7.6, 11.2), CAM_SLOPE0 = 7.6 / 11.2;
function updateLead(dt) {
  const P = player;
  if ((P.state === 'normal' && P.idleT === 0 && !ui.closeup) || P.state === 'fly') {
    const halfW = Math.tan(camera.fov * Math.PI / 360) * camera.aspect * CAM_D0;           // medio ancho visible a la distancia de Tamachin
    const gx = clamp(P.vx / 8.6, -1, 1) * LEAD.side * halfW;
    const gz = P.vz > 0 ? Math.min(P.vz / 5.2, 1.66) * LEAD.south : Math.max(P.vz / 5.2, -1.66) * LEAD.north;
    const k = 1 - Math.exp(-LEAD.grow * dt), mx = LEAD.maxRate * dt;
    camLead.x += clamp((gx - camLead.x) * k, -mx, mx); camLead.z += clamp((gz - camLead.z) * k, -mx, mx);
  }
  camLead.k = damp(camLead.k, P.inHouse ? LEAD.house : 1, 3, dt);
}
function updateCamera(dt) {
  const P = player, wide = VW > 760, sc = P.T.scale; let oy, oz, ox = 0, tx = P.pos.x, ty, tz = P.pos.z;
  const base = P.pos.z < NORTH_Z ? Math.max(0, groundY(P.pos.x, P.pos.z)) : 0;   // en las montañas la cámara sigue al suelo
  ui.zoom = damp(ui.zoom, ui.zoomTarget, 6, dt);
  if (!camInit) camLead.x = camLead.z = 0;
  updateLead(dt);
  if (ui.closeup) { oy = 0.5; oz = 5.8; ty = P.pos.y + 0.78 * sc; if (wide) tx += 1.3; else { oy = 2.5; oz = 6.4; ty = P.pos.y - 0.5; } }
  else {
    const z = ui.zoom; if (P.inHouse) { oy = 8.4 * Math.min(z, 1.1); oz = 7.2 * Math.min(z, 1.1); } else { oy = 7.6 * z; oz = 11.2 * z; } ty = base + (Math.max(P.pos.y, -0.3) - base) * 0.6 + 1.25;
    const f = z * camLead.k, xl = xLimitAt(P.pos.z); tx = clamp(tx + camLead.x * f, -xl, xl); tz = Math.min(tz + camLead.z * f, LIMIT);   // sin mirar más allá del borde
  }
  if (P.state === 'busy' && P.busy.cam) { const c = P.busy.cam; tx = c.x; ty = c.y; tz = c.z; ox = c.ox || 0; oy = c.oy; oz = c.oz; }   // toma cercana (el refri)
  _ct.set(tx, ty, tz); _cp.set(tx + ox, ty + oy, tz + oz);
  if (P.pos.z < NORTH_Z + 15) {                                     // bajando una ladera la cámara queda cuesta arriba: se sube lo necesario
    let lift = 0;
    const fy = P.pos.y + 0.3;                                     // desde los pies: que se vea entero, no solo la cabeza
    for (let i = 1; i <= 10; i++) { const k = i / 10, need = groundY(lerp(P.pos.x, _cp.x, k), lerp(P.pos.z, _cp.z, k)) + 0.35 + 0.8 * k - lerp(fy, _cp.y, k); if (need > 0) lift = Math.max(lift, need / k); }
    _cp.y += lift;
  }
  if (!camInit) { camPos.copy(_cp); camTgt.copy(_ct); camInit = true; }
  else { const k = 1 - Math.exp(-(ui.closeup ? 4 : 5.5) * dt); camPos.lerp(_cp, k); camTgt.lerp(_ct, k); }
  if (P.pos.z < NORTH_Z + 15) camPos.y = Math.max(camPos.y, groundY(camPos.x, camPos.z) + 1.5);   // nunca dentro del cerro
  camSlope = (camPos.y - ty) / Math.max(1, camPos.z - P.pos.z);    // pendiente real del rayo cámara→Tamachin (con adelanto y retraso)
  camera.position.copy(camPos); camera.lookAt(camTgt);
  skyMesh.position.copy(camPos);
  sun.target.position.set(P.pos.x, base, P.pos.z - 6); sun.position.copy(sun.target.position).add(SUN_OFF);
  _sv.set(P.pos.x, P.pos.y + 0.75 * sc, P.pos.z).project(camera);
  pScreen.x = (_sv.x * 0.5 + 0.5) * VW; pScreen.y = (-_sv.y * 0.5 + 0.5) * VH; pScreen.r = pxRadius(P.pos.x, P.pos.y + 0.75 * sc, P.pos.z, 0.75 * sc);
}

// ¿El rayo cámara→Tamachin pasa sobre la planta del edificio por debajo de su altura? sx: deriva lateral del rayo por metro hacia el sur.
// Edificio al sur de Tamachin: margen amplio (2.2 m), como siempre. Edificio a un lado: solo si el rayo entra (pasa con el adelanto lateral).
function rayCrosses(o, x, z, sx, back) {
  const m = o.z0 - z > -0.3 ? 2.2 : 0.8;
  let a = Math.max(0, o.z0 - z), b = Math.min(o.z1 - z, back);                   // tramo en dz (metros al sur de Tamachin)
  const w = o.x0 - m - (m < 1 ? o.padW : 0), e = o.x1 + m + (m < 1 ? o.padE : 0);   // a un lado cuenta el toldo, si lo hay
  if (Math.abs(sx) > 1e-4) { const p = (w - x) / sx, q = (e - x) / sx; a = Math.max(a, Math.min(p, q)); b = Math.min(b, Math.max(p, q)); }
  else if (x < w || x > e) return false;
  return a <= b && a * camSlope < o.h + 1.5;
}
function fadeMat(m, op) { m.opacity = op; const tr = op < 0.985; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } }
const treeDirty = [false, false], GRASS_P = 2000 / 260;
function updateScenery(dt) {
  const P = player, x = P.pos.x, z = P.pos.z;
  // Las pruebas siguen el rayo real cámara→Tamachin: con el adelanto la cámara puede quedar más lejos y de lado.
  const back = Math.max(1, camPos.z - z), rayX = (dz) => x + (camPos.x - x) * Math.max(0, dz) / back;   // x del rayo a dz metros al sur
  // casa: sin techo ni fachada cuando Tamachin está dentro; transparente cuando pasa por detrás
  const inside = P.inHouse, behind = !inside && z < HOUSE.z0 + 0.6 && (HOUSE.z0 - z) * camSlope < 7.5 && Math.abs(rayX(HOUSE.z0 - z)) < 9.5;
  house.oWalls = damp(house.oWalls, behind ? 0.16 : 1, 9, dt); house.oFront = damp(house.oFront, inside ? 0 : behind ? 0.12 : 1, 9, dt); house.oRoof = damp(house.oRoof, inside ? 0 : behind ? 0.12 : 1, 9, dt);
  fadeMat(house.mWalls, house.oWalls); fadeMat(house.mFront, house.oFront); fadeMat(house.mRoof, house.oRoof); fadeMat(house.doorMat, house.oFront);
  house.front.visible = house.oFront > 0.03; house.roof.visible = house.oRoof > 0.03; house.doorPivot.visible = house.oFront > 0.03;
  house.roof.castShadow = house.oRoof > 0.5; house.front.castShadow = house.oFront > 0.5;
  house.doorA = damp(house.doorA, Math.hypot(x, z + 4.1) < 3.3 ? 1.8 : 0, 7, dt); house.doorPivot.rotation.y = house.doorA;
  if (house.tvOn) house.tvMat.color.setHSL((clock * 0.23) % 1, 0.7, 0.55 + Math.sin(clock * 9) * 0.08);
  // edificios que tapan a Tamachin
  for (const o of occluders) {
    if (o.op > 0.996 && Math.abs((o.z0 + o.z1) / 2 - z) > 70) continue;           // lejos (en casa o en Valle Alegre)
    const dz = o.z0 - z, rx = rayX(dz), hide = ui.closeup ? dz > -0.3 && dz < 7 && rx > o.x0 - 2.2 && rx < o.x1 + 2.2 : rayCrosses(o, x, z, (camPos.x - x) / back, back);
    const t = hide ? 0.13 : 1; if (Math.abs(o.op - t) < 0.004) continue;
    o.op = damp(o.op, t, 9, dt); for (const m of o.mats) fadeMat(m, o.op);
  }
  // árboles: se agachan si quedan entre la cámara y Tamachin
  const reach = ui.closeup ? 1 : Math.max(1, CAM_SLOPE0 / camSlope);   // con el rayo más plano, tapan árboles más lejanos
  for (const t of trees) {
    const dz = t.z - z; let target = 1;
    if (dz > 0.5 && dz < (2.4 + TREE_H[t.type] * t.s) * reach && Math.abs(t.x - rayX(dz)) < TREE_R[t.type] * t.s + 0.9) target = 0.28;
    if (Math.abs(t.k - target) > 0.004) { t.k = damp(t.k, target, 9, dt); setTreeMatrix(t); treeDirty[t.type] = true; }
  }
  for (let i = 0; i < 2; i++) if (treeDirty[i]) { treeMesh[i].instanceMatrix.needsUpdate = true; treeDirty[i] = false; }
  duckU.uDuck.value.set(x, z, camPos.x, camPos.z); duckU.uDuckR.value = reach;     // los del norte se agachan en el shader
  ground.position.set(Math.round(x / GRASS_P) * GRASS_P, 0, -100 + Math.round((z + 100) / GRASS_P) * GRASS_P);   // el pasto sigue a Tamachin sin que se mueva el dibujo
  windmill.rotation.z -= dt * 0.9;
  waterTex.offset.y -= dt * 0.16;
  flames.forEach((f, i) => { const k = 1 + Math.sin(clock * (9 + i * 3) + i) * 0.16; f.scale.y = (1.1 - i * 0.2) * k; f.rotation.y += dt * 2; });
  for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 300) c.position.x = -300; }
}

function zoneName() {
  const P = player, x = P.pos.x, z = P.pos.z;
  if (P.inHouse) return 'Casa de Tamachin';
  if (z < NORTH_Z) {
    if (z < Z_FOREST2) return 'Bosque sin fin · ' + Math.max(1, Math.round(Z_FOREST2 - z)) + ' m';
    if (z < Z_TOWN_N) return 'Prado del bosque sin fin';
    if (z < Z_TOWN_S) return Math.abs(x) > 20 ? 'Valle Alegre' : z < TOWN_Z - 26 ? 'Posada de Valle Alegre' : z > TOWN_Z + 26 ? 'Mercado de Valle Alegre' : 'Plaza de Valle Alegre';
    for (const p of PEAKS) if (Math.hypot(x - p.x, z - p.z) < 34) return 'Cima del ' + p.name;
    return P.pos.y < 4 ? 'Valle de las montañas' : 'Montañas · ' + Math.round(P.pos.y) + ' m de altura';
  }
  if (z <= FOREST_Z) return P.inWater ? 'Río del bosque' : onBridge(x, z) ? 'Puente del río' : Math.hypot(x - CAMP.x, z - CAMP.z) < 8 ? 'Claro de la fogata' : 'Bosque';
  if (z < -63) return 'Camino · bosque a ' + Math.max(1, Math.round(z - FOREST_Z)) + ' m';
  if (Math.abs(x) < 20 && Math.abs(z) < 20) return 'Jardín de casa';
  if (Math.abs(x) < 20 && z < -28) return 'Parque';
  return 'Ciudad';
}
const zoneEl = $('#zone'), promptEl = $('#prompt'), promptText = $('#promptText'), tAct = $('#tAct');
let hudT = 0, lastZone = '', lastPrompt = null;
function updateHud(dt) {
  const P = player; let best = null, bd = Infinity;
  if (P.state === 'normal' && !ui.closeup) {
    for (const it of interacts) { const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z); if (d < it.range && d < bd && (!it.ok || it.ok())) { bd = d; best = it; } }
    const fp = forestPlantNear(P.pos.x, P.pos.z); if (fp && Math.hypot(fp.x - P.pos.x, fp.z - P.pos.z) < bd) best = fp.act || (fp.act = { pos: fp, range: fp.range, label: 'Comer ' + FRUITS[fp.kind].name, act: () => eatPlant(fp) });
  }
  curInteract = best;
  const label = P.state === 'sleep' ? 'Despertar' : best ? (typeof best.label === 'function' ? best.label() : best.label) : null;
  if (label !== lastPrompt) { lastPrompt = label; promptEl.hidden = !label; promptText.textContent = label || ''; tAct.textContent = label || 'Truco'; }
  hudT -= dt; if (hudT <= 0) { hudT = 0.2; const zn = zoneName(); if (zn !== lastZone) { lastZone = zn; zoneEl.textContent = zn; document.documentElement.style.setProperty('--hud-h', topEl.offsetHeight + 'px'); } syncNeedsHud(); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
  if (!helpEl.hidden && P.moved > 14) helpEl.hidden = true;
  if (homeArmed && clock > homeArmed) { homeArmed = 0; bHome.textContent = 'Volver al inicio'; }   // se pasó el segundo toque
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  if (w === VW && h === VH) return; VW = w; VH = h;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.8 ? 60 : 48; camera.updateProjectionMatrix();
  document.documentElement.style.setProperty('--hud-h', topEl.offsetHeight + 'px');   // en teléfono la barra de arriba ocupa varias filas
}
const topEl = $('.top');
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  if (document.hidden) return;
  resize(); clock += dt;
  updateLights(clock); updateCars(dt, clock); updatePlayer(dt); updateNPCs(dt);
  for (const c of creatures) if (c.buddy || c.follow > 0 || Math.abs(c.pos.z - player.pos.z) < 90) c.update(dt);   // el conejo de Tofu vive en la ciudad
  updateFish(dt); updateNeeds(dt); updateQuests(dt); updateBerries(dt); updateFridge(dt); updateNorth(dt);
  updateButterflies(dt); updateScenery(dt); updateCamera(dt); updateParticles(dt); updateHud(dt); updateBubbles(VW, VH);
  renderer.render(scene, camera);
}

// ───────────────────────── arranque ─────────────────────────
function boot(data) {
  let s = {}; try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { s = {}; }
  s = Object.assign(s, data || {});
  if (s.color) player.T.setColor(s.color); if (s.shape && SHAPES[s.shape]) player.T.setShape(s.shape);
  if (s.mood && MOODS[s.mood] && !MOODS[s.mood].hidden) player.baseMood = s.mood;
  if (s.needs) for (const k in needs) if (typeof s.needs[k] === 'number' && isFinite(s.needs[k])) needs[k] = clamp(s.needs[k], 0, 1);
  if (s.quests) for (const k in quests) if (s.quests[k] === 1 || s.quests[k] === 2) quests[k] = s.quests[k];
  if (Array.isArray(s.summits)) for (const n of s.summits) { const p = PEAKS.find((q) => q.name === n); if (p && !summits.includes(n)) { summits.push(n); p.reached = true; } }
  if (Array.isArray(s.fruits)) for (const k of s.fruits) if (FRUITS[k] && !fruitsTasted.includes(k)) fruitsTasted.push(k);
  restoreQuests();
  if (typeof s.x === 'number' && typeof s.z === 'number' && isFinite(s.x) && isFinite(s.z)) { player.pos.set(s.x, 0, s.z); resolvePlayer(); player.pos.y = groundY(player.pos.x, player.pos.z); }   // donde se quedó
  if (typeof s.heading === 'number' && isFinite(s.heading)) player.heading = s.heading;
  applyMood(); syncPanel();
  resize(); updateCamera(0.016);
  player.T.doTrick('wave'); say(player, '¡Hola! Soy Tamachin.', 4);
  requestAnimationFrame(frame);
}
// lo que dejó hecho un encargo sigue así al volver
function restoreQuests() {
  if (quests.conejo === 2) { const r = creatures.find((c) => c.kind === 'conejo'); giveRabbit(r); r.pos.set(tofu.pos.x + 1.2, 0, tofu.pos.z + 1); }
  if (quests.fuente === 2) { lulu.loop = null; lulu.home = LULU_SPOT; lulu.pos.set(LULU_SPOT.x, 0, LULU_SPOT.z); lulu.heading = LULU_SPOT.ry; }
  if (quests.gelatina === 2) { nube.mood0 = 'contento'; nube.T.setMood('contento'); }
}
window.addEventListener('pagehide', () => save());
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => ({ shape: player.T.shape, color: player.T.color, mood: player.baseMood, x: player.pos.x, z: player.pos.z }));
window.__tamachin = { player, cars, npcs, ui, togglePanel, makeDizzy, go: (x, z) => { player.pos.set(x, 0, z); camInit = false; } };
if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
