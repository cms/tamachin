// Los pasos: suenan cuando un pie toca el suelo (al caminar, más seguido al correr, más fuerte al caer de un salto) y según lo que
// pisa: pasto, tierra, piedra, madera, nieve, agua, charco, metal (botes e hidrantes), la cama y el polvo de la luna. Se renderizan con un
// OfflineAudioContext (el mismo `footstep` del juego) para medir volumen y brillo.
//   npm test -- pasos --wav   además deja tests/out/pasos-*.wav: cada suelo, y caminar y correr con la música de la ciudad
const fs = require('fs');
const { openGame, sleep } = require('./lib.cjs');

const EXPOSE = 'foot, keys, snd, jump, stepSurface, northSurface, footstep, STEPS, perches, puddles, weather, player, pathX, BR, riverZ, TOWN_Z, PEAKS, forestTrailX, terrainY, NORTH_Z, Z_TOWN_S, makeMusic';

// `plan`: [[segundo, suelo, fuerza, mojado], ...]. Con `music` suena encima esa pieza (y `run` su percusión de correr). Devuelve pico,
// RMS de todo, cuánto dura el primer paso (hasta caer bajo 5 % del pico), su centroide espectral (Hz, por potencia) y, con `wav`, el archivo.
const RENDER = async ({ plan, secs, sr = 44100, music, run, wav }) => {
  const D = window.__dbg, oc = new OfflineAudioContext(2, Math.ceil(secs * sr), sr);
  if (music) { const M = D.makeMusic(oc, oc.destination); M.param.run = !!run; M.zone(music, 0); for (let u = 0; u < secs; u += 0.25) M.pump(u, Math.min(secs, u + 0.45)); }
  for (const [t, kind, v, wet] of plan) D.footstep(oc, oc.destination, t, kind, v == null ? 1 : v, !!wet);
  const buf = await oc.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0, sum = 0, nan = 0;
  for (let i = 0; i < L.length; i++) { const a = L[i], b = R[i]; if (a !== a || b !== b) { nan++; continue; } peak = Math.max(peak, Math.abs(a), Math.abs(b)); sum += a * a + b * b; }
  const i0 = Math.floor(plan[0][0] * sr), i1 = Math.min(L.length, plan.length > 1 ? Math.floor(plan[1][0] * sr) : L.length);
  let p0 = 0, end = i0; for (let i = i0; i < i1; i++) p0 = Math.max(p0, Math.abs(L[i])); for (let i = i0; i < i1; i++) if (Math.abs(L[i]) > p0 * 0.05) end = i;
  const N = 2048;   // centroide del primer paso (ventana de Hann)
  let num = 0, den = 0;
  for (let k = 1; k < N / 2; k++) { let a = 0, b = 0; for (let n = 0; n < N; n++) { const x = (L[i0 + n] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / N)), w = 2 * Math.PI * k * n / N; a += x * Math.cos(w); b -= x * Math.sin(w); } const m = a * a + b * b; num += m * k * sr / N; den += m; }
  let b64 = null;
  if (wav) {
    const n = L.length, ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab), w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++, o += 4) { dv.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const u8 = new Uint8Array(ab); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); b64 = btoa(s);
  }
  return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / (2 * L.length)).toFixed(5), dur: +((end - i0) / sr).toFixed(3), hz: Math.round(num / (den || 1)), nan, b64 };
};
const KINDS = ['pasto', 'tierra', 'piedra', 'madera', 'nieve', 'agua', 'charco', 'metal', 'cama', 'polvo'];
const WALK = 0.25, RUN = 0.195;   // segundos entre pasos: la fase de la animación corre 7 + 5.5 × velocidad (1 caminando, 1.65 corriendo)

module.exports = {
  titulo: 'los pasos: al paso de la animación, según el suelo (pasto, tierra, piedra, madera, nieve, agua, charco, metal, cama, polvo), bajitos',
  async run(T) {
    const { ctx, page, errors, E } = await openGame(T, { expose: EXPOSE });

    // cada suelo, un paso: se oye, debajo de los efectos (saltar llega a 0.06), corto
    const one = {};
    for (const k of KINDS) { one[k] = await E(RENDER, { plan: [[0.05, k]], secs: 0.6 }); T.info(k + ': pico ' + one[k].peak + ', ' + one[k].dur + ' s, ' + one[k].hz + ' Hz'); }
    const bad = KINDS.filter((k) => one[k].nan || one[k].peak < 0.008 || one[k].peak > 0.04 || one[k].dur > 0.15);
    T.check('cada suelo, un paso: se oye, más bajito que un salto, y dura menos de 0.15 s', !bad.length, bad.map((k) => k + ' ' + JSON.stringify({ ...one[k], b64: undefined })).join(' | ') || undefined);
    // en el túnel, el de la piedra con su eco: dos rebotes más bajitos, así dura un poco más
    const tun = await E(RENDER, { plan: [[0.05, 'tunel']], secs: 0.8 });
    T.check('en el túnel suena la piedra con eco: el mismo pico y un poco más largo', !tun.nan && Math.abs(tun.peak - one.piedra.peak) < 0.012 && tun.dur > one.piedra.dur + 0.08 && tun.dur < 0.45, JSON.stringify({ ...tun, b64: undefined, piedra: one.piedra.dur }));
    const hz = (k) => one[k].hz;
    T.check('suenan distinto: la madera es lo más grave y el pasto y la nieve lo más agudo', KINDS.every((k) => k === 'madera' || hz(k) > hz('madera'))
      && ['tierra', 'piedra', 'agua', 'charco', 'metal', 'cama', 'madera', 'polvo'].every((k) => hz(k) < Math.min(hz('pasto'), hz('nieve'))), KINDS.map((k) => k + ' ' + hz(k)).join(', '));
    // cada paso varía un poco (tono y ruido): se comparan ocho seguidos
    const eight = (k, v, w) => E(RENDER, { plan: Array.from({ length: 8 }, (_, i) => [0.05 + i * WALK, k, v, w]), secs: 2.1 });
    const wet = await eight('pasto', 1, true), dry = await eight('pasto', 1, false);
    T.check('con el suelo mojado chapotea: suena más grave, con un poco más de cuerpo', wet.rms > dry.rms * 1.03 && wet.hz < dry.hz * 0.93, JSON.stringify({ wet: { rms: wet.rms, hz: wet.hz }, dry: { rms: dry.rms, hz: dry.hz } }));
    const land = await eight('piedra', 1.35), stone = await eight('piedra', 1);   // como en landStep
    T.check('al caer de un salto suena más fuerte, pero menos que el salto (pico ' + land.peak + ')', land.rms > stone.rms * 1.2 && land.peak < 0.06, JSON.stringify({ land: land.rms, walk: stone.rms }));
    const walk = {};
    for (const k of KINDS) walk[k] = await E(RENDER, { plan: Array.from({ length: 12 }, (_, i) => [0.05 + i * WALK, k, 1]), secs: 3.05 });
    const runR = await E(RENDER, { plan: Array.from({ length: 15 }, (_, i) => [0.05 + i * RUN, 'piedra', 1.2]), secs: 3.05 });
    T.check('caminando o corriendo, muy por debajo de la música (RMS ≈ 0.01)', KINDS.every((k) => walk[k].rms > 0.0005 && walk[k].rms < 0.004) && runR.rms < 0.004,
      KINDS.map((k) => k + ' ' + walk[k].rms).join(', ') + ', corriendo ' + runR.rms);

    if (T.flags.has('--wav')) {
      const seq = []; let t = 0.3; for (const k of KINDS) { for (let i = 0; i < 6; i++) seq.push([t + i * WALK, k, 1]); t += 6 * WALK + 0.6; }
      const files = {
        suelos: { plan: seq, secs: t + 0.5 },
        caminar: { plan: Array.from({ length: 40 }, (_, i) => [2 + i * WALK, i < 20 ? 'piedra' : 'pasto', 1]), secs: 13, music: 'ciudad' },
        correr: { plan: Array.from({ length: 50 }, (_, i) => [2 + i * RUN, 'piedra', 1.2]), secs: 13, music: 'ciudad', run: true },
      };
      for (const f in files) { const r = await E(RENDER, { ...files[f], wav: true }); fs.writeFileSync(T.out(f + '.wav'), Buffer.from(r.b64, 'base64')); T.info('escrito ' + T.out(f + '.wav')); }
    }

    // qué pisa en cada lugar (con Tamachin ahí: dentro de la casa, en el río, encima de algo)
    const SPOTS = [[-12, 8, 'pasto', 'el jardín'], [0, 10, 'tierra', 'el sendero del jardín'], [0, -8, 'madera', 'la casa'], [29.5, 10, 'piedra', 'la banqueta'],
      [8, -38, 'pasto', 'el parque'], [0, -53, 'tierra', 'el sendero del parque'], [0, -29.6, 'tierra', 'el sendero del parque donde cruza la banqueta'], [0, -26, 'piedra', 'la calle frente al parque'], ['camino', -100, 'tierra', 'el camino al bosque'], ['camino+6', -100, 'pasto', 'junto al camino'],
      [0, 'puente', 'madera', 'el puente'], [10, 'rio', 'agua', 'el río'], [12, -178, 'pasto', 'el bosque'], [0, 'pueblo+20', 'piedra', 'la plaza de Valle Alegre'],
      [-8, 'pueblo-40', 'pasto', 'el jardín de la posada'], ['malvavisco', 'malvavisco', 'nieve', 'la cima del Pico Malvavisco'], ['sinfin', -1600, 'tierra', 'el sendero del bosque sin fin'], ['sinfin+8', -1600, 'pasto', 'el bosque sin fin']];
    const where = await E((spots) => {
      const D = window.__dbg, P = D.player, out = [];
      for (const [sx, sz, want, name] of spots) {
        const z = sz === 'puente' ? D.BR.z : sz === 'pueblo+20' ? D.TOWN_Z + 20 : sz === 'pueblo-40' ? D.TOWN_Z - 40 : sz === 'malvavisco' ? D.PEAKS[0].z + 5 : sz === 'rio' ? D.riverZ(10) : sz;
        const x = sx === 'camino' ? D.pathX(z) : sx === 'camino+6' ? D.pathX(z) + 6 : sx === 'malvavisco' ? D.PEAKS[0].x : sx === 'sinfin' ? D.forestTrailX(z) : sx === 'sinfin+8' ? D.forestTrailX(z) + 8 : sx;
        window.__tamachin.go(x, z); window.__tamachin.advance(0.4);
        out.push({ name, want, got: D.stepSurface(P.pos.x, P.pos.z, P.perch), at: [+P.pos.x.toFixed(1), +P.pos.z.toFixed(1)] });
      }
      // en los cerros hay pasto abajo, roca en lo empinado y nieve arriba; y todo lo que se puede pisar encima tiene su sonido
      const n = {}; for (let z = D.NORTH_Z - 10; z > D.Z_TOWN_S + 70; z -= 9) for (let x = -330; x <= 330; x += 9) if (D.terrainY(x, z) > 1) { const k = D.northSurface(x, z); n[k] = (n[k] || 0) + 1; }
      const kinds = {}; for (const p of D.perches) kinds[p.step] = (kinds[p.step] || 0) + 1;
      return { out, hills: n, perches: kinds, allPerch: D.perches.every((p) => !!D.STEPS[p.step]) };
    }, SPOTS);
    const wrong = where.out.filter((o) => o.got !== o.want);
    T.check('pisa lo que se ve: ' + where.out.map((o) => o.name).join(', '), !wrong.length, wrong.map((o) => o.name + ': ' + o.got + ' en vez de ' + o.want + ' en ' + o.at).join(' | ') || undefined);
    const H = where.hills, tot = Object.values(H).reduce((a, b) => a + b, 0);
    T.check('en los cerros: casi todo pasto, algo de roca y nieve en lo alto, y el sendero', H.pasto > tot * 0.5 && H.piedra > tot * 0.02 && H.nieve > 0 && H.tierra > 0, JSON.stringify(H));
    T.check('botes, hidrantes, rocas y la cama: cada cosa en la que se para suena a lo suyo', where.allPerch && where.perches.metal > 10 && where.perches.piedra > 3 && where.perches.cama === 1, JSON.stringify(where.perches));
    await ctx.close();

    // en el juego: un paso cada vez que un pie baja, sin pasos parado ni en el aire; correr da más; caer suena; el fantasma flota
    const g = await openGame(T, { expose: EXPOSE });
    const count = () => g.E(() => { const D = window.__dbg, F = D.foot, c = D.snd.ctx; return { total: F.total, lands: F.lands, played: F.played, last: F.last, audio: c ? c.state + ' ' + c.currentTime.toFixed(2) : null, at: +F.at.toFixed(2), err: F.err ? String(F.err) : null }; });
    const walkFor = (keys, secs) => g.E(([keys, secs]) => { const K = window.__dbg.keys; for (const k of keys) K[k] = true; window.__tamachin.advance(secs); for (const k of keys) K[k] = false; }, [keys, secs]);   // sin cuadros de verdad en medio
    await g.E(() => { window.__tamachin.go(-12, 8); window.__tamachin.advance(0.5); });
    let a = await count(); await walkFor(['KeyD'], 2); let b = await count();
    T.check('caminando 2 s por el pasto: unos 8 pasos', b.total - a.total >= 6 && b.total - a.total <= 10 && b.last === 'pasto', (b.total - a.total) + ' pasos, el último en ' + b.last);
    await g.E(() => window.__tamachin.advance(0.6)); a = await count(); await g.E(() => window.__tamachin.advance(2)); b = await count();
    T.check('parado no da pasos', b.total === a.total, (b.total - a.total) + ' pasos');
    await g.E(() => window.__tamachin.go(-12, 8)); await g.E(() => window.__tamachin.advance(0.5));
    a = await count(); await walkFor(['ShiftLeft', 'KeyD'], 2); b = await count();
    T.check('corriendo 2 s: más pasos (unos 10)', b.total - a.total >= 8 && b.total - a.total <= 12, (b.total - a.total) + ' pasos');
    await g.E(() => window.__tamachin.advance(1)); a = await count();
    await g.E(() => { window.__dbg.jump(); window.__tamachin.advance(1.2); }); b = await count();
    T.check('un salto en su lugar: suena la caída y ningún paso en el aire', b.lands === a.lands + 1 && b.total === a.total + 1, JSON.stringify({ a, b }));
    await g.page.keyboard.press('KeyZ'); await sleep(600);   // el primer toque prende el audio
    a = await count(); await g.page.keyboard.down('KeyA'); await sleep(1500); await g.page.keyboard.up('KeyA'); await sleep(300); b = await count();
    T.check('con el audio prendido, los pasos suenan', b.played - a.played >= 2 && b.played - a.played <= b.total - a.total && !b.err, JSON.stringify({ a, b }));
    await g.E(() => { window.__dbg.player.T.setShape('fantasma'); window.__tamachin.go(-12, 8); window.__tamachin.advance(0.5); });
    a = await count(); await walkFor(['KeyD'], 2); await g.E(() => { window.__dbg.jump(); window.__tamachin.advance(1.2); }); b = await count();
    T.check('el fantasma flota: ni pasos ni caída', b.total === a.total && b.lands === a.lands, JSON.stringify({ a, b }));
    T.check('sin errores', !errors.length && !g.errors.length, errors.concat(g.errors).join(' | ') || undefined);
    await g.ctx.close();

    // con lluvia: en el charco suena a charco
    const r = await openGame(T, { expose: EXPOSE, clima: 'lluvia' });
    await r.E(() => window.__tamachin.cars.length = 0);
    const pd = await r.E(() => { const D = window.__dbg, p = D.puddles.list[0]; window.__tamachin.go(p.x, p.z); window.__tamachin.advance(0.3); return { got: D.stepSurface(D.player.pos.x, D.player.pos.z, D.player.perch), wet: D.weather.wet }; });
    T.check('con lluvia, en un charco: suena a charco', pd.got === 'charco' && pd.wet > 0.3, JSON.stringify(pd));
    T.check('sin errores con lluvia', !r.errors.length, r.errors.join(' | ') || undefined);
    await r.ctx.close();
  },
};
