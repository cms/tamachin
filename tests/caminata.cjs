// La caminata larga (unos 4 minutos): desde la fogata por el sendero, sobre el Pico Gelatina, por Valle Alegre y 500 m dentro
// del bosque sin fin, corriendo con la palanca. Pisa siempre el suelo, la cámara nunca entra al cerro, y en el bosque come las
// siete frutas. `npm test -- caminata --girada` hace lo mismo con la cámara a 135°.
const { openGame, sleep } = require('./lib.cjs');

const EXPOSE = 'scene, camera, renderer, player, joy, needs, quests, summits, fruitsTasted, TRAIL, groundY, forest, genChunk, forestPlantNear, eatPlant, forestTrailX';

module.exports = {
  titulo: 'caminata de la fogata al bosque sin fin (larga)',
  largo: true,
  async run(T) {
    const { ctx, page, errors, E } = await openGame(T, { expose: EXPOSE, settle: 2500 });
    const yaw = T.flags.has('--girada') ? 135 : 0;
    await E((y) => {
      const D = window.__dbg, V = window.__tamachin.view; V.yaw = V.yawT = y;
      window.__frames = 0; (function tick() { window.__frames++; requestAnimationFrame(tick); })();
      window.__sample = () => { const P = D.player.pos, c = D.camera.position, info = D.renderer.info;
        return { y: P.y, g: D.groundY(P.x, P.z), cam: c.y - D.groundY(c.x, c.z), z: P.z, calls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries }; };
      // corre con la palanca por los puntos; la palanca va en el marco de la cámara
      window.__walk = (pts) => new Promise((res) => { let i = 0, since = performance.now(); const stuck = [];
        const id = setInterval(() => { const p = D.player.pos, w = pts[i], dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
          if (d < 1.6 || performance.now() - since > 15000) { if (d >= 1.6) stuck.push([i, +p.x.toFixed(1), +p.z.toFixed(1)]); i++; since = performance.now(); if (i >= pts.length) { D.joy.x = D.joy.y = 0; clearInterval(id); res(stuck); return; } }
          else { const wx = dx / d, wz = dz / d; D.joy.x = wx * V.c - wz * V.s; D.joy.y = wx * V.s + wz * V.c; }
          D.needs.panza = D.needs.energia = D.needs.diversion = 0.95; }, 25); });
    }, yaw * Math.PI / 180);
    const Tr = await E(() => window.__dbg.TRAIL), pts = [];
    for (let i = 0; i < Tr.length - 1; i++) { const a = Tr[i], b = Tr[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6)); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    pts.push([0, -1293], [3, -1300], [3, -1340], [7.2, -1346], [7.2, -1358], [3, -1364], [1, -1380], [0, -1412], [0, -1420]);
    const fx = (z) => 16 * Math.sin((-1440 - z) / 48) + 8 * Math.sin((-1440 - z) / 19 + 1);
    for (let z = -1428; z >= -1940; z -= 6) pts.push([fx(z), z]);
    await E(([x, z]) => window.__tamachin.go(x, z), Tr[0]); await sleep(800);

    const samples = []; let done = false; const t0 = Date.now();
    const walk = E((p) => window.__walk(p), pts).then((s) => { done = true; return s; });
    while (!done) {
      const f0 = await E(() => window.__frames); await sleep(1000); const f1 = await E(() => window.__frames);
      const s = await E(() => window.__sample()); s.fps = f1 - f0; samples.push(s);
      if (samples.length % 30 === 0) await page.screenshot({ path: T.out(String(samples.length).padStart(3, '0') + '.jpg'), type: 'jpeg', quality: 60 });
    }
    const stuck = await walk;
    T.check('recorre todo el camino sin atorarse', !stuck.length, JSON.stringify(stuck));
    const off = samples.filter((s) => s.y - s.g > 0.6), low = samples.filter((s) => s.cam < 1.3);
    T.check('nunca flota más de 0.6 m sobre el suelo', !off.length, off.length + ' de ' + samples.length);
    T.check('la cámara siempre queda 1.3 m o más sobre el suelo', !low.length, low.length + ' de ' + samples.length);
    T.check('llega a la cima del Pico Gelatina', (await E(() => window.__dbg.summits)).includes('Pico Gelatina'));
    const by = (f) => { const a = samples.filter(f); return a.length ? 'fps ' + Math.min(...a.map((s) => s.fps)) + '-' + Math.max(...a.map((s) => s.fps)) + ', llamadas ' + Math.max(...a.map((s) => s.calls)) + ', triángulos ' + Math.max(...a.map((s) => s.tris)) : '-'; };
    T.info('montañas: ' + by((s) => s.z < -268 && s.z > -1288));
    T.info('pueblo: ' + by((s) => s.z < -1288 && s.z > -1440));
    T.info('bosque sin fin: ' + by((s) => s.z < -1440));

    // una casilla es igual al volver
    const chunk = () => E(() => { const c = window.__dbg.forest.live.get('0,15') || window.__dbg.genChunk(0, 15); return JSON.stringify(c.plants.map((p) => p.kind + p.x.toFixed(2) + p.z.toFixed(2))); });
    const before = await chunk(), fz = await E(() => window.__dbg.player.pos.z);
    await E(() => window.__walk([[window.__dbg.forestTrailX(-1440 - 26 * 25), -1440 - 26 * 25]]));
    await E((z) => window.__walk([[16 * Math.sin((-1440 - z) / 48) + 8 * Math.sin((-1440 - z) / 19 + 1), z]]), fz);
    T.check('al volver, la casilla 0,15 tiene lo mismo', before === await chunk());
    T.check('nunca hay más de 20 casillas cargadas', await E(() => window.__dbg.forest.live.size) <= 20);

    // las siete frutas
    const got = {};
    for (let round = 0; round < 3; round++) for (const kind of ['naranja', 'manzana', 'uva', 'arandano', 'sandia', 'fresa', 'granada']) {
      if (got[kind]) continue;
      const p = await E((k) => { for (const c of window.__dbg.forest.live.values()) for (const p of c.plants) if (p.kind === k && p.fruits.some((f) => f.k >= 1)) return [p.x, p.z]; return null; }, kind);
      if (p) {
        await E(([x, z]) => window.__tamachin.go(x, z + 1.6), p); await sleep(700);
        const ok = await E(() => { const D = window.__dbg, P = D.player.pos, pl = D.forestPlantNear(P.x, P.z); if (!pl) return false; D.needs.panza = 0.3; D.eatPlant(pl); return true; });
        await sleep(2600);
        if (ok && await E(() => window.__dbg.needs.panza) > 0.35) got[kind] = true;
      }
      if (!got[kind] && round < 2) { await E(() => { const P = window.__dbg.player.pos; window.__tamachin.go(P.x + 60, P.z - 60); }); await sleep(900); }
    }
    T.check('come las siete frutas', Object.keys(got).length === 7, Object.keys(got).join(', '));
    T.check('y cumple el encargo de las frutas', await E(() => window.__dbg.quests.frutas === 2));
    T.check('sin errores', !errors.length, errors.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
  },
};
