
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
  panza: { label: 'Panza', drain: 1 / 720, mood: 'enojado', fill: 'el refri de casa y las bayas del bosque',
    lines: ['¡Mi panza hace ruidos!', 'Tengo hambre…', 'Se me antoja algo rico…'], tip: 'Tamachin tiene hambre: abre el refri de casa o come bayas en el bosque.' },
  energia: { label: 'Energía', drain: 1 / 1080, mood: 'dormido', fill: 'una siesta en su cama y la fogata del bosque',
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
    const act = P.speedN > 1.3 ? 1.6 : P.speedN > 0.1 ? 1.15 : 1;
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
};
const quests = { conejo: 0, peces: 0, fuente: 0, gelatina: 0 };
function startQuest(id) { if (quests[id]) return; quests[id] = 1; toast('Nuevo encargo: ' + QUESTS[id].title + '. Está en el diario.', 4.5); SFX.pop(); renderDiary(); save(); }
function finishQuest(id) {
  quests[id] = 2; toast('¡Encargo cumplido! ' + QUESTS[id].title, 4.5); SFX.yay(); gain('diversion', 0.3);
  burst('star', player.pos.x, player.pos.y + 1.8, player.pos.z, 6); renderDiary(); save();
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ shape: player.T.shape, color: player.T.color, mood: player.baseMood,
      needs: { panza: +needs.panza.toFixed(3), energia: +needs.energia.toFixed(3), diversion: +needs.diversion.toFixed(3) }, quests }));
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
function goSleep() {
  const P = player; P.state = 'sleep'; P.sleepT = 0; P.vx = P.vz = P.vy = 0; P.pos.set(-4.4, 1.46, -9.85); P.heading = 0; P.T.lie = 1;
  setTemp('dormido', 999); say(P, 'Zzz…', 2);
}
function wake() {
  const P = player; if (P.state !== 'sleep' || P.sleepT < 0.8) return;
  P.state = 'normal'; P.T.lie = 0; P.pos.set(-2.7, 0, -10.4); clearTemp(); P.T.doTrick('hop'); say(P, '¡Qué buena siesta!', 2); SFX.nice();
}

// ───────────────────────── comer ─────────────────────────
// Lo que sale del refri: piezas propias (no las de la repisa), con el origen en la base.
const FOODS = {
  gelatina: { line: '¡Ñam! Gelatina de mango.', from: [5.27, 0.2, -12.13], make: (b) => b.cyl('#ffffff', 0, 0.02, 0, 0.26, 0.26, 0.04, 18).cyl('#ffb347', 0, 0.15, 0, 0.15, 0.2, 0.24, 18).cyl('#ffd27a', 0, 0.275, 0, 0.14, 0.14, 0.02, 18).sph('#ff5d5d', 0, 0.31, 0, 0.05) },
  tamal: { line: '¡Ñam! Un tamalito recién hecho.', from: [4.85, 0.7, -12.13], make: (b) => b.rbox('#d9c27a', 0, 0.09, 0, 0.42, 0.16, 0.2, 0.07).rbox('#f2c94c', 0.02, 0.12, 0.01, 0.3, 0.12, 0.17, 0.05).cone('#c9b067', -0.26, 0.09, 0, 0.08, 0.14, 6) },
  sandia: { line: '¡Glup! Juguito de sandía.', from: [5.48, 0.72, -12.19], make: (b) => b.cyl('#dff6ff', 0, 0.15, 0, 0.11, 0.09, 0.3, 14).cyl('#ff5d73', 0, 0.13, 0, 0.1, 0.085, 0.24, 14).cyl('#ffffff', 0.05, 0.33, 0, 0.012, 0.012, 0.22, 6, 0, -0.3).add(gCyl(1, 12), '#58b368', -0.1, 0.27, 0, 0.07, 0.02, 0.07, Math.PI / 2, 0, 0.5) },
  helado: { line: '¡Mmm! Helado de vainilla.', from: [5.33, 1.66, -12.17], make: (b) => b.add(gCone(10), '#d9a066', 0, 0.13, 0, 0.1, -0.26, 0.1).sph('#fff4d6', 0, 0.3, 0, 0.12).sph('#ff9db8', 0.03, 0.41, 0.02, 0.09).sph('#ff3b4f', 0.02, 0.51, 0.03, 0.035) },
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

// bayas: hasta tres saltan del arbusto a su boca, una tras otra
function eatBerries(b) {
  const P = player, ripe = b.berries.filter((q) => q.k >= 0.999).slice(0, 3); if (!ripe.length) return;
  const face = Math.atan2(b.x - P.pos.x, b.z - P.pos.z), first = !b.tasted; b.tasted = true;
  berryBits.forEach((m, i) => { m.material.color.set(b.kind.color); m.visible = false; m.userData.q = ripe[i]; });
  startBusy({ dur: 1.35 + 0.18 * ripe.length, cam: null,
    update(dt, t) {
      const s = this; turnTo(P, t < 0.9 ? face : 0, dt, 9);
      ripe.forEach((q, i) => {
        const m = berryBits[i], t0 = 0.15 + i * 0.18, k = (t - t0) / 0.38;
        if (k >= 0 && k < 1) {
          if (!m.visible) { m.visible = true; q.k = 0; setBerry(b, q); berryMesh.instanceMatrix.needsUpdate = true; m.scale.setScalar(0.118 * b.s); }
          mouthAt(_ev, 0.12); arc(m.position, _ev2.set(q.x, q.y, q.z), _ev, k, 0.5);
        } else if (k >= 1 && m.visible) { m.visible = false; P.T.poke(2.4); SFX.munch(); mouthAt(_ev, 0.2); burst('crumb', _ev.x, _ev.y, _ev.z, 2); q.back = clock + rand(50, 75); }
      });
      if (once(s, 'say', 0.2)) say(P, first ? '¡Ñam! ' + b.kind.name[0].toUpperCase() + b.kind.name.slice(1) + '.' : choose(['¡Qué jugosas!', '¡Ñam, ñam!', '¡Mmm, dulcecitas!']), 1.8);
      if (once(s, 'full', 0.6 + 0.18 * ripe.length)) { gain('panza', 0.06 * ripe.length); burst('heart', P.pos.x, P.pos.y + 1.8, P.pos.z, 2); }
    },
  });
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
interacts.push({ pos: { x: -2.8, z: -10.5 }, range: 1.7, label: 'Dormir una siesta', act: goSleep });
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
    + (quests[k] === 2 ? QUESTS[k].done : QUESTS[k].hint) + '</p></li>').join('');
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
  if (P.state === 'busy') { const b = P.busy; b.t += dt; b.update(dt, b.t); if (b.t >= b.dur) { P.busy = null; P.state = 'normal'; if (b.end) b.end(); } }

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
  ui.zoom = damp(ui.zoom, ui.zoomTarget, 6, dt);
  if (!camInit) camLead.x = camLead.z = 0;
  updateLead(dt);
  if (ui.closeup) { oy = 0.5; oz = 5.8; ty = P.pos.y + 0.78 * sc; if (wide) tx += 1.3; else { oy = 2.5; oz = 6.4; ty = P.pos.y - 0.5; } }
  else {
    const z = ui.zoom; if (P.inHouse) { oy = 8.4 * Math.min(z, 1.1); oz = 7.2 * Math.min(z, 1.1); } else { oy = 7.6 * z; oz = 11.2 * z; } ty = Math.max(P.pos.y, -0.3) * 0.6 + 1.25;
    const f = z * camLead.k; tx = clamp(tx + camLead.x * f, -LIMIT, LIMIT); tz = clamp(tz + camLead.z * f, WORLD_N, LIMIT);   // sin mirar más allá del borde
  }
  if (P.state === 'busy' && P.busy.cam) { const c = P.busy.cam; tx = c.x; ty = c.y; tz = c.z; ox = c.ox || 0; oy = c.oy; oz = c.oz; }   // toma cercana (el refri)
  _ct.set(tx, ty, tz); _cp.set(tx + ox, ty + oy, tz + oz);
  if (!camInit) { camPos.copy(_cp); camTgt.copy(_ct); camInit = true; }
  else { const k = 1 - Math.exp(-(ui.closeup ? 4 : 5.5) * dt); camPos.lerp(_cp, k); camTgt.lerp(_ct, k); }
  camSlope = (camPos.y - ty) / Math.max(1, camPos.z - P.pos.z);    // pendiente real del rayo cámara→Tamachin (con adelanto y retraso)
  camera.position.copy(camPos); camera.lookAt(camTgt);
  skyMesh.position.copy(camPos);
  sun.target.position.set(P.pos.x, 0, P.pos.z - 6); sun.position.copy(sun.target.position).add(SUN_OFF);
  _sv.set(P.pos.x, P.pos.y + 0.75 * sc, P.pos.z).project(camera);
  pScreen.x = (_sv.x * 0.5 + 0.5) * VW; pScreen.y = (-_sv.y * 0.5 + 0.5) * VH; pScreen.r = pxRadius(P.pos.x, P.pos.y + 0.75 * sc, P.pos.z, 0.75 * sc);
}

// ¿El rayo cámara→Tamachin pasa sobre la planta del edificio por debajo de su altura? sx: deriva lateral del rayo por metro hacia el sur.
// Edificio al sur de Tamachin: margen amplio (2.2 m), como siempre. Edificio a un lado: solo si el rayo entra (pasa con el adelanto lateral).
function rayCrosses(o, x, z, sx, back) {
  const m = o.z0 - z > -0.3 ? 2.2 : 0.8;
  let a = Math.max(0, o.z0 - z), b = Math.min(o.z1 - z, back);                   // tramo en dz (metros al sur de Tamachin)
  if (Math.abs(sx) > 1e-4) { const p = (o.x0 - m - x) / sx, q = (o.x1 + m - x) / sx; a = Math.max(a, Math.min(p, q)); b = Math.min(b, Math.max(p, q)); }
  else if (x < o.x0 - m || x > o.x1 + m) return false;
  return a <= b && a * camSlope < o.h + 1.5;
}
function fadeMat(m, op) { m.opacity = op; const tr = op < 0.985; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } }
const treeDirty = [false, false];
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
  if (z > -70) for (const o of occluders) {
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
  if (P.state === 'normal' && !ui.closeup) for (const it of interacts) { const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z); if (d < it.range && d < bd && (!it.ok || it.ok())) { bd = d; best = it; } }
  curInteract = best;
  const label = P.state === 'sleep' ? 'Despertar' : best ? (typeof best.label === 'function' ? best.label() : best.label) : null;
  if (label !== lastPrompt) { lastPrompt = label; promptEl.hidden = !label; promptText.textContent = label || ''; tAct.textContent = label || 'Truco'; }
  hudT -= dt; if (hudT <= 0) { hudT = 0.2; const zn = zoneName(); if (zn !== lastZone) { lastZone = zn; zoneEl.textContent = zn; document.documentElement.style.setProperty('--hud-h', topEl.offsetHeight + 'px'); } syncNeedsHud(); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
  if (!helpEl.hidden && P.moved > 14) helpEl.hidden = true;
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
  updateFish(dt); updateNeeds(dt); updateQuests(dt); updateBerries(dt); updateFridge(dt);
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
  restoreQuests();
  if (typeof s.x === 'number' && typeof s.z === 'number') { player.pos.set(clamp(s.x, -LIMIT, LIMIT), 0, clamp(s.z, WORLD_N, LIMIT)); resolvePlayer(); }
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
