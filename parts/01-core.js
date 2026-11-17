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
renderer.localClippingEnabled = true;                        // edificios que se cortan a media altura (06-main.js)
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = new THREE.Color(0xd6f0ff);
scene.background = FOG.clone();
scene.fog = new THREE.Fog(FOG.getHex(), 60, 300);
const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 800);
// Hacia dónde mira la cámara. Se gira arrastrando (06-main.js). yaw 0: la cámara al sur de Tamachin, mirando al norte.
// c y s son coseno y seno de yaw: la derecha de la pantalla es (c, -s) en el mundo y "hacia la cámara" es (s, c).
// vc y vs: el mismo marco para las pruebas de visibilidad; durante una toma fija (el refri) siguen a la cámara de verdad.
// pitch: el ángulo de la cámara sobre el suelo, visto desde Tamachin (34° al empezar); se cambia arrastrando hacia arriba o abajo.
// En casa va `house` más alto, para ver por encima de las paredes.
const PITCH = { def: Math.atan2(7.6, 11.2), min: 15 * Math.PI / 180, max: 60 * Math.PI / 180, house: Math.atan2(8.4, 7.2) - Math.atan2(7.6, 11.2) };
const camView = { yaw: 0, yawT: 0, pitch: PITCH.def, pitchT: PITCH.def, c: 1, s: 0, vc: 1, vs: 0 };
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

// El cielo: una esfera con color por vértice que sigue a la cámara (updateCamera). `paintSky` la pinta según la hora (día y noche, abajo).
const skyMesh = (() => {
  const g = new THREE.SphereGeometry(520, 32, 20);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
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
const SUN_OFF = new THREE.Vector3(38, 58, 42);              // de Tamachin hacia la luz (el sol o la luna): lo mueve applyDay

// ───────────────────────── día y noche ─────────────────────────
// Un día dura 24 minutos: una hora de juego es un minuto real (`day.h`, de 0 a 24; se guarda). Amanece a las 5 y anochece a las 8.
// De 8 a 17:30 los colores e intensidades son los de antes del ciclo. La noche es azul, no negra (se ve en un teléfono).
// La luna alumbra con la misma luz que el sol: se cambian cuando las dos pasan por cero, en el crepúsculo. Nunca se agrega ni se quita
// una luz con sombra (en r128 eso recompila todos los materiales y el juego se traba).
const DAY = { rise: 5, set: 20, start: 8, rate: 1 / 60 };   // rate: horas de juego por segundo
const day = { h: DAY.start, n: 1, light: 1, warm: 0, stars: 0, lamps: 0 };   // n: qué día es (sube cada mañana, a las 5; 06-main.js)
// El tiempo: cada día tiene el suyo según su número (al recargar es el mismo; dayWeather, 06-main.js). cloud: qué tan nublado (0 a 1),
// rain: cuánto llueve, here: cuánto llueve donde está Tamachin (arriba de los cerros no; adentro de la casa suena, no cae), wet: los
// charcos (se llenan con la lluvia y se secan despacio). Lo mueve updateWeather; aquí cambia el cielo y la luz.
const weather = { kind: 'sol', cloud: 0, rain: 0, here: 0, wet: 0, force: null };
let cloudMat = null;                                         // el de las nubes (03-world.js): se ponen grises   // light: 1 de día, 0 de noche; warm: cuánto amanecer o atardecer; lamps: luces prendidas
// hora, cielo arriba, cielo medio, horizonte (y niebla), luz del cielo, luz del suelo, su intensidad, tinte de lo que no recibe luz, light, warm
const SKY_NIGHT = [0x0b1440, 0x1c2a63, 0x34477f, 0x7486ff, 0x2a3060, 0.6, 0x5c6a9c, 0, 0];
const SKY_DAY = [0x3f9ef5, 0x9bd6ff, 0xd6f0ff, 0xf2f9ff, 0xb6c296, 0.58, 0xffffff, 1, 0];
const SKY_KEYS = [[0, SKY_NIGHT], [3.9, SKY_NIGHT],
  [5, [0x3b4b98, 0xb48bc2, 0xffb18a, 0xd8d4f4, 0x7a8090, 0.62, 0xffc2b2, 0.45, 1]],      // amanecer
  [6.3, [0x4c9cee, 0xb4dafb, 0xfde2c4, 0xf8f4f0, 0xb6bf98, 0.6, 0xfff0e2, 0.85, 0.35]],   // mañana
  [8, SKY_DAY], [17.5, SKY_DAY],
  [19, [0x4a94e4, 0xbcd5ee, 0xffdcae, 0xf0eeff, 0xb0b896, 0.6, 0xfff0d6, 0.85, 0.4]],     // tarde dorada
  [20, [0x33408c, 0xd88aa6, 0xff9868, 0xe2cfee, 0x76788e, 0.62, 0xffb4a0, 0.45, 1]],      // atardecer
  [21.1, SKY_NIGHT], [24, SKY_NIGHT]].map(([h, k]) => ({ h, c: k.slice(0, 7).map((v, i) => (i === 5 ? v : new THREE.Color(v))), tint: new THREE.Color(k[6]), light: k[7], warm: k[8] }));
const SUN_COL = new THREE.Color(0xfff1d6), SUN_LOW = new THREE.Color(0xffbf96), MOON_COL = new THREE.Color(0xdfe6ff), GLOW = new THREE.Color(0xff9a5c);
const SUN_DISC = new THREE.Color(0xfff4d6), SUN_DISC_LOW = new THREE.Color(0xffa25c);
const DEG = Math.PI / 180, LIGHT_D = SUN_OFF.length(), LIGHT_MIN_E = 30 * DEG;   // la sombra cubre ±42 m: con el sol más bajo se estiraría de más
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Lo que no recibe luz (MeshBasicMaterial: nubes, mariposas) brillaría de noche: se tiñe con la hora.
const UNLIT = [];
function dimmable(mat) { UNLIT.push({ mat, base: mat.color.clone() }); return mat; }
// Lo que se enciende al oscurecer (`day.lamps`, de 0 a 1): sin luces de verdad (cada una recompilaría todo y costaría en el teléfono).
// nightMat: un material sin luz que aparece con la noche (ventanas de la casa, focos, el charco de luz bajo los faroles); con opacidad 0
// no se dibuja. LIT_WALLS: las paredes de los edificios, cuyas ventanas brillan con `emissiveMap`. LAMPS: dónde va cada foco
// ({ x, y, z, r, pool }); los ponen la ciudad, el parque y Valle Alegre, y 06-main.js los dibuja todos juntos.
const NIGHT_LIT = [], LIT_WALLS = [], LAMPS = [], WARM_WIN = new THREE.Color(0xffcf7a);
function nightMat(color, max, extra) { const m = new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, opacity: 0, depthWrite: false }, extra)); m.visible = false; NIGHT_LIT.push({ mat: m, max }); return m; }
// el foco de un farol (PF_LAMP, 03-world.js) puesto en x, z con giro ry
function lampAt(x, z, ry) { LAMPS.push({ x: x + Math.cos(ry || 0), y: 4.36, z: z - Math.sin(ry || 0), r: 0.24, pool: true }); }
// Estrellas, luna y sol van en el cielo y se dibujan justo después de él, antes que todo lo demás: sin transparencia (así entran en
// la lista de lo opaco, que respeta renderOrder) pero con mezcla aditiva, y sin profundidad. Así un cerro lejano siempre las tapa.
const SKY_ADD = { transparent: false, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false };
const skyDot = canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
const skyStars = [[340, 2.4, 2411], [60, 3.8, 2412]].map(([n, size, seed]) => {
  const R = mulberry(seed), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color(), tints = [0xffffff, 0xdfe8ff, 0xfff1c9];
  for (let i = 0; i < n; i++) {
    const y = 0.02 + 0.98 * Math.pow(R(), 1.7), a = R() * TAU, r = Math.sqrt(1 - y * y);   // más cerca del horizonte, que es lo que ve la cámara
    pos[i * 3] = Math.cos(a) * r * 480; pos[i * 3 + 1] = y * 480; pos[i * 3 + 2] = Math.sin(a) * r * 480;
    c.setHex(tints[Math.floor(R() * 3)]).multiplyScalar(0.5 + 0.5 * R()); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial(Object.assign({ size, sizeAttenuation: false, map: skyDot, vertexColors: true, opacity: 0 }, SKY_ADD)));
  m.renderOrder = -9; m.frustumCulled = false; skyMesh.add(m); return m;
});
function skySprite(tex, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map: tex }, SKY_ADD)));
  s.scale.setScalar(scale); s.renderOrder = -8; s.frustumCulled = false; skyMesh.add(s); return s;
}
const skyMoon = skySprite(canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 16, 64, 64, 64); gr.addColorStop(0, 'rgba(200,214,255,.45)'); gr.addColorStop(1, 'rgba(200,214,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const m = document.createElement('canvas'); m.width = m.height = 128; const q = m.getContext('2d');   // la luna creciente, aparte para recortarla
  q.fillStyle = '#fff6d6'; q.beginPath(); q.arc(64, 64, 24, 0, TAU); q.fill();
  q.fillStyle = '#efe2b8'; for (const [x, y, r] of [[52, 58, 5], [60, 76, 4], [47, 72, 3]]) { q.beginPath(); q.arc(x, y, r, 0, TAU); q.fill(); }
  q.globalCompositeOperation = 'destination-out'; q.beginPath(); q.arc(78, 54, 21, 0, TAU); q.fill();
  g.drawImage(m, 0, 0);
}), 84);
const skySun = skySprite(canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.26, 'rgba(255,252,236,1)'); gr.addColorStop(0.32, 'rgba(255,236,190,.55)'); gr.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
}), 120);

// Un arco por el cielo: sale por el este (f = 0) y se pone por el oeste (f = 1); fuera de 0..1 está bajo el horizonte. az es el rumbo
// desde el este (+x) hacia el sur (+z). El sol no va de este a oeste: se queda entre el este-sureste y el sur, al sureste a mediodía
// (como antes del ciclo). La cámara empieza al sur: así la escena queda de frente a la luz y las sombras caen de lado, donde se ven
// (con el sol justo detrás de la cámara se esconden detrás de cada cosa; con el sol al este la casa queda a contraluz). La luna cruza bajita por el norte (a 6° como mucho: la cámara mira hacia abajo y solo con la cámara baja ve el cielo), para que se vea al caminar
// hacia las montañas; su luz viene del sur, como la del sol.
function arcDir(out, f, maxE, az0, az1) { const az = lerp(az0, az1, f) * DEG, e = maxE * DEG * Math.sin(Math.PI * f); return out.set(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az)); }
const _sunD = new THREE.Vector3(), _moonD = new THREE.Vector3(), _moonL = new THREE.Vector3(), _skc = new THREE.Color();
const _dc = [0, 1, 2, 3, 4].map(() => new THREE.Color()), _tint = new THREE.Color(), _lc = new THREE.Color();
let skyAt = -1, skyCl = 0;
function paintSky(top, mid, hor, glow) {
  const P = skyMesh.geometry.attributes.position, C = skyMesh.geometry.attributes.color, a = C.array, c = _skc;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i) / 520, y = P.getY(i) / 520, z = P.getZ(i) / 520;
    if (y < 0) c.copy(hor); else if (y < 0.22) c.copy(hor).lerp(mid, y / 0.22); else c.copy(mid).lerp(top, (y - 0.22) / 0.78);
    if (glow > 0) { const d = x * _sunD.x + y * _sunD.y + z * _sunD.z; if (d > 0) c.lerp(GLOW, glow * Math.pow(d, 5) * (1 - clamp(y * 1.4, 0, 1))); }   // resplandor hacia el sol
    a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
  }
  C.needsUpdate = true;
}
function setHour(h) { day.h = ((h % 24) + 24) % 24; applyDay(true); }
function updateDay(dt) { day.h = (day.h + dt * DAY.rate) % 24; applyDay(false); }
function applyDay(force) {
  const h = day.h; let i = 0; while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].h <= h) i++;
  const A = SKY_KEYS[i], B = SKY_KEYS[i + 1], t = ease(clamp((h - A.h) / (B.h - A.h), 0, 1));
  for (let k = 0; k < 5; k++) _dc[k].copy(A.c[k]).lerp(B.c[k], t);
  _tint.copy(A.tint).lerp(B.tint, t); day.light = lerp(A.light, B.light, t); day.warm = lerp(A.warm, B.warm, t);
  // nublado: el cielo se vuelve gris (con el mismo brillo), el sol pega menos (sombras suaves) y la luz del cielo un poco más
  const cl = weather.cloud;
  if (cl > 0.001) for (let k = 0; k < 3; k++) { const c = _dc[k], l = (0.3 * c.r + 0.59 * c.g + 0.11 * c.b) * 0.94; c.lerp(_skc.setRGB(l, l, l * 1.05), 0.72 * cl); }
  day.stars = smooth(0.45, 0.05, day.light) * (1 - smooth(0.3, 0.8, weather.cloud));   // nublado no se ven
  // dónde van el sol y la luna (la luna sale a las 8 de la noche y se pone a las 5)
  arcDir(_sunD, (h - DAY.rise) / (DAY.set - DAY.rise), 46, 20, 85);
  // de día g pasa de 1 (se puso) a 24/night (vuelve a salir): a la mitad del día se cuenta hacia atrás desde 0, así siempre queda bajo el horizonte
  const night = 24 - DAY.set + DAY.rise; let g = ((h - DAY.set + 24) % 24) / night; if (g > (1 + 24 / night) / 2) g -= 24 / night;
  arcDir(_moonD, g, 6, -15, -165); _moonL.set(_moonD.x, _moonD.y, -_moonD.z);
  const sunAmt = smooth(-0.03, 0.25, _sunD.y), moonAmt = smooth(-0.02, 0.04, _moonD.y), bySun = sunAmt >= moonAmt, D = bySun ? _sunD : _moonL;
  if (bySun) { sun.color.copy(SUN_LOW).lerp(SUN_COL, smooth(0, 0.5, _sunD.y)); sun.intensity = 0.62 * sunAmt; }
  else { sun.color.copy(MOON_COL); sun.intensity = 0.45 * moonAmt; }
  const az = Math.atan2(D.z, D.x), e = Math.max(LIGHT_MIN_E, Math.asin(clamp(D.y, -1, 1)));
  SUN_OFF.set(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az)).multiplyScalar(LIGHT_D);
  hemi.color.copy(_dc[3]); hemi.groundColor.copy(_dc[4]); hemi.intensity = lerp(A.c[5], B.c[5], t) + 0.05 * cl - 0.06 * weather.rain; sun.intensity *= 1 - 0.75 * cl;
  if (cl > 0.001) { const l = 0.3 * hemi.color.r + 0.59 * hemi.color.g + 0.11 * hemi.color.b; hemi.color.lerp(_skc.setRGB(l, l, l * 1.04), 0.5 * cl); }   // luz pareja y sin color
  scene.fog.color.copy(_dc[2]); scene.background.copy(_dc[2]);
  for (const u of UNLIT) u.mat.color.copy(u.base).multiply(_tint);
  if (cloudMat) cloudMat.color.lerp(_skc.setRGB(0.6, 0.63, 0.68).multiply(_tint), 0.65 * cl);
  day.lamps = Math.max(smooth(0.62, 0.22, day.light), 0.55 * weather.rain);   // con lluvia también se prenden las ventanas
  for (const n of NIGHT_LIT) { n.mat.opacity = n.max * day.lamps; n.mat.visible = day.lamps > 0.01; }
  for (const m of LIT_WALLS) m.emissive.copy(WARM_WIN).multiplyScalar(0.85 * day.lamps);
  // en el cielo
  for (const s of skyStars) s.material.opacity = day.stars;
  skyMoon.position.copy(_moonD).multiplyScalar(470); skyMoon.material.opacity = smooth(-0.03, 0.03, _moonD.y) * (1 - 0.75 * day.light) * (1 - 0.85 * cl); skyMoon.visible = skyMoon.material.opacity > 0.01;
  skySun.position.copy(_sunD).multiplyScalar(470); skySun.material.opacity = smooth(-0.07, 0.03, _sunD.y) * (1 - 0.9 * cl); skySun.visible = skySun.material.opacity > 0.01;
  skySun.material.color.copy(SUN_DISC_LOW).lerp(SUN_DISC, smooth(0, 0.4, _sunD.y));
  if (force || Math.abs(h - skyAt) > 0.004 || Math.abs(cl - skyCl) > 0.01) { skyAt = h; skyCl = cl; paintSky(_dc[0], _dc[1], _dc[2], 0.85 * smooth(-0.25, 0, _sunD.y) * (1 - smooth(0.05, 0.35, _sunD.y)) * (1 - cl)); }
}
applyDay(true);

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
// Lo bajo lleva `top` (la altura de arriba, solo en suelo plano): Tamachin lo libra saltando y, salvo `stand` falso (una cerca),
// se para encima (`perches`). Sin `top` no tiene límite de altura. Quien lo acompaña (resolveAgent) no salta: todo le estorba.
const boxes = [], circles = [], perches = [];
const lowSolid = (list, s, top, stand) => { list.push(s); if (top != null) { s.top = top; if (stand !== false) perches.push(s); } return s; };
const solidBox = (x0, x1, z0, z1, top, stand) => lowSolid(boxes, { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), top: Infinity }, top, stand);
const solidCircle = (x, z, r, top, stand) => lowSolid(circles, { x, z, r, top: Infinity }, top, stand);
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
// `mode`: 'todo' (música y efectos), 'efectos' o 'no'. `on` deja sonar los efectos y `music` la música. `tune` transporta los efectos
// con tono a la tonalidad de la música que suena (1 = do; lo pone updateMusic).
const snd = { ctx: null, on: true, music: true, mode: 'todo', tune: 1 };
function unlockAudio() {
  if (!snd.on) return;
  if (snd.ctx) { if (snd.ctx.state !== 'running') snd.ctx.resume().catch(() => {}); return; }   // en iPhone puede quedar 'interrupted'
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
const SFX = {   // los que tienen tono van por snd.tune (k): suenan en la tonalidad de la música
  jump: (k = snd.tune) => tone(320 * k, 660 * k, 0.16, 'sine', 0.06),
  pop: (k = snd.tune) => tone(680 * k, 1150 * k, 0.1, 'triangle', 0.06),
  talk: () => { for (let i = 0; i < 3; i++) tone(rand(480, 900), rand(480, 900), 0.07, 'square', 0.022, i * 0.085); },
  honk: () => { tone(392, 392, 0.24, 'square', 0.035); tone(494, 494, 0.24, 'square', 0.035); },
  hit: () => tone(280, 55, 0.42, 'sawtooth', 0.07),
  splash: () => tone(950, 180, 0.26, 'triangle', 0.05),
  dizzy: (k = snd.tune) => { tone(620 * k, 300 * k, 0.45, 'sine', 0.05); tone(300 * k, 620 * k, 0.45, 'sine', 0.04, 0.3); },
  nice: (k = snd.tune) => { tone(523 * k, 523 * k, 0.1, 'triangle', 0.05); tone(784 * k, 784 * k, 0.16, 'triangle', 0.05, 0.1); },
  fridgeOpen: () => { tone(150, 85, 0.2, 'sine', 0.08); tone(1250, 1900, 0.4, 'sine', 0.022, 0.1); tone(1660, 2490, 0.34, 'sine', 0.018, 0.2); },
  fridgeShut: () => { tone(180, 70, 0.22, 'triangle', 0.08); tone(90, 60, 0.12, 'sine', 0.06, 0.02); },
  munch: () => { tone(rand(230, 320), 120, 0.06, 'square', 0.028); tone(rand(260, 360), 140, 0.05, 'square', 0.022, 0.08); },
  yay: (k = snd.tune) => [523, 659, 784, 1046].forEach((f, i) => tone(f * k, f * k, i === 3 ? 0.3 : 0.12, 'triangle', 0.05, i * 0.1)),
  low: (k = snd.tune) => { tone(420 * k, 330 * k, 0.22, 'sine', 0.045); tone(330 * k, 260 * k, 0.3, 'sine', 0.04, 0.2); },
};

// ───────────────────────── música (sintetizada, sin archivos) ─────────────────────────
// Cada lugar tiene una mezcla (`MUSIC_ZONES`) de una pieza (`MUSIC`): jardín, parque y ciudad tocan la misma y solo entran o salen
// instrumentos; al entrar a la casa, esa se apaga y empieza la caja de música. `makeMusic(ctx, destino)` es igual en el juego y en
// las pruebas (con un OfflineAudioContext se renderiza a WAV). Todo va con el reloj del audio, nunca con el del juego, que se
// atrasa cuando un cuadro tarda. Las notas están en do mayor (60 es el do central) y cada pieza transporta lo suyo.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function env(g, t, v, a, len) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + len); }
function osc(c, type, f, t, end) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(end + 0.02); return o; }
function noiseHit(E, d, t, v, type, freq, q, len) {
  const c = E.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = E.noise; fl.type = type; fl.frequency.value = freq; fl.Q.value = q; env(g, t, v, 0.003, len);
  s.connect(fl); fl.connect(g); g.connect(d); s.start(t, Math.random() * 0.8); s.stop(t + len + 0.02);
}
// Instrumentos: (motor, destino, tiempo, nota, duración en s, fuerza 0..1)
const INST = {
  bell(E, d, t, m, dur, v) {   // caja de música: FM con brillo solo al ataque
    const c = E.ctx, f = mtof(m), end = t + 1.5, o = osc(c, 'sine', f, t, end), mo = osc(c, 'sine', f * 4, t, end), mg = c.createGain(), g = c.createGain();
    mg.gain.setValueAtTime(f * 2.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.01, t + 0.2);
    mo.connect(mg); mg.connect(o.frequency); env(g, t, v, 0.004, 1.5); o.connect(g); g.connect(d);
  },
  mallet(E, d, t, m, dur, v) {   // marimba: la fundamental y el cuarto armónico, que se apaga enseguida
    const c = E.ctx, f = mtof(m), o = osc(c, 'sine', f, t, t + 0.6), o2 = osc(c, 'sine', f * 4, t, t + 0.1), g = c.createGain(), g2 = c.createGain();
    env(g, t, v, 0.003, 0.6); env(g2, t, v * 0.28, 0.002, 0.08); o.connect(g); o2.connect(g2); g.connect(d); g2.connect(d);
  },
  bass(E, d, t, m, dur, v) {   // bajo pulsado: diente de sierra con un filtro que se cierra (se oye aun en la bocina del teléfono)
    const c = E.ctx, f = mtof(m), len = Math.max(0.14, dur), o = osc(c, 'sawtooth', f, t, t + len + 0.1), fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(f * 8, t); fl.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.18);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(v * 0.45, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
    o.connect(fl); fl.connect(g); g.connect(d);
  },
  keys(E, d, t, m, dur, v) {   // acordes cortitos, como piano de juguete
    const c = E.ctx, len = Math.min(0.35, dur + 0.12), o = osc(c, 'triangle', mtof(m), t, t + len), g = c.createGain();
    env(g, t, v, 0.004, len); o.connect(g); g.connect(d);
  },
  pad(E, d, t, m, dur, v, att) {   // colchón: dos triángulos un poco desafinados, filtrados; `att`: cuánto tarda en entrar (si es lento, en línea recta:
    // la curva exponencial se queda casi muda la mayor parte del tiempo y entre acorde y acorde quedaba un hueco)
    const c = E.ctx, f = mtof(m), a = att || 0.5, hold = t + Math.max(a, dur), end = hold + 0.9, fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'lowpass'; fl.frequency.value = 1400;
    for (const det of [-8, 8]) { const o = osc(c, 'triangle', f, t, end); o.detune.value = det; o.connect(fl); }
    g.gain.setValueAtTime(0.0001, t); if (a > 0.5) g.gain.linearRampToValueAtTime(v, t + a); else g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, hold); g.gain.exponentialRampToValueAtTime(0.0001, end);
    fl.connect(g); g.connect(d);
  },
  whistle(E, d, t, m, dur, v) {   // flautita: entra un poquito abajo y vibra
    const c = E.ctx, f = mtof(m), len = Math.max(0.1, dur * 0.9), end = t + len + 0.1, o = osc(c, 'sine', f, t, end), lfo = osc(c, 'sine', 5.6, t, end), lg = c.createGain(), g = c.createGain();
    o.frequency.setValueAtTime(f * 0.97, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.011, t + 0.3); lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.035); g.gain.setValueAtTime(v, t + len); g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g); g.connect(d);
  },
  flute(E, d, t, m, dur, v) { INST.whistle(E, d, t, m, dur, v); noiseHit(E, d, t, v * 0.12, 'bandpass', Math.min(8000, mtof(m) * 2), 2, 0.09); },   // con soplido
  harp(E, d, t, m, dur, v) {   // arpa: cuerda pulsada, diente de sierra con un filtro que se cierra rápido
    const c = E.ctx, f = mtof(m), o = osc(c, 'sawtooth', f, t, t + 1.3), fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'lowpass'; fl.Q.value = 0.7; fl.frequency.setValueAtTime(Math.min(9000, f * 9), t); fl.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.35);
    env(g, t, v, 0.003, 1.3); o.connect(fl); fl.connect(g); g.connect(d);
  },
  accordion(E, d, t, m, dur, v) {   // acordeón: dos dientes de sierra desafinados (el temblor del musette), filtrados
    const c = E.ctx, f = mtof(m), len = Math.max(0.08, dur * 0.92), end = t + len + 0.08, fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'lowpass'; fl.frequency.value = Math.min(4000, f * 5); fl.Q.value = 0.8;
    for (const det of [-9, 9]) { const o = osc(c, 'sawtooth', f, t, end); o.detune.value = det; o.connect(fl); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v, t + len); g.gain.exponentialRampToValueAtTime(0.0001, end);
    fl.connect(g); g.connect(d);
  },
  horn(E, d, t, m, dur, v) {   // trompeta de juguete: diente de sierra con un filtro que se abre al soplar
    const c = E.ctx, f = mtof(m), len = Math.max(0.08, dur), end = t + len + 0.12, o = osc(c, 'sawtooth', f, t, end), fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'lowpass'; fl.Q.value = 1.5; fl.frequency.setValueAtTime(f * 1.2, t); fl.frequency.exponentialRampToValueAtTime(Math.min(8000, f * 5), t + 0.06); fl.frequency.exponentialRampToValueAtTime(f * 3, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.025); g.gain.setValueAtTime(v, t + len); g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(fl); fl.connect(g); g.connect(d);
  },
  wood(E, d, t, m, dur, v) {   // bloque de madera: un toquecito que baja de tono
    const c = E.ctx, o = osc(c, 'sine', 1150, t, t + 0.07), g = c.createGain(); o.frequency.setValueAtTime(1150, t); o.frequency.exponentialRampToValueAtTime(780, t + 0.05);
    env(g, t, v, 0.002, 0.07); o.connect(g); g.connect(d);
  },
  shaker(E, d, t, m, dur, v) { noiseHit(E, d, t, v, 'highpass', 6500, 0.7, 0.05); },
  snap(E, d, t, m, dur, v) { noiseHit(E, d, t, v, 'bandpass', 1900, 1.3, 0.1); },
  drum(E, d, t, m, dur, v) {   // bombo: un tono que cae rápido y un golpecito de ruido
    const c = E.ctx, o = osc(c, 'sine', 120, t, t + 0.3), g = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    env(g, t, v, 0.003, 0.28); o.connect(g); g.connect(d); noiseHit(E, d, t, v * 0.25, 'lowpass', 900, 0.7, 0.03);
  },
  snare(E, d, t, m, dur, v) { noiseHit(E, d, t, v, 'bandpass', 2400, 0.8, 0.11); const o = osc(E.ctx, 'triangle', 190, t, t + 0.08), g = E.ctx.createGain(); env(g, t, v * 0.5, 0.002, 0.07); o.connect(g); g.connect(d); },   // redoblante, suavecito
};
// Armonía: acordes por nombre ('C', 'Am', 'D7'), cada nota en la octava que empieza en `lo` (así no saltan de un acorde a otro).
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, CHORD_Q = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], add9: [0, 4, 7, 14] }, SCALE = [0, 2, 4, 5, 7, 9, 11];
const inOct = (pc, lo) => lo + (((pc - lo) % 12) + 12) % 12;
function voicing(name, lo) { return CHORD_Q[name.slice(1)].map((i) => inOct(PC[name[0]] + i, lo)).sort((a, b) => a - b); }
const rootIn = (name, lo) => inOct(PC[name[0]], lo);
// segunda voz: una tercera abajo si cae en el acorde; si no, una sexta abajo (el final: do sobre mi, no sobre la); si tampoco, nada
function harmonyBelow(m, ch) {
  const pcs = voicing(ch, 0).map((n) => n % 12), pc = m % 12, i = SCALE.indexOf(pc), third = i < 0 ? null : m - (pc - SCALE[(i + 5) % 7] + 12) % 12;
  if (third !== null && pcs.includes(third % 12)) return third;
  const sixth = [m - 8, m - 9].find((n) => pcs.includes(n % 12)); return sixth === undefined ? null : sixth;
}
// El tema de Tamachin (A) y su segunda parte (B): [corchea, nota, cuántas corcheas]; 8 compases de 8 corcheas.
function melIndex(list) { const a = []; for (const [s, m, d] of list) a[s] = [m, d]; return a; }
const MEL_A = melIndex([[0, 67, 2], [2, 72, 2], [4, 76, 3], [7, 74, 1], [8, 74, 2], [10, 71, 2], [12, 67, 4], [16, 69, 1], [17, 72, 1], [18, 76, 2], [20, 74, 1], [21, 72, 3],
  [24, 69, 2], [26, 72, 1], [27, 74, 1], [28, 72, 4], [32, 67, 2], [34, 72, 2], [36, 76, 3], [39, 74, 1], [40, 74, 2], [42, 79, 2], [44, 77, 1], [45, 76, 1], [46, 74, 2],
  [48, 72, 2], [50, 69, 2], [52, 71, 2], [54, 74, 2], [56, 72, 6]]);
const MEL_B = melIndex([[0, 69, 2], [2, 72, 2], [4, 76, 4], [8, 77, 2], [10, 76, 2], [12, 72, 4], [16, 76, 2], [18, 74, 2], [20, 72, 2], [22, 67, 2],
  [24, 71, 2], [26, 69, 1], [27, 71, 1], [28, 74, 4], [32, 69, 2], [34, 72, 2], [36, 76, 2], [38, 81, 2], [40, 81, 2], [42, 79, 1], [43, 77, 1], [44, 76, 2], [46, 72, 2],
  [48, 69, 2], [50, 72, 2], [52, 74, 2], [54, 78, 2], [56, 79, 6]]);
const PROG_A = [['C'], ['G'], ['Am'], ['F'], ['C'], ['G'], ['F', 'G'], ['C']], PROG_B = [['Am'], ['F'], ['C'], ['G'], ['Am'], ['F'], ['D7'], ['G']];
const chordAt = (prog, bar, s) => { const c = prog[bar]; return c[c.length > 1 && s >= 4 ? 1 : 0]; };
// el tema en vals (3/4: 6 corcheas por compás, 16 compases)
const MEL_W = melIndex([[0, 67, 2], [2, 72, 2], [4, 76, 2], [6, 74, 4], [10, 71, 2], [12, 69, 2], [14, 72, 2], [16, 76, 2], [18, 72, 4], [22, 69, 2],
  [24, 67, 2], [26, 72, 2], [28, 76, 2], [30, 79, 4], [34, 77, 1], [35, 76, 1], [36, 72, 2], [38, 69, 2], [40, 72, 2], [42, 74, 6],
  [48, 76, 2], [50, 79, 2], [52, 76, 2], [54, 74, 2], [56, 71, 2], [58, 67, 2], [60, 69, 2], [62, 72, 2], [64, 76, 2], [66, 77, 4], [70, 76, 1], [71, 74, 1],
  [72, 76, 2], [74, 72, 2], [76, 67, 2], [78, 71, 2], [80, 74, 2], [82, 79, 2], [84, 77, 2], [86, 74, 2], [88, 71, 2], [90, 72, 6]]);
const PROG_W = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'C', 'G', 'Am', 'F', 'C', 'G', 'G7', 'C'];
const PROG_M = ['Cadd9', 'G', 'Am', 'Fadd9', 'Cadd9', 'G', 'G', 'Cadd9'];   // la de A, con novenas que la vuelven más abierta
// el bosque sin fin: mi menor pentatónica, acordes que pasean, dibujos de arpa (índices de [raíz, quinta, octava, décima, duodécima])
const PENT = [64, 67, 69, 71, 74, 76, 79, 81, 83, 86];
const WANDER = { Em: ['C', 'G', 'Am', 'D'], C: ['G', 'Em', 'Am', 'D'], G: ['D', 'C', 'Em'], D: ['Em', 'C', 'G'], Am: ['C', 'Em', 'D'] };
const RHYTHMS = [[2, 2, 4], [1, 1, 2, 4], [3, 1, 2, 2], [2, 1, 1, 4], [4, 2, 2], [2, 2, 2, 2], [6, 2]];
const ARPS = [[0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3, 2, 4, 3, 1], [0, null, 2, null, 3, null, 2, null], [4, 3, 2, 1, 0, 1, 2, 3], [0, 1, 2, null, 3, 2, 1, null]];
const harpTones = (ch, lo) => { const r = rootIn(ch, lo), th = CHORD_Q[ch.slice(1)][1]; return [r, r + 7, r + 12, r + 12 + th, r + 19]; };
// Piezas: tempo, swing (cuánto se atrasan las corcheas de contratiempo), reverberación, volumen, tonalidad (`key`, semitonos sobre do:
// a ella se transportan los efectos), corcheas por compás (`meter`, para la percusión de correr; `noRun` la quita), cuánto queda de
// cada capa con una necesidad baja (`low`), capas (volumen y paneo; lo sostenido suena mucho más que lo pulsado, por eso el bajo y el
// colchón llevan tan poco) y `step`, que toca la
// corchea `i` (cuenta desde que empezó la pieza) en el tiempo `t`; `sd` es lo que dura una corchea.
const MUSIC = {
  ciudad: { bpm: 108, swing: 0.12, wet: 0.25, vol: 0.13, key: 0, meter: 8, low: { keys: 0.3, snap: 0, shk: 0.4 },   // marimba, bajo y acordes a contratiempo; la tercera vuelta es la parte B, con flautita
    layers: { mel: { vol: 0.54, pan: 0.1 }, keys: { vol: 0.14, pan: -0.3 }, bass: { vol: 0.23 }, shk: { vol: 0.75, pan: 0.3 }, snap: { vol: 0.9, pan: -0.15 } },
    step(E, L, i, t, sd) {
      const s = i % 8, bar = (i >> 3) % 8, pass = (i >> 6) % 4, B = pass === 2, ch = chordAt(B ? PROG_B : PROG_A, bar, s), n = (B ? MEL_B : MEL_A)[i % 64];
      if (n) {
        const [m, d] = n, v = s % 4 ? 0.85 : 1;
        if (B) INST.whistle(E, L.mel, t, m, d * sd, v * 0.3);   // sostenida, suena más que la marimba
        else {
          INST.mallet(E, L.mel, t, m, d * sd, v);
          if (pass === 1) INST.bell(E, L.mel, t, m + 12, d * sd, v * 0.22);   // segunda vuelta: campanita una octava arriba
          const h = pass === 3 && d >= 2 ? harmonyBelow(m, ch) : null; if (h !== null) INST.mallet(E, L.mel, t, h, d * sd, v * 0.5);   // cuarta: a dos voces
        }
      }
      if (B ? s === 3 || s === 7 : s % 2) for (const m of voicing(ch, 55)) INST.keys(E, L.keys, t, m, sd * 0.6, 1);
      const r = rootIn(ch, 48);
      if (B) { if (s === 0) INST.bass(E, L.bass, t, r, sd * 2.5, 1); else if (s === 4) INST.bass(E, L.bass, t, r + 7, sd * 2, 0.9); }
      else if (s % 2 === 0) INST.bass(E, L.bass, t, s % 4 ? r + 7 : r, sd * 0.9, s ? 0.85 : 1);
      INST.shaker(E, L.shk, t, 0, 0, s % 2 ? 1 : 0.5);
      if (B ? s === 4 : s === 2 || s === 6) INST.snap(E, L.snap, t, 0, 0, 1);
    } },
  casa: { bpm: 72, swing: 0, wet: 0.6, vol: 0.18, key: 5, meter: 8, noRun: true, low: { arp: 0.35 },   // caja de música en fa, con arpegio y un colchón suave; la segunda vuelta es la parte B
    layers: { mel: { vol: 0.41, pan: 0.15 }, arp: { vol: 0.1, pan: -0.25 }, bass: { vol: 0.03 }, pad: { vol: 0.012 } },
    step(E, L, i, t, sd) {
      const K = 5, s = i % 8, bar = (i >> 3) % 8, pass = (i >> 6) % 3, B = pass === 1, prog = B ? PROG_B : PROG_A, ch = chordAt(prog, bar, s), n = (B ? MEL_B : MEL_A)[i % 64];
      if (n) { const [m, d] = n, v = s % 4 ? 0.8 : 1; INST.bell(E, L.mel, t, m + K, d * sd, v); if (pass === 2) INST.bell(E, L.mel, t, m + K + 12, d * sd, v * 0.3); }
      const vc = voicing(ch, 55); INST.bell(E, L.arp, t, [vc[0], vc[vc.length - 1], vc[1], vc[vc.length - 1]][s % 4] + K, sd, s % 4 ? 0.8 : 1);
      const split = prog[bar].length > 1;
      if (s === 0 || (s === 4 && split)) {
        const len = (split ? 4 : 8) * sd;
        INST.pad(E, L.bass, t, rootIn(ch, 48) + K, len, 1);
        for (const m of voicing(ch, 60)) INST.pad(E, L.pad, t, m + K, len, 1);
      }
    } },
  bosque: { bpm: 76, swing: 0, wet: 0.45, vol: 0.1, key: 7, meter: 8, low: { harp: 0.4 },   // arpa en sol; la flautita toca el tema en la primera y la tercera vuelta, en las otras quedan el arpa y los pájaros
    layers: { mel: { vol: 0.22, pan: 0.15 }, harp: { vol: 0.4, pan: -0.2 }, bass: { vol: 0.028 } },
    step(E, L, i, t, sd) {
      const K = 7, s = i % 8, bar = (i >> 3) % 8, pass = (i >> 6) % 4, B = pass >= 2, prog = B ? PROG_B : PROG_A, ch = chordAt(prog, bar, s);
      const n = pass % 2 ? null : (B ? MEL_B : MEL_A)[i % 64]; if (n) INST.flute(E, L.mel, t, n[0] + K, n[1] * sd, s % 4 ? 0.8 : 1);
      INST.harp(E, L.harp, t, harpTones(ch, 41)[(pass % 2 ? ARPS[3] : ARPS[0])[s]] + K, sd, s ? 0.7 : 1);
      const split = prog[bar].length > 1; if (s === 0 || (s === 4 && split)) INST.pad(E, L.bass, t, rootIn(ch, 41) + K, (split ? 4 : 8) * sd, 1);
    } },
  montes: { bpm: 60, swing: 0, wet: 0.7, vol: 0.24, key: 2, meter: 8, low: { bell: 0.35 },   // en re: colchón amplio que entra despacio y campanitas sueltas (las notas fuertes del tema, luego al azar); más arriba, menos notas
    layers: { pad: { vol: 0.015 }, low: { vol: 0.02 }, bell: { vol: 0.4, pan: 0.2 } },
    step(E, L, i, t, sd) {
      const K = 2, s = i % 8, bar = (i >> 3) % 8, pass = (i >> 6) % 2, ch = PROG_M[bar], few = (E.param.alt || 0) * 0.7;
      if (s === 0) { const len = 8 * sd + 1.2; for (const m of voicing(ch, 55)) INST.pad(E, L.pad, t, m + K, len, 1, 1.6); INST.pad(E, L.low, t, rootIn(ch, 43) + K, len, 1, 1.6); }   // se enciman mientras entra el siguiente
      if (pass === 0) { const n = MEL_A[i % 64]; if (n && s % 4 === 0 && Math.random() >= few) INST.bell(E, L.bell, t, n[0] + K + 12, 0, 0.8); }
      else if (s % 2 === 0 && Math.random() < 0.3 * (1 - few)) INST.bell(E, L.bell, t, choose(voicing(ch, 72)) + K, 0, rand(0.5, 0.9));
    } },
  pueblo: { bpm: 150, swing: 0, wet: 0.3, vol: 0.155, key: 9, meter: 6, low: { chords: 0.3, shk: 0 },   // vals en la: acordeón con el tema en 3/4, bajo en el uno, acordes en el dos y el tres; suena más cerca del kiosco
    layers: { mel: { vol: 0.12, pan: 0.1 }, chords: { vol: 0.05, pan: -0.25 }, bass: { vol: 0.25 }, bell: { vol: 0.3, pan: 0.3 }, shk: { vol: 0.6, pan: 0.2 }, drum: { vol: 0.4, pan: 0.25 } },
    step(E, L, i, t, sd) {
      const K = -3, s = i % 6, bar = Math.floor(i / 6) % 16, pass = Math.floor(i / 96) % 3, ch = PROG_W[bar], n = MEL_W[i % 96], v0 = 0.5 + 0.5 * (E.param.near == null ? 1 : E.param.near);
      if (s === 0) { E.beat0 = t; E.beatLen = 6 * sd; }   // dónde cae el uno: los músicos del kiosco se mueven con esto (06-main.js)
      if (E.param.band && (s === 0 || s === 2 || s === 4)) { (s ? INST.snare : INST.drum)(E, L.drum, t, 0, 0, v0 * E.param.band * (s ? 0.35 : 1)); E.drumHits = (E.drumHits || 0) + 1; }   // la banda: bum, cha, cha
      if (n) {
        const [m, d] = n; INST.accordion(E, L.mel, t, m + K, d * sd, v0 * (s ? 0.85 : 1));
        const h = pass === 1 ? harmonyBelow(m, ch) : null; if (h !== null) INST.accordion(E, L.mel, t, h + K, d * sd, v0 * 0.45);   // segunda vuelta: a dos voces
        if (pass === 2) INST.bell(E, L.bell, t, m + K + 12, 0, v0 * 0.6);   // tercera: con campanita
        if (E.param.band) INST.horn(E, L.mel, t, m + K, d * sd * 0.9, v0 * 0.42 * E.param.band);   // de 7 a 10 de la noche toca la banda: trompeta con el acordeón
      }
      if (s === 0) INST.bass(E, L.bass, t, rootIn(ch, 45) + K + (bar % 2 ? 7 : 0), sd * 1.6, v0);   // raíz y quinta, compás por compás
      else if (s === 2 || s === 4) for (const m of voicing(ch, 57)) INST.accordion(E, L.chords, t, m + K, sd * 0.7, v0 * (s === 2 ? 1 : 0.8));
      if (s % 2 === 0) INST.shaker(E, L.shk, t, 0, 0, v0 * (s ? 0.6 : 1));
    } },
  sinfin: { bpm: 66, swing: 0, wet: 0.55, vol: 0.12, key: 7, meter: 8, low: { harp: 0.4 },   // nunca igual: los acordes pasean al azar, el arpa cambia de dibujo y la flautita inventa frases cortas, con silencios
    layers: { mel: { vol: 0.23, pan: 0.15 }, harp: { vol: 0.34, pan: -0.2 }, pad: { vol: 0.015 } },
    step(E, L, i, t, sd) {
      const s = i % 8, bar = i >> 3;
      if (i === 0 || !E.gen) E.gen = { ch: 'Em', arp: ARPS[0], play: false, cell: [], note: 76 };
      const G = E.gen;
      if (s === 0 && bar % 2 === 0) { if (i) G.ch = choose(WANDER[G.ch]); G.arp = choose(ARPS); for (const m of voicing(G.ch, 55)) INST.pad(E, L.pad, t, m, 16 * sd + 1, 1, 1.2); }
      if (s === 0) {   // cada compás: ¿frase o silencio?, y con qué ritmo (dos compases suele tocar, dos suele callar)
        G.play = Math.random() < (bar % 4 < 2 ? 0.8 : 0.2); G.cell = []; let k = 0; for (const d of choose(RHYTHMS)) { G.cell[k] = d; k += d; }
      }
      const d = G.play && G.cell[s];
      if (d) {   // camina por la escala cerca de la nota anterior; en tiempo fuerte cae en una nota del acorde
        const pcs = voicing(G.ch, 0).map((x) => x % 12); let j = clamp(PENT.indexOf(G.note) + choose([-2, -1, -1, 1, 1, 2]), 0, PENT.length - 1);
        if (s % 4 === 0) { const ok = PENT.map((x, q) => q).filter((q) => pcs.includes(PENT[q] % 12)); if (ok.length) j = ok.reduce((a, q) => (Math.abs(q - j) < Math.abs(a - j) ? q : a)); }
        G.note = PENT[j]; INST.flute(E, L.mel, t, G.note, d * sd, rand(0.7, 1));
      }
      const a = G.arp[s]; if (a !== null) INST.harp(E, L.harp, t, harpTones(G.ch, 40)[a], sd, s % 4 ? rand(0.55, 0.75) : 0.9);
    } },
  cuna: { bpm: 84, swing: 0, wet: 0.65, vol: 0.14, key: 5, meter: 6, noRun: true, low: {},   // al dormir: caja de música con el vals del tema, despacito, en fa
    layers: { mel: { vol: 0.4, pan: 0.15 }, arp: { vol: 0.12, pan: -0.25 }, pad: { vol: 0.01 } },
    step(E, L, i, t, sd) {
      const K = 5, s = i % 6, bar = Math.floor(i / 6) % 16, pass = Math.floor(i / 96) % 2, ch = PROG_W[bar], n = MEL_W[i % 96];
      if (n) INST.bell(E, L.mel, t, n[0] + K + (pass ? 12 : 0), 0, (s ? 0.75 : 0.9) * (pass ? 0.5 : 1));   // la segunda vuelta, una octava arriba y más bajito
      if (s % 2 === 0) { const vc = voicing(ch, 53); INST.bell(E, L.arp, t, vc[[0, 2, 1][s / 2]] + K, 0, s ? 0.7 : 0.9); }   // un arpegio por tiempo: grave, agudo, en medio
      if (s === 0) for (const m of voicing(ch, 57)) INST.pad(E, L.pad, t, m + K, 6 * sd + 0.8, 1, 1);
    } },
};
// al correr: shaker en cada corchea, bloque de madera en el uno (y a contratiempo en 4/4), palmada en los tiempos débiles
function runPerc(E, i, t, meter, v) {
  const s = i % meter, d = E.runBus;
  INST.shaker(E, d, t, 0, 0, v * (s % 2 ? 0.55 : 0.9));
  if (s === 0 || (meter === 8 && s === 3)) INST.wood(E, d, t, 0, 0, v * (s ? 0.3 : 0.45));   // seno puro: pica más de lo que mide
  if (meter === 8 ? s === 2 || s === 6 : s === 2 || s === 4) INST.snap(E, d, t, 0, 0, v * 0.7);
}
// la fanfarria de las cimas: [segundo, nota, duración, fuerza], en do (se transporta a la música que suena)
const FANFARE = [[0, 67, 0.1, 0.8], [0.13, 67, 0.1, 0.8], [0.26, 67, 0.1, 0.8], [0.4, 72, 0.36, 1], [0.4, 64, 0.36, 0.6], [0.82, 76, 0.15, 0.9], [1, 79, 0.15, 0.9],
  [1.2, 84, 0.9, 1], [1.2, 79, 0.9, 0.55], [1.2, 76, 0.9, 0.55], [1.2, 48, 0.9, 0.7]];
// Mezcla de cada lugar: qué pieza, cuánto de cada capa (lo que no aparece va entero) y lo de fondo (`amb`: pájaros, río, viento, de 0 a 1).
const MUSIC_ZONES = {
  casa: { piece: 'casa', mix: {}, amb: {} },
  jardin: { piece: 'ciudad', mix: { keys: 0.8, bass: 0.8, shk: 0.45, snap: 0 }, amb: { birds: 0.3 } },
  parque: { piece: 'ciudad', mix: { bass: 0.9, shk: 0.7, snap: 0.5 }, amb: { birds: 0.45 } },
  ciudad: { piece: 'ciudad', mix: {}, amb: { birds: 0.1 } },
  camino: { piece: 'bosque', mix: { mel: 0.8, harp: 0.85 }, amb: { birds: 0.55, wind: 0.1 } },
  bosque: { piece: 'bosque', mix: {}, amb: { birds: 1, river: 1, wind: 0.06 } },
  montes: { piece: 'montes', mix: {}, amb: { birds: 0.5, wind: 0.25 } },
  pueblo: { piece: 'pueblo', mix: {}, amb: { birds: 0.35, wind: 0.05 } },
  sinfin: { piece: 'sinfin', mix: {}, amb: { birds: 1, wind: 0.12 } },
  cuna: { piece: 'cuna', mix: {}, amb: {} },   // dormido (en la cama o en la hamaca); lo de fondo sigue al lugar
};
// lo de fondo de un lugar: `near` es qué tan cerca está el río (0 a 1) y `alt` la altura en las montañas (0 a 1): arriba, más viento y menos pájaros.
// `night` (0 a 1, de 01-core.js: 1 − day.light): de noche los pájaros duermen y cantan los grillos (donde hay pájaros, y algo en la ciudad);
// en el camino y los bosques ulula un búho.
const OWL_ZONES = { camino: 0.6, bosque: 1, sinfin: 1 };
// `rain` (0 a 1): lloviendo callan los pájaros y casi todos los grillos, y suena la lluvia.
function ambFor(key, near, alt, night, rain) {
  const a = (MUSIC_ZONES[key] || {}).amb || {}, up = key === 'montes' ? alt : 0, n = night || 0, low = Math.max(0, 1 - up * 1.6), r = rain || 0;
  return { birds: (a.birds || 0) * low * (1 - n) * (1 - r), river: (a.river || 0) * near, wind: Math.min(1, (a.wind || 0) + up * 0.75),
    crickets: a.birds ? n * Math.min(1, a.birds + 0.4) * low * (1 - 0.8 * r) : 0, owls: n * (OWL_ZONES[key] || 0) * (1 - r), rain: r };
}
// gota en el techo (lloviendo, adentro de la casa): un tic corto
function drip(E, d, t) { noiseHit(E, d, t, rand(0.4, 1), 'bandpass', rand(2200, 3400), 3, 0.02); }
// grillo: tres o cuatro pulsos agudos muy cortos; cada uno de un lado y a su tono
function cricket(E, d, t) {
  const c = E.ctx, g = c.createGain(), f = rand(4100, 5200), n = 2 + Math.floor(Math.random() * 3);
  g.gain.value = rand(0.4, 1);
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = rand(-0.9, 0.9); g.connect(p); p.connect(d); } else g.connect(d);
  for (let k = 0; k < n; k++) { const t0 = t + k * 0.045, o = osc(c, 'sine', f, t0, t0 + 0.03), e = c.createGain(); env(e, t0, 1, 0.004, 0.026); o.connect(e); e.connect(g); }
}
// búho: «uu… uu-uu», grave y suave
function owl(E, d, t) {
  const c = E.ctx, g = c.createGain(), f = rand(360, 420);
  g.gain.value = rand(0.6, 1);
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = rand(-0.7, 0.7); g.connect(p); p.connect(d); } else g.connect(d);
  for (const [at, len, k] of [[0, 0.42, 1], [0.62, 0.18, 0.96], [0.84, 0.5, 0.92]]) {
    const t0 = t + at, o = osc(c, 'sine', f * k, t0, t0 + len + 0.05), e = c.createGain();
    o.frequency.setValueAtTime(f * k * 1.04, t0); o.frequency.exponentialRampToValueAtTime(f * k * 0.97, t0 + len); env(e, t0, 0.9, 0.06, len); o.connect(e); e.connect(g);
  }
}
// pájaros: pío-pío, silbido de dos notas o trino; cada uno de un lado y a su distancia
function bird(E, d, t) {
  const c = E.ctx, g = c.createGain(), f = rand(0.85, 1.2), kind = Math.floor(Math.random() * 3);
  g.gain.value = rand(0.35, 1);
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = rand(-0.8, 0.8); g.connect(p); p.connect(d); } else g.connect(d);
  const chirp = (t0, f0, f1, len, v) => { const o = osc(c, 'sine', f0, t0, t0 + len), e = c.createGain(); o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + len); env(e, t0, v, 0.006, len); o.connect(e); e.connect(g); };
  if (kind === 0) { const n = 2 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) chirp(t + k * 0.1, 4300 * f, 2900 * f, 0.07, 1); }
  else if (kind === 1) { chirp(t, 2500 * f, 2700 * f, 0.16, 0.9); chirp(t + 0.22, 2000 * f, 1950 * f, 0.28, 0.8); }
  else { const o = osc(c, 'sine', 3300 * f, t, t + 0.45), lfo = osc(c, 'sine', 28, t, t + 0.45), lg = c.createGain(), e = c.createGain(); lg.gain.value = 420 * f; lfo.connect(lg); lg.connect(o.frequency); env(e, t, 0.7, 0.02, 0.45); o.connect(e); e.connect(g); }
}
const AMB_VOL = { river: 0.019, wind: 0.06, birds: 0.03, crickets: 0.012, owls: 0.035, rain: 0.014, drips: 0.025 }, RUN_VOL = 0.1, FX_VOL = 0.03;   // el río en la orilla: RMS ≈ 0.006, debajo de la música
function makeMusic(ctx, dest) {
  const sr = ctx.sampleRate, E = { ctx, cur: null, key: null, vol: 1, players: {}, steps: 0, param: { alt: 0, near: 1, run: false }, low: false, night: false, nightLv: 0, mixNow: {}, runLv: 0, runHits: 0, fanfares: 0 };
  E.noise = ctx.createBuffer(1, sr, sr); const nz = E.noise.getChannelData(0); for (let i = 0; i < sr; i++) nz[i] = Math.random() * 2 - 1;
  const n = Math.floor(sr * 2), ir = ctx.createBuffer(2, n, sr);   // reverberación: ruido que se apaga en 2 s
  for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
  E.verb = ctx.createConvolver(); E.verb.buffer = ir;
  E.out = ctx.createGain(); E.out.gain.value = 0;
  E.lpMax = Math.min(20000, sr / 2); E.lp = ctx.createBiquadFilter(); E.lp.type = 'lowpass'; E.lp.frequency.value = E.lpMax; E.lp.Q.value = 0.5;   // de noche se cierra: suena más suave (setNight)
  E.verb.connect(E.out); E.out.connect(E.lp); E.lp.connect(dest);   // sin compresor: agrega ganancia propia (≈5 dB en Chrome) y los picos no pasan de 0.1
  E.runBus = ctx.createGain(); E.runBus.gain.value = RUN_VOL; E.runBus.connect(E.out);   // la percusión de correr, igual en todas las piezas
  E.fx = ctx.createGain(); E.fx.gain.value = FX_VOL; E.fx.connect(dest);                 // la fanfarria es un efecto: suena aunque la música esté apagada
  for (const k in MUSIC) {
    const P = MUSIC[k], pl = { P, out: ctx.createGain(), L: {}, live: false, i: 0, next: 0, end: Infinity }, wet = ctx.createGain();
    pl.out.gain.value = 0; wet.gain.value = P.wet; pl.out.connect(E.out); pl.out.connect(wet); wet.connect(E.verb);
    for (const l in P.layers) {
      const g = ctx.createGain(); g.gain.value = 0;
      if (P.layers[l].pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = P.layers[l].pan; g.connect(p); p.connect(pl.out); } else g.connect(pl.out);
      pl.L[l] = g;
    }
    E.players[k] = pl;
  }
  const glide = (prm, v, t, tc) => { prm.cancelScheduledValues(t); prm.setTargetAtTime(v, t, tc); };
  // Lo de fondo va aparte de la música (sigue con «Solo efectos»): río y viento son ruido filtrado que se mueve solo, siempre corriendo
  // con volumen 0 donde no hay; los pájaros se agendan al azar.
  const A = E.amb = { out: ctx.createGain(), bird: ctx.createGain(), cric: ctx.createGain(), owl: ctx.createGain(), drip: ctx.createGain(), g: {}, lv: { river: 0, wind: 0, rain: 0 }, birds: 0, next: 0, calls: 0,
    crickets: 0, cnext: 0, chirps: 0, owls: 0, onext: 0, hoots: 0, roof: false, dnext: 0, drips: 0 };
  A.drip.gain.value = AMB_VOL.drips; A.drip.connect(A.out);
  A.out.connect(dest); A.bird.gain.value = AMB_VOL.birds; A.bird.connect(A.out);
  A.cric.gain.value = AMB_VOL.crickets; A.cric.connect(A.out); A.owl.gain.value = AMB_VOL.owls; A.owl.connect(A.out);
  const long = ctx.createBuffer(1, sr * 4, sr), ld = long.getChannelData(0); for (let i = 0; i < ld.length; i++) ld[i] = Math.random() * 2 - 1;
  const src = (off) => { const s = ctx.createBufferSource(); s.buffer = long; s.loop = true; s.start(0, off); return s; };
  const biq = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const wobble = (prm, f, depth) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = depth; o.connect(g); g.connect(prm); o.start(0); };
  for (const k of ['river', 'wind', 'rain']) { A.g[k] = ctx.createGain(); A.g[k].gain.value = 0; A.g[k].connect(A.out); }
  { const s = src(2.9), hp = biq('highpass', 500, 0.5), pat = biq('bandpass', 3600, 0.7), pg = ctx.createGain();   // lluvia: siseo parejo y un golpeteo
    A.rainLP = biq('lowpass', Math.min(9000, sr / 2), 0.5); pg.gain.value = 0.5; wobble(pg.gain, 3.1, 0.15);
    s.connect(hp); hp.connect(A.rainLP); s.connect(pat); pat.connect(pg); pg.connect(A.rainLP); A.rainLP.connect(A.g.rain); }
  { const s = src(0), hp = biq('highpass', 250, 0.5), lp = biq('lowpass', 1600, 0.4), bab = biq('bandpass', 1100, 4), bg = ctx.createGain();   // río: rumor y gorgoteo
    bg.gain.value = 0.6; wobble(bab.frequency, 0.7, 450); wobble(bab.frequency, 0.23, 300);
    s.connect(hp); hp.connect(lp); lp.connect(A.g.river); s.connect(bab); bab.connect(bg); bg.connect(A.g.river); }
  { const s = src(1.7), bp = biq('bandpass', 420, 1.1), gust = ctx.createGain();   // viento: una banda que sube y baja, y ráfagas
    wobble(bp.frequency, 0.07, 220); wobble(bp.frequency, 0.19, 90); gust.gain.value = 0.7; wobble(gust.gain, 0.11, 0.3);
    s.connect(bp); bp.connect(gust); gust.connect(A.g.wind); }
  E.ambient = (a, t) => {
    const roof = !!a.roof; if (roof !== A.roof) { A.roof = roof; glide(A.rainLP.frequency, roof ? 650 : Math.min(9000, sr / 2), t, 0.3); }   // adentro, la lluvia se oye apagada
    A.rainK = a.rain || 0;
    for (const k of ['river', 'wind', 'rain']) { const v = a[k] || 0; if (Math.abs(v - A.lv[k]) > 0.01 || (v === 0 && A.lv[k] !== 0)) { A.lv[k] = v; glide(A.g[k].gain, v * AMB_VOL[k], t, 0.8); } }
    A.birds = a.birds || 0; A.crickets = a.crickets || 0; A.owls = a.owls || 0;
  };
  E.pumpAmb = (now, until) => {
    if (A.next < now) A.next = now + rand(0.2, 1.5);
    while (A.next < until) { if (Math.random() < A.birds) { bird(E, A.bird, A.next); A.calls++; } A.next += rand(1.1, 3.4); }
    if (A.cnext < now) A.cnext = now + rand(0.1, 0.5);
    while (A.cnext < until) { if (Math.random() < A.crickets) { cricket(E, A.cric, A.cnext); A.chirps++; } A.cnext += rand(0.18, 0.6); }
    if (A.dnext < now) A.dnext = now + rand(0.05, 0.3);
    while (A.dnext < until) { if (A.roof && Math.random() < A.rainK) { drip(E, A.drip, A.dnext); A.drips++; } A.dnext += rand(0.08, 0.35); }   // gotas en el techo
    if (A.onext < now) A.onext = now + rand(2, 6);
    while (A.onext < until) { if (Math.random() < A.owls * 0.55) { owl(E, A.owl, A.onext); A.hoots++; } A.onext += rand(6, 12); }
  };
  // volumen de una capa: el de la pieza, por la mezcla del lugar, por lo que queda con una necesidad baja
  const layerVol = (pl, l) => pl.P.layers[l].vol * (l in E.mixNow ? E.mixNow[l] : 1) * ((E.low || E.night) && l in pl.P.low ? pl.P.low[l] : 1);
  // otro lugar: si es la misma pieza solo cambian las capas; si no, la de antes se apaga y la nueva empieza desde el principio
  E.zone = (key, t) => {
    const Z = MUSIC_ZONES[key]; if (!Z) return;
    const pl = E.players[Z.piece], first = !E.cur, same = E.cur === pl; E.mixNow = Z.mix;
    for (const l in pl.L) glide(pl.L[l].gain, layerVol(pl, l), t, same ? 0.5 : 0.01);
    if (!same) {
      if (E.cur) { glide(E.cur.out.gain, 0, t, 0.35); E.cur.end = t + 1.5; }
      pl.i = 0; pl.next = t + (E.cur ? 0.8 : 0.05); pl.end = Infinity; pl.live = true;
      glide(pl.out.gain, pl.P.vol, pl.next, 0.12); E.cur = pl;
    }
    if (first) glide(E.out.gain, E.vol, t, 0.5);
    E.key = key;
  };
  // con una necesidad baja, una parte alegre de la pieza se calla (despacio)
  E.setLow = (on, t) => { if (!!on === E.low) return; E.low = !!on; if (E.cur) for (const l in E.cur.L) glide(E.cur.L[l].gain, layerVol(E.cur, l), t, 1.2); };
  // de noche (n de 0 a 1) la música se oye más suave: se cierra un filtro y, ya oscuro, la parte alegre se calla como con una necesidad baja
  E.setNight = (n, t) => {
    if (Math.abs(n - E.nightLv) > 0.02 || (n === 0 && E.nightLv !== 0)) { E.nightLv = n; glide(E.lp.frequency, Math.min(E.lpMax, 20000 * Math.pow(2600 / 20000, n)), t, 1.5); }
    const on = n > 0.6; if (on === E.night) return; E.night = on; if (E.cur) for (const l in E.cur.L) glide(E.cur.L[l].gain, layerVol(E.cur, l), t, 2);
  };
  // la música se agacha mientras suena un premio y luego vuelve
  E.duck = (t, dur) => { if (!E.cur) return; glide(E.out.gain, E.vol * 0.35, t, 0.04); E.out.gain.setTargetAtTime(E.vol, t + dur, 0.35); };
  E.tune = () => (E.cur ? Math.pow(2, ((((E.cur.P.key % 12) + 18) % 12) - 6) / 12) : 1);   // a la tonalidad más cercana: de −6 a +5 semitonos
  E.fanfare = (t, k) => {
    const tr = Math.round(12 * Math.log2(k || 1));
    for (const [at, m, d, v] of FANFARE) INST.horn(E, E.fx, t + at, m + tr, d, v);
    INST.bell(E, E.fx, t + 1.2, 96 + tr, 0, 0.35); E.duck(t, 2.4); E.fanfares++;
  };
  E.stop = (t) => { glide(E.out.gain, 0, t, 0.12); for (const k in E.players) E.players[k].end = Math.min(E.players[k].end, t); E.cur = null; E.key = null; };
  // programa las corcheas que caen antes de `until`; lo atrasado (pestaña oculta, un cuadro que tardó) se salta sin sonar
  E.pump = (now, until) => {
    for (const k in E.players) {
      const pl = E.players[k], sd = 30 / pl.P.bpm; if (!pl.live) continue;
      if (pl.next < now) { const skip = Math.ceil((now - pl.next) / sd); pl.next += skip * sd; pl.i += skip; }
      while (pl.next < until && pl.next < pl.end) {
        const t = pl.next + (pl.i % 2 ? pl.P.swing * sd : 0); pl.P.step(E, pl.L, pl.i, t, sd);
        if (pl === E.cur && !pl.P.noRun) { E.runLv += ((E.param.run ? 1 : 0) - E.runLv) * 0.3; if (E.runLv > 0.03) { runPerc(E, pl.i, t, pl.P.meter || 8, E.runLv); E.runHits++; } }   // entra y sale en unas corcheas
        pl.i++; pl.next += sd; E.steps++;
      }
      if (pl.next >= pl.end) pl.live = false;
    }
  };
  return E;
}
