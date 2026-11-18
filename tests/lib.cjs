// Herramientas de las pruebas: un servidor de archivos para el repo, Chrome sin interfaz (Playwright con el Chrome instalado)
// y una página del juego con acceso a sus variables internas.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');                 // capturas de pantalla (no se versiona)
// Sin esto, lo que pide el service worker (sw.js) no pasa por `ctx.route` y `setOffline` no lo corta (Playwright 1.56, Chromium)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function playwright() {
  try { return require('playwright-core'); } catch (e) { /* sigue */ }
  if (process.env.PLAYWRIGHT_CORE) return require(process.env.PLAYWRIGHT_CORE);
  throw new Error('Falta playwright-core: ejecuta `npm install` en la raíz del repo.');
}

// Sirve la raíz del repo en un puerto libre de 127.0.0.1.
function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(REPO, rel);
    if (!file.startsWith(REPO + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port + '/' })));
}

async function launch() {
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'];   // la música y los efectos corren, pero no suenan en la compu
  if (process.platform === 'darwin') args.push('--use-angle=metal');
  return playwright().chromium.launch({ channel: 'chrome', headless: true, args });
}

// Three.js: se baja una vez de cdnjs a tests/.cache y las páginas lo reciben de ahí (más rápido, y sin depender de la red en cada página)
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', THREE_FILE = path.join(__dirname, '.cache', 'three-r128.min.js');
let threeSrc = null;
async function three() {
  if (threeSrc) return threeSrc;
  if (!fs.existsSync(THREE_FILE)) {
    const r = await fetch(THREE_URL); if (!r.ok) throw new Error('No se pudo bajar Three.js: ' + r.status);
    fs.mkdirSync(path.dirname(THREE_FILE), { recursive: true }); fs.writeFileSync(THREE_FILE, Buffer.from(await r.arrayBuffer()));
  }
  return (threeSrc = fs.readFileSync(THREE_FILE));
}

// Las fuentes de Google (la hoja y los archivos): la primera vez se bajan y se guardan en tests/.cache/fuentes; luego salen de ahí.
// Sin red y sin copia, se cancelan (el juego usa otras fuentes); la página no se queda esperando su "load".
const FONT_DIR = path.join(__dirname, '.cache', 'fuentes');
async function fontRoute(route) {
  const url = route.request().url(), f = path.join(FONT_DIR, crypto.createHash('sha1').update(url).digest('hex'));
  if (fs.existsSync(f)) return route.fulfill({ body: fs.readFileSync(f), headers: { 'content-type': fs.readFileSync(f + '.tipo', 'utf8'), 'access-control-allow-origin': '*' } });
  try {
    const res = await route.fetch({ timeout: 8000 }), body = await res.body(), type = res.headers()['content-type'] || 'application/octet-stream';
    if (res.ok()) { fs.mkdirSync(FONT_DIR, { recursive: true }); fs.writeFileSync(f, body); fs.writeFileSync(f + '.tipo', type); }
    return route.fulfill({ status: res.status(), body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
  } catch (e) { return route.abort(); }
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

// Abre el juego. `expose` son nombres de variables internas de la IIFE (p. ej. 'player, scene') que quedan en window.__dbg.
// `init` corre antes de que cargue la página (para preparar localStorage). `hora`: a qué hora empieza (?hora=, por omisión 12, a pleno
// día, para que todo se vea igual aunque cambie el ciclo); `hora: false` no la pone y manda la partida guardada (al recargar, la
// dirección se queda igual). `clima`: el tiempo (?clima=, por omisión sol, para que ningún día de lluvia cambie las luces ni esconda
// mariposas); `clima: false` deja el del día. El service worker (sw.js) no se instala, salvo con `sw: true`: si no, al recargar
// sería él quien sirve game.js y no pasaría por la ruta de `expose`. Con `sw: true` las rutas van en el contexto, para que también
// pasen por ahí las peticiones del service worker. `before(page, ctx)` corre antes de abrir la página (para agregar rutas).
// Devuelve { ctx, page, errors, E }.
async function openGame(T, opts = {}) {
  const ctx = opts.ctx || await T.browser.newContext({ ...(opts.device || DESKTOP), serviceWorkers: opts.sw ? 'allow' : 'block' });
  const page = await ctx.newPage(), R = opts.sw ? ctx : page;
  const errors = [];
  page.on('pageerror', (e) => errors.push('error: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()); });
  // las fuentes de Google vienen de afuera: si la red falla, el juego usa otras y sigue bien (no es un error del juego)
  page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) errors.push('falló ' + r.url() + ' ' + ((r.failure() || {}).errorText || '')); });
  if (opts.expose) {
    const src = fs.readFileSync(path.join(REPO, 'game.js'), 'utf8');
    const hook = 'window.__dbg = { ' + opts.expose + ' };\nwindow.__tamachin = {';
    if (!src.includes('window.__tamachin = {')) throw new Error('game.js ya no tiene "window.__tamachin = {"');
    const body = src.replace('window.__tamachin = {', hook);
    await R.route('**/game.js', (r) => r.fulfill({ body, contentType: 'application/javascript' }));
  }
  const src3 = await three(); await R.route(THREE_URL, (r) => r.fulfill({ body: src3, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await R.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, fontRoute);
  if (opts.init) await page.addInitScript(opts.init);
  if (opts.before) await opts.before(page, ctx);
  const hq = [opts.hora === false ? '' : 'hora=' + (opts.hora == null ? 12 : opts.hora), opts.clima === false ? '' : 'clima=' + (opts.clima || 'sol')].filter(Boolean).join('&'), q = opts.query || '';
  await page.goto(T.url + (q && hq ? q + '&' + hq : q || (hq ? '?' + hq : '')));
  await page.waitForFunction(() => !!window.__tamachin, null, { timeout: 30000 });
  await sleep(opts.settle || 1200);
  if (opts.help !== true) await page.evaluate(() => { document.querySelector('#help').hidden = true; });
  const E = (f, a) => page.evaluate(f, a);
  return { ctx, page, errors, E };
}

// Toques reales (CDP): Playwright solo sabe tocar, no arrastrar con varios dedos.
async function touchscreen(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  return (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
}

// Raycast cámara→Tamachin contra la escena (la página debe exponer scene, camera, player, occluders, house).
// Devuelve qué tapa: 'edificio', 'casa', 'árbol' (InstancedMesh), 'otro' o null. El raycast no sabe de planos de corte ni del
// shader: lo cortado se descarta a mano, pero los árboles del norte agachados no, así que ahí 'árbol' puede ser falso.
// Lo que camina (autos, vecinos, animales) no cuenta: pasa por delante un momento y hacía que la prueba fallara al azar.
const BLOCKER = () => {
  const D = window.__dbg, rc = new THREE.Raycaster(), own = new Set(); rc.camera = D.camera; D.player.T.group.traverse((o) => own.add(o));
  const add = (o) => o && o.traverse && o.traverse((x) => own.add(x));
  window.__tamachin.cars.forEach((c) => add(c.mesh)); window.__tamachin.npcs.forEach((n) => add(n.T.group)); (D.creatures || []).forEach((c) => { add(c.mesh); add(c.g); add(c.T && c.T.group); });
  const houseMats = [D.house.mWalls, D.house.mFront, D.house.mRoof, D.house.mShelf, D.house.doorMat];
  window.__blocker = (h = 0.75) => {
    const P = D.player, t = new THREE.Vector3(P.pos.x, P.pos.y + h * P.T.scale, P.pos.z), d = t.clone().sub(D.camera.position), L = d.length();
    d.normalize(); rc.set(D.camera.position, d); rc.far = L - 0.9;
    for (const hit of rc.intersectObjects(D.scene.children, true)) {
      const o = hit.object; if (own.has(o) || o.isSprite || !o.visible) continue;
      let m = o.material; if (Array.isArray(m)) m = m[hit.face ? hit.face.materialIndex : 0];
      if (!m || m.side === THREE.BackSide || (m.transparent && m.opacity < 0.5)) continue;
      if (m.clippingPlanes && m.clippingPlanes.some((p) => p.distanceToPoint(hit.point) < 0)) continue;   // la parte cortada no se dibuja
      const at = [hit.point.x, hit.point.y, hit.point.z].map((v) => v.toFixed(1)).join(',');
      if (D.occluders.some((q) => q.mats.includes(m))) return 'edificio@' + at;
      if (houseMats.includes(m)) return 'casa@' + at;
      return (o.isInstancedMesh ? 'árbol@' : 'otro@') + at;
    }
    return null;
  };
};

module.exports = { REPO, OUT, sleep, serve, launch, openGame, touchscreen, BLOCKER, PHONE, DESKTOP };
