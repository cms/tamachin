// La carretera a Valle Alegre (03-world.js, 05-norte.js): sale de la ciudad por donde estaba el túnel del noroeste, cruza el prado, el
// bosque y el río (con su puente) y llega a la boca del túnel de las montañas; del otro lado, de la otra boca a la entrada del pueblo.
// Revisa que no haya nada estorbando en el asfalto, que se pueda caminar entera, el puente, las explanadas de las bocas, que los autos
// de la calle del oeste salgan a la carretera y vuelvan, y que frenen ante Tamachin también allá.
const { openGame, PHONE } = require('./lib.cjs');

const EXPOSE = 'ROAD, ROAD_N, ROAD_HALF, ROAD_FACE, roadAt, roadDist, circles, boxes, northCollide, trees, SKIND, groundY, terrainY, EARTH, cars, joy, RB, MOUTHS, player, traffic, ' +
  'WORLDS, TUBE, TUBE_PATH, tubeNear, tubeRoof, scene, camera, keys, berryBushes, creatures, get W() { return world; }';
const STATE = () => {
  const T = window.__tamachin, D = window.__dbg, P = T.player; let lights = 0; D.scene.traverseVisible((o) => { if (o.isLight) lights++; });
  return { world: T.world(), x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2), st: P.state, zone: document.querySelector('#zone').textContent, music: D.W.music(), lights, earth: D.EARTH.root.visible };
};
// dentro del túnel, sigue la línea central con la palanca (cámara en 0°) hacia una punta (`dir` 1: la de Valle Alegre, −1: la de la
// ciudad) y empuja contra ella hasta cambiar de mundo; devuelve cuánto se alejó del centro
const FOLLOW = (dir) => {
  const T = window.__tamachin, D = window.__dbg, P = T.player, o = {}, q = {}; T.view.yaw = T.view.yawT = 0;
  let it = 0, worst = 0;
  for (; it < 1500 && T.world() === 'tunel'; it++) {
    if (P.state === 'busy') { T.advance(0.2); continue; }
    const k = D.tubeNear(P.pos.x, P.pos.z, q); worst = Math.max(worst, Math.abs(k.u));
    D.roadAt(D.TUBE_PATH, k.d + 4 * dir, o); const dx = o.x - P.pos.x, dz = o.z - P.pos.z, l = Math.hypot(dx, dz) || 1;
    D.joy.x = dx / l; D.joy.y = dz / l; T.advance(0.2);
  }
  D.joy.x = D.joy.y = 0; T.advance(1.5);
  return { it, worst: +worst.toFixed(2) };
};

module.exports = {
  titulo: 'la carretera a Valle Alegre: despejada, se camina entera, el puente, las bocas, los autos salen y vuelven, y el túnel de punta a punta',
  async run(T) {
    const { page, errors, E } = await openGame(T, { device: PHONE, expose: EXPOSE, hora: 11 });

    // nada que choque sobre el asfalto: una rejilla de puntos de orilla a orilla, cada metro, en las dos carreteras (sin las bocas)
    const clear = await E(() => {
      const D = window.__dbg, bad = [], o = {}, inBox = (b, x, z) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
      for (const [R, d0, d1] of [[D.ROAD, 0, D.ROAD.len - 11], [D.ROAD_N, 11, D.ROAD_N.len]]) for (let d = d0; d <= d1; d += 1) {
        D.roadAt(R, d, o);
        for (let u = -D.ROAD_HALF + 0.1; u <= D.ROAD_HALF - 0.1; u += 0.7) {
          const x = o.x + o.nx * u, z = o.z + o.nz * u, p = { x, z };
          const hit = D.circles.find((c) => Math.hypot(c.x - x, c.z - z) < c.r) || D.boxes.find((b) => inBox(b, x, z));
          D.northCollide(p, 0.01); if (hit || Math.hypot(p.x - x, p.z - z) > 0.001) { bad.push([+x.toFixed(1), +z.toFixed(1)]); break; }
        }
      }
      // lo que se ve: árboles de la Tierra y de los cerros, tan grandes como para estorbar
      const plants = [];
      for (const t of D.trees) if (t.s > 0.01 && D.roadDist(t.x, t.z, D.ROAD_HALF + 1) < Infinity) plants.push(['árbol', +t.x.toFixed(1), +t.z.toFixed(1)]);
      for (const k of ['pine', 'oak', 'rock', 'bush']) for (const it of D.SKIND[k].list) if (D.roadDist(it.x, it.z, D.ROAD_HALF + 1) < Infinity) plants.push([k, +it.x.toFixed(1), +it.z.toFixed(1)]);
      // lo que se quitó se quitó entero: ningún tronco invisible (árbol encogido que sigue chocando) ni arbusto de bayas en la carretera
      const ghosts = D.trees.filter((t) => t.s < 0.01 && D.circles.some((c) => Math.hypot(c.x - t.x, c.z - t.z) < 0.01)).map((t) => [+t.x.toFixed(1), +t.z.toFixed(1)]);
      const berries = D.berryBushes.filter((b) => D.roadDist(b.x, b.z, D.ROAD_HALF + 2) < Infinity).map((b) => [+b.x.toFixed(1), +b.z.toFixed(1)]);
      return { bad: bad.slice(0, 8), n: bad.length, plants: plants.slice(0, 8), np: plants.length, ghosts, berries };
    });
    T.check('nada choca sobre el asfalto, de la ciudad a la boca y de la otra boca al pueblo', clear.n === 0, clear.n ? JSON.stringify(clear.bad) : undefined);
    T.check('ni árboles, rocas ni arbustos encima de la carretera', clear.np === 0, clear.np ? JSON.stringify(clear.plants) : undefined);
    T.check('lo que se quitó de la carretera se quitó entero: ningún tronco invisible ni arbusto de bayas', !clear.ghosts.length && !clear.berries.length, JSON.stringify({ ghosts: clear.ghosts, berries: clear.berries }));

    // se camina entera, siguiendo la carretera con la palanca, sin que nada lo desvíe
    const walk = await E(() => {
      const T = window.__tamachin, D = window.__dbg, P = T.player, o = {}, end = D.ROAD.len - 12;
      D.roadAt(D.ROAD, 2, o); T.go(o.x, o.z); T.view.yaw = T.view.yawT = 0; T.advance(0.3);
      let target = 5, worst = 0, it = 0, zones = new Set();
      for (; it < 900 && target < end; it++) {
        D.roadAt(D.ROAD, target, o); const dx = o.x - P.pos.x, dz = o.z - P.pos.z, l = Math.hypot(dx, dz);
        if (l < 2.5) { target = Math.min(end, target + 2); continue; }
        D.joy.x = dx / l; D.joy.y = dz / l; T.advance(0.2);
        worst = Math.max(worst, D.roadDist(P.pos.x, P.pos.z, 20)); zones.add(document.querySelector('#zone').textContent);
      }
      D.joy.x = D.joy.y = 0; T.advance(0.3);
      return { done: target >= end, it, worst: +worst.toFixed(2), x: +P.pos.x.toFixed(1), z: +P.pos.z.toFixed(1), zones: [...zones] };
    });
    T.check('se camina entera, de la salida de la ciudad hasta la boca del túnel, sin que nada lo desvíe', walk.done && walk.worst < 2.5 && walk.z < -270, JSON.stringify(walk));
    T.check('arriba dice «Carretera a Valle Alegre», y en el río «Puente de la carretera»', walk.zones.includes('Carretera a Valle Alegre') && walk.zones.includes('Puente de la carretera'), walk.zones.join(' | '));

    // el puente: la losa sube sobre el agua, no moja, y Tamachin camina por encima
    const bridge = await E(() => {
      const T = window.__tamachin, D = window.__dbg, P = T.player; T.go(D.RB.x + 1.5, D.RB.z + 1); T.advance(0.6);
      return { g: +D.groundY(D.RB.x, D.RB.z).toFixed(2), wet: D.EARTH.wet(D.groundY(D.RB.x, D.RB.z)), y: +P.pos.y.toFixed(2), water: P.inWater, beside: +D.groundY(D.RB.x + 8, D.RB.z).toFixed(2) };
    });
    T.check('el puente pasa 0.75 m sobre el río sin mojar, y Tamachin camina encima', bridge.g === 0.75 && !bridge.wet && Math.abs(bridge.y - 0.75) < 0.05 && !bridge.water && bridge.beside < -0.2, JSON.stringify(bridge));

    // las bocas, a nivel en su explanada, con la ladera subiendo detrás
    const flats = await E(() => { const D = window.__dbg; return D.MOUTHS.map((m) => ({ k: m.key, face: +D.terrainY(m.x, m.z - m.inw * 2).toFixed(2), back: +D.terrainY(m.x, m.dz + m.inw * 4).toFixed(1) })); });
    T.check('las dos bocas quedan a nivel en su explanada y la ladera sube detrás', flats.every((f) => f.face < 0.3 && f.back > 3), JSON.stringify(flats));

    // los autos de la calle del oeste salen a la carretera, se pierden en la boca y vuelven a salir por el túnel sur de su calle
    const trip = await E(() => {
      const T = window.__tamachin, D = window.__dbg; T.go(0, 3.5); T.advance(0.2);
      const c = D.cars.find((q) => q.L.ext && q.L.dir < 0); c.s = -64; c.v = c.vmax; c.pause = 0;
      let minZ = 0, off = 0, maxY = 0, wrapped = null;
      for (let t = 0; t < 70 && wrapped == null; t += 0.25) {
        const s0 = c.s; T.advance(0.25);
        if (c.s > s0 + 50) { wrapped = +c.z.toFixed(1); break; }
        minZ = Math.min(minZ, c.z); maxY = Math.max(maxY, c.y);
        if (c.z < -66 && c.z > D.ROAD_FACE) { let q = 1e9; for (let i = 0; i < D.ROAD.n; i++) q = Math.min(q, Math.hypot(D.ROAD.x[i] - c.x, D.ROAD.z[i] - c.z)); off = Math.max(off, Math.abs(q - 2)); }   // en su carril: a 2 m del centro de la carretera (no de la terminal)
      }
      const taxi = D.cars.find((q) => q.L.ext && q.L.dir > 0); taxi.s = taxi.L.lo + 2; taxi.v = taxi.vmax; taxi.pause = 0; T.advance(0.1);
      const t0 = { z: +taxi.z.toFixed(1), fz: taxi.fz }; T.advance(6);
      return { minZ: +minZ.toFixed(1), off: +off.toFixed(2), maxY: +maxY.toFixed(2), wrapped, taxi0: t0, taxi: +taxi.z.toFixed(1) };
    });
    T.check('un auto que va al norte por la calle del oeste sale a la carretera, por su carril, sube al puente y se pierde en la boca', trip.minZ < -280 && trip.off < 0.15 && trip.maxY > 0.7 && trip.maxY < 0.8, JSON.stringify(trip));
    T.check('y vuelve a salir por el túnel sur de su calle; el taxi que va al sur sale de la boca hacia la ciudad', trip.wrapped > 60 && trip.taxi0.z < -285 && trip.taxi0.fz > 0.9 && trip.taxi > trip.taxi0.z + 20, JSON.stringify(trip));

    // en la carretera también lo esperan: un auto a toda velocidad frena antes de tocarlo
    const brake = await E(() => {
      const T = window.__tamachin, D = window.__dbg, P = T.player, o = {};
      D.roadAt(D.ROAD, 110, o); const px = o.x + o.nx * 2, pz = o.z + o.nz * 2; T.go(px, pz); T.advance(0.2);
      const c = D.cars.find((q) => q.L.ext && q.L.dir < 0); for (const q of D.cars) if (q !== c && q.L.ext) q.s = 60;   // los demás de esa calle, lejos
      c.s = -62 - 85; c.v = c.vmax; c.pause = 0; c.scared = false;
      let gap = 99; for (let t = 0; t < 4; t += 0.05) { T.advance(0.05); gap = Math.min(gap, Math.hypot(c.x - P.pos.x, c.z - P.pos.z) - c.half); }
      return { gap: +gap.toFixed(2), v: +c.v.toFixed(2), moved: +Math.hypot(P.pos.x - px, P.pos.z - pz).toFixed(2), state: P.state };
    });
    T.check('en la carretera, un auto a toda velocidad frena antes de tocar a Tamachin', brake.gap > 0.5 && brake.v < 0.3 && brake.moved < 0.3, JSON.stringify(brake));

    // el túnel (mundos/tunel.js): empujando contra la boca sur se entra; adentro, su luz y su música
    const st = () => E(STATE), keyWalk = (k, secs) => E(([k, secs]) => { const D = window.__dbg; D.keys[k] = true; window.__tamachin.advance(secs); D.keys[k] = false; }, [k, secs]);
    await E(() => { const T = window.__tamachin, D = window.__dbg; T.go(-24, D.ROAD_FACE + 4); T.view.yaw = T.view.yawT = 0; T.advance(0.3); });
    await keyWalk('KeyW', 1.4); await E(() => window.__tamachin.advance(1.5));
    const inT = await st();
    T.check('empujando contra la boca sur entra al túnel: «Túnel de las Montañas», su música, las mismas tres luces, y la Tierra escondida', inT.world === 'tunel' && inT.st === 'normal' && inT.zone === 'Túnel de las Montañas' && inT.music === 'tunel' && inT.lights === 3 && !inT.earth, JSON.stringify(inT));
    await page.screenshot({ path: T.out('tunel.jpg'), type: 'jpeg', quality: 70 });

    // la cámara no sale del tubo: entre las paredes y debajo de la bóveda, a cualquier altura y desde cualquier lado
    const cam = await E(() => {
      const T = window.__tamachin, D = window.__dbg, o = {}, q = {}, bad = []; let n = 0;
      for (const d of [40, 120, 200, 290]) for (const pitch of [15, 34, 60]) for (const yaw of [0, 90, 180, 270]) {
        D.roadAt(D.TUBE_PATH, d, o); T.go(o.x + o.nx * 2, o.z + o.nz * 2); T.view.yaw = T.view.yawT = yaw * Math.PI / 180; T.view.pitch = T.view.pitchT = pitch * Math.PI / 180; T.advance(0.8); n++;
        const c = D.camera.position, k = D.tubeNear(c.x, c.z, q), P = T.player.pos;
        let out = Math.abs(k.u) > D.TUBE.W - 0.4 || c.y > D.tubeRoof(k.u) - 0.35 || c.y < 0.5;
        for (let i = 1; i < 10 && !out; i++) { const x = P.x + (c.x - P.x) * i / 10, z = P.z + (c.z - P.z) * i / 10, y = 0.8 + (c.y - 0.8) * i / 10, m = D.tubeNear(x, z, q); if (Math.abs(m.u) > D.TUBE.W || y > D.tubeRoof(m.u)) out = true; }   // de la cámara a Tamachin, por dentro
        if (out) bad.push(d + 'm ' + pitch + '° ' + yaw + '°: u ' + k.u.toFixed(2) + ' y ' + c.y.toFixed(2));
      }
      T.view.pitch = T.view.pitchT = 34 * Math.PI / 180; return { n, bad };
    });
    T.check('la cámara se queda dentro del tubo y ve a Tamachin por dentro (4 lugares × 3 alturas × 4 lados)', !cam.bad.length, cam.bad.slice(0, 5).join(' | ') || cam.n + ' tomas');

    // de punta a punta: sale por la boca norte, junto a Valle Alegre
    const thru = await E(FOLLOW, 1);
    const north = await st();
    T.check('cruza el túnel caminando y sale por la boca norte, junto a Valle Alegre', north.world === 'tierra' && north.st === 'normal' && Math.abs(north.x - 24) < 1.5 && north.z < -1263 && north.z > -1272 && north.zone === 'Carretera a Valle Alegre', JSON.stringify({ ...north, ...thru }));
    T.check('dentro del túnel nada lo saca de su lugar: va siempre entre las paredes', thru.worst < 5.2, JSON.stringify(thru));
    await page.screenshot({ path: T.out('boca-norte-salida.jpg'), type: 'jpeg', quality: 70 });

    // y de regreso: empujando contra la boca norte, el túnel, y sale por la boca sur hacia la ciudad
    await keyWalk('KeyS', 2); await E(() => window.__tamachin.advance(1.5));
    const back = await st();
    T.check('empujando contra la boca norte vuelve a entrar, por la otra punta', back.world === 'tunel' && back.st === 'normal' && back.z < -380, JSON.stringify(back));
    const thru2 = await E(FOLLOW, -1);
    const south = await st();
    T.check('cruza de regreso y sale por la boca sur, hacia la ciudad', south.world === 'tierra' && Math.abs(south.x + 24) < 1.5 && south.z > -279 && south.z < -270, JSON.stringify({ ...south, ...thru2 }));

    // un conejo que lo sigue cruza con él; al llegar lejos de su casa (junto a Valle Alegre) se queda a vivir ahí
    const bun = await E(() => {
      const T = window.__tamachin, D = window.__dbg, P = T.player, r = D.creatures.find((c) => c.kind === 'conejo' && !c.buddy);
      T.go(-24, D.ROAD_FACE + 4); T.view.yaw = T.view.yawT = 0; T.advance(0.3);
      r.pos.set(-23, 0, D.ROAD_FACE + 6); r.tx = r.pos.x; r.tz = r.pos.z; r.follow = 30; r.home0 = { ...r.home }; window.__bun = r;
      D.keys.KeyW = true; T.advance(1.4); D.keys.KeyW = false; T.advance(1.5);
      return { world: T.world(), rabbit: r.world || 'tierra' };
    });
    const thru3 = await E(FOLLOW, 1);
    const bun2 = await E(() => { const T = window.__tamachin, P = T.player, r = window.__bun; T.advance(40); return { world: T.world(), rabbit: r.world || 'tierra', d: +Math.hypot(r.pos.x - P.pos.x, r.pos.z - P.pos.z).toFixed(1), follow: r.follow, home: [+r.home.x.toFixed(0), +r.home.z.toFixed(0)], offRoad: window.__dbg.roadDist(r.home.x, r.home.z, 6.2) === Infinity, z: +r.pos.z.toFixed(0) }; });
    T.check('un conejo que lo sigue entra al túnel con él y sale con él junto a Valle Alegre', bun.world === 'tunel' && bun.rabbit === 'tunel' && bun2.world === 'tierra' && bun2.rabbit === 'tierra' && bun2.z < -1240, JSON.stringify({ bun, bun2, it: thru3.it }));
    T.check('ya sin seguirlo, se queda a vivir allá (no se regresa por la montaña), fuera de la carretera', bun2.follow === 0 && bun2.home[1] < -1240 && bun2.offRoad, JSON.stringify(bun2));

    // al recargar dentro del túnel, sigue en el túnel
    await E(() => { const T = window.__tamachin, D = window.__dbg, o = {}; D.roadAt(D.TUBE_PATH, 150, o); T.setWorld('tunel', o.x, o.z); T.advance(0.3); });
    await E(() => window.dispatchEvent(new Event('pagehide')));
    await page.reload(); await page.waitForFunction(() => !!window.__tamachin, null, { timeout: 30000 }); await E(() => { document.querySelector('#help').hidden = true; window.__tamachin.advance(0.5); });
    const re = await st();
    T.check('al recargar dentro del túnel, sigue ahí', re.world === 'tunel' && !re.earth && re.zone === 'Túnel de las Montañas', JSON.stringify(re));
    await E(() => { window.__tamachin.setWorld('tierra', 0, 3.5); window.__tamachin.advance(0.3); });

    // capturas
    for (const [name, x, z, yaw] of [['salida', -24, -52, 0], ['puente', -21, -196, 0], ['boca-sur', -24, -268, 0], ['boca-norte', 26, -1276, 200]]) {
      await E(([x, z, yaw]) => { const T = window.__tamachin; T.go(x, z); T.view.yaw = T.view.yawT = yaw * Math.PI / 180; T.advance(0.6); }, [x, z, yaw]);
      await page.waitForTimeout(200); await page.screenshot({ path: T.out(name + '.jpg'), type: 'jpeg', quality: 70 });
    }
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
  },
};
