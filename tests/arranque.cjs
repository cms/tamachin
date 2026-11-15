// Arranque en escritorio y teléfono: sin errores, la barra cabe, el diario se alcanza con el dedo.
const { openGame, PHONE, sleep } = require('./lib.cjs');

module.exports = {
  titulo: 'arranca sin errores; en teléfono el diario se alcanza',
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
      await ctx.close();
    }
    {
      const { ctx, page, errors, E } = await openGame(T, { device: PHONE, help: true });
      T.check('teléfono: sin errores', !errors.length, errors.join(' | ') || undefined);
      T.check('la barra de arriba cabe sin desplazar de lado', await E(() => document.documentElement.scrollWidth <= innerWidth));
      T.check('el botón de los medidores dice Diario', (await page.textContent('#needs')).includes('Diario'));
      await page.tap('#helpOk'); await page.tap('#needs'); await sleep(400);
      const d = await E(() => {
        const b = document.querySelector('#dHome').getBoundingClientRect(), p = document.querySelector('#diary .pbody').getBoundingClientRect();
        return { open: !document.querySelector('#diary').hidden, home: b.top >= p.top && b.bottom <= p.bottom };
      });
      T.check('tocar Diario lo abre', d.open);
      T.check('"Volver al inicio" se ve sin desplazar', d.home);
      await page.screenshot({ path: T.out('telefono-diario.jpg'), type: 'jpeg', quality: 70 });
      await page.tap('#dClose'); await sleep(300);
      await page.tap('#bCustom'); await sleep(1200);
      await page.screenshot({ path: T.out('telefono-personalizar.jpg'), type: 'jpeg', quality: 70 });
      await ctx.close();
    }
  },
};
