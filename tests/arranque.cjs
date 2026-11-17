// Arranque en escritorio y teléfono: sin errores, la barra cabe, el diario y Personalizar se alcanzan con el dedo.
const { openGame, PHONE, sleep } = require('./lib.cjs');

module.exports = {
  titulo: 'arranca sin errores; en teléfono el diario y Personalizar se alcanzan',
  async run(T) {
    {
      const { ctx, page, errors, E } = await openGame(T, { help: true });
      T.check('escritorio: sin errores ni archivos faltantes', !errors.length, errors.join(' | ') || undefined);
      // Chrome sin interfaz no pide /favicon.ico, así que el 404 de antes no se veía en `errors`: se revisa el enlace
      T.check('tiene ícono (dentro de la página, sin archivo aparte)', await E(() => /^data:image\/svg\+xml,/.test((document.querySelector('link[rel=icon]') || {}).href || '')));
      T.check('empieza en el jardín de casa', (await page.textContent('#zone')) === 'Jardín de casa');
      T.check('la ayuda se ve al empezar', await E(() => !document.querySelector('#help').hidden));
      await page.keyboard.press('KeyJ'); await sleep(300);
      T.check('J abre el diario', await E(() => !document.querySelector('#diary').hidden));
      await page.keyboard.press('Escape'); await sleep(200);
      T.check('Escape lo cierra', await E(() => document.querySelector('#diary').hidden));
      await page.screenshot({ path: T.out('escritorio.jpg'), type: 'jpeg', quality: 70 });
      T.check('sin ?stats no hay medidor de rendimiento', await E(() => !document.querySelector('#stats')));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await openGame(T, { query: '?stats', settle: 2200 });
      const txt = (await page.textContent('#stats').catch(() => '')) || '';
      T.check('con ?stats se ven cuadros/s, llamadas y triángulos', /\d+ cuadros\/s/.test(txt) && /\d+ llamadas/.test(txt) && /triángulos/.test(txt), txt.replace(/\n/g, ' | '));
      T.check('sin errores con ?stats', !errors.length, errors.join(' | ') || undefined);
      await page.screenshot({ path: T.out('stats.jpg'), type: 'jpeg', quality: 70 });
      await ctx.close();
    }
    {
      const { ctx, page, errors, E } = await openGame(T, { device: PHONE, help: true, expose: 'camera, player, pScreen' });
      T.check('teléfono: sin errores', !errors.length, errors.join(' | ') || undefined);
      T.check('la barra de arriba cabe sin desplazar de lado', await E(() => document.documentElement.scrollWidth <= innerWidth));
      T.check('el botón de los medidores dice Diario', (await page.textContent('#needs')).includes('Diario'));
      // Sonido y Personalizar: en el teléfono son íconos redondos junto al reloj, en la misma fila (también en uno angosto, de 360)
      const iconRow = () => E(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(), c = r('#clock'), b = [r('#bSound'), r('#bCustom')], n = r('#needs');
        return { same: b.every((x) => Math.abs(x.top - c.top) < 4 && x.width >= 44 && x.height >= 44 && x.right <= innerWidth - 8) && c.left > n.right && b[0].left > c.right && b[1].left > b[0].right,
          labels: [...document.querySelectorAll('.tools .lab')].map((l) => Math.round(l.getBoundingClientRect().width)), sw: document.documentElement.scrollWidth - innerWidth, bars: [...document.querySelectorAll('.need i')].map((i) => Math.round(i.getBoundingClientRect().width)) }; });
      let row = await iconRow();
      T.check('teléfono: Sonido y Personalizar son íconos junto al reloj, en la misma fila', row.same && row.labels.every((w) => w <= 1) && row.sw <= 0 && row.bars.every((w) => w >= 20), JSON.stringify(row));
      await page.tap('#helpOk'); await page.tap('#bSound'); await sleep(300);
      T.check('tocar el ícono de sonido dice en qué quedó', (await page.textContent('#toast')) === 'Efectos, sin música.' && (await E(() => document.querySelector('#bSound').dataset.mode)) === 'efectos', await page.textContent('#toast'));
      await page.tap('#bSound'); await page.tap('#bSound'); await sleep(200);   // nada → otra vez todo
      T.check('y da la vuelta: nada y otra vez todo', (await page.textContent('#bSound')) === 'Sonido: sí');
      await page.setViewportSize({ width: 360, height: 740 }); await E(() => window.__tamachin.go(2, -770)); await sleep(1200);   // la cima: el nombre más largo
      row = await iconRow();
      T.check('en un teléfono angosto (360) también caben en la fila (las barras se encogen)', row.same && row.sw <= 0 && row.bars.every((w) => w >= 12), JSON.stringify(row));
      await page.setViewportSize(PHONE.viewport); await E(() => window.__tamachin.go(0, 3.5)); await sleep(800);
      await page.tap('#needs'); await sleep(400);
      const d = await E(() => {
        const b = document.querySelector('#dHome').getBoundingClientRect(), p = document.querySelector('#diary .pbody').getBoundingClientRect();
        return { open: !document.querySelector('#diary').hidden, home: b.top >= p.top && b.bottom <= p.bottom };
      });
      T.check('tocar Diario lo abre', d.open);
      T.check('"Volver al inicio" se ve sin desplazar', d.home);
      await page.screenshot({ path: T.out('telefono-diario.jpg'), type: 'jpeg', quality: 70 });
      // lo que no cabe en el panel: aviso "Más abajo" mientras quede algo por ver
      const more = (sel) => E((s) => document.querySelector(s).classList.contains('more'), sel);
      const toEnd = async (sel) => { await E((s) => { const b = document.querySelector(s + ' .pbody'); b.scrollTop = b.scrollHeight; }, sel); await sleep(300); };
      T.check('diario: si no cabe, avisa que hay más abajo', await more('#diary'));
      await toEnd('#diary');
      T.check('diario: al llegar al final, el aviso se quita', !await more('#diary'));
      await page.tap('#dClose'); await sleep(300);
      await page.tap('#bCustom'); await sleep(1500);
      await page.screenshot({ path: T.out('telefono-personalizar.jpg'), type: 'jpeg', quality: 70 });
      const m = await E(() => {
        const body = document.querySelector('#panel .pbody'), h = [...body.querySelectorAll('h3')].find((x) => x.textContent === 'Ánimo').getBoundingClientRect();
        return { visible: h.bottom <= body.getBoundingClientRect().bottom, cue: document.querySelector('#panel').classList.contains('more') };
      });
      T.check('Personalizar: Ánimo se ve, o hay aviso de que hay más abajo', m.visible || m.cue, JSON.stringify(m));
      await toEnd('#panel');
      T.check('Personalizar: al llegar al final, el aviso se quita', !await more('#panel'));
      await E(() => { document.querySelector('#panel .pbody').scrollTop = 0; }); await sleep(300);
      const c = await E(() => {
        const D = window.__dbg, P = D.player, eye = P.pos.y + 0.78 * P.T.scale, top = document.querySelector('.top').getBoundingClientRect().bottom;
        return { above: D.camera.position.y - eye, y: D.pScreen.y, r: D.pScreen.r, top, panel: document.querySelector('#panel').getBoundingClientRect().top };
      });
      T.check('Personalizar en teléfono: la cámara a la altura de sus ojos (no desde arriba)', c.above < 1.2, c.above.toFixed(2) + ' m arriba');
      T.check('y Tamachin entero en el hueco entre la barra y el panel', c.y - c.r > c.top && c.y + c.r < c.panel, JSON.stringify(c));
      await page.tap('#pClose'); await sleep(1500);
      T.check('al cerrar, la imagen vuelve a su lugar', await E(() => !(window.__dbg.camera.view && window.__dbg.camera.view.enabled)));
      await ctx.close();
    }
  },
};
