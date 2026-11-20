// El auto de Tamachin (04-life.js: myCar; 06-main.js: updateDrive, getInCar, getOutCar, carToWorld). Revisa subirse y bajarse, que
// maneje con las teclas, que no atraviese la casa, los edificios ni el agua, que los autos lo esperen sin tocarlo, que frene solo ante un
// vecino, que en el túnel de la luna no quepa y en el de la montaña sí (de punta a punta), el conejo copiloto, guardar manejando y
// «Volver al inicio».
const { openGame, PHONE } = require('./lib.cjs');

const EXPOSE = 'myCar, keys, joy, doAction, CAR_HOME, HOUSE, cars, npcs, creatures, MOUTHS, TUBE, TUBE_PATH, tubeNear, roadAt, occluders, groundY, traffic, SFX, EARTH, WORLDS, get W() { return world; }';
// pone el auto en (x, z) mirando a `h` y a Tamachin manejándolo, parado
const DRIVE_AT = ([x, z, h]) => {
  const T = window.__tamachin, D = window.__dbg, C = D.myCar, P = T.player;
  if (P.state === 'drive') { C.v = 0; } else { T.go(C.door.x, C.door.z); T.advance(0.2); D.doAction(); T.advance(0.1); }
  C.x = x; C.z = z; C.h = h; C.v = 0; C.place(); T.view.yaw = T.view.yawT = h + Math.PI; T.advance(0.3); return P.state;
};
// maneja con las teclas `ks` durante `secs` segundos de juego
const KEYS = ([ks, secs]) => { const D = window.__dbg; for (const k of ks) D.keys[k] = true; window.__tamachin.advance(secs); for (const k of ks) D.keys[k] = false; };
const CAR = () => { const C = window.__dbg.myCar, P = window.__tamachin.player; return { x: +C.x.toFixed(2), z: +C.z.toFixed(2), h: +C.h.toFixed(2), v: +C.v.toFixed(2), state: P.state, world: window.__tamachin.world(), carWorld: C.world || 'tierra' }; };
const BUBBLES = () => [...document.querySelectorAll('.bubble.on')].map((e) => e.textContent).join(' | ');

module.exports = {
  titulo: 'el auto de Tamachin: subirse, manejar, que nada lo atraviese, que todos lo esperen, el túnel, el conejo copiloto y que se guarde',
  async run(T) {
    const { page, errors, E } = await openGame(T, { device: PHONE, expose: EXPOSE, hora: 11 });
    const keys = (ks, secs) => E(KEYS, [ks, secs]), car = () => E(CAR), driveAt = (x, z, h) => E(DRIVE_AT, [x, z, h]);

    // estacionado en el jardín; junto a su puerta, «Manejar»; arriba, los botones cambian
    const park = await E(() => { const T = window.__tamachin, D = window.__dbg, C = D.myCar; T.go(C.door.x, C.door.z); T.advance(0.4);
      return { at: [C.x, C.z, C.h], home: D.CAR_HOME, label: document.querySelector('#tAct').textContent }; });
    T.check('el auto está en su cochera del jardín, y junto a su puerta dice «Manejar»', park.at[0] === park.home.x && park.at[1] === park.home.z && park.label === 'Manejar', JSON.stringify(park));
    const inn = await E(() => { const T = window.__tamachin, D = window.__dbg, C = D.myCar, P = T.player; D.doAction(); T.advance(0.3);
      const vis = (s) => { const e = document.querySelector(s); return e.offsetParent !== null ? e.textContent : null; };
      return { state: P.state, visible: P.T.group.visible, seat: +Math.hypot(P.pos.x - C.x, P.pos.z - C.z).toFixed(2), act: vis('#tAct'), jump: vis('#tJump') }; });
    T.check('se sube: va sentado y se ve; los botones dicen «Bajar del auto» y «Bocina» (en un teléfono de 390 px)', inn.state === 'drive' && inn.visible && inn.seat < 1 && inn.act === 'Bajar del auto' && inn.jump === 'Bocina', JSON.stringify(inn));

    // maneja: adelante avanza, y con un lado da vuelta
    await keys(['KeyW'], 2); const a = await car(); await keys(['KeyW', 'KeyA'], 1.5); const b = await car(); await keys([], 3);
    T.check('con las teclas: adelante avanza y a un lado da vuelta', a.z - park.at[1] > 6 && Math.abs(b.h - a.h) > 0.8, JSON.stringify({ a, b }));
    await page.screenshot({ path: T.out('manejando.jpg'), type: 'jpeg', quality: 70 });

    // no atraviesa la casa (por su puerta no cabe), un edificio ni el agua
    await driveAt(0, 3, Math.PI); await keys(['KeyW'], 4); const house = await car();
    T.check('contra la puerta de la casa: no entra', house.z > -2.2 && house.state === 'drive', JSON.stringify(house));
    const bld = await E(() => { const D = window.__dbg; return D.occluders.filter((o) => o.z1 < 62 && o.z0 > -62 && o.x1 < -26).map((o) => [o.x0, o.x1, o.z0, o.z1]); });
    await driveAt(-24, 8, -Math.PI / 2); await keys(['KeyW'], 5); const wall = await car();
    const inside = bld.filter(([x0, x1, z0, z1]) => [-1, 0, 1].some((k) => { const x = wall.x + Math.sin(wall.h) * k, z = wall.z + Math.cos(wall.h) * k; return x > x0 && x < x1 && z > z0 && z < z1; }));
    T.check('contra un edificio: se detiene afuera', !inside.length && wall.x < -26, JSON.stringify({ wall, inside }));
    await driveAt(10, -186, Math.PI); await keys(['KeyW'], 6); const river = await car();
    const wet = await E(() => { const D = window.__dbg, C = D.myCar; return [-1, 0, 1].some((k) => D.groundY(C.x + C.fx * k * 1.9, C.z + C.fz * k * 1.9) < -0.2); });
    T.check('contra el río: se queda en la orilla', !wet && river.z > -200, JSON.stringify({ river, wet }));

    // los autos lo esperan sin tocarlo ni asustarlo (pitan solo después de 6 s de estorbarles)
    const wait = await E(() => {
      const T = window.__tamachin, D = window.__dbg, C = D.myCar; D.honks = 0; const h0 = D.SFX.honk; D.SFX.honk = () => { D.honks++; h0(); };
      C.x = -22; C.z = 0; C.h = Math.PI; C.v = 0; C.place(); T.advance(0.2);
      const c = D.cars.find((q) => q.L.axis === 'z' && q.L.fixed === -22 && !q.hidden); for (const q of D.cars) if (q !== c && q.L.fixed === -22) q.s = -60;
      c.s = 22; c.v = c.vmax; c.pause = 0; const st0 = D.traffic.startles;
      let gap = 99, honk4 = 0; for (let t = 0; t < 11; t += 0.1) { T.advance(0.1); gap = Math.min(gap, Math.abs(c.z - C.z) - c.half - C.half); if (t < 6) honk4 = D.honks; }
      D.SFX.honk = h0; return { gap: +gap.toFixed(2), v: +c.v.toFixed(2), startles: D.traffic.startles - st0, honk4, honk8: D.honks };
    });
    T.check('estacionado en un carril: el auto de atrás se detiene sin tocarlo y sin asustarlo', wait.gap > 0.3 && wait.v < 0.3 && wait.startles === 0 && wait.honk4 === 0, JSON.stringify(wait));
    T.check('y si sigue estorbando (6 s ya parado), le pita', wait.honk8 > 0, JSON.stringify(wait));

    // frena solo antes de un vecino que se le atraviesa
    const npc = await E(() => {
      const T = window.__tamachin, D = window.__dbg, C = D.myCar, n = D.npcs.find((q) => !q.home && q.loop);
      C.x = 0; C.z = 22; C.h = Math.PI / 2; C.v = 0; C.place(); T.advance(0.1);
      n.pos.set(C.x + 9, 0, C.z); n.pause = 99; n.loop0 = n.loop; n.loop = null; n.home = { x: n.pos.x, z: n.pos.z, ry: 0 };
      D.keys.KeyW = true; let d = 99; for (let t = 0; t < 4; t += 0.05) { T.advance(0.05); d = Math.min(d, Math.hypot(n.pos.x - C.x, n.pos.z - C.z) - C.half - 0.5 * n.T.scale); } D.keys.KeyW = false;
      n.loop = n.loop0; n.home = null; n.pause = 0; return { d: +d.toFixed(2), v: +C.v.toFixed(2) };
    });
    T.check('manejando hacia un vecino, frena solo antes de tocarlo', npc.d > 0.2, JSON.stringify(npc));

    // el túnel de la luna: no cabe
    await driveAt(24, -48, Math.PI); await keys(['KeyW'], 3); const moon = await car(); const mb = await E(BUBBLES);
    T.check('en el túnel de la luna no cabe: se queda en la Tierra y lo dice', moon.world === 'tierra' && moon.state === 'drive' && /no cabe/.test(mb), JSON.stringify({ moon, mb }));

    // el de la montaña sí: entra manejando, lo cruza y sale por la boca norte, todavía manejando
    await driveAt(-22, -262, Math.PI); await keys(['KeyW'], 3); await E(() => window.__tamachin.advance(1.2)); const tin = await car();
    const inTube = await E(() => window.__dbg.myCar.mesh.parent === window.__dbg.WORLDS.tunel.root);
    T.check('entra manejando al túnel de la montaña: el auto va con él', tin.world === 'tunel' && tin.carWorld === 'tunel' && tin.state === 'drive' && inTube, JSON.stringify(tin));
    const thru = await E(() => {
      const T = window.__tamachin, D = window.__dbg, C = D.myCar, q = {}, o = {}; let it = 0, worst = 0;
      for (; it < 800 && T.world() === 'tunel'; it++) {
        const k = D.tubeNear(C.x, C.z, q); worst = Math.max(worst, Math.abs(k.u)); D.roadAt(D.TUBE_PATH, k.d + 9, o);
        const dx = o.x + o.nx * 2 - C.x, dz = o.z + o.nz * 2 - C.z, l = Math.hypot(dx, dz) || 1, c = T.view.c, s = T.view.s;   // a la palanca, en la pantalla
        D.joy.x = (dx * c - dz * s) / l; D.joy.y = (dx * s + dz * c) / l; T.advance(0.2);
      }
      D.joy.x = D.joy.y = 0; T.advance(1.5); return { it, worst: +worst.toFixed(2) };
    });
    const tout = await car();
    T.check('cruza el túnel manejando con la palanca y sale por la boca norte, junto a Valle Alegre', tout.world === 'tierra' && tout.carWorld === 'tierra' && tout.state === 'drive' && tout.z < -1262 && tout.z > -1290 && Math.abs(tout.x - 35) < 6, JSON.stringify({ tout, thru }));

    // guardar manejando: al recargar, sigue manejando donde iba
    await E(() => window.dispatchEvent(new Event('pagehide')));
    await page.reload(); await page.waitForFunction(() => !!window.__tamachin, null, { timeout: 30000 }); await E(() => { document.querySelector('#help').hidden = true; window.__tamachin.advance(0.5); });
    const re = await car();
    T.check('al recargar, sigue manejando donde iba', re.state === 'drive' && Math.abs(re.x - tout.x) < 1.5 && Math.abs(re.z - tout.z) < 1.5, JSON.stringify({ re, tout }));

    // el conejo copiloto: se sube atrás y se baja con él
    const bun = await E(() => {
      const T = window.__tamachin, D = window.__dbg, C = D.myCar, P = T.player; D.doAction(); T.advance(0.3);   // se baja
      const out = { state: P.state, side: +Math.hypot(P.pos.x - C.x, P.pos.z - C.z).toFixed(2) };
      const r = D.creatures.find((c) => c.kind === 'conejo' && !c.buddy && !c.world); r.pos.set(P.pos.x + 1, 0, P.pos.z + 1); r.tx = r.pos.x; r.tz = r.pos.z; r.follow = 60;
      T.go(C.door.x, C.door.z); T.advance(0.3); D.doAction(); T.advance(0.2); D.keys.KeyW = true; T.advance(2); D.keys.KeyW = false; T.advance(2);
      const ride = { riding: r.riding, visible: r.mesh.visible, d: +Math.hypot(r.pos.x - C.x, r.pos.z - C.z).toFixed(2) };
      D.doAction(); T.advance(0.3); return { out, ride, after: { riding: r.riding, d: +Math.hypot(r.pos.x - P.pos.x, r.pos.z - P.pos.z).toFixed(2) } };
    });
    T.check('se baja a un lado del auto', bun.out.state === 'normal' && bun.out.side > 1.5 && bun.out.side < 4, JSON.stringify(bun.out));
    T.check('un conejo que lo sigue se sube atrás, y se baja con él', bun.ride.riding && bun.ride.visible && bun.ride.d < 2 && !bun.after.riding && bun.after.d < 3, JSON.stringify(bun));

    // «Volver al inicio» manejando: a pie frente a su casa, y el auto en su cochera
    const home = await E(() => {
      const T = window.__tamachin, D = window.__dbg, C = D.myCar, P = T.player; T.go(C.door.x, C.door.z); T.advance(0.3); D.doAction(); T.advance(0.2);
      const b = document.querySelector('#dHome'); b.click(); b.click(); T.advance(0.5);
      return { state: P.state, x: P.pos.x, z: P.pos.z, car: [C.x, C.z], home: [D.CAR_HOME.x, D.CAR_HOME.z], carWorld: C.world };
    });
    T.check('«Volver al inicio» manejando: a pie frente a su casa, y el auto en su cochera', home.state === 'normal' && home.x === 0 && home.z === 3.5 && home.car[0] === home.home[0] && home.car[1] === home.home[1] && !home.carWorld, JSON.stringify(home));
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
  },
};
