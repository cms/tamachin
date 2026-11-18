
// ───────────────────────── la luna (mundos/luna.js) ─────────────────────────
// Un mundo aparte (WORLDS en 01-core.js, setWorld en 06-main.js). Se llega caminando hacia dentro del túnel de los autos del noreste
// (24, −60), el de la placa con la luna pintada, y se vuelve por el túnel que hay en la orilla del Cráter Grande. Aquí se pesa un
// tercio (salta unos 4 m) y se resbala un poco; el cielo es negro, con estrellas, el sol y la Tierra; no hay tiempo ni agua.
// Al cargar solo se registra: el mundo, su música, sus pasos, su encargo, la placa del túnel y la calma de los autos en esa boca.
// Lo demás se arma la primera vez que Tamachin llega (`build`). Usa sus propias semillas (mulberry), nunca `rnd`, y sus propios
// colisionadores (M.solids): la Tierra queda igual (la prueba `mundo` no ve nada nuevo).
const LUNA = { base: 3, R: 52, half: 80, cell: 1.25, rim: 6.5 };   // base: el suelo va de 3 m para arriba (los cráteres no bajan de 0)
const LUNA_CRATERS = [{ x: -19, z: 6, r: 8, d: 2.2 }, { x: 21, z: 13, r: 6, d: 1.7 }, { x: 5, z: 30, r: 5, d: 1.3 }, { x: -27, z: -20, r: 7, d: 2 },
  { x: 24, z: -21, r: 4.5, d: 1.2 }, { x: -9, z: -26, r: 3.6, d: 0.9 }, { x: -6, z: 37, r: 3.2, d: 0.8 }];
// las bocas de los dos túneles: miran al sur (la de la Tierra a la ciudad, la de la luna al centro del cráter); su pared está en z
const EARTH_DOOR = { x: 24, face: -59.5, half: 3.4, armed: true }, LUNA_DOOR = { x: 0, z: -50, face: -49.5, half: 3.4, armed: false };
const LUNA_FLAG = { x: 0, z: 0 };
// la altura sin rejilla: la orilla del Cráter Grande, una loma en medio, los cráteres (hondonada y borde) y ondas suaves; `o` recibe
// cuánto es de cráter y de orilla (para el color)
function lunaRaw(x, z, o) {
  const d = Math.hypot(x, z), a = Math.atan2(z, x), rim = LUNA.rim * sstep(51, 64, d) * (1 + 0.12 * Math.sin(a * 5 + 0.7) + 0.06 * Math.sin(a * 11));
  let cr = 0;
  for (const c of LUNA_CRATERS) {
    const q = Math.hypot(x - c.x, z - c.z) / c.r; if (q > 2.2) continue;
    cr += (q < 1 ? -c.d * (1 - q * q) : 0) + c.d * 0.42 * Math.exp(-((q - 1) / 0.3) * ((q - 1) / 0.3));
  }
  const flat = sstep(5, 12, Math.hypot(x - LUNA_DOOR.x, z - LUNA_DOOR.z - 4));   // frente al túnel, llano
  const wav = (0.22 * Math.sin(x * 0.13 + z * 0.07) * Math.sin(z * 0.11 - x * 0.05) + 0.1 * Math.sin(x * 0.31 + 1.2) * Math.sin(z * 0.27 - 0.4)) * flat;
  if (o) { o.cr = cr; o.rim = rim; }
  return LUNA.base + rim + cr + 1.1 * Math.exp(-(d / 6.5) * (d / 6.5)) + wav;
}
// rejilla: la malla y los pies de Tamachin usan los mismos triángulos (como terrainY en 05-norte.js); fuera de ella, la fórmula
const LG = { x0: -LUNA.half, z0: -LUNA.half, s: LUNA.cell, n: Math.round(2 * LUNA.half / LUNA.cell) + 1 };
let LH = null;
function lunaY(x, z) {
  const fx = (x - LG.x0) / LG.s, fz = (z - LG.z0) / LG.s;
  if (!LH || fx < 0 || fz < 0 || fx >= LG.n - 1 || fz >= LG.n - 1) return lunaRaw(x, z);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * LG.n + i;
  const h00 = LH[k], h10 = LH[k + 1], h01 = LH[k + LG.n], h11 = LH[k + LG.n + 1];
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
// pintado a mano en un lienzo: la luna creciente de la placa en la Tierra, y la Tierra (la placa de la luna y el cielo)
const crescentTex = canvasTex(64, 64, (g) => {
  g.fillStyle = '#fff1a8'; g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.fill();
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(44, 24, 20, 0, TAU); g.fill();
});
const earthTex = canvasTex(128, 128, (g) => {
  const R = mulberry(4064), halo = g.createRadialGradient(64, 64, 40, 64, 64, 62);
  halo.addColorStop(0, 'rgba(140,200,255,.55)'); halo.addColorStop(1, 'rgba(140,200,255,0)'); g.fillStyle = halo; g.fillRect(0, 0, 128, 128);
  g.save(); g.beginPath(); g.arc(64, 64, 44, 0, TAU); g.clip();
  g.fillStyle = '#2f73d6'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#56b65a'; for (const [x, y, rx, ry, a] of [[48, 46, 16, 11, 0.5], [80, 70, 12, 18, -0.3], [56, 86, 10, 7, 0.2], [88, 38, 8, 6, 0.9]]) { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(20 + R() * 88, 20 + R() * 88, 6 + R() * 12, 2 + R() * 3, R() * 3, 0, TAU); g.fill(); }
  const sh = g.createLinearGradient(20, 0, 108, 0); sh.addColorStop(0, 'rgba(0,0,0,.75)'); sh.addColorStop(0.45, 'rgba(0,0,0,.1)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh; g.fillRect(0, 0, 128, 128); g.restore();   // la noche de la Tierra, del lado izquierdo
});
const paintDisc = (tex, r) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 })); m.raycast = () => {}; return m; };

// ── en la Tierra: la placa del túnel (con la luna, que de noche brilla) y la boca donde los autos esperan sin pitar ──
{
  const z = EARTH_DOOR.face + 0.23, disc = paintDisc(crescentTex, 0.52);   // el frente de la placa (03-world.js: PF_PORTAL) está en −59.28
  disc.position.set(EARTH_DOOR.x, 4.3, z); scene.add(disc);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.52, 24), nightMat(0xfff1a8, 0.9, { map: crescentTex })); glow.position.set(EARTH_DOOR.x, 4.3, z + 0.01); glow.raycast = () => {}; scene.add(glow);
  CALM.push({ x0: EARTH_DOOR.x - 4.4, x1: EARTH_DOOR.x + 4.4, z0: -66, z1: -53.5 });   // hasta dentro del túnel: al entrar camina 2.5 m por él
}
// el paso que suena en la luna: polvo suave
STEPS.polvo = (c, d, t, v, r) => { swish(c, d, t, 0.055 * v, 'bandpass', 950 * r, 0.7, 0.08); swish(c, d, t + 0.015, 0.016 * v, 'bandpass', 2100 * r, 1.2, 0.03); };
// su música: colchón con novenas que entra despacio, el tema en campanitas sueltas una octava arriba y un arpegio que titila
MUSIC.luna = { bpm: 54, swing: 0, wet: 0.85, vol: 0.2, key: 4, meter: 8, low: { bell: 0.35, arp: 0.3 },
  layers: { pad: { vol: 0.013 }, low: { vol: 0.018 }, bell: { vol: 0.36, pan: 0.2 }, arp: { vol: 0.1, pan: -0.3 } },
  step(E, L, i, t, sd) {
    const K = 4, s = i % 8, bar = (i >> 3) % 8, pass = (i >> 6) % 2, ch = PROG_M[bar];
    if (s === 0) { const len = 8 * sd + 1.4; for (const m of voicing(ch, 55)) INST.pad(E, L.pad, t, m + K, len, 1, 1.8); INST.pad(E, L.low, t, rootIn(ch, 40) + K, len, 1, 1.8); }
    const n = MEL_A[i % 64];
    if (pass === 0 && n && s % 2 === 0) INST.bell(E, L.bell, t, n[0] + K + 12, 0, 0.75);
    else if (pass === 1 && s % 2 === 0 && Math.random() < 0.35) INST.bell(E, L.bell, t, choose(voicing(ch, 76)) + K, 0, rand(0.4, 0.8));
    if (s % 2) { const vc = voicing(ch, 67); INST.bell(E, L.arp, t, vc[(i >> 1) % vc.length] + K, 0, 0.55); }
  } };
MUSIC_ZONES.luna = { piece: 'luna', mix: {}, amb: {} };   // sin aire: sin pájaros, viento ni grillos

const LUNA_SUN = new THREE.Vector3(0.62, Math.sin(32 * DEG), 0.62).normalize(), LUNA_BLACK = new THREE.Color(0, 0, 0), LUNA_HEMI = [new THREE.Color(0x8f9bbf), new THREE.Color(0x3b3b44)];
WORLDS.luna = {
  name: 'luna', skyWord: 'en la luna', skyText: 'En la luna no hay nubes ni lluvia: el cielo siempre es negro y se ven las estrellas.',
  rules: Object.assign({}, RULES, { grav: RULES.grav / 3, accel: 5, stop: 4.5 }), night: 0,
  quests: { luna: { title: 'Una bandera en la luna', hint: 'Planta tu bandera en la loma del centro del Cráter Grande. Y salta: en la luna pesas menos.', done: 'Tu bandera quedó plantada en la luna.' } },
  ground: lunaY, surface: () => 'polvo',
  zone() { const p = player.pos; return Math.hypot(p.x - LUNA_DOOR.x, p.z - LUNA_DOOR.z) < 8 ? 'Túnel a la Tierra' : Math.hypot(p.x, p.z) < 7 ? 'Centro del Cráter Grande' : 'La luna'; },
  music: () => 'luna',
  collide(pos) { const d = Math.hypot(pos.x, pos.z); if (d > LUNA.R) { pos.x *= LUNA.R / d; pos.z *= LUNA.R / d; } },   // la orilla del cráter
  // el cielo y la luz, en vez de applyDay (la hora de la Tierra sigue corriendo): negro, siempre con estrellas y el sol, un sol blanco que
  // pega fuerte desde el sureste y bajo (sombras largas), poca luz de lo demás
  sky(force) {
    day.light = 0.4; day.warm = 0; day.stars = 1; day.lamps = 0;   // el farolito, un poco prendido
    sun.color.setRGB(1, 1, 1); sun.intensity = 0.95; SUN_OFF.copy(LUNA_SUN).multiplyScalar(LIGHT_D);
    hemi.color.copy(LUNA_HEMI[0]); hemi.groundColor.copy(LUNA_HEMI[1]); hemi.intensity = 0.34;
    scene.fog.color.copy(LUNA_BLACK); scene.background.copy(LUNA_BLACK); scene.fog.near = 55; scene.fog.far = 170;
    for (const s of skyStars) s.material.opacity = 1;
    skyMoon.visible = false; skyBow.visible = false;
    skySun.visible = true; skySun.material.opacity = 1; skySun.material.color.copy(SUN_DISC); skySun.position.copy(LUNA_SUN).multiplyScalar(470);
    if (force) paintSky(LUNA_BLACK, LUNA_BLACK, LUNA_BLACK, 0);
  },
  enter() {
    const M = this; M.earth.visible = true; M.flag.visible = quests.luna === 2; M.flag.k = 1; M.greet = true;   // ya plantada: entera
    M.homePitch = camView.pitchT; camView.pitch = camView.pitchT = Math.min(camView.pitchT, 16 * DEG);   // la cámara baja: que se vean la Tierra y las estrellas
    // (homePitch: la altura de la Tierra; es la que se guarda, y al volver se pone otra vez)
  },
  leave() { const M = this; M.earth.visible = false; if (M.homePitch != null) camView.pitch = camView.pitchT = M.homePitch; M.homePitch = null; },
  // en la Tierra: caminar hacia dentro de la boca del túnel (empujando contra la pared negra) lleva a la luna
  onEarth() {
    const P = player, D = EARTH_DOOR;
    if (!D.armed) { if (P.pos.z > D.face + 2.5 || Math.abs(P.pos.x - D.x) > 6) D.armed = true; return; }   // al volver, primero se aleja
    if (P.state === 'normal' && !ui.closeup && Math.abs(P.pos.x - D.x) < D.half && P.pos.z < D.face + 0.8 && P.pos.z > D.face - 1 && P.vz < -0.6) {
      D.armed = false; LUNA_DOOR.armed = false;
      enterWorld('luna', { at: { x: LUNA_DOOR.x, z: LUNA_DOOR.face - 1.3, heading: 0 }, walkIn: { x: 0, z: -5 }, walkOut: { x: 0, z: 5 }, line: '¡Estoy en la luna!' });
    }
  },
  mid(dt) {
    const M = this, P = player, D = LUNA_DOOR;
    if (M.greet && P.state === 'normal') { M.greet = false; if (!quests.luna) startQuest('luna'); }
    // de vuelta: por la boca del túnel del borde
    if (!D.armed) { if (P.pos.z > D.face + 2.5 || Math.abs(P.pos.x - D.x) > 6) D.armed = true; }
    else if (P.state === 'normal' && !ui.closeup && Math.abs(P.pos.x - D.x) < D.half && P.pos.z < D.face + 0.8 && P.vz < -0.6) {
      D.armed = false; EARTH_DOOR.armed = false;
      enterWorld('tierra', { at: { x: EARTH_DOOR.x, z: EARTH_DOOR.face - 1.3, heading: 0 }, walkIn: { x: 0, z: -5 }, walkOut: { x: 0, z: 5 }, line: '¡De vuelta en la Tierra!' });
    }
    // un salto de luna (más de 2.5 m) divierte; al caer, polvo
    const gy = lunaY(P.pos.x, P.pos.z);
    if (!P.onGround) M.air = Math.max(M.air || 0, P.pos.y - gy);
    else if (M.air) {
      if (M.air > 0.8) burst('puff', P.pos.x, P.pos.y + 0.1, P.pos.z, M.air > 2.5 ? 7 : 4);
      if (M.air > 2.5 && P.state === 'normal' && gain('diversion', 0.05, 'salto-luna', 6)) say(P, choose(['¡Qué salto!', '¡Casi toco las estrellas!', '¡Floto!', '¡Wiii, en la luna!']), 1.6);
      M.air = 0;
    }
    // la bandera sale del suelo al plantarla, y es del color de Tamachin
    const F = M.flag;
    if (F.visible) { F.k = Math.min(1, (F.k || 0) + dt * 2.2); F.scale.set(1, Math.max(0.01, ease(F.k)), 1); if (F.cloth.material.color.getHexString() !== P.T.color.replace('#', '').toLowerCase()) F.cloth.material.color.set(P.T.color); }
  },
  build(M) {
    const S = M.solids, R = mulberry(4062), c = new THREE.Color(), o = {}, n = new THREE.Vector3();
    // el suelo: la rejilla y su malla (sombreado suave por la rejilla; color por cráter y orilla, con un grano)
    LH = new Float32Array(LG.n * LG.n);
    const parts = []; for (let j = 0; j < LG.n; j++) for (let i = 0; i < LG.n; i++) { LH[j * LG.n + i] = lunaRaw(LG.x0 + i * LG.s, LG.z0 + j * LG.s, o); parts.push(o.cr, o.rim); }
    const hAt = (i, j) => LH[clamp(j, 0, LG.n - 1) * LG.n + clamp(i, 0, LG.n - 1)];
    const BASE = new THREE.Color('#bdb9b2'), DARK = new THREE.Color('#8a8781'), LIGHT = new THREE.Color('#dcd8d0'), RIM = new THREE.Color('#a8a39b');
    const pos = [], nor = [], col = [], uv = [], idx = [];
    for (let j = 0; j < LG.n; j++) for (let i = 0; i < LG.n; i++) {
      const k = j * LG.n + i, x = LG.x0 + i * LG.s, z = LG.z0 + j * LG.s, cr = parts[k * 2], rim = parts[k * 2 + 1];
      n.set(-(hAt(i + 1, j) - hAt(i - 1, j)) / (2 * LG.s), 1, -(hAt(i, j + 1) - hAt(i, j - 1)) / (2 * LG.s)).normalize();
      pos.push(x, LH[k], z); nor.push(n.x, n.y, n.z); uv.push(x / 5, z / 5);
      c.copy(BASE).lerp(DARK, clamp(-cr / 1.6, 0, 1) * 0.8).lerp(LIGHT, clamp(cr / 0.7, 0, 1) * 0.55).lerp(RIM, clamp(rim / LUNA.rim, 0, 1) * 0.7).multiplyScalar(0.94 + R() * 0.1);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < LG.n - 1; j++) for (let i = 0; i < LG.n - 1; i++) { const a = j * LG.n + i, b = a + 1, d = a + LG.n, e = d + 1; idx.push(a, d, b, e, b, d); }   // mismo corte que lunaY
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    const grain = canvasTex(128, 128, (q) => { q.fillStyle = '#ffffff'; q.fillRect(0, 0, 128, 128); const G = mulberry(4065);   // polvo gris: el color lo ponen los vértices
      for (let i = 0; i < 700; i++) { q.fillStyle = 'rgba(0,0,0,' + (0.015 + G() * 0.03).toFixed(3) + ')'; q.beginPath(); q.arc(G() * 128, G() * 128, 0.6 + G() * 1.8, 0, TAU); q.fill(); } });
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: grain })); ground.receiveShadow = true; ground.castShadow = true; M.root.add(ground);
    // piedras: chiquitas sueltas y peñascos donde subirse (con su colisionador: se para encima)
    const b = new Batch(), GREYS = ['#9c9890', '#aaa69e', '#8f8b84', '#b3afa7'];
    const clear = (x, z, m) => Math.hypot(x, z) > 7 + m && Math.hypot(x - LUNA_DOOR.x, z - LUNA_DOOR.z - 5) > 8 + m && Math.hypot(x, z) < LUNA.R + 4;
    for (let i = 0; i < 70; i++) {
      const a = R() * TAU, d = 8 + Math.sqrt(R()) * 50, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.15 + R() * R() * 0.6; if (!clear(x, z, 0)) continue;
      b.rock(GREYS[Math.floor(R() * 4)], x, lunaRaw(x, z) + s * 0.25, z, s, s * (0.5 + R() * 0.3), s * (0.8 + R() * 0.4), R() * TAU);
    }
    for (const [x, z, r, h] of [[-8, 15, 1.8, 2.2], [14, -8, 1.5, 1.8], [31, 3, 2, 2.6], [-33, 12, 1.6, 2], [-15, -39, 1.4, 1.7], [13, 41, 1.7, 2.3], [-37, -3, 1.2, 1.5], [36, -33, 1.8, 2.4]]) {
      const y = lunaRaw(x, z) - 0.3; b.rock(GREYS[Math.floor(R() * 4)], x, y + h / 2, z, r, h / 2, r * 0.9, R() * TAU); S.circle(x, z, r * 0.82, y + h - 0.05).step = 'piedra';
    }
    // el túnel de vuelta, metido en la orilla (como los de la ciudad, con la Tierra pintada en la placa) y un peñasco encima
    const STONE_L = '#c2bdb4';
    const pf = new Batch().box('#0b0a12', 0, 1.9, 5, 8.2, 3.8, 11).box(STONE_L, -4.55, 2.2, 0.9, 0.9, 4.4, 3).box(STONE_L, 4.55, 2.2, 0.9, 0.9, 4.4, 3)
      .box(STONE_L, 0, 4.3, 0.9, 10, 0.95, 3).box('#b8b1a3', 0, 4.3, -0.62, 1.4, 1.25, 0.2);
    b.merge(pf, LUNA_DOOR.x, LUNA.base, LUNA_DOOR.z, Math.PI); b.rock('#a29e96', LUNA_DOOR.x, LUNA.base + 2.5, LUNA_DOOR.z - 8, 8.5, 5.5, 7, 0.4);
    S.box(LUNA_DOOR.x - 5, LUNA_DOOR.x + 5, LUNA_DOOR.z - 11, LUNA_DOOR.face);
    const rocks = b.mesh(); M.root.add(rocks);
    const plate = paintDisc(earthTex, 0.56); plate.position.set(LUNA_DOOR.x, LUNA.base + 4.3, LUNA_DOOR.face + 0.23); M.root.add(plate);
    // la bandera (escondida hasta que se planta): asta blanca, varilla de lado (en la luna no hay viento) y la tela del color de Tamachin
    const F = new THREE.Group(), white = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }), cloth = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.04), new THREE.MeshLambertMaterial({ color: player.T.color }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.9, 8), white); pole.position.y = 1.45;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), white); rod.rotation.z = Math.PI / 2; rod.position.set(0.68, 2.85, 0);
    cloth.position.set(0.68, 2.4, 0); for (const m of [pole, rod, cloth]) { m.castShadow = true; F.add(m); }
    F.position.set(LUNA_FLAG.x, lunaRaw(LUNA_FLAG.x, LUNA_FLAG.z) - 0.05, LUNA_FLAG.z); F.rotation.y = -0.5; F.visible = false; F.cloth = cloth; M.root.add(F); M.flag = F;
    M.interacts = [{ pos: LUNA_FLAG, range: 2.8, label: 'Plantar tu bandera', ok: () => quests.luna !== 2, act: () => {
      const P = player, dx = P.pos.x - LUNA_FLAG.x, dz = P.pos.z - LUNA_FLAG.z, d = Math.hypot(dx, dz);
      if (d < 1.2) { const k = d > 0.01 ? 1.2 / d : 0; P.pos.x = LUNA_FLAG.x + (d > 0.01 ? dx * k : 0); P.pos.z = LUNA_FLAG.z + (d > 0.01 ? dz * k : 1.2); }   // que no quede encima del asta
      P.heading = Math.atan2(LUNA_FLAG.x - P.pos.x, LUNA_FLAG.z - P.pos.z);
      F.k = 0; F.visible = true; burst('star', LUNA_FLAG.x, F.position.y + 2.4, LUNA_FLAG.z, 8); P.T.doTrick('dance'); say(P, '¡Mi bandera en la luna!', 2.6); finishQuest('luna');
    } }];
    // la Tierra en el cielo: bajita hacia el norte (la cámara casi siempre mira hacia abajo), detrás del túnel de vuelta
    // la cámara mira hacia abajo: lo más alto que se ve son unos grados sobre el horizonte. Por eso es grande y sale detrás de la orilla
    const ea = 8 * DEG, ee = 3 * DEG;                               // un poco a la derecha, para que no quede detrás del nombre del lugar
    M.earth = skySprite(earthTex, 150); M.earth.position.set(Math.cos(ee) * Math.sin(ea), Math.sin(ee), -Math.cos(ee) * Math.cos(ea)).multiplyScalar(470); M.earth.visible = false;
  },
};
