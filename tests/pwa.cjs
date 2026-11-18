// La app instalable: manifiesto e íconos, la copia para jugar sin internet (sw.js) y, en iPhone, nada bajo la muesca ni la rayita.
const fs = require('fs');
const path = require('path');
const { REPO, openGame, PHONE, sleep } = require('./lib.cjs');

const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const INDEX = read('index.html'), GAME = read('game.js');
const CACHE = /const CACHE = '([^']+)'/.exec(read('sw.js'))[1];
const OUTSIDE = [...INDEX.matchAll(/<script src="(https:[^"]+)"/g), ...INDEX.matchAll(/<link href="(https:[^"]+)" rel="stylesheet"/g)].map((m) => m[1]);
const BUILD = /"command":\s*"([^"]+)"/.exec(read('wrangler.jsonc'))[1];

async function until(f, ms) { const t0 = Date.now(); let v; while (!(v = await f()) && Date.now() - t0 < ms) await sleep(250); return v; }

module.exports = {
  titulo: 'se instala como app, abre sin internet y en iPhone nada queda bajo la muesca',
  async run(T) {
    const isRoot = (u) => u.origin + '/' === T.url && u.pathname === '/';
    const withMark = (n) => INDEX.replace('<head>', '<head><meta name="prueba" content="' + n + '">');
    {
      const { ctx, errors, E } = await openGame(T, { device: PHONE });
      const m = await E(async () => {
        const url = document.querySelector('link[rel=manifest]').href, man = await (await fetch(url)).json();
        const load = (src) => new Promise((ok) => {
          const im = new Image();
          im.onload = () => {
            const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
            let clear = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) clear++;
            ok({ w: im.naturalWidth, h: im.naturalHeight, clear });
          };
          im.onerror = () => ok(null); im.src = src;
        });
        const icons = []; for (const ic of man.icons || []) icons.push({ sizes: ic.sizes, purpose: ic.purpose || 'any', src: ic.src, got: await load(new URL(ic.src, url).href) });
        const meta = (n) => (document.querySelector('meta[name="' + n + '"]') || {}).content;
        const apple = document.querySelector('link[rel=apple-touch-icon]');
        return { man, icons, start: new URL(man.start_url, url).href, scope: new URL(man.scope, url).href, root: location.origin + '/',
          apple: apple && { src: apple.getAttribute('href'), got: await load(apple.href) }, viewport: meta('viewport'), theme: meta('theme-color'),
          bar: meta('apple-mobile-web-app-status-bar-style'), capable: meta('apple-mobile-web-app-capable'), title: meta('apple-mobile-web-app-title') };
      });
      const man = m.man;
      T.check('manifiesto: nombre, español, sin barras del navegador, colores del juego', man.name === 'Tamachin' && man.short_name && man.short_name.length <= 12
        && man.lang === 'es' && man.display === 'standalone' && man.background_color === '#d6f0ff' && man.theme_color === m.theme && m.title === 'Tamachin', JSON.stringify(man).slice(0, 300));
      T.check('se abre en el inicio del juego', m.start === m.root && m.scope === m.root, m.start + ' ' + m.scope);
      const size = (ic) => ic.got && ic.sizes === ic.got.w + 'x' + ic.got.h;
      const has = (p, s) => m.icons.some((ic) => ic.purpose === p && ic.sizes === s && size(ic));
      T.check('íconos de 192 y 512, del tamaño que dicen', m.icons.length && m.icons.every(size) && has('any', '192x192') && has('any', '512x512'), JSON.stringify(m.icons.map((i) => [i.src, i.got])));
      T.check('ícono para Android (maskable): a todo el cuadro, sin transparencia', has('maskable', '512x512') && m.icons.filter((i) => i.purpose === 'maskable').every((i) => i.got.clear === 0));
      T.check('ícono de iPhone: 180×180, sin transparencia (la pondría negra)', m.apple && m.apple.got && m.apple.got.w === 180 && m.apple.got.h === 180 && m.apple.got.clear === 0, JSON.stringify(m.apple));
      T.check('en iPhone ocupa toda la pantalla (viewport-fit=cover, barra de estado translúcida)', /viewport-fit=cover/.test(m.viewport) && m.bar === 'black-translucent' && m.capable === 'yes');
      // lo que se publica (wrangler.jsonc) lleva todo lo de la app
      const files = ['manifest.webmanifest', 'sw.js', m.apple.src, ...m.icons.map((i) => i.src)];
      const missing = files.filter((f) => !BUILD.includes(f) && !BUILD.includes(path.dirname(f) + '/*' + path.extname(f)));
      T.check('al publicar se copian el manifiesto, sw.js y los íconos', !missing.length, missing.join(', ') || undefined);
      T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
      await ctx.close();
    }
    {
      const { ctx, page, errors, E } = await openGame(T, { sw: true, device: PHONE });
      // sin la caché del navegador (también la de memoria, que guarda las fuentes al recargar): lo que llega sin red es de la copia
      const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      // sin red de verdad: `setOffline` no corta lo que contestan las rutas de lib.cjs (Three.js y las fuentes salen de tests/.cache)
      const OUTSIDE_RE = /^https:\/\/(cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com)\//, cut = (rt) => rt.abort('internetdisconnected');
      const offline = async (on) => { await ctx.setOffline(on); if (on) await ctx.route(OUTSIDE_RE, cut); else await ctx.unroute(OUTSIDE_RE, cut); };
      const keys = () => E((name) => caches.open(name).then((c) => c.keys()).then((ks) => ks.map((r) => r.url)), CACHE);
      const copyOf = (f) => E(([name, u]) => caches.open(name).then((c) => c.match(u)).then((r) => (r ? r.text() : '')), [CACHE, T.url + f]);
      const want = [T.url, T.url + 'game.js', T.url + 'manifest.webmanifest', ...OUTSIDE];
      const fontsLoaded = () => E(() => [...document.fonts].some((f) => /Bagel/.test(f.family) && f.status === 'loaded'));
      const fonts = await fontsLoaded();
      let got = [];
      await until(async () => (got = await keys()) && want.every((u) => got.includes(u)) && (!fonts || got.some((u) => u.startsWith('https://fonts.gstatic.com/')))
        && await E(() => !!navigator.serviceWorker.controller), 20000);
      const miss = want.filter((u) => !got.includes(u));
      T.check('la primera visita deja la copia lista: página, game.js, manifiesto, Three.js y la hoja de las fuentes', !miss.length, miss.join(', ') || undefined);
      if (fonts) T.check('… y los archivos de las fuentes (la hoja lleva crossorigin: si no, Chrome no dice cuáles usó)', got.some((u) => u.startsWith('https://fonts.gstatic.com/')));
      else T.info('las fuentes de Google no cargaron (sin red ni copia en tests/.cache): no se revisa que se guarden');
      T.check('lo demás (og.jpg, los íconos) no se guarda', !got.some((u) => /\.(jpg|png)$/.test(u)));

      const reload = async () => {
        errors.length = 0; const t0 = Date.now();
        await page.reload({ waitUntil: 'commit' }).catch(() => {}); const ms = Date.now() - t0;
        await page.waitForFunction(() => !!window.__tamachin, null, { timeout: 30000 }); await sleep(600);
        return { ms, ...await E(() => ({ online: navigator.onLine, zone: document.querySelector('#zone').textContent, three: typeof THREE, q: location.search,
          mark: (document.querySelector('meta[name=prueba]') || {}).content || null, ver: window.__ver || null })) };
      };
      await offline(true);
      let r = await reload();
      T.check('sin internet abre igual, en la misma dirección (?hora=…)', !r.online && r.zone === 'Jardín de casa' && r.three === 'object' && /hora=12/.test(r.q) && !errors.length, JSON.stringify(r) + ' ' + errors.join(' | '));
      if (fonts) T.check('sin internet, con sus fuentes', await fontsLoaded());
      await E(() => window.__tamachin.advance(2));
      T.check('y se puede jugar', await E(() => window.__tamachin.day.h > 12) && !errors.length, errors.join(' | ') || undefined);
      await page.screenshot({ path: T.out('sin-internet.jpg'), type: 'jpeg', quality: 70 });

      // en línea: la red primero (un envío nuevo se ve al recargar), y la copia se pone al día entera
      await offline(false);
      const v2 = (rt) => rt.fulfill({ body: withMark(2), contentType: 'text/html; charset=utf-8' });
      await ctx.route(isRoot, v2);
      r = await reload();
      T.check('en línea llega lo último que se publicó (la red primero, no la copia)', r.mark === '2', JSON.stringify(r));
      T.check('y la copia se pone al día', !!await until(async () => (await copyOf('')).includes('name="prueba" content="2"'), 15000));

      // la red tarda: a los 4 s sale la copia, y TODO lo de esa página sale de ahí (la página de la copia con el game.js nuevo se rompería)
      await ctx.unroute(isRoot, v2);
      const v3 = async (rt) => { await sleep(8000); await rt.fulfill({ body: withMark(3), contentType: 'text/html; charset=utf-8' }).catch(() => {}); };
      await ctx.route(isRoot, v3);
      await ctx.route('**/game.js', (rt) => rt.fulfill({ body: GAME + '\nwindow.__ver = 3;\n', contentType: 'application/javascript' }));
      r = await reload();
      T.check('si la red tarda, a los 4 s sale la copia', r.ms > 3500 && r.ms < 7500 && r.mark === '2', r.ms + ' ms, ' + JSON.stringify(r));
      T.check('y game.js también de la copia: los dos del mismo envío', r.ver === null && !errors.length, JSON.stringify(r) + ' ' + errors.join(' | '));
      const fresh = await until(async () => (await copyOf('')).includes('content="3"') && (await copyOf('game.js')).includes('__ver = 3'), 25000);
      await offline(true);
      r = await reload();
      T.check('cuando la red contesta, la copia nueva queda completa: página y game.js juntos', fresh && r.mark === '3' && r.ver === 3, JSON.stringify(r));
      await ctx.close();
    }
    {
      // iPhone: la muesca y la barra de estado arriba (de pie) o a los lados (acostado), y la rayita de abajo. Chrome no las tiene:
      // se simulan con las variables --sa-* (las que usa el CSS en vez de env() directo)
      const inset = (css) => (page) => page.route(isRoot, (rt) => rt.fulfill({ body: INDEX.replace('</head>', '<style>:root{' + css + '}</style></head>'), contentType: 'text/html; charset=utf-8' }));
      const box = () => E(() => {
        const b = (s) => document.querySelector(s).getBoundingClientRect(), W = innerWidth, H = innerHeight;
        return { W, H, top: Math.min(b('.brand').top, b('#needs').top, b('#clock').top, b('.tools').top), left: Math.min(b('.brand').left, b('#needs').left),
          right: W - Math.max(b('.tools').right, b('#clock').right), hud: b('.top').bottom, help: b('#help').top,
          joy: { l: b('#joy').left, b: H - b('#joy').bottom }, btn: { r: W - b('.tbtns').right, b: H - b('.tbtns').bottom },
          shade: parseFloat(getComputedStyle(document.querySelector('#app'), '::after').height) || 0, sw: document.documentElement.scrollWidth - W };
      });
      let { ctx, page, errors, E } = await openGame(T, { device: PHONE, help: true, expose: 'camera, player, pScreen', before: inset('--sa-t:47px;--sa-b:34px') });
      let b = await box();
      T.check('iPhone de pie: la barra de arriba empieza bajo la hora y la batería', b.top >= 47 + 8 && b.help >= b.hud, JSON.stringify(b));
      T.check('la palanca y los botones, arriba de la rayita de abajo', b.joy.b >= 34 + 20 && b.btn.b >= 34 + 20, JSON.stringify([b.joy, b.btn]));
      T.check('detrás de la hora y la batería, una sombra del alto de la barra de estado (si no, en blanco sobre el cielo no se leen)', Math.abs(b.shade - 47) < 0.5, b.shade);
      await page.tap('#helpOk'); await page.tap('#bDiary'); await sleep(400);
      const d = await E(() => innerHeight - document.querySelector('#diary').getBoundingClientRect().bottom);
      T.check('el diario, arriba de la rayita', d >= 34 + 6, d);
      await page.screenshot({ path: T.out('muesca-de-pie.jpg'), type: 'jpeg', quality: 70 });
      // Personalizar: con la barra más alta y el panel más arriba, el hueco entre los dos es más chico; Tamachin debe caber entero
      await page.tap('#dClose'); await sleep(300); await page.tap('#bCustom'); await sleep(1500);
      const c = await E(() => ({ y: window.__dbg.pScreen.y, r: window.__dbg.pScreen.r, top: document.querySelector('.top').getBoundingClientRect().bottom,
        panel: document.querySelector('#panel').getBoundingClientRect().top }));
      T.check('Personalizar de pie: Tamachin entero entre la barra y el panel', c.y - c.r > c.top && c.y + c.r < c.panel, JSON.stringify(c));
      await page.screenshot({ path: T.out('muesca-personalizar.jpg'), type: 'jpeg', quality: 70 });
      T.check('sin errores (de pie)', !errors.length, errors.join(' | ') || undefined);
      await ctx.close();
      ({ ctx, page, errors, E } = await openGame(T, { device: { ...PHONE, viewport: { width: 844, height: 390 } }, before: inset('--sa-l:47px;--sa-r:47px;--sa-b:21px') }));
      b = await box();
      T.check('iPhone acostado: nada bajo la muesca, de ningún lado', b.left >= 47 + 10 && b.right >= 47 + 10 && b.joy.l >= 47 + 16 && b.btn.r >= 47 + 14 && b.sw <= 0, JSON.stringify(b));
      T.check('acostado, la palanca y los botones arriba de la rayita, y sin sombra arriba (no hay barra de estado)', b.joy.b >= 21 + 20 && b.btn.b >= 21 + 20 && b.shade === 0, JSON.stringify(b));
      await page.screenshot({ path: T.out('muesca-acostado.jpg'), type: 'jpeg', quality: 70 });
      T.check('sin errores (acostado)', !errors.length, errors.join(' | ') || undefined);
      await ctx.close();
    }
  },
};
