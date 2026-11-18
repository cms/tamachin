// Tamachin sin internet (y como app instalada: manifest.webmanifest). Lo registra `offline()` en parts/06-main.js.
//
// - Lo del sitio va primero a la red: en línea siempre llega lo último que se publicó. La copia guardada se usa solo sin red, o si la
//   página tarda más de NAV_WAIT en llegar; entonces todo lo de esa página sale de la copia (una página vieja con un game.js nuevo,
//   o al revés, se rompería).
// - La copia (SHELL) se guarda completa y de una vez, nunca un archivo suelto: la página y game.js siempre son del mismo envío. Se arma
//   al instalarse y se pone al día cada vez que una página termina de cargar (le manda un mensaje); casi siempre el servidor contesta
//   "no cambió" y no se baja nada.
// - Three.js y los archivos de las fuentes nunca cambian en su dirección: se bajan una vez y después salen de la copia. La hoja de las
//   fuentes sale de la copia y se renueva por detrás. En la primera visita la página carga todo eso antes de que exista este archivo:
//   por eso, al cargar, le dice qué usó de afuera.
// - Lo demás (og.jpg, los íconos) no pasa por aquí. Si algo de aquí falla, la petición va a la red como si no existiera este archivo.
const CACHE = 'tamachin-1';   // súbelo solo si cambia la forma de guardar: al activarse borra las copias con otro nombre
const SHELL = ['./', 'game.js', 'manifest.webmanifest'];
const FIXED = /^https:\/\/(cdnjs\.cloudflare\.com\/ajax\/libs\/|fonts\.gstatic\.com\/)/;
const FONT_CSS = /^https:\/\/fonts\.googleapis\.com\/css2?\?/;
const NAV_WAIT = 4000;
const ROOT = new URL('./', self.location).pathname;
const SHELL_URLS = new Set(SHELL.map((u) => new URL(u, self.location).href));
const fromCopy = new Set();   // páginas (id de cliente) que salieron de la copia: sus partes también salen de ahí
const ANY = { ignoreSearch: true, ignoreVary: true };
const keep = (e, p) => { try { e.waitUntil(p); } catch (err) { /* el evento ya terminó: que siga sin esperarlo */ } };

self.addEventListener('install', (e) => e.waitUntil(saveShell().then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((ks) => Promise.all(ks.filter((k) => k.startsWith('tamachin-') && k !== CACHE).map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));

// la copia completa o nada (si algo falla se queda la anterior). 'no-cache': pregunta al servidor, que casi siempre dice "no cambió"
async function saveShell() {
  const got = await Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: 'no-cache' })).then((r) => {
    if (!r.ok) throw new Error(u + ' ' + r.status);
    return r.redirected ? new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers }) : r;   // una redirección guardada no le sirve a una página
  })));
  const c = await caches.open(CACHE);
  await Promise.all(got.map((r, i) => c.put(SHELL[i], r)));
}

// la página terminó de cargar: pone al día la copia y guarda lo de afuera que usó
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'loaded') return;
  const urls = (Array.isArray(d.urls) ? d.urls : []).filter((u) => typeof u === 'string' && (FIXED.test(u) || FONT_CSS.test(u)));
  e.waitUntil(Promise.all([saveShell().catch(() => {}), caches.open(CACHE).then((c) => Promise.all(urls.map((u) =>
    c.match(u, { ignoreVary: true }).then((hit) => hit || fetch(u, { mode: 'cors', credentials: 'omit' }).then((r) => r.ok && c.put(u, r))).catch(() => {}))))]));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  let job = null;
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { if (url.pathname === ROOT || url.pathname === ROOT + 'index.html') job = page(e); }
    else if (SHELL_URLS.has(url.origin + url.pathname)) job = part(e);
  } else if (FIXED.test(req.url)) job = kept(e, false);
  else if (FONT_CSS.test(req.url)) job = kept(e, true);
  if (job) e.respondWith(job.catch(() => fetch(req)));
});

// la página (con cualquier ?hora=, ?stats…): de la red; sin red, o si tarda, la copia
async function page(e) {
  const c = await caches.open(CACHE), net = fetch(e.request);
  let timer;
  const late = new Promise((r) => { timer = setTimeout(r, NAV_WAIT); });
  const copy = async () => { const hit = await c.match('./', ANY); if (hit && e.resultingClientId) fromCopy.add(e.resultingClientId); return hit; };
  try {
    const first = await Promise.race([net.then((r) => ({ r })), late]);
    if (first) return first.r;
    const hit = await copy();
    if (!hit) return await net;   // sin copia no queda más que esperar
    net.catch(() => {});
    return hit;
  } catch (err) {
    const hit = await copy();
    if (hit) return hit;
    throw err;
  } finally { clearTimeout(timer); }
}

// game.js y el manifiesto: de la red, salvo que su página haya salido de la copia; sin red, la copia
async function part(e) {
  const c = await caches.open(CACHE);
  if (fromCopy.has(e.clientId)) { const hit = await c.match(e.request, ANY); if (hit) return hit; }
  try { return await fetch(e.request); } catch (err) {
    const hit = await c.match(e.request, ANY);
    if (hit) return hit;
    throw err;
  }
}

// Three.js y las fuentes: de la copia; la primera vez de la red (con CORS: una respuesta opaca no se puede revisar y ocupa mucho)
async function kept(e, refresh) {
  const c = await caches.open(CACHE), u = e.request.url, hit = await c.match(u, { ignoreVary: true });
  const get = () => fetch(u, { mode: 'cors', credentials: 'omit' }).then((r) => { if (r.ok) keep(e, c.put(u, r.clone()).catch(() => {})); return r; });
  if (!hit) return get();
  if (refresh) keep(e, get().catch(() => {}));
  return hit;
}
