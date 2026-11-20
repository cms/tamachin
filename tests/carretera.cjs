// La carretera a Valle Alegre (03-world.js, 05-norte.js): sale de la ciudad por donde estaba el túnel del noroeste, cruza el prado, el
// bosque y el río (con su puente) y llega a la boca del túnel de las montañas; del otro lado, de la otra boca a la entrada del pueblo.
// Revisa que no haya nada estorbando en el asfalto, que se pueda caminar entera, el puente, las explanadas de las bocas, que los autos
// de la calle del oeste salgan a la carretera y vuelvan, y que frenen ante Tamachin también allá.
const { openGame, PHONE } = require('./lib.cjs');

const EXPOSE = 'ROAD, ROAD_N, ROAD_HALF, ROAD_FACE, roadAt, roadDist, circles, boxes, northCollide, trees, SKIND, groundY, terrainY, EARTH, cars, joy, RB, MOUTHS, player, traffic';

module.exports = {
  titulo: 'la carretera a Valle Alegre: despejada, se camina entera, el puente, las bocas, y los autos salen y vuelven',
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
      return { bad: bad.slice(0, 8), n: bad.length, plants: plants.slice(0, 8), np: plants.length };
    });
    T.check('nada choca sobre el asfalto, de la ciudad a la boca y de la otra boca al pueblo', clear.n === 0, clear.n ? JSON.stringify(clear.bad) : undefined);
    T.check('ni árboles, rocas ni arbustos encima de la carretera', clear.np === 0, clear.np ? JSON.stringify(clear.plants) : undefined);

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
        if (c.z < -66 && c.z > D.ROAD_FACE) off = Math.max(off, Math.abs(D.roadDist(c.x, c.z, 10) - 2));   // en su carril: a 2 m del centro
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

    // capturas
    for (const [name, x, z, yaw] of [['salida', -24, -52, 0], ['puente', -21, -196, 0], ['boca-sur', -24, -268, 0], ['boca-norte', 26, -1278, 200]]) {
      await E(([x, z, yaw]) => { const T = window.__tamachin; T.go(x, z); T.view.yaw = T.view.yawT = yaw * Math.PI / 180; T.advance(0.6); }, [x, z, yaw]);
      await page.waitForTimeout(200); await page.screenshot({ path: T.out(name + '.jpg'), type: 'jpeg', quality: 70 });
    }
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
  },
};
