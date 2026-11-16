// Pruebas del juego en Chrome sin interfaz.
//   npm test                       todas menos las largas
//   npm test -- vista controles    solo esas
//   npm run test:largo             también la caminata de 4 minutos al bosque sin fin
//   npm test -- mundo --actualizar acepta el mundo actual como referencia (tests/mundo.json)
// Necesita el Chrome instalado y red (Three.js viene de cdnjs). Las capturas quedan en tests/out/.
const fs = require('fs');
const path = require('path');
const { OUT, serve, launch } = require('./lib.cjs');

const SUITES = ['arranque', 'mundo', 'guardado', 'cuidados', 'vista', 'controles', 'saltos', 'musica', 'dia', 'caminata'];

(async () => {
  const args = process.argv.slice(2), flags = new Set(args.filter((a) => a.startsWith('--'))), names = args.filter((a) => !a.startsWith('--'));
  const pick = SUITES.map((n) => ({ n, s: require('./' + n + '.cjs') })).filter(({ n, s }) => names.length ? names.includes(n) : !s.largo || flags.has('--largo'));
  if (!pick.length) { console.log('No hay pruebas con ese nombre. Hay: ' + SUITES.join(', ')); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const { server, url } = await serve(), browser = await launch();
  let fails = 0, total = 0;
  for (const { n, s } of pick) {
    const t0 = Date.now(); console.log('\n' + n + ' — ' + s.titulo);
    const T = {
      browser, url, flags, out: (f) => path.join(OUT, n + '-' + f),
      check(name, ok, detail) { total++; if (!ok) fails++; console.log('  ' + (ok ? 'ok   ' : 'FALLA') + ' ' + name + (detail !== undefined ? '  (' + detail + ')' : '')); },
      info(...a) { console.log('       ' + a.join(' ')); },
    };
    try { await s.run(T); } catch (e) { fails++; total++; console.log('  FALLA la prueba se detuvo: ' + (e && e.stack || e)); }
    console.log('  ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  }
  await browser.close(); server.close();
  console.log('\n' + (fails ? fails + ' de ' + total + ' revisiones fallaron' : 'Las ' + total + ' revisiones pasaron'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
