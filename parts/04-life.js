
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
function rectLoop(x0, x1, z0, z1) { const w = x1 - x0, h = z1 - z0; return { x0, x1, z0, z1, w, h, L: 2 * (w + h) }; }
function loopAt(R, t, out) {
  t = ((t % R.L) + R.L) % R.L;
  if (t < R.w) { out.x = R.x0 + t; out.z = R.z0; out.tx = 1; out.tz = 0; }
  else if (t < R.w + R.h) { out.x = R.x1; out.z = R.z0 + (t - R.w); out.tx = 0; out.tz = 1; }
  else if (t < 2 * R.w + R.h) { out.x = R.x1 - (t - R.w - R.h); out.z = R.z1; out.tx = -1; out.tz = 0; }
  else { out.x = R.x0; out.z = R.z1 - (t - 2 * R.w - R.h); out.tx = 0; out.tz = -1; }
  return out;
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
addNPC({ name: 'Pistacho', shape: 'bola', color: '#35c9a0', mood: 'contento', loop: rectLoop(-4.6, 4.6, -49.6, -40.4) });
addNPC({ name: 'Canela', shape: 'gatito', color: '#e8a063', mood: 'asombrado', loop: rectLoop(-17, 17, -60, -30.5) });
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
