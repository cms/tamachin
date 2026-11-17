// El tiempo: cada día el suyo (1 de cada 5 llueve, el primero hace sol), nublado y lluvia cambian la luz, cae lluvia, se forman
// charcos que luego se secan, y adentro de la casa la lluvia se oye apagada. ?clima=lluvia, nublado o sol lo fija.
const { openGame, sleep } = require('./lib.cjs');

const EXPOSE = 'day, setHour, weather, dayWeather, updateWeather, rainDrops, puddles, hemi, sun, scene, renderer, camera, player, butterflies, getMus: () => mus, WEATHER';
const LUMA = () => {
  const D = window.__dbg; D.renderer.render(D.scene, D.camera);
  const src = D.renderer.domElement, w = 160, h = Math.round(160 * src.height / src.width), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h); const a = g.getImageData(0, 0, w, h).data;
  let s = 0; for (let i = 0; i < a.length; i += 4) s += 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]; return s / (a.length / 4);
};

module.exports = {
  titulo: 'el tiempo: sol, nublado y lluvia según el día, charcos que se llenan y se secan, la lluvia se oye',
  async run(T) {
    // el plan de cada día
    const { ctx, page, errors, E } = await openGame(T, { expose: EXPOSE, clima: false });
    const plan = await E(() => { const D = window.__dbg, n = { sol: 0, nublado: 0, lluvia: 0 }; let bad = 0, same = true;
      for (let d = 2; d <= 501; d++) { const p = D.dayWeather(d); n[p.kind]++; if (p.kind === 'lluvia' && (p.from < 9 || p.to > 21 || p.to - p.from < 2)) bad++; if (JSON.stringify(p) !== JSON.stringify(D.dayWeather(d))) same = false; }
      return { n, bad, same, first: D.dayWeather(1).kind }; });
    T.check('el primer día hace sol; luego llueve 1 de cada 5 días, entre las 9 y las 9 de la noche', plan.first === 'sol' && plan.n.lluvia > 70 && plan.n.lluvia < 130 && plan.n.nublado > 90 && plan.n.nublado < 160 && !plan.bad && plan.same, JSON.stringify(plan));
    T.check('una partida nueva: sol, sin lluvia ni charcos', await E(() => { const W = window.__dbg.weather; return W.cloud === 0 && W.rain === 0 && !window.__dbg.rainDrops.pts.visible && !window.__dbg.puddles.visible; }));
    const sunny = await E(() => ({ sun: window.__dbg.sun.intensity, lum: 0 }));
    sunny.lum = await E(LUMA);
    // un día de lluvia, hora por hora: antes, durante y después del chubasco; los charcos se llenan y se secan
    const tl = await E(() => {
      const D = window.__dbg; let n = 2; while (D.dayWeather(n).kind !== 'lluvia') n++;
      const p = D.dayWeather(n), at = (h, secs) => { D.setHour(h); for (let i = 0; i < secs; i++) D.updateWeather(1); return { cloud: +D.weather.cloud.toFixed(2), rain: +D.weather.rain.toFixed(2), wet: +D.weather.wet.toFixed(2) }; };
      D.day.n = n; const before = at(p.from - 3, 30), during = at((p.from + p.to) / 2, 80), after = at(p.to + 2.5, 260);
      return { n, p, before, during, after };
    });
    T.check('antes del chubasco: sin lluvia', tl.before.rain < 0.05, JSON.stringify(tl));
    T.check('durante: nublado, llueve y se llenan los charcos', tl.during.cloud > 0.9 && tl.during.rain > 0.9 && tl.during.wet > 0.95, JSON.stringify(tl.during));
    T.check('después: despeja y los charcos se secan', tl.after.rain < 0.05 && tl.after.wet < 0.05 && tl.after.cloud < 0.4, JSON.stringify(tl.after));
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
    await ctx.close();

    // ?clima=lluvia: llueve desde que abre, con charcos, ventanas prendidas, luz pareja; no más oscuro que 70 % del sol
    const r = await openGame(T, { expose: EXPOSE, clima: 'lluvia' });
    await sleep(800);
    const rain = await r.E(() => { const D = window.__dbg; let lights = 0; D.scene.traverseVisible((o) => { if (o.isLight) lights++; });
      return { W: { ...D.weather }, drops: D.rainDrops.pts.visible, puddles: D.puddles.visible, lamps: +D.day.lamps.toFixed(2), sun: D.sun.intensity, lights, butterflies: D.butterflies.filter((b) => b.g.visible).length }; });
    T.check('?clima=lluvia: llueve, hay charcos y las ventanas se prenden', rain.W.rain === 1 && rain.drops && rain.puddles && rain.lamps >= 0.55, JSON.stringify(rain));
    T.check('el sol pega menos, sin luces de más, y las mariposas se esconden', rain.sun < sunny.sun * 0.4 && rain.lights === 3 && rain.butterflies === 0, JSON.stringify({ sun: rain.sun, sunny: sunny.sun, lights: rain.lights, butterflies: rain.butterflies }));
    const lum = await r.E(LUMA);
    T.check('lloviendo se ve bien: al menos 65 % del brillo de un día de sol (de noche es como 55 %)', lum > sunny.lum * 0.65, Math.round(lum / sunny.lum * 100) + ' %');
    await r.page.screenshot({ path: T.out('lluvia.jpg'), type: 'jpeg', quality: 70 });
    // adentro de la casa no caen gotas y la lluvia se oye apagada, con gotas en el techo
    await r.page.keyboard.press('KeyZ'); await r.E(() => window.__tamachin.go(0, -8)); await sleep(3500);
    const inside = await r.E(() => { const M = window.__dbg.getMus(); return { drops: window.__dbg.rainDrops.pts.visible, roof: M && M.amb.roof, lp: M && Math.round(M.amb.rainLP.frequency.value), drips: M && M.amb.drips, rain: M && +M.amb.lv.rain.toFixed(2) }; });
    T.check('en la casa: sin gotas cayendo, la lluvia apagada y gotas en el techo', !inside.drops && inside.roof && inside.lp < 1500 && inside.drips > 0 && inside.rain > 0.9, JSON.stringify(inside));
    // arriba de los cerros no llueve (en el paso 2 nevará)
    await r.E(() => window.__tamachin.go(2, -770)); await sleep(2000);
    T.check('en la cima no cae lluvia', await r.E(() => window.__dbg.weather.here === 0 && !window.__dbg.rainDrops.pts.visible));
    T.check('sin errores con lluvia', !r.errors.length, r.errors.join(' | ') || undefined);
    await r.ctx.close();

    // ?clima=nublado: gris, sin lluvia; de noche no se ven las estrellas
    const c = await openGame(T, { expose: EXPOSE, clima: 'nublado' });
    const cl = await c.E(() => { const D = window.__dbg, W = D.weather; D.setHour(23); return { cloud: W.cloud, rain: W.rain, drops: D.rainDrops.pts.visible, stars: D.day.stars }; });
    T.check('?clima=nublado: gris, sin lluvia ni estrellas', cl.cloud > 0.8 && cl.rain === 0 && !cl.drops && cl.stars === 0, JSON.stringify(cl));
    T.check('sin errores nublado', !c.errors.length, c.errors.join(' | ') || undefined);
    await c.ctx.close();
  },
};
