// El autobús a Valle Alegre (04-life.js: BUS_LINE, BUS_STOPS, bus; 06-main.js: subir, ir arriba, el túnel, bajarse). Revisa la vuelta
// completa (sus paradas, sus tiempos, que vaya por el asfalto y nunca entre a la ciudad), subirse en una parada y bajarse solo en la
// otra pasando por el túnel, con el conejo que lo sigue, que frene por Tamachin en la carretera, guardar arriba y «Volver al inicio».
const { openGame, PHONE } = require('./lib.cjs');

const EXPOSE = 'bus, BUS_STOPS, BUS_LINE, roadDist, BUS_HALF, ROAD_HALF, roadAt, ROAD, keys, doAction, creatures, WORLDS, EARTH, camera, tubeNear, TUBE, cars, scene, get W() { return world; }';
// espera al autobús en la parada `k` (0 la ciudad, 1 Valle Alegre) parado frente a ella, como mucho `max` s de juego
const WAIT = ([k, max]) => {
  const T = window.__tamachin, D = window.__dbg, st = D.BUS_STOPS[k]; T.go(st.at.x, st.at.z); T.advance(0.2);
  let t = 0; for (; t < max && D.bus.halt !== st; t += 0.5) T.advance(0.5);
  T.advance(0.3); return { t, halted: D.bus.halt === st, label: document.querySelector('#tAct').textContent };
};
// arriba del autobús hasta que se baja (o `max` s): los mundos por los que pasó y si la cámara se quedó dentro del túnel
const RIDE = (max) => {
  const T = window.__tamachin, D = window.__dbg, P = T.player, seen = []; let t = 0, camOut = 0, hidden = true, onAsphalt = true;
  for (; t < max && P.state === 'ride'; t += 0.25) {
    T.advance(0.25); const w = T.world(); if (seen[seen.length - 1] !== w) seen.push(w);
    hidden = hidden && (P.state !== 'ride' || !P.T.group.visible);
    if (w === 'tunel' && !D.bus.hidden) { const c = D.camera.position, q = D.tubeNear(c.x, c.z, {}); if (Math.abs(q.u) > D.TUBE.W) camOut++; }
  }
  T.advance(0.5);
  return { t, seen, camOut, hidden, state: P.state, world: T.world(), x: +P.pos.x.toFixed(1), z: +P.pos.z.toFixed(1), visible: P.T.group.visible, zone: document.querySelector('#zone').textContent };
};

module.exports = {
  titulo: 'el autobús a Valle Alegre: su vuelta, subirse, el túnel, bajarse solo en la otra parada, y que espere a Tamachin',
  async run(T) {
    const { page, errors, E } = await openGame(T, { device: PHONE, expose: EXPOSE, hora: 11 });

    // la vuelta: con Tamachin en su casa, de la parada de la ciudad a la misma parada
    const loop = await E(() => {
      const T = window.__tamachin, D = window.__dbg, b = D.bus, st = D.BUS_STOPS; T.go(0, 3.5); T.advance(0.2);
      b.s = st[0].s - 30; b.v = 0; b.pause = 0; b.done = null; b.halt = null;
      const halts = [], off = []; let t = 0, inCity = 0, wasHalt = null, hiddenT = 0, t0 = null;
      for (; t < 420; t += 0.5) {
        T.advance(0.5);
        if (b.halt && b.halt !== wasHalt) { halts.push([b.halt.key, t]); if (b.halt === st[0]) { if (t0 == null) t0 = t; else break; } }
        wasHalt = b.halt; if (b.hidden) hiddenT += 0.5;
        if (!b.hidden) { if (b.z > -62) inCity++; const d = D.roadDist(b.x, b.z, 9); if (d > 2.6) off.push([+b.x.toFixed(1), +b.z.toFixed(1), d === Infinity ? 'lejos' : +d.toFixed(1)]); }
      }
      return { halts, lap: t - t0, hiddenT, inCity, off: off.slice(0, 5), noff: off.length };
    });
    T.check('el autobús da su vuelta en unos 3 minutos y se para en las dos paradas', loop.halts.map((h) => h[0]).join() === 'ciudad,valle,ciudad' && loop.lap > 150 && loop.lap < 230, JSON.stringify(loop));
    T.check('va siempre por su carril (a menos de 2.6 m del centro de una carretera o terminal), nunca entra a la ciudad, y en el túnel no se ve', !loop.noff && !loop.inCity && loop.hiddenT > 60, JSON.stringify(loop));

    // sin el autobús en la parada: «Esperar el autobús», y dice en cuánto llega
    const away = await E(() => {
      const T = window.__tamachin, D = window.__dbg, st = D.BUS_STOPS[0]; D.bus.s = D.BUS_STOPS[1].s - 5; D.bus.pause = 0; D.bus.done = null; T.go(st.at.x, st.at.z); T.advance(0.4);
      const label = document.querySelector('#tAct').textContent; D.doAction(); T.advance(0.1);
      const b = [...document.querySelectorAll('.bubble')].map((e) => e.textContent).join(' | '); return { label, b };
    });
    T.check('si no ha llegado: «Esperar el autobús», y Tamachin dice en cuánto llega', away.label === 'Esperar el autobús' && /autobús llega en|Ya casi llega/.test(away.b), JSON.stringify(away));

    // subirse en la ciudad, con el conejo que lo sigue; ir por la carretera y el túnel; bajarse solo en Valle Alegre
    await E(() => { const D = window.__dbg; D.bus.s = D.BUS_STOPS[0].s - 25; D.bus.pause = 0; D.bus.done = null; D.bus.halt = null; });
    const w1 = await E(WAIT, [0, 40]);
    T.check('el autobús llega a la parada de la ciudad: «Subir al autobús»', w1.halted && w1.label === 'Subir al autobús', JSON.stringify(w1));
    const on = await E(() => {
      const T = window.__tamachin, D = window.__dbg, P = T.player, r = D.creatures.find((c) => c.kind === 'conejo' && !c.buddy && !c.world);
      r.pos.set(P.pos.x + 1.5, 0, P.pos.z + 1); r.tx = r.pos.x; r.tz = r.pos.z; r.follow = 60; window.__bun = r;
      D.doAction(); T.advance(0.3);
      return { state: P.state, visible: P.T.group.visible, rabbit: r.riding && !r.mesh.visible };
    });
    T.check('se sube: Tamachin y su conejo van arriba (no se ven)', on.state === 'ride' && !on.visible && on.rabbit, JSON.stringify(on));
    await E(() => window.__tamachin.advance(4));
    await page.screenshot({ path: T.out('arriba.jpg'), type: 'jpeg', quality: 70 });
    const r1 = await E(RIDE, 240);
    T.check('pasa por el túnel (la cámara dentro del tubo) y se baja solo en Valle Alegre', r1.seen.join() === 'tierra,tunel,tierra' && r1.camOut === 0 && r1.state === 'normal' && r1.visible && r1.z < -1260 && r1.z > -1290 && r1.x < 22 && r1.zone === 'Parada del autobús de Valle Alegre', JSON.stringify(r1));
    const bun = await E(() => { const r = window.__bun, P = window.__tamachin.player; return { riding: r.riding, visible: r.mesh.visible, d: +Math.hypot(r.pos.x - P.pos.x, r.pos.z - P.pos.z).toFixed(1), world: r.world || 'tierra' }; });
    T.check('el conejo se baja con él', !bun.riding && bun.visible && bun.d < 4 && bun.world === 'tierra', JSON.stringify(bun));

    // de regreso: de Valle Alegre a la ciudad
    const w2 = await E(WAIT, [1, 240]);
    await E(() => { window.__dbg.doAction(); window.__tamachin.advance(0.3); });
    const r2 = await E(RIDE, 240);
    T.check('de regreso: se sube en Valle Alegre y se baja en la ciudad, otra vez por el túnel', w2.halted && r2.seen.join() === 'tierra,tunel,tierra' && r2.state === 'normal' && r2.x < -45 && r2.z > -82 && r2.z < -68 && r2.zone === 'Terminal del autobús', JSON.stringify({ w2, r2 }));

    // en la carretera, el autobús frena por Tamachin sin tocarlo
    const brake = await E(() => {
      const T = window.__tamachin, D = window.__dbg, P = T.player, b = D.bus, o = {}; D.roadAt(D.ROAD, 120, o);
      const px = o.x + o.nx * 2, pz = o.z + o.nz * 2; T.go(px, pz); T.advance(0.2);
      for (const c of D.cars) if (c !== b && c.L.ext) c.s = 60;
      b.s = D.BUS_LINE.legs[1].s0 + (120 - 14) - 30; b.v = b.vmax; b.pause = 0;
      let gap = 99; for (let t = 0; t < 5; t += 0.05) { T.advance(0.05); gap = Math.min(gap, Math.hypot(b.x - P.pos.x, b.z - P.pos.z) - b.half); }
      return { gap: +gap.toFixed(2), v: +b.v.toFixed(2), moved: +Math.hypot(P.pos.x - px, P.pos.z - pz).toFixed(2) };
    });
    T.check('en la carretera el autobús frena antes de tocar a Tamachin', brake.gap > 0.5 && brake.v < 0.3 && brake.moved < 0.3, JSON.stringify(brake));

    // guardar arriba cuenta como si ya hubiera llegado
    await E(() => { const D = window.__dbg; D.bus.s = D.BUS_STOPS[0].s - 25; D.bus.pause = 0; D.bus.done = null; D.bus.halt = null; });
    await E(WAIT, [0, 40]);
    await E(() => { const T = window.__tamachin; window.__dbg.doAction(); T.advance(12); window.dispatchEvent(new Event('pagehide')); });
    await page.reload(); await page.waitForFunction(() => !!window.__tamachin, null, { timeout: 30000 }); await E(() => { document.querySelector('#help').hidden = true; window.__tamachin.advance(0.5); });
    const re = await E(() => { const T = window.__tamachin, P = T.player, st = window.__dbg.BUS_STOPS[1]; return { world: T.world(), state: P.state, d: +Math.hypot(P.pos.x - st.at.x, P.pos.z - st.at.z).toFixed(1), visible: P.T.group.visible }; });
    T.check('si se guarda arriba, al recargar ya llegó: en la parada de Valle Alegre', re.world === 'tierra' && re.state === 'normal' && re.d < 1.5 && re.visible, JSON.stringify(re));

    // «Volver al inicio» desde el autobús, aun a medio túnel: a pie, frente a su casa
    await E(() => { const D = window.__dbg; D.bus.s = D.BUS_STOPS[0].s - 25; D.bus.pause = 0; D.bus.done = null; D.bus.halt = null; });
    await E(WAIT, [0, 40]);
    const home = await E(() => {
      const T = window.__tamachin, D = window.__dbg, P = T.player; D.doAction(); T.advance(0.3);
      for (let t = 0; t < 90 && T.world() !== 'tunel'; t += 0.5) T.advance(0.5);
      T.advance(3); const inTube = T.world() === 'tunel';
      const b = document.querySelector('#dHome'); b.click(); b.click(); T.advance(0.5);
      return { inTube, world: T.world(), state: P.state, x: +P.pos.x.toFixed(1), z: +P.pos.z.toFixed(1), visible: P.T.group.visible, busOnEarth: D.bus.mesh.parent === D.EARTH.root, telon: document.querySelector('#telon').hidden };
    });
    T.check('«Volver al inicio» desde el autobús, a medio túnel: a pie frente a su casa, y el autobús sigue en la Tierra', home.inTube && home.world === 'tierra' && home.state === 'normal' && home.visible && home.x === 0 && home.z === 3.5 && home.busOnEarth && home.telon, JSON.stringify(home));

    // capturas: la parada, y adentro del túnel
    await E(() => { const T = window.__tamachin, D = window.__dbg, st = D.BUS_STOPS[0]; D.bus.s = st.s - 1; D.bus.pause = 0; D.bus.done = null; T.go(st.at.x + 1, st.at.z + 3); T.view.yaw = T.view.yawT = -1.2; T.advance(2); });
    await page.screenshot({ path: T.out('parada.jpg'), type: 'jpeg', quality: 70 });
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
  },
};
