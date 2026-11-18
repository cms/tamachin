
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
// `ny` es la componente vertical de la normal; los pasos (`northSurface`) usan las mismas mezclas para saber qué pisa.
const terrainWob = (x, z) => Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.sin(x * 0.037 - z * 0.051) * 0.5;
const rockK = (h, ny) => clamp((0.8 - ny) * 3.2, 0, 1) * 0.85 + clamp((h - 270) / 50, 0, 1) * 0.6;
const snowK = (h, wob) => clamp((h - 322 - 12 * wob) / 22, 0, 1);
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
      const x = TG.x0 + i * TG.s, z = TG.z0 - j * TG.s, wob = terrainWob(x, z);
      c.copy(GR).lerp(GR2, 0.5 + 0.5 * wob);
      if (h > 120) c.lerp(HI, Math.min(1, (h - 120) / 170));
      c.lerp(RK, rockK(h, n.y));
      c.lerp(SN, snowK(h, wob));
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
// la cámara y Tamachin (misma prueba que updateScenery hace con los de casa), en el marco de la cámara (u a la derecha, d hacia ella).
// uDuck = (x, z de Tamachin, c, s de camView); uDuckC = (u de la cámara, d de la cámara), relativos a Tamachin.
const duckU = { uDuck: { value: new THREE.Vector4(0, 0, 1, 0) }, uDuckC: { value: new THREE.Vector2(0, 10) }, uDuckR: { value: 1 } };
const DUCK_GLSL = `#include <begin_vertex>
#ifdef USE_INSTANCING
{ vec3 io = instanceMatrix[3].xyz; float sc = length(instanceMatrix[0].xyz);
  vec2 q = io.xz - uDuck.xy; float u = q.x * uDuck.z - q.y * uDuck.w, dz = q.x * uDuck.w + q.y * uDuck.z, back = max(1.0, uDuckC.y);
  float rx = uDuckC.x * clamp(dz / back, 0.0, 1.0), reach = (2.4 + 5.5 * sc) * uDuckR;
  float k = smoothstep(0.3, 1.2, dz) * (1.0 - smoothstep(reach - 1.5, reach, dz)) * (1.0 - smoothstep(1.7 * sc + 0.6, 1.7 * sc + 1.6, abs(u - rx)));
  transformed.y *= 1.0 - 0.72 * k; transformed.xz *= 1.0 + 0.25 * k; }
#endif`;
function duckify(m) {
  m.onBeforeCompile = (sh) => { sh.uniforms.uDuck = duckU.uDuck; sh.uniforms.uDuckC = duckU.uDuckC; sh.uniforms.uDuckR = duckU.uDuckR; sh.vertexShader = 'uniform vec4 uDuck;\nuniform vec2 uDuckC;\nuniform float uDuckR;\n' + sh.vertexShader.replace('#include <begin_vertex>', DUCK_GLSL); };
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
const SKIND_SWAY = { pine: SWAY.tree[0], oak: SWAY.tree[1], bush: SWAY.bush, tuft: SWAY.tuft };   // se mecen como los de casa
for (const k in SKIND) { const d = SKIND[k]; d.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); if (d.duck) duckify(d.mat); fxPatch(d.mat, { wind: SKIND_SWAY[k] }); d.list = []; }
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
// Qué pisa Tamachin al norte del bosque (para los pasos, 06-main.js), con las mismas medidas con que se pinta: el sendero (cintas de
// 1.35 y 1.4 m), el pueblo empedrado menos el jardín de la posada, y en los cerros la roca y la nieve de `rockK`/`snowK`.
function northSurface(x, z) {
  if (z < Z_FOREST2) return Math.abs(x - forestTrailX(z)) < 1.4 ? 'tierra' : 'pasto';
  if (Math.abs(x) < 62.6 && Math.abs(z - TOWN_Z) < 62.6) { const g = TOWN_GARDEN; return x > g[0] && x < g[2] && z > g[1] && z < g[3] && Math.abs(x) > TOWN_PATH ? 'pasto' : 'piedra'; }
  if (nearTrail(x, z, 1.35)) return 'tierra';
  const h = terrainY(x, z); if (h < 1) return 'pasto';
  const S = TG.s, gx = (terrainY(x + S, z) - terrainY(x - S, z)) / (2 * S), gz = (terrainY(x, z + S) - terrainY(x, z - S)) / (2 * S);   // la normal, como la de la malla
  return snowK(h, terrainWob(x, z)) > 0.5 ? 'nieve' : rockK(h, 1 / Math.sqrt(1 + gx * gx + gz * gz)) > 0.5 ? 'piedra' : 'pasto';
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
const TOWN_GARDEN = [TBX[1][0] + 2.8, TBZ[0][0] + 2.8, TBX[1][1] - 2.8, TBZ[0][1] - 2.8], TOWN_PATH = 1.4;   // el jardín de la posada y su vereda; lo demás es empedrado
const TOWN = { hammock: { x: 8.6, y: 1.05, z: TOWN_Z - 44.6 }, market: { x: 0, z: TOWN_Z + 41.5 }, stalls: [-10.5, 10.5] };   // puestos a los lados: el portón sur da a un pasillo
{ const tex = canvasTex(1024, 1024, (g, S) => {
    const K = S / 128, X = (x) => (x + 64) * K, Z = (z) => (z - TOWN_Z + 64) * K, rect = (x0, z0, x1, z1, f) => { g.fillStyle = f; g.fillRect(X(x0), Z(z0), (x1 - x0) * K, (z1 - z0) * K); };
    const R = mulberry(818), STONE2 = '#d9ccb2', COB = '#c2b59d';
    rect(-64, TOWN_Z - 64, 64, TOWN_Z + 64, '#8fd16b'); rect(-62.6, TOWN_Z - 62.6, 62.6, TOWN_Z + 62.6, STONE2);
    TBX.forEach((bx, i) => TBZ.forEach((bz, j) => { if (i === 1 && j === 0) return; rect(bx[0] + 2.8, bz[0] + 2.8, bx[1] - 2.8, bz[1] - 2.8, i === 1 ? '#e6d8bd' : '#cfc7b6'); }));
    rect(...TOWN_GARDEN, '#93d470'); rect(-TOWN_PATH, TOWN_Z - 64, TOWN_PATH, TBZ[0][1], STONE2);   // jardín de la posada y su vereda
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
    for (const sd of [-1, 1]) { const x = r + sd * 4.9, z = TOWN_Z + v, k = Math.round(v / 9.5) % 2; if (k) { addStatic('oak', x, 0, z, r2(0.6, 0.75)); northCircle(x, z, 0.24); } else { townB.merge(PF_LAMP, x, 0, z, sd > 0 ? Math.PI : 0); solidCircle(x, z, 0.18); lampAt(x, z, sd > 0 ? Math.PI : 0); } }
  }
  // plaza: kiosco al centro, cuatro árboles y bancas mirando al kiosco
  const KZ = TOWN_Z;
  townB.cyl('#f4efe4', 0, 0.3, KZ, 5.2, 5.4, 0.6, 16).cyl('#e6d8bd', 0, 0.62, KZ, 5.0, 5.0, 0.04, 16);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.PI / 8; townB.cyl('#ffffff', Math.cos(a) * 4.4, 2.3, KZ + Math.sin(a) * 4.4, 0.12, 0.14, 3.4, 8); solidCircle(Math.cos(a) * 4.4, KZ + Math.sin(a) * 4.4, 0.18); }
  { // el techo va aparte para cortarse cuando tapa a Tamachin (como los edificios). Debajo está abierto: `roof` dice dónde está el
    // cono (de la orilla, a 3.7 m, a la punta y su remate) para que se corte solo si de verdad lo tapa (`roofCrosses`, 06-main.js)
    const km = new THREE.MeshLambertMaterial({ vertexColors: true });
    scene.add(new Batch().cone('#ef6b5b', 0, 4.9, KZ, 6.2, 2.4, 8, Math.PI / 8).cone('#ffffff', 0, 6.35, KZ, 0.9, 0.9, 8, Math.PI / 8).sph('#ffd76a', 0, 6.9, KZ, 0.3).mesh(km));
    occluders.push({ x0: -6.2, x1: 6.2, z0: KZ - 6.2, z1: KZ + 6.2, h: 7.2, mats: [km], k: 1, padW: 0, padE: 0, padN: 0, padS: 0,
      roof: { x: 0, z: KZ, r: 6.2, y0: 3.7, y1: 6.1, tip: 7.2, tipR: 0.9 } });
  }
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; townB.box('#ffffff', Math.cos(a) * 4.45, 1.05, KZ + Math.sin(a) * 4.45, 0.12, 0.7, 3.2, -a); }
  solidCircle(0, KZ, 5.4);
  townB.cyl('#b98552', 0, 0.8, KZ + 0.6, 2.9, 3.0, 0.32, 16).cyl('#9a6540', 0, 0.97, KZ + 0.6, 2.95, 2.95, 0.03, 16);   // tarima de la banda (06-main.js)
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
  // de noche (06-main.js, updateTownHours) la fruta se tapa con una lona y cuelga un letrero: abre a las 8
  { const cb = new Batch(), closed = new THREE.Group();
    for (const sx of TOWN.stalls) cb.rbox('#5f86b8', sx, 1.38, MZ + 0.35, 5.25, 0.5, 0.95, 0.18).rbox('#4f74a3', sx, 1.12, MZ + 0.86, 5.25, 0.5, 0.08, 0.04);
    closed.add(cb.mesh());
    const tex = canvasTex(512, 160, (g, W, Hh) => { g.fillStyle = '#fff8e6'; g.fillRect(0, 0, W, Hh); g.strokeStyle = '#7a5230'; g.lineWidth = 12; g.strokeRect(6, 6, W - 12, Hh - 12);
      g.fillStyle = '#231d3b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 56px Nunito, "Trebuchet MS", Arial, sans-serif'; g.fillText('Cerrado', W / 2, 58); g.font = '800 34px Nunito, "Trebuchet MS", Arial, sans-serif'; g.fillText('abre a las 8 de la mañana', W / 2, 114); });
    for (const sx of TOWN.stalls) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), new THREE.MeshLambertMaterial({ map: tex })); m.position.set(sx, 0.55, MZ + 0.93); closed.add(m); }
    closed.visible = false; scene.add(closed); TOWN.closed = closed; }
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
const forest = { live: new Map(), free: Array.from({ length: SLOTS }, (_, i) => i), pci: null, pcj: null, wk: -1, eaten: new Map() };
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
  // la ventana se alarga hacia donde mira la cámara: 2 casillas adelante, 1 atrás y 2 a cada lado (cerca de 45° no cambia, para no rehacer casillas)
  const fi = -camView.s, fj = camView.c, alongI = forest.wk >= 2 ? Math.abs(fi) > Math.abs(fj) * 0.8 : Math.abs(fi) > Math.abs(fj) * 1.25;
  const wk = (alongI ? 2 : 0) + ((alongI ? fi : fj) >= 0 ? 1 : 0);
  if (pci === forest.pci && pcj === forest.pcj && near === forest.near && wk === forest.wk) return;
  forest.pci = pci; forest.pcj = pcj; forest.near = near; forest.wk = wk;
  const want = new Set(), lo = wk & 1 ? -WIN.s : -WIN.n, hi = wk & 1 ? WIN.n : WIN.s;
  const i0 = alongI ? lo : -WIN.w, i1 = alongI ? hi : WIN.w, j0 = alongI ? -WIN.w : lo, j1 = alongI ? WIN.w : hi;
  if (near) for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (pcj + j >= 0) want.add((pci + i) + ',' + (pcj + j));
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
camera.far = 1700; camera.updateProjectionMatrix();                 // desde las cimas se ve el valle entero (updateCamera la acorta a la niebla)

// ───────────────────────── cada cuadro ─────────────────────────
const northSeen = {};
function updateNorth(dt) {
  const P = player.pos;
  updateForest(); regrowForest(dt); updateForestTrail();
  farForest.visible = P.y > 60 && P.z > Z_FOREST2 + 150;
  // niebla según la altura: desde arriba se ve lejos
  const alt = Math.max(0, P.y);
  const wf = 1 - 0.35 * weather.cloud - 0.15 * weather.rain;   // nublado y lloviendo, la neblina se acerca
  scene.fog.far = damp(scene.fog.far, (300 + alt * 1.6) * wf, 1.5, dt); scene.fog.near = damp(scene.fog.near, (60 + alt * 0.8) * wf, 1.5, dt);
  if (TOWN.hammockMesh) TOWN.hammockMesh.rotation.x = Math.sin(clock * 1.5) * (player.sleepSpot === 'hamaca' ? 0.1 : 0.03);
  // cimas y lugares nuevos
  for (const p of PEAKS) if (!p.reached && Math.hypot(P.x - p.x, P.z - p.z) < 24 && P.y > p.y - 30) reachSummit(p);
  const zone = P.z < Z_FOREST2 ? 'bosque' : P.z < Z_TOWN_S + 2 ? 'pueblo' : P.z < NORTH_Z ? 'montañas' : null;
  if (zone && !northSeen[zone]) { northSeen[zone] = true; discover(zone); }
}
