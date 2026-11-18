// Arma los íconos de la app (PNG) a partir de icono.svg con el Chrome instalado:  node iconos/hacer.cjs
// Si hay oxipng, además los comprime (sin perder nada).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { launch } = require('../tests/lib.cjs');

const svg = fs.readFileSync(path.join(__dirname, 'icono.svg'), 'utf8');
const ICONS = [
  ['icono-192.png', 192, true], ['icono-512.png', 512, true],         // "any" (escritorio): cuadro redondeado, esquinas transparentes
  ['mascara-192.png', 192, false], ['mascara-512.png', 512, false],   // "maskable" (Android le pone su forma): a todo el cuadro
  ['apple-touch-icon.png', 180, false],                              // iPhone: cuadrado y sin transparencia (lo redondea él)
];

(async () => {
  const browser = await launch();
  for (const [file, n, round] of ICONS) {
    const page = await browser.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
    await page.setContent('<style>html,body{margin:0;background:transparent}div{width:' + n + 'px;height:' + n + 'px;'
      + (round ? 'border-radius:22%;overflow:hidden' : '') + '}svg{display:block;width:100%;height:100%}</style><div>' + svg + '</div>');
    await page.screenshot({ path: path.join(__dirname, file), omitBackground: true });
    await page.close();
  }
  await browser.close();
  const files = ICONS.map(([f]) => path.join(__dirname, f));
  if (!spawnSync('oxipng', ['-o', '4', '--strip', 'safe', ...files], { stdio: 'inherit' }).error) console.log('comprimidos con oxipng');
  for (const f of files) console.log(path.basename(f), fs.statSync(f).size, 'bytes');
})().catch((e) => { console.error(e); process.exit(1); });
