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
};
const PMAT = {};
for (const k in PTEX) PMAT[k] = new THREE.SpriteMaterial({ map: PTEX[k], transparent: true, depthWrite: false });
const PDEF = {
  heart: { vy: 1.3, grav: -0.2, life: 1.5, size: 0.42, spread: 0.5 }, star: { vy: 2.6, grav: 5, life: 1.0, size: 0.4, spread: 2.2 },
  spark: { vy: 1.4, grav: 0, life: 0.8, size: 0.36, spread: 1.4 }, zzz: { vy: 0.8, grav: -0.1, life: 1.9, size: 0.4, spread: 0.25 },
  excl: { vy: 1.0, grav: 0, life: 0.9, size: 0.5, spread: 0 }, note: { vy: 1.2, grav: -0.1, life: 1.5, size: 0.42, spread: 0.6 },
  tear: { vy: 0.2, grav: 5, life: 0.9, size: 0.24, spread: 0.3 }, puff: { vy: 1.1, grav: -0.4, life: 0.9, size: 0.6, spread: 0.6 },
  splash: { vy: 3.2, grav: 9, life: 0.7, size: 0.22, spread: 1.8 },
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
const FOREST_Z = -160, WORLD_N = -262, LIMIT = 61.3;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pathX = (z) => 5 * Math.sin((-z - 62) / 20) * sstep(12, 30, Math.abs(z + 205));
const riverZ = (x) => -205 + 6 * Math.sin(x / 16) + 2.5 * Math.sin(x / 7 + 1);
const RIVER_HALF = 4.4;
const BR = { x: 0, z: riverZ(0) };
const onBridge = (x, z) => Math.abs(x - BR.x) < 1.9 && Math.abs(z - BR.z) < 7.6;
function riverDepth(x, z) { if (z > -186 || z < -224) return 0; const d = RIVER_HALF - Math.abs(z - riverZ(x)); return d <= 0 ? 0 : -0.55 * Math.min(1, d / 1.3); }
function groundY(x, z) { if (onBridge(x, z)) { const u = (z - BR.z) / 7.6; return 0.8 * (1 - u * u); } return riverDepth(x, z); }
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
function shopfront(w) {
  const b = new Batch(), aw = Math.min(w - 1.2, 8), hue = pick(AWN);
  b.box('#fbf7ee', 0, 1.6, 0.03, aw, 3.2, 0.1);
  b.box('#6b4a35', -aw / 2 + 0.95, 1.1, 0.1, 1.1, 2.2, 0.1).box('#ffd76a', -aw / 2 + 1.33, 1.1, 0.17, 0.08, 0.08, 0.06);
  b.box('#ffffff', 0.52, 1.45, 0.08, aw - 2.0, 1.7, 0.1).box('#bfe6ff', 0.52, 1.45, 0.11, aw - 2.3, 1.4, 0.1);
  b.box(hue, 0, 2.95, 0.62, aw + 0.3, 0.14, 1.3, 0, 0.3).box('#ffffff', 0, 2.72, 1.2, aw + 0.3, 0.22, 0.06);
  b.box(hue, 0, 3.85, 0.1, aw * 0.5, 0.62, 0.16).box('#ffffff', 0, 3.85, 0.19, aw * 0.5 - 0.3, 0.3, 0.03);
  return b;
}
const occluders = [];
function building(x0, x1, z0, z1, h, fronts) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, si = Math.floor(rnd() * WALLS.length);
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const tx = Math.max(1, Math.round(w / 2.7)) / 4, tz = Math.max(1, Math.round(d / 2.7)) / 4, ty = Math.max(1, Math.round(h / 3)) / 4;
  for (let i = 0; i < 24; i++) { const f = i >> 2; if (f === 2 || f === 3) continue; uv.setXY(i, uv.getX(i) * (f < 2 ? tz : tx), uv.getY(i) * ty); }
  const side = new THREE.MeshLambertMaterial({ map: winTex[si] }), roof = new THREE.MeshLambertMaterial({ color: new THREE.Color(WALLS[si]).multiplyScalar(0.66) });
  const m = new THREE.Mesh(g, [side, side, roof, roof, side, side]); m.position.set(cx, h / 2, cz); m.castShadow = m.receiveShadow = true; scene.add(m);
  const b = new Batch(), trim = new THREE.Color(WALLS[si]).multiplyScalar(0.8).getHex();
  b.box(trim, cx, h + 0.2, z0 + 0.15, w + 0.3, 0.5, 0.3).box(trim, cx, h + 0.2, z1 - 0.15, w + 0.3, 0.5, 0.3);
  b.box(trim, x0 + 0.15, h + 0.2, cz, 0.3, 0.5, d - 0.3).box(trim, x1 - 0.15, h + 0.2, cz, 0.3, 0.5, d - 0.3);
  b.box('#8d8894', cx, 0.25, cz, w + 0.14, 0.5, d + 0.14);
  const k = rnd(), ox = rr(-w * 0.2, w * 0.2), oz = rr(-d * 0.2, d * 0.2);
  if (k < 0.38) { b.cyl('#c9b79c', cx + ox, h + 1.5, cz + oz, 1.1, 1.1, 1.6, 12).cone('#8a6a4a', cx + ox, h + 2.65, cz + oz, 1.3, 0.7, 12); for (const a of [0.8, 2.4, 4, 5.6]) b.cyl('#6b5a4a', cx + ox + Math.cos(a) * 0.8, h + 0.35, cz + oz + Math.sin(a) * 0.8, 0.07, 0.07, 0.7, 6); }
  else if (k < 0.72) { b.box('#d7dbe0', cx + ox, h + 0.5, cz + oz, 1.6, 1.0, 1.2).box('#b9bec6', cx + ox + 2, h + 0.4, cz + oz + 0.5, 1.1, 0.8, 1.1).cyl('#9aa0aa', cx + ox - 1.6, h + 1.2, cz + oz - 0.8, 0.05, 0.05, 2.4, 6); }
  else { b.box('#9a6540', cx + ox, h + 0.25, cz + oz, w * 0.45, 0.5, d * 0.4).ico('#57c06a', cx + ox - 0.8, h + 0.9, cz + oz, 0.75).ico('#62cc76', cx + ox + 0.9, h + 0.85, cz + oz + 0.3, 0.65).sph('#ff6b9d', cx + ox, h + 0.7, cz + oz - 0.4, 0.2); }
  for (const f of fronts) b.merge(shopfront(f.w), f.x, 0, f.z, f.ry);
  const pm = new THREE.MeshLambertMaterial({ vertexColors: true }); scene.add(b.mesh(pm));
  solidBox(x0, x1, z0, z1);
  occluders.push({ x0, x1, z0, z1, h, mats: [side, roof, pm], op: 1 });
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
  furnB.rbox('#8fd9c8', 5.15, 1.15, -12.25, 1.1, 2.3, 1.0, 0.14).box('#ffffff', 4.72, 1.5, -11.73, 0.07, 0.6, 0.06).box('#6fbfae', 5.15, 0.78, -11.745, 1.02, 0.03, 0.02); solidBox(4.6, 5.7, -12.75, -11.75);
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
  return { walls, front, roof, mWalls, mFront, mRoof, doorPivot, doorMat, tvMat, tvOn: false, oWalls: 1, oFront: 1, oRoof: 1, doorA: 0 };
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

scene.add(cityB.mesh(), gardenB.mesh(), parkB.mesh(), meadowB.mesh(), forestB.mesh());

// colinas y nubes de fondo
{ const b = new Batch();
  for (let z = -40; z >= -320; z -= 70) for (const sx of [-1, 1]) b.ico(pick(['#86cc68', '#7cc260', '#92d473']), sx * rr(118, 150), -22, z + rr(-15, 15), rr(48, 62), rr(40, 52), rr(48, 62), 2);
  for (let x = -150; x <= 150; x += 75) b.ico('#7cc260', x + rr(-15, 15), -24, -335, rr(55, 70), rr(46, 60), 55, 2);
  for (const q of [[-190, -360, 95], [-60, -420, 130], [80, -400, 110], [210, -350, 90], [-250, -180, 80], [250, -150, 85]]) b.cone('#93a8c9', q[0], q[2] / 2 - 4, q[1], q[2] * 0.75, q[2], 7).cone('#f4f8ff', q[0], q[2] * 0.82 - 4, q[1], q[2] * 0.272, q[2] * 0.36, 7);
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
function addNPC(o) {
  const T = makeTamachin({ shape: o.shape, color: o.color, mood: o.mood, scale: o.scale || rr(1.0, 1.22) });
  const n = { T, name: o.name, kind: 'vecino', loop: o.loop || null, t: o.loop ? rnd() * o.loop.L : rnd() * 9, dir: rnd() < 0.5 ? 1 : -1, speed: rr(1.4, 2.1) * (MOODS[o.mood].speed || 1),
    pause: rr(0, 3), heading: rnd() * TAU, talkT: 0, lines: o.lines || null, li: 0, home: o.home || null, mood0: o.mood, cheer: 0, count: 0, pos: T.pos, bubblePos: T.bubblePos };
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
  const T = n.T; n.talkT = 3.4; let line;
  if ((n.mood0 === 'triste' || n.mood0 === 'enojado') && T.mood === n.mood0 && ++n.count >= 2) {
    n.count = 0; T.setMood('contento'); n.cheer = 25; line = '¡Gracias por escucharme! Ya me siento mejor.';
    burst('heart', n.pos.x, 1.8, n.pos.z, 5); SFX.nice();
  } else line = n.lines ? n.lines[n.li++ % n.lines.length] : choose(LINES[T.mood] || LINES.contento);
  say(n, line, 3.4); SFX.talk(); T.doTrick(T.mood === 'dormido' ? 'giggle' : choose(['hop', 'wave', 'giggle']));
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
  const o = { kind: 'conejo', mesh, pos: mesh.position, home: { x, z }, tx: x, tz: z, hopP: 0, hopSpeed: 0, rest: 0, wait: rand(0, 3), follow: 0, scare: 0, heading: rand(0, TAU), side: rand(-1, 1), range: 5, clickR: 0.6 };
  o.bubblePos = (v) => v.set(o.pos.x, o.pos.y + 1.25, o.pos.z);
  o.update = (dt) => {
    const P = player.pos, dxp = P.x - o.pos.x, dzp = P.z - o.pos.z, dp = Math.hypot(dxp, dzp);
    o.follow = Math.max(0, o.follow - dt); o.scare = Math.max(0, o.scare - dt);
    if (o.follow > 0) { o.tx = P.x - Math.sin(player.heading) * 1.7 + o.side; o.tz = P.z - Math.cos(player.heading) * 1.7; }
    else if (dp < 3.2 && player.speedN > 1.3 && o.scare <= 0) { o.tx = o.pos.x - dxp / dp * 5; o.tz = o.pos.z - dzp / dp * 5; o.scare = 2; o.rest = 0; emit('excl', o.pos.x, 1.1, o.pos.z); }
    else if (o.scare <= 0) { o.wait -= dt; if (o.wait <= 0) { o.wait = rand(2, 6); const a = rand(0, TAU), r = rand(0, o.range); o.tx = o.home.x + Math.cos(a) * r; o.tz = o.home.z + Math.sin(a) * r; } }
    const dx = o.tx - o.pos.x, dz = o.tz - o.pos.z, d = Math.hypot(dx, dz);
    if (o.hopP > 0) {
      o.hopP += dt / 0.36; const k = Math.min(1, o.hopP);
      o.pos.x += Math.sin(o.heading) * o.hopSpeed * dt; o.pos.z += Math.cos(o.heading) * o.hopSpeed * dt; o.pos.x = clamp(o.pos.x, -60, 60);
      o.pos.y = Math.sin(k * Math.PI) * 0.4; mesh.rotation.x = -Math.cos(k * Math.PI) * 0.28;
      if (o.hopP >= 1) { o.hopP = 0; o.pos.y = 0; mesh.rotation.x = 0; o.rest = (o.follow > 0 || o.scare > 0) ? 0.03 : rand(0.1, 0.35); }
    } else {
      o.rest -= dt;
      if (d > 0.8) {
        o.heading += angDiff(o.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
        if (o.rest <= 0) {
          const sp = (o.follow > 0 || o.scare > 0) ? clamp(d / 0.36, 3, 8) : 2.6;
          if (wetAt(o.pos.x + Math.sin(o.heading) * sp * 0.4, o.pos.z + Math.cos(o.heading) * sp * 0.4)) { o.rest = 0.6; o.tx = o.pos.x; o.tz = o.pos.z; }
          else { o.hopP = 0.001; o.hopSpeed = sp; }
        }
      } else if (dp < 4.5) o.heading += angDiff(o.heading, Math.atan2(dxp, dzp)) * Math.min(1, dt * 5);
    }
    mesh.rotation.y = o.heading;
  };
  o.interact = () => { o.follow = 12; o.scare = 0; burst('heart', o.pos.x, 0.9, o.pos.z, 3); say(o, choose(['¡Hop, hop!', '(mueve la naricita)', '¡Te sigo!']), 2.2); SFX.nice(); };
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
  if (player.pos.z > -150) return;
  for (const f of fishes) {
    f.t += dt;
    if (f.t < 0) continue;
    if (!f.m.visible) { f.x = clamp(player.pos.x + rand(-22, 22), -58, 58); if (Math.abs(f.x - BR.x) < 3) f.x += 6; f.dir = Math.random() < 0.5 ? 1 : -1; f.z0 = riverZ(f.x) - f.dir * 1.6; f.m.visible = true; burst('splash', f.x, 0.2, f.z0, 4); }
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

// ───────────────────────── Tamachin (jugador) ─────────────────────────
const SAVE_KEY = 'tamachin.v1';
const player = { T: makeTamachin({ shape: 'bola', color: '#ffc93c', mood: 'contento', scale: 1.3 }), vx: 0, vz: 0, vy: 0, heading: 0, onGround: true, state: 'normal', r: 0.62,
  baseMood: 'contento', tempMood: null, tempT: 0, onTempEnd: null, inv: 0, idleT: 0, speedN: 0, spin: 0, flySpin: 0, flatT: 0, sleepT: 0, inWater: false, inHouse: false, lastTrick: null, moved: 0 };
player.pos = player.T.pos; player.pos.set(0, 0, 3.5); player.bubblePos = player.T.bubblePos;
const ui = { closeup: false, zoom: 1, zoomTarget: 1, zoomIdx: 0 };
const ZOOMS = [1, 0.62, 1.42], ZOOM_LABEL = ['Acercar', 'Alejar', 'Vista normal'];
const ptr = { x: 0, y: 0, active: false, moveT: -9, a: 0, hasA: false, down: false, sx: 0, sy: 0, st: 0, id: null };
const pScreen = { x: 0, y: 0, r: 40 };
const joy = { x: 0, y: 0, id: null };
const keys = {};
let VW = 1, VH = 1, curInteract = null;

function applyMood() { player.T.setMood(player.tempMood || player.baseMood); }
function setTemp(mood, dur, onEnd) { player.tempMood = mood; player.tempT = dur; player.onTempEnd = onEnd || null; applyMood(); }
function clearTemp() { player.tempMood = null; player.tempT = 0; player.onTempEnd = null; applyMood(); }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ shape: player.T.shape, color: player.T.color, mood: player.baseMood })); } catch (e) { /* sin almacenamiento */ } }

const TRICKS = ['hop', 'spin', 'flip', 'dance', 'wave', 'giggle', 'wink'];
const TRICK_SAY = { hop: '¡Yupi!', spin: '¡Wiii!', flip: '¡Mira esto!', dance: '¡A bailar!', wave: '¡Hola, hola!', giggle: '¡Ji, ji, ji!', wink: '¡Guiño!' };
function playerTrick() {
  const P = player, T = P.T; if (P.state !== 'normal') return;
  if (T.mood === 'mareado') { say(P, '¡Uy… no me empujes!', 1.6); T.poke(3); return; }
  let t; do { t = choose(TRICKS); } while (t === P.lastTrick); P.lastTrick = t; let line = TRICK_SAY[t];
  if (T.mood === 'dormido') { t = 'giggle'; line = 'Mmm… cinco minutos más…'; }
  else if (T.mood === 'triste') { t = choose(['giggle', 'wave']); line = '…gracias por el mimo.'; }
  else if (T.mood === 'enojado') { t = choose(['spin', 'hop']); line = '¡Hmpf! ¡No me piques!'; }
  T.doTrick(t); T.poke(t === 'giggle' ? 2 : 4); say(P, line, 1.8); SFX.pop();
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
function goSleep() {
  const P = player; P.state = 'sleep'; P.sleepT = 0; P.vx = P.vz = P.vy = 0; P.pos.set(-4.4, 1.46, -9.85); P.heading = 0; P.T.lie = 1;
  setTemp('dormido', 999); say(P, 'Zzz…', 2);
}
function wake() {
  const P = player; if (P.state !== 'sleep' || P.sleepT < 0.8) return;
  P.state = 'normal'; P.T.lie = 0; P.pos.set(-2.7, 0, -10.4); clearTemp(); P.T.doTrick('hop'); say(P, '¡Qué buena siesta!', 2); SFX.nice();
}

// cosas con las que se puede interactuar
for (const n of npcs) interacts.push({ pos: n.pos, range: 3.1, label: 'Hablar con ' + n.name, act: () => talkTo(n), who: n });
interacts.push({ pos: { x: -2.8, z: -10.5 }, range: 1.7, label: 'Dormir una siesta', act: goSleep });
interacts.push({ pos: { x: 5.1, z: -11.2 }, range: 1.7, label: 'Abrir el refri', act: () => {
  const P = player; say(P, choose(['¡Ñam! Gelatina de mango.', '¡Ñam! Un tamalito recién hecho.', '¡Glup! Juguito de sandía.', '¡Mmm! Helado de vainilla.']), 2.4);
  P.T.doTrick('giggle'); burst('heart', P.pos.x, 1.9, P.pos.z, 4); SFX.nice(); if (P.baseMood !== 'contento') setTemp('contento', 4); } });
interacts.push({ pos: { x: -3.1, z: -6.6 }, range: 1.7, label: () => (house.tvOn ? 'Apagar la tele' : 'Encender la tele'), act: () => {
  house.tvOn = !house.tvOn; if (house.tvOn) { say(player, '¡Oh, mi programa favorito!', 2.2); setTemp('asombrado', 2.2); SFX.pop(); } else house.tvMat.color.set(0x15151c); } });
interacts.push({ pos: { x: 0, z: -45 }, range: 4.4, label: 'Pedir un deseo', act: () => {
  const P = player; say(P, choose(['Deseo… ¡un helado gigante!', 'Deseo… ¡que nunca llueva en domingo!', 'Deseo… ¡un amigo conejo!', 'Deseo… ¡ojos todavía más grandes!']), 2.8);
  burst('spark', 0, 2.6, -45, 8); burst('splash', 0, 2.3, -45, 6); P.T.doTrick('hop'); SFX.nice(); } });
interacts.push({ pos: { x: CAMP.x, z: CAMP.z }, range: 2.7, label: 'Calentarse en la fogata', act: () => {
  const P = player; say(P, '¡Qué calientito!', 2.2); burst('spark', CAMP.x, 1.3, CAMP.z, 6); P.T.doTrick('dance'); if (P.baseMood !== 'contento') setTemp('contento', 5); } });
interacts.push({ pos: { x: 2.5, z: 15.4 }, range: 1.7, label: 'Abrir el buzón', act: () => {
  say(player, choose(['Una carta: «Ven al bosque, hay peces saltarines».', 'Una postal del búho: «Uuh, uuh».', 'Un volante: «Gelatina a mitad de precio».', 'El buzón está vacío… ¡y huele a flores!']), 3.2); SFX.pop(); } });

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
  if (c === 'Space') jump(); else if (c === 'KeyE' || c === 'Enter') doAction(); else if (c === 'KeyC') togglePanel(); else if (c === 'Escape' && ui.closeup) togglePanel(false);
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
function setMood(k) { player.baseMood = k; if (player.state !== 'sleep') clearTemp(); player.T.poke(3); SFX.pop(); syncPanel(); save(); }
const panelEl = $('#panel'), bCustom = $('#bCustom');
function togglePanel(on) {
  if (on === undefined) on = panelEl.hidden;
  if (on && player.state === 'sleep') wake();
  panelEl.hidden = !on; ui.closeup = on; document.body.classList.toggle('custom', on); bCustom.setAttribute('aria-expanded', String(on)); bCustom.textContent = on ? 'Volver al mundo' : 'Personalizar';
  if (on) { syncPanel(); for (const k in keys) keys[k] = false; }
}
bCustom.addEventListener('click', () => togglePanel()); $('#pClose').addEventListener('click', () => togglePanel(false));
const bZoom = $('#bZoom'), bSound = $('#bSound'), helpEl = $('#help');
bZoom.addEventListener('click', () => { ui.zoomIdx = (ui.zoomIdx + 1) % 3; ui.zoomTarget = ZOOMS[ui.zoomIdx]; bZoom.textContent = ZOOM_LABEL[ui.zoomIdx]; });
bSound.addEventListener('click', () => { snd.on = !snd.on; bSound.textContent = snd.on ? 'Sonido: sí' : 'Sonido: no'; bSound.setAttribute('aria-pressed', String(snd.on)); if (snd.on) { unlockAudio(); SFX.pop(); } });
$('#helpOk').addEventListener('click', () => { helpEl.hidden = true; });

// ───────────────────────── actualización por cuadro ─────────────────────────
function resolvePlayer() {
  const P = player, pos = P.pos, r = P.r;
  for (let it = 0; it < 2; it++) { for (const b of boxes) pushOutBox(pos, r, b); for (const c of circles) pushOutCircle(pos, r, c.x, c.z, c.r); }
  if (pos.z > -66) for (const c of cars) {
    if (pos.y < c.h * 0.8 && pushOutBox(pos, r * 0.8, carRect(c, 0)) && c.v > 2.2 && P.state === 'normal' && P.inv <= 0) knock(c);
  }
  for (const n of npcs) pushOutCircle(pos, r, n.pos.x, n.pos.z, 0.5 * n.T.scale);
  pos.x = clamp(pos.x, -LIMIT, LIMIT); pos.z = clamp(pos.z, WORLD_N, LIMIT);
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
  const speed = (run ? 8.6 : 5.2) * (m.speed || 1) * (P.inWater ? 0.55 : 1);
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

  if (P.state === 'sleep') { P.sleepT += dt; if (P.sleepT > 9) wake(); }
  else {
    pos.x += P.vx * dt; pos.z += P.vz * dt; resolvePlayer();
    const gy = groundY(pos.x, pos.z);
    P.vy -= 22 * dt; pos.y += P.vy * dt;
    if (pos.y <= gy || (P.onGround && P.vy <= 0.01 && pos.y - gy < 0.16)) {
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
function updateCamera(dt) {
  const P = player, wide = VW > 760, sc = P.T.scale; let oy, oz, tx = P.pos.x, ty, tz = P.pos.z;
  ui.zoom = damp(ui.zoom, ui.zoomTarget, 6, dt);
  if (ui.closeup) { oy = 0.5; oz = 5.8; ty = P.pos.y + 0.78 * sc; if (wide) tx += 1.3; else { oy = 2.5; oz = 6.4; ty = P.pos.y - 0.5; } }
  else { const z = ui.zoom; if (P.inHouse) { oy = 8.4 * Math.min(z, 1.1); oz = 7.2 * Math.min(z, 1.1); } else { oy = 7.6 * z; oz = 11.2 * z; } ty = Math.max(P.pos.y, -0.3) * 0.6 + 1.25; }
  camSlope = oy / oz;
  _ct.set(tx, ty, tz); _cp.set(tx, ty + oy, tz + oz);
  if (!camInit) { camPos.copy(_cp); camTgt.copy(_ct); camInit = true; }
  else { const k = 1 - Math.exp(-(ui.closeup ? 4 : 5.5) * dt); camPos.lerp(_cp, k); camTgt.lerp(_ct, k); }
  camera.position.copy(camPos); camera.lookAt(camTgt);
  skyMesh.position.copy(camPos);
  sun.target.position.set(P.pos.x, 0, P.pos.z - 6); sun.position.copy(sun.target.position).add(SUN_OFF);
  _sv.set(P.pos.x, P.pos.y + 0.75 * sc, P.pos.z).project(camera);
  pScreen.x = (_sv.x * 0.5 + 0.5) * VW; pScreen.y = (-_sv.y * 0.5 + 0.5) * VH; pScreen.r = pxRadius(P.pos.x, P.pos.y + 0.75 * sc, P.pos.z, 0.75 * sc);
}

function fadeMat(m, op) { m.opacity = op; const tr = op < 0.985; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } }
const treeDirty = [false, false];
function updateScenery(dt) {
  const P = player, x = P.pos.x, z = P.pos.z;
  // casa: sin techo ni fachada cuando Tamachin está dentro; transparente cuando pasa por detrás
  const inside = P.inHouse, behind = !inside && z < HOUSE.z0 + 0.6 && z > HOUSE.z0 - 11 && Math.abs(x) < 9.5;
  house.oWalls = damp(house.oWalls, behind ? 0.16 : 1, 9, dt); house.oFront = damp(house.oFront, inside ? 0 : behind ? 0.12 : 1, 9, dt); house.oRoof = damp(house.oRoof, inside ? 0 : behind ? 0.12 : 1, 9, dt);
  fadeMat(house.mWalls, house.oWalls); fadeMat(house.mFront, house.oFront); fadeMat(house.mRoof, house.oRoof); fadeMat(house.doorMat, house.oFront);
  house.front.visible = house.oFront > 0.03; house.roof.visible = house.oRoof > 0.03; house.doorPivot.visible = house.oFront > 0.03;
  house.roof.castShadow = house.oRoof > 0.5; house.front.castShadow = house.oFront > 0.5;
  house.doorA = damp(house.doorA, Math.hypot(x, z + 4.1) < 3.3 ? 1.8 : 0, 7, dt); house.doorPivot.rotation.y = house.doorA;
  if (house.tvOn) house.tvMat.color.setHSL((clock * 0.23) % 1, 0.7, 0.55 + Math.sin(clock * 9) * 0.08);
  // edificios que tapan a Tamachin
  if (z > -70) for (const o of occluders) {
    const dz = o.z0 - z, hide = dz > -0.3 && x > o.x0 - 2.2 && x < o.x1 + 2.2 && (ui.closeup ? dz < 7 : dz * camSlope < o.h + 1.5);
    const t = hide ? 0.13 : 1; if (Math.abs(o.op - t) < 0.004) continue;
    o.op = damp(o.op, t, 9, dt); for (const m of o.mats) fadeMat(m, o.op);
  }
  // árboles: se agachan si quedan entre la cámara y Tamachin
  for (const t of trees) {
    const dz = t.z - z; let target = 1;
    if (dz > 0.5 && dz < 2.4 + TREE_H[t.type] * t.s && Math.abs(t.x - x) < TREE_R[t.type] * t.s + 0.9) target = 0.28;
    if (Math.abs(t.k - target) > 0.004) { t.k = damp(t.k, target, 9, dt); setTreeMatrix(t); treeDirty[t.type] = true; }
  }
  for (let i = 0; i < 2; i++) if (treeDirty[i]) { treeMesh[i].instanceMatrix.needsUpdate = true; treeDirty[i] = false; }
  windmill.rotation.z -= dt * 0.9;
  waterTex.offset.y -= dt * 0.16;
  flames.forEach((f, i) => { const k = 1 + Math.sin(clock * (9 + i * 3) + i) * 0.16; f.scale.y = (1.1 - i * 0.2) * k; f.rotation.y += dt * 2; });
  for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 300) c.position.x = -300; }
}

function zoneName() {
  const P = player, x = P.pos.x, z = P.pos.z;
  if (P.inHouse) return 'Casa de Tamachin';
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
  if (P.state === 'normal' && !ui.closeup) for (const it of interacts) { const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z); if (d < it.range && d < bd) { bd = d; best = it; } }
  curInteract = best;
  const label = P.state === 'sleep' ? 'Despertar' : best ? (typeof best.label === 'function' ? best.label() : best.label) : null;
  if (label !== lastPrompt) { lastPrompt = label; promptEl.hidden = !label; promptText.textContent = label || ''; tAct.textContent = label || 'Truco'; }
  hudT -= dt; if (hudT <= 0) { hudT = 0.2; const zn = zoneName(); if (zn !== lastZone) { lastZone = zn; zoneEl.textContent = zn; } }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
  if (!helpEl.hidden && P.moved > 14) helpEl.hidden = true;
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  if (w === VW && h === VH) return; VW = w; VH = h;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.8 ? 60 : 48; camera.updateProjectionMatrix();
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  if (document.hidden) return;
  resize(); clock += dt;
  updateLights(clock); updateCars(dt, clock); updatePlayer(dt); updateNPCs(dt);
  if (player.pos.z < -40) { for (const c of creatures) c.update(dt); updateFish(dt); }
  updateButterflies(dt); updateScenery(dt); updateCamera(dt); updateParticles(dt); updateHud(dt); updateBubbles(VW, VH);
  renderer.render(scene, camera);
}

// ───────────────────────── arranque ─────────────────────────
function boot(data) {
  let s = {}; try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { s = {}; }
  s = Object.assign(s, data || {});
  if (s.color) player.T.setColor(s.color); if (s.shape && SHAPES[s.shape]) player.T.setShape(s.shape);
  if (s.mood && MOODS[s.mood] && !MOODS[s.mood].hidden) player.baseMood = s.mood;
  if (typeof s.x === 'number' && typeof s.z === 'number') { player.pos.set(clamp(s.x, -LIMIT, LIMIT), 0, clamp(s.z, WORLD_N, LIMIT)); resolvePlayer(); }
  applyMood(); syncPanel();
  resize(); updateCamera(0.016);
  player.T.doTrick('wave'); say(player, '¡Hola! Soy Tamachin.', 4);
  requestAnimationFrame(frame);
}
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => ({ shape: player.T.shape, color: player.T.color, mood: player.baseMood, x: player.pos.x, z: player.pos.z }));
window.__tamachin = { player, cars, npcs, ui, togglePanel, makeDizzy, go: (x, z) => { player.pos.set(x, 0, z); camInit = false; } };
if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
