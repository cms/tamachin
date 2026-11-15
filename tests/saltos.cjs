// Saltar sirve: se brinca la cerca del jardín (caminando y corriendo), se sube a botes de basura, rocas grandes y bancos,
// la cama rebota; sin saltar todo eso estorba igual que antes, y las paredes, setos y barandales no se brincan.
const { openGame, sleep } = require('./lib.cjs');

module.exports = {
  titulo: 'saltar: brincar la cerca, subirse a cosas, rebotar en la cama',
  async run(T) {
    const { ctx, page, errors, E } = await openGame(T, { expose: 'player, perches, circles, occluders, needs, TOWN_Z, BR' });
    await E(() => { for (const c of window.__tamachin.cars) { c.v = 0; c.pause = 1e9; } });   // que ningún auto lo atropelle junto al bote
    const st = () => E(() => { const P = window.__tamachin.player; return { x: P.pos.x, y: P.pos.y, z: P.pos.z, g: P.onGround, perch: P.perch ? P.perch.top : null, mood: P.T.mood, state: P.state }; });
    const place = async (x, z) => { await E(([x, z]) => { const V = window.__tamachin.view; V.yaw = V.yawT = 0; window.__tamachin.go(x, z); }, [x, z]); await sleep(700); };
    const drop = async (x, z) => { await E(([x, z]) => { const P = window.__tamachin.player; P.pos.set(x, 2.2, z); P.vx = P.vz = P.vy = 0; P.onGround = false; }, [x, z]); await sleep(900); };
    const hold = async (keys, ms, jumpAt) => {
      for (const k of keys) await page.keyboard.down(k);
      if (jumpAt != null) { await sleep(jumpAt); await page.keyboard.press('Space'); await sleep(ms - jumpAt); } else await sleep(ms);
      for (const k of keys) await page.keyboard.up(k);
      await sleep(400);
    };
    const f2 = (v) => v.toFixed(2);

    // la cerca norte del jardín está en z = -16.6 (entre la casa y la cerca hay pasto)
    await place(-8, -14.4); await hold(['KeyW'], 1500); let s = await st();
    T.check('sin saltar, la cerca del jardín no deja pasar', s.z > -16.2, 'z ' + f2(s.z));
    await hold(['KeyW'], 1300, 250); s = await st();
    T.check('pegado a la cerca, caminando y saltando, la brinca', s.z < -17.4 && s.g && Math.abs(s.y) < 0.05, 'z ' + f2(s.z) + ', y ' + f2(s.y));
    await place(-8, -14.4); await hold(['KeyW', 'ShiftLeft'], 900, 120); s = await st();
    T.check('corriendo y saltando, también', s.z < -17.4 && s.g, 'z ' + f2(s.z));
    await place(-8, -18.4); await hold(['KeyS'], 1300, 250); s = await st();
    T.check('y de regreso, hacia el jardín', s.z > -15.8 && s.g, 'z ' + f2(s.z));

    // un bote de basura de la ciudad: estorba sin saltar; cayendo encima se queda parado arriba; al caminar se baja
    // el poste del bote queda 1.6 m al oeste o al norte: se llega desde el sureste
    const bin = await E(() => { const b = window.__dbg.perches.find((p) => p.r === 0.34 && Math.abs(p.top - 0.96) < 0.01); return { x: b.x, z: b.z }; });
    await place(bin.x + 2, bin.z + 2); await hold(['KeyA', 'KeyW'], 1300); s = await st();
    T.check('sin saltar, el bote estorba', Math.hypot(s.x - bin.x, s.z - bin.z) > 0.9, f2(Math.hypot(s.x - bin.x, s.z - bin.z)) + ' m del bote');
    const fun0 = await E(() => window.__dbg.needs.diversion);
    await drop(bin.x, bin.z); s = await st();
    T.check('cayendo sobre el bote se queda parado arriba', Math.abs(s.y - 0.96) < 0.02 && s.g && s.perch === 0.96, JSON.stringify(s));
    const fun1 = await E(() => window.__dbg.needs.diversion);
    T.check('subirse a algo le sube la diversión', fun1 > fun0 + 0.02, f2(fun0) + ' → ' + f2(fun1));
    await page.screenshot({ path: T.out('bote.jpg'), type: 'jpeg', quality: 70 });
    await hold(['KeyS', 'KeyD'], 600); s = await st();
    T.check('al caminar se baja y queda en el suelo, fuera del bote', Math.abs(s.y) < 0.02 && s.g && Math.hypot(s.x - bin.x, s.z - bin.z) > 0.9, JSON.stringify(s));

    // con el teclado, como se juega: desde junto al bote, salta y avanza un poco (dos duraciones del toque)
    for (const ms of [160, 230]) {
      await place(bin.x + 0.85, bin.z + 0.85); await page.keyboard.press('Space'); await sleep(150);
      await page.keyboard.down('KeyA'); await page.keyboard.down('KeyW'); await sleep(ms); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW'); await sleep(900); s = await st();
      T.check('con el teclado: salta, avanza ' + ms + ' ms y queda sobre el bote', Math.abs(s.y - 0.96) < 0.02 && s.g, 'y ' + f2(s.y) + ', a ' + f2(Math.hypot(s.x - bin.x, s.z - bin.z)) + ' m');
    }

    // una roca grande del bosque
    const rock = await E(() => { const D = window.__dbg, clear = (p) => D.circles.every((c) => c === p || Math.hypot(c.x - p.x, c.z - p.z) > c.r + 0.62 + 0.3);
      return D.perches.filter((p) => p.r > 0.6 && p.z < -160 && clear(p)).sort((a, b) => b.top - a.top)[0]; });
    await drop(rock.x, rock.z); s = await st();
    T.check('sobre una roca grande del bosque (' + f2(rock.top) + ' m)', Math.abs(s.y - rock.top) < 0.02 && s.g, JSON.stringify(s));
    await page.screenshot({ path: T.out('roca.jpg'), type: 'jpeg', quality: 70 });

    // la cama: desde un lado, salta hacia ella; rebota cada vez menos y queda arriba; desde ahí salta más alto
    await place(-2.6, -10.4);
    // rebotes: la velocidad pasa de bajar a subir estando a la altura de la cama (el salto desde el suelo no cuenta)
    const track = () => E(() => { const P = window.__tamachin.player, o = { max: 0, ups: 0, prev: P.vy }; window.__track = o;
      (function f() { if (window.__track !== o) return; o.max = Math.max(o.max, P.pos.y); if (P.vy > 1 && o.prev <= 0 && P.pos.y > 0.7) o.ups++; o.prev = P.vy; requestAnimationFrame(f); })(); });
    await track(); await hold(['KeyA'], 1600, 60); await sleep(1500);
    let t = await E(() => window.__track); s = await st();
    T.check('salta a la cama y rebota (al menos dos veces)', t.ups >= 2, t.ups + ' rebotes');
    T.check('y se queda arriba, quieto', Math.abs(s.y - 0.86) < 0.02 && s.g, JSON.stringify(s));
    await track(); await page.keyboard.press('Space'); await sleep(2200); t = await E(() => window.__track);
    T.check('desde la cama salta más alto que desde el suelo', t.max > 0.86 + 1.6, 'altura ' + f2(t.max));
    await page.screenshot({ path: T.out('cama.jpg'), type: 'jpeg', quality: 70 });
    await E(() => { window.__track = null; });

    // lo que no se brinca: la pared de un edificio, un seto de Valle Alegre, el barandal del puente
    const bld = await E(() => { const o = window.__dbg.occluders.filter((q) => q.z1 < 62 && q.z0 > -62)[0]; return { x: (o.x0 + o.x1) / 2, z1: o.z1 }; });
    await place(bld.x, bld.z1 + 1.4); await hold(['KeyW'], 2200, 300); s = await st();
    T.check('la pared de un edificio no se brinca', s.z > bld.z1, 'z ' + f2(s.z - bld.z1) + ' de la pared');
    const HS = await E(() => window.__dbg.TOWN_Z + 63.2);
    await place(20, HS + 2.2); await hold(['KeyW'], 2200, 300); s = await st();
    T.check('el seto de Valle Alegre no se brinca', s.z > HS + 0.8, 'z ' + f2(s.z - HS) + ' del seto');
    const br = await E(() => window.__dbg.BR);
    await place(br.x + 2.8, br.z); await hold(['KeyA'], 1800, 300); s = await st();
    T.check('el barandal del puente no se brinca', s.x > br.x + 1.93, 'x ' + f2(s.x - br.x) + ' del centro del puente');

    // si se guarda parado sobre algo y se vuelve a abrir, aparece ahí mismo, arriba (no empujado a un lado: de la cama saldría
    // por la pared de la casa)
    const reopen = async (x, z) => {
      await drop(x, z); const at = await st(); await E(() => window.dispatchEvent(new Event('pagehide')));
      await page.reload(); await page.waitForFunction(() => !!window.__tamachin, null, { timeout: 30000 }); await sleep(1500);
      return [at, { ...(await st()), inHouse: await E(() => window.__tamachin.player.inHouse) }];
    };
    let [a, b] = await reopen(bin.x + 0.3, bin.z);
    T.check('guardado sobre el bote: al volver sigue arriba', Math.abs(b.y - 0.96) < 0.02 && b.g && Math.hypot(b.x - a.x, b.z - a.z) < 0.05, JSON.stringify(b));
    for (const [x, z, where] of [[-5.03, -10.4, 'junto a la pared'], [-4.4, -11.95, 'en la cabecera']]) {
      [a, b] = await reopen(x, z);
      T.check('guardado sobre la cama ' + where + ': al volver sigue en la cama, dentro de la casa', Math.abs(b.y - 0.86) < 0.02 && b.inHouse && Math.hypot(b.x - a.x, b.z - a.z) < 0.05, JSON.stringify(b));
    }
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
    await ctx.close();
  },
};
