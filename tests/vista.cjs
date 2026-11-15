// Que nada tape a Tamachin: junto a cada cara de los edificios, dentro y alrededor de la casa y en el bosque, con la cámara en
// varios ángulos y alturas; pegado a una pared caminando; detrás del kiosco; que lo que estorba se corte al ras y no se vuelva transparente;
// y en la toma del refri con la cámara girada.
const { openGame, BLOCKER, sleep } = require('./lib.cjs');

// [giro, altura de la cámara] en grados: los seis giros a la altura de siempre (34°), y algunos con la cámara baja y alta
const VIEWS = [0, 45, 90, 135, 180, 270].map((d) => [d, 34.2]).concat([[0, 15], [135, 15], [270, 15], [45, 60]]);

module.exports = {
  titulo: 'edificios, casa y árboles se apartan desde cualquier ángulo',
  async run(T) {
    const { ctx, page, errors, E } = await openGame(T, { expose: 'scene, camera, player, occluders, house' });
    await E(BLOCKER);
    const setView = (deg, p) => E(([y, p]) => { const V = window.__tamachin.view; V.yaw = V.yawT = y; V.pitch = V.pitchT = p; }, [deg * Math.PI / 180, p * Math.PI / 180]);
    const setYaw = (deg) => setView(deg, 34.2);
    const spots = await E(() => {
      const out = [], city = window.__dbg.occluders.filter((o) => o.z1 < 62 && o.z0 > -62).slice(0, 14);
      for (const o of city) { const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2; out.push([cx, o.z0 - 1.2], [cx, o.z1 + 1.2], [o.x0 - 1.2, cz], [o.x1 + 1.2, cz]); }
      out.push([-4, -11], [4, -11], [-4, -6], [4, -6], [0, -8.5], [0, -14.5], [-7.5, -8.5], [7.5, -8.5], [0, -2.5]);   // la casa
      out.push([3, -175], [-6, -190], [12, -232], [-20, -250], [30, -170], [-35, -186]);                            // el bosque
      return out;
    });
    for (const [deg, p] of VIEWS) {
      await setView(deg, p); const hits = [], name = deg + '°' + (p !== 34.2 ? ' (cámara a ' + p + '°)' : '');
      for (const [x, z] of spots) {
        await E(([x, z]) => window.__tamachin.go(x, z), [x, z]); await sleep(550);
        const b = await E(() => window.__blocker()); if (b) hits.push('(' + x.toFixed(1) + ',' + z.toFixed(1) + ') ' + b);
      }
      const hard = hits.filter((h) => /edificio|casa/.test(h));
      T.check(name + ': ningún edificio ni la casa tapa a Tamachin (' + spots.length + ' lugares)', !hard.length, hard.join('; ') || undefined);
      T.check(name + ': postes, muebles o árboles pegados lo tapan a lo más en 4 lugares', hits.length <= 4, hits.join('; ') || undefined);
    }

    // caminando hacia la cámara pegado a la pared de un edificio (los toldos tapaban)
    await setYaw(0); await E(() => window.__tamachin.go(-31, -58)); await sleep(700);
    await page.keyboard.down('KeyS'); const seen = []; const t0 = Date.now();
    while (Date.now() - t0 < 10000) { await sleep(150); const b = await E(() => window.__blocker()); if (b) seen.push(b); }
    await page.keyboard.up('KeyS');
    T.check('pegado a una pared, caminando 10 s: nunca tapado', !seen.length, seen.slice(0, 4).join('; ') || undefined);

    // el kiosco de Valle Alegre
    await E(() => window.__tamachin.go(0, -1360)); await sleep(1500);
    T.check('detrás del kiosco, su techo se quita', await E(() => window.__dbg.occluders.find((o) => Math.abs(o.z0 - (-1358.2)) < 0.1).k < 0.05));

    // lo que estorba se corta al ras (sin transparencias: eran ventanas fantasma) y vuelve entero al alejarse
    const cutState = (i) => E((i) => { const o = window.__dbg.occluders.filter((q) => q.z1 < 62 && q.z0 > -62)[i];
      return { k: o.k, y: o.plane ? o.plane.constant : null, clip: o.mats.every((m) => !!m.clippingPlanes), seeThrough: o.mats.some((m) => m.transparent), inner: o.walls.side === THREE.DoubleSide }; }, i);
    await setYaw(0); await E(() => { const o = window.__dbg.occluders.filter((q) => q.z1 < 62 && q.z0 > -62)[1]; window.__tamachin.go((o.x0 + o.x1) / 2, o.z0 - 1.2); }); await sleep(1500);
    let c = await cutState(1);
    T.check('un edificio entre la cámara y Tamachin se corta a 0.75 m, sin transparencia', c.k < 0.01 && c.clip && Math.abs(c.y - 0.75) < 0.05 && !c.seeThrough && c.inner, JSON.stringify(c));
    await E(() => window.__tamachin.go(0, 3.5)); await sleep(1500); c = await cutState(1);
    T.check('al alejarse vuelve entero (sin plano de corte)', c.k === 1 && !c.clip && !c.inner, JSON.stringify(c));
    await E(() => window.__tamachin.go(0, -14.5)); await sleep(1500);
    const h = await E(() => { const H = window.__dbg.house; return { walls: H.oWalls, clip: H.cutMats.every((m) => !!m.clippingPlanes), seeThrough: [H.mWalls, H.mShelf, H.mFront, H.mRoof].some((m) => m.transparent) }; });
    T.check('detrás de la casa: se corta (techo fuera, paredes al ras) sin transparencia', h.walls < 0.01 && h.clip && !h.seeThrough, JSON.stringify(h));

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
