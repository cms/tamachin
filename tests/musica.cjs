// La música: sigue al lugar (casa, jardín, parque, ciudad, lejos), va al paso del reloj del audio, no se atropella tras una pausa,
// y el botón de sonido pasa por música y efectos → solo efectos → nada, y se guarda. Sin oídos: se renderiza cada mezcla con un
// OfflineAudioContext (el mismo `makeMusic` del juego) y se miden picos y volumen.
//   npm test -- musica --wav   además deja tests/out/musica-*.wav para escucharlas (al volumen del juego)
const fs = require('fs');
const { openGame, sleep } = require('./lib.cjs');

// Renderiza `plan` ([[segundo, lugar], ...]) durante `secs`. Con `sfx`, encima van saltos y "pop" iguales a los del juego, para oír
// el balance. Devuelve pico, volumen (RMS), el segundo más callado, si hubo NaN y, con `wav`, el archivo en base64.
const RENDER = async ({ plan, secs, sr, wav, sfx }) => {
  const oc = new OfflineAudioContext(2, Math.ceil(secs * sr), sr), M = window.__dbg.makeMusic(oc, oc.destination);
  for (let j = 0; j < plan.length; j++) {
    const [t0, key] = plan[j], t1 = j + 1 < plan.length ? plan[j + 1][0] : secs;
    M.zone(key, t0); for (let u = t0; u < t1; u += 0.25) M.pump(u, Math.min(t1, u + 0.45));
  }
  const tone = (f0, f1, dur, type, vol, t) => {   // la misma envolvente que tone() en 01-core.js
    const o = oc.createOscillator(), g = oc.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(oc.destination); o.start(t); o.stop(t + dur + 0.03);
  };
  if (sfx) for (let t = 3, k = 0; t < secs - 1; t += 2.7, k++) {
    if (k % 3 === 2) { tone(523, 523, 0.1, 'triangle', 0.05, t); tone(784, 784, 0.16, 'triangle', 0.05, t + 0.1); } else if (k % 2) tone(680, 1150, 0.1, 'triangle', 0.06, t); else tone(320, 660, 0.16, 'sine', 0.06, t);
  }
  const buf = await oc.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0, sum = 0, cnt = 0, nan = 0, quiet = Infinity;
  for (let i = Math.floor(sr * 1.5); i < L.length; i++) { const a = L[i], b = R[i]; if (a !== a || b !== b) { nan++; continue; } peak = Math.max(peak, Math.abs(a), Math.abs(b)); sum += a * a + b * b; cnt += 2; }
  for (let s = 2; s + 1 <= secs - 1; s++) { let q = 0; for (let i = s * sr; i < (s + 1) * sr; i++) q += L[i] * L[i]; quiet = Math.min(quiet, Math.sqrt(q / sr)); }
  let b64 = null;
  if (wav) {
    const n = L.length, ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab), w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++, o += 4) { dv.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const u8 = new Uint8Array(ab); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); b64 = btoa(s);
  }
  return { peak, rms: Math.sqrt(sum / cnt), quiet, nan, steps: M.steps, b64 };
};

module.exports = {
  titulo: 'música: sigue al lugar, va a tiempo, el botón de sonido tiene tres pasos y se guarda',
  async run(T) {
    const expose = 'getMus: () => mus, getErr: () => musErr, makeMusic, snd';
    const { ctx, page, errors, E } = await openGame(T, { expose });
    const live = () => E(() => {
      const D = window.__dbg, M = D.getMus(), c = D.snd.ctx, name = (pl) => M && Object.keys(M.players).find((k) => M.players[k] === pl);
      return { state: c ? c.state : null, t: c ? c.currentTime : 0, key: M ? M.key : null, cur: M ? name(M.cur) || null : null, steps: M ? M.steps : 0,
        live: M ? Object.keys(M.players).filter((k) => M.players[k].live) : [], ahead: M && M.cur ? M.cur.next - c.currentTime : null, out: M ? M.out.gain.value : 0, err: D.getErr() ? String(D.getErr()) : null };
    });
    const go = async (x, z, ms) => { await E(([x, z]) => window.__tamachin.go(x, z), [x, z]); await sleep(ms || 3000); return live(); };

    let s = await live();
    T.check('sin tocar nada no hay audio (el navegador no lo deja)', s.state === null, JSON.stringify(s));
    await page.keyboard.press('KeyZ'); await sleep(1800); s = await live();
    T.check('al primer toque empieza la música del jardín', s.state === 'running' && s.key === 'jardin' && s.cur === 'ciudad' && s.steps > 0, JSON.stringify(s));
    const a = await live(); await sleep(3000); const b = await live(), sd = 30 / 108, want = (b.t - a.t) / sd;
    T.check('va al paso del reloj del audio (108 por minuto)', Math.abs((b.steps - a.steps) - want) <= 2, (b.steps - a.steps) + ' corcheas, se esperaban ' + want.toFixed(1));
    T.check('y programa solo un poco adelante (0.45 s y a lo más una corchea)', b.ahead > 0 && b.ahead <= 0.45 + sd + 0.02, b.ahead && b.ahead.toFixed(2) + ' s');

    s = await go(-2.8, -10.5, 4500);
    T.check('en la casa, la caja de música (y la del jardín ya no suena)', s.key === 'casa' && s.cur === 'casa' && s.live.join() === 'casa', JSON.stringify(s));
    for (const [x, z, k] of [[24, 30, 'ciudad'], [5, -40, 'parque'], [8, -180, 'lejos'], [0, 3.5, 'jardin']]) {
      s = await go(x, z);
      T.check('en ' + k + ': mezcla ' + k + ' de la misma pieza', s.key === k && s.cur === 'ciudad', JSON.stringify(s));
    }
    // asomarse a la puerta (entrar y salir rápido) no cambia la música
    await E(() => window.__tamachin.go(-2.8, -10.5)); await sleep(250); s = await go(0, 3.5, 1500);
    T.check('entrar y salir enseguida no la cambia', s.key === 'jardin' && s.cur === 'ciudad' && s.live.join() === 'ciudad', JSON.stringify(s));

    // el botón: música y efectos → solo efectos → nada → otra vez todo
    const label = () => page.textContent('#bSound');
    await page.click('#bSound'); await sleep(1000); const e1 = await live(); await sleep(1000); const e2 = await live();
    T.check('Solo efectos: la música se apaga y el audio sigue', (await label()) === 'Solo efectos' && e2.cur === null && e2.out < 0.01 && e2.steps === e1.steps && e2.state === 'running', JSON.stringify(e2));
    await page.click('#bSound'); await sleep(900); s = await live();
    T.check('Sonido: no: el audio se suspende', (await label()) === 'Sonido: no' && s.state === 'suspended', JSON.stringify(s));
    await page.click('#bSound'); await sleep(1800); s = await live();
    T.check('Sonido: sí: vuelve la música', (await label()) === 'Sonido: sí' && s.state === 'running' && s.key === 'jardin' && s.out > 0.5, JSON.stringify(s));

    await page.click('#bSound'); await E(() => window.dispatchEvent(new Event('pagehide')));
    await page.reload(); await page.waitForFunction(() => !!window.__tamachin); await sleep(1200);
    await page.keyboard.press('KeyZ'); await sleep(1500); s = await live();
    T.check('Solo efectos se guarda: al volver no hay música', (await label()) === 'Solo efectos' && s.state === 'running' && s.cur === null && s.steps === 0, JSON.stringify(s));
    T.check('nada falló en la música', !s.err, s.err || undefined);

    // lo atrasado se salta: tras 10 s sin programar (pestaña oculta) no suenan de golpe las 36 corcheas perdidas
    const skip = await E(() => { const oc = new OfflineAudioContext(2, 22050 * 12, 22050), M = window.__dbg.makeMusic(oc, oc.destination);
      M.zone('ciudad', 0); M.pump(0, 0.45); const n1 = M.steps; M.pump(10, 10.45); return [n1, M.steps - n1]; });
    T.check('después de una pausa sigue desde ahora, sin amontonar notas', skip[1] <= 3, skip[0] + ' y luego ' + skip[1] + ' corcheas');

    // cada mezcla, renderizada: ni muda, ni saturada, ni con huecos; los efectos del juego llegan a 0.06
    const ZONES = [['casa', 80], ['ciudad', 72], ['jardin', 24], ['parque', 24], ['lejos', 24]];
    for (const [k, secs] of ZONES) {
      const r = await E(RENDER, { plan: [[0, k]], secs, sr: 22050 });
      T.info(k + ': pico ' + r.peak.toFixed(3) + ', RMS ' + r.rms.toFixed(4) + ', el segundo más callado ' + r.quiet.toFixed(4));
      // un efecto suena con RMS de unos 0.04 mientras dura: la música va unos 10 dB abajo; los picos son ataques que coinciden
      T.check(k + ': suena, por debajo de los efectos, sin saturar ni huecos', !r.nan && r.peak < 0.15 && r.rms > 0.005 && r.rms < 0.02 && r.quiet > 0.001, JSON.stringify({ ...r, b64: undefined }));
    }
    if (T.flags.has('--wav')) {
      const files = { casa: { plan: [[0, 'casa']], secs: 80 }, ciudad: { plan: [[0, 'ciudad']], secs: 72 }, 'jardin-con-efectos': { plan: [[0, 'jardin']], secs: 40, sfx: true },
        recorrido: { plan: [[0, 'jardin'], [12, 'ciudad'], [24, 'parque'], [34, 'casa'], [52, 'jardin']], secs: 64 } };
      for (const f in files) { const r = await E(RENDER, { ...files[f], sr: 44100, wav: true }); fs.writeFileSync(T.out(f + '.wav'), Buffer.from(r.b64, 'base64')); T.info('escrito ' + T.out(f + '.wav')); }
    }
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
    await ctx.close();

    // una partida guardada de antes (sound: false) queda sin sonido
    const old = await openGame(T, { init: () => localStorage.setItem('tamachin.v1', JSON.stringify({ sound: false })) });
    T.check('una partida vieja con el sonido apagado sigue sin sonido', (await old.page.textContent('#bSound')) === 'Sonido: no');
    await old.ctx.close();
  },
};
