
// ───────────────────────── Tamachin (jugador) ─────────────────────────
const SAVE_KEY = 'tamachin.v1';
const player = { T: makeTamachin({ shape: 'bola', color: '#ffc93c', mood: 'contento', scale: 1.3 }), vx: 0, vz: 0, vy: 0, heading: 0, onGround: true, state: 'normal', r: 0.62,
  baseMood: 'contento', tempMood: null, tempT: 0, onTempEnd: null, inv: 0, idleT: 0, speedN: 0, spin: 0, flySpin: 0, flatT: 0, sleepT: 0, inWater: false, inHouse: false, lastTrick: null, moved: 0,
  needLow: null, needMood: null, busy: null, carry: null, perch: null };
player.pos = player.T.pos; player.pos.set(0, 0, 3.5); player.bubblePos = player.T.bubblePos;
const ui = { closeup: false, zoom: 1, zoomTarget: 1, zoomIdx: 0, faceYaw: 0, shift: 0 };
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
  energia: { label: 'Energía', drain: 1 / 1080, mood: 'dormido', fill: 'una siesta en su cama o en la hamaca de Valle Alegre, y la fogata del bosque',
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
  amanecer: { title: 'El amanecer desde la cima', hint: 'Sube a una de las tres cimas y quédate ahí entre las 5 y las 6:30 de la mañana, cuando sale el sol. Dormido no cuenta: se despierta a las 7.', done: 'Viste salir el sol desde la cima.' },
  luciernagas: { title: 'Diez luciérnagas', hint: 'De noche, toca las luciérnagas o pasa junto a ellas (en el jardín, el parque, el camino y los bosques). Musgo te dará un frasco para que brillen en tu casa.', done: 'Diez luciérnagas brillan en un frasco sobre tu mesa.', progress: () => fliesCaught + ' de 10' },
  charcos: { title: 'Diez charcos', hint: 'Cuando llueve, salta en los charcos de las calles y los caminos: brinca en diez.', done: 'Brincaste en diez charcos. ¡Splash!', progress: () => puddleJumps + ' de 10' },
  arcoiris: { title: 'Un arcoíris', hint: 'Cuando deja de llover de día, sale un arcoíris del lado contrario al sol. Baja la cámara para ver el cielo.', done: 'Viste un arcoíris.' },
  frutas: { title: 'Las siete frutas', hint: 'Prueba naranjas, manzanas, uvas, arándanos, sandías, fresas y granadas del bosque sin fin, al norte de Valle Alegre.', done: 'Probaste las siete frutas del bosque sin fin.', progress: () => fruitsTasted.length + ' de 7' },
};
for (const k in WORLDS) Object.assign(QUESTS, WORLDS[k].quests);   // los de otros mundos (mundos/), al final
function reachSummit(p) {
  p.reached = true; if (summits.includes(p.name)) return;
  summits.push(p.name); const P = player; say(P, '¡Llegué a la cima del ' + p.name + '!', 3); P.T.doTrick('dance'); burst('star', P.pos.x, P.pos.y + 2, P.pos.z, 8); gain('diversion', 0.25);
  if (!quests.cumbres) startQuest('cumbres');
  fanfare();
  if (summits.length >= 3) finishQuest('cumbres', true); else { toast('Cima del ' + p.name + ': ' + summits.length + ' de 3.', 3.5); renderDiary(); save(); }
}
// premios: el de los encargos agacha la música un momento; en las cimas, fanfarria en la tonalidad de la música (si no hay motor, el premio de siempre)
function jingle() { SFX.yay(); const c = snd.ctx; if (mus && c && snd.music) mus.duck(c.currentTime, 1); }
function fanfare() { const c = snd.ctx; if (!snd.on || !c || c.state !== 'running') return; if (mus && !musErr) mus.fanfare(c.currentTime + 0.05, snd.tune); else SFX.yay(); }
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
const quests = { conejo: 0, peces: 0, fuente: 0, gelatina: 0, cumbres: 0, frutas: 0, amanecer: 0, luciernagas: 0, charcos: 0, arcoiris: 0 };
for (const k in WORLDS) for (const q in WORLDS[k].quests) quests[q] = 0;
let fliesCaught = 0, puddleJumps = 0;
const summits = [], fruitsTasted = [];          // nombres de las cimas alcanzadas y frutas probadas (claves de FRUITS)
function startQuest(id) { if (quests[id]) return; quests[id] = 1; toast('Nuevo encargo: ' + QUESTS[id].title + '. Está en el diario.', 4.5); SFX.pop(); renderDiary(); save(); }
function finishQuest(id, quiet) {   // quiet: ya sonó otra cosa (la fanfarria de la tercera cima)
  quests[id] = 2; toast('¡Encargo cumplido! ' + QUESTS[id].title, 4.5); if (!quiet) jingle(); gain('diversion', 0.3);
  burst('star', player.pos.x, player.pos.y + 1.8, player.pos.z, 6); renderDiary(); save();
}

function save() {
  const P = player, at = P.state === 'sleep' ? (BEDS[P.sleepSpot] || BEDS.cama).exit : P.pos;   // dormido: donde se levanta, no dentro de la cama
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ shape: P.T.shape, color: P.T.color, mood: P.baseMood,
      needs: { panza: +needs.panza.toFixed(3), energia: +needs.energia.toFixed(3), diversion: +needs.diversion.toFixed(3) }, quests, summits, fruits: fruitsTasted,
      mundo: world.name, x: +at.x.toFixed(2), z: +at.z.toFixed(2), heading: +P.heading.toFixed(2), yaw: +camView.yawT.toFixed(3), pitch: +(world.homePitch != null ? world.homePitch : camView.pitchT).toFixed(3), sound: snd.mode, helpSeen: helpEl.hidden, hora: +day.h.toFixed(3), dia: day.n, flies: fliesCaught, charcos: puddleJumps }));
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
  const R = world.rules;
  if (P.onGround) { P.vy = P.inWater ? R.jumpWater : P.perch && P.perch.bounce ? R.jumpBed : R.jump; P.onGround = false; P.T.poke(3.2); SFX.jump(); }   // desde la cama, más alto
  else P.jumpAsk = clock;                                           // rebotando en la cama: saltar justo antes de caer lo impulsa otra vez
}
// subirse a algo saltando divierte un poco (con la misma regla de siempre: no cuenta repetirlo seguido)
function perched(s) {
  const P = player;
  if (s.bounce) { if (gain('diversion', 0.03, 'cama', 2.5)) say(P, choose(['¡Boing!', '¡Boing, boing!', '¡Wiii!']), 1.2); return; }
  if (gain('diversion', 0.04, 'subir', 8)) { say(P, choose(['¡Desde aquí se ve todo!', '¡Qué alto!', '¡Lo logré!', '¡Soy el rey del mundo!']), 1.6); P.T.doTrick('wave'); }
}
function doAction() {
  const P = player;
  if (P.state === 'sleep') { wake(); return; }
  if (P.state !== 'normal') return;
  if (!ui.closeup && curInteract) curInteract.act(); else playerTrick();
}
// Ya no se usa: con el tráfico amable los autos no lo atropellan (resolvePlayer). Queda por si se quiere volver a los atropellos.
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
// De noche (de 8 de la noche a 5 de la mañana) se duerme hasta el día siguiente: el reloj corre `rate` horas por segundo hasta las 7
// y se despierta solo, con la energía llena. De día es una siesta de 9 s. Despertarlo antes deja el reloj donde iba.
const NIGHT_SLEEP = { wake: 7, rate: 2 };
const isNight = (h) => h >= DAY.set || h < DAY.rise;
function goSleep(where) {
  const P = player, b = BEDS[where] || BEDS.cama; P.sleepSpot = BEDS[where] ? where : 'cama';
  P.state = 'sleep'; P.sleepT = 0; P.vx = P.vz = P.vy = 0; P.pos.set(b.x, b.y, b.z); P.heading = 0; P.T.lie = 1; P.nightSleep = isNight(day.h);
  setTemp('dormido', 999); say(P, P.nightSleep ? 'Zzz… ¡Hasta mañana!' : 'Zzz…', 2);
}
function wake(morning) {
  const P = player; if (P.state !== 'sleep' || P.sleepT < 0.8) return; const b = BEDS[P.sleepSpot] || BEDS.cama;
  P.state = 'normal'; P.T.lie = 0; P.pos.set(b.exit.x, groundY(b.exit.x, b.exit.z), b.exit.z); P.sleepSpot = null; P.nightSleep = false; clearTemp(); P.T.doTrick('hop');
  say(P, morning === true ? '¡Buenos días!' : b.line, 2.4); SFX.nice();
}
function sleepThroughNight(dt) {
  const left = (NIGHT_SLEEP.wake - day.h + 24) % 24, step = NIGHT_SLEEP.rate * dt;
  if (left > step && left < 12) { setHour(day.h + step); return; }
  setHour(NIGHT_SLEEP.wake); needs.energia = 1; wake(true);
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
for (const sx of TOWN.stalls) interacts.push({ pos: { x: sx, z: TOWN.market.z + 2.0 }, range: 3.6, label: () => (marketOpen() ? 'Probar fruta del mercado' : 'Mercado cerrado'),
  act: () => { if (marketOpen()) eatMarket(sx); else say(player, 'Está cerrado… abre a las 8 de la mañana.', 2.4); } });
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
// ───────────────────────── a ciertas horas (el día y la noche están en 01-core.js) ─────────────────────────
// El mercado de Valle Alegre abre de 8 a 7 de la noche: cerrado, la fruta se tapa (TOWN.closed) y Lila se duerme en su puesto.
// De 7 a 10 de la noche toca la banda en el kiosco: cinco vecinos dejan su paseo, bailan alrededor y la música suena con trompeta.
const MARKET = { open: 8, close: 19 }, BAND = { from: 19, to: 22, r: 6.6, rain: false };   // rain: si toca aunque llueva
const marketOpen = () => day.h >= MARKET.open && day.h < MARKET.close;
const lila = npcBy('Lila'), musgo = npcBy('Musgo'), DANCERS = ['Tomate', 'Miel', 'Chabacano', 'Nopal', 'Brote'].map(npcBy);
lila.onTalk = () => (marketOpen() ? null : choose(['Zzz… el mercado abre a las 8…', 'Zzz… mañana hay fruta fresca…']));
// Musgo, junto a la fogata, de noche: el encargo de las luciérnagas
musgo.onTalk = () => {
  if (quests.luciernagas || day.light > 0.5) return null;
  startQuest('luciernagas'); return '¿Ves las luciérnagas? Atrapa diez y te doy un frasco para que brillen en tu casa.';
};
const town = { open: null, band: null };
function updateTownHours(dt) {
  const open = marketOpen();
  if (open !== town.open) { town.open = open; TOWN.closed.visible = !open; lila.T.setMood(open ? lila.mood0 : 'dormido'); }
  // Cada uno sigue su paseo (alrededor de su manzana) hasta la esquina más cercana al kiosco, cruza la calle hasta su lugar y baila;
  // al terminar regresa a esa esquina y sigue paseando desde ahí. Así nadie atraviesa los edificios. Con Tamachin lejos (más de 75 m
  // nadie camina, updateNPCs) se acomodan de golpe: no se ve.
  const band = day.h >= BAND.from && day.h < BAND.to && (BAND.rain || weather.rain < 0.3);   // con lluvia la banda se queda en casa
  if (band !== town.band) {
    town.band = band;
    DANCERS.forEach((n, i) => {
      if (band && !n.band) {
        const L = n.loop; let t1 = 0, best = Infinity;
        for (let t = 0; t < L.L; t += 0.5) { loopAt(L, t, _lp); const d = Math.hypot(_lp.x, _lp.z - TOWN_Z); if (d < best) { best = d; t1 = t; } }
        const a = 0.5 + i * TAU / DANCERS.length, x = Math.sin(a) * BAND.r, z = TOWN_Z + Math.cos(a) * BAND.r;
        n.band = { loop: L, t1, spot: { x, z, ry: Math.atan2(-x, TOWN_Z - z) }, phase: 'walk' };
      } else if (!band && n.band) { if (n.band.phase === 'walk') n.band = null; else n.band.phase = 'back'; }   // si no había llegado, sigue paseando
    });
  }
  const far = Math.hypot(player.pos.x, player.pos.z - TOWN_Z) > 75 + 60;
  for (const n of DANCERS) {
    const B = n.band; if (!B) continue;
    if (B.phase === 'walk') {
      const fw = ((B.t1 - n.t) % B.loop.L + B.loop.L) % B.loop.L, left = Math.min(fw, B.loop.L - fw);
      n.dir = fw < B.loop.L / 2 ? 1 : -1; n.pause = 0;
      if (left < 1 || far) { n.loop = null; n.home = B.spot; B.phase = 'dance'; if (far) { n.pos.set(B.spot.x, 0, B.spot.z); n.goto = null; } else n.goto = { x: B.spot.x, z: B.spot.z }; }
    } else if (B.phase === 'dance') { if (!n.goto && n.talkT <= 0 && Math.random() < dt * 0.45) n.T.doTrick(choose(['dance', 'dance', 'spin', 'hop'])); }
    else if (B.phase === 'back') {
      loopAt(B.loop, B.t1, _lp);
      if (far) { n.pos.set(_lp.x, 0, _lp.z); n.goto = null; }
      else if (!n.goto && Math.hypot(n.pos.x - _lp.x, n.pos.z - _lp.z) > 0.2) { n.goto = { x: _lp.x, z: _lp.z }; n.home = null; continue; }
      if (!n.goto) { n.loop = B.loop; n.t = B.t1; n.home = null; n.band = null; }
    }
  }
  if (jar.visible) { const k = 0.6 + 0.4 * Math.sin(clock * 2.3); jar.halo.material.opacity = (0.15 + 0.5 * (1 - day.light)) * k; jar.bugs.material.color.setScalar(0.7 + 0.3 * k); }   // el frasco late, más de noche
}
// Los músicos: tres en el kiosco, solo de 7 a 10 de la noche, con acordeón, trompeta y tambor. Se mecen al compás del vals
// (1.2 s por compás) y tocan: el acordeón se abre y se cierra, la trompeta sube en cada tiempo, la baqueta pega en el uno.
const BAND_KIT = (() => {
  const gold = '#f2c14e', mk = (fn) => { const B = new Batch(); fn(B); return B.mesh(MAT_SOFT, false); };
  return {
    acordeon: () => mk((B) => { B.rbox('#e84b4b', -0.3, 0, 0, 0.12, 0.44, 0.34, 0.03).rbox('#e84b4b', 0.3, 0, 0, 0.12, 0.44, 0.34, 0.03).box('#fff4d6', -0.3, 0.03, 0.18, 0.08, 0.32, 0.02);
      for (let i = 0; i < 5; i++) B.box(i % 2 ? '#3b2a4a' : '#fff4d6', -0.2 + i * 0.1, 0, 0, 0.09, 0.42, 0.3); }),
    trompeta: () => mk((B) => { B.cyl(gold, 0, 0, 0.22, 0.035, 0.035, 0.44, 10, Math.PI / 2).add(gCone(14), gold, 0, 0, 0.5, 0.15, 0.2, 0.15, -Math.PI / 2, 0, 0)
      .cyl(gold, 0.05, 0.06, 0.2, 0.025, 0.025, 0.12, 6).cyl(gold, 0, 0.06, 0.2, 0.025, 0.025, 0.12, 6).cyl(gold, -0.05, 0.06, 0.2, 0.025, 0.025, 0.12, 6); }),
    tambor: () => mk((B) => { B.cyl('#4b62d6', 0, 0, 0, 0.34, 0.34, 0.4, 18).cyl('#fff8e6', 0, 0.205, 0, 0.32, 0.32, 0.02, 18).cyl(gold, 0, 0.19, 0, 0.35, 0.35, 0.04, 18).cyl(gold, 0, -0.19, 0, 0.35, 0.35, 0.04, 18); }),
    baqueta: () => mk((B) => { B.cyl('#c9965b', 0, 0.2, 0, 0.02, 0.025, 0.4, 6).sph('#fff8e6', 0, 0.42, 0, 0.06); }),
  };
})();
const musicians = [['acordeon', 'gota', '#ff8fb1', -2.1, 1.0], ['trompeta', 'bola', '#58b368', 0, 1.7], ['tambor', 'cubito', '#7c9cff', 2.1, 1.0]].map(([kit, shape, color, x, dz], i) => {
  const T = makeTamachin({ shape, color, mood: i === 0 ? 'enamorado' : 'contento', scale: 1.05 }), d = SHAPES[shape], g = T.group;
  g.position.set(x, 0.98, TOWN_Z + dz);   // sobre la tarima del kiosco g.rotation.y = Math.atan2(x * 0.15, 1); g.visible = false; scene.add(g);
  const inst = BAND_KIT[kit](); g.add(inst);
  if (kit === 'acordeon') inst.position.set(0, d.handY + 0.05, 0.72);
  else if (kit === 'trompeta') { inst.position.set(0.12, d.mouthY, 0.5); inst.rotation.y = 0.75; }   // de lado: de frente parecía un pico
  else { inst.position.set(0, 0.32, 0.78); inst.rotation.x = 0.35; }
  const stick = kit === 'tambor' ? BAND_KIT.baqueta() : null; if (stick) { stick.position.set(0.32, d.handY, 0.62); g.add(stick); }
  const o = { kind: 'músico', T, pos: g.position, inst, stick, kit, clickR: 0.8, y0: 0.98, ph: i * 0.4, noteT: rand(0.5, 2) };
  o.bubblePos = (v) => v.set(o.pos.x, o.pos.y + 2.1, o.pos.z);
  o.interact = () => { say(o, choose(['¡Tocamos hasta las 10!', '¡Baila con nosotros!', '¡Un vals para Tamachin!', '¡Uno, dos, tres! ¡Uno, dos, tres!']), 2.6); T.doTrick('hop'); };
  o.update = (dt) => {
    const on = !!town.band; if (g.visible !== on) { g.visible = on; if (nearPlayer(o) < 40) burst('puff', o.pos.x, o.pos.y + 0.8, o.pos.z, 3); }
    if (!on) return;
    // el compás de la música que suena (el uno lo marca el vals al programarse); sin música, un reloj al mismo tempo
    const c = snd.ctx, M = mus && snd.music && mus.cur === mus.players.pueblo && mus.beat0 != null && c ? mus : null;
    const ph = M ? ((((c.currentTime - M.beat0) / M.beatLen) % 1) + 1) % 1 : (clock / 1.2) % 1, b3 = (ph * 3) % 1, beat = Math.pow(1 - b3, 3);
    g.position.y = o.y0 + 0.06 * beat; g.rotation.z = Math.sin(TAU * (ph + o.ph) / 2) * 0.07;
    if (kit === 'acordeon') inst.scale.x = 1 + 0.16 * Math.sin(TAU * ph);
    else if (kit === 'trompeta') inst.rotation.x = -0.12 - 0.12 * beat;
    else stick.rotation.x = 0.25 - (ph < 1 / 3 ? 1 : 0.45) * Math.pow(1 - b3, 6) * 1.1;   // golpe fuerte en el uno (bombo), suave en el dos y el tres
    if ((o.noteT -= dt) < 0 && nearPlayer(o) < 30) { o.noteT = rand(1.2, 2.6); emit('note', o.pos.x, o.pos.y + 1.9, o.pos.z); }
    T.update(dt, { speed: 0, near: nearPlayer(o) < 45 });
  };
  creatures.push(o); interacts.push({ pos: o.pos, range: 6.2, label: 'Escuchar a la banda', act: o.interact, who: o, ok: () => !!town.band });
  return o;
});
// ───────────────────────── el tiempo (el cielo y la luz cambian en applyDay, 01-core.js) ─────────────────────────
// Cada día, según su número: 1 de cada 5 llueve (un chubasco de 2 a 4 horas, entre las 9 y las 21), 1 de cada 4 está nublado y los
// demás hace sol; el primero siempre hace sol. ?clima=lluvia, nublado o sol lo fija para probar (no se guarda).
const WEATHER = { rain: 0.2, cloudy: 0.25, top: 180 };       // top: arriba de 180 m (los cerros) no llueve (ahí, en el paso 2, nieva)
function dayWeather(n) {
  if (n <= 1) return { kind: 'sol' };
  const R = mulberry(n * 7919 + 13), r = R();
  if (r < WEATHER.rain) { const from = 9 + R() * 8; return { kind: 'lluvia', from, to: from + 2 + R() * 2 }; }
  return { kind: r < WEATHER.rain + WEATHER.cloudy ? 'nublado' : 'sol' };
}
let wPlan = null;
function weatherAt(h) {                                          // { cloud, rain } que tocan a esta hora
  const f = weather.force;
  if (f) return f === 'lluvia' ? { cloud: 1, rain: 1 } : { cloud: f === 'nublado' ? 0.85 : f === 'arcoiris' ? 0.2 : 0, rain: 0 };
  if (!wPlan || wPlan.n !== day.n) { wPlan = dayWeather(day.n); wPlan.n = day.n; }
  weather.kind = wPlan.kind;
  if (wPlan.kind === 'nublado') return { cloud: 0.85, rain: 0 };
  if (wPlan.kind !== 'lluvia') return { cloud: 0, rain: 0 };
  const { from, to } = wPlan, up = smooth(from - 1.5, from - 0.3, h) * (1 - smooth(to + 0.3, to + 1.6, h));   // se nubla antes y despeja después
  return { cloud: 0.2 + 0.8 * up, rain: smooth(from, from + 0.3, h) * (1 - smooth(to - 0.3, to, h)) };
}
function updateWeather(dt, snap) {
  const W = weather, tg = weatherAt(day.h), P = player;
  if (W.force) W.kind = W.force;
  W.cloud = snap ? tg.cloud : damp(W.cloud, tg.cloud, 0.5, dt); W.rain = snap ? tg.rain : damp(W.rain, tg.rain, 0.7, dt);
  W.wet = snap ? (tg.rain > 0.5 ? 0.7 : 0) : clamp(W.wet + (W.rain > 0.3 ? dt / 50 * W.rain : -dt / 200), 0, 1);   // se llenan en ~50 s, se secan en ~3 min
  const high = smooth(WEATHER.top, WEATHER.top + 50, P.pos.y);
  W.here = W.rain * (1 - high); W.snow = W.rain * high;                       // arriba de los cerros, la lluvia es nieve
  // el arcoíris: cuando deja de llover de día (o con ?clima=arcoiris), por unas dos horas de juego
  if (W.rain > 0.5) W.rained = true;
  else if (W.rained && W.rain < 0.1) { W.rained = false; if (day.light > 0.6) { W.bowT = 120; if (!quests.arcoiris) startQuest('arcoiris'); toast('¡Salió un arcoíris! Está del lado contrario al sol: baja la cámara para verlo.', 4.5); } }
  W.bowT = Math.max(0, W.bowT - dt);
  W.bow = snap ? (W.force === 'arcoiris' ? 1 : 0) : damp(W.bow, (W.bowT > 0 || W.force === 'arcoiris') && day.light > 0.5 && W.rain < 0.1 ? 1 : 0, 0.8, dt);   // en cuanto deja de llover (el sol ya asoma)
  if (quests.arcoiris === 1 && W.bow > 0.6 && !P.inHouse) { W.bowSeen = (W.bowSeen || 0) + dt; if (W.bowSeen > 2) { finishQuest('arcoiris'); say(P, '¡Un arcoíris! ¡Qué bonito!', 3); P.T.doTrick('dance'); } }
  if (!quests.charcos && W.here > 0.4 && !P.inHouse) startQuest('charcos');   // la primera lluvia trae el encargo de los charcos
  updateRain(dt); updateSnow(dt); updatePuddles(); updateUmbrellas(dt);
}
// La lluvia: gotas (rayitas) que caen en una caja de 32 m alrededor de lo que se ve, con el mismo shader que la fogata (una llamada).
// Adentro de la casa no caen (se oyen en el techo, 01-core.js).
const rainDrops = (() => {
  const tex = canvasTex(16, 64, (g) => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.95)'); g.fillStyle = gr; g.fillRect(7, 0, 2, 64); });
  const S = fireParts(900, tex, THREE.NormalBlending); S.pts.visible = false; S.pts.renderOrder = 3; return S;
})();
const RAIN = { half: 15, speed: 13, wind: 1.2 };
function updateRain(dt) {
  const S = rainDrops, P = player, k = P.inHouse ? 0 : weather.here; S.pts.visible = k > 0.01;
  if (!S.pts.visible) { for (const p of S.list) p.born = false; return; }
  const c = camView.c, s = camView.s, cx = P.pos.x - s * 6, cz = P.pos.z - c * 6, top = P.pos.y + 14, floor = P.pos.y - 2, H = RAIN.half, C = camera.position;
  const n = Math.round(S.list.length * k), lum = 0.3 + 0.65 * day.light, a = S.a;
  S.list.forEach((p, i) => {
    if (!p.born || p.y < floor) { p.x = cx + rand(-H, H); p.z = cz + rand(-H, H); p.y = p.born ? top + rand(0, 2) : rand(floor, top); p.born = true; p.sp = 0.09; }
    if (p.x < cx - H) p.x += 2 * H; else if (p.x > cx + H) p.x -= 2 * H;
    if (p.z < cz - H) p.z += 2 * H; else if (p.z > cz + H) p.z -= 2 * H;
    p.y -= RAIN.speed * dt; p.x += RAIN.wind * dt;
    const near = smooth(3, 7, Math.hypot(p.x - C.x, p.y - C.y, p.z - C.z));   // pegadas a la cámara se verían como barras enormes
    a.position.setXYZ(i, p.x, p.y, p.z); a.size.setX(i, 0.6); a.alpha.setX(i, i < n ? 0.55 * near : 0); a.tint.setXYZ(i, 0.78 * lum, 0.85 * lum, 0.98 * lum); a.spin.setX(i, p.sp);
  });
  for (const key in a) a[key].needsUpdate = true;
}
// charcos: en las banquetas de la ciudad, el camino del jardín, el camino al bosque y las calles de Valle Alegre (con su propia semilla). Uno solo
// InstancedMesh; reflejan el color del cielo (la niebla) y aparecen y se secan con `wet`.
const puddles = (() => {
  const R = mulberry(8080), r2 = (a, b) => a + (b - a) * R(), pts = [];
  const walk = () => (R() < 0.5 ? -1 : 1) * r2(5.2, 6);   // en la ciudad, en las banquetas: brincar en charcos a media calle era jugar entre los autos
  for (const sx of [-24, 24]) for (let k = 0; k < 7; k++) { pts.push([sx + walk(), r2(-56, 56)]); pts.push([r2(-56, 56), sx + walk()]); }
  for (const z of [6.5, 12, 17]) pts.push([r2(-0.4, 0.4), z]);
  for (let k = 0; k < 9; k++) { const z = r2(-155, -70); pts.push([pathX(z) + r2(-0.8, 0.8), z]); }
  for (let k = 0; k < 7; k++) { let z = r2(-262, -165); if (Math.abs(z + 205) < 14) z -= 30; pts.push([pathX(z) + r2(-0.8, 0.8), z]); }
  for (const sx of [-24, 24]) for (let k = 0; k < 4; k++) { pts.push([sx + r2(-2.5, 2.5), TOWN_Z + r2(-56, 56)]); pts.push([r2(-56, 56), TOWN_Z + sx + r2(-2.5, 2.5)]); }
  const tex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.7, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(24, 24, 9, 4, -0.5, 0, TAU); g.fill(); });
  const m = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  m.list = pts.map(([x, z], i) => { const ry = R() * TAU, rx = r2(0.7, 1.5), rz = r2(0.45, 0.9); m.setMatrixAt(i, m4.compose(v.set(x, groundY(x, z) + 0.06, z), q.setFromEuler(e.set(0, ry, 0)), sc.set(rx, 1, rz)));
    return { x, z, rx: Math.max(rx, rz), rz: Math.max(rx, rz) }; });   // para brincar en ellos basta un círculo
  m.frustumCulled = false; m.visible = false; m.raycast = () => {}; scene.add(m); return m;
})();
const PUDDLE_DARK = new THREE.Color(0x283240);
// nieve: copos que bajan despacio y se mecen, arriba de los cerros (mismo shader, una llamada)
const snowFlakes = (() => { const S = fireParts(500, skyDot, THREE.NormalBlending); S.pts.visible = false; S.pts.renderOrder = 3; return S; })();
function updateSnow(dt) {
  const S = snowFlakes, P = player, k = P.inHouse ? 0 : weather.snow; S.pts.visible = k > 0.01;
  if (!S.pts.visible) { for (const p of S.list) p.born = false; return; }
  const c = camView.c, s = camView.s, cx = P.pos.x - s * 4, cz = P.pos.z - c * 4, top = P.pos.y + 11, floor = P.pos.y - 3, H = 13, C = camera.position;
  const n = Math.round(S.list.length * k), lum = 0.55 + 0.45 * day.light, a = S.a;
  S.list.forEach((p, i) => {
    if (!p.born || p.y < floor) { p.x = cx + rand(-H, H); p.z = cz + rand(-H, H); p.y = p.born ? top : rand(floor, top); p.born = true; p.s0 = rand(0.07, 0.15); }
    if (p.x < cx - H) p.x += 2 * H; else if (p.x > cx + H) p.x -= 2 * H;
    if (p.z < cz - H) p.z += 2 * H; else if (p.z > cz + H) p.z -= 2 * H;
    p.y -= 1.5 * dt; p.x += (Math.sin(clock * 0.9 + p.ph) * 0.6 + 0.4) * dt; p.z += Math.cos(clock * 0.7 + p.ph) * 0.4 * dt;
    const near = smooth(2, 5, Math.hypot(p.x - C.x, p.y - C.y, p.z - C.z));
    a.position.setXYZ(i, p.x, p.y, p.z); a.size.setX(i, p.s0); a.alpha.setX(i, i < n ? 0.9 * near : 0); a.tint.setXYZ(i, lum, lum, lum * 1.03); a.spin.setX(i, 0);
  });
  for (const key in a) a[key].needsUpdate = true;
}
// El paraguas: Tamachin abre uno cuando llueve (afuera), como el farolito de noche; la mitad de los vecinos también.
// Un cono de 8 gajos rojos y blancos (color por vértice) con mango; la misma geometría para todos.
const UMB_GEO = (() => {
  const cone = new THREE.ConeGeometry(1, 0.42, 8, 1, true).toNonIndexed(), P = cone.attributes.position, col = [], A = new THREE.Color(0xef4b4b), B = new THREE.Color(0xfff4e6);
  for (let i = 0; i < P.count; i += 3) { const cx = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, cz = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3, k = Math.floor(((Math.atan2(cz, cx) + TAU) % TAU) / (TAU / 8)), c = k % 2 ? A : B;
    for (let j = 0; j < 3; j++) col.push(c.r, c.g, c.b); }
  cone.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cone.computeVertexNormals();
  const b = new Batch(); b.addGeo(cone, null, new THREE.Matrix4().makeTranslation(0, 0.21, 0));
  b.cyl('#3b2a4a', 0, -0.35, 0, 0.025, 0.025, 1.1, 6).sph('#3b2a4a', 0, 0.45, 0, 0.05).sph('#3b2a4a', 0.06, -0.92, 0, 0.07);
  return b.geometry();
})();
const UMB_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
const umbrella = (() => { const m = new THREE.Mesh(UMB_GEO, UMB_MAT); m.visible = false; m.castShadow = true; scene.add(m); return { m, k: 0 }; })();
function updateUmbrellas(dt) {
  const P = player, U = umbrella, want = weather.here > 0.25 && !P.inHouse && P.state !== 'sleep' && !ui.closeup ? 1 : 0, sc = P.T.scale;
  U.k = damp(U.k, want, 5, dt); U.m.visible = U.k > 0.02;
  if (U.m.visible) {
    U.m.position.set(P.pos.x + Math.cos(camView.yaw) * 0.18 * sc, P.pos.y + (P.T.def.H + 0.75) * sc * (1 - 0.6 * P.T.lieK), P.pos.z - Math.sin(camView.yaw) * 0.18 * sc);
    U.m.rotation.set(0.12 * Math.sin(clock * 1.3), P.heading, -0.18 + 0.06 * Math.sin(clock * 1.7)); U.m.scale.setScalar(0.9 * sc * U.k);
  }
  // vecinos: los pares abren paraguas (en su grupo: se mueven con ellos)
  const rainy = weather.rain > 0.3;
  if (rainy !== U.npcs) { U.npcs = rainy; npcs.forEach((n, i) => { if (i % 2) return; if (!n.umb) { n.umb = new THREE.Mesh(UMB_GEO, UMB_MAT); n.umb.position.set(0.12, SHAPES[n.T.shape].H + 0.62, 0); n.umb.rotation.z = -0.15; n.umb.scale.setScalar(0.75); n.T.group.add(n.umb); } n.umb.visible = rainy; }); }
}
// brincar en un charco (con lluvia o recién llovido): salpica, divierte y cuenta para el encargo
function puddleAt(x, z) { for (const p of puddles.list) if (Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz) < 1.05) return p; return null; }
function puddleJump(x, z) {   // devuelve si salpicó (entonces no suena además el paso al caer)
  if (weather.wet < 0.3 || !puddleAt(x, z)) return false;
  burst('splash', x, 0.25, z, 12, { spread: 2.4 }); SFX.splash(); say(player, choose(['¡Splash!', '¡Splish, splash!', '¡Chapuzón!']), 1.2); player.T.poke(4);
  gain('diversion', 0.04, 'charco', 0.8);
  if (quests.charcos === 1) { puddleJumps++; if (puddleJumps >= 10) finishQuest('charcos'); else { toast('Charcos: ' + puddleJumps + ' de 10.', 2.2); renderDiary(); save(); } }
  return true;
}
function updatePuddles() {
  const m = puddles, w = weather.wet; m.visible = w > 0.01; if (!m.visible) return;
  m.material.opacity = 0.7 * Math.min(1, w * 1.6); m.material.color.copy(scene.fog.color).lerp(PUDDLE_DARK, 0.45);   // reflejan el cielo
}

// el día que es: sube cada mañana, al pasar las 5 (también dormido); los saltos de setHour hacia atrás o de más de 12 horas no cuentan
let lastHour = DAY.start;
function updateDayCount() {
  const fwd = (day.h - lastHour + 24) % 24, toRise = (DAY.rise - lastHour + 24) % 24;
  if (fwd > 0 && fwd < 12 && toRise > 0 && toRise <= fwd) { day.n++; if (!diaryEl.hidden) renderDiary(); save(); }
  lastHour = day.h;
}

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
  if (quests.amanecer === 1 && P.state === 'normal' && day.h >= DAY.rise && day.h < 6.5 && PEAKS.some((p) => Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 34)) {
    finishQuest('amanecer'); say(P, '¡Qué bonito sale el sol desde aquí!', 3.2); P.T.doTrick('dance');
  }
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

function setPtr(e, noSpin) {
  const r = canvas.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.active = true; ptr.moveT = clock;
  if (noSpin || e.pointerType === 'touch') { ptr.hasA = false; return; }   // girando la cámara no se marea; con el dedo, arrastrar siempre gira
  const dx = ptr.x - pScreen.x, dy = ptr.y - pScreen.y, dist = Math.hypot(dx, dy);
  if (dist > pScreen.r * 0.3 && dist < Math.max(150, pScreen.r * 5)) {
    const a = Math.atan2(dy, dx);
    if (ptr.hasA) { const d = angDiff(ptr.a, a); if (Math.abs(d) < 1.3 && player.state === 'normal' && player.T.mood !== 'mareado') player.spin += d; }
    ptr.a = a; ptr.hasA = true;
  } else ptr.hasA = false;
}
// Arrastrar gira la cámara, con el mouse o con un dedo (desde 12 px; menos es un toque o un clic): de lado la rodea, hacia abajo
// la baja (se ve más el horizonte) y hacia arriba la sube. Con dos dedos también, y pellizcar acerca o aleja. La palanca y los
// botones son elementos aparte: un dedo en ellos nunca gira.
const DRAG_K = 0.0075, TILT_K = 0.005;                             // radianes por pixel
const touches = new Map(), two = { on: false, mx: 0, my: 0, d0: 1, z0: 1 }, drag = { on: false, x: 0, y: 0 };
function twoFingers() { const [a, b] = touches.values(); return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.max(24, Math.hypot(a.x - b.x, a.y - b.y)) }; }
function baseTwo() { const g = twoFingers(); Object.assign(two, { on: true, mx: g.mx, my: g.my, d0: g.d, z0: ui.zoomTarget }); }   // cada vez que cambia el par de dedos, sin saltos
function tilt(dy) { if (!ui.closeup) camView.pitchT = clamp(camView.pitchT - dy * TILT_K, PITCH.min, PITCH.max); }   // en Personalizar la cámara va a su altura
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') document.body.classList.add('touch');
  unlockAudio(); try { canvas.focus({ preventScroll: true }); } catch (_) { /* sin foco */ }
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {                                       // segundo dedo: el primero deja de ser toque o círculo
      baseTwo(); ptr.down = false; ptr.hasA = false; ptr.active = false; drag.on = false; return;
    }
    if (touches.size > 1 || two.on || ptr.id !== null) return;
  }
  ptr.id = e.pointerId; ptr.down = true; ptr.sx = e.clientX; ptr.sy = e.clientY; ptr.st = performance.now(); ptr.hasA = false; drag.on = false; setPtr(e);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') {
    const t = touches.get(e.pointerId); if (!t) return; t.x = e.clientX; t.y = e.clientY;
    if (two.on) { if (touches.size >= 2) { const g = twoFingers(); camView.yawT += (g.mx - two.mx) * DRAG_K; tilt(g.my - two.my); two.mx = g.mx; two.my = g.my; ui.zoomTarget = clamp(two.z0 * two.d0 / g.d, 0.5, 1.6); } return; }
    if (e.pointerId !== ptr.id) return;
  }
  if (ptr.down && e.pointerId === ptr.id) {
    if (!drag.on && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) >= 12) { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; }
    if (drag.on) { camView.yawT += (e.clientX - drag.x) * DRAG_K; tilt(e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; setPtr(e, true); return; }
  }
  setPtr(e);
});
function ptrEnd(e) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (two.on) { if (!touches.size) { two.on = false; ptr.id = null; ptr.down = false; } else if (touches.size === 2) baseTwo(); return; }   // al soltar los dos dedos no hay toque
  }
  if (e.pointerId !== ptr.id) return;
  if (e.type === 'pointerup' && !drag.on && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) < 12 && performance.now() - ptr.st < 450) { const r = canvas.getBoundingClientRect(); handleClick(e.clientX - r.left, e.clientY - r.top); }
  ptr.down = false; ptr.id = null; drag.on = false; if (e.pointerType !== 'mouse') { ptr.active = false; ptr.hasA = false; }
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
// tocarlo muchas veces seguidas (cada toque a menos de 0.9 s del anterior) lo marea: en teléfono no hay círculos con el puntero
const PESTER = { taps: 5, gap: 0.9 }, pest = { n: 0, t: -9 };
function pester() {
  const P = player; pest.n = clock - pest.t < PESTER.gap ? pest.n + 1 : 1; pest.t = clock;
  if (pest.n < PESTER.taps || P.state !== 'normal' || P.T.mood === 'mareado') return false;
  pest.n = 0; makeDizzy(4.5); P.T.poke(5); return true;
}
function handleClick(px, py) {
  const home = world === EARTH;                                     // los vecinos, los animales y las luciérnagas viven en la Tierra
  if (home && (tapShootingStar(px, py) || tapFly(px, py))) return;
  const P = player; let best = Infinity, what = null;
  let d = hitTest(px, py, P.pos.x, P.pos.y + 0.8 * P.T.scale * (1 - 0.6 * P.T.lieK), P.pos.z, 0.85 * P.T.scale); if (d < best) { best = d; what = P; }
  if (home) for (const n of npcs) { d = hitTest(px, py, n.pos.x, 0.7 * n.T.scale, n.pos.z, 0.8 * n.T.scale); if (d < best) { best = d; what = n; } }
  for (const c of creatures) { if ((c.world || EARTH.name) !== world.name) continue; if (c.kind === 'músico' && !c.T.group.visible) continue; d = hitTest(px, py, c.pos.x, c.pos.y + 0.5, c.pos.z, c.clickR); if (d < best) { best = d; what = c; } }   // los músicos, solo cuando tocan
  if (!what) return;
  if (what === P) { if (P.state === 'sleep') wake(); else if (!pester()) playerTrick(); return; }
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
  if (on && !ui.closeup) ui.faceYaw = camView.yaw;
  panelEl.hidden = !on; ui.closeup = on; document.body.classList.toggle('custom', on); bCustom.setAttribute('aria-expanded', String(on)); bCustom.querySelector('.lab').textContent = on ? 'Volver al mundo' : 'Personalizar';
  if (on) { syncPanel(); for (const k in keys) keys[k] = false; updMore(panelEl); }
}

// diario: cómo está Tamachin y los encargos. Se abre con su botón, con los medidores o con la tecla J.
const diaryEl = $('#diary'), bNeeds = $('#needs'), bDiary = $('#bDiary'), needListEl = $('#needList'), questListEl = $('#questList'), questNoteEl = $('#questNote');
const needEls = {}; bNeeds.querySelectorAll('.need').forEach((el) => { needEls[el.dataset.k] = { el, bar: el.querySelector('b') }; });
function toggleDiary(on) {
  if (on === undefined) on = diaryEl.hidden;
  if (on && ui.closeup) togglePanel(false);
  diaryEl.hidden = !on; for (const b of [bNeeds, bDiary]) b.setAttribute('aria-expanded', String(on)); document.body.classList.toggle('diary', on);
  if (on) renderDiary();
}
const dayEl = $('#dDay');
function renderDiary() {
  if (diaryEl.hidden) return;
  const ht = hourText(day.h); dayEl.textContent = 'Día ' + day.n + ' · ' + weatherWord() + ' · ' + ht[0].toLowerCase() + ht.slice(1);
  needListEl.innerHTML = Object.keys(NEEDS).map((k) => '<div class="nrow n-' + k + '">' + needEls[k].el.querySelector('svg').outerHTML + '<strong>' + NEEDS[k].label + '</strong><span class="pct"></span>'
    + '<span class="bar"><b></b></span><p>Se llena con ' + NEEDS[k].fill + '.</p></div>').join('');
  const open = Object.keys(QUESTS).filter((k) => quests[k] === 1), done = Object.keys(QUESTS).filter((k) => quests[k] === 2), left = Object.keys(QUESTS).length - open.length - done.length;
  questListEl.innerHTML = open.concat(done).map((k) => '<li class="' + (quests[k] === 2 ? 'done' : '') + '"><strong>' + QUESTS[k].title + '<em>' + (quests[k] === 2 ? 'Hecho' : 'En curso') + '</em></strong><p>'
    + (quests[k] === 2 ? QUESTS[k].done : QUESTS[k].hint + (QUESTS[k].progress ? ' Llevas ' + QUESTS[k].progress() + '.' : '')) + '</p></li>').join('');
  questNoteEl.textContent = left ? (open.length + done.length ? 'Quedan ' + left + ' encargos por descubrir. ' : '') + 'Platica con los vecinos y revisa el buzón: hay quien necesita ayuda.' : '¡Descubriste todos los encargos!';
  syncDiaryNeeds(); updMore(diaryEl);
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
bNeeds.addEventListener('click', () => toggleDiary()); bDiary.addEventListener('click', () => toggleDiary()); $('#dClose').addEventListener('click', () => toggleDiary(false));
// paneles que se desplazan (en teléfono no cabe todo): "Más abajo" mientras quede algo por ver
function updMore(el) { const b = el.querySelector('.pbody'); el.classList.toggle('more', !el.hidden && b.scrollHeight - b.scrollTop - b.clientHeight > 8); }
for (const el of [panelEl, diaryEl]) el.querySelector('.pbody').addEventListener('scroll', () => updMore(el), { passive: true });
// volver al inicio, frente a la casa. Lejos de casa pide un segundo toque: un toque sin querer no debe costar un kilómetro de camino.
const START = { x: 0, z: 3.5 }, bHome = $('#dHome'); let homeArmed = 0;
function goHome() {
  const P = player; if (P.state === 'busy') return;
  if ((world !== EARTH || Math.hypot(P.pos.x - START.x, P.pos.z - START.z) > 40) && !homeArmed) { homeArmed = clock + 4; bHome.textContent = 'Toca otra vez para volver'; return; }
  homeArmed = 0; bHome.textContent = 'Volver al inicio';
  if (P.state === 'sleep') { P.T.lie = 0; P.sleepSpot = null; clearTemp(); }
  setWorld(EARTH.name, START);                                      // desde otro mundo (la luna), también de vuelta a la Tierra (y el conejo que lo sigue)
  P.T.flat = false; P.state = 'normal'; P.vx = P.vz = P.vy = 0; P.flySpin = 0; P.heading = 0; P.onGround = true;
  P.pos.set(START.x, 0, START.z); camInit = false; camView.yaw = camView.yawT = 0; camView.pitch = camView.pitchT = PITCH.def;   // también la cámara, de frente a la casa
  toggleDiary(false); say(P, '¡De vuelta en casa!', 2.2); P.T.doTrick('hop'); burst('spark', P.pos.x, 1.6, P.pos.z, 6); SFX.nice(); save();
}
bHome.addEventListener('click', goHome);
bCustom.addEventListener('click', () => togglePanel()); $('#pClose').addEventListener('click', () => togglePanel(false));
const bZoom = $('#bZoom'), bSound = $('#bSound'), helpEl = $('#help');
bZoom.addEventListener('click', () => { ui.zoomIdx = (ui.zoomIdx + 1) % 3; ui.zoomTarget = ZOOMS[ui.zoomIdx]; bZoom.querySelector('.lab').textContent = ZOOM_LABEL[ui.zoomIdx]; });
// El botón de sonido va por tres pasos: música y efectos, solo efectos, nada. Sin nada, el audio se suspende (no gasta batería).
// En el teléfono es solo un ícono (`data-mode` elige cuál: nota, ondas o tache): al tocarlo, un aviso dice en qué quedó.
const ICONS_ONLY = window.matchMedia ? window.matchMedia('(max-width: 760px)') : { matches: false };   // la misma medida que el CSS
const SOUND = { todo: ['Sonido: sí', 'Música y efectos', 'efectos'], efectos: ['Solo efectos', 'Efectos, sin música', 'no'], no: ['Sonido: no', 'Sin sonido', 'todo'] };
function setSound(mode, chirp) {
  if (!SOUND[mode]) mode = 'todo';
  snd.mode = mode; snd.on = mode !== 'no'; snd.music = mode === 'todo'; bSound.querySelector('.lab').textContent = SOUND[mode][0]; bSound.title = SOUND[mode][1]; bSound.dataset.mode = mode;
  if (chirp && ICONS_ONLY.matches) toast(SOUND[mode][1] + '.', 1.6);
  const c = snd.ctx;
  if (c && mus && !snd.music) mus.stop(c.currentTime);
  if (c && mus) { const g = mus.amb.out.gain; g.cancelScheduledValues(c.currentTime); g.setTargetAtTime(snd.on ? 1 : 0, c.currentTime, 0.08); }   // lo de fondo se apaga suave antes de suspender y vuelve igual
  if (c && !snd.on) setTimeout(() => { if (!snd.on && c.state === 'running') c.suspend().catch(() => {}); }, 400);   // después de apagar la música
  if (chirp && snd.on) { unlockAudio(); const c2 = snd.ctx; if (c2 && c2.state !== 'running') c2.resume().then(() => SFX.pop()).catch(() => {}); else SFX.pop(); }
}
bSound.addEventListener('click', () => { setSound(SOUND[snd.mode][2], true); save(); });

// ───────────────────────── música y lo de fondo ─────────────────────────
// Sigue al lugar con `musicZone` (más grueso que el nombre del HUD, que lleva metros) y espera 0.8 s antes de cambiar, para que
// asomarse a la puerta de la casa no la cambie a cada rato. Lo de fondo (pájaros, río, viento) sigue al instante, con rampas, y suena
// también con «Solo efectos». Si algo falla, todo se apaga y el error queda en `musErr` (las pruebas lo revisan).
let mus = null, musWant = null, musT = 0, musErr = null;
function musicZone() {
  const P = player, x = P.pos.x, z = P.pos.z;
  if (P.inHouse) return 'casa';
  if (z < Z_TOWN_N) return 'sinfin';
  if (z < Z_TOWN_S) return 'pueblo';
  if (z < NORTH_Z) return 'montes';
  if (z < FOREST_Z) return 'bosque';
  if (z < -63) return 'camino';
  if (Math.abs(x) < 20 && Math.abs(z) < 20) return 'jardin';
  if (Math.abs(x) < 20 && z < -28) return 'parque';
  return 'ciudad';
}
const riverNear = (x, z) => Math.pow(clamp(1 - Math.max(0, Math.abs(z - riverZ(x)) - RIVER_HALF) / 28, 0, 1), 2);   // 1 en la orilla, 0 a 28 m
function updateMusic(dt) {
  const c = snd.ctx; if (!c || c.state !== 'running' || !snd.on || musErr) return;
  if (!mus) mus = makeMusic(c, c.destination);
  const P = player, now = c.currentTime, k = world.music(), key = P.state === 'sleep' ? 'cuna' : k, alt = clamp(P.pos.y / 400, 0, 1);   // dormido, canción de cuna
  if (key !== musWant) { musWant = key; musT = 0; } else musT += dt;
  const night = world.night != null ? world.night : 1 - day.light, band = town.band && k === 'pueblo' ? clamp(1.4 - Math.hypot(P.pos.x, P.pos.z - TOWN_Z) / 60, 0, 1) : 0;   // la banda del kiosco
  const rain = world.weather ? weather.rain : 0;                    // en un mundo sin tiempo (la luna) no llueve
  const amb = ambFor(k, k === 'bosque' ? riverNear(P.pos.x, P.pos.z) : 0, alt, night, rain * (1 - smooth(WEATHER.top, WEATHER.top + 50, P.pos.y))); amb.roof = !!P.inHouse;
  mus.ambient(amb, now); mus.pumpAmb(now, now + 0.45);   // lo de fondo, del lugar y la hora
  if (!snd.music) { snd.tune = 1; return; }   // con «Solo efectos», setSound ya apagó la música
  mus.param.alt = alt; mus.param.near = clamp(1 - (Math.hypot(P.pos.x, P.pos.z - TOWN_Z) - 14) / 50, 0, 1);   // la banda del kiosco
  mus.param.run = !!P.running && P.state === 'normal'; mus.setLow(!!P.needLow, now); mus.setNight(Math.max(night * (1 - band), 0.35 * rain), now); mus.param.band = band;
  if (!mus.cur || (key !== mus.key && musT > 0.8)) mus.zone(key, now + 0.05);
  mus.pump(now, now + 0.45); snd.tune = mus.tune();
}
function hideHelp() { if (!helpEl.hidden) { helpEl.hidden = true; save(); } }   // vista una vez, no vuelve a salir
$('#helpOk').addEventListener('click', hideHelp);

// ───────────────────────── actualización por cuadro ─────────────────────────
// pos.y todavía es la altura del cuadro anterior: lo bajo que ya libró no lo empuja (pasa por encima o está parado ahí)
function resolvePlayer() {
  const P = player, pos = P.pos, r = P.r, feet = pos.y + 0.02, S = world.solids;
  for (let it = 0; it < 2; it++) { for (const b of S.boxes) if (feet < b.top) pushOutBox(pos, r, b); for (const c of S.circles) if (feet < c.top) pushOutCircle(pos, r, c.x, c.z, c.r); }
  world.collide(pos, r);                                            // lo demás de cada mundo: en la Tierra, autos, vecinos y límites
}
function earthCollide(pos, r) {
  if (pos.z > -66 && clock > 0) for (const c of cars) {             // antes del primer cuadro los autos aún no están en la calle (todos en el origen)
    if (pos.y < c.h * 0.8) pushOutBox(pos, r * 0.8, carRect(c, 0));   // un choque solo lo empuja (antes: knock(c) si el auto iba a más de 2.2 m/s)
  }
  for (const n of npcs) pushOutCircle(pos, r, n.pos.x, n.pos.z, 0.5 * n.T.scale);
  northCollide(pos, r); keepInWorld(pos);                           // árboles del norte y límites por franja (05-norte.js)
}
// Lo más alto que tiene justo debajo y que ya libró (y0: la altura antes de este cuadro). Con la misma regla que resolvePlayer,
// lo que no lo empuja lo sostiene; si cae por la orilla, al cuadro siguiente ya está más bajo y lo empuja hacia fuera.
function perchUnder(x, z, y0) {
  let best = null;
  for (const s of world.solids.perches) {
    if (y0 + 0.02 < s.top || (best && s.top <= best.top)) continue;
    const R = s.r + (s.rim || 0);
    if (s.r != null ? (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z) <= R * R : x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) best = s;
  }
  return best;
}
// ───────────────────────── tráfico amable ─────────────────────────
// Los autos nunca lo atropellan: frenan en seco (updateCars). Si uno tiene que frenar por él fuera del monito verde, pita y Tamachin se
// asusta; la primera vez, un aviso dice cómo cruzar. Cruzar por el paso de cebra con el monito verde (se juzga al bajar de la banqueta:
// parpadeando ya no cuenta) y llegar a la otra orilla da diversión.
const traffic = { startles: 0, crossed: 0, hinted: false, at: -9, Z: null, from: 0, ok: false };
function startle(c, hard) {
  const P = player; if (hard) SFX.screech();
  c.honkT = rand(1.8, 2.8); say(c, choose(['¡Piii, piii!', '¡Cuidado, Tamachin!', '¡Bip, bip!', '¡Uy, perdón!']), 1.4); SFX.honk();
  if (P.state !== 'normal' || ui.closeup || clock - traffic.at < 2.5) return;
  traffic.at = clock; traffic.startles++;
  P.T.doTrick('hop'); if (!P.tempMood) setTemp('asombrado', 1.3); say(P, choose(['¡Uy!', '¡Ay, un auto!', '¡Uf, qué susto!']), 1.4);
  if (!traffic.hinted) { traffic.hinted = true; toast('¡Cuidado con los autos! Cruza por el paso de cebra cuando el monito del semáforo esté verde.', 5); }
}
function updateCrossing() {
  const P = player, T = traffic, x = P.pos.x, z = P.pos.z;
  if (z < -66 || P.state !== 'normal') { T.Z = null; return; }
  if (!T.Z) {
    const Z = zebraAt(x, z, 0.3), u = Z ? zebraU(Z, x, z) : 0; if (!Z || Math.abs(u) > RW) return;   // todavía en la banqueta
    T.Z = Z; T.from = Math.sign(u); T.ok = Z.state === 'walk' && Math.abs(u) > RW - 1.5; return;     // desde la orilla y con el monito fijo
  }
  const Z = T.Z, u = zebraU(Z, x, z), w = zebraW(Z, x, z);
  if (w < Z.w0 - 0.8 || w > Z.w1 + 0.8) { T.Z = null; return; }                                       // se salió de las rayas
  if (Math.abs(u) < RW + 0.3) return;
  if (Math.sign(u) !== T.from && T.ok) {
    T.crossed++;
    if (gain('diversion', 0.08, 'cruce', 20)) { say(P, choose(['¡Crucé con el monito verde!', '¡Crucé bien!', '¡Al otro lado!']), 1.8); SFX.nice(); P.T.doTrick('wave'); }
  }
  T.Z = null;
}
// ───────────────────────── pasos ─────────────────────────
// Suenan cuando un pie toca el suelo en la animación: cada pie baja cuando su fase pasa por π/2, y los dos van medio ciclo
// desfasados, así que hay un paso cada vez que `T.walk` cruza π/2 + kπ (02-tamachin.js). Solo en el suelo, caminando de verdad
// (no al frenar) y con pies (el fantasma flota). `foot.n` cuenta por suelo aunque no haya audio (las pruebas lo leen); el sonido se
// salta si el anterior fue hace menos de 0.07 s del reloj del audio, porque `advance()` corre muchos cuadros sin que ese reloj avance.
// Van directo a la salida como los efectos (suenan con «Solo efectos», sin el filtro de la noche) y con su propio try (el error
// queda en `foot.err`, sin apagar la música).
const foot = { n: {}, total: 0, played: 0, lands: 0, last: null, at: -1, err: null };
const inRect = (x, z, r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
function stepSurface(x, z, perch) {   // qué pisa: con las mismas medidas con que se pinta cada suelo
  const P = player;
  if (perch) return perch.step || 'piedra';
  if (P.inHouse) return 'madera';
  if (onBridge(x, z)) return 'madera';
  if (P.inWater || (riverDepth(x, z) < -0.2 && P.pos.y < 0)) return 'agua';
  if (weather.wet > 0.3 && puddleAt(x, z)) return 'charco';
  if (z < NORTH_Z) return northSurface(x, z);                       // cerros, pueblo, bosque sin fin (05-norte.js)
  if (z < -62.6) return (z > -246.5 && Math.abs(x - pathX(z)) < 1.5) || nearTrail(x, z, 1.35) ? 'tierra' : 'pasto';   // el camino y el bosque
  const road = ROADS.some((r) => Math.abs(x - r) < RW + 0.28 || Math.abs(z - r) < RW + 0.28);   // las calles se pintan encima de los senderos
  if (!road && (SAND_PATHS.some((r) => inRect(x, z, r)) || Math.hypot(x - PARK_PLAZA.x, z - PARK_PLAZA.z) < PARK_PLAZA.r)) return 'tierra';   // también donde cruzan la banqueta
  return LAWNS.some((r) => inRect(x, z, r)) ? 'pasto' : 'piedra';    // si no, calles y banquetas
}
function stepSound(kind, v) {
  foot.n[kind] = (foot.n[kind] || 0) + 1; foot.total++; foot.last = kind;
  const c = snd.ctx; if (!c || !snd.on || c.state !== 'running' || c.currentTime - foot.at < 0.07) return;
  foot.at = c.currentTime;
  const wet = weather.wet > 0.35 && !player.inHouse && (kind === 'pasto' || kind === 'tierra' || kind === 'piedra');   // después de llover chapotea
  try { footstep(c, c.destination, c.currentTime + 0.005, kind, v, wet); foot.played++; } catch (e) { foot.err = e; }   // si falla, sin pasos (las pruebas lo leen)
}
function walkSteps(w0, w1) {
  const P = player, HALF = Math.PI / 2;
  if (Math.floor((w1 - HALF) / Math.PI) === Math.floor((w0 - HALF) / Math.PI)) return;   // ningún pie bajó
  if (!P.onGround || P.state !== 'normal' || P.T.def.feet === false || P.speedN < 0.25) return;
  stepSound(world.surface(P.pos.x, P.pos.z, P.perch), P.running ? 1.2 : 0.75 + 0.25 * Math.min(1, P.speedN));
}
function landStep(perch) {   // al caer de un salto: los dos pies, más fuerte (la cama rebota y suena aparte)
  const P = player; if (P.T.def.feet === false) return;
  foot.lands++; stepSound(world.surface(P.pos.x, P.pos.z, perch), 1.35);
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
    const c = camView.c, s = camView.s, wx = ix * c + iz * s; iz = -ix * s + iz * c; ix = wx;   // de la pantalla al mundo: arriba es alejarse de la cámara
  } else if (P.state === 'sleep' && P.sleepT > 0.8 && (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight)) wake();
  let mag = Math.hypot(ix, iz); if (mag > 1) { ix /= mag; iz /= mag; mag = 1; }
  P.running = run && mag > 0.5;   // la música suma percusión
  const m = MOODS[T.mood];
  if (T.mood === 'mareado' && P.state === 'normal' && !ui.closeup) {
    const a = Math.sin(clock * 1.9), c = Math.cos(a), s = Math.sin(a), x2 = ix * c - iz * s, z2 = ix * s + iz * c;
    ix = x2 + Math.cos(clock * 2.6) * 0.3; iz = z2 + Math.sin(clock * 2.1) * 0.3; mag = Math.min(1, Math.hypot(ix, iz));
  }
  const ms = P.needMood && T.mood === P.needMood ? Math.max(0.8, m.speed || 1) : (m.speed || 1);   // cansado o con hambre camina un poco más lento, no tanto
  const R = world.rules;
  let speed = (run ? R.run : R.walk) * ms * (P.inWater ? 0.55 : 1);
  if (world.slope && mag > 0.08) speed *= world.slope(pos, ix, iz, mag);   // cuesta arriba cuesta un poco más
  if (P.state === 'normal') {
    if (mag > 0.08) {
      P.vx = damp(P.vx, ix * speed, R.accel, dt); P.vz = damp(P.vz, iz * speed, R.accel, dt);
      P.heading += angDiff(P.heading, Math.atan2(ix, iz)) * Math.min(1, dt * 12); P.idleT = 0; P.moved += speed * mag * dt;
    } else {
      P.vx = damp(P.vx, 0, R.stop, dt); P.vz = damp(P.vz, 0, R.stop, dt); P.idleT += dt;
      if (ptr.active && clock - ptr.moveT < 0.3 && Math.abs(P.spin) > 1.2) P.heading += angDiff(P.heading, Math.atan2(ptr.x - pScreen.x, ptr.y - pScreen.y) + camView.yaw) * Math.min(1, dt * 14);
      else if (ui.closeup) P.heading += angDiff(P.heading, ui.faceYaw) * Math.min(1, dt * 5);   // mira a la cámara como estaba al abrir: si la giras, se le ve de lado
    }
  } else if (P.state === 'fly') { const k = Math.exp(-0.6 * dt); P.vx *= k; P.vz *= k; P.flySpin += dt * 13; }
  else { P.vx = P.vz = 0; }
  if (P.state === 'busy') { const b = P.busy; b.t += dt; b.update(dt, b.t); if (b.t >= b.dur) { P.busy = null; P.state = 'normal'; if (b.end) b.end(); } }

  if (P.state === 'sleep') { P.sleepT += dt; if (P.nightSleep) sleepThroughNight(dt); else if (P.sleepT > 9) wake(); }
  else {
    pos.x += P.vx * dt; pos.z += P.vz * dt; if (!(P.busy && P.busy.ghost)) resolvePlayer();   // ghost: entrando por la boca de un túnel
    const gy = world.ground(pos.x, pos.z), pr = perchUnder(pos.x, pos.z, pos.y), sy = pr ? Math.max(gy, pr.top) : gy;   // el suelo, o lo que tiene debajo
    const water = world.wet(gy);                                    // en la Tierra, el río (más de 20 cm de hondo)
    P.vy -= R.grav * dt; pos.y += P.vy * dt;
    if (pos.y <= sy || (P.onGround && P.vy <= 0.01 && pos.y - sy < 0.16 + Math.hypot(P.vx, P.vz) * dt * 1.6)) {   // cuesta abajo no despega
      if (pr && pr.bounce && P.vy < -2.2 && P.state === 'normal') {   // la cama: rebota cada vez menos
        const again = clock - (P.jumpAsk || -9) < 0.25; P.jumpAsk = -9;
        P.vy = again ? 9 : Math.min(8.6, -P.vy * 0.72); pos.y = sy; P.onGround = false; P.perch = null; T.poke(-2.6); SFX.jump(); perched(pr);
      } else {
        if (P.vy < -5) { T.poke(-3.2); if (!pr && water) { burst('splash', pos.x, 0.3, pos.z, 8); SFX.splash(); } }
        const drop = P.vy < -4 && !P.onGround && P.state === 'normal';
        if (drop && !(!pr && world.puddle(pos.x, pos.z)) && !(!pr && water)) landStep(pr);   // en un charco: ¡splash!; si no, el paso de caer (en el río ya salpica)
        const landed = !P.onGround; pos.y = sy; P.vy = 0; P.onGround = true; P.perch = pr; if (P.state === 'fly') land();
        if (pr && landed && P.state === 'normal') perched(pr);
      }
    } else { P.onGround = false; P.perch = null; }
    const wet = water && pos.y < gy + 0.15;
    if (wet && !P.inWater) { burst('splash', pos.x, 0.3, pos.z, 6); SFX.splash(); say(P, '¡Splash!', 1.2); }
    P.inWater = wet;
    if (wet && Math.hypot(P.vx, P.vz) > 1 && Math.random() < dt * 7) emit('splash', pos.x + rand(-0.4, 0.4), 0.25, pos.z + rand(-0.4, 0.4));
    if (P.state === 'flat') { P.flatT -= dt; if (P.flatT <= 0) getUp(); }
  }
  T.group.rotation.y = P.heading;
  P.inHouse = world.inHouse(pos);
  P.speedN = Math.hypot(P.vx, P.vz) / R.walk;

  // marearse: el puntero da vueltas a su alrededor
  if (P.spin !== 0) { const dec = dt * 1.6; P.spin = Math.abs(P.spin) <= dec ? 0 : P.spin - Math.sign(P.spin) * dec; }
  const wob = clamp((Math.abs(P.spin) - 3) / 9.5, 0, 1);
  if (Math.abs(P.spin) > 12.5 && P.state === 'normal' && T.mood !== 'mareado') makeDizzy(5.5);
  const st = { speed: P.onGround ? P.speedN : 0.25, air: !P.onGround && P.state !== 'sleep', wobble: wob, spinY: P.state === 'fly' ? P.flySpin : 0, near: true };
  if (ptr.active && clock - ptr.moveT < 2.5 && P.state !== 'sleep') {
    const k = Math.cos(P.heading - camView.yaw), sc = Math.max(30, pScreen.r * 3);
    st.lookX = clamp((ptr.x - pScreen.x) / sc, -1, 1) * (k >= 0 ? 1 : -1); st.lookY = clamp(-(ptr.y - (pScreen.y - pScreen.r * 0.3)) / sc, -1, 1);
  }
  const w0 = T.walk; T.update(dt, st); walkSteps(w0, T.walk);
}

const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), _cp = new THREE.Vector3(), _ct = new THREE.Vector3(); let camInit = false, camSlope = 0.7;
// Adelanto: la cámara mira hacia donde camina Tamachin, sobre todo hacia la cámara, donde la vista es corta.
// Metros a zoom 1 y fuera de casa, en el marco de la cámara (x a la derecha de la pantalla, z hacia la cámara).
// Solo cambia mientras camina: al detenerse se conserva, para poder mirar lo que viene.
const LEAD = { south: 4.4, north: 1.4, side: 0.35, grow: 1.6, maxRate: 5, house: 0.3 };
const camLead = { x: 0, z: 0, k: 1 }, CAM_D0 = Math.hypot(7.6, 11.2), CAM_DH = Math.hypot(8.4, 7.2), CAM_SLOPE0 = 7.6 / 11.2;   // distancias a zoom 1
function updateLead(dt) {
  const P = player;
  if ((P.state === 'normal' && P.idleT === 0 && !ui.closeup) || P.state === 'fly') {
    const halfW = Math.tan(camera.fov * Math.PI / 360) * camera.aspect * CAM_D0;           // medio ancho visible a la distancia de Tamachin
    const vr = P.vx * camView.c - P.vz * camView.s, vb = P.vx * camView.s + P.vz * camView.c;   // a la derecha y hacia la cámara
    const R = world.rules, gx = clamp(vr / R.run, -1, 1) * LEAD.side * halfW;
    const gz = vb > 0 ? Math.min(vb / R.walk, 1.66) * LEAD.south : Math.max(vb / R.walk, -1.66) * LEAD.north;
    const k = 1 - Math.exp(-LEAD.grow * dt), mx = LEAD.maxRate * dt;
    camLead.x += clamp((gx - camLead.x) * k, -mx, mx); camLead.z += clamp((gz - camLead.z) * k, -mx, mx);
  }
  camLead.k = damp(camLead.k, P.inHouse ? LEAD.house : 1, 3, dt);
}
function updateCamera(dt) {
  const P = player, wide = VW > 760, sc = P.T.scale; let oy, oz, ox = 0, tx = P.pos.x, ty, tz = P.pos.z;
  const base = world.camBase(P.pos), hills = world.hills(P.pos);    // en las montañas la cámara sigue al suelo
  ui.zoom = damp(ui.zoom, ui.zoomTarget, 6, dt);
  // girar: el arrastre y las teclas Z y X mueven yawT; yaw lo sigue suave
  const V = camView, kz = (keys.KeyZ ? 1 : 0) - (keys.KeyX ? 1 : 0);
  if (kz && P.state !== 'busy') V.yawT += kz * 1.9 * dt;
  const yaw0 = V.yaw; V.yaw = camInit ? damp(V.yaw, V.yawT, 14, dt) : V.yawT; V.pitch = camInit ? damp(V.pitch, V.pitchT, 14, dt) : V.pitchT;
  if (V.yaw > Math.PI) { V.yaw -= TAU; V.yawT -= TAU; } else if (V.yaw < -Math.PI) { V.yaw += TAU; V.yawT += TAU; }
  const c = V.c = Math.cos(V.yaw), s = V.s = Math.sin(V.yaw), fixed = P.state === 'busy' && P.busy.cam;
  if (camInit && !fixed && V.yaw !== yaw0) {                         // al girar, la cámara da la vuelta por el círculo, no por la cuerda
    const a = angDiff(yaw0, V.yaw), ca = Math.cos(a), sa = Math.sin(a), wx = camPos.x - camTgt.x, wz = camPos.z - camTgt.z;
    camPos.x = camTgt.x + wx * ca + wz * sa; camPos.z = camTgt.z - wx * sa + wz * ca;
  }
  if (!camInit) camLead.x = camLead.z = 0;
  updateLead(dt);
  if (ui.closeup) { oy = 0.5; oz = 5.8; ty = P.pos.y + 0.78 * sc; if (wide) { tx += 1.3 * c; tz -= 1.3 * s; } else { oy = 0.75; oz = 6.2; } }   // en teléfono también a la altura de sus ojos (desde arriba se veía con sueño)
  else {
    const z = ui.zoom, d = P.inHouse ? CAM_DH * Math.min(z, 1.1) : CAM_D0 * z, p = P.inHouse ? clamp(V.pitch + PITCH.house, 0.6, 1.2) : V.pitch;   // en casa, más alta
    oy = d * Math.sin(p); oz = d * Math.cos(p); ty = base + (Math.max(P.pos.y, -0.3) - base) * 0.6 + 1.25;
    const f = z * camLead.k, lx = camLead.x * f, lz = camLead.z * f, xl = world.camX(P.pos.z);
    tx = clamp(tx + lx * c + lz * s, -xl, xl); tz = Math.min(tz - lx * s + lz * c, world.camZ);   // sin mirar más allá del borde
  }
  if (fixed) { const b = P.busy.cam; tx = b.x; ty = b.y; tz = b.z; ox = b.ox || 0; oy = b.oy; oz = b.oz; }   // toma cercana (el refri), fija en el mundo
  else { const wx = ox * c + oz * s; oz = -ox * s + oz * c; ox = wx; }   // la cámara gira alrededor de Tamachin
  _ct.set(tx, ty, tz); _cp.set(tx + ox, ty + oy, tz + oz);
  if (hills || (!fixed && !ui.closeup)) {                           // bajando una ladera, o con la cámara baja tras un seto, un túnel o su
    let lift = 0;                                                   // loma (edgeTop), el rayo hacia Tamachin choca: se sube lo necesario
    const fy = P.pos.y + 0.3;                                       // desde los pies: que se vea entero, no solo la cabeza
    for (let i = 1; i <= 10; i++) {
      const k = i / 10, x = lerp(P.pos.x, _cp.x, k), z = lerp(P.pos.z, _cp.z, k), top = hills ? world.ground(x, z) : world.edge(x, z);
      const need = top + 0.35 + 0.8 * k - lerp(fy, _cp.y, k); if (need > 0) lift = Math.max(lift, need / k);
    }
    _cp.y += lift;
  }
  if (!camInit) { camPos.copy(_cp); camTgt.copy(_ct); camInit = true; }
  else { const k = 1 - Math.exp(-(ui.closeup ? 4 : 5.5) * dt); camPos.lerp(_cp, k); camTgt.lerp(_ct, k); }
  if (hills) camPos.y = Math.max(camPos.y, world.ground(camPos.x, camPos.z) + 1.5);   // nunca dentro del cerro
  V.vc = c; V.vs = s;
  if (fixed) { const hx = camPos.x - P.pos.x, hz = camPos.z - P.pos.z, h = Math.hypot(hx, hz); if (h > 0.5) { V.vs = hx / h; V.vc = hz / h; } }   // toma fija: el marco sigue a la cámara real
  camSlope = (camPos.y - ty) / Math.max(1, (camPos.x - P.pos.x) * V.vs + (camPos.z - P.pos.z) * V.vc);    // pendiente real del rayo cámara→Tamachin (con adelanto y retraso)
  camera.position.copy(camPos); camera.lookAt(camTgt);
  // en teléfono, con Personalizar abierto, la imagen se corre hacia arriba para que Tamachin quede en el hueco entre la barra y el panel
  const shiftT = ui.closeup && !wide ? VH / 2 - (topEl.offsetHeight + (panelEl.getBoundingClientRect().top || VH * 0.53)) / 2 : 0;
  ui.shift = camInit ? damp(ui.shift, shiftT, 6, dt) : shiftT;
  if (Math.abs(ui.shift) > 0.5) camera.setViewOffset(VW, VH, 0, ui.shift, VW, VH); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  // no se dibuja lo que la niebla ya borró del todo (con la cámara baja se ve hasta el horizonte); el cielo queda dentro
  const far = Math.min(1700, scene.fog.far + 10);
  if (Math.abs(camera.far - far) > 2) { camera.far = far; camera.updateProjectionMatrix(); skyMesh.scale.setScalar(Math.min(1, far * 0.95 / 520)); }
  skyMesh.position.copy(camPos);
  sun.target.position.set(P.pos.x - 6 * s, base, P.pos.z - 6 * c); sun.position.copy(sun.target.position).add(SUN_OFF);   // la sombra cubre más hacia donde se mira
  _sv.set(P.pos.x, P.pos.y + 0.75 * sc, P.pos.z).project(camera);
  const seeZ = _sv.z * 0.5 + 0.5;                                    // su profundidad (antes de pxRadius, que vuelve a usar _sv)
  pScreen.x = (_sv.x * 0.5 + 0.5) * VW; pScreen.y = (-_sv.y * 0.5 + 0.5) * VH; pScreen.r = pxRadius(P.pos.x, P.pos.y + 0.75 * sc, P.pos.z, 0.75 * sc);
  // la ventana en árboles y arbustos (01-core.js): en píxeles del lienzo (con el origen abajo), un poco más grande que él, y su profundidad
  const dpr = renderer.getPixelRatio(); FX.see.value.set(pScreen.x * dpr, (VH - pScreen.y) * dpr, pScreen.r * 2.3 * dpr, seeZ);
  seeCheck(P, sc);                                                  // y si algo lo tapa, se prende
}

// Las pruebas de visibilidad van en el marco de la cámara: u a la derecha de la pantalla y d hacia la cámara, en metros desde Tamachin.
// Con yaw 0, u es x y d es z (la cámara al sur), y todo da lo mismo que cuando la cámara no giraba.
// camBox: una planta rectangular en ese marco. dmin: dónde empieza, contando desde Tamachin hacia la cámara; umin y umax: su ancho.
const _cb = { dmin: 0, umin: 0, umax: 0 };
function camBox(x0, x1, z0, z1, x, z) {
  const c = camView.vc, s = camView.vs, ax = (x0 - x) * c, bx = (x1 - x) * c, az = (z0 - z) * s, bz = (z1 - z) * s;
  _cb.umin = Math.min(ax, bx) - Math.max(az, bz); _cb.umax = Math.max(ax, bx) - Math.min(az, bz);
  _cb.dmin = Math.min((x0 - x) * s, (x1 - x) * s) + Math.min((z0 - z) * c, (z1 - z) * c);
  return _cb;
}
const HOUSE_OCC = { x0: HOUSE.x0, x1: HOUSE.x1, z0: HOUSE.z0, z1: HOUSE.z1, h: 6, padW: 0, padE: 0, padN: 0, padS: 0 };   // la casa con su techo, para rayCrosses
// ¿El rayo cámara→Tamachin pasa sobre la planta del edificio por debajo de su altura? sx: deriva lateral del rayo por metro hacia la cámara.
// Edificio entre Tamachin y la cámara: margen amplio (2.2 m). Edificio a un lado: solo si el rayo entra (pasa con el adelanto lateral).
// El margen es lateral (a lo largo de la derecha de la pantalla), así que en cada eje cuenta según cuánto apunta la derecha hacia él.
function rayCrosses(o, x, z, sx, back) {
  const c = camView.vc, s = camView.vs, ac = Math.abs(c), as = Math.abs(s);
  const m = camBox(o.x0, o.x1, o.z0, o.z1, x, z).dmin > -0.3 ? 2.2 : 0.8, side = m < 1;
  const w = o.x0 - m * ac - (side ? o.padW * ac : 0), e = o.x1 + m * ac + (side ? o.padE * ac : 0);   // a un lado cuenta el toldo, si lo hay
  const n = o.z0 - m * as - (side ? o.padN * as : 0), so = o.z1 + m * as + (side ? o.padS * as : 0);
  const dx = s + sx * c, dz = c - sx * s;                                          // el rayo avanza (dx, dz) por metro hacia la cámara
  let a = 0, b = back;
  if (Math.abs(dx) > 1e-4) { const p = (w - x) / dx, q = (e - x) / dx; a = Math.max(a, Math.min(p, q)); b = Math.min(b, Math.max(p, q)); }
  else if (x < w || x > e) return false;
  if (Math.abs(dz) > 1e-4) { const p = (n - z) / dz, q = (so - z) / dz; a = Math.max(a, Math.min(p, q)); b = Math.min(b, Math.max(p, q)); }
  else if (z < n || z > so) return false;
  return a <= b && a * camSlope < o.h + 1.5;
}
// Un techo sobre postes (el kiosco): por debajo se ve, así que estar cerca de su planta no basta. Se sigue el rayo de la cámara a
// cinco puntos de Tamachin (pies, centro, cabeza y los lados) y solo tapa si alguno pasa por el cono del techo, con margen m.
// R: centro (x, z), radio de la orilla r a la altura y0, punta y1 y el remate (hasta tip, en radio tipR).
const ROOF_PTS = [[0, 0.15], [0, 0.75], [0, 1.5], [-0.7, 0.75], [0.7, 0.75]];   // [a la derecha, altura] en tamaños de Tamachin
function roofCrosses(R, m) {
  const P = player, sc = P.T.scale, c = camView.vc, s = camView.vs;
  for (const [u, h] of ROOF_PTS) {
    const px = P.pos.x + u * sc * c, py = P.pos.y + h * sc, pz = P.pos.z - u * sc * s;
    const dx = camPos.x - px, dy = camPos.y - py, dz = camPos.z - pz, fx = px - R.x, fz = pz - R.z;
    const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - (R.r + m) * (R.r + m), disc = B * B - 4 * A * C;
    if (A < 1e-6 || disc <= 0) continue;                                    // el rayo no pasa sobre la planta
    const q = Math.sqrt(disc), t0 = Math.max(0, (-B - q) / (2 * A)), t1 = Math.min(1, (-B + q) / (2 * A));
    if (t0 >= t1) continue;
    const n = Math.ceil((t1 - t0) * Math.sqrt(A) / 0.15);                  // cada 15 cm sobre la planta
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n, y = py + dy * t, rr = Math.hypot(fx + dx * t, fz + dz * t);
      const top = Math.max(R.y0 + (R.y1 - R.y0) * (1 - Math.max(0, rr - m) / R.r), rr < R.tipR + m ? R.tip : 0);
      if (y > R.y0 - m && y < top + m) return true;
    }
  }
  return false;
}
function fadeMat(m, op) { m.opacity = op; const tr = op < 0.985; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } }
// Lo que tapa a Tamachin no se vuelve transparente (eso dibujaba ventanas fantasma enormes): se corta casi al ras del suelo,
// como una casa de muñecas. Un plano horizontal baja desde arriba del techo hasta CUT_Y; queda la planta, las paredes se ven por
// dentro (walls) y la sombra sigue entera (clipShadows es falso). k: 1 entero, 0 cortado.
const CUT_Y = 0.75;                                              // apenas sobre el zócalo de 0.5 m: no le tapa la boca aunque esté pegado
function cutY(k, h) { return CUT_Y + (h + 3.5 - CUT_Y) * k; }   // con k = 1 queda sobre lo que hay en las azoteas
function cutMats(mats, walls, plane, on) {
  for (const m of mats) {
    if (!!m.clippingPlanes === on) continue;
    m.clippingPlanes = on ? [plane] : null; if (walls.includes(m)) m.side = on ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true;
  }
}
const GRASS_P = 2000 / 260;
function updateScenery(dt) {
  const P = player, x = P.pos.x, z = P.pos.z, c = camView.vc, s = camView.vs;
  // Las pruebas siguen el rayo real cámara→Tamachin: con el adelanto la cámara puede quedar más lejos y de lado.
  const cu = (camPos.x - x) * c - (camPos.z - z) * s, cd = (camPos.x - x) * s + (camPos.z - z) * c;   // la cámara en su propio marco
  const back = Math.max(1, cd), rayU = (d) => cu * Math.max(0, d) / back;           // u del rayo a d metros hacia la cámara
  // casa: sin techo ni fachada cuando Tamachin está dentro; transparente cuando pasa por detrás
  const inside = P.inHouse, hb = camBox(HOUSE.x0, HOUSE.x1, HOUSE.z0, HOUSE.z1, x, z), hu = rayU(hb.dmin);
  const behind = !inside && (hb.dmin > -0.6 ? hb.dmin * camSlope < 7.5 && hu > hb.umin - 3.5 && hu < hb.umax + 3.5
    : rayCrosses(HOUSE_OCC, x, z, cu / back, back));                // a un lado (cámara en diagonal): solo si el rayo la cruza
  // dentro, con la cámara de otro lado que no es el sur, la pared por donde sale el rayo también estorba (la fachada ya se esconde)
  let wallHit = false;
  if (inside && c < 0.9) {
    const dx = s + cu / back * c, dz = c - cu / back * s;
    const tx = dx > 1e-4 ? (HOUSE.x1 - x) / dx : dx < -1e-4 ? (HOUSE.x0 - x) / dx : Infinity, tz = dz > 1e-4 ? (HOUSE.z1 - z) / dz : dz < -1e-4 ? (HOUSE.z0 - z) / dz : Infinity;
    wallHit = !(tz <= tx && dz > 0) && Math.min(tx, tz) * camSlope < HOUSE.h;
  }
  // oWalls: qué tan entera está (1) o cortada (0); dentro, la fachada y el techo se esconden como siempre (oFront, oRoof)
  house.oWalls = damp(house.oWalls, behind || wallHit ? 0 : 1, 9, dt); house.oFront = damp(house.oFront, inside ? 0 : 1, 9, dt); house.oRoof = damp(house.oRoof, inside ? 0 : 1, 9, dt);
  house.plane.constant = cutY(house.oWalls, HOUSE.h + 3);
  cutMats(house.cutMats, house.cutWalls, house.plane, house.oWalls < 0.999);
  fadeMat(house.mFront, house.oFront); fadeMat(house.mRoof, house.oRoof); fadeMat(house.doorMat, house.oFront);
  house.front.visible = house.oFront > 0.03; house.roof.visible = house.oRoof > 0.03; house.doorPivot.visible = house.oFront > 0.03;
  for (const m of house.glowFront) m.visible = house.front.visible;   // las ventanas prendidas de la fachada y el foco del porche
  if (lampMeshes.porchOn !== house.front.visible) { lampMeshes.porchOn = house.front.visible; lampMeshes.setLamp(lampMeshes.porch, house.front.visible); }
  house.roof.castShadow = house.oRoof > 0.5; house.front.castShadow = house.oFront > 0.5;
  house.doorA = damp(house.doorA, Math.hypot(x, z + 4.1) < 3.3 ? 1.8 : 0, 7, dt); house.doorPivot.rotation.y = house.doorA;
  if (house.tvOn) house.tvMat.color.setHSL((clock * 0.23) % 1, 0.7, 0.55 + Math.sin(clock * 9) * 0.08);
  // edificios que tapan a Tamachin
  for (const o of occluders) {
    if (o.k === 1 && Math.abs((o.z0 + o.z1) / 2 - z) > 70) continue;           // lejos (en casa o en Valle Alegre)
    let hide;
    if (o.roof) hide = roofCrosses(o.roof, o.k < 0.5 ? 0.7 : 0.35);   // ya cortado, margen mayor: que no parpadee en la orilla
    else if (ui.closeup) { const b = camBox(o.x0, o.x1, o.z0, o.z1, x, z), ru = rayU(b.dmin); hide = b.dmin > -0.3 && b.dmin < 7 && ru > b.umin - 2.2 && ru < b.umax + 2.2; }
    else hide = rayCrosses(o, x, z, cu / back, back);
    const t = hide ? 0 : 1; if (o.k === t) continue;
    o.k = Math.abs(o.k - t) < 0.001 ? t : damp(o.k, t, 9, dt);
    if (!o.plane) o.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
    o.plane.constant = cutY(o.k, o.h); o.cut = o.k < 0.999; cutMats(o.mats, o.walls ? [o.walls] : [], o.plane, o.cut);
  }
  // los árboles y arbustos que tapan a Tamachin no se mueven: se abren en un círculo alrededor de él (FX.see, en updateCamera)
  ground.position.set(Math.round(x / GRASS_P) * GRASS_P, 0, -100 + Math.round((z + 100) / GRASS_P) * GRASS_P);   // el pasto sigue a Tamachin sin que se mueva el dibujo
  windmill.rotation.z -= dt * 0.9;
  waterTex.offset.y -= dt * 0.16;
  updateCampfire(dt);
  for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 300) c.position.x = -300; }
}

// La fogata (03-world.js): llamas que suben, se encogen y pasan de amarillo a rojo; chispas sueltas; humo gris que crece, se lo lleva
// el viento y se desvanece (de noche más oscuro y, abajo, teñido por el fuego). Solo se mueve con Tamachin cerca.
const SMOKE_DAY = new THREE.Color(0.66, 0.66, 0.68), SMOKE_NIGHT = new THREE.Color(0.42, 0.44, 0.53), SMOKE_FIRE = new THREE.Color(0.85, 0.5, 0.3), _sm = new THREE.Color();
const WIND = { x: 0.32, z: -0.12 };
function updateCampfire(dt) {
  const F = campfire, near = Math.hypot(player.pos.x - CAMP.x, player.pos.z - CAMP.z) < 110;
  if (near !== F.on) { F.on = near; for (const o of [F.flames.pts, F.core.pts, F.sparks.pts, F.smoke.pts, F.glow]) o.visible = near; }
  if (!near) return;
  const night = 1 - day.light, flick = 0.85 + 0.1 * Math.sin(clock * 13) + 0.06 * Math.sin(clock * 29 + 1);
  F.embers.material.color.setScalar(0.75 + 0.25 * Math.sin(clock * 3.1)); F.glow.material.opacity = (0.16 + 0.6 * night) * flick;
  const put = (S, i, p, size, alpha, r, g, b) => { const a = S.a; a.position.setXYZ(i, p.x, p.y, p.z); a.size.setX(i, size); a.alpha.setX(i, alpha); a.tint.setXYZ(i, r, g, b); a.spin.setX(i, p.sp); };
  // llamas: lenguas naranjas que suben, se encogen y se vuelven rojas; encima, un centro amarillo que brilla
  const flame = (S, base, spread, lifeA, lifeB, vyA, vyB, sA, sB) => S.list.forEach((p, i) => {
    if (S === F.core && i === 0) { p.x = CAMP.x; p.y = 0.75; p.z = CAMP.z; p.sp = 0; put(S, 0, p, 2.6, (0.16 + 0.3 * night) * flick, 1, 0.5, 0.18); return; }   // el halo
    p.t += dt;
    if (p.t >= p.life) { const a = rand(0, TAU), r = Math.sqrt(Math.random()) * spread; Object.assign(p, { t: 0, life: rand(lifeA, lifeB), x: CAMP.x + Math.cos(a) * r, y: base, z: CAMP.z + Math.sin(a) * r,
      vx: -Math.cos(a) * r * 0.6, vz: -Math.sin(a) * r * 0.6, vy: rand(vyA, vyB), s0: rand(sA, sB), sp: rand(-0.3, 0.3) }); }
    const k = p.t / p.life; p.x += (p.vx + WIND.x * 0.3 * k) * dt; p.z += (p.vz + WIND.z * 0.3 * k) * dt; p.y += p.vy * dt * (1 - 0.25 * k);
    const size = p.s0 * (1 - 0.65 * k) * Math.min(1, k / 0.1 + 0.4), alpha = Math.min(1, k / 0.07) * Math.pow(1 - k, 1.1) * flick;
    if (S === F.flames) put(S, i, p, size, alpha * 0.92, 1, lerp(0.62, 0.22, k), lerp(0.16, 0.04, k));
    else put(S, i, p, size, alpha * 0.85, 1, lerp(0.95, 0.6, k), lerp(0.7, 0.2, k));
  });
  flame(F.flames, 0.28, 0.3, 0.5, 1.0, 1.0, 1.6, 0.7, 1.1);
  flame(F.core, 0.28, 0.18, 0.35, 0.7, 0.9, 1.4, 0.45, 0.7);
  // chispas: de vez en cuando una, que sube rápido y culebrea
  F.sparkT -= dt;
  F.sparks.list.forEach((p, i) => {
    if (p.t >= p.life && F.sparkT <= 0) { F.sparkT = rand(0.08, 0.35); Object.assign(p, { t: 0, life: rand(0.8, 1.7), x: CAMP.x + rand(-0.2, 0.2), y: 0.5, z: CAMP.z + rand(-0.2, 0.2), vy: rand(1.6, 3), sp: 0 }); }
    p.t += dt; const k = Math.min(1, p.t / p.life);
    p.x += (Math.sin(p.t * 9 + p.ph) * 0.5 + WIND.x * 0.5) * dt; p.z += (Math.cos(p.t * 7 + p.ph) * 0.5 + WIND.z * 0.5) * dt; p.y += p.vy * dt * (1 - 0.5 * k);
    put(F.sparks, i, p, 0.09, k >= 1 ? 0 : (1 - k) * (0.6 + 0.4 * Math.sin(p.t * 25)), 1, 0.72, 0.3);
  });
  // humo
  F.smoke.list.forEach((p, i) => {
    p.t += dt;
    if (p.t >= p.life) Object.assign(p, { t: 0, life: rand(5, 7.5), x: CAMP.x + rand(-0.15, 0.15), y: 0.95, z: CAMP.z + rand(-0.15, 0.15), vy: rand(0.5, 0.75), s0: rand(0.45, 0.65), sp: rand(0, TAU), vx: rand(-0.12, 0.12) });
    const k = p.t / p.life, sway = Math.sin(p.t * 0.9 + p.ph) * 0.18;
    p.x += (WIND.x * k * 1.3 + p.vx + sway) * dt; p.z += (WIND.z * k * 1.3) * dt; p.y += p.vy * dt * (1 - 0.35 * k); p.sp += dt * 0.25;
    _sm.copy(SMOKE_DAY).lerp(SMOKE_NIGHT, night).lerp(SMOKE_FIRE, night * 0.6 * Math.max(0, 1 - k * 4));
    put(F.smoke, i, p, p.s0 + 2.3 * k, Math.min(1, k / 0.15) * Math.pow(1 - k, 1.4) * 0.38, _sm.r, _sm.g, _sm.b);
  });
  for (const S of [F.flames, F.core, F.sparks, F.smoke]) for (const k in S.a) S.a[k].needsUpdate = true;
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
    for (const it of world.interacts) { const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z); if (d < it.range && d < bd && (!it.ok || it.ok())) { bd = d; best = it; } }
    const fp = world === EARTH && forestPlantNear(P.pos.x, P.pos.z); if (fp && Math.hypot(fp.x - P.pos.x, fp.z - P.pos.z) < bd) best = fp.act || (fp.act = { pos: fp, range: fp.range, label: 'Comer ' + FRUITS[fp.kind].name, act: () => eatPlant(fp) });
  }
  curInteract = best; updateClock();
  const label = P.state === 'sleep' ? 'Despertar' : best ? (typeof best.label === 'function' ? best.label() : best.label) : null;
  if (label !== lastPrompt) { lastPrompt = label; promptEl.hidden = !label; promptText.textContent = label || ''; tAct.textContent = label || 'Truco'; }
  hudT -= dt; if (hudT <= 0) { hudT = 0.2; const zn = world.zone(); if (zn !== lastZone) { lastZone = zn; zoneEl.textContent = zn; document.documentElement.style.setProperty('--hud-h', topEl.offsetHeight + 'px'); } syncNeedsHud(); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
  if (!helpEl.hidden && P.moved > 14) hideHelp();
  if (homeArmed && clock > homeArmed) { homeArmed = 0; bHome.textContent = 'Volver al inicio'; }   // se pasó el segundo toque
}

// ───────────────────────── luces de noche (el día y la noche están en 01-core.js) ─────────────────────────
// Los focos de los faroles (LAMPS) y su charco de luz en el suelo: dos InstancedMesh para todos, que solo se dibujan de noche.
// El farolito de Tamachin sí es una luz de verdad: está en la escena desde el principio, siempre visible, con intensidad 0 de día.
// Quitarla o esconderla (también dentro de un grupo escondido) cambiaría el número de luces y recompilaría todos los materiales.
const lampMeshes = (() => {
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), nightMat(0xfff2c0, 1), LAMPS.length);
  const poolTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const pools = LAMPS.filter((l) => l.pool);
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), nightMat(0xffc878, 0.42, { map: poolTex, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), pools.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const setLamp = (i, on) => { const l = LAMPS[i], r = on ? l.r : 0; bulbs.setMatrixAt(i, m4.compose(v.set(l.x, l.y, l.z), q, sc.set(r, r * 0.8, r))); bulbs.instanceMatrix.needsUpdate = true; };
  LAMPS.forEach((l, i) => setLamp(i, true));
  pools.forEach((l, i) => poolMesh.setMatrixAt(i, m4.compose(v.set(l.x, groundY(l.x, l.z) + 0.06, l.z), q, sc.set(7, 1, 7))));
  for (const m of [bulbs, poolMesh]) { m.frustumCulled = false; scene.add(m); }
  return { bulbs, pools: poolMesh, setLamp, porch: LAMPS.findIndex((l) => l.porch), porchOn: true };
})();
const IN_WARM = { sky: new THREE.Color(0xffe2b8), gnd: new THREE.Color(0x9a7a5c) }; let houseWarm = 0;
const lanternLight = new THREE.PointLight(0xffc27a, 0, 9, 1.4); scene.add(lanternLight);
const lantern = (() => {
  const g = new THREE.Group(), ink = new THREE.MeshStandardMaterial({ color: 0x3b2a4a, roughness: 0.6 });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd98a })); glass.scale.set(1, 1.2, 1);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.07, 12), ink); top.position.y = 0.2;
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.05, 12), ink); bot.position.y = -0.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 14), ink); ring.position.y = 0.27;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: skyDot, color: 0xffb35c, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 })); halo.scale.setScalar(1.3);
  g.add(glass, top, bot, ring, halo); g.visible = false; scene.add(g);
  return { g, x: 0, y: 0, z: 0, t: 0, init: false };
})();
// luciérnagas: de noche, en el jardín, el parque, el camino y los bosques. Viven en el mundo (no se mueven con Tamachin): las que quedan
// lejos vuelven a aparecer cerca. Un solo Points; cada una parpadea a su ritmo (el color de su vértice).
const FIREFLY_ZONES = { jardin: 0.5, parque: 0.8, camino: 1, bosque: 1, sinfin: 1, montes: 0.4 };
const fireflies = (() => {
  const N = 36, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.75, map: skyDot, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  const flies = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, vx: 0, vz: 0, ph: rand(0, TAU), sp: rand(0.6, 1.4), born: false }));
  return { pts, pos, col, flies, k: 0 };
})();
function updateFireflies(dt) {
  const P = player, F = fireflies, want = smooth(0.4, 0.1, day.light) * (FIREFLY_ZONES[musicZone()] || 0) * (P.pos.y < 120 ? 1 : 0) * (1 - weather.rain);
  F.k = damp(F.k, want, 1.5, dt); F.pts.visible = F.k > 0.02; if (!F.pts.visible) { for (const f of F.flies) f.born = false; return; }
  const n = Math.round(F.flies.length * Math.min(1, F.k * 1.2));
  F.flies.forEach((f, i) => {
    if (!f.born || Math.hypot(f.x - P.pos.x, f.z - P.pos.z) > 17) {      // aparece cerca (a 3-14 m), a la altura de la hierba o un poco más
      const a = rand(0, TAU), r = rand(3, 14); f.x = P.pos.x + Math.cos(a) * r; f.z = P.pos.z + Math.sin(a) * r; f.y = groundY(f.x, f.z) + rand(0.4, 2.2); f.born = true;
    }
    f.vx = damp(f.vx, Math.sin(clock * 0.7 * f.sp + f.ph) * 0.6, 1, dt); f.vz = damp(f.vz, Math.cos(clock * 0.53 * f.sp + f.ph * 1.3) * 0.6, 1, dt);
    f.x += f.vx * dt; f.z += f.vz * dt; f.y += Math.sin(clock * 1.1 * f.sp + f.ph) * 0.25 * dt;
    const blink = i < n ? Math.min(1, 1.4 * Math.pow(Math.max(0, Math.sin(clock * 1.6 * f.sp + f.ph)), 2)) * F.k : 0;
    if (quests.luciernagas === 1 && i < n && F.k > 0.3 && Math.hypot(f.x - P.pos.x, f.y - P.pos.y - 0.8 * P.T.scale, f.z - P.pos.z) < 0.95 * P.T.scale) catchFly(f);   // al pasar junto a ella
    F.pos[i * 3] = f.x; F.pos[i * 3 + 1] = f.y; F.pos[i * 3 + 2] = f.z;
    F.col[i * 3] = 0.9 * blink; F.col[i * 3 + 1] = 1 * blink; F.col[i * 3 + 2] = 0.45 * blink;
  });
  F.pts.geometry.attributes.position.needsUpdate = true; F.pts.geometry.attributes.color.needsUpdate = true;
}
// atrapar una luciérnaga (el encargo de Musgo): se va a otro lado, y al juntar diez el frasco aparece sobre la mesa de la casa
function catchFly(f) {
  burst('spark', f.x, f.y, f.z, 4); f.born = false; fliesCaught = Math.min(10, fliesCaught + 1); SFX.pop();
  if (fliesCaught >= 10) { finishQuest('luciernagas'); jar.visible = true; say(player, '¡Diez luciérnagas! A casa, al frasco.', 3); }
  else { toast('Luciérnagas: ' + fliesCaught + ' de 10.', 2.4); renderDiary(); save(); }
}
function tapFly(px, py) {
  const F = fireflies; if (quests.luciernagas !== 1 || !F.pts.visible || F.k < 0.3) return false;
  for (const f of F.flies) if (f.born && hitTest(px, py, f.x, f.y, f.z, 0.5) < Infinity) { catchFly(f); return true; }
  return false;
}
const jar = (() => {
  const g = new THREE.Group(), glass = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 16), new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.35, roughness: 0.1 }));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x9a6540, roughness: 0.6 })); lid.position.y = 0.165;
  const R = mulberry(1010), b = new Batch(); for (let i = 0; i < 10; i++) b.sph('#e6ff8a', (R() - 0.5) * 0.14, (R() - 0.5) * 0.18, (R() - 0.5) * 0.14, 0.022);
  const bugs = new THREE.Mesh(b.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: skyDot, color: 0xd8ff7a, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 })); halo.scale.setScalar(0.9);
  g.add(bugs, glass, lid, halo); g.position.set(3.2, 0.99, -7.85); g.visible = false; scene.add(g); g.bugs = bugs; g.halo = halo; return g;
})();
// ───────────────────────── estrellas fugaces ─────────────────────────
// De noche, cada medio minuto más o menos, una cruza la parte de arriba de la pantalla (se pone donde la cámara la ve: casi nunca ve el
// cielo). Tocarla pide un deseo: diversión y un ánimo alegre. Es una tira que se estira detrás de la cabeza, sin profundidad.
const WISHES = ['Deseo… ¡que mañana haya muchas fresas!', 'Deseo… ¡volar como el búho!', 'Deseo… ¡un amigo nuevo en el bosque!', 'Deseo… ¡que la fogata nunca se apague!', 'Deseo… ¡subir a las tres cimas otra vez!', 'Deseo… ¡bailar con la banda del kiosco!'];
const shoot = (() => {
  const tex = canvasTex(128, 16, (g) => { const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.85, 'rgba(255,248,220,.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(122, 2); g.arc(122, 8, 6, -Math.PI / 2, Math.PI / 2); g.lineTo(0, 8); g.fill(); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)); geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2)); geo.setIndex([0, 2, 1, 2, 3, 1]);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 5; m.visible = false; m.raycast = () => {}; scene.add(m);
  return { m, head: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, life: 0, next: 20, hint: false, wished: 0 };
})();
const _sh = new THREE.Vector3(), _st = new THREE.Vector3(), _sd = new THREE.Vector3();
function spawnShootingStar() {
  const S = shoot, side = Math.random() < 0.5 ? -1 : 1;
  _sh.set(rand(-0.55, 0.55) - side * 0.25, rand(0.62, 0.82), 0.5).unproject(camera).sub(camera.position).normalize();
  S.head.copy(camera.position).addScaledVector(_sh, 90);
  _sd.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(side); _st.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(-0.35);
  S.vel.copy(_sd).add(_st).normalize().multiplyScalar(48); S.t = 0; S.life = 1.5; S.m.visible = true;
  if (!S.hint) { S.hint = true; toast('¡Una estrella fugaz! Tócala para pedir un deseo.', 3); }
}
function updateShootingStar(dt) {
  const S = shoot;
  if (!S.m.visible) { if (day.stars > 0.8 && player.state !== 'sleep' && (S.next -= dt) <= 0) { S.next = rand(25, 45); spawnShootingStar(); } return; }
  S.t += dt; if (S.t >= S.life || day.stars < 0.5) { S.m.visible = false; return; }
  S.head.addScaledVector(S.vel, dt);
  const k = S.t / S.life, len = 14 * Math.min(1, S.t / 0.25), w = 0.7 * (1 - k * 0.6);
  _st.copy(S.head).addScaledVector(S.vel, -len / S.vel.length());
  _sd.subVectors(S.head, _st).cross(_sh.subVectors(S.head, camera.position)).normalize().multiplyScalar(w);
  const p = S.m.geometry.attributes.position;
  p.setXYZ(0, _st.x - _sd.x * 0.2, _st.y - _sd.y * 0.2, _st.z - _sd.z * 0.2); p.setXYZ(1, _st.x + _sd.x * 0.2, _st.y + _sd.y * 0.2, _st.z + _sd.z * 0.2);
  p.setXYZ(2, S.head.x - _sd.x, S.head.y - _sd.y, S.head.z - _sd.z); p.setXYZ(3, S.head.x + _sd.x, S.head.y + _sd.y, S.head.z + _sd.z); p.needsUpdate = true;
  S.m.material.opacity = Math.min(1, (1 - k) * 2.5);
}
function tapShootingStar(px, py) {
  const S = shoot; if (!S.m.visible) return false;
  _sh.copy(S.head).project(camera); const hx = (_sh.x * 0.5 + 0.5) * VW, hy = (-_sh.y * 0.5 + 0.5) * VH;
  _st.copy(S.head).addScaledVector(S.vel, -0.3).project(camera); const tx = (_st.x * 0.5 + 0.5) * VW, ty = (-_st.y * 0.5 + 0.5) * VH;
  const ex = hx - tx, ey = hy - ty, L2 = ex * ex + ey * ey || 1, u = clamp(((px - tx) * ex + (py - ty) * ey) / L2, 0, 1.15);
  if (Math.hypot(px - (tx + ex * u), py - (ty + ey * u)) > 70) return false;
  S.m.visible = false; S.wished++; const P = player;
  gain('diversion', 0.3); setTemp('enamorado', 4); say(P, choose(WISHES), 3.2); P.T.doTrick('spin'); burst('star', P.pos.x, P.pos.y + 1.8, P.pos.z, 8); SFX.yay(); return true;
}
// el farolito flota a la derecha de Tamachin (en la pantalla), un poco hacia la cámara, para no taparle la cara
function updateLantern(dt) {
  const P = player, L = lantern, k = smooth(0.55, 0.2, day.light), sc = P.T.scale;
  lanternLight.intensity = 0.95 * k; L.g.visible = k > 0.02;
  if (!L.g.visible) { L.init = false; return; }
  const c = camView.c, s = camView.s; L.t += dt;
  const tx = P.pos.x + (c * 0.85 + s * 0.2) * sc, tz = P.pos.z + (-s * 0.85 + c * 0.2) * sc, ty = P.pos.y + 1.45 * sc + Math.sin(L.t * 2.2) * 0.07;
  if (!L.init) { L.x = tx; L.y = ty; L.z = tz; L.init = true; } else { L.x = damp(L.x, tx, 5, dt); L.y = damp(L.y, ty, 5, dt); L.z = damp(L.z, tz, 5, dt); }
  L.g.position.set(L.x, L.y, L.z); L.g.scale.setScalar(0.4 + 0.6 * k); L.g.rotation.z = Math.sin(L.t * 1.7) * 0.12;
  lanternLight.position.set(L.x, L.y, L.z);
}

// ───────────────────────── reloj (el día y la noche están en 01-core.js) ─────────────────────────
// Analógico: la manecilla larga da una vuelta por minuto real (una hora de juego). De noche la carátula se oscurece y sale la luna.
const clockEl = $('#clock'), clockSvg = clockEl.querySelector('svg'), cHour = $('#cHour'), cMin = $('#cMin');
const cNight = $('#cNight'), cWarm = $('#cWarm'), cSun = $('#cSun'), cMoon = $('#cMoon'), cCloud = $('#cCloud'), cRain = $('#cRain');
{ let t = ''; for (let i = 0; i < 12; i++) { const a = i * 30 * DEG, x = Math.sin(a), y = -Math.cos(a), f = (v) => v.toFixed(2);
    t += i % 3 ? '<circle stroke="none" r="1.75" cx="' + f(x * 24.6) + '" cy="' + f(y * 24.6) + '"/>' : '<line x1="' + f(x * 21) + '" y1="' + f(y * 21) + '" x2="' + f(x * 26.4) + '" y2="' + f(y * 26.4) + '"/>'; }
  $('#cTicks').innerHTML = t; }
const CLOCK_INK = new THREE.Color(0x231d3b), CLOCK_INK_NIGHT = new THREE.Color(0xe9edff), _ck = new THREE.Color();
let clockA = -1, clockN = -1, clockStep = -1;
function hourText(h) {
  const H = Math.floor(h) % 24, M = Math.floor((h % 1) * 60), h12 = H % 12 || 12;
  const part = H === 0 || H >= 20 ? 'de la noche' : H < 6 ? 'de la madrugada' : H < 12 ? 'de la mañana' : 'de la tarde';
  return (h12 === 1 ? 'Es la ' : 'Son las ') + h12 + ':' + String(M).padStart(2, '0') + ' ' + part;
}
// el tiempo en palabras: lo que dicen el reloj y el diario
function weatherText() {
  if (!world.weather) return world.skyText || '';                   // en la luna no hay tiempo
  const W = weather, h = day.h, p = wPlan;
  if (W.rain > 0.3) return W.snow > W.here ? 'Está nevando en los cerros.' : 'Está lloviendo.';
  if (W.bow > 0.5) return '¡Hay un arcoíris!';
  if (!W.force && p && p.kind === 'lluvia') return h < p.from ? 'Al rato va a llover.' : 'Ya dejó de llover.';
  if (W.cloud > 0.5) return 'Está nublado.';
  return day.light > 0.5 ? 'Hace sol.' : 'El cielo está despejado.';
}
const weatherWord = () => (!world.weather ? world.skyWord : weather.kind === 'lluvia' ? 'lluvioso' : weather.kind === 'nublado' ? 'nublado' : day.light > 0.5 ? 'soleado' : 'despejado');
function clockSay() {
  const dark = day.h >= DAY.set || day.h < DAY.rise;
  toast(hourText(day.h) + '. ' + weatherText() + (!world.weather ? '' : ' ' + (dark ? 'Amanece a las 5 de la mañana.' : 'Oscurece a las 8 de la noche.')), 4); SFX.pop();   // en la luna, la hora es la de la Tierra
}
clockEl.addEventListener('click', clockSay);
function updateClock() {
  const h = day.h, m = (h % 1) * 360;
  if (Math.abs(m - clockA) > 0.25) { clockA = m; cMin.setAttribute('transform', 'rotate(' + m.toFixed(1) + ')'); cHour.setAttribute('transform', 'rotate(' + ((h % 12) * 30).toFixed(2) + ')'); }
  const n = 1 - day.light, cl = world.weather ? weather.cloud : 0, rn = world.weather ? weather.rain : 0;   // en la luna, sin nubes ni lluvia
  const wkey = n + cl * 3 + rn * 7;
  if (Math.abs(wkey - clockN) > 0.005) {
    clockN = wkey; const sunK = smooth(0.38, 0.48, day.light), nk = smooth(0.5, 0.95, n);   // al atardecer la carátula se pone durazno; ya de noche, azul
    cNight.setAttribute('opacity', nk.toFixed(3)); cWarm.setAttribute('opacity', (day.warm * 0.9).toFixed(3));
    const cloudK = smooth(0.4, 0.7, cl);
    cSun.setAttribute('opacity', (sunK * (1 - cloudK)).toFixed(3)); cMoon.setAttribute('opacity', ((1 - sunK) * (1 - cloudK)).toFixed(3));
    cCloud.setAttribute('opacity', cloudK.toFixed(3)); cRain.setAttribute('opacity', smooth(0.2, 0.5, rn).toFixed(3));
    clockSvg.style.color = '#' + _ck.copy(CLOCK_INK).lerp(CLOCK_INK_NIGHT, smooth(0.35, 0.65, nk)).getHexString();
  }
  const step = Math.floor(h * 6);                                  // el texto, cada 10 minutos de juego
  if (step !== clockStep) { clockStep = step; const txt = hourText(h); clockEl.setAttribute('aria-label', 'Reloj. ' + txt); clockEl.title = txt; if (!diaryEl.hidden) dayEl.textContent = 'Día ' + day.n + ' · ' + weatherWord() + ' · ' + txt[0].toLowerCase() + txt.slice(1); }
}
// ?hora=21 (o 21.5, o 21:30) en la dirección: empieza a esa hora, para probar la noche
function hourParam() {
  const m = /[?&]hora=(\d{1,2})(?:(?::|%3A)(\d{2})|(\.\d+))?/i.exec(location.search); if (!m) return null;
  const h = +m[1] + (m[2] ? +m[2] / 60 : m[3] ? +m[3] : 0);
  return h <= 24 ? h : null;
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  if (w === VW && h === VH) return; VW = w; VH = h;
  renderer.setSize(w, h, false); FIRE_H.value = h * renderer.getPixelRatio() / 2; camera.aspect = w / h; camera.fov = w / h < 0.8 ? 60 : 48; camera.updateProjectionMatrix();
  updMore(panelEl); updMore(diaryEl);
  document.documentElement.style.setProperty('--hud-h', topEl.offsetHeight + 'px');   // en teléfono la barra de arriba ocupa varias filas
}
const topEl = $('.top');
let last = performance.now();
// ?stats en la dirección: cuadros por segundo, el cuadro más lento y cuánto se dibuja, para medir en un teléfono de verdad.
// Un cuadro de más de 50 ms hace que el juego vaya en cámara lenta (dt se limita a 0.05 s).
const statsEl = /[?&]stats\b/.test(location.search) ? $('#app').appendChild(Object.assign(document.createElement('div'), { id: 'stats' })) : null;
const stats = { n: 0, t: 0, worst: 0, slow: 0 };
function updateStats(raw) {
  stats.n++; stats.t += raw; stats.worst = Math.max(stats.worst, raw); if (raw > 0.05) stats.slow++;
  if (stats.t < 1) return;
  const r = renderer.info.render;
  statsEl.textContent = Math.round(stats.n / stats.t) + ' cuadros/s · peor ' + Math.round(stats.worst * 1000) + ' ms\nde más de 50 ms: ' + stats.slow
    + '\n' + r.calls + ' llamadas · ' + Math.round(r.triangles / 1000) + 'k triángulos\n' + VW + '×' + VH + ' a ' + renderer.getPixelRatio().toFixed(2) + 'x';
  stats.n = stats.t = stats.worst = stats.slow = 0;
}
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0.001, (now - last) / 1000), dt = Math.min(0.05, raw); last = now;
  if (document.hidden) return;
  resize(); step(dt);
  renderer.render(scene, camera);
  if (statsEl) updateStats(raw);
}
// ───────────────────────── sombras de contacto ─────────────────────────
// Una mancha suave justo debajo de lo que está en el suelo. La sombra del sol cae de lado, y por debajo quedaba claro: las cosas parecían
// pegadas encima del suelo. Las de los árboles y arbustos de la Tierra son fijas (se barren a EARTH.root como todo lo de allá); las de
// Tamachin, los vecinos, los autos y los animales se mueven con ellos (updateBlobs, fuera de la raíz: también en la luna), y se achican al
// saltar. Negras con transparencia y con niebla (de lejos se pierden con el suelo); sin raycast (las pruebas de `vista` no las ven).
const BLOB_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), BLOB_UP = 0.08;   // arriba del piso de la ciudad (0.03) y de los senderos (0.04): si no, rayas
const BLOB_TEX = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
function blobMesh(n, opacity) {
  const m = new THREE.InstancedMesh(BLOB_GEO, new THREE.MeshBasicMaterial({ color: 0x000000, map: BLOB_TEX, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), n);
  m.frustumCulled = false; m.raycast = () => {}; m.renderOrder = -1; scene.add(m); return m;   // lo primero de lo transparente: está en el suelo
}
const blobFixed = (() => {
  const list = trees.map((t) => [t.x, t.z, (t.type ? 2.3 : 1.9) * t.s]).concat(bushes.map((b) => [b.x, b.z, 1.6 * b.s])), m = blobMesh(list.length, 0.3);
  list.forEach(([x, z, r], i) => { _im.compose(_ip.set(x, groundY(x, z) + BLOB_UP, z), _iq.identity(), _is.set(r, 1, r)); m.setMatrixAt(i, _im); });
  return m;
})();
const BLOB_MAX = 90, blobLive = blobMesh(BLOB_MAX, 0.36), _yAxis = new THREE.Vector3(0, 1, 0), BLOB_SIZE = { conejo: 0.9, rana: 0.7, venado: 1.7 };
function updateBlobs() {
  const P = player, m = blobLive; let n = 0;
  const put = (x, y, z, w, d, ry) => { if (n < BLOB_MAX) { _im.compose(_ip.set(x, y + BLOB_UP, z), _iq.setFromAxisAngle(_yAxis, ry || 0), _is.set(w, 1, d)); m.setMatrixAt(n++, _im); } };
  const near = (x, z) => Math.abs(x - P.pos.x) < 70 && Math.abs(z - P.pos.z) < 70;
  if (P.state !== 'sleep') {                                        // sobre el suelo o sobre lo que tiene debajo; más alto, más chica
    const g = world.ground(P.pos.x, P.pos.z), pr = perchUnder(P.pos.x, P.pos.z, P.pos.y), base = pr ? Math.max(g, pr.top) : g, k = clamp(1 - (P.pos.y - base) / 4, 0.35, 1), s = 1.55 * P.T.scale * k;
    put(P.pos.x, base, P.pos.z, s, s);
  }
  if (world === EARTH) {
    for (const v of npcs) if (v.T.group.visible && near(v.pos.x, v.pos.z)) put(v.pos.x, v.pos.y, v.pos.z, 1.4 * v.T.scale, 1.4 * v.T.scale);
    for (const c of cars) if (near(c.x, c.z)) { const ax = c.L.axis === 'x', l = c.half * 2.15, w = c.hw * 2.3; put(c.x, 0, c.z, ax ? l : w, ax ? w : l); }
  }
  for (const c of creatures) {
    const size = BLOB_SIZE[c.kind]; if (!size || (c.world || EARTH.name) !== world.name || !near(c.pos.x, c.pos.z) || (c.mesh && !c.mesh.visible)) continue;
    const g = c.world ? world.ground(c.pos.x, c.pos.z) : groundY(c.pos.x, c.pos.z), k = clamp(1 - (c.pos.y - g) / 2.5, 0.4, 1);
    put(c.pos.x, g, c.pos.z, size * k, size * k * (c.kind === 'venado' ? 1.6 : 1), c.heading || 0);
  }
  m.count = n; m.instanceMatrix.needsUpdate = true;
}

// ───────────────────────── la ventana en árboles y arbustos: ¿algo lo tapa? ─────────────────────────
// La ventana (FX.see, 01-core.js) solo se prende cuando una planta queda entre la cámara y Tamachin: con el `discard` en su shader, la
// GPU del iPhone dibuja los árboles sin una optimización, así que solo se paga mientras hace falta. Cada planta es un cilindro (alto y
// radio de su copa, por su escala). Se revisan las que caen cerca del segmento cámara→Tamachin: una rejilla de 24 m con las fijas (los
// árboles y arbustos de casa y del norte) y las del bosque sin fin que están cargadas. Queda prendida 0.4 s después (sin parpadeos).
const SEE_SIZE = { pine: [5.5, 1.7], oak: [5.4, 1.9], bush: [1.1, 1.0], ftree: [4.4, 1.6], arbor: [2.7, 1.6] }, SEE_CELL = 24, seeGrid = new Map();
{
  const put = (k, x, y, z, s) => { const [H, R] = SEE_SIZE[k], key = Math.floor(x / SEE_CELL) + ',' + Math.floor(z / SEE_CELL); let a = seeGrid.get(key); if (!a) seeGrid.set(key, (a = [])); a.push([x, z, y, H * s, R * s]); };
  for (const t of trees) put(t.type ? 'oak' : 'pine', t.x, 0, t.z, t.s);
  for (const b of bushes) put('bush', b.x, 0, b.z, b.s);
  for (const k of ['pine', 'oak', 'bush']) for (const it of SKIND[k].list) put(k, it.x, it.y, it.z, it.s);
}
let seeHold = -9;
function seeCheck(P, sc) {
  const C = camPos, dx = P.pos.x - C.x, dy = P.pos.y + 0.75 * sc - C.y, dz = P.pos.z - C.z, L2 = dx * dx + dz * dz, L = Math.sqrt(L2), seeR = 2.3 * 0.75 * sc;
  const covers = (x, z, y0, H, R) => {                               // ¿el cilindro de la planta toca el cono de la cámara al círculo?
    const t = ((x - C.x) * dx + (z - C.z) * dz) / L2; if (t <= 0 || t > 1 + R / L) return false;   // detrás de la cámara, o más allá de él
    const u = Math.min(t, 1), lx = C.x + dx * u - x, lz = C.z + dz * u - z, rc = u * seeR, y = C.y + dy * u, m = R + rc + 0.4;
    return lx * lx + lz * lz < m * m && y > y0 - rc && y < y0 + H + rc;
  };
  let hit = false;
  if (world === EARTH && L2 > 0.01) {
    const i0 = Math.floor((Math.min(C.x, P.pos.x) - 6) / SEE_CELL), i1 = Math.floor((Math.max(C.x, P.pos.x) + 6) / SEE_CELL);
    const j0 = Math.floor((Math.min(C.z, P.pos.z) - 6) / SEE_CELL), j1 = Math.floor((Math.max(C.z, P.pos.z) + 6) / SEE_CELL);
    for (let i = i0; i <= i1 && !hit; i++) for (let j = j0; j <= j1 && !hit; j++) { const a = seeGrid.get(i + ',' + j); if (a) hit = a.some((q) => covers(q[0], q[1], q[2], q[3], q[4])); }
    if (!hit) for (const c of forest.live.values()) {
      for (const k in SEE_SIZE) { const d = FK[k]; if (!d || !d.see) continue; const [H, R] = SEE_SIZE[k]; if (c.it[k].some((it) => covers(it.x, it.z, it.y, H * it.s, R * it.s))) { hit = true; break; } }
      if (hit) break;
    }
  }
  if (hit) seeHold = clock + 0.4;
  fxSee(clock < seeHold);
}

// ───────────────────────── mundos ─────────────────────────
// La Tierra: todo lo de siempre. Cada gancho es lo que el juego ya hacía, movido aquí. Lo que se pregunta "¿dónde estoy?" (el suelo,
// el agua, la casa, la cámara, el nombre del lugar, la música, los pasos) se lo pregunta al mundo de ahora (`world`), nunca a x y z
// sueltos: en la luna, el punto (0, -8) no es la casa. pre, mid y post corren antes de Tamachin, después y después de la cámara:
// mientras está en otro mundo, en la Tierra no se mueve nada (los autos, los vecinos y quien lo acompaña lo esperan donde estaban).
const EARTH = {
  name: 'tierra', rules: RULES, solids: EARTH_SOLIDS, interacts, weather: true, root: new THREE.Group(),
  ground: groundY, wet: (gy) => gy < -0.2, puddle: puddleJump, collide: earthCollide,
  inHouse: (p) => p.x > HOUSE.x0 + 0.1 && p.x < HOUSE.x1 - 0.1 && p.z > HOUSE.z0 + 0.25 && p.z < HOUSE.z1 - 0.2,
  slope(pos, ix, iz, mag) {                                         // al norte, en los cerros
    if (pos.z >= NORTH_Z) return 1;
    const gx = (terrainY(pos.x + 1, pos.z) - terrainY(pos.x - 1, pos.z)) / 2, gz = (terrainY(pos.x, pos.z + 1) - terrainY(pos.x, pos.z - 1)) / 2, up = (gx * ix + gz * iz) / mag;
    return up > 0 ? Math.max(0.62, 1 - 0.4 * up) : 1 + Math.min(0.15, -0.15 * up);
  },
  camBase: (p) => (p.z < NORTH_Z ? Math.max(0, groundY(p.x, p.z)) : 0), hills: (p) => p.z < NORTH_Z + 15, edge: edgeTop, camX: xLimitAt, camZ: LIMIT,
  zone: zoneName, music: musicZone, surface: stepSurface,
  pre(dt) {
    updateWeather(dt); updateTownHours(dt);
    houseWarm = damp(houseWarm, player.inHouse ? day.lamps : 0, 3, dt);   // adentro de la casa, de noche, las lámparas: luz cálida
    if (houseWarm > 0.005) { hemi.color.lerp(IN_WARM.sky, 0.75 * houseWarm); hemi.groundColor.lerp(IN_WARM.gnd, 0.75 * houseWarm); hemi.intensity = lerp(hemi.intensity, 0.72, houseWarm); sun.intensity *= 1 - 0.6 * houseWarm; }
    updateLights(clock); updatePedSigns(clock); updateCars(dt, clock);
  },
  mid(dt) {
    updateCrossing(); updateNPCs(dt);
    for (const c of creatures) if (!c.world && (c.buddy || c.follow > 0 || Math.abs(c.pos.z - player.pos.z) < 90)) c.update(dt);   // el conejo de Tofu vive en la ciudad
    updateFish(dt); updateQuests(dt); updateBerries(dt); updateFridge(dt); updateNorth(dt); updateButterflies(dt); updateScenery(dt);
    for (const k in WORLDS) if (WORLDS[k].onEarth) WORLDS[k].onEarth(dt);   // la entrada de cada mundo (el túnel de la luna)
  },
  post(dt) { updateFireflies(dt); updateShootingStar(dt); },
};
world = EARTH;
// Lo que otro mundo no trae: sin tiempo ni agua ni casa, la cámara sigue al suelo, nada que hacer. Puede poner `sky(force)` (su cielo
// y su luz, en vez de applyDay; la hora sigue corriendo), `enter` y `leave`, y `build(M)`, que arma lo suyo en M.root y M.solids.
const WORLD_BASE = {
  rules: RULES, weather: false, wet: () => false, puddle: () => false, inHouse: () => false, collide() {}, slope: null,
  camBase(p) { return this.ground(p.x, p.z); }, hills: () => true, edge(x, z) { return this.ground(x, z); }, camX: () => Infinity, camZ: Infinity,
  surface: () => 'piedra', pre() {}, mid() {}, post() {},
};
// Lo de la Tierra va en EARTH.root: escondido, no se dibuja nada de adentro (ni su sombra) aunque sus sistemas prendan o apaguen
// cosas. Afuera se quedan Tamachin, las tres luces, el cielo, el farolito y las partículas: no se esconden nunca (quitar una luz
// recompilaría todos los materiales). Lo que se agrega después (makeTamachin, la fruta que vuela) se barre al cambiar de mundo.
const KEEP = new Set([player.T.group, sun, sun.target, hemi, lanternLight, lantern.g, skyMesh, blobLive, ...particles.map((p) => p.s)]);
function sweepEarth() { for (const o of scene.children.slice()) if (!KEEP.has(o) && !o.userData.world) EARTH.root.add(o); }
fxAll(scene);                                                       // nubes que pasan en todo lo que recibe luz (01-core.js)
fxSee(true); renderer.compile(scene, camera); fxSee(false);         // la versión con ventana de árboles y arbustos, compilada desde ya
EARTH.root.userData.world = EARTH.name; scene.add(EARTH.root); sweepEarth();
function worldNamed(name) {
  if (name === EARTH.name) return EARTH;
  const M = WORLDS[name]; if (!M) return null;
  if (!M.root) {                                                    // la primera vez: se arma (y se compila bajo el telón)
    for (const k in WORLD_BASE) if (!(k in M)) M[k] = WORLD_BASE[k];
    M.interacts = M.interacts || [];                                // los suyos (build puede ponerlos); un conejo de viaje agrega el suyo
    M.root = new THREE.Group(); M.root.userData.world = name; M.root.visible = false; M.solids = solids();
    M.build(M); fxAll(M.root); scene.add(M.root);
  }
  return M;
}
// Al instante (al arrancar, «Volver al inicio», las pruebas); enterWorld lo hace con el telón. `at`: { x, z, heading, yaw, pet }; `pet`
// es dónde aparece quien viaja con él: un conejo que lo sigue, si está a menos de 16 m (de otro mundo, siempre: allá no se pierde).
function setWorld(name, at) {
  const N = worldNamed(name); if (!N) return false;
  const P = player;
  if (N !== world) {
    const pals = creatures.filter((c) => c.kind === 'conejo' && c.follow > 0 && !c.buddy && (c.world || EARTH.name) === world.name
      && (world !== EARTH || Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) < 16)), from = world;   // 16 m: brincando se queda un poco atrás
    if (world.leave) world.leave();
    sweepEarth(); world.root.visible = false; N.root.visible = true; world = N;
    if (N.enter) N.enter();
    skyNow(true);                                                   // su cielo y su luz, ya (de vuelta, el de la hora)
    for (const b of bubbles) if (b.who && b.who !== P) b.until = 0;   // lo que decían los de allá se queda allá
    pals.forEach((c, i) => travel(c, from, N, (at && at.pet) || { x: (at ? at.x : P.pos.x) + 1.3, z: (at ? at.z : P.pos.z) + 1.3 }, i));
    if (!N.compiled) { N.compiled = true; renderer.compile(scene, camera); }
  }
  P.vx = P.vz = P.vy = 0; P.perch = null; P.onGround = true; P.inWater = false;
  if (at) { P.pos.set(at.x, world.ground(at.x, at.z), at.z); if (at.heading != null) P.heading = at.heading; if (at.yaw != null) camView.yaw = camView.yawT = at.yaw; }
  P.inHouse = world.inHouse(P.pos); camInit = false;
  return true;
}
// un conejo de viaje: su malla va a la raíz del otro mundo, y su «Acariciar» a los avisos de allá (en la Tierra no debe quedar uno
// invisible donde estaba); allá lo mueve step (06) con el suelo y los choques de ese mundo (makeRabbit, 04-life.js)
function travel(c, from, to, spot, i) {
  const it = from.interacts.indexOf(from.interacts.find((q) => q.who === c)); if (it >= 0) to.interacts.push(from.interacts.splice(it, 1)[0]);
  c.world = to === EARTH ? null : to.name; to.root.add(c.mesh);
  const x = spot.x + i * 0.9, z = spot.z; c.pos.set(x, to === EARTH ? 0 : to.ground(x, z), z); c.tx = x; c.tz = z; c.hopP = 0; c.rest = 0.4; c.mesh.rotation.x = 0;
  if (to !== EARTH) say(c, choose(['¡Hooop!', '¡Hop… hooop!', '(mira las estrellas)']), 2.2);
}
// Con el telón: se cierra (0.45 s), cambia de mundo, y se abre. Va en una secuencia (startBusy), así `advance` también lo mueve.
// o: { at, line, walkIn, walkOut }. walkIn y walkOut ({ x, z }, m/s) lo hacen caminar mientras se cierra y mientras se abre (por la
// boca de un túnel): la secuencia es `ghost`, sin chocar con nada, porque la boca es una pared.
const telonEl = $('#telon');
function enterWorld(name, o) {
  const P = player; o = o || {}; if (P.state !== 'normal' || !worldNamed(name)) return false;
  telonEl.hidden = false;
  const walk = (v) => { if (!v) return; P.vx = v.x; P.vz = v.z; P.heading = Math.atan2(v.x, v.z); };
  startBusy({ dur: 1.15, cam: null, ghost: true,
    update(dt, t) {
      telonEl.style.opacity = (t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.6) / 0.5)).toFixed(3);
      if (t < 0.5) walk(o.walkIn); else if (t > 0.55 && t < 1.05) walk(o.walkOut);
      if (once(this, 'swap', 0.5)) setWorld(name, o.at);
    },
    end() { telonEl.hidden = true; telonEl.style.opacity = '0'; if (o.line) say(P, o.line, 2.6); save(); },
  });
  return true;
}

// las nubes avanzan con el viento (como las de 03-world.js, hacia +x) y su sombra pesa con el sol alto; en la luna y de noche no hay. El
// borde de Tamachin toma el color de la luz del cielo.
function updateFx(dt) {
  const C = FX.cloud.value, sky = world.weather ? smooth(0.45, 0.85, day.light) * (1 - 0.75 * weather.cloud) : 0;
  FX.time.value = clock; C.x = (C.x - dt * 1.2 * C.w) % 1; C.y = (C.y + dt * 0.35 * C.w) % 1; C.z = 0.32 * sky;
  FX.rim.value.copy(hemi.color).multiplyScalar(0.42);
}
// todo lo que pasa en un cuadro, sin dibujar (las pruebas lo repiten con `advance` para adelantar el juego sin esperar)
function step(dt) {
  clock += dt; updateDay(dt); updateDayCount();
  const glow = 0.14 * (1 - day.light); if (Math.abs(glow - player.T.glowK) > 0.004) player.T.glow(glow);   // de noche brilla un poco (además del farolito)
  world.pre(dt); updatePlayer(dt); world.mid(dt);
  if (world !== EARTH) for (const c of creatures) if (c.world === world.name) c.update(dt);   // quien vino con él (un conejo)
  updateNeeds(dt); updateBlobs(); updateFx(dt);
  updateCamera(dt); updateLantern(dt); world.post(dt); updateParticles(dt); updateHud(dt); updateBubbles(VW, VH);
  try { updateMusic(dt); } catch (e) { musErr = e; if (mus) try { const t = snd.ctx.currentTime; mus.stop(t); mus.amb.out.gain.setTargetAtTime(0, t, 0.1); } catch (_) { /* nada */ } }
}
// para las pruebas: corre `sec` segundos de juego de golpe, en pasos de `dt`, y dibuja una vez (así quedan al día las matrices)
function advance(sec, dt) { dt = dt || 1 / 30; for (let i = 0, n = Math.ceil(sec / dt); i < n; i++) step(dt); renderer.render(scene, camera); }

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
  if (typeof s.yaw === 'number' && isFinite(s.yaw)) camView.yaw = camView.yawT = angDiff(0, s.yaw);   // la cámara como la dejaste (antes del mundo: la luna la baja al entrar)
  if (typeof s.pitch === 'number' && isFinite(s.pitch)) camView.pitch = camView.pitchT = clamp(s.pitch, PITCH.min, PITCH.max);
  const away = typeof s.mundo === 'string' && s.mundo !== EARTH.name, there = away && setWorld(s.mundo);   // se quedó en otro mundo: ahí sigue
  if ((!away || there) && typeof s.x === 'number' && typeof s.z === 'number' && isFinite(s.x) && isFinite(s.z)) { const pr = perchUnder(s.x, s.z, Infinity), top = pr ? pr.top : -Infinity;   // donde se quedó; si estaba parado sobre algo, ahí mismo
    player.pos.set(s.x, Math.max(0, top), s.z); resolvePlayer(); player.pos.y = Math.max(world.ground(player.pos.x, player.pos.z), top); }   // (de un mundo que ya no existe: al inicio)
  if (typeof s.heading === 'number' && isFinite(s.heading)) player.heading = s.heading;
  if (s.sound === false) setSound('no'); else if (typeof s.sound === 'string') setSound(s.sound);   // antes se guardaba sí o no
  if (s.helpSeen === true) helpEl.hidden = true;
  const qh = hourParam(); setHour(qh != null ? qh : typeof s.hora === 'number' && isFinite(s.hora) ? s.hora : DAY.start);   // las partidas viejas empiezan a las 8
  if (Number.isInteger(s.dia) && s.dia > 0) day.n = s.dia; lastHour = day.h;
  const qc = /[?&]clima=(lluvia|nublado|sol|arcoiris)\b/.exec(location.search); weather.force = qc ? qc[1] : null; updateWeather(0, true);   // el tiempo de hoy, sin esperar a que entre
  if (Number.isInteger(s.flies) && s.flies >= 0) fliesCaught = Math.min(10, s.flies); jar.visible = quests.luciernagas === 2;
  if (Number.isInteger(s.charcos) && s.charcos >= 0) puddleJumps = Math.min(10, s.charcos);
  applyMood(); syncPanel();
  resize(); updateCamera(0.016);
  player.T.doTrick('wave'); say(player, upd.fresh ? '¡Me actualicé! ¿Qué habrá de nuevo?' : '¡Hola! Soy Tamachin.', 4);
  requestAnimationFrame(frame);
}
// lo que dejó hecho un encargo sigue así al volver
function restoreQuests() {
  if (quests.conejo === 2) { const r = creatures.find((c) => c.kind === 'conejo'); giveRabbit(r); r.pos.set(tofu.pos.x + 1.2, 0, tofu.pos.z + 1); }
  if (quests.fuente === 2) { lulu.loop = null; lulu.home = LULU_SPOT; lulu.pos.set(LULU_SPOT.x, 0, LULU_SPOT.z); lulu.heading = LULU_SPOT.ry; }
  if (quests.gelatina === 2) { nube.mood0 = 'contento'; nube.T.setMood('contento'); }
}
// Versión nueva. publicar.cjs pone en la página (<meta name="version">) y en sw.js (VERSION) un resumen de lo publicado y la hora; en
// el repo dicen "dev" y aquí no se busca nada. Cada publicación cambia sw.js: al volver al juego se le pide al navegador que lo revise
// (`update`); si cambió, el nuevo se instala (guarda la copia nueva completa) y toma el control. Si el que manda tiene otra versión,
// más reciente que la de esta página, ya está lista: un aviso, el diario lo dice con un botón, y la próxima vez que vuelvas al juego
// se recarga sola si es buen momento. Antes de recargar se vuelve a preguntar, y nunca se recarga dos veces por la misma versión.
function parseVer(s) { const m = /^([0-9a-f]{6,}) (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)$/.exec(String(s || '')); return m ? { h: m[1], t: Date.parse(m[2]) } : null; }
const upd = { mine: parseVer(($('meta[name=version]') || {}).content), ready: null, reg: null, fresh: false, tried: [], focusT: 0 };
try {
  upd.tried = JSON.parse(sessionStorage.getItem('tamachin-tried') || '[]') || [];
  const from = sessionStorage.getItem('tamachin-from'); sessionStorage.removeItem('tamachin-from');
  upd.fresh = !!(from && upd.mine && from !== upd.mine.h);   // venimos de actualizar (lo dice Tamachin al arrancar)
} catch (e) { /* sin sessionStorage */ }
const newer = (v) => !!(v && upd.mine && v.h !== upd.mine.h && v.t > upd.mine.t);
// la versión del service worker que manda; null si no hay, si no contesta o si es uno viejo (sin VERSION)
function askVer() {
  const w = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!w || !upd.mine) return Promise.resolve(null);
  return new Promise((ok) => {
    const ch = new MessageChannel(), t = setTimeout(() => ok(null), 2000);
    ch.port1.onmessage = (e) => { clearTimeout(t); ok(parseVer(e.data)); };
    try { w.postMessage({ type: 'version' }, [ch.port2]); } catch (e) { clearTimeout(t); ok(null); }
  });
}
async function updCompare() {
  const v = await askVer();
  if (!newer(v) || upd.tried.includes(v.h) || (upd.ready && upd.ready.h === v.h)) return;
  upd.ready = v; showVer();
  toast('Hay una versión nueva de Tamachin: se pone sola la próxima vez que vuelvas al juego, o desde el diario.', 6);
}
function updCheck() { if (upd.reg && upd.mine) upd.reg.update().catch(() => {}); }   // sin red, o si falla: nada
// buen momento: nada a medias que se perdería (lo que no se guarda: una secuencia, el mareo, quien lo acompaña) ni un panel abierto
function updSafe() {
  const P = player;
  return P.state === 'normal' && P.onGround && P.T.mood !== 'mareado' && !ui.closeup && diaryEl.hidden
    && !creatures.some((c) => c.follow > 0) && !npcs.some((n) => n.follow);
}
function updApply(v) {
  try { sessionStorage.setItem('tamachin-from', upd.mine.h); sessionStorage.setItem('tamachin-tried', JSON.stringify(upd.tried.concat(v.h))); } catch (e) { /* igual se recarga */ }
  save(); $('#updating').hidden = false; setTimeout(() => location.reload(), 60);   // que alcance a pintarse "Actualizando…"
}
// volviste al juego (la app sale del fondo, la pestaña se ve otra vez): si hay una lista, se pone; si no, se revisa
async function updReturn() {
  if (!upd.mine) return;
  if (upd.ready && updSafe()) { const v = await askVer(); if (newer(v) && !upd.tried.includes(v.h) && updSafe()) { updApply(v); return; } }
  updCheck(); updCompare();
}
const verEl = $('#dVer'), newEl = $('#dNew');
function showVer() {
  const m = upd.mine;
  verEl.textContent = m ? 'Versión ' + m.h.slice(0, 6) + ' · ' + new Date(m.t).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Versión local (sin publicar)';
  newEl.hidden = !upd.ready; if (!diaryEl.hidden) updMore(diaryEl);
}
showVer();
$('#dUpdate').addEventListener('click', () => { if (upd.ready) updApply(upd.ready); });   // a mano: sin esperar el buen momento
window.addEventListener('pageshow', (e) => { if (e.persisted) updReturn(); });
window.addEventListener('focus', () => { if (Date.now() - upd.focusT > 60000) { upd.focusT = Date.now(); updCheck(); } });   // una pestaña que nunca se oculta
setInterval(() => { if (!document.hidden) updCheck(); }, 30 * 60000);

window.addEventListener('pagehide', () => save());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save(); else updReturn();
  const c = snd.ctx; if (c && snd.on) (document.hidden ? c.suspend() : c.resume()).catch(() => {});   // la música se detiene con la pestaña oculta y sigue donde iba
});
// Sin internet y como app instalada (manifest.webmanifest): sw.js guarda una copia del juego. Al terminar de cargar, la página le
// dice qué usó de afuera (Three.js, las fuentes): en la primera visita todo eso cargó antes de que él existiera.
function offline() {
  try {
    const sw = navigator.serviceWorker; if (!sw || !window.isSecureContext) return;
    sw.addEventListener('controllerchange', () => updCompare());   // llegó uno nuevo: ¿trae otra versión?
    const go = () => sw.register('sw.js').then(() => sw.ready).then((reg) => {
      if (reg && reg.active) reg.active.postMessage({ type: 'loaded', urls: performance.getEntriesByType('resource').map((r) => r.name) });
      upd.reg = reg; updCompare();
    }).catch(() => {});
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  } catch (e) { /* sin copia: el juego funciona igual con red */ }
}
offline();
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => ({ shape: player.T.shape, color: player.T.color, mood: player.baseMood, x: player.pos.x, z: player.pos.z }));
window.__tamachin = { player, cars, npcs, ui, view: camView, day, setHour, advance, togglePanel, makeDizzy, go: (x, z) => { player.pos.set(x, 0, z); camInit = false; },
  world: () => world.name, setWorld: (name, x, z) => setWorld(name, x == null ? null : { x, z }) };
if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
