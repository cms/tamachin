// El día y la noche: un día de 24 minutos, el reloj analógico, la luz y el cielo a cada hora, y que la hora se guarde.
const { openGame, sleep, PHONE } = require('./lib.cjs');

const EXPOSE = 'day, setHour, DAY, hemi, sun, SUN_OFF, skyMesh, skyStars, skyMoon, skySun, renderer, scene, camera, pScreen';
// brillo medio de la imagen y de Tamachin (luma de 0 a 255), leyendo lo que se acaba de dibujar
const LUMA = () => {
  const D = window.__dbg; D.renderer.render(D.scene, D.camera);
  const src = D.renderer.domElement, w = 160, h = Math.round(160 * src.height / src.width), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h); const a = g.getImageData(0, 0, w, h).data, L = (i) => 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
  let s = 0; for (let i = 0; i < a.length; i += 4) s += L(i);
  const px = D.pScreen.x / src.clientWidth * w, py = D.pScreen.y / src.clientHeight * h, r = Math.max(2, D.pScreen.r / src.clientWidth * w * 0.6);
  let t = 0, n = 0; for (let y = Math.round(py - r); y <= py + r; y++) for (let x = Math.round(px - r); x <= px + r; x++) if (x >= 0 && y >= 0 && x < w && y < h) { t += L((y * w + x) * 4); n++; }
  return { all: s / (a.length / 4), tama: t / Math.max(1, n) };
};

module.exports = {
  titulo: 'día de 24 minutos, reloj, luz y cielo a cada hora; la hora se guarda',
  async run(T) {
    // una partida nueva, sin ?hora
    const { ctx, page, errors, E } = await openGame(T, { expose: EXPOSE, hora: false });
    const h0 = await E(() => window.__dbg.day.h);
    T.check('una partida nueva empieza a las 8 de la mañana', h0 >= 8 && h0 < 8.1 && /^Reloj\. Son las 8:0\d de la mañana$/.test(await E(() => document.querySelector('#clock').getAttribute('aria-label'))), h0.toFixed(3));
    const r0 = await E(() => [window.__dbg.day.h, performance.now()]); await sleep(4000); const r1 = await E(() => [window.__dbg.day.h, performance.now()]);
    const rate = (r1[0] - r0[0]) / ((r1[1] - r0[1]) / 1000) * 60;   // horas de juego por minuto real
    T.check('una hora de juego dura un minuto', rate > 0.6 && rate < 1.05, rate.toFixed(2) + ' h/min');   // con render por software el reloj va algo lento

    await E(() => window.__dbg.setHour(15.5)); await sleep(200);
    const hands = await E(() => [document.querySelector('#cHour').getAttribute('transform'), document.querySelector('#cMin').getAttribute('transform')]);
    const ang = hands.map((t) => +(/rotate\(([\d.]+)\)/.exec(t) || [0, NaN])[1]);   // el reloj sigue andando mientras se lee
    T.check('a las 3:30 la manecilla corta está entre el 3 y el 4, la larga en el 6', Math.abs(ang[0] - 105) < 0.5 && Math.abs(ang[1] - 180) < 5, hands.join(' '));

    // a mediodía todo queda como antes del ciclo
    const noon = await E(() => { const D = window.__dbg; D.setHour(12); const c = D.skyMesh.geometry.attributes.color, p = D.skyMesh.geometry.attributes.position; let top = 0; for (let i = 1; i < p.count; i++) if (p.getY(i) > p.getY(top)) top = i;
      const L = D.SUN_OFF.length();
      return { hemi: [D.hemi.intensity, D.hemi.color.getHexString(), D.hemi.groundColor.getHexString()], sun: [+D.sun.intensity.toFixed(3), D.sun.color.getHexString()], fog: D.scene.fog.color.getHexString(),
        top: new THREE.Color(c.getX(top), c.getY(top), c.getZ(top)).getHexString(), len: +L.toFixed(1), elev: +(Math.asin(D.SUN_OFF.y / L) * 180 / Math.PI).toFixed(1), x: D.SUN_OFF.x, z: D.SUN_OFF.z,
        stars: D.skyStars[0].material.opacity, moon: D.skyMoon.visible }; });
    T.check('a mediodía, las luces, la niebla y el cielo de siempre', noon.hemi.join() === '0.58,f2f9ff,b6c296' && noon.sun.join() === '0.62,fff1d6' && noon.fog === 'd6f0ff' && noon.top === '3f9ef5', JSON.stringify(noon));
    T.check('a mediodía el sol está al sureste, alto, y no hay estrellas ni luna', noon.x > 0 && noon.z > 0 && noon.elev > 40 && Math.abs(noon.len - 81.07) < 0.1 && noon.stars === 0 && !noon.moon, JSON.stringify(noon));

    // cada cuarto de hora del día: números válidos, la luz nunca rasante, de noche alumbra la luna
    const sweep = await E(() => { const D = window.__dbg, bad = [], ok = (v) => typeof v === 'number' && isFinite(v); let minE = 90, night = 9, maxI = 0;
      for (let h = 0; h <= 24; h += 0.25) { D.setHour(h);
        const vals = [D.hemi.intensity, D.sun.intensity, D.SUN_OFF.x, D.SUN_OFF.y, D.SUN_OFF.z, D.hemi.color.r, D.hemi.color.b, D.sun.color.g, D.scene.fog.color.r, D.skyStars[0].material.opacity, D.skyMoon.position.y, D.skySun.position.y];
        if (!vals.every(ok)) bad.push(h);
        minE = Math.min(minE, Math.asin(D.SUN_OFF.y / D.SUN_OFF.length()) * 180 / Math.PI); maxI = Math.max(maxI, D.sun.intensity);
        if (h >= 22 || h <= 3) night = Math.min(night, D.sun.color.getHex() === 0xdfe6ff ? D.sun.intensity : 0);
        if (h >= 6.5 && h <= 18.5 && (D.skyMoon.visible || D.skyStars[0].material.opacity > 0)) bad.push('luna o estrellas de día a las ' + h);
        if ((h >= 21 || h <= 4) && !D.skyMoon.visible) bad.push('sin luna a las ' + h);
      }
      D.setHour(0); const mid = { stars: D.skyStars[0].material.opacity, moon: D.skyMoon.visible, sunDisc: D.skySun.visible, fog: D.scene.fog.color.getHexString() };
      return { bad, minE: +minE.toFixed(1), night: +night.toFixed(3), maxI: +maxI.toFixed(3), mid }; });
    T.check('las 24 horas dan números válidos; luna y estrellas solo de noche', !sweep.bad.length, sweep.bad.join(' '));
    T.check('la luz nunca baja de 30° (la sombra cabe en su caja)', sweep.minE >= 29.9, sweep.minE + '°');
    T.check('de 10 de la noche a 3 de la mañana alumbra la luna', sweep.night > 0.3 && sweep.maxI <= 0.621, JSON.stringify(sweep));
    T.check('a medianoche: estrellas y luna, sin sol, cielo azul oscuro (no negro)', sweep.mid.stars === 1 && sweep.mid.moon && !sweep.mid.sunDisc && sweep.mid.fog === '34477f', JSON.stringify(sweep.mid));
    T.check('estrellas, luna y sol se dibujan después del cielo y antes que todo, sin profundidad', await E(() => { const D = window.__dbg;
      return [...D.skyStars, D.skyMoon, D.skySun].every((o) => o.parent === D.skyMesh && o.renderOrder > D.skyMesh.renderOrder && o.renderOrder < 0 && !o.material.transparent && !o.material.depthTest && !o.material.depthWrite && o.material.blending === THREE.AdditiveBlending); }));

    // de noche se ve menos, pero se ve: brillo de la imagen y de Tamachin a medianoche contra mediodía
    const rows = [];
    let dimOk = true, tamaOk = true;
    for (const [name, x, z] of [['jardín', 0, 3.5], ['calle', 24, 8], ['bosque', 10, -182], ['casa', 0, -8], ['cima', 2, -770], ['Valle Alegre', 0, -1352]]) {
      await E(([x, z]) => window.__tamachin.go(x, z), [x, z]); await sleep(1800);
      await E(() => window.__dbg.setHour(12)); await sleep(200); const a = await E(LUMA);
      await E(() => window.__dbg.setHour(0)); await sleep(200); const b = await E(LUMA);
      const k = b.all / a.all, kt = b.tama / a.tama; if (k < 0.42) dimOk = false; if (kt < 0.6) tamaOk = false;
      rows.push(name + ' ' + Math.round(k * 100) + '% (Tamachin ' + Math.round(kt * 100) + '%)');
      if (name === 'calle') await page.screenshot({ path: T.out('calle-noche.jpg'), type: 'jpeg', quality: 70 });
    }
    T.info('brillo a medianoche contra mediodía: ' + rows.join(', '));
    T.check('de noche la imagen conserva al menos 42 % del brillo de mediodía (la cima nevada es lo más oscuro)', dimOk, rows.join(', '));
    T.check('y Tamachin al menos 60 % (brilla un poco de noche)', tamaOk, rows.join(', '));

    await E(() => window.__dbg.setHour(23)); await sleep(200); await page.click('#clock'); await sleep(300);
    T.check('tocar el reloj dice la hora y cuándo amanece', (await page.textContent('#toast')) === 'Son las 11:00 de la noche. Amanece a las 5 de la mañana.', await page.textContent('#toast'));
    await E(() => window.__dbg.setHour(13.05)); await sleep(200); await page.click('#clock'); await sleep(300);
    T.check('de día, cuándo oscurece', (await page.textContent('#toast')) === 'Es la 1:03 de la tarde. Oscurece a las 8 de la noche.', await page.textContent('#toast'));

    // se guarda
    await E(() => window.__dbg.setHour(14.25)); await E(() => window.dispatchEvent(new Event('pagehide')));
    await page.reload(); await page.waitForFunction(() => !!window.__dbg); await sleep(800);
    const back = await E(() => window.__dbg.day.h);
    T.check('al recargar sigue a la misma hora', back >= 14.25 && back < 14.3, back.toFixed(3));
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
    await ctx.close();

    // ?hora en la dirección; una partida de antes del ciclo empieza a las 8
    const q = await openGame(T, { expose: EXPOSE, hora: '21:30' });
    const hq = await q.E(() => window.__dbg.day.h);
    T.check('?hora=21:30 empieza a esa hora', hq >= 21.5 && hq < 21.6, hq.toFixed(3));
    await q.ctx.close();
    const old = await openGame(T, { expose: EXPOSE, hora: false, init: () => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tamachin.v1', JSON.stringify({ shape: 'gota', x: 0, z: 3.5 })); } } });
    const ho = await old.E(() => window.__dbg.day.h);
    T.check('una partida de antes del reloj empieza a las 8', ho >= 8 && ho < 8.1, ho.toFixed(3));
    T.check('sin errores con ?hora ni con la partida vieja', !q.errors.length && !old.errors.length, q.errors.concat(old.errors).join(' | ') || undefined);
    await old.ctx.close();

    // en teléfono el reloj va junto a los medidores, sin otra fila
    const ph = await openGame(T, { device: PHONE });
    for (const [x, z] of [[0, 3.5], [2, -700], [0, -1600]]) {
      await ph.E(([x, z]) => window.__tamachin.go(x, z), [x, z]); await sleep(1200);
      const L = await ph.E(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(), c = r('#clock'), n = r('#needs');
        return { zone: document.querySelector('#zone').textContent, same: c.top < n.bottom && c.bottom > n.top && c.left > n.right, inside: c.right <= window.innerWidth - 8, top: Math.round(r('.top').height) }; });
      T.check('en teléfono, el reloj junto a los medidores (' + L.zone + ')', L.same && L.inside && L.top < 170, JSON.stringify(L));
    }
    await ph.page.screenshot({ path: T.out('telefono.jpg'), type: 'jpeg', quality: 70 });
    T.check('sin errores en teléfono', !ph.errors.length, ph.errors.join(' | ') || undefined);
    await ph.ctx.close();
  },
};
