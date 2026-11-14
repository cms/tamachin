# Notas para trabajar en Tamachin

## Lo esencial

- `game.js` se genera: edita `parts/*.js` y ejecuta `./build.sh`. Nunca edites `game.js` a mano.
- Las partes forman una sola IIFE en orden 01 → 05. Una `const` usada antes de su declaración (en otra parte o más arriba) falla por zona muerta temporal; las declaraciones `function` sí se elevan.
- Three.js es r128 en build UMD (`THREE` global). No existen `CapsuleGeometry` ni `BufferGeometryUtils`; no se usa `outputEncoding`, los colores se escriben tal cual en hex.
- Tras cada cambio: `./build.sh && node --check game.js`.

## Convenciones del código

- **Batch** (`01-core.js`): junta muchas piezas con color por vértice en una sola malla. Úsalo para todo lo estático (`b.box`, `b.cyl`, `b.sph`, `b.cone`, `b.ico`, `b.rbox`, `b.merge`). Las posiciones son el centro de la pieza.
- **Colisiones**: `solidBox(x0, x1, z0, z1)` y `solidCircle(x, z, r)`. Solo el jugador colisiona; vecinos y animales siguen rutas propias.
- **Azar**: `rnd/rr/pick` usan semilla fija y son para construir el mundo (siempre igual). `rand/choose` son para el comportamiento en tiempo de ejecución.
- **Árboles, flores, hierba, arbustos, rocas**: se agregan a listas (`addTree`, `addFlower`, `tufts`, `bushes`, `rocks`) y se instancian al final de `03-world.js`. Cualquier alta debe ocurrir antes de ese bloque.
- **Interacciones**: empuja a `interacts` un objeto `{ pos: {x, z}, range, label, act }`. `label` puede ser función.
- **Formas de Tamachin**: una entrada en `SHAPES` (medidas de cara) más un caso en `shapeParts()`. Si la forma es de revolución basta con `prof`; si no, define `flatZ`.
- **Ánimos**: una entrada en `MOODS` (párpados, boca, pupila especial, velocidad) y un ícono en `MOOD_ICON` (`05-main.js`).
- **Textos**: todo en español, sin emojis en la interfaz.

## Visibilidad con cámara fija

La cámara no gira. Lo que queda entre la cámara y Tamachin se aparta solo, en `updateScenery()`:
edificios (`occluders`) se vuelven transparentes, los árboles se agachan y la casa pierde techo y fachada al entrar. Si agregas algo alto al sur de una zona caminable, regístralo ahí.

## Capas del panel

El área con scroll del panel (`.pbody`) es una caja interior sin esquinas redondeadas a propósito: un contenedor con `overflow:auto` y `border-radius` produjo un rectángulo negro sobre el canvas en pruebas con Chrome sin interfaz.

## Cómo se probó

Chrome sin interfaz con Playwright, interceptando la URL de cdnjs para servir una copia local de `three@0.128.0`. `window.__tamachin` expone `player`, `cars`, `npcs`, `ui`, `togglePanel()`, `makeDizzy()` y `go(x, z)` para teletransportar al jugador en pruebas.
Con render por software corre a ~3 fps y el reloj del juego avanza lento (dt se limita a 0.05 s), así que las esperas deben ser generosas.

## Sin verificar

- Rendimiento en teléfonos reales (≈275 000 triángulos y sombras en la ciudad).
- Sonido (se sintetiza con WebAudio; no se pudo escuchar en las pruebas).
