
// ───────────────────────── el túnel de las montañas (mundos/tunel.js) ─────────────────────────
// La carretera a Valle Alegre (03-world.js, 05-norte.js) pasa por debajo de las montañas: un túnel de unos 400 m con curvas suaves,
// lámparas de sodio en el techo y banquetas. Es un mundo aparte (como la luna): se entra empujando contra una de las dos bocas de la
// Tierra (MOUTHS: la sur, al salir del bosque, y la norte, junto a Valle Alegre) y se sale por la otra punta. Dentro no hay cielo ni
// tiempo; la luz es tibia y la cámara se queda dentro del tubo (`camFit`). Al cargar solo se registra; el tubo se arma la primera vez.
// Usa sus propios números (nada de `rnd`) y sus propios colisionadores: la Tierra no cambia.
// La línea central va de la boca de la ciudad (d = 0, al sur) a la de Valle Alegre (d = len, al norte): ir a Valle Alegre es ir al norte,
// como afuera. `TUBE.W`: del centro a la pared; las banquetas empiezan en `TUBE.walk` y suben 0.2 m.
const TUBE = { W: 5.6, wall: 3.8, top: 6.4, walk: 4.3, door: 14, lamp: 12 };   // door: las puntas, a 14 m de cada extremo (detrás queda lugar para la cámara)
const TUBE_PATH = roadPath([[0, 6], [0, -30], [7, -110], [-6, -200], [6, -290], [0, -370], [0, -404]]);
TUBE.len = TUBE_PATH.len;
// lo más cerca de la línea central: el tubo siempre avanza hacia el norte (z baja), así que se busca por z y se afina alrededor
const _tn = { x: 0, z: 0, tx: 0, tz: -1, nx: 1, nz: 0 };
function tubeNear(x, z, o) {
  const R = TUBE_PATH; let lo = 0, hi = R.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.z[m] > z) lo = m; else hi = m; }
  let best = Infinity, bd = 0;
  for (let i = Math.max(0, lo - 4); i <= Math.min(R.n - 2, lo + 4); i++) {
    const ax = R.x[i], az = R.z[i], ex = R.x[i + 1] - ax, ez = R.z[i + 1] - az, L2 = ex * ex + ez * ez, t = L2 ? clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1) : 0;
    const q = Math.hypot(x - ax - ex * t, z - az - ez * t); if (q < best) { best = q; bd = i + t; }
  }
  roadAt(R, bd, _tn); o.d = bd; o.u = (x - _tn.x) * _tn.nx + (z - _tn.z) * _tn.nz; o.cx = _tn.x; o.cz = _tn.z; o.tx = _tn.tx; o.tz = _tn.tz; o.nx = _tn.nx; o.nz = _tn.nz;
  return o;
}
// la altura del techo a `u` metros del centro: pared derecha hasta 3.8 m y luego una bóveda hasta 6.4 m
const tubeRoof = (u) => TUBE.wall + (TUBE.top - TUBE.wall) * Math.sqrt(Math.max(0, 1 - (u / TUBE.W) * (u / TUBE.W)));
const _tq = {};
function tubeY(x, z) { tubeNear(x, z, _tq); return Math.abs(_tq.u) > TUBE.walk ? 0.2 : 0; }   // las banquetas, un escalón arriba
// a dónde se llega en cada punta: d, hacia dónde camina (heading: 0 es +z) y hacia dónde mira la cámara
function tubeEnd(north) {
  const o = {}, d = north ? TUBE.len - TUBE.door - 1.3 : TUBE.door + 1.3; roadAt(TUBE_PATH, d, o);
  const h = Math.atan2(north ? -o.tx : o.tx, north ? -o.tz : o.tz);   // hacia dentro del tubo
  return { x: o.x, z: o.z, heading: h, yaw: h + Math.PI, pet: { x: o.x - Math.sin(h) * 2.2, z: o.z - Math.cos(h) * 2.2 } };
}
// en la Tierra: la boca `m` (MOUTHS, 05-norte.js), su lado de afuera y hacia dónde se camina para entrar
const mouthOut = (m, z) => (z - m.face) * -m.inw;                   // cuánto hacia afuera del frente
function mouthExit(m) {                                               // dónde aparece al salir por esa boca, mirando hacia afuera
  const z = m.face - m.inw * 1.3, h = m.inw < 0 ? 0 : Math.PI;
  return { x: m.x, z, heading: h, yaw: h + Math.PI, pet: { x: m.x, z: m.face - m.inw * 2.6 } };
}
// sus pasos: los de la piedra con eco
STEPS.tunel = (c, d, t, v, r) => { STEPS.piedra(c, d, t, v, r); STEPS.piedra(c, d, t + 0.11, v * 0.32, r * 0.97); STEPS.piedra(c, d, t + 0.23, v * 0.12, r * 0.95); };
// su música: el tema despacito en campanitas lejanas, con mucho eco, sobre un colchón grave
MUSIC.tunel = { bpm: 60, swing: 0, wet: 0.92, vol: 0.2, key: -3, meter: 8, low: { bell: 0.4 },
  layers: { pad: { vol: 0.012 }, low: { vol: 0.02 }, bell: { vol: 0.3, pan: -0.15 } },
  step(E, L, i, t, sd) {
    const K = -3, s = i % 8, bar = (i >> 3) % 8, ch = PROG_B[bar][0];   // la segunda parte del tema, la de menor
    if (s === 0) { const len = 8 * sd + 1.4; for (const m of voicing(ch, 52)) INST.pad(E, L.pad, t, m + K, len, 1, 1.6); INST.pad(E, L.low, t, rootIn(ch, 38) + K, len, 1, 1.6); }
    const n = MEL_B[i % 64]; if (n && s % 2 === 0) INST.bell(E, L.bell, t, n[0] + K, 0, 0.6);
  } };
MUSIC_ZONES.tunel = { piece: 'tunel', mix: {}, amb: { wind: 0.12 } };   // un rumor de aire

const TUBE_LIGHT = { sky: new THREE.Color(0xffc98a), gnd: new THREE.Color(0x6e5136), fog: new THREE.Color(0x140f0b) };
WORLDS.tunel = {
  name: 'tunel', skyWord: 'en el túnel', skyText: 'En el túnel no se ve el cielo: del otro lado de la montaña sigue el día.',
  rules: RULES, night: 0, lantern: 1,                              // el farolito, siempre prendido
  hopLines: ['¡Hop, hop!', '(mira las lámparas)', '(sus orejas hacen eco)'],   // lo que dice un conejo que llega con él (travel, 06-main.js)
  ground: tubeY, surface: () => 'tunel',
  zone() { return 'Túnel de las Montañas'; },
  music: () => 'tunel',
  collide(pos, r) {                                                 // dentro del tubo, entre las dos puntas
    tubeNear(pos.x, pos.z, _tq); const lim = TUBE.W - (r || 0.3), u = clamp(_tq.u, -lim, lim), d = clamp(_tq.d, TUBE.door, TUBE.len - TUBE.door);
    if (u === _tq.u && d === _tq.d) return;
    const o = roadAt(TUBE_PATH, d, {}); pos.x = o.x + o.nx * u; pos.z = o.z + o.nz * u;
  },
  // la cámara no sale del tubo: entre las paredes y debajo de la bóveda (06-main.js, al final de updateCamera)
  camFit(p) {
    tubeNear(p.x, p.z, _tq); const u = clamp(_tq.u, -(TUBE.W - 0.5), TUBE.W - 0.5), d = clamp(_tq.d, 0.5, TUBE.len - 0.5);
    if (u !== _tq.u || d !== _tq.d) { const o = roadAt(TUBE_PATH, d, {}); p.x = o.x + o.nx * u; p.z = o.z + o.nz * u; }
    p.y = Math.min(p.y, tubeRoof(u) - 0.45);
  },
  // la luz, en vez de applyDay (la hora de afuera sigue corriendo): tibia, de las lámparas; sin sol ni estrellas; niebla oscura
  sky(force) {
    day.light = lightAt(day.h); day.warm = 0.6; day.stars = 0; day.lamps = 1;   // la luz de afuera (para el reloj); los faros prendidos (nightMat)
    for (const n of NIGHT_LIT) { n.mat.opacity = n.max; n.mat.visible = true; }
    sun.intensity = 0; hemi.color.copy(TUBE_LIGHT.sky); hemi.groundColor.copy(TUBE_LIGHT.gnd); hemi.intensity = 0.95;
    scene.fog.color.copy(TUBE_LIGHT.fog); scene.background.copy(TUBE_LIGHT.fog); scene.fog.near = 30; scene.fog.far = 120;
    for (const s of skyStars) s.material.opacity = 0;
    skyMoon.visible = false; skyBow.visible = false; skySun.visible = false;
    if (force) paintSky(TUBE_LIGHT.fog, TUBE_LIGHT.fog, TUBE_LIGHT.fog, 0);
  },
  enter() {}, leave() {},
  // en la Tierra: empujar contra el frente de una boca (es sólido, como los túneles de la ciudad) lleva al túnel
  onEarth() {
    const P = player;
    for (const m of MOUTHS) {
      const out = mouthOut(m, P.pos.z);
      if (m.armed === false) { if (out > 2.5 || Math.abs(P.pos.x - m.x) > 6) m.armed = true; continue; }   // al salir, primero se aleja
      if (P.state === 'normal' && !ui.closeup && Math.abs(P.pos.x - m.x) < 3.4 && out < 0.8 && out > -1 && P.vz * m.inw > 0.6) {
        m.armed = false; this.armed = false; const at = tubeEnd(m.key === 'norte'), inw = { x: Math.sin(at.heading) * 5, z: Math.cos(at.heading) * 5 };
        enterWorld('tunel', { at, walkIn: { x: 0, z: m.inw * 5 }, walkOut: inw, line: m.key === 'norte' ? '¡Al túnel, de vuelta a la ciudad!' : '¡Un túnel! Del otro lado está Valle Alegre.' });
        return;
      }
    }
  },
  // dentro: empujar contra una punta (donde se ve la luz de afuera) lleva a la boca de ese lado
  mid() {
    const M = this, P = player; tubeNear(P.pos.x, P.pos.z, _tq);
    if (M.armed === false) { if (_tq.d > TUBE.door + 2.5 && _tq.d < TUBE.len - TUBE.door - 2.5) M.armed = true; return; }
    if (P.state !== 'normal' || ui.closeup) return;
    const along = P.vx * _tq.tx + P.vz * _tq.tz, north = _tq.d > TUBE.len - TUBE.door - 0.5 && along > 0.6, south = _tq.d < TUBE.door + 0.5 && along < -0.6;
    if (!north && !south) return;
    M.armed = false; const m = MOUTHS.find((q) => q.key === (north ? 'norte' : 'sur')), at = mouthExit(m); m.armed = false;
    enterWorld('tierra', { at, walkIn: { x: _tq.tx * (north ? 5 : -5), z: _tq.tz * (north ? 5 : -5) }, walkOut: { x: Math.sin(at.heading) * 5, z: Math.cos(at.heading) * 5 },
      line: north ? '¡Valle Alegre!' : '¡Ya se ve la ciudad!' });
  },
  build(M) {
    const R = TUBE_PATH, n = Math.ceil(TUBE.len / 2);
    // el tubo: banquetas, paredes de azulejo con una franja y la bóveda, de un solo lado y hacia adentro (de afuera no se dibuja)
    const prof = [[TUBE.walk, 0, 'walk'], [TUBE.walk, 0.2, 'walk'], [TUBE.W, 0.2, 'walk'], [TUBE.W, 0.2, 'wall'], [TUBE.W, 1.0, 'wall'], [TUBE.W, 1.0, 'band'], [TUBE.W, 1.35, 'band'], [TUBE.W, 1.35, 'wall'], [TUBE.W, TUBE.wall, 'wall']];
    for (let k = 1; k < 12; k++) { const a = k / 12 * Math.PI; prof.push([TUBE.W * Math.cos(a), TUBE.wall + (TUBE.top - TUBE.wall) * Math.sin(a), 'roof']); }
    for (const p of prof.slice(0, 9).reverse()) prof.push([-p[0], p[1], p[2]]);   // la mitad izquierda, de arriba abajo
    const COL = { walk: new THREE.Color('#9d978c'), wall: new THREE.Color('#f1e6cf'), band: new THREE.Color('#2fa58c'), roof: new THREE.Color('#8c877f') };
    const K = prof.length, pos = [], col = [], uv = [], idx = [], o = {};
    let acc = 0; const along = [0]; for (let k = 1; k < K; k++) { acc += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]); along.push(acc); }
    for (let i = 0; i <= n; i++) {
      const d = Math.min(TUBE.len, i * 2); roadAt(R, d, o);
      for (let k = 0; k < K; k++) {
        const [u, y, kind] = prof[k], c = COL[kind]; pos.push(o.x + o.nx * u, y, o.z + o.nz * u); col.push(c.r, c.g, c.b); uv.push(along[k] / 2, d / 2);
        if (i < n && k < K - 1) { const a = i * K + k, b = a + 1, cc = a + K, dd = cc + 1; idx.push(a, b, cc, b, dd, cc); }
      }
    }
    const tiles = canvasTex(128, 128, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); g.fillStyle = 'rgba(80,70,60,.28)'; for (let v = 0; v < 128; v += 32) { g.fillRect(0, v, 128, 2); g.fillRect(v, 0, 2, 128); } });
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const tube = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: tiles })); tube.receiveShadow = true; M.root.add(tube);
    // el asfalto, como el de afuera
    { const p2 = [], u2 = [], i2 = []; let i = 0;
      for (let d = 0; ; d = Math.min(TUBE.len, d + 1)) {
        roadAt(R, d, o); for (const sd of [1, 0, -1]) { p2.push(o.x + o.nx * ROAD_HALF * sd, 0.01, o.z + o.nz * ROAD_HALF * sd); u2.push(0.5 - sd * 0.5, d / 3.2); }
        if (i) { const q = i * 3; i2.push(q - 3, q, q - 2, q - 2, q, q + 1, q - 2, q + 1, q - 1, q - 1, q + 1, q + 2); }
        i++; if (d >= TUBE.len) break;
      }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(u2, 2)); rg.setIndex(i2); rg.computeVertexNormals();
      const road = new THREE.Mesh(rg, roadMat); road.receiveShadow = true; M.root.add(road); }
    // lámparas de sodio en el techo (brillan solas) y la luz de afuera en cada punta (sin niebla: se ve desde lejos)
    const lampN = Math.floor(TUBE.len / TUBE.lamp), lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 1.8), new THREE.MeshBasicMaterial({ color: 0xffd08a }), lampN), q = new THREE.Quaternion(), mtx = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < lampN; k++) { roadAt(R, (k + 0.5) * TUBE.lamp, o); q.setFromAxisAngle(up, Math.atan2(o.tx, o.tz)); lamps.setMatrixAt(k, mtx.compose(new THREE.Vector3(o.x, TUBE.top - 0.08, o.z), q, new THREE.Vector3(1, 1, 1))); }
    lamps.raycast = () => {}; M.root.add(lamps);
    for (const end of [0, 1]) {                                        // la luz, justo detrás de cada punta: de espaldas no se dibuja (la cámara puede quedar detrás)
      roadAt(R, end ? TUBE.len - TUBE.door + 1.2 : TUBE.door - 1.2, o);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(TUBE.W * 2, TUBE.top), new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false }));
      glow.position.set(o.x, TUBE.top / 2, o.z); glow.rotation.y = Math.atan2(o.tx, o.tz) + (end ? Math.PI : 0); glow.raycast = () => {}; M.root.add(glow);
    }
    // letreros colgados del techo: a la entrada de cada lado, a dónde lleva
    for (const [d, text, back] of [[TUBE.door + 9, 'Valle Alegre ↑', false], [TUBE.len - TUBE.door - 9, 'Ciudad ↑', true]]) {
      roadAt(R, d, o); const h = 3.6 * 160 / 512, ry = Math.atan2(o.tx, o.tz) + (back ? 0 : Math.PI);   // de un lado el letrero; del otro, su espalda verde
      const s = new THREE.Mesh(new THREE.PlaneGeometry(3.6, h), new THREE.MeshLambertMaterial({ map: roadSignTex(text) })), b = new THREE.Mesh(new THREE.BoxGeometry(3.7, h + 0.1, 0.06), new THREE.MeshLambertMaterial({ color: 0x14573a }));
      s.position.set(o.x + Math.sin(ry) * 0.04, TUBE.top - 1.25, o.z + Math.cos(ry) * 0.04); b.position.set(o.x, TUBE.top - 1.25, o.z); s.rotation.y = b.rotation.y = ry; M.root.add(s, b);
    }
  },
};
