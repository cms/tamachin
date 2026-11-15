// Lo que se guarda al recargar: lugar, rumbo y ángulo de la cámara; "Volver al inicio" con doble toque lejos de casa.
const { openGame, sleep } = require('./lib.cjs');

module.exports = {
  titulo: 'al recargar sigue donde estaba; Volver al inicio',
  async run(T) {
    const { ctx, page, errors, E } = await openGame(T, { help: true });
    const where = () => E(() => { const p = window.__tamachin.player.pos; return [p.x, p.y, p.z].map((v) => +v.toFixed(1)); });
    const reload = async () => { await E(() => window.dispatchEvent(new Event('pagehide'))); await page.reload(); await page.waitForFunction(() => !!window.__tamachin); await sleep(1200); };
    const near = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.3;

    T.check('la primera vez empieza frente a la casa', near(await where(), [0, 0, 3.5]), JSON.stringify(await where()));
    await page.click('#helpOk');
    await E(() => { const V = window.__tamachin.view; V.yaw = V.yawT = 2; window.__tamachin.go(7, -1700); }); await sleep(1200);
    await reload();
    T.check('en el bosque sin fin: sigue ahí', near(await where(), [7, 0, -1700]), JSON.stringify(await where()));
    T.check('la cámara conserva su ángulo', Math.abs(await E(() => window.__tamachin.view.yaw) - 2) < 0.01);
    await E(() => { document.querySelector('#help').hidden = true; });

    await E(() => window.__tamachin.go(2, -762)); await sleep(1500); await reload();
    const top = await where();
    T.check('en la cima: sigue ahí, a 398 m', near(top, [2, 0, -762]) && top[1] > 390, JSON.stringify(top));

    await page.click('#needs'); await sleep(300); await page.click('#dHome'); await sleep(300);
    T.check('lejos de casa, el primer toque solo pide otro', (await page.textContent('#dHome')) === 'Toca otra vez para volver' && near(await where(), top));
    await sleep(4600);
    T.check('a los 4 s el botón vuelve a la normalidad', (await page.textContent('#dHome')) === 'Volver al inicio');
    await page.click('#dHome'); await sleep(200); await page.click('#dHome'); await sleep(800);
    T.check('dos toques: de vuelta en casa, con el diario cerrado', near(await where(), [0, 0, 3.5]) && await E(() => document.querySelector('#diary').hidden));
    T.check('y la cámara de frente a la casa', Math.abs(await E(() => window.__tamachin.view.yaw)) < 0.01);
    await reload();
    T.check('después de recargar sigue en casa', near(await where(), [0, 0, 3.5]));

    await E(() => window.__tamachin.go(10, 8)); await sleep(500);
    await page.click('#needs'); await sleep(300); await page.click('#dHome'); await sleep(500);
    T.check('cerca de casa basta un toque', near(await where(), [0, 0, 3.5]));

    await E(() => window.__tamachin.go(-2.8, -10.5)); await sleep(600); await page.keyboard.press('KeyE'); await sleep(1200);
    T.check('se duerme en la cama', await E(() => window.__tamachin.player.state === 'sleep'));
    await reload();
    T.check('si recargas dormido, aparece junto a la cama', near(await where(), [-2.7, 0, -10.4]), JSON.stringify(await where()));
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
    await ctx.close();
  },
};
