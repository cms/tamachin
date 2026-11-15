// Girar la cámara: con el mouse, Z/X, un dedo, dos dedos, un dedo con la palanca; sin romper el toque (truco) ni el mareo
// (círculos con el mouse, o muchos toques seguidos).
// Caminar es relativo a la cámara, la cámara gira por el círculo, y el bosque sin fin carga hacia donde se mira.
const { openGame, touchscreen, PHONE, sleep } = require('./lib.cjs');

const deg = (r) => r * 180 / Math.PI;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

module.exports = {
  titulo: 'girar la cámara con mouse, teclas y dedos; caminar relativo a la cámara',
  async run(T) {
    {
      const { ctx, page, errors, E } = await openGame(T, { expose: 'pScreen, camera, player, forest' });
      const st = () => E(() => { const T = window.__tamachin, P = T.player, s = window.__dbg.pScreen; return { yaw: T.view.yawT * 180 / Math.PI, trick: P.lastTrick, mood: P.T.mood, heading: P.heading, ps: [s.x, s.y, s.r] }; });
      const reset = async () => { await E(() => { const V = window.__tamachin.view; V.yaw = V.yawT = 0; window.__tamachin.go(0, 3.5); }); await sleep(700); };
      await reset();

      let s = await st();
      await page.mouse.move(s.ps[0], s.ps[1]); await page.mouse.down();
      for (let i = 1; i <= 20; i++) { await page.mouse.move(s.ps[0] + i * 10, s.ps[1]); await sleep(16); }
      await page.mouse.up(); await sleep(400);
      let t = await st();
      T.check('arrastrar el mouse 200 px gira unos 80°', near(t.yaw, 81, 6), t.yaw.toFixed(1) + '°');
      T.check('arrastrar desde Tamachin no hace truco ni lo marea', t.trick === s.trick && t.mood !== 'mareado');

      await reset(); s = await st(); await page.mouse.click(s.ps[0], s.ps[1]); await sleep(300); t = await st();
      T.check('un clic en Tamachin sí hace truco y no gira', t.trick !== s.trick && near(t.yaw, 0, 0.1), s.trick + ' → ' + t.trick);

      await sleep(2500); s = await st(); const R = Math.max(70, s.ps[2] * 2.2);
      for (let i = 0; i <= 160; i++) { const a = i / 16 * Math.PI * 2; await page.mouse.move(s.ps[0] + Math.cos(a) * R, s.ps[1] + Math.sin(a) * R); await sleep(12); }
      t = await st();
      T.check('círculos con el mouse (sin botón) lo marean y no giran', t.mood === 'mareado' && near(t.yaw, 0, 0.1));
      await sleep(6500);

      await page.keyboard.down('KeyZ'); await sleep(500); await page.keyboard.up('KeyZ'); t = await st();
      T.check('Z gira a 1.9 rad/s', near(t.yaw, 54, 8), t.yaw.toFixed(1) + '°');
      await page.keyboard.down('KeyX'); await sleep(500); await page.keyboard.up('KeyX'); t = await st();
      T.check('X gira de regreso', near(t.yaw, 0, 8), t.yaw.toFixed(1) + '°');

      // un arrastre rápido: la cámara va por el círculo (misma distancia), no por la cuerda
      await reset();
      await E(() => { const D = window.__dbg, P = D.player.pos; window.__rec = []; window.__recOn = true;
        (function f() { if (!window.__recOn) return; const c = D.camera.position; window.__rec.push(Math.hypot(c.x - P.x, c.z - P.z)); requestAnimationFrame(f); })(); });
      await page.mouse.move(300, 500); await page.mouse.down();
      for (let i = 1; i <= 30; i++) { await page.mouse.move(300 + i * 14.3, 500); await sleep(33); }
      await page.mouse.up(); await sleep(800);
      const rec = await E(() => { window.__recOn = false; return window.__rec; });
      T.check('arrastre rápido de 180°: la cámara no se acerca', Math.min(...rec) > rec[0] - 0.3, rec[0].toFixed(1) + ' m → mínimo ' + Math.min(...rec).toFixed(1) + ' m');

      // caminar con W se aleja de la cámara, gire como gire
      for (const d of [90, 180, -90]) {
        await E((y) => { const V = window.__tamachin.view; V.yaw = V.yawT = y; window.__tamachin.go(0, 3.5); }, d * Math.PI / 180); await sleep(500);
        const a = await E(() => [window.__tamachin.player.pos.x, window.__tamachin.player.pos.z]);
        await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW'); await sleep(300);
        const b = await E(() => [window.__tamachin.player.pos.x, window.__tamachin.player.pos.z]), r = d * Math.PI / 180;
        const away = -((b[0] - a[0]) * Math.sin(r) + (b[1] - a[1]) * Math.cos(r)), side = (b[0] - a[0]) * Math.cos(r) - (b[1] - a[1]) * Math.sin(r);
        T.check('cámara a ' + d + '°: W lo aleja de la cámara', away > 3 && Math.abs(side) < 0.5, away.toFixed(1) + ' m lejos, ' + side.toFixed(1) + ' de lado');
      }

      // el bosque sin fin: 2 casillas hacia donde se mira, 1 atrás (a 90° la cámara está al este y mira al oeste: i negativa)
      for (const [d, want] of [[0, 'j -1..2'], [180, 'j -2..1'], [90, 'i -2..1']]) {
        await E((y) => { const V = window.__tamachin.view; V.yaw = V.yawT = y; window.__tamachin.go(7, -1700); }, d * Math.PI / 180); await sleep(900);
        const w = await E(() => { const F = window.__dbg.forest, P = window.__dbg.player.pos, pi = Math.floor(P.x / 26), pj = Math.floor((-1440 - P.z) / 26);
          const ks = [...F.live.keys()].map((k) => k.split(',').map(Number)), di = ks.map((k) => k[0] - pi), dj = ks.map((k) => k[1] - pj);
          return { n: ks.length, i: Math.min(...di) + '..' + Math.max(...di), j: Math.min(...dj) + '..' + Math.max(...dj) }; });
        const got = want[0] === 'i' ? 'i ' + w.i : 'j ' + w.j;
        T.check('bosque sin fin, cámara a ' + d + '°: 20 casillas, ' + want, w.n === 20 && got === want, JSON.stringify(w));
      }

      // Personalizar: mira a donde estaba la cámara al abrir; si la giras, se le ve de lado
      await E(() => { const V = window.__tamachin.view; V.yaw = V.yawT = 1.2; window.__tamachin.go(0, 3.5); }); await sleep(400);
      await page.click('#bCustom'); await sleep(1500); s = await st();
      await page.mouse.move(300, 600); await page.mouse.down(); for (let i = 1; i <= 20; i++) { await page.mouse.move(300 + i * 12, 600); await sleep(16); } await page.mouse.up(); await sleep(1200);
      t = await st();
      const wrap = (a) => ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      T.check('Personalizar: mira hacia la cámara de cuando abrió y se queda así al girar', Math.abs(wrap(s.heading - 1.2)) < 0.1 && Math.abs(wrap(t.heading - 1.2)) < 0.1 && t.yaw > deg(1.2) + 60);
      await page.click('#bCustom');
      T.check('sin errores con el mouse', !errors.length, errors.join(' | ') || undefined);
      await ctx.close();
    }
    {
      const { ctx, page, errors, E } = await openGame(T, { device: PHONE, expose: 'pScreen' });
      const touch = await touchscreen(ctx, page);
      const st = () => E(() => { const T = window.__tamachin, P = T.player, s = window.__dbg.pScreen; return { yaw: T.view.yawT * 180 / Math.PI, zoom: T.ui.zoomTarget, trick: P.lastTrick, mood: P.T.mood, x: P.pos.x, z: P.pos.z, ps: [s.x, s.y, s.r] }; });
      await E(() => window.__tamachin.go(0, 3.5)); await sleep(700);

      let s = await st();
      await touch('touchStart', [[150, 520, 1]]); await touch('touchStart', [[150, 520, 1], [250, 520, 2]]);
      for (let i = 1; i <= 12; i++) { await touch('touchMove', [[150 + i * 10, 520, 1], [250 + i * 10, 520, 2]]); await sleep(16); }
      let t = await st();
      T.check('dos dedos 120 px a la derecha giran unos 52°', near(t.yaw - s.yaw, 52, 5) && near(t.zoom, s.zoom, 0.01), (t.yaw - s.yaw).toFixed(1) + '°');
      for (let i = 1; i <= 10; i++) { await touch('touchMove', [[270 - i * 8, 520, 1], [370 + i * 8, 520, 2]]); await sleep(16); }
      const y1 = (await st()).yaw;
      await touch('touchMove', [[190, 520, 1]]);                   // se levanta un dedo…
      await touch('touchMove', [[190, 520, 1], [340, 300, 3]]);    // …y otro baja lejos
      await touch('touchMove', [[192, 520, 1], [342, 300, 3]]);
      t = await st(); await touch('touchEnd', []); await sleep(400);
      T.check('pellizcar abriendo los dedos acerca', t.zoom < s.zoom - 0.3, s.zoom.toFixed(2) + ' → ' + t.zoom.toFixed(2));
      T.check('cambiar un dedo por otro no hace saltar la cámara', near(t.yaw, y1, 2), y1.toFixed(1) + ' → ' + t.yaw.toFixed(1));
      t = await st();
      T.check('dos dedos no hacen truco ni marean', t.trick === s.trick && t.mood !== 'mareado');

      // un dedo solo: arrastrar gira (desde cualquier lado, también desde Tamachin), sin truco ni mareo
      await E(() => { window.__tamachin.ui.zoomTarget = 1; }); await sleep(800); s = await st();
      await touch('touchStart', [[80, 640, 4]]);
      for (let i = 1; i <= 12; i++) { await touch('touchMove', [[80 + i * 10, 640, 4]]); await sleep(16); }
      await touch('touchEnd', []); await sleep(300); t = await st();
      T.check('un dedo 120 px a la derecha gira unos 43° (los primeros 12 px son de holgura)', near(t.yaw - s.yaw, 43, 5) && t.trick === s.trick && t.mood !== 'mareado', (t.yaw - s.yaw).toFixed(1) + '°');
      s = await st();
      await touch('touchStart', [[s.ps[0], s.ps[1], 8]]);
      for (let i = 1; i <= 12; i++) { await touch('touchMove', [[s.ps[0] - i * 10, s.ps[1], 8]]); await sleep(16); }
      await touch('touchEnd', []); await sleep(300); t = await st();
      T.check('arrastrar un dedo desde Tamachin gira y no hace truco', near(t.yaw - s.yaw, -43, 5) && t.trick === s.trick, (t.yaw - s.yaw).toFixed(1) + '°');
      const R = Math.max(70, s.ps[2] * 2.2); s = await st();
      await touch('touchStart', [[s.ps[0] + R, s.ps[1], 4]]);
      for (let i = 0; i <= 160; i++) { const a = i / 16 * Math.PI * 2; await touch('touchMove', [[s.ps[0] + Math.cos(a) * R, s.ps[1] + Math.sin(a) * R, 4]]); await sleep(12); }
      await touch('touchEnd', []); t = await st();
      T.check('círculos con un dedo ya no lo marean', t.mood !== 'mareado', t.mood);

      // muchos toques seguidos sí lo marean
      await E(() => { const V = window.__tamachin.view; V.yaw = V.yawT = 0; window.__tamachin.go(0, 3.5); }); await sleep(2500); s = await st();
      const moods = [];
      for (let i = 0; i < 5; i++) { await touch('touchStart', [[s.ps[0], s.ps[1], 10 + i]]); await sleep(50); await touch('touchEnd', []); await sleep(150); moods.push(await E(() => window.__tamachin.player.T.mood)); }
      T.check('cinco toques rápidos en Tamachin lo marean (no antes del quinto)', moods[4] === 'mareado' && moods.slice(0, 4).every((m) => m !== 'mareado'), moods.join(', '));
      await sleep(6500);

      const j = await E(() => { const b = document.querySelector('#joy').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
      s = await st();
      await touch('touchStart', [[j[0], j[1], 5]]); await touch('touchMove', [[j[0], j[1] - 40, 5]]);
      await touch('touchStart', [[j[0], j[1] - 40, 5], [300, 400, 6]]);
      for (let i = 1; i <= 15; i++) { await touch('touchMove', [[j[0], j[1] - 40, 5], [300 - i * 8, 400, 6]]); await sleep(30); }
      await sleep(300); t = await st(); await touch('touchEnd', []); await sleep(300);
      T.check('con la palanca, un dedo gira la cámara mientras camina', near(t.yaw - s.yaw, -46, 6) && Math.hypot(t.x - s.x, t.z - s.z) > 2, (t.yaw - s.yaw).toFixed(1) + '°');

      await sleep(2500); s = await st(); await touch('touchStart', [[s.ps[0], s.ps[1], 7]]); await sleep(60); await touch('touchEnd', []); await sleep(300); t = await st();
      T.check('un toque en Tamachin hace truco', t.trick !== s.trick);
      T.check('sin errores en teléfono', !errors.length, errors.join(' | ') || undefined);
      await ctx.close();
    }
  },
};
