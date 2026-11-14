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
