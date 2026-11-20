
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

// ───────────────────────── carretera a Valle Alegre ─────────────────────────
// Sale de la ciudad por donde estaba el túnel del noroeste, rodea el molino por el oeste, cruza el bosque y el río (con su puente) y entra
// a la boca sur del túnel de las montañas (mundos/tunel.js). Del otro lado, `ROAD_N` va de la boca norte a la entrada de Valle Alegre.
// Son datos puros (nada de `rnd`): curvas suaves por los puntos de control, con un punto cada metro. `roadAt(R, d, o)` da el punto a `d`
// metros del principio, su rumbo (tx, tz) y la normal hacia la derecha de quien va de ida (nx, nz). 8 m de ancho, carriles a ±2 m.
const ROAD_HALF = RW + 0.28;                                         // el asfalto y sus orillas blancas, como las calles
function roadPath(ctrl) {
  const fine = [];
  for (let i = 0; i < ctrl.length - 1; i++) {                       // Catmull-Rom por los puntos de control
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < 40; k++) {
      const t = k / 40, t2 = t * t, t3 = t2 * t, c = (a, b, c2, d) => 0.5 * (2 * b + (c2 - a) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (3 * b - a - 3 * c2 + d) * t3);
      fine.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  fine.push(ctrl[ctrl.length - 1]);
  const xs = [fine[0][0]], zs = [fine[0][1]]; let acc = 0, want = 1;  // otra vez, un punto cada metro
  for (let i = 1; i < fine.length; i++) {
    const a = fine[i - 1], b = fine[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + l >= want) { const t = (want - acc) / l; xs.push(lerp(a[0], b[0], t)); zs.push(lerp(a[1], b[1], t)); want++; }
    acc += l;
  }
  const n = xs.length, R = { x: new Float32Array(xs), z: new Float32Array(zs), tx: new Float32Array(n), tz: new Float32Array(n), n, len: n - 1 };
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = R.x[b] - R.x[a], dz = R.z[b] - R.z[a], l = Math.hypot(dx, dz) || 1; R.tx[i] = dx / l; R.tz[i] = dz / l; }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (let i = 0; i < n; i++) { x0 = Math.min(x0, R.x[i]); x1 = Math.max(x1, R.x[i]); z0 = Math.min(z0, R.z[i]); z1 = Math.max(z1, R.z[i]); }
  R.box = { x0, x1, z0, z1 }; return R;
}
function roadAt(R, d, o) {
  const f = clamp(d, 0, R.len), i = Math.min(R.n - 2, Math.floor(f)), t = f - i;
  o.x = lerp(R.x[i], R.x[i + 1], t); o.z = lerp(R.z[i], R.z[i + 1], t);
  let tx = lerp(R.tx[i], R.tx[i + 1], t), tz = lerp(R.tz[i], R.tz[i + 1], t); const l = Math.hypot(tx, tz) || 1; o.tx = tx / l; o.tz = tz / l; o.nx = -o.tz; o.nz = o.tx;
  return o;
}
// la ciudad termina en z −62; la boca sur está en z −280 y la carretera sigue 10 m adentro (ahí se pierden los autos)
const ROAD_FACE = -280, ROAD = roadPath([[-24, -62], [-24, -76], [-31, -92], [-36, -106], [-36, -120], [-30, -136], [-24, -152], [-24, -170], [-24, ROAD_FACE - 10]]);
const ROAD_N_FACE = { x: 34, z: -1262 }, ROAD_N = roadPath([[34, -1252], [34, -1266], [30, -1274], [20, -1280], [9, -1281]]);
// qué tan lejos está (x, z) del centro de la carretera (de cualquiera de las dos); Infinity si está a más de `d`
function roadDist(x, z, d) {
  let best = Infinity;
  for (const R of [ROAD, ROAD_N]) {
    const b = R.box; if (x < b.x0 - d || x > b.x1 + d || z < b.z0 - d || z > b.z1 + d) continue;
    for (let i = 0; i < R.n - 1; i++) {
      const ax = R.x[i], az = R.z[i]; if (Math.abs(az - z) > d + 1.5 || Math.abs(ax - x) > d + 1.5) continue;
      const ex = R.x[i + 1] - ax, ez = R.z[i + 1] - az, L2 = ex * ex + ez * ez, t = L2 ? clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1) : 0;
      best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
    }
  }
  return best <= d ? best : Infinity;
}
const nearRoad = (x, z, d) => roadDist(x, z, d) <= d;
// El puente de la carretera sobre el río: la losa sube 0.75 m sobre el agua y baja en rampas hasta 12.5 m de su centro.
const RB = { x: -24, z: riverZ(-24), hw: 4.6, flat: 6.5, end: 12.5, h: 0.75 };
const onRoadBridge = (x, z) => Math.abs(x - RB.x) < RB.hw && Math.abs(z - RB.z) < RB.end;
const roadBridgeY = (z) => RB.h * sstep(RB.end, RB.flat, Math.abs(z - RB.z));
function groundY(x, z) {   // montañas: 05-norte.js
  if (z < NORTH_Z) return terrainY(x, z);
  if (onBridge(x, z)) { const u = (z - BR.z) / 7.6; return 0.8 * (1 - u * u); }
  if (onRoadBridge(x, z)) return roadBridgeY(z);
  return riverDepth(x, z);
}
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

// lo que se pinta en el suelo de la ciudad, también para los pasos (stepSurface, 06-main.js): [x0, z0, x1, z1]
const blockRect = (i, j) => [BLOCKS[i][0] + (i > 0 ? 2.8 : 0.6), BLOCKS[j][0] + (j > 0 ? 2.8 : 0.6), BLOCKS[i][1] - (i < 2 ? 2.8 : 0.6), BLOCKS[j][1] - (j < 2 ? 2.8 : 0.6)];
const LAWNS = [blockRect(1, 1), blockRect(1, 0)];                  // el jardín de la casa y el parque; lo demás de la ciudad es piso
const SAND_PATHS = [[-1.1, -4, 1.1, 17.4], [-1.1, -3.4, 10.1, -1.8], [8.4, -15.8, 10.1, -1.8], [-0.85, -15.8, 10.1, -14.2], [-0.85, -17.4, 0.85, -14.2], [10.1, -3.4, 17.4, -1.8],   // jardín
  [-1.3, -62.6, 1.3, -27.2], [-17.2, -46.3, 17.2, -43.7]];        // parque, y su plaza redonda:
const PARK_PLAZA = { x: 0, z: -45, r: 6.3 };
const cityTex = canvasTex(2048, 2048, (g, S) => {
  const K = S / 128, X = (x) => (x + 64) * K, Z = (z) => (z + 64) * K;
  const rect = (x0, z0, x1, z1, fill) => { g.fillStyle = fill; g.fillRect(X(x0), Z(z0), (x1 - x0) * K, (z1 - z0) * K); };
  const SAND = '#ecdcb4', ASPH = '#4b4e5a', WHITE = '#f4f1e8';
  rect(-64, -64, 64, 64, '#8fd16b');
  rect(-62.6, -62.6, 62.6, 62.6, '#ddd6c6');
  g.strokeStyle = 'rgba(120,110,95,.2)'; g.lineWidth = 1.5; g.beginPath();
  for (let v = -62; v <= 62; v += 1.3) { g.moveTo(X(v), Z(-62.6)); g.lineTo(X(v), Z(62.6)); g.moveTo(X(-62.6), Z(v)); g.lineTo(X(62.6), Z(v)); }
  g.stroke();
  BLOCKS.forEach((bx, i) => BLOCKS.forEach((bz, j) => rect(...blockRect(i, j), i === 1 && j < 2 ? (j === 1 ? '#93d470' : '#8bd06c') : '#cfc7b6')));
  for (const p of SAND_PATHS) rect(...p, SAND);                    // senderos del jardín y del parque
  g.fillStyle = SAND; g.beginPath(); g.arc(X(PARK_PLAZA.x), Z(PARK_PLAZA.z), PARK_PLAZA.r * K, 0, TAU); g.fill();
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
// las ventanas que se prenden de noche: mismas casillas que winTex (4 × 4), unas sí y otras no; tres versiones con su propia semilla
const WIN_GLOW = [0, 1, 2].map((k) => { const R = mulberry(3170 + k); return canvasTex(256, 256, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 4; cy++) {
    if (R() < 0.42) continue;
    const x = cx * 64 + 13, y = cy * 64 + 9, gr = g.createLinearGradient(0, y, 0, y + 44), w = R() < 0.25 ? '#ffe7b0' : '#ffd27a';
    gr.addColorStop(0, w); gr.addColorStop(1, '#e99a4c'); g.fillStyle = gr; g.fillRect(x, y, 38, 44);
    g.fillStyle = '#000'; g.fillRect(x + 17.5, y, 3, 44);
  }
}); });
const occluders = [];
function building(x0, x1, z0, z1, h, fronts, R) {                // R: semilla propia (Valle Alegre); sin ella, la de casa
  R = R || rnd; const RR = (a, b) => a + (b - a) * R();
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, si = Math.floor(R() * WALLS.length);
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const tx = Math.max(1, Math.round(w / 2.7)) / 4, tz = Math.max(1, Math.round(d / 2.7)) / 4, ty = Math.max(1, Math.round(h / 3)) / 4;
  for (let i = 0; i < 24; i++) { const f = i >> 2; if (f === 2 || f === 3) continue; uv.setXY(i, uv.getX(i) * (f < 2 ? tz : tx), uv.getY(i) * ty); }
  const side = new THREE.MeshLambertMaterial({ map: winTex[si], emissiveMap: WIN_GLOW[si % 3], emissive: 0x000000 }), roof = new THREE.MeshLambertMaterial({ color: new THREE.Color(WALLS[si]).multiplyScalar(0.66) });
  const m = new THREE.Mesh(g, [side, side, roof, roof, side, side]); m.position.set(cx, h / 2, cz); m.castShadow = m.receiveShadow = true; scene.add(m); LIT_WALLS.push(side);
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
  occluders.push({ x0, x1, z0, z1, h, mats: [side, roof, pm], walls: side, k: 1, padW: pad(-Math.PI / 2), padE: pad(Math.PI / 2), padN: pad(Math.PI), padS: pad(0) });
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
        cityB.merge(PF_LAMP, x, 0, z, s.ry); solidCircle(x, z, 0.18); lampAt(x, z, s.ry);
        const q = rnd(), ox = s.ax === 'x' ? 1.6 : 0, oz = s.ax === 'x' ? 0 : 1.6;
        // se sube saltando; como son delgados y Tamachin es redondo, lo sostienen aunque quede un poco fuera de la orilla (`rim`)
        if (q < 0.3) { cityB.merge(PF_HYDRANT, x + ox, 0, z + oz, 0); Object.assign(solidCircle(x + ox, z + oz, 0.22, 0.8), { rim: 0.25, step: 'metal' }); }   // `step`: cómo suenan los pasos encima
        else if (q < 0.6) { cityB.merge(PF_BIN, x + ox, 0, z + oz, 0); Object.assign(solidCircle(x + ox, z + oz, 0.34, 0.96), { rim: 0.25, step: 'metal' }); }
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

// túneles en los extremos de las calles y setos alrededor de la ciudad. Al noroeste no hay túnel: ahí sale la carretera.
for (const r of ROADS) {
  if (r > 0) { cityB.merge(PF_PORTAL, r, 0, -60, Math.PI); solidBox(r - 5, r + 5, -64, -59.5); solidCircle(r, -71, 10.9); }
  cityB.merge(PF_PORTAL, r, 0, 60, 0); solidBox(r - 5, r + 5, 59.5, 64);
  cityB.merge(PF_PORTAL, -60, 0, r, -Math.PI / 2); solidBox(-64, -59.5, r - 5, r + 5);
  cityB.merge(PF_PORTAL, 60, 0, r, Math.PI / 2); solidBox(59.5, 64, r - 5, r + 5);
}
// Qué tan alto es el borde de la ciudad en (x, z): setos (2.4 m con sus bultos), túneles (4.9 m) y la loma detrás de cada uno
// (una esfera de 11 m de radio hundida 2.5 m). Con la cámara baja, updateCamera la sube lo necesario para ver por encima. También
// las bocas del túnel de la carretera, al pie de la montaña (05-norte.js las agrega a PORTALS).
const PORTALS = ROADS.flatMap((r) => [[r, -60, 0, -1], [r, 60, 0, 1], [-60, r, -1, 0], [60, r, 1, 0]]).filter((p) => !(p[0] < 0 && p[1] === -60));   // x, z y hacia fuera
function edgeTop(x, z) {
  const ax = Math.abs(x), az = Math.abs(z); if (ax < 59 && az < 59) return 0;
  let h = (ax > 62.2 && ax < 64.2 && az < 64.2) || (az > 62.2 && az < 64.2 && ax < 64.2) ? 2.4 : 0;
  for (const [px, pz, nx, nz] of PORTALS) {
    const w = (x - px) * nx + (z - pz) * nz, u = (x - px) * nz - (z - pz) * nx, d2 = u * u + (w - 11) * (w - 11);
    if (Math.abs(u) < 5.3 && w > -0.7 && w < 10.6) h = Math.max(h, 4.9);
    if (d2 < 121) h = Math.max(h, Math.sqrt(121 - d2) - 2.5);
  }
  return h;
}
const HEDGE = '#4fae5a', HEDGE2 = '#5fc06a';
// `gap`: [desde, hasta] a lo largo del seto donde no hay seto (la salida a la carretera). Los bultos de ahí se sortean igual: un `rr` de
// menos movería todo lo que se genera después.
function hedge(x0, z0, x1, z1, gap) {
  const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = Math.hypot(x1 - x0, z1 - z0);
  const box = (a, b) => { if (b - a < 0.01) return; const cx = lerp(x0, x1, (a + b) / 2 / len), cz = lerp(z0, z1, (a + b) / 2 / len); cityB.rbox(HEDGE, cx, 0.9, cz, horiz ? b - a : 1.6, 1.8, horiz ? 1.6 : b - a, 0.5); };
  if (gap) { box(0, gap[0]); box(gap[1], len); } else box(0, len);
  for (let d = 2; d < len - 1; d += rr(3, 5)) { const t = d / len, sx = rr(0.8, 1.1), sy = rr(0.5, 0.7), sz = rr(0.8, 1.0); if (!gap || d < gap[0] - 0.6 || d > gap[1] + 0.6) cityB.ico(HEDGE2, lerp(x0, x1, t), 1.7, lerp(z0, z1, t), sx, sy, sz); }
}
const EXIT = { x0: -29.4, x1: -18.6 };                               // la salida a la carretera, en el seto norte
hedge(-64, -63.2, -5, -63.2, [EXIT.x0 + 64, EXIT.x1 + 64]); hedge(5, -63.2, 64, -63.2); hedge(-64, 63.2, 64, 63.2); hedge(-63.2, -64, -63.2, 64); hedge(63.2, -64, 63.2, 64);
solidBox(-64, EXIT.x0, -64.2, -62.4); solidBox(EXIT.x1, -4.9, -64.2, -62.4); solidBox(4.9, 64, -64.2, -62.4);
for (const sx of [-1, 1]) { cityB.rbox(STONE, sx * 5.1, 1.4, -63.2, 1.3, 2.8, 1.9, 0.2).sph('#ffd76a', sx * 5.1, 3.15, -63.2, 0.42); LAMPS.push({ x: sx * 5.1, y: 3.15, z: -63.2, r: 0.45, pool: false }); }
for (const x of [EXIT.x0 - 0.2, EXIT.x1 + 0.2]) { cityB.rbox(STONE, x, 1.4, -63.2, 1.3, 2.8, 1.9, 0.2).sph('#ffd76a', x, 3.15, -63.2, 0.42); LAMPS.push({ x, y: 3.15, z: -63.2, r: 0.45, pool: false }); }
// letreros verdes de carretera (sin `rnd`: los usan la salida y las bocas del túnel); ry 0 mira al sur
const roadSignTex = (text) => canvasTex(512, 160, (g, W, Hh) => {
  g.fillStyle = '#1f7a4d'; g.fillRect(0, 0, W, Hh); g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.strokeRect(12, 12, W - 24, Hh - 24);
  let fs = 80; g.textAlign = 'center'; g.textBaseline = 'middle';
  do { g.font = '900 ' + fs + 'px Nunito, "Trebuchet MS", Arial, sans-serif'; fs -= 4; } while (g.measureText(text).width > W - 70 && fs > 20);
  g.fillStyle = '#ffffff'; g.fillText(text, W / 2, Hh / 2 + 4);
});
function roadSign(B, text, x, y0, z, w, ry) {
  const tex = roadSignTex(text), h = w * 160 / 512, c = Math.cos(ry || 0), s = Math.sin(ry || 0), m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x + s * 0.07, y0 + 2.6, z + c * 0.07); m.rotation.y = ry || 0; scene.add(m);
  B.box('#14573a', x, y0 + 2.6, z, w + 0.1, h + 0.1, 0.1, ry || 0);
  for (const sx of [-1, 1]) { const px = x + c * sx * w * 0.36 - s * 0.1, pz = z - s * sx * w * 0.36 - c * 0.1; B.cyl('#8a8f99', px, y0 + 1.25, pz, 0.06, 0.06, 2.5, 8); solidCircle(px, pz, 0.12); }
}
roadSign(cityB, 'Valle Alegre ↑', -16.6, 0, -66.5, 3.2);

// ───────────────────────── la casa de Tamachin ─────────────────────────
const house = (() => {
  const H = HOUSE, WT = 0.3, WALL = '#fff0cf', ROOF = '#f0625a', cz = (H.z0 + H.z1) / 2;
  const mk = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  const wallsB = new Batch(), frontB = new Batch(), roofB = new Batch(), furnB = new Batch(), shelfB = new Batch();   // shelfB: lo alto pegado a la pared norte, se transparenta con las paredes
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
    .sph('#ffffff', -4.4, 0.92, -12.1, 0.62, 0.17, 0.36).box('#9a6540', -4.4, 0.9, -12.56, 2.2, 1.3, 0.14); Object.assign(solidBox(-5.5, -3.3, -12.6, -9.2, 0.86), { bounce: true, step: 'cama' });   // la cama rebota
  furnB.box('#b07a4f', -2.8, 0.35, -12.3, 0.7, 0.7, 0.6).cyl('#8a6a4a', -2.8, 0.9, -12.3, 0.04, 0.1, 0.4, 8).cone('#ffe9a8', -2.8, 1.25, -12.3, 0.28, 0.36, 12); solidBox(-3.15, -2.45, -12.6, -12.0);
  shelfB.box('#9a6540', -0.9, 1.2, -12.5, 2.4, 2.4, 0.5);
  for (let lv = 0; lv < 3; lv++) { let x = -1.95; while (x < 0.05) { const w = rr(0.12, 0.24), hh = rr(0.42, 0.6); shelfB.box(pick(['#ff6b6b', '#ffd23f', '#4fc3a1', '#5aa9ff', '#c58bff', '#ff9f6b', '#f4f1e8']), x + w / 2, 0.32 + lv * 0.72 + hh / 2, -12.3, w, hh, 0.3); x += w + 0.02; } shelfB.box('#b98552', -0.9, 0.28 + lv * 0.72, -12.28, 2.3, 0.06, 0.42); }
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
  furnB.sph('#ff6b9d', -1.0, 0.3, -10.6, 0.26); shelfB.cyl('#fff', 4.0, 2.7, H.z0 + WT + 0.04, 0.36, 0.36, 0.06, 20, Math.PI / 2).cyl('#3b4252', 4.0, 2.7, H.z0 + WT + 0.08, 0.04, 0.04, 0.02, 8, Math.PI / 2);
  // de noche: las ventanas de afuera, el foco del porche y las dos lámparas de adentro se prenden (nightMat, 01-core.js)
  // se cortan con la casa (su plano, abajo) y las de la fachada se esconden con ella cuando Tamachin entra (glowFront, updateScenery)
  const glowWin = nightMat(0xffd88a, 0.92), glowFront = [];
  { const win = glowWin, gw = new THREE.PlaneGeometry(1.62, 1.32);
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(gw, win); m.position.set(sx * 3.6, 1.95, fz + WT / 2 + 0.05); scene.add(m); glowFront.push(m); }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 1.02), win); back.rotation.y = Math.PI; back.position.set(2.9, 2.3, H.z0 - 0.05); scene.add(back);
    LAMPS.push({ x: 1.6, y: 2.5, z: H.z1 + 0.12, r: 0.19, pool: false, porch: true });   // el del porche se esconde con la fachada
    const shade = nightMat(0xffe2a0, 0.85);
    for (const [x, y, z, r, h] of [[-5.3, 1.9, -4.75, 0.37, 0.47], [-2.8, 1.25, -12.3, 0.31, 0.39]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.01, r, h, 14, 1, true), shade); m.position.set(x, y, z); scene.add(m); }   // sobre las pantallas cónicas
  }
  const mWalls = mk(), mFront = mk(), mRoof = mk(), mShelf = mk();
  const walls = wallsB.mesh(mWalls), front = frontB.mesh(mFront), roof = roofB.mesh(mRoof); scene.add(walls, front, roof, furnB.mesh(), shelfB.mesh(mShelf));
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
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);   // corte a media altura cuando estorba (06-main.js)
  glowWin.clippingPlanes = [plane];
  return { walls, front, roof, mWalls, mFront, mRoof, mShelf, plane, cutMats: [mWalls, mShelf, mFront, mRoof, doorMat], cutWalls: [mWalls, mFront], doorPivot, doorMat, glowFront, tvMat, tvOn: false, oWalls: 1, oFront: 1, oRoof: 1, doorA: 0, fridge };
})();

// jardín
const gardenB = new Batch();
function fence(b, x0, z0, x1, z1, col) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.4)), horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i <= n; i++) { const t = i / n; b.box(col, lerp(x0, x1, t), 0.48, lerp(z0, z1, t), 0.14, 0.96, 0.14).cone(col, lerp(x0, x1, t), 1.03, lerp(z0, z1, t), 0.11, 0.16, 4, Math.PI / 4); }
  for (const y of [0.34, 0.72]) b.box(col, cx, y, cz, horiz ? len : 0.07, 0.1, horiz ? 0.07 : len);
  solidBox(Math.min(x0, x1) - 0.08, Math.max(x0, x1) + 0.08, Math.min(z0, z1) - 0.08, Math.max(z0, z1) + 0.08, 1.0, false);   // se brinca, no se para encima
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
  for (const q of [[-3.2, -37], [3.2, -37], [-3.2, -54], [3.2, -54]]) { parkB.merge(PF_LAMP, q[0], 0, q[1], q[0] < 0 ? 0 : Math.PI); solidCircle(q[0], q[1], 0.18); lampAt(q[0], q[1], q[0] < 0 ? 0 : Math.PI); }
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
  m.position.set(x, 2.25, z + 0.08); scene.add(m);
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
for (let q = 0; q < 34; q++) { const x = rr(-60, 60), z = rr(-260, -162); if (freeSpot(x, z, 2.6)) { const s = rr(0.4, 1.1); rocks.push({ x, z, s }); if (s > 0.7) solidCircle(x, z, s * 0.75, s).step = 'piedra'; } }   // a las grandes se sube saltando (su punta está a s metros)
for (let q = 0; q < 150; q++) { const x = rr(-60, 60), z = rr(-260, -162); if (freeSpot(x, z, 1.9)) addFlower(x, z); }
for (let q = 0; q < 380; q++) { const x = rr(-60, 60), z = rr(-262, -160); if (freeSpot(x, z, 1.8)) tufts.push({ x, z, s: rr(0.9, 1.7) }); }
for (let q = 0; q < 34; q++) {
  const x = rr(-58, 58), z = rr(-258, -164); if (!freeSpot(x, z, 2.2)) continue; const s = rr(0.7, 1.3), red = rnd() < 0.7;
  if (nearRoad(x, z, ROAD_HALF + 0.6)) continue;                    // en la carretera no (ya se sortearon sus números)
  forestB.cyl('#fff1d6', x, 0.16 * s, z, 0.07 * s, 0.1 * s, 0.32 * s, 8).sph(red ? '#ef4b4b' : '#ffb347', x, 0.33 * s, z, 0.24 * s, 0.15 * s, 0.24 * s)
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
  const x = rr(-60, 60); if (Math.abs(x) < 5) continue; const z = riverZ(x) + rr(-3.6, 3.6), under = Math.abs(x - RB.x) < RB.hw + 1;   // bajo el puente de la carretera no
  if (q % 3 === 0) { const a = rr(0.35, 0.7), b = rr(0.25, 0.4), c = rr(0.35, 0.6), ry = rnd() * 3; if (!under) forestB.rock('#b9b3a6', x, 0.1, z, a, b, c, ry); }
  else if (!under) forestB.cyl('#58b368', x, 0.1, z, 0.42, 0.42, 0.03, 12).sph(q % 2 ? '#ff8fb1' : '#ffffff', x + 0.1, 0.16, z, 0.1, 0.07, 0.1);
}
for (let q = 0; q < 46; q++) { const x = rr(-60, 60); if (Math.abs(x) < 4) continue; const z = riverZ(x) + (rnd() < 0.5 ? -1 : 1) * rr(4.5, 5.3), h = rr(0.8, 1.5); if (Math.abs(x - RB.x) < RB.hw + 0.8) continue; forestB.cyl('#6cbf5a', x, h / 2, z, 0.025, 0.04, h, 5).cyl('#7a4f32', x, h + 0.08, z, 0.05, 0.05, 0.26, 6); }
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
// fogata: seis troncos en tipi (con la punta quemada) sobre ceniza y carbón; dos leños de repuesto al lado. Llamas, chispas y humo
// son partículas (campfire, abajo; se mueven en updateCampfire, 06-main.js).
{ const lean = -Math.atan2(0.5, 0.78), LOG = new Batch().cyl('#5d3a22', 0, 0.39, 0.25, 0.06, 0.085, 1.05, 7, lean).cyl('#231a16', 0, 0.706, 0.048, 0.058, 0.068, 0.3, 7, lean);
  for (let k = 0; k < 6; k++) forestB.merge(LOG, CAMP.x, 0, CAMP.z, k * TAU / 6 + 0.3);
  forestB.cyl('#4b4541', CAMP.x, 0.035, CAMP.z, 0.78, 0.82, 0.07, 18).cyl('#2e2a28', CAMP.x, 0.075, CAMP.z, 0.5, 0.56, 0.03, 16);
  forestB.cyl('#6b4a35', CAMP.x - 0.2, 0.1, CAMP.z + 1.45, 0.09, 0.1, 0.95, 8, Math.PI / 2, 1.35).cyl('#5d3a22', CAMP.x + 0.1, 0.1, CAMP.z + 1.68, 0.08, 0.09, 0.85, 8, Math.PI / 2, 1.75); }
solidCircle(CAMP.x, CAMP.z, 1.1);
for (const q of [[-3.6, 0.6, 0.3], [3.2, 1.6, -0.5], [0.4, 3.9, 1.5]]) { forestB.cyl(TRUNK, CAMP.x + q[0], 0.36, CAMP.z + q[1], 0.36, 0.36, 2.2, 10, Math.PI / 2, q[2]); solidCircle(CAMP.x + q[0], CAMP.z + q[1], 0.75); }
const STUMP = { x: CAMP.x + 4.2, z: CAMP.z - 3.2 };
forestB.cyl(TRUNK, STUMP.x, 0.55, STUMP.z, 0.5, 0.62, 1.1, 12).cyl('#d9b98a', STUMP.x, 1.11, STUMP.z, 0.46, 0.46, 0.03, 12); solidCircle(STUMP.x, STUMP.z, 0.66);   // encima vive el búho
// Partículas de la fogata: tres Points con un shader propio (tamaño en metros, color, opacidad y giro por partícula), una llamada de dibujo
// cada uno: las llamas tapan (normal: de día, sumar luz sobre el suelo claro las borraba), su centro y las chispas suman luz (aditivo), el
// humo tapa. No se pueden tocar con el rayo de las pruebas (raycast vacío).
const FIRE_VS = `attribute float size; attribute float alpha; attribute vec3 tint; attribute float spin;
varying float vA; varying vec3 vT; varying float vS; uniform float uH;
#include <fog_pars_vertex>
void main() { vA = alpha; vT = tint; vS = spin; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * projectionMatrix[1][1] * uH / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FIRE_FS = `uniform sampler2D map; varying float vA; varying vec3 vT; varying float vS;
#include <fog_pars_fragment>
void main() { vec2 p = gl_PointCoord - 0.5; float c = cos(vS), s = sin(vS); p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  vec4 t = texture2D(map, vec2(p.x, 1.0 - p.y)); gl_FragColor = vec4(t.rgb * vT, t.a * vA); if (gl_FragColor.a < 0.003) discard;
  #include <fog_fragment>
}`;
const FIRE_H = { value: 400 };                                   // la mitad del alto de la imagen en pixeles (06-main.js, resize)
function fireParts(n, tex, blending) {
  const g = new THREE.BufferGeometry(), A = { position: 3, size: 1, alpha: 1, tint: 3, spin: 1 };
  for (const k in A) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * A[k]), A[k]));
  const m = new THREE.ShaderMaterial({ vertexShader: FIRE_VS, fragmentShader: FIRE_FS, transparent: true, depthWrite: false, blending, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uH: { value: 400 } }]) });
  m.uniforms.map.value = tex; m.uniforms.uH = FIRE_H;
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.raycast = () => {}; scene.add(pts);
  return { pts, a: g.attributes, list: Array.from({ length: n }, () => ({ t: 1, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0, sp: 0, ph: rand(0, TAU) })) };
}
const campfire = (() => {
  const blob = canvasTex(64, 64, (g) => {                                 // llama: una gota suave, blanca (el color lo da tint)
    for (const [y, sy, r, a] of [[38, 1.3, 24, 0.7], [30, 1.6, 15, 0.9]]) {
      g.save(); g.translate(32, y); g.scale(1, sy); const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(0.5, 'rgba(255,255,255,' + a * 0.55 + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-32, -32, 64, 64); g.restore();
    }
  });
  const puff = canvasTex(64, 64, (g) => {                                 // humo: bolitas encimadas, más densas al centro
    const R = mulberry(5309);
    for (let i = 0; i < 9; i++) { const x = 32 + (R() - 0.5) * 22, y = 32 + (R() - 0.5) * 22, r = 12 + R() * 12, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  });
  const flames = fireParts(34, blob, THREE.NormalBlending), core = fireParts(15, blob, THREE.AdditiveBlending), sparks = fireParts(14, skyDot, THREE.AdditiveBlending), smoke = fireParts(16, puff, THREE.NormalBlending);
  core.pts.renderOrder = 1; smoke.pts.renderOrder = 2;                     // el centro brilla encima de las llamas; el humo, al final
  for (const p of smoke.list) p.t = rand(0, 6);                           // que no salga todo junto al llegar
  // brasas que laten en el carbón y un resplandor en el suelo (más fuerte de noche)
  const R = mulberry(4711), eb = new Batch();
  for (let i = 0; i < 16; i++) { const a = R() * TAU, r = Math.sqrt(R()) * 0.42; eb.ico(R() < 0.5 ? '#ff7a2a' : '#ffb347', CAMP.x + Math.cos(a) * r, 0.09, CAMP.z + Math.sin(a) * r, 0.05 + R() * 0.05, 0.03, 0.05 + R() * 0.05, 0); }
  const embers = new THREE.Mesh(eb.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })); embers.raycast = () => {}; scene.add(embers);
  const glowTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff9a3c, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  glow.position.set(CAMP.x, 0.06, CAMP.z); glow.raycast = () => {}; scene.add(glow);
  return { flames, core, sparks, smoke, embers, glow, on: true, sparkT: 0 };
})();
forestB.cyl(TRUNK, 24, 0.4, -250, 0.4, 0.45, 4.4, 10, Math.PI / 2, -0.9); solidBox(22.2, 25.8, -251.6, -248.4);   // un tronco caído (el otro, en (−22, −176), estaba donde pasa la carretera)
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

// ───────────────────────── la carretera: despejar y el puente ─────────────────────────
// Lo que cayó sobre la carretera se quita después de generarlo todo, también las bayas (que se acomodan según los árboles, arbustos y
// rocas): si se saltara al generarlo, cada `rnd` de menos movería todo lo que viene después. Los árboles se encogen hasta no verse,
// como en el hueco del sendero (05-norte.js); sus troncos, rocas y arbustos dejan de chocar.
{ const off = (x, z, d) => nearRoad(x, z, d);
  for (const t of trees) if (off(t.x, t.z, ROAD_HALF + 2.2)) t.s = 0.001;
  const gone = new Set();
  for (let i = circles.length; i--;) { const c = circles[i]; if (off(c.x, c.z, ROAD_HALF + 0.5 + c.r)) { gone.add(c); circles.splice(i, 1); } }
  for (let i = perches.length; i--;) if (gone.has(perches[i])) perches.splice(i, 1);
  for (const L of [bushes, rocks, tufts, flowers]) for (let i = L.length; i--;) if (off(L[i].x, L[i].z, ROAD_HALF + 0.9)) L.splice(i, 1);
}
// El puente: la losa (groundY, arriba) sobre dos muros que bajan al agua, con barandal de los dos lados. El asfalto que lo cubre es el de
// la carretera (05-norte.js), que sigue la altura del suelo.
{ const z0 = RB.z - RB.end, z1 = RB.z + RB.end, n = 26, CON = '#cfc9bd', RAIL = '#f4f1e8';
  for (let i = 0; i < n; i++) {                                      // la losa por tramos, para que siga las rampas
    const za = lerp(z0, z1, i / n), zb = lerp(z0, z1, (i + 1) / n), ya = roadBridgeY(za), yb = roadBridgeY(zb), zm = (za + zb) / 2, ym = (ya + yb) / 2;
    if (ym < 0.02) continue;
    forestB.box(CON, RB.x, ym - 0.2, zm, RB.hw * 2, 0.4, zb - za + 0.02, 0, Math.atan2(ya - yb, zb - za));
    for (const sx of [-1, 1]) forestB.box('#bdb6a8', RB.x + sx * (RB.hw - 0.12), ym + 0.12, zm, 0.24, 0.3, zb - za + 0.02, 0, Math.atan2(ya - yb, zb - za));   // la guarnición
  }
  for (const dz of [-3.2, 3.2]) for (const sx of [-1, 0, 1]) forestB.cyl(CON, RB.x + sx * 3.2, 0.1, RB.z + dz, 0.32, 0.36, 1.3, 10);   // pilares en el agua
  const r0 = RB.z - RB.flat - 1.5, r1 = RB.z + RB.flat + 1.5;
  for (const sx of [-1, 1]) {
    const x = RB.x + sx * (RB.hw - 0.12);
    for (let z = r0; z <= r1 + 0.01; z += (r1 - r0) / 8) forestB.cyl(RAIL, x, roadBridgeY(z) + 0.75, z, 0.06, 0.06, 0.9, 7);
    for (let i = 0; i < 8; i++) { const za = r0 + (r1 - r0) * i / 8, zb = r0 + (r1 - r0) * (i + 1) / 8, ya = roadBridgeY(za), yb = roadBridgeY(zb);
      for (const h of [0.75, 1.15]) forestB.box(RAIL, x, (ya + yb) / 2 + h, (za + zb) / 2, 0.08, 0.08, zb - za + 0.04, 0, Math.atan2(ya - yb, zb - za)); }
    solidBox(x - 0.15, x + 0.15, r0, r1);                              // barandales: al puente se sube por las rampas
  }
}

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
{ const mat = cloudMat = dimmable(new THREE.MeshBasicMaterial({ color: 0xffffff }));   // de noche se tiñen con el cielo; nublado, grises (01-core.js)
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
// viento (fxPatch, 01-core.js): [fuerza, desde qué altura, rapidez]; más arriba se mece más (las copas unos 10 cm, la hierba 3)
const SWAY = { tree: [[0.006, 1.5, 1.3], [0.007, 2.2, 1.2]], bush: [0.03, 0.15, 1.7], tuft: [0.3, 0, 2.2], flower: [0.17, 0, 2] };
const treeMesh = [0, 1].map((type) => {
  const list = trees.filter((t) => t.type === type), m = new THREE.InstancedMesh(TREE_GEO[type], fxPatch(new THREE.MeshLambertMaterial({ vertexColors: true }), { wind: SWAY.tree[type], see: true }), list.length);
  list.forEach((t, i) => { t.idx = i; m.setColorAt(i, _ic.setRGB(t.tint, t.tint, t.tint * 0.96)); });
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m;
});
function setTreeMatrix(t) {
  _im.compose(_ip.set(t.x, 0, t.z), _iq.setFromEuler(_ie.set(0, t.ry, 0)), _is.set(t.s * (1 + (1 - t.k) * 0.25), t.s * t.k, t.s * (1 + (1 - t.k) * 0.25)));
  treeMesh[t.type].setMatrixAt(t.idx, _im);
}
trees.forEach(setTreeMatrix);
function instanced(geo, list, fn, shadow, tint, wind, see) {
  const m = new THREE.InstancedMesh(geo, fxPatch(new THREE.MeshLambertMaterial({ vertexColors: true }), { wind, see }), list.length);
  list.forEach((it, i) => { fn(it); m.setMatrixAt(i, _im); m.setColorAt(i, _ic.set(tint && it.color ? it.color : '#ffffff')); });
  m.frustumCulled = false; m.castShadow = !!shadow; m.receiveShadow = true; scene.add(m); return m;
}
const flowersOk = flowers.filter((f) => !(f.x > HOUSE.x0 - 1 && f.x < HOUSE.x1 + 1 && f.z > HOUSE.z0 - 1 && f.z < HOUSE.z1 - 0.2) && !(Math.abs(f.x) < 1.4 && f.z > -4 && f.z < 18) && Math.hypot(f.x - 10.5, f.z - 5) > 2.8);
instanced(new Batch().cyl('#4aa35a', 0, 0.2, 0, 0.02, 0.028, 0.4, 5).geometry(), flowersOk, (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.identity(), _is.set(f.s, f.s, f.s)), false, false, SWAY.flower);
instanced(new Batch().ico('#ffffff', 0, 0.44, 0, 0.14, 0.095, 0.14, 0).geometry(), flowersOk, (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.identity(), _is.set(f.s, f.s, f.s)), false, true, SWAY.flower);   // la flor, con su tallo
instanced(new Batch().ico('#ffb81f', 0, 0.51, 0, 0.06, 0.05, 0.06, 0).geometry(), flowersOk, (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.identity(), _is.set(f.s, f.s, f.s)), false, false, SWAY.flower);
instanced(new Batch().cone('#6fbf55', 0, 0.16, 0, 0.07, 0.34, 4).cone('#7ccb62', 0.09, 0.12, 0.03, 0.06, 0.26, 4).cone('#63b34a', -0.07, 0.13, -0.05, 0.06, 0.28, 4).geometry(), tufts,
  (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.setFromEuler(_ie.set(0, f.x * 7, 0)), _is.set(f.s, f.s, f.s)), false, false, SWAY.tuft);
instanced(new Batch().ico('#57c06a', 0, 0.5, 0, 0.8, 0.6, 0.8).ico('#4db460', 0.5, 0.4, 0.2, 0.55, 0.45, 0.55).ico('#66cc78', -0.45, 0.42, -0.15, 0.5, 0.42, 0.5).geometry(), bushes,
  (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.setFromEuler(_ie.set(0, f.x * 3, 0)), _is.set(f.s, f.s, f.s)), true, false, SWAY.bush, true);   // los arbustos también se abren si lo tapan
bushes.forEach((f) => solidCircle(f.x, f.z, 0.6 * f.s));
instanced(new Batch().rock('#b3ada1', 0, 0.35, 0, 1, 0.7, 0.85).geometry(), rocks, (f) => _im.compose(_ip.set(f.x, 0, f.z), _iq.setFromEuler(_ie.set(0, f.x * 5, 0)), _is.set(f.s, f.s, f.s)), true);
