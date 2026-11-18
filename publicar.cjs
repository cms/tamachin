#!/usr/bin/env node
// Arma dist/, lo único que se publica (lo llama wrangler.jsonc después de ./build.sh), y le pone la versión.
//
// La versión es un resumen de lo que se publica del juego (la página, game.js y el manifiesto) más la hora: "3f9a2c1d0b 2026-11-18T10:22:31Z".
// Va en la página (<meta name="version">) y en sw.js (VERSION). En el repo los dos dicen "dev": así, en local y en las pruebas, la página
// no busca versiones nuevas. Cada publicación cambia sw.js (por la hora), y el navegador lo nota; pero la página solo se actualiza si
// cambió el resumen: volver a publicar lo mismo, o algo que no toca el juego, no hace recargar a nadie.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILES = ['index.html', 'game.js', 'og.jpg', 'manifest.webmanifest', 'sw.js'];   // y los PNG de iconos/
const HASHED = ['index.html', 'game.js', 'manifest.webmanifest'];
const META = '<meta name="version" content="dev">', SWV = "const VERSION = 'dev';";

function version(origen, ahora) {
  const h = crypto.createHash('sha256');
  for (const f of HASHED) h.update(fs.readFileSync(path.join(origen, f)));
  return h.digest('hex').slice(0, 10) + ' ' + new Date(ahora == null ? Date.now() : ahora).toISOString().slice(0, 19) + 'Z';
}

function publicar({ origen = __dirname, salida = path.join(__dirname, 'dist'), ahora } = {}) {
  const v = version(origen, ahora);
  fs.rmSync(salida, { recursive: true, force: true });
  fs.mkdirSync(path.join(salida, 'iconos'), { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(origen, f), path.join(salida, f));
  for (const f of fs.readdirSync(path.join(origen, 'iconos'))) if (f.endsWith('.png')) fs.copyFileSync(path.join(origen, 'iconos', f), path.join(salida, 'iconos', f));
  const stamp = (f, from, to) => {
    const p = path.join(salida, f), s = fs.readFileSync(p, 'utf8');
    if (s.split(from).length !== 2) throw new Error(f + ' debe tener exactamente una vez: ' + from);   // nunca publicar sin versión
    fs.writeFileSync(p, s.replace(from, () => to));
  };
  stamp('index.html', META, '<meta name="version" content="' + v + '">');
  stamp('sw.js', SWV, "const VERSION = '" + v + "';");
  return v;
}

module.exports = { publicar, version, META, SWV };
if (require.main === module) console.log('[publicar] dist/ listo, versión ' + publicar());
