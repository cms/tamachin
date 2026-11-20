// Pruebas del juego en Chrome sin interfaz.
//   npm test                       todas menos las largas
//   npm test -- vista controles    solo esas
//   npm run test:largo             también la caminata de 4 minutos al bosque sin fin
//   npm test -- mundo --actualizar acepta el mundo actual como referencia (tests/mundo.json)
//   npm test -- --paralelo=1       uno por uno (por omisión van 3 a la vez; los que llevan `solo: true` siempre van solos, al final)
// Necesita el Chrome instalado y red (Three.js viene de cdnjs). Las capturas quedan en tests/out/.
const fs = require('fs');
const path = require('path');
const { OUT, serve, launch } = require('./lib.cjs');

const SUITES = ['arranque', 'mundo', 'guardado', 'cuidados', 'vista', 'controles', 'saltos', 'musica', 'dia', 'clima', 'pasos', 'trafico', 'pwa', 'luna', 'carretera', 'caminata'];

(async () => {
  const args = process.argv.slice(2), flags = new Set(args.filter((a) => a.startsWith('--'))), names = args.filter((a) => !a.startsWith('--'));
  const pick = SUITES.map((n) => ({ n, s: require('./' + n + '.cjs') })).filter(({ n, s }) => names.length ? names.includes(n) : !s.largo || flags.has('--largo'));
  if (!pick.length) { console.log('No hay pruebas con ese nombre. Hay: ' + SUITES.join(', ')); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const T0 = Date.now(), { server, url } = await serve(), browser = await launch();
  let fails = 0, total = 0;
  // Cada grupo junta lo que dice y lo imprime al terminar (así no se enciman). Varios corren a la vez (--paralelo=N, 3 por omisión);
  // los que dependen del tiempo real (caminar con la palanca, el audio en vivo) corren después, solos.
  const runOne = async ({ n, s }) => {
    const t0 = Date.now(), lines = ['\n' + n + ' — ' + s.titulo];
    const T = {
      browser, url, flags, out: (f) => path.join(OUT, n + '-' + f),
      check(name, ok, detail) { total++; if (!ok) fails++; lines.push('  ' + (ok ? 'ok   ' : 'FALLA') + ' ' + name + (detail !== undefined ? '  (' + detail + ')' : '')); },
      info(...a) { lines.push('       ' + a.join(' ')); },
    };
    try { await s.run(T); } catch (e) { fails++; total++; lines.push('  FALLA la prueba se detuvo: ' + (e && e.stack || e)); }
    lines.push('  ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s'); console.log(lines.join('\n'));
  };
  const par = Math.max(1, +((args.find((a) => a.startsWith('--paralelo=')) || '').split('=')[1] || 3));
  const together = pick.filter(({ s }) => !s.solo), alone = pick.filter(({ s }) => s.solo), queue = together.slice();
  await Promise.all(Array.from({ length: Math.min(par, queue.length) }, async () => { while (queue.length) await runOne(queue.shift()); }));
  for (const p of alone) await runOne(p);
  await browser.close(); server.close();
  console.log('\n' + (fails ? fails + ' de ' + total + ' revisiones fallaron' : 'Las ' + total + ' revisiones pasaron') + ' (' + Math.round((Date.now() - T0) / 1000) + ' s en total)');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
