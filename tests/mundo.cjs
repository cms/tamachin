// El mundo se genera con semillas fijas: esta prueba compara lo que se construye al arrancar con tests/mundo.json.
// Si cambia sin querer (una llamada de más a rnd() corre todo lo que se genera después), falla y dice qué cambió.
// Si el cambio es a propósito: npm test -- mundo --actualizar
const fs = require('fs');
const path = require('path');
const { openGame } = require('./lib.cjs');

const FILE = path.join(__dirname, 'mundo.json');

module.exports = {
  titulo: 'el mundo generado es el mismo que en tests/mundo.json',
  async run(T) {
    const { ctx, errors, E } = await openGame(T, { expose: 'occluders, trees, circles, boxes, npcs, flowers, tufts, bushes, rocks, berryBushes, genChunk, PEAKS, TRAIL' });
    const fp = await E(() => {
      const F = window.__dbg, r = (v) => Math.round(v * 1000) / 1000;
      const chunk = (i, j) => { const c = F.genChunk(i, j); return { plants: c.plants.map((p) => [p.kind, r(p.x), r(p.z)]), kinds: Object.keys(c.it).sort().map((k) => k + ':' + c.it[k].length) }; };
      return {
        occluders: F.occluders.map((o) => [o.x0, o.x1, o.z0, o.z1, o.h].map(r)),
        trees: F.trees.map((t) => [t.type, t.x, t.z, t.s, t.ry].map(r)),
        circles: F.circles.map((c) => [c.x, c.z, c.r].map(r)), boxes: F.boxes.map((b) => [b.x0, b.x1, b.z0, b.z1].map(r)),
        npcs: F.npcs.map((n) => [n.name, r(n.T.scale), r(n.speed)]),           // la posición no: caminan desde que arranca
        flowers: F.flowers.map((f) => [f.x, f.z].map(r)), tufts: F.tufts.length, bushes: F.bushes.map((b) => [b.x, b.z, b.s].map(r)), rocks: F.rocks.map((b) => [b.x, b.z].map(r)),
        berries: F.berryBushes.map((b) => [b.kind.name, r(b.x), r(b.z)]),
        peaks: F.PEAKS.map((p) => [p.name, p.x, p.z]), trail: F.TRAIL.length,
        chunks: [chunk(0, 15), chunk(-4, 30), chunk(7, 3)],
      };
    });
    T.check('arranca sin errores', !errors.length, errors.join(' | ') || undefined);
    if (T.flags.has('--actualizar') || !fs.existsSync(FILE)) {
      fs.writeFileSync(FILE, JSON.stringify(fp, null, 0).replace(/\],\[/g, '],\n['));
      T.info('mundo.json ' + (T.flags.has('--actualizar') ? 'actualizado' : 'creado') + ' con el mundo actual');
    } else {
      const ref = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const k of Object.keys(ref)) {
        const a = JSON.stringify(ref[k]), b = JSON.stringify(fp[k]);
        let detail;
        if (a !== b && Array.isArray(ref[k]) && Array.isArray(fp[k])) {
          const i = ref[k].findIndex((v, n) => JSON.stringify(v) !== JSON.stringify(fp[k][n]));
          detail = ref[k].length + ' → ' + fp[k].length + ', primera diferencia en ' + i + ': ' + JSON.stringify(ref[k][i]) + ' → ' + JSON.stringify(fp[k][i]);
        }
        T.check(k + ' igual', a === b, a === b ? undefined : detail || a.slice(0, 80) + ' → ' + b.slice(0, 80));
      }
    }
    await ctx.close();
  },
};
