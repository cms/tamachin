// Que nada tape a Tamachin: junto a cada cara de los edificios, dentro y alrededor de la casa y en el bosque, con la cámara en
// varios ángulos; pegado a una pared caminando; detrás del kiosco; y en la toma del refri con la cámara girada.
const { openGame, BLOCKER, sleep } = require('./lib.cjs');

const ANGLES = [0, 45, 90, 135, 180, 270];

module.exports = {
  titulo: 'edificios, casa y árboles se apartan desde cualquier ángulo',
  async run(T) {
    const { ctx, page, errors, E } = await openGame(T, { expose: 'scene, camera, player, occluders, house' });
    await E(BLOCKER);
    const setYaw = (deg) => E((y) => { const V = window.__tamachin.view; V.yaw = V.yawT = y; }, deg * Math.PI / 180);
    const spots = await E(() => {
      const out = [], city = window.__dbg.occluders.filter((o) => o.z1 < 62 && o.z0 > -62).slice(0, 14);
      for (const o of city) { const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2; out.push([cx, o.z0 - 1.2], [cx, o.z1 + 1.2], [o.x0 - 1.2, cz], [o.x1 + 1.2, cz]); }
      out.push([-4, -11], [4, -11], [-4, -6], [4, -6], [0, -8.5], [0, -14.5], [-7.5, -8.5], [7.5, -8.5], [0, -2.5]);   // la casa
      out.push([3, -175], [-6, -190], [12, -232], [-20, -250], [30, -170], [-35, -186]);                            // el bosque
      return out;
    });
    for (const deg of ANGLES) {
      await setYaw(deg); const hits = [];
      for (const [x, z] of spots) {
        await E(([x, z]) => window.__tamachin.go(x, z), [x, z]); await sleep(550);
        const b = await E(() => window.__blocker()); if (b) hits.push('(' + x.toFixed(1) + ',' + z.toFixed(1) + ') ' + b);
      }
      const hard = hits.filter((h) => /edificio|casa/.test(h));
      T.check(deg + '°: ningún edificio ni la casa tapa a Tamachin (' + spots.length + ' lugares)', !hard.length, hard.join('; ') || undefined);
      T.check(deg + '°: postes, muebles o árboles pegados lo tapan a lo más en 4 lugares', hits.length <= 4, hits.join('; ') || undefined);
    }

    // caminando hacia la cámara pegado a la pared de un edificio (los toldos tapaban)
    await setYaw(0); await E(() => window.__tamachin.go(-31, -58)); await sleep(700);
    await page.keyboard.down('KeyS'); const seen = []; const t0 = Date.now();
    while (Date.now() - t0 < 10000) { await sleep(150); const b = await E(() => window.__blocker()); if (b) seen.push(b); }
    await page.keyboard.up('KeyS');
    T.check('pegado a una pared, caminando 10 s: nunca tapado', !seen.length, seen.slice(0, 4).join('; ') || undefined);

    // el kiosco de Valle Alegre
    await E(() => window.__tamachin.go(0, -1360)); await sleep(1500);
    T.check('detrás del kiosco, su techo se transparenta', await E(() => window.__dbg.occluders.find((o) => Math.abs(o.z0 - (-1358.2)) < 0.1).op < 0.5));

    // el refri con la cámara girada: la toma es fija y las paredes no se transparentan
    for (const deg of [135, 180]) {
      await setYaw(deg); await E(() => window.__tamachin.go(3.95, -10.4)); await sleep(1200);
      await page.keyboard.press('KeyE'); await sleep(1500);
      const s = await E(() => [window.__dbg.player.state, window.__dbg.house.oWalls]);
      await page.screenshot({ path: T.out('refri-' + deg + '.jpg'), type: 'jpeg', quality: 70 });
      T.check('refri con la cámara a ' + deg + '°: toma fija y paredes enteras', s[0] === 'busy' && s[1] > 0.9, JSON.stringify(s));
      await sleep(2500);
    }
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
    await ctx.close();
  },
};
