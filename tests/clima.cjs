// El tiempo: cada día el suyo (1 de cada 5 llueve, el primero hace sol), nublado y lluvia cambian la luz, cae lluvia, se forman
// charcos que luego se secan, y adentro de la casa la lluvia se oye apagada. Paraguas, brincar en charcos, arcoíris al despejar,
// nieve en los cerros, la banda no toca con lluvia, y el reloj y el diario dicen el tiempo. ?clima=lluvia, nublado, sol o arcoiris lo fija.
const { openGame, sleep } = require('./lib.cjs');

const EXPOSE = 'day, setHour, weather, dayWeather, updateWeather, rainDrops, snowFlakes, puddles, umbrella, npcs, quests, skyBow, hemi, sun, scene, renderer, camera, player, butterflies, getMus: () => mus, WEATHER, town';
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
      const D = window.__dbg; let n = 2; while (D.dayWeather(n).kind !== 'lluvia' || D.dayWeather(n).to > 18.3) n++;   // un chubasco que acaba de día
      const p = D.dayWeather(n), at = (h, secs) => { D.setHour(h); for (let i = 0; i < secs; i++) D.updateWeather(1); return { cloud: +D.weather.cloud.toFixed(2), rain: +D.weather.rain.toFixed(2), wet: +D.weather.wet.toFixed(2), bow: +D.weather.bow.toFixed(2) }; };
      D.day.n = n; const before = at(p.from - 3, 30), during = at((p.from + p.to) / 2, 80), bow = at(p.to + 0.6, 12), q = D.quests.arcoiris, after = at(p.to + 2.5, 260);
      return { n, p, before, during, bow, q, after };
    });
    T.check('antes del chubasco: sin lluvia', tl.before.rain < 0.05, JSON.stringify(tl));
    T.check('durante: nublado, llueve y se llenan los charcos', tl.during.cloud > 0.9 && tl.during.rain > 0.9 && tl.during.wet > 0.95, JSON.stringify(tl.during));
    T.check('al despejar de día sale el arcoíris y el encargo se cumple al verlo', tl.bow.bow > 0.6 && tl.q === 2, JSON.stringify({ bow: tl.bow, q: tl.q }));
    T.check('después: despeja, los charcos se secan y el arcoíris se va', tl.after.rain < 0.05 && tl.after.wet < 0.05 && tl.after.cloud < 0.4 && tl.after.bow < 0.1, JSON.stringify(tl.after));
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
    const umb = await r.E(() => ({ mine: window.__dbg.umbrella.m.visible, npcs: window.__dbg.npcs.filter((n) => n.umb && n.umb.visible).length, charcos: window.__dbg.quests.charcos }));
    T.check('con lluvia: Tamachin y la mitad de los vecinos abren paraguas, y sale el encargo de los charcos', umb.mine && umb.npcs >= 8 && umb.charcos === 1, JSON.stringify(umb));
    await r.E(() => { window.__tamachin.cars.length = 0; });   // los autos quietos: que ninguno lo atropelle a media prueba
    for (let i = 0; i < 3; i++) { await r.E((i) => { const p = window.__dbg.puddles.list[i]; window.__tamachin.go(p.x, p.z); }, i); await sleep(400); await r.page.keyboard.press('Space'); await sleep(1000); }
    T.check('brincar en tres charcos: tres de diez', (await r.page.textContent('#toast')) === 'Charcos: 3 de 10.', await r.page.textContent('#toast'));
    await r.E(() => window.__tamachin.go(0, 3.5)); await sleep(300); await r.page.click('#clock'); await sleep(300);
    T.check('el reloj dice que está lloviendo', /Está lloviendo\./.test(await r.page.textContent('#toast')), await r.page.textContent('#toast'));
    await r.page.keyboard.press('KeyJ'); await sleep(300);
    T.check('y el diario: día lluvioso', / · lluvioso · /.test(await r.page.textContent('#dDay')), await r.page.textContent('#dDay')); await r.page.keyboard.press('Escape');
    await r.E(() => window.__dbg.setHour(20)); await sleep(600);
    T.check('con lluvia la banda no toca', await r.E(() => !window.__dbg.town.band));
    await r.E(() => window.__dbg.setHour(12));
    // adentro de la casa no caen gotas y la lluvia se oye apagada, con gotas en el techo
    await r.page.keyboard.press('KeyZ'); await r.E(() => window.__tamachin.go(0, -8)); await sleep(3500);
    const inside = await r.E(() => { const M = window.__dbg.getMus(); return { drops: window.__dbg.rainDrops.pts.visible, umbrella: window.__dbg.umbrella.m.visible, roof: M && M.amb.roof, lp: M && Math.round(M.amb.rainLP.frequency.value), drips: M && M.amb.drips, rain: M && +M.amb.lv.rain.toFixed(2) }; });
    T.check('en la casa: sin gotas cayendo, la lluvia apagada y gotas en el techo', !inside.drops && !inside.umbrella && inside.roof && inside.lp < 1500 && inside.drips > 0 && inside.rain > 0.9, JSON.stringify(inside));
    // arriba de los cerros no llueve (en el paso 2 nevará)
    await r.E(() => window.__tamachin.go(2, -770)); await sleep(2000);
    T.check('en la cima no llueve: nieva', await r.E(() => window.__dbg.weather.here === 0 && !window.__dbg.rainDrops.pts.visible && window.__dbg.weather.snow > 0.9 && window.__dbg.snowFlakes.pts.visible));
    T.check('sin errores con lluvia', !r.errors.length, r.errors.join(' | ') || undefined);
    await r.ctx.close();

    // ?clima=nublado: gris, sin lluvia; de noche no se ven las estrellas
    const c = await openGame(T, { expose: EXPOSE, clima: 'nublado' });
    const cl = await c.E(() => { const D = window.__dbg, W = D.weather; D.setHour(23); return { cloud: W.cloud, rain: W.rain, drops: D.rainDrops.pts.visible, stars: D.day.stars }; });
    T.check('?clima=nublado: gris, sin lluvia ni estrellas', cl.cloud > 0.8 && cl.rain === 0 && !cl.drops && cl.stars === 0, JSON.stringify(cl));
    T.check('sin errores nublado', !c.errors.length, c.errors.join(' | ') || undefined);
    await c.ctx.close();
    // ?clima=arcoiris: por la tarde, el arcoíris en el cielo
    const b = await openGame(T, { expose: EXPOSE, clima: 'arcoiris', hora: 17.5 });
    T.check('?clima=arcoiris: sale el arcoíris', await b.E(() => window.__dbg.weather.bow === 1 && window.__dbg.skyBow.visible && window.__dbg.skyBow.material.opacity > 0.5));
    T.check('sin errores con arcoíris', !b.errors.length, b.errors.join(' | ') || undefined);
    await b.ctx.close();
  },
};
