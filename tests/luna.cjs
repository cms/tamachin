// La luna (mundos/luna.js): se llega caminando hacia dentro del túnel de los autos del noreste y se vuelve por el túnel del Cráter
// Grande. Revisa que entrar y volver funcionen con el tráfico andando (y que en la boca los autos no piten), que los otros siete
// túneles sigan cerrados, que allá se salte más (un tercio de la gravedad), que nada de la Tierra se cuele (la casa, el río, los
// charcos, la lluvia, los avisos, lo que se dibuja), que la Tierra espere quieta, la bandera, y que todo se guarde.
const { openGame, PHONE } = require('./lib.cjs');

const EXPOSE = 'keys, player, camera, scene, EARTH, WORLDS, KEEP, SFX, cars, npcs, creatures, quests, weather, lunaY, LUNA, EARTH_DOOR, LUNA_DOOR, rainDrops, jump, doAction, get W() { return world; }';
// camina con las teclas `ks` durante `secs` segundos de juego (sin cuadros de verdad en medio)
const WALK = ([ks, secs]) => { const K = window.__dbg.keys; for (const k of ks) K[k] = true; window.__tamachin.advance(secs); for (const k of ks) K[k] = false; };
const STATE = () => {
  const T = window.__tamachin, D = window.__dbg, P = T.player; let lights = 0; D.scene.traverseVisible((o) => { if (o.isLight) lights++; });
  return { world: T.world(), x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), st: P.state, zone: document.querySelector('#zone').textContent, music: D.W.music(), lights,
    earth: D.EARTH.root.visible, moon: !!(D.WORLDS.luna.root && D.WORLDS.luna.root.visible), honks: D.honks, quest: D.quests.luna, pitch: Math.round(T.view.pitchT * 180 / Math.PI) };
};

module.exports = {
  titulo: 'la luna: por el túnel de los autos, un tercio de la gravedad, nada de la Tierra se cuela, y se guarda',
  async run(T) {
    const { page, errors, E } = await openGame(T, { device: PHONE, expose: EXPOSE, hora: 11 });
    const walk = (ks, secs) => E(WALK, [ks, secs]), st = () => E(STATE);
    await E(() => { const D = window.__dbg; D.honks = 0; const h = D.SFX.honk; D.SFX.honk = () => { D.honks++; h(); }; });   // cuenta los pitidos
    await E(() => { const V = window.__tamachin.view; V.pitch = V.pitchT = 40 * Math.PI / 180; });   // en la Tierra, la cámara más alta que de costumbre
    // un auto del carril que entra al túnel (x = 26, hacia el norte), rápido, a 8 m detrás de Tamachin
    const behind = (z) => E((z) => { const D = window.__dbg, T = window.__tamachin; T.go(26, z); T.view.yaw = T.view.yawT = 0;
      const c = D.cars.find((q) => q.L.axis === 'z' && q.L.fixed === 26); c.s = z + 8; c.v = c.vmax; c.scared = false; c.honkT = 0; D.honks = 0; }, z);

    // en la calle, lejos del túnel, un auto que frena por él pita (la prueba de abajo sí podría fallar)
    await behind(-40); await walk([], 1.5);
    const street = await st();
    T.check('en la calle, un auto que tiene que frenar por Tamachin pita (control)', street.honks > 0 && street.world === 'tierra', JSON.stringify(street));

    // caminando hacia dentro de la boca del túnel del noreste, con un auto detrás: no pita, y llega a la luna
    await behind(-54); await walk(['KeyW'], 1.1);
    const mid = await st();
    await walk(['KeyW'], 1.4); await walk([], 1);
    const there = await st();
    T.check('en la boca del túnel los autos lo esperan sin pitar', mid.honks === 0 && there.honks === 0, JSON.stringify({ mid: mid.honks, there: there.honks }));
    T.check('caminando hacia dentro del túnel del noreste llega a la luna, saliendo por el túnel del cráter', there.world === 'luna' && there.st === 'normal' && Math.abs(there.x) < 3.5 && there.z > -49.5 && there.z < -46, JSON.stringify(there));
    T.check('allá: "Túnel a la Tierra" arriba, su música, y las mismas tres luces', there.zone === 'Túnel a la Tierra' && there.music === 'luna' && there.lights === 3, JSON.stringify(there));
    T.check('la cámara baja a 16° (así se ven las estrellas y la Tierra)', there.pitch === 16, there.pitch + '°');
    T.check('se dibuja la luna y nada de la Tierra; empieza el encargo de la bandera', !there.earth && there.moon && there.quest === 1, JSON.stringify(there));
    await page.screenshot({ path: T.out('llegada.jpg'), type: 'jpeg', quality: 70 });

    // un tercio de la gravedad: salta jump²/(2·grav) ≈ 4.1 m y dura 2·jump/grav ≈ 2.1 s en el aire (en la Tierra, 1.38 m)
    const JUMP = ([x, z]) => {
      const T = window.__tamachin, D = window.__dbg, P = T.player; T.go(x, z); T.advance(0.6);
      const g0 = P.pos.y, R = D.W.rules; D.jump(); let top = 0, t = 0;
      while (t < 6) { T.advance(1 / 60, 1 / 60); t += 1 / 60; top = Math.max(top, P.pos.y - g0); if (t > 0.2 && P.onGround) break; }
      return { top: +top.toFixed(3), t: +t.toFixed(3), wantTop: +(R.jump * R.jump / (2 * R.grav)).toFixed(3), wantT: +(2 * R.jump / R.grav).toFixed(3) };
    };
    const jl = await E(JUMP, [0, -44]);
    T.check('en la luna salta unos 4 m (jump²/2g) y tarda unos 2 s en caer (±10 %)', Math.abs(jl.top - jl.wantTop) < 0.1 * jl.wantTop && Math.abs(jl.t - jl.wantT) < 0.1 * jl.wantT && jl.top > 3.5, JSON.stringify(jl));

    // nada de la Tierra en ningún punto de la luna, aunque en la Tierra esté lloviendo
    await E(() => { const D = window.__dbg; D.weather.force = 'lluvia'; D.weather.rain = D.weather.here = 1; D.weather.wet = 1; });
    const sweep = await E(() => {
      const T = window.__tamachin, D = window.__dbg, P = T.player, bad = [], NAMES = ['La luna', 'Túnel a la Tierra', 'Centro del Cráter Grande'];
      const drawn = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
      let n = 0;
      for (let x = -50; x <= 50; x += 5) for (let z = -50; z <= 50; z += 5) {
        if (Math.hypot(x, z) > 51) continue; n++;
        T.setWorld('luna', x, z); T.advance(0.25);
        const prompt = document.querySelector('#prompt'), label = prompt.hidden ? null : document.querySelector('#promptText').textContent;
        const why = [P.inHouse && 'casa', P.inWater && 'agua', D.W.surface(P.pos.x, P.pos.z, P.perch) !== 'polvo' && !P.perch && 'suelo ' + D.W.surface(P.pos.x, P.pos.z, P.perch),
          D.W.wet(P.pos.y) && 'río', D.W.puddle(P.pos.x, P.pos.z) && 'charco', label && label !== 'Plantar tu bandera' && 'aviso ' + label, !NAMES.includes(document.querySelector('#zone').textContent) && 'lugar ' + document.querySelector('#zone').textContent,
          drawn(D.rainDrops.pts) && 'lluvia', P.pos.y < D.lunaY(P.pos.x, P.pos.z) - 0.05 && 'hundido'].filter(Boolean);
        if (why.length) bad.push(x + ',' + z + ': ' + why.join(', '));
      }
      const loose = D.scene.children.filter((o) => o.visible && !D.KEEP.has(o) && !o.userData.world).map((o) => o.type + ' ' + (o.name || ''));
      const roots = D.scene.children.filter((o) => o.userData.world && o.visible).map((o) => o.userData.world);
      return { n, bad: bad.slice(0, 8), nBad: bad.length, loose, roots };
    });
    T.check('en ' + sweep.n + ' puntos de la luna: ni casa, ni agua, ni charcos, ni avisos de la Tierra, ni lluvia; pisa polvo', sweep.nBad === 0, sweep.bad.join(' | ') || undefined);
    T.check('lo único que se dibuja es la luna (y Tamachin, las luces, el cielo, el farolito)', sweep.loose.length === 0 && sweep.roots.join() === 'luna', JSON.stringify({ loose: sweep.loose, roots: sweep.roots }));

    // la orilla del cráter: no se sale, y la cámara nunca queda bajo el suelo, mire para donde mire
    const edge = await E(() => {
      const T = window.__tamachin, D = window.__dbg, P = T.player, out = [];
      T.setWorld('luna', 0, 70); T.advance(0.3); const far = Math.hypot(P.pos.x, P.pos.z);
      T.setWorld('luna', 44, 0); const K = D.keys; K.KeyD = true; T.advance(3); K.KeyD = false; const run = Math.hypot(P.pos.x, P.pos.z);
      let low = Infinity;
      for (const [x, z] of [[40, 0], [0, 45], [-38, -20], [30, 30], [0, -46], [-19, 6]]) for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        T.setWorld('luna', x, z); T.view.yaw = T.view.yawT = yaw; T.advance(0.8);
        const c = D.camera.position, gap = c.y - D.lunaY(c.x, c.z); low = Math.min(low, gap); if (gap < 1.3) out.push(x + ',' + z + ' a ' + Math.round(yaw * 57.3) + '°: ' + gap.toFixed(2));
      }
      T.view.yaw = T.view.yawT = 0;
      return { far: +far.toFixed(2), run: +run.toFixed(2), low: +low.toFixed(2), out };
    });
    T.check('no se sale del cráter (ni puesto afuera ni corriendo hacia la orilla)', edge.far <= LUNA_R + 0.01 && edge.run <= LUNA_R + 0.01, JSON.stringify(edge));
    T.check('la cámara nunca queda bajo el suelo de la luna (6 lugares, 4 rumbos)', !edge.out.length, 'lo más bajo: ' + edge.low + ' m' + (edge.out.length ? ' | ' + edge.out.join(', ') : ''));

    // mientras está en la luna, en la Tierra nada se mueve (los autos y los vecinos lo esperan); la hora sí corre
    const frozen = await E(() => {
      const T = window.__tamachin, D = window.__dbg, snap = () => JSON.stringify([D.cars.map((c) => c.s.toFixed(3)), D.npcs.map((n) => n.pos.x.toFixed(3) + ',' + n.pos.z.toFixed(3))]);
      T.setWorld('luna', 0, -30); const a = snap(), h0 = T.day.h; T.advance(6); return { same: snap() === a, hours: +(T.day.h - h0).toFixed(3) };
    });
    T.check('mientras está allá, los autos y los vecinos de la Tierra esperan quietos; la hora corre', frozen.same && frozen.hours > 0.05, JSON.stringify(frozen));

    // la bandera: en la loma del centro, de su color
    const flag = await E(() => {
      const T = window.__tamachin, D = window.__dbg; T.setWorld('luna', 0, 2.4); T.advance(0.4);
      const label = document.querySelector('#prompt').hidden ? null : document.querySelector('#promptText').textContent; D.doAction(); T.advance(1.2);
      const F = D.WORLDS.luna.flag; return { label, quest: D.quests.luna, visible: F.visible, k: F.k, color: '#' + F.cloth.material.color.getHexString(), mine: T.player.T.color };
    });
    T.check('en el centro sale "Plantar tu bandera"; al plantarla se cumple el encargo y la bandera es de su color', flag.label === 'Plantar tu bandera' && flag.quest === 2 && flag.visible && flag.k === 1 && flag.color === flag.mine.toLowerCase(), JSON.stringify(flag));
    await E(() => { const T = window.__tamachin; T.setWorld('luna', 3, 7); T.view.yaw = T.view.yawT = 0.5; T.advance(1); });
    await page.screenshot({ path: T.out('bandera.jpg'), type: 'jpeg', quality: 70 });

    // al recargar en la luna, sigue en la luna (y la bandera sigue ahí)
    await E(() => { const T = window.__tamachin; T.setWorld('luna', 12, -30); T.view.yaw = T.view.yawT = 0; T.advance(0.3); });
    await E(() => window.dispatchEvent(new Event('pagehide')));   // guarda
    await page.reload(); await page.waitForFunction(() => !!window.__tamachin, null, { timeout: 30000 }); await E(() => { document.querySelector('#help').hidden = true; window.__tamachin.advance(0.5); });
    const back = await E(() => { const T = window.__tamachin, D = window.__dbg, P = T.player; return { world: T.world(), x: +P.pos.x.toFixed(1), z: +P.pos.z.toFixed(1), flag: D.WORLDS.luna.flag && D.WORLDS.luna.flag.visible, earth: D.EARTH.root.visible, pitch: Math.round(T.view.pitchT * 180 / Math.PI) }; });
    T.check('al recargar en la luna, sigue en la luna donde estaba, con su bandera y la cámara baja', back.world === 'luna' && Math.abs(back.x - 12) < 0.2 && Math.abs(back.z + 30) < 0.2 && back.flag && !back.earth && back.pitch === 16, JSON.stringify(back));
    await E(() => { const D = window.__dbg; D.honks = 0; const h = D.SFX.honk; D.SFX.honk = () => { D.honks++; h(); }; });

    // de vuelta: caminando hacia dentro del túnel del cráter, sale por el túnel de la ciudad, hacia la calle
    await E(() => { const T = window.__tamachin; T.setWorld('luna', 0, -45); T.view.yaw = T.view.yawT = 0; });
    await walk(['KeyW'], 1.6); await walk([], 1.2);
    const home = await st();
    const sky = await E(() => { const D = window.__dbg, b = D.scene.background; return { bg: b.r + b.g + b.b, fog: D.scene.fog.far }; });
    T.check('caminando hacia dentro del túnel del cráter vuelve a la Tierra, saliendo de la boca del túnel hacia la calle', home.world === 'tierra' && home.st === 'normal' && Math.abs(home.x - 24) < 0.3 && home.z > -59 && home.z < -56, JSON.stringify(home));
    T.check('en la Tierra todo vuelve: se dibuja ella y no la luna, el cielo ya no es negro', home.earth && !home.moon && sky.bg > 0.5, JSON.stringify({ ...sky, earth: home.earth, moon: home.moon }));
    T.check('y la cámara, a la altura que tenía en la Tierra (aunque recargó allá)', home.pitch === 40, home.pitch + '°');
    await walk(['KeyW'], 1.2);
    const stay = await st();
    T.check('recién vuelto, empujar contra la boca no lo regresa a la luna (primero hay que alejarse)', stay.world === 'tierra' && stay.st === 'normal', JSON.stringify(stay));
    // con el conejo siguiéndolo: se aleja un poco, entra otra vez, y el conejo se va con él a la luna
    await E(() => { const D = window.__dbg, P = window.__tamachin.player, r = D.creatures.find((c) => c.kind === 'conejo'); r.pos.set(P.pos.x + 1.2, 0, P.pos.z + 1.6); r.follow = 30; D.rabbit = r; });
    await walk(['KeyS'], 0.8); await walk(['KeyW'], 1.4); await walk([], 1.2);
    const again = await st();
    T.check('después de alejarse un poco, el túnel lo lleva otra vez a la luna', again.world === 'luna', JSON.stringify(again));
    const bunny = () => E(() => {
      const D = window.__dbg, r = D.rabbit, P = window.__tamachin.player, W = D.W, drawn = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
      return { world: r.world || 'tierra', root: r.mesh.parent.userData.world, drawn: drawn(r.mesh), follow: +r.follow.toFixed(1), d: +Math.hypot(r.pos.x - P.pos.x, r.pos.z - P.pos.z).toFixed(2), x: +r.pos.x.toFixed(2), z: +r.pos.z.toFixed(2),
        here: W.interacts.some((i) => i.who === r), onEarth: D.EARTH.interacts.some((i) => i.who === r), feet: +(r.pos.y - W.ground(r.pos.x, r.pos.z)).toFixed(2) };
    });
    const b0 = await bunny();
    T.check('el conejo que lo seguía se va con él a la luna: se dibuja allá, junto a él, y su «Acariciar» también se fue', b0.world === 'luna' && b0.root === 'luna' && b0.drawn && b0.d < 5 && b0.here && !b0.onEarth && b0.feet > -0.05, JSON.stringify(b0));
    // allá lo sigue, brincando más alto (en la Tierra, 0.4 m)
    const hop = await E(() => { const T = window.__tamachin, D = window.__dbg, r = D.rabbit, K = D.keys; let top = 0;
      K.KeyS = true; for (let i = 0; i < 150; i++) { T.advance(1 / 60, 1 / 60); top = Math.max(top, r.pos.y - D.lunaY(r.pos.x, r.pos.z)); } K.KeyS = false;
      for (let i = 0; i < 150; i++) { T.advance(1 / 60, 1 / 60); top = Math.max(top, r.pos.y - D.lunaY(r.pos.x, r.pos.z)); } return +top.toFixed(2); });
    const b1 = await bunny();
    T.check('en la luna lo sigue, brincando mucho más alto (' + hop + ' m)', b1.d < 4 && b1.follow === b0.follow && hop > 1, JSON.stringify({ ...b1, hop }));
    // y vuelve con él por el túnel; en la Tierra lo sigue otra vez
    await walk(['KeyW'], 3.6); await walk([], 1.2);
    const b2 = await E(() => window.__tamachin.world()), b3 = await bunny(); await walk(['KeyS'], 2); await walk([], 2.5); const b4 = await bunny();
    // lo sigue: se movió con él (cada conejo va de un lado al azar, `side`, y a veces rodea el poste o la loma del túnel)
    T.check('vuelve con él a la Tierra (y su «Acariciar» también), y lo sigue otra vez', b2 === 'tierra' && b3.world === 'tierra' && b3.root === 'tierra' && b3.drawn && b3.here && b3.d < 5
      && b4.follow > 0 && b4.d < 8 && Math.hypot(b4.x - b3.x, b4.z - b3.z) > 3, JSON.stringify({ back: b3, walked: b4 }));
    await E(() => { const D = window.__dbg, T = window.__tamachin, P = T.player, r = D.rabbit; r.pos.set(P.pos.x + 1, 0, P.pos.z + 1); r.follow = 30; T.setWorld('luna', 0, -30); T.advance(0.3); });

    // «Volver al inicio» desde la luna: dos toques (está lejos) y queda frente a su casa, en la Tierra
    const home2 = await E(() => { const T = window.__tamachin, P = T.player, b = document.querySelector('#dHome'); b.click(); const once = T.world(); b.click(); T.advance(0.3);
      const r = window.__dbg.rabbit; return { once, world: T.world(), x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2), earth: window.__dbg.EARTH.root.visible, rabbit: r.world || 'tierra', rd: +Math.hypot(r.pos.x - P.pos.x, r.pos.z - P.pos.z).toFixed(2) }; });
    T.check('«Volver al inicio» desde la luna pide dos toques y lo deja frente a su casa, en la Tierra, con el conejo que lo seguía', home2.once === 'luna' && home2.world === 'tierra' && home2.x === 0 && home2.z === 3.5 && home2.earth && home2.rabbit === 'tierra' && home2.rd < 3, JSON.stringify(home2));

    // los otros siete túneles siguen siendo pared
    const shut = await E(() => {
      const T = window.__tamachin, K = window.__dbg.keys, out = [];
      for (const [x, z, key, ax, lim] of [[-24, -55, 'KeyW', 'z', -59.2], [24, 55, 'KeyS', 'z', 59.2], [-24, 55, 'KeyS', 'z', 59.2], [-55, 24, 'KeyA', 'x', -59.2], [-55, -24, 'KeyA', 'x', -59.2], [55, 24, 'KeyD', 'x', 59.2], [55, -24, 'KeyD', 'x', 59.2]]) {
        T.go(x, z); T.view.yaw = T.view.yawT = 0; T.advance(0.2); K[key] = true; T.advance(2); K[key] = false; T.advance(1.5);
        const P = T.player, v = P.pos[ax]; if (T.world() !== 'tierra' || P.state !== 'normal' || Math.abs(v) > Math.abs(lim)) out.push(x + ',' + z + ': ' + T.world() + ' ' + P.state + ' ' + ax + '=' + v.toFixed(2));
      }
      return out;
    });
    T.check('los otros siete túneles siguen siendo pared: empujar contra ellos no lleva a ningún lado', !shut.length, shut.join(' | ') || undefined);

    // en la Tierra salta lo de siempre (1.38 m)
    const je = await E(JUMP, [-12, 8]);
    T.check('en la Tierra salta lo de siempre (1.38 m)', Math.abs(je.top - 1.383) < 0.08, JSON.stringify(je));

    // de noche, la luna de la placa brilla
    await E(() => { const T = window.__tamachin; T.setHour(22); T.go(26, -50); T.view.yaw = T.view.yawT = 0; T.advance(1); });
    await page.screenshot({ path: T.out('placa-noche.jpg'), type: 'jpeg', quality: 70 });
    T.check('sin errores', errors.length === 0, errors.slice(0, 5).join(' | ') || undefined);
  },
};
const LUNA_R = 52;
