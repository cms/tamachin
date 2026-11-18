// La app instalable: manifiesto e íconos, la copia para jugar sin internet (sw.js), la versión nueva que se pone sola y, en iPhone,
// nada bajo la muesca ni la rayita.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { REPO, serve, openGame, PHONE, sleep } = require('./lib.cjs');
const { publicar, version, META, SWV } = require('../publicar.cjs');

const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const INDEX = read('index.html'), GAME = read('game.js'), SW = read('sw.js');
const CACHE = /const CACHE = '([^']+)'/.exec(SW)[1];
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
      // lo que se publica (publicar.cjs, que llama wrangler.jsonc) lleva todo lo de la app, con la versión puesta
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tamachin-')), out = path.join(tmp, 'dist'), src = path.join(tmp, 'src');
      try {
        const v = publicar({ origen: REPO, salida: out, ahora: Date.UTC(2026, 10, 18, 10, 0, 0) }), pub = (f) => fs.readFileSync(path.join(out, f), 'utf8');
        const files = ['index.html', 'game.js', 'og.jpg', 'manifest.webmanifest', 'sw.js', m.apple.src, ...m.icons.map((i) => i.src)];
        const missing = files.filter((f) => !fs.existsSync(path.join(out, f)));
        T.check('al publicar (wrangler.jsonc llama a publicar.cjs) van la página, game.js, el manifiesto, sw.js y los íconos', /node publicar\.cjs/.test(BUILD) && !missing.length, missing.join(', ') || BUILD);
        T.check('… con la misma versión en la página y en sw.js (en el repo, "dev")', /^[0-9a-f]{10} 2026-11-18T10:00:00Z$/.test(v) && pub('index.html').includes('<meta name="version" content="' + v + '">')
          && pub('sw.js').includes("const VERSION = '" + v + "';") && INDEX.includes(META) && SW.includes(SWV), v);
        // el resumen sale de lo publicado del juego: igual si nada cambia (aunque se publique a otra hora), otro si cambia game.js
        fs.mkdirSync(src); for (const f of ['index.html', 'game.js', 'manifest.webmanifest']) fs.copyFileSync(path.join(REPO, f), path.join(src, f));
        const h0 = version(src, 0).split(' ')[0], h0b = version(src, 9e11).split(' ')[0];
        fs.appendFileSync(path.join(src, 'game.js'), '\n// otro envío\n'); const h1 = version(src, 0).split(' ')[0];
        T.check('la versión cambia si cambia el juego, y no si se vuelve a publicar lo mismo', v.startsWith(h0) && h0 === h0b && h1 !== h0, [h0, h0b, h1].join(' '));
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
      T.check('en local (sin publicar) el diario dice que es la versión local, y no se busca otra', await E(() => document.querySelector('#dVer').textContent) === 'Versión local (sin publicar)');
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
      // Versión nueva. Un servidor propio (otro puerto: otro origen, con su propio service worker) contesta como si se hubiera publicado
      // otra vez: la página y sw.js con la versión `pub.n` (`pub.page` deja la página en otra) y game.js con una marca. Con rutas no se
      // puede: la revisión de sw.js que hace el navegador (`update()`) va directo al servidor.
      const pub = { n: 1, page: null, swDown: false };   // swDown: sw.js contesta con error (la página sí llega)
      const ver = (n) => String(n).repeat(10) + ' ' + new Date(Date.UTC(2026, 10, 18, 8 + n)).toISOString().slice(0, 19) + 'Z';
      const own = await serve((f) => f === 'index.html' ? INDEX.replace(META, '<meta name="version" content="' + ver(pub.page || pub.n) + '">')
        : f === 'sw.js' ? (pub.swDown ? { status: 503 } : SW.replace(SWV, "const VERSION = '" + ver(pub.n) + "';"))
        : f === 'game.js' ? GAME.replace('window.__tamachin = {', 'window.__dbg = { creatures, player };\nwindow.__tamachin = {') + '\nwindow.__ver = ' + pub.n + ';\n' : null);
      const { ctx, page, errors, E } = await openGame({ ...T, url: own.url }, { sw: true, device: PHONE });
      try {
        const st = () => E(() => ({ ver: window.__ver || null, mine: (document.querySelector('meta[name=version]') || {}).content || null,
          ready: !document.querySelector('#dNew').hidden, line: document.querySelector('#dVer').textContent, toast: document.querySelector('#toast').textContent,
          cover: !document.querySelector('#updating').hidden, said: [...document.querySelectorAll('.bubble.on')].map((b) => b.textContent).join(' | ') }));
        // la app se va al fondo y vuelve (Chrome sin interfaz no la oculta de verdad: se cambia document.hidden y se avisa)
        const away = () => E(() => {
          const set = (h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); };
          set(true); set(false);
        });
        const reloaded = async (fn) => { const ld = page.waitForEvent('load', { timeout: 20000 }); await fn(); await ld; await page.waitForFunction(() => !!window.__tamachin, null, { timeout: 30000 }); await sleep(800); };
        const copyOf = (f) => E(([name, u]) => caches.open(name).then((c) => c.match(u)).then((r) => (r ? r.text() : '')), [CACHE, own.url + f]);
        await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
        let s = await st();
        T.check('el diario dice la versión: sus primeras letras y cuándo se publicó', s.line.startsWith('Versión 111111 · ') && s.ver === 1, s.line);

        // se publica otra: al volver al juego se revisa y se baja entera, sin recargar a medio juego
        pub.n = 2; await away();
        const ready = await until(async () => (s = await st()).ready, 15000);
        T.check('al volver al juego, la versión nueva se baja sola y avisa, sin recargar todavía', ready && s.ver === 1 && !s.cover && /versión nueva/.test(s.toast), JSON.stringify(s));
        T.check('… y ya está en la copia, completa', (await copyOf('')).includes(ver(2)) && (await copyOf('game.js')).includes('__ver = 2'));
        await page.tap('#bDiary'); await sleep(500); await page.screenshot({ path: T.out('version-nueva.jpg'), type: 'jpeg', quality: 70 });
        // con un panel abierto (el diario, Personalizar) no es buen momento: espera
        await away(); await sleep(1200); s = await st();
        T.check('con el diario abierto no se recarga', s.ver === 1 && !s.cover, JSON.stringify(s));
        await page.tap('#dClose'); await E(() => window.__tamachin.togglePanel(true)); await sleep(300);
        await away(); await sleep(1200); s = await st();
        T.check('con Personalizar abierto tampoco', s.ver === 1 && !s.cover, JSON.stringify(s));
        await E(() => window.__tamachin.togglePanel(false)); await sleep(300);
        // nada a medias que se perdería: el conejo siguiéndolo (pegado a él, para que no se quede atrás), o una secuencia (el refri, las bayas)
        await E(() => { const P = window.__dbg.player, r = window.__dbg.creatures.find((c) => c.kind === 'conejo'); r.pos.set(P.pos.x + 1.5, 0, P.pos.z); r.follow = 30; window.__stay = true; });
        await away(); await sleep(1200);
        const rabbit = await E(() => window.__stay === true && window.__dbg.creatures.find((c) => c.kind === 'conejo').follow > 0);
        await E(() => { window.__dbg.creatures.find((c) => c.kind === 'conejo').follow = 0; const P = window.__dbg.player; P.state = 'busy'; P.busy = { dur: 999, t: 0, fired: {}, update() {} }; });
        await away(); await sleep(1200);
        const busy = await E(() => window.__stay === true);
        await E(() => { const P = window.__dbg.player; P.busy = null; P.state = 'normal'; });
        T.check('con el conejo siguiéndolo, o a media secuencia, tampoco', rabbit && busy && (await st()).ver === 1, JSON.stringify({ rabbit, busy }));

        // la siguiente vez que vuelve, en buen momento: se recarga en la nueva y sigue donde estaba
        await E(() => { window.__tamachin.go(2, 6); window.__tamachin.advance(0.5); });
        await reloaded(away);
        s = await st(); const at = await E(() => [window.__tamachin.player.pos.x, window.__tamachin.player.pos.z]);
        T.check('al volver otra vez se recarga en la versión nueva, donde estaba Tamachin', s.ver === 2 && s.mine === ver(2) && Math.hypot(at[0] - 2, at[1] - 6) < 0.5, JSON.stringify({ ...s, at }));
        T.check('… Tamachin dice que se actualizó, y el diario dice la versión nueva', /actualicé/.test(s.said) && s.line.startsWith('Versión 222222 · ') && !s.ready, JSON.stringify(s));

        // la página llega por la red más nueva que el service worker (se publicó, pero la revisión de sw.js falló: aquí contesta 503):
        // el que manda es más viejo que la página, y eso no es "versión nueva"; tampoco al volver al juego, ni cuando por fin llega el nuevo
        const swVer = () => E(() => new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => ok(e.data); navigator.serviceWorker.controller.postMessage({ type: 'version' }, [ch.port2]); }));
        pub.n = 3; pub.swDown = true; await E(() => { document.querySelector('#toast').textContent = ''; sessionStorage.removeItem('tamachin-tried'); });   // que no la tape "ya se intentó"
        await reloaded(() => page.reload()); await E(() => { window.__stay = true; }); await away(); await sleep(1500);
        const older = await swVer(); s = await st();
        const mid = !s.ready && !/versión nueva/.test(s.toast);
        pub.swDown = false; await away(); await until(async () => await swVer() === ver(3), 15000); await sleep(1000); s = await st();
        const stayed = await E(() => window.__stay === true);   // y sin recargar en medio
        T.check('si la página llega más nueva que el service worker, no avisa nada (ni con el viejo mandando, ni cuando llega el nuevo)',
          older === ver(2) && mid && stayed && s.ver === 3 && !s.ready && !/versión nueva/.test(s.toast), JSON.stringify({ older, mid, stayed, ...s }));
        for (let i = errors.length - 1; i >= 0; i--) if (/503 .*sw\.js/.test(errors[i])) errors.splice(i, 1);   // ese error es a propósito

        // «Actualizar ahora» en el diario: sin esperar a volver al juego
        pub.n = 4; await away(); await until(async () => (s = await st()).ready, 15000);
        await page.tap('#bDiary'); await sleep(400);
        await reloaded(() => page.tap('#dUpdate')); s = await st();
        T.check('«Actualizar ahora» en el diario la pone enseguida', s.ver === 4 && s.mine === ver(4), JSON.stringify(s));

        // si al recargar no llegó la versión nueva (el servidor sigue dando la página de antes), no lo vuelve a intentar: nunca en ciclo
        pub.n = 5; pub.page = 4; await away(); await until(async () => (s = await st()).ready, 15000);
        await reloaded(away);
        await E(() => { window.__stay = true; }); await away(); await sleep(1500); s = await st();
        T.check('si la recarga no trae la versión nueva, no vuelve a recargar por ella', s.mine === ver(4) && !s.ready && await E(() => window.__stay === true), JSON.stringify(s));
        T.check('sin errores (versión nueva)', !errors.length, errors.join(' | ') || undefined);
      } finally { await ctx.close(); own.server.close(); }
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
