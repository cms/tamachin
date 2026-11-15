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

## Cámara que gira y visibilidad

La cámara gira alrededor de Tamachin: arrastrando con el mouse, con dos dedos (o uno mientras se usa la palanca) y con Z/X. El ángulo está en `camView` (`01-core.js`): `yaw` 0 es la cámara al sur mirando al norte, como al empezar; `c` y `s` son su coseno y seno. La derecha de la pantalla es `(c, -s)` en el mundo y "hacia la cámara" es `(s, c)`. Caminar es relativo a la cámara (arriba en la palanca es alejarse de ella). El ángulo se guarda; `goHome()` lo regresa a 0.

Lo que queda entre la cámara y Tamachin se aparta solo, en `updateScenery()`: edificios (`occluders`) se vuelven transparentes, los árboles se agachan y la casa pierde techo y fachada al entrar (y sus paredes, si la cámara la mira desde otro lado). Todas las pruebas van en el marco de la cámara (`u` a la derecha, `d` hacia la cámara; `camBox`, `rayCrosses`, `rayU`), así que con `yaw` 0 dan lo mismo que cuando la cámara era fija. Si agregas algo alto junto a una zona caminable, regístralo en `occluders` con su planta y altura, y si tiene toldos, cuánto sobresalen por lado (`padW`, `padE`, `padN`, `padS`). Lo que no es edificio pero tapa (el techo del kiosco, el librero de la casa) va en su propia malla para poder transparentarlo.

La cámara se adelanta hacia donde camina Tamachin (`LEAD` y `camLead`, en el marco de la cámara), sobre todo hacia ella, y al detenerse conserva el adelanto. Por eso esas pruebas usan el rayo real cámara→Tamachin (`camPos`, `camSlope`), no una distancia fija detrás de él.

El bosque sin fin carga más casillas hacia donde mira la cámara (`updateForest`). Las tomas fijas (`startBusy` con `cam`, como el refri) están en coordenadas del mundo y no giran.

## Necesidades, encargos y secuencias (`06-main.js`)

- **Ánimo visible**: `tempMood` (pasajero) > `needMood` (necesidad baja) > `baseMood` (el del panel). Todo pasa por `applyMood()`.
- **Necesidades**: `NEEDS` y `needs` (0 a 1). Súbelas con `gain(k, cantidad, clave, segundos)`: con clave solo cuenta una vez cada tantos segundos, para que repetir lo mismo no las llene.
- **Encargos**: `QUESTS` y `quests` (0 sin descubrir, 1 en curso, 2 hecho), con `startQuest`/`finishQuest`. Lo que deja hecho un encargo se reaplica al cargar en `restoreQuests()`.
- **Vecinos**: `n.onTalk(n)` puede devolver la frase (los encargos hablan primero), `n.follow(n, d)` lo hace acompañar a Tamachin y `n.goto` lo lleva a un punto.
- **Secuencias** (refri, comer bayas): `startBusy({ dur, cam, update(dt, t), end })` deja al jugador en estado `busy` (sin caminar ni trucos); `once(s, clave, t)` dispara algo una sola vez. `cam` acerca la cámara (`x, y, z` mira, `ox, oy, oz` desplazamiento).
- **Guardado**: `save()` (cada 8 s y al cerrar la página) incluye el lugar y el rumbo de Tamachin; si duerme, el punto donde se levanta. `boot()` lo restaura. `goHome()` lo regresa al inicio (botón del diario).
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

Chrome sin interfaz con Playwright, interceptando la URL de cdnjs para servir una copia local de `three@0.128.0`. `window.__tamachin` expone `player`, `cars`, `npcs`, `ui`, `view` (el ángulo de la cámara), `togglePanel()`, `makeDizzy()` y `go(x, z)` para teletransportar al jugador en pruebas.
Con render por software corre a ~3 fps y el reloj del juego avanza lento (dt se limita a 0.05 s), así que las esperas deben ser generosas.

## Sin verificar

- Rendimiento en teléfonos reales (≈275 000 triángulos y sombras en la ciudad).
- Sonido (se sintetiza con WebAudio; no se pudo escuchar en las pruebas).
