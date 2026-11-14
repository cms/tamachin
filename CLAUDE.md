# Notas para trabajar en Tamachin

## Lo esencial

- `game.js` se genera: edita `parts/*.js` y ejecuta `./build.sh`. Nunca edites `game.js` a mano.
- Las partes forman una sola IIFE en orden 01 → 06 (la lista está en `build.sh`). Una `const` usada antes de su declaración (en otra parte o más arriba) falla por zona muerta temporal; las declaraciones `function` sí se elevan.
- Three.js es r128 en build UMD (`THREE` global). No existen `CapsuleGeometry` ni `BufferGeometryUtils`; no se usa `outputEncoding`, los colores se escriben tal cual en hex.
- Tras cada cambio: `./build.sh && node --check game.js`.

## Convenciones del código

- **Batch** (`01-core.js`): junta muchas piezas con color por vértice en una sola malla. Úsalo para todo lo estático (`b.box`, `b.cyl`, `b.sph`, `b.cone`, `b.ico`, `b.rbox`, `b.merge`). Las posiciones son el centro de la pieza.
- **Colisiones**: `solidBox(x0, x1, z0, z1)` y `solidCircle(x, z, r)`. Solo el jugador colisiona; vecinos y animales siguen rutas propias.
- **Azar**: `rnd/rr/pick` usan semilla fija y son para construir el mundo (siempre igual). `rand/choose` son para el comportamiento en tiempo de ejecución.
- **Árboles, flores, hierba, arbustos, rocas**: se agregan a listas (`addTree`, `addFlower`, `tufts`, `bushes`, `rocks`) y se instancian al final de `03-world.js`. Cualquier alta debe ocurrir antes de ese bloque.
- **Interacciones**: empuja a `interacts` un objeto `{ pos: {x, z}, range, label, act }`. `label` puede ser función.
- **Formas de Tamachin**: una entrada en `SHAPES` (medidas de cara) más un caso en `shapeParts()`. Si la forma es de revolución basta con `prof`; si no, define `flatZ`.
- **Ánimos**: una entrada en `MOODS` (párpados, boca, pupila especial, velocidad) y un ícono en `MOOD_ICON` (`06-main.js`).
- **Textos**: todo en español, sin emojis en la interfaz.

## Visibilidad con cámara fija

La cámara no gira. Lo que queda entre la cámara y Tamachin se aparta solo, en `updateScenery()`:
edificios (`occluders`) se vuelven transparentes, los árboles se agachan y la casa pierde techo y fachada al entrar. Si agregas algo alto al sur de una zona caminable, regístralo ahí. Los edificios guardan cuánto sobresalen sus toldos a cada lado (`padW`, `padE`) para que la prueba de lado los cuente.

La cámara se adelanta hacia donde camina Tamachin (`LEAD` y `camLead` en `06-main.js`), sobre todo al sur, y al detenerse conserva el adelanto. Por eso esas pruebas usan el rayo real cámara→Tamachin (`camPos`, `camSlope`, `rayX`), no una distancia fija detrás de él.

## Necesidades, encargos y secuencias (`06-main.js`)

- **Ánimo visible**: `tempMood` (pasajero) > `needMood` (necesidad baja) > `baseMood` (el del panel). Todo pasa por `applyMood()`.
- **Necesidades**: `NEEDS` y `needs` (0 a 1). Súbelas con `gain(k, cantidad, clave, segundos)`: con clave solo cuenta una vez cada tantos segundos, para que repetir lo mismo no las llene.
- **Encargos**: `QUESTS` y `quests` (0 sin descubrir, 1 en curso, 2 hecho), con `startQuest`/`finishQuest`. Lo que deja hecho un encargo se reaplica al cargar en `restoreQuests()`.
- **Vecinos**: `n.onTalk(n)` puede devolver la frase (los encargos hablan primero), `n.follow(n, d)` lo hace acompañar a Tamachin y `n.goto` lo lleva a un punto.
- **Secuencias** (refri, comer bayas): `startBusy({ dur, cam, update(dt, t), end })` deja al jugador en estado `busy` (sin caminar ni trucos); `once(s, clave, t)` dispara algo una sola vez. `cam` acerca la cámara (`x, y, z` mira, `ox, oy, oz` desplazamiento).
- **Interacciones** pueden llevar `ok()`: si devuelve falso no aparecen (un arbusto sin bayas).
- **Contenido nuevo del mundo**: usa su propia semilla (`mulberry(n)`), no `rnd`. Cada llamada extra a `rnd/rr/pick` durante la construcción mueve todo lo que se genera después.

## El norte (`05-norte.js`)

- **Altura**: `groundY(x, z)` usa `terrainY` al norte de `NORTH_Z`. `terrainY` interpola la rejilla `TH` con los mismos triángulos que dibuja la malla, así Tamachin no flota ni se hunde. Cambia el relieve en `PEAKS`/`RANGE` y `mountainH`.
- **Límites**: el ancho caminable depende de la franja (`xLimitAt`); `keepInWorld` regresa a Tamachin por el lado más corto. Al sur de cada franja más angosta hay una fila de árboles sólidos para que el límite no sea invisible.
- **Colisiones del norte**: `northCircle` las guarda en una rejilla (`northCollide` revisa solo las celdas cercanas). No uses `solidCircle` para cientos de cosas: esos arreglos se recorren completos en cada cuadro.
- **Vegetación fija** (montañas, pueblo): `addStatic` y luego `buildStatic` arma un InstancedMesh por tipo y sector de 120 m. En r128 un InstancedMesh viene con `frustumCulled = false`; los sectores lo activan con su propia esfera envolvente (`geoView`).
- **Árboles que se agachan**: los del norte lo hacen en el shader (`duckify`, uniforme `duckU`), no en el bucle de `updateScenery`. También su sombra (`duckDepth`).
- **Bosque sin fin**: casillas de 26 m con semilla según su posición (`genChunk`); al volver, todo está igual y lo comido sigue comido (`forest.eaten`). Se dibujan con un InstancedMesh por tipo para todo el bosque (`FK`), con un tramo fijo por casilla; fuera del bosque se ocultan. Para frutas nuevas: una entrada en `FRUITS` y su planta en `genChunk`.
- **Cámara en las montañas**: sigue al suelo y se sube lo necesario para ver a Tamachin entero cuando baja una ladera (`updateCamera`). La niebla se aleja con la altura (`updateNorth`).

## Capas del panel

El área con scroll del panel (`.pbody`) es una caja interior sin esquinas redondeadas a propósito: un contenedor con `overflow:auto` y `border-radius` produjo un rectángulo negro sobre el canvas en pruebas con Chrome sin interfaz.

## Cómo se probó

Chrome sin interfaz con Playwright, interceptando la URL de cdnjs para servir una copia local de `three@0.128.0`. `window.__tamachin` expone `player`, `cars`, `npcs`, `ui`, `togglePanel()`, `makeDizzy()` y `go(x, z)` para teletransportar al jugador en pruebas.
Con render por software corre a ~3 fps y el reloj del juego avanza lento (dt se limita a 0.05 s), así que las esperas deben ser generosas.

## Sin verificar

- Rendimiento en teléfonos reales (≈275 000 triángulos y sombras en la ciudad).
- Sonido (se sintetiza con WebAudio; no se pudo escuchar en las pruebas).
