// Tráfico amable: los autos nunca atropellan a Tamachin (frenan en seco); si uno tiene que frenar por él, pita y él se asusta, y la
// primera vez un aviso dice cómo cruzar. Cada paso de cebra tiene su semáforo de peatones (el monito sale del reloj de los autos), en una
// sola punta y uno por esquina; cruzar con el monito verde da diversión. Todo con advance(): no depende del tiempo real.
const { openGame, sleep } = require('./lib.cjs');

const EXPOSE = 'ZEBRAS, PED_SIGNS, pedState, lightState, cars, updateCars, carRect, traffic, keys, player, needs, needGate, circles, boxes, RW, screech, pedHeads, carLights, day';

module.exports = {
  titulo: 'tráfico: semáforos de peatones, los autos frenan y pitan sin atropellar, cruzar con el monito verde',
  async run(T) {
    const { ctx, page, errors, E } = await openGame(T, { expose: EXPOSE });

    // el monito sale del reloj de los autos: nunca verde si sus autos no tienen rojo
    const tim = await E(() => {
      const D = window.__dbg, bad = [], dur = { walk: [], flash: [] }, both = [];
      for (const Z of D.ZEBRAS) {
        const n = { walk: 0, flash: 0 };
        for (let i = 0; i < 1700; i++) { const t = 1000 + i * 0.01, s = D.pedState(Z, t); if (s !== 'stop') { n[s]++; if (D.lightState(Z.I, Z.ax, t) !== 'r') bad.push(Z.I.k + Z.ax + '@' + t.toFixed(2)); } }
        dur.walk.push(n.walk / 100); dur.flash.push(n.flash / 100);
      }
      for (const I of new Set(D.ZEBRAS.map((Z) => Z.I))) for (let i = 0; i < 1700; i++) {
        const t = 1000 + i * 0.01, on = D.ZEBRAS.filter((Z) => Z.I === I && D.pedState(Z, t) !== 'stop').map((Z) => Z.ax);
        if (on.includes('NS') && on.includes('EW')) both.push(I.k + '@' + t.toFixed(2));
      }
      return { n: D.ZEBRAS.length, bad: bad.slice(0, 3), walk: [Math.min(...dur.walk), Math.max(...dur.walk)], flash: [Math.min(...dur.flash), Math.max(...dur.flash)], both: both.slice(0, 3) };
    });
    T.check('16 pasos de cebra; el monito verde solo cuando sus autos tienen rojo', tim.n === 16 && !tim.bad.length, JSON.stringify(tim.bad));
    T.check('cada vuelta del semáforo: 4 s de monito verde y 1.5 s parpadeando', tim.walk[0] > 3.97 && tim.walk[1] < 4.03 && tim.flash[0] > 1.47 && tim.flash[1] < 1.53, JSON.stringify(tim));
    T.check('en un cruce nunca hay verde para cruzar las dos calles a la vez', !tim.both.length, JSON.stringify(tim.both));

    // con el monito verde no hay autos sobre las rayas (10 minutos de tráfico, sin Tamachin en la ciudad; siempre igual: mismo reloj y paso)
    const clear = await E(() => {
      const D = window.__dbg; window.__tamachin.go(0, -300);
      const saved = D.cars.map((c) => ({ c, s: c.s, v: c.v, pause: c.pause })); let worst = 0, hits = [];
      for (let i = 0, t = 1000; i < 660 * 30; i++) {
        t += 1 / 30; D.updateCars(1 / 30, t); if (i < 60 * 30) continue;   // un minuto para que los autos sigan a este reloj y no al del juego
        for (const Z of D.ZEBRAS) {
          if (D.pedState(Z, t) === 'stop') continue;
          const [x0, x1, z0, z1] = Z.along === 'z' ? [Z.w0, Z.w1, Z.c - D.RW, Z.c + D.RW] : [Z.c - D.RW, Z.c + D.RW, Z.w0, Z.w1];
          for (const c of D.cars) { const b = D.carRect(c, 0); if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) hits.push(Z.I.k + Z.ax + '@' + t.toFixed(1)); }
        }
      }
      for (const o of saved) Object.assign(o.c, { s: o.s, v: o.v, pause: o.pause });
      return { hits: hits.slice(0, 4), n: hits.length };
    });
    T.check('con el monito verde no hay autos sobre las rayas (10 minutos de tráfico)', !clear.n, JSON.stringify(clear));

    // los postes: uno por paso, en la banqueta junto a su paso, sin encimarse con nada, y uno en cada esquina (como un rehilete)
    const posts = await E(() => {
      const D = window.__dbg, bad = [];
      for (const p of D.PED_SIGNS) {
        const Z = p.Z, u = Math.abs(Z.along === 'z' ? p.z - Z.c : p.x - Z.c), w = Z.along === 'z' ? p.x : p.z, off = w < Z.w0 ? Z.w0 - w : w - Z.w1;
        const me = D.circles.find((c) => Math.abs(c.x - p.x) < 1e-6 && Math.abs(c.z - p.z) < 1e-6);
        const near = D.circles.filter((c) => c !== me && Math.hypot(c.x - p.x, c.z - p.z) < c.r + 0.14 + 0.3).length + D.boxes.filter((b) => p.x > b.x0 - 0.4 && p.x < b.x1 + 0.4 && p.z > b.z0 - 0.4 && p.z < b.z1 + 0.4).length;
        if (!(u > D.RW + 0.28 && u < D.RW + 1.2 && off > 0 && off < 0.6 && me && !near)) bad.push([p.x, p.z, +u.toFixed(2), +off.toFixed(2), !!me, near]);
      }
      const corners = [...new Set(D.ZEBRAS.map((Z) => Z.I))].map((I) => { const ps = D.PED_SIGNS.filter((p) => p.Z.I === I); return ps.length + ':' + new Set(ps.map((p) => Math.sign(p.x - I.x) + ',' + Math.sign(p.z - I.z))).size; });
      return { n: D.PED_SIGNS.length, bad, corners, one: D.ZEBRAS.every((Z) => Z.signs.length === 1) };
    });
    T.check('16 postes, uno por paso, cada uno en la banqueta junto a su paso, sólidos y sin encimarse', posts.n === 16 && posts.one && !posts.bad.length, JSON.stringify(posts.bad));
    T.check('en cada cruce, un poste en cada esquina (sin dos juntos)', posts.corners.every((c) => c === '4:4'), posts.corners.join(' '));

    // las luces dicen lo mismo que el semáforo
    await E(() => { window.__tamachin.go(18.3, 30.5); window.__tamachin.advance(0.2); });
    const lit = await E(() => {
      const D = window.__dbg, wA = D.pedHeads.fade.walk, sA = D.pedHeads.fade.stop, bad = [];
      for (const p of D.PED_SIGNS) for (const j of [2 * p.i, 2 * p.i + 1]) {
        const s = p.Z.state;
        if ((wA.getX(j) > 0) !== (s !== 'stop') || (sA.getX(j) > 0) !== (s === 'stop')) bad.push(j + ':' + s);
      }
      return { bad, states: D.ZEBRAS.map((Z) => Z.state[0]).join('') };
    });
    T.check('cada poste muestra el monito de su paso, en sus dos caras', !lit.bad.length && /s/.test(lit.states), JSON.stringify(lit));
    // la caja tiene lado: sus dos caras miran a lo largo de su paso, una hacia cada punta (no hacia la cámara)
    const faces = await E(() => {
      const D = window.__dbg, m = new THREE.Matrix4(), bad = [];
      for (const p of D.PED_SIGNS) {
        const n = [0, 1].map((k) => { D.pedHeads.walk.getMatrixAt(2 * p.i + k, m); const e = m.elements; return [e[8], e[10]]; });   // hacia dónde mira cada cara (su z)
        const ax = p.Z.along === 'z' ? 1 : 0, ok = n.every((v) => Math.abs(v[ax]) > 0.99) && n[0][ax] * n[1][ax] < 0;
        if (!ok) bad.push(p.i + ' ' + p.Z.along + ' ' + JSON.stringify(n.map((v) => v.map((x) => +x.toFixed(2)))));
      }
      return bad;
    });
    T.check('cada caja mira a lo largo de su paso, con una cara hacia cada punta: de lado se ve la caja', !faces.length, faces.join(' | ') || undefined);

    // un disco entre la cámara y Tamachin lo taparía: se desvanece; los demás no (con cuadros de verdad: la cámara se mueve en frame)
    await E(() => window.__tamachin.go(19.4, 28.2)); await sleep(1200);
    const fade = await E(() => {
      const D = window.__dbg, a = (p) => D.pedHeads.fade.walk.getX(2 * p.i) + D.pedHeads.fade.stop.getX(2 * p.i), at = (x, z) => D.PED_SIGNS.find((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.z - z) < 0.01);
      return { front: +a(at(19.4, 31.3)).toFixed(2), far: +a(at(16.7, 19.4)).toFixed(2) };
    });
    T.check('el semáforo que queda entre la cámara y Tamachin se desvanece; los demás no', fade.front < 0.3 && fade.far === 1, JSON.stringify(fade));

    // nunca lo atropella: se le pone enfrente a un auto (y al autobús) a toda velocidad, de 0.3 a 6 m del defensa
    const hurt = await E(() => {
      const D = window.__dbg, P = D.player, all = D.cars.slice(), out = [];
      for (const kind of ['auto', 'autobús']) for (const d of [0.3, 1, 2, 4, 6]) {
        const c = all.find((c) => c.L.axis === 'z' && c.L.dir === 1 && (kind === 'autobús' ? c.half > 3 : c.half < 3)) || all.find((c) => kind === 'autobús' ? c.half > 3 : c.half < 3);
        const L = c.L, ax = L.axis === 'x', s0 = -10 * L.dir;   // a media cuadra, lejos de los semáforos
        D.cars.length = 0; D.cars.push(c); c.s = s0; c.v = c.vmax; c.pause = 0; c.scared = false; c.honkT = 0;
        const front = s0 + L.dir * (c.half + d), x = ax ? front : L.fixed, z = ax ? L.fixed : front;
        window.__tamachin.go(x, z); P.vx = P.vz = 0; D.traffic.at = -99; const n0 = D.traffic.startles, v0 = c.v;
        window.__tamachin.advance(0.4); const mood = P.tempMood;
        window.__tamachin.advance(2.1);
        const fwd = ((ax ? P.pos.x - c.s : P.pos.z - c.s) * L.dir) - c.half;
        out.push({ kind, d, v0: +v0.toFixed(1), state: P.state, moved: +Math.hypot(P.pos.x - x, P.pos.z - z).toFixed(2), v: +c.v.toFixed(2), gap: +fwd.toFixed(2), startles: D.traffic.startles - n0, mood });
      }
      D.cars.length = 0; for (const c of all) D.cars.push(c);
      return out;
    });
    const hurtOk = hurt.every((h) => h.state === 'normal' && h.moved < 0.6 && h.v < 0.05 && h.gap > 0.2);
    T.check('nunca lo atropella: auto y autobús a toda velocidad, de 0.3 a 6 m, frenan sin aventarlo', hurtOk, JSON.stringify(hurt.filter((h) => !(h.state === 'normal' && h.moved < 0.6 && h.v < 0.05 && h.gap > 0.2))));
    T.check('y el auto pita y Tamachin se asusta una vez (asombrado)', hurt.every((h) => h.startles === 1 && h.mood === 'asombrado'), JSON.stringify(hurt.map((h) => h.kind[0] + h.d + ':' + h.startles + (h.mood || '-'))));
    const hint = await E(() => ({ hinted: window.__dbg.traffic.hinted, toast: document.querySelector('#toast').textContent }));
    T.check('la primera vez, un aviso dice cómo cruzar', hint.hinted && /paso de cebra/.test(hint.toast) && /monito/.test(hint.toast), hint.toast);

    // con el monito verde el auto solo espera: ni pita ni lo asusta. Con rojo, en el mismo lugar, sí.
    const yieldTo = (want) => E((want) => {
      const D = window.__dbg, P = D.player, all = D.cars.slice();
      const Z = D.ZEBRAS.find((z) => z.I.x === 24 && z.I.z === 24 && z.along === 'z' && z.w0 < 24);   // el paso oeste del cruce (24, 24)
      window.__tamachin.go(0, 3.5); let k = 0; while (Z.state !== want && k++ < 100) window.__tamachin.advance(0.2);
      const c = all.find((c) => c.L.axis === 'x' && c.L.dir === -1 && c.L.fixed === 22);   // sale del cruce hacia el oeste, por ese paso
      D.cars.length = 0; D.cars.push(c); c.s = 24; c.v = 8; c.pause = 0; c.scared = false; c.honkT = 0;
      window.__tamachin.go(18.3, 22); P.vx = P.vz = 0; D.traffic.at = -99; const n0 = D.traffic.startles, st = Z.state;
      window.__tamachin.advance(1.5);
      const out = { st, state: P.state, v: +c.v.toFixed(2), startles: D.traffic.startles - n0, honked: c.honkT > 0, gap: +((c.s - P.pos.x) - c.half).toFixed(2) };
      D.cars.length = 0; for (const o of all) D.cars.push(o);
      return out;
    }, want);
    const polite = await yieldTo('walk'), rude = await yieldTo('stop');
    T.check('cruzando con el monito verde, el auto se detiene sin pitar ni asustarlo', polite.st === 'walk' && polite.state === 'normal' && polite.v < 0.05 && !polite.startles && !polite.honked && polite.gap > 0.2, JSON.stringify(polite));
    T.check('en el mismo paso con el monito rojo, el auto pita y lo asusta', rude.st === 'stop' && rude.startles === 1 && rude.honked && rude.v < 0.05, JSON.stringify(rude));

    // cruzar con el monito verde da diversión; con rojo, no
    const cross = (want, key, z0) => E(([want, key, z0]) => {
      const D = window.__dbg, P = D.player, all = D.cars.slice();
      const Z = D.ZEBRAS.find((z) => z.I.x === 24 && z.I.z === 24 && z.along === 'z' && z.w0 < 24);
      window.__tamachin.go(0, 3.5); let k = 0; while (Z.state === want && k++ < 100) window.__tamachin.advance(0.2); k = 0; while (Z.state !== want && k++ < 100) window.__tamachin.advance(0.1);
      D.cars.length = 0;                                             // la calle sola: aquí solo cuenta el monito
      window.__tamachin.go(18.3, z0); P.vx = P.vz = 0; D.needs.diversion = 0.5; delete D.needGate.cruce; const n0 = D.traffic.crossed;
      D.keys[key] = true; window.__tamachin.advance(2.6); D.keys[key] = false;
      const out = { st: want, at: [+P.pos.x.toFixed(1), +P.pos.z.toFixed(1)], crossed: D.traffic.crossed - n0, fun: +D.needs.diversion.toFixed(3) };
      for (const o of all) D.cars.push(o);
      return out;
    }, [want, key, z0]);
    const good = await cross('walk', 'KeyW', 28.9), bad = await cross('stop', 'KeyS', 19.1);
    T.check('cruzar por el paso de cebra con el monito verde da diversión', good.crossed === 1 && good.fun > 0.55 && good.at[1] < 19.7, JSON.stringify(good));
    T.check('cruzar con el monito rojo no da nada', bad.crossed === 0 && bad.fun < 0.51 && bad.at[1] > 28.3, JSON.stringify(bad));

    // lejos de la ciudad no se dibujan
    const away = await E(() => { window.__tamachin.go(0, -300); window.__tamachin.advance(0.1); const D = window.__dbg; return [D.pedHeads.walk.visible, D.pedHeads.stop.visible, D.pedHeads.box.visible]; });
    T.check('fuera de la ciudad, los semáforos de peatones no se dibujan', away.every((v) => !v), JSON.stringify(away));

    // los autos de noche: faros y calaveras prendidos, y la mancha de luz enfrente de cada uno; de día, apagados
    const lamps = await E(() => {
      const T = window.__tamachin, D = window.__dbg, m = new THREE.Matrix4(), v = new THREE.Vector3(), L = D.carLights;
      T.go(30, 10); T.setHour(12); T.advance(0.5); const noon = [L.auto.material.visible, L.beam.material.visible];
      T.setHour(22); T.advance(1.5); const night = [L.auto.material.visible, L.bus.material.visible, L.beam.material.visible, +L.auto.material.opacity.toFixed(2)];
      let worst = 0; D.cars.forEach((c, i) => {   // cada mancha, 3.2 m enfrente de su auto; cada par de luces, en su auto
        L.beam.getMatrixAt(i, m); v.setFromMatrixPosition(m); const ry = c.mesh.rotation.y;
        worst = Math.max(worst, Math.hypot(v.x - (c.x + Math.sin(ry) * (c.half + 3.2)), v.z - (c.z + Math.cos(ry) * (c.half + 3.2))));
        c.lm.getMatrixAt(c.li, m); v.setFromMatrixPosition(m); worst = Math.max(worst, Math.hypot(v.x - c.x, v.z - c.z));
      });
      T.setHour(12); return { noon, night, worst: +worst.toFixed(3) };
    });
    T.check('de noche los autos llevan faros y calaveras prendidos, y alumbran el piso enfrente; de día, no', lamps.noon.every((x) => !x) && lamps.night.slice(0, 3).every(Boolean) && lamps.night[3] > 0.9 && lamps.worst < 0.05, JSON.stringify(lamps));

    // las llantas que rechinan: entre los efectos (picos de 0.02 a 0.08), unas 0.4 s
    const sq = await E(async () => {
      const D = window.__dbg, sr = 44100, out = [];
      for (let r = 0; r < 4; r++) {
        const oc = new OfflineAudioContext(1, sr, sr); D.screech(oc, oc.destination, 0.05);
        const b = (await oc.startRendering()).getChannelData(0); let pk = 0, end = 0; for (let i = 0; i < b.length; i++) pk = Math.max(pk, Math.abs(b[i]));
        for (let i = 0; i < b.length; i++) if (Math.abs(b[i]) > pk * 0.05) end = i;
        out.push({ peak: +pk.toFixed(3), len: +(end / sr - 0.05).toFixed(2) });
      }
      return out;
    });
    T.check('el rechinido de las llantas: picos de 0.02 a 0.07, unas 0.4 s', sq.every((s) => s.peak > 0.02 && s.peak < 0.07 && s.len > 0.3 && s.len < 0.5), JSON.stringify(sq));

    await E(() => { window.__tamachin.go(18.3, 30.5); window.__tamachin.advance(0.3); });
    await page.screenshot({ path: T.out('esquina.jpg'), type: 'jpeg', quality: 75 });
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
    await ctx.close();
  },
};
