# Notas para trabajar en Tamachin

## Lo esencial

- `game.js` se genera: edita `parts/*.js` (o `mundos/*.js`) y ejecuta `./build.sh`. Nunca edites `game.js` a mano.
- Las partes forman una sola IIFE en orden 01 → 06, con los mundos (`mundos/*.js`) entre 05 y 06 (la lista está en `build.sh`). Una `const` usada antes de su declaración (en otra parte o más arriba) falla por zona muerta temporal; las declaraciones `function` sí se elevan.
- Three.js es r128 en build UMD (`THREE` global). No existen `CapsuleGeometry` ni `BufferGeometryUtils`; no se usa `outputEncoding`, los colores se escriben tal cual en hex.
- Tras cada cambio: `./build.sh && node --check game.js`.

## Convenciones del código

- **Batch** (`01-core.js`): junta muchas piezas con color por vértice en una sola malla. Úsalo para todo lo estático (`b.box`, `b.cyl`, `b.sph`, `b.cone`, `b.ico`, `b.rbox`, `b.merge`). Las posiciones son el centro de la pieza.
- **Colisiones**: `solidBox(x0, x1, z0, z1)` y `solidCircle(x, z, r)`. Solo el jugador colisiona; vecinos y animales siguen rutas propias.
- **Lo que se salta**: un quinto argumento `top` (altura de arriba, en metros absolutos: úsalo solo donde el suelo está en 0) hace la cosa baja. Tamachin la libra si sus pies ya iban por encima, y se para encima (va a `perches`; `perchUnder` en `06-main.js`) salvo que el sexto argumento `stand` sea `false` (la cerca). Devuelven el objeto: `.rim` deja pararse un poco fuera de la orilla (cosas delgadas) y `.bounce` rebota (la cama). El salto llega a unos 1.38 m. Antes de etiquetar algo, revisa que su malla de verdad tenga esa altura en toda la planta del colisionador (las bancas tienen respaldo, el tocón tiene al búho, los troncos están girados). Paredes, edificios, setos, barandales y troncos de árbol no llevan `top`. Quien acompaña a Tamachin (`resolveAgent`) no salta.
- **Azar**: `rnd/rr/pick` usan semilla fija y son para construir el mundo (siempre igual). `rand/choose` son para el comportamiento en tiempo de ejecución.
- **Árboles, flores, hierba, arbustos, rocas**: se agregan a listas (`addTree`, `addFlower`, `tufts`, `bushes`, `rocks`) y se instancian al final de `03-world.js`. Cualquier alta debe ocurrir antes de ese bloque.
- **Partículas** (la fogata, `03-world.js`): `fireParts(n, textura, mezcla)` es un `Points` con shader propio: tamaño en metros, color, opacidad y giro por partícula, una llamada de dibujo por sistema. Las llamas tapan (mezcla normal: aditivas se borraban sobre el suelo claro de día), su centro y las chispas suman luz, el humo tapa. Se mueven en `updateCampfire` solo con Tamachin cerca. Lo decorativo lleva `raycast` vacío para que el rayo de las pruebas no lo cuente como estorbo.
- **Interacciones**: empuja a `interacts` un objeto `{ pos: {x, z}, range, label, act }`. `label` puede ser función.
- **Formas de Tamachin**: una entrada en `SHAPES` (medidas de cara) más un caso en `shapeParts()`. Si la forma es de revolución basta con `prof`; si no, define `flatZ`.
- **Ánimos**: una entrada en `MOODS` (párpados, boca, pupila especial, velocidad) y un ícono en `MOOD_ICON` (`06-main.js`).
- **Textos**: todo en español, sin emojis en la interfaz.

## Cámara que gira y visibilidad

La cámara gira alrededor de Tamachin: arrastrando con el mouse o con un dedo (o dos, que además pellizcan para el zoom) y con Z/X. Un toque o clic (menos de 12 px) no gira: hace truco, y cinco seguidos lo marean (`pester`); con el dedo ya no hay círculos para marearlo, con el mouse sí. El ángulo está en `camView` (`01-core.js`): `yaw` 0 es la cámara al sur mirando al norte, como al empezar; `c` y `s` son su coseno y seno. La derecha de la pantalla es `(c, -s)` en el mundo y "hacia la cámara" es `(s, c)`. Caminar es relativo a la cámara (arriba en la palanca es alejarse de ella). El ángulo se guarda; `goHome()` lo regresa a 0.

Arrastrar hacia arriba o abajo cambia la altura: `camView.pitch` es el ángulo de la cámara sobre el suelo visto desde Tamachin, entre `PITCH.min` (15°) y `PITCH.max` (60°), 34° al empezar (`PITCH.def`); en casa va `PITCH.house` más alta. La distancia no cambia con la altura, solo con el zoom. También se guarda y `goHome()` la regresa. En Personalizar no se cambia (la cámara va a la altura de sus ojos). Las pruebas de visibilidad usan la pendiente real del rayo (`camSlope`), así que valen a cualquier altura; `vista` las corre también a 15° y 60°. Lo que no se corta y queda bajo (los setos, los túneles y sus lomas al borde de la ciudad, y las bocas del túnel de la carretera al pie de la montaña: `edgeTop` en `03-world.js`, con `PORTALS`) sube la cámara lo necesario para verlo desde los pies, igual que las laderas de las montañas (`updateCamera`; en los cerros toma lo más alto de las dos); si agregas algo así, súmalo a `edgeTop`.

Lo que queda entre la cámara y Tamachin se aparta solo, en `updateScenery()`: los edificios (`occluders`) y la casa se cortan casi al ras (un plano de corte baja hasta `CUT_Y`, 0.75 m, y quedan la planta, las paredes vistas por dentro y la sombra entera), los árboles y arbustos se abren en un círculo alrededor de él (en el shader: «Luz de más», `see`), y dentro de la casa se esconden el techo y la fachada. No uses transparencias para esto: dibujaban ventanas fantasma enormes. `k` (o `house.oWalls`) va de 1, entero, a 0, cortado; los materiales cortados llevan `clippingPlanes` y las paredes `DoubleSide` solo mientras dura el corte. Todas las pruebas van en el marco de la cámara (`u` a la derecha, `d` hacia la cámara; `camBox`, `rayCrosses`, `rayU`), así que con `yaw` 0 dan lo mismo que cuando la cámara era fija. Si agregas algo alto junto a una zona caminable, regístralo en `occluders` con su planta y altura, y si tiene toldos, cuánto sobresalen por lado (`padW`, `padE`, `padN`, `padS`). Lo que no es edificio pero tapa (el techo del kiosco, el librero de la casa) va en su propia malla para poder cortarlo. Un techo sobre postes lleva `roof` en su entrada de `occluders`: por debajo se ve, así que no se corta por estar cerca de su planta (con la caja se quitaba en cuanto Tamachin se acercaba de frente), sino solo si el rayo de la cámara a algún punto de Tamachin pasa por el cono (`roofCrosses`).

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
- **Árboles que tapan a Tamachin**: los del norte y los del bosque sin fin, como los de casa, se abren en un círculo alrededor de él (`see: true` en `SKIND` y `FK`; ver «Luz de más»). Antes se agachaban en el shader (`duckify`).
- **Bosque sin fin**: casillas de 26 m con semilla según su posición (`genChunk`); al volver, todo está igual y lo comido sigue comido (`forest.eaten`). Se dibujan con un InstancedMesh por tipo para todo el bosque (`FK`), con un tramo fijo por casilla; fuera del bosque se ocultan. Para frutas nuevas: una entrada en `FRUITS` y su planta en `genChunk`.
- **Cámara en las montañas**: sigue al suelo y se sube lo necesario para ver a Tamachin entero cuando baja una ladera (`updateCamera`). La niebla se aleja con la altura (`updateNorth`).

## Mundos (`mundos/`; `WORLDS`, `world` y `RULES` en `01-core.js`; `EARTH`, `setWorld` y `enterWorld` en `06-main.js`)

- **Qué es un mundo.** La Tierra (`EARTH`) es todo lo de siempre. Los otros viven en `mundos/*.js` (`luna.js` y `tunel.js`), que `build.sh` mete en la IIFE entre `05-norte.js` y `06-main.js`, en orden alfabético.
  - **Al cargar, un mundo solo se registra** en `WORLDS`. También puede agregar su pieza a `MUSIC` y `MUSIC_ZONES` (antes de que `makeMusic` las recorra), sus pasos a `STEPS`, sus encargos en `quests` (06 los junta con `QUESTS`) y su entrada en la Tierra.
  - **Lo suyo se arma la primera vez que Tamachin llega**: `build(M)` lo pone en `M.root` y `M.solids`, y se compila bajo el telón.
  - **No es un archivo que se baje aparte.** Así `sw.js`, `publicar.cjs` y la versión no cambian, y una página nunca junta un mundo de otra publicación.
- **`world` es donde está Tamachin.** Lo que pregunta "¿dónde estoy?" se lo pregunta a `world`, nunca a x y z sueltos: en la luna, el punto (0, −8) no es la casa. Los ganchos de la Tierra son el código de antes, movido, y lo que otro mundo no trae lo pone `WORLD_BASE`:
  - `rules`: gravedad, salto, velocidades, aceleración y frenado. `RULES` son las de la Tierra; el salto llega a jump²/(2·grav).
  - el suelo y lo que pisa: `ground`, `wet` (el río), `puddle`, `inHouse`, `slope`, `surface` (los pasos);
  - `collide`: lo que va después de los colisionadores. En la Tierra, los autos, los vecinos, `northCollide` y `keepInWorld`;
  - la cámara: `camBase`, `hills`, `edge`, `camX`, `camZ`, y `camFit(camPos)`, que al final de `updateCamera` deja la cámara dentro de algo (el túnel);
  - `zone` (el nombre en el HUD), `music`, `interacts`, `weather` (si hay tiempo), `night` (para la música), `skyWord` y `skyText` (el reloj y el diario sin tiempo; la carátula del reloj tampoco pinta nubes ni lluvia).
- **`step()`** corre lo que comparten todos los mundos: la hora, Tamachin, las necesidades, la cámara, el farolito, las partículas, el HUD y la música. Lo de cada uno va en `world.pre` (antes de Tamachin), `world.mid` (después) y `world.post` (después de la cámara).
  - Mientras está en otro mundo, en la Tierra no se mueve nada: los autos y los vecinos (también Lulú, si lo acompaña) lo esperan donde estaban.
  - **Un conejo que lo sigue viaja con él** (`setWorld` → `travel`): desde la Tierra si está a menos de 16 m (brincando se queda un poco atrás), desde otro mundo siempre (allá no se pierde ni se cansa: `follow` no baja). Su malla pasa a la raíz del otro mundo, su «Acariciar» a los `interacts` de allá y `c.world` dice dónde está; `step` lo mueve allá y los toques (`handleClick`) solo ven a los del mundo de ahora. `at.pet` dice dónde aparece.
  - El `onEarth(dt)` de cada mundo (su entrada) corre en `EARTH.mid`.
- **El cielo.** Otro mundo puede poner `sky(force)`, que corre en vez de `applyDay` (`skyNow`, 01-core.js).
  - La hora sigue corriendo, pero la luz, la niebla, el fondo, las estrellas y el sol son suyos. También pone `day.light`, `day.stars` y `day.lamps`.
  - Al volver, `applyDay(true)` repinta el cielo de la Tierra.
- **Qué se dibuja.** Antes de `boot()`, todo lo de la escena pasa a `EARTH.root` (un Group en el origen). Al cambiar de mundo se esconde esa raíz entera: no se dibuja nada de adentro, ni su sombra, aunque sus sistemas prendan cosas.
  - Afuera quedan solo los de `KEEP`: Tamachin, las tres luces, el cielo, el farolito y las partículas. Nunca se esconden: quitar una luz recompilaría todo.
  - Lo que se agregue después a `scene` (makeTamachin, la fruta que vuela) se barre a la raíz de la Tierra al cambiar de mundo (`sweepEarth`).
  - Un mundo nuevo nunca toca `boxes`, `circles`, `perches` ni `rnd` (los compara `mundo`): usa `M.solids` y su propio `mulberry`.
- **Cambiar de mundo.**
  - `setWorld(nombre, at)` cambia al instante: al arrancar, con «Volver al inicio» y en las pruebas (`__tamachin.setWorld`).
  - `enterWorld(nombre, { at, walkIn, walkOut, line })` cambia con el telón (`#telon`). Va en una secuencia `startBusy` con `ghost`, que no choca con nada (camina a través de la boca de un túnel), así `advance` también la mueve.
  - `save()` guarda `mundo` y `boot()` vuelve a él; si ese mundo ya no existe, Tamachin queda al inicio. «Volver al inicio» desde otro mundo pide dos toques.
- **La luna** (`mundos/luna.js`).
  - **Se entra** empujando contra la boca del túnel de los autos del noreste (24, −60). La placa tiene una luna pintada que de noche brilla. `onEarth` lo detecta y Tamachin camina hacia adentro.
  - **Los autos**, en esa boca y dentro del túnel, lo esperan sin pitar (`CALM`, 04-life.js).
  - **Se vuelve** por el túnel de la orilla del Cráter Grande (0, −50). Al volver, la boca no se activa hasta que Tamachin se aleja (`armed`).
  - **Las reglas:** un tercio de la gravedad (salta 4.1 m y pasa 2.1 s en el aire) y se resbala un poco (`accel`, `stop`).
  - **El suelo** es una rejilla como la de `terrainY` (`lunaY`: la malla y los pies usan los mismos triángulos). Empieza en 3 m, así que los cráteres no bajan de 0: la cámara corta lo que queda abajo de −0.3, por el río.
  - **La cámara** baja a 16° al entrar y al salir regresa a como estaba (`homePitch`). `save()` guarda esa altura de la Tierra, no la de la luna, y `boot()` pone la cámara antes de entrar al mundo guardado. Mira hacia abajo, y solo así se ven las estrellas y la Tierra, un `skySprite` grande a 3° sobre el horizonte, detrás de la orilla.
  - **El conejo, allá** (`makeRabbit`, 04-life.js, con `M` = su mundo): pisa `lunaY` y choca con lo de la luna (`resolveAgent` con `M.solids`), no busca agua, y con poca gravedad (`low`: la de su mundo) cada brinco dura 0.8 s y sube 1.3 m (en la Tierra y en el túnel, 0.36 s y 0.4 m), con polvito al caer. Como el brinco es largo, apunta derecho al empezarlo y a donde va a llegar Tamachin (su velocidad por lo que dura el brinco): si no, iba en espiral y se quedaba atrás.
  - **El encargo** `luna` es plantar la bandera (del color de Tamachin) en la loma del centro. Tiene su pieza (`luna`) y sus pasos (`polvo`). La prueba `luna` lo revisa todo.
- **El túnel** (`mundos/tunel.js`) es la carretera por debajo de las montañas. Es un mundo como la luna, pero con las reglas de la Tierra.
  - **El tubo** (`TUBE`, `TUBE_PATH`) es de unos 410 m con curvas suaves.
    - La línea central va del lado de la ciudad (d = 0, al sur) al de Valle Alegre (al norte): ir a Valle Alegre es ir al norte, como afuera.
    - `tubeNear(x, z, o)` da `d` (a lo largo) y `u` (de lado), buscando por z: el tubo siempre baja en z.
    - Tiene banquetas de 0.2 m (`tubeY`), paredes de azulejo con una franja y bóveda (`tubeRoof`), todo de un solo lado y hacia adentro.
    - Las lámparas de sodio son `MeshBasic`, y al fondo de cada punta hay una luz sin niebla.
  - **Entrar y salir:**
    - Se entra empujando contra el frente de una boca de la Tierra (`onEarth`, con `MOUTHS` de 05-norte.js), y se sale empujando contra una punta del tubo (`mid`).
    - Las puntas (`TUBE.door`) quedan a 14 m de cada extremo: detrás hay lugar para la cámara, y la luz, vista de espaldas, no se dibuja.
    - `tubeEnd` y `mouthExit` dicen dónde aparece, hacia dónde camina y hacia dónde mira la cámara (`at.yaw`).
    - Cada boca y el túnel se rearman (`armed`) cuando Tamachin se aleja.
  - **La cámara:** `camFit` la deja entre las paredes, debajo de la bóveda y entre las dos puntas.
  - **El cielo** (`sky()`): sin sol, `hemi` tibio, niebla oscura y corta, y los `nightMat` encendidos (`applyDay` no corre ahí). `day.light` es la de afuera (`lightAt`, 01-core.js), así el reloj sigue al día de la Tierra. El farolito se prende con `lantern: 1` (06-main.js, `updateLantern`).
  - **El sonido:** la pieza `tunel` (eco alto), un rumor de viento y los pasos `tunel` (la piedra con eco).
  - **Lo que no hay:** autos adentro; los de la carretera se pierden en la boca.
  - **Un conejo que lo sigue** cruza con él y dice `hopLines`. Si deja de seguirlo lejos de su casa (más de 60 m, junto a Valle Alegre), se queda a vivir ahí (`homeNear`, fuera de la carretera) en vez de regresar por la montaña.
  - **La prueba** `carretera` lo cruza de ida y vuelta, revisa la cámara en el tubo y que al recargar siga ahí.

## Luz de más: sombra de rincón, de contacto, viento, nubes y borde (`01-core.js`, `06-main.js`)

Nada de esto agrega luces ni pasadas de pantalla completa.

- **Sombra de rincón** (`bakeAO`, en `Batch.geometry()`): al armar cada malla se oscurece en su color lo que queda cerca del suelo y no mira hacia arriba (la base de las paredes, troncos, setos, banquetas), y lo que mira hacia abajo (el lado de abajo de copas, toldos y autos). Usa la altura de la pieza: lo que se arma en su lugar o con la base en 0 queda bien. `batch.ao = false` la quita. No cuesta nada al jugar.
- **Sombras de contacto** (`blobFixed`, `blobLive`, `updateBlobs`): una mancha negra suave justo debajo de lo que está en el suelo. Las de árboles y arbustos de la Tierra son fijas (van en `EARTH.root`). Las de Tamachin, los vecinos, los autos, los conejos, las ranas y los venados se mueven, en `blobLive`, que está en `KEEP` porque también sirve en la luna. La de Tamachin se pone sobre lo que tiene debajo y se achica al saltar; en la luna eso dice qué tan alto va. Van a `BLOB_UP` (0.08 m) del suelo: el piso de la ciudad está a 0.03 m y los senderos a 0.04, y a la misma altura salían rayas. Sin raycast, con niebla: de lejos se pierden.
- **Viento, nubes, borde de luz y la ventana en los árboles** (`fxPatch`, `fxAll`, `FX`): se agregan al shader de cada material. `updateFx` (en `step`) mueve los uniformes compartidos.
  - **Viento** (`SWAY` en 03-world.js): árboles, arbustos, hierba y flores, también los del norte (`SKIND_SWAY`). Cada valor es [fuerza, altura donde empieza, rapidez], y más arriba se mece más. La sombra no se mece: con unos 10 cm en la copa no se nota.
  - **Sombras de nubes:** en todo lo que recibe luz (`fxAll(scene)` antes de barrer la Tierra, y `fxAll(M.root)` en cada mundo nuevo), la luz directa se apaga un poco donde pasa una nube. La textura (`cloudTex`) cubre 100 m, sus manchas miden de 6 a 12 m de radio y avanzan a 1.2 m/s, como las nubes. No lleva mipmaps: con ellos, a lo lejos se promediaba en un gris parejo que oscurecía todo. De noche, nublado o en un mundo sin tiempo, no hay.
  - **Borde de luz** (`rim`): Tamachin y los vecinos (sus materiales en 02-tamachin.js) brillan en la orilla con el color de la luz del cielo, como un juguete de vinil.
  - **Ventana** (`see`): los árboles y arbustos que tapan a Tamachin no se mueven. En la pantalla se abren en un círculo alrededor de él (2.3 veces su radio), solo lo que queda más cerca de la cámara que él: un tramado de 4×4 (`discard`) que en el centro quita todo y en la orilla se va llenando. El resto del árbol y su sombra quedan enteros. `FX.see` = (x, y en píxeles del lienzo con el origen abajo, radio, profundidad de Tamachin), lo pone `updateCamera`. Solo se prende cuando una planta queda entre la cámara y Tamachin (`seeCheck`, cada cuadro, unos 0.006 ms): cada planta es un cilindro (`SEE_SIZE`: alto y radio de su copa) y se revisan las de una rejilla de 24 m (`seeGrid`: las fijas de casa y del norte) cerca del segmento cámara→Tamachin, y las del bosque sin fin cargadas. Queda prendida 0.4 s después. `fxSee` cambia la versión de todos los materiales con `see` (`#ifdef FX_SEE`); las dos se compilan al arrancar (`renderer.compile`), así que cambiar no traba. Es porque un shader con `discard` le quita a la GPU del iPhone una optimización en todo lo que dibuja, aunque no descarte nada. Si agregas una planta que tapa, súmala a `SEE_SIZE` y a la rejilla (o, si se carga por casillas, a la revisión del bosque). Antes se agachaban (a 28 % de alto y más anchos): de cerca, la copa aplastada quedaba a su altura y lo tapaba más. `BLOCKER` no cuenta lo que tiene `userData.see`, y `vista` lo revisa en los píxeles: el mismo cuadro con y sin el círculo, detrás de un roble y delante de él.
  - **Caché de programas:** cada combinación es otro programa. `customProgramCacheKey` lleva la del material de antes y lo agregado. Si un material nuevo que recibe luz se crea después de armar, pásalo por `fxPatch`; si no, no le pasan las nubes.

## Sonido y música (`01-core.js`, `06-main.js`)

- `snd.mode` es `'todo'`, `'efectos'` o `'no'` (el botón Sonido pasa por los tres; `setSound`). `snd.on` deja sonar los efectos y `snd.music` la música. Con `'no'` el `AudioContext` se suspende; también con la pestaña oculta. Las partidas viejas guardaban `sound: false`.
- Efectos: `tone()` y `SFX`, picos de 0.02 a 0.08 directo a la salida. La música va unos 10 dB abajo (RMS ≈ 0.01); si cambias volúmenes, `npm test -- musica` los mide.
- Música: piezas `ciudad` (jardín, parque, ciudad), `casa`, `bosque` (camino y bosque), `montes`, `pueblo` (vals en 3/4: 6 corcheas por compás) y `sinfin` (generativa, con `rand`/`choose`: nunca se repite). `makeMusic(ctx, destino)` arma el motor (reverberación con ruido, un `GainNode` por pieza y por capa; sin compresor, que en Chrome agrega unos 5 dB por su cuenta y movería la calibración). `MUSIC` son las piezas (tempo, swing, `wet`, `vol`, capas y `step`, que toca la corchea `i` en el tiempo `t`), `MUSIC_ZONES` la mezcla de cada lugar. Las notas se escriben en do mayor (MIDI, 60 es el do central) y cada pieza transporta lo suyo; el tema está en `MEL_A`/`MEL_B` con `PROG_A`/`PROG_B`. Lo sostenido (colchón, flautita) suena mucho más fuerte que lo pulsado con el mismo volumen: mide antes de subirlo.
- De noche (`night` = 1 − `day.light`): `ambFor` cambia pájaros por grillos (`cricket`, donde hay pájaros) y agrega el búho (`owl`, `OWL_ZONES`); `E.setNight` cierra un filtro a la salida de la música (`E.lp`) y, ya oscuro, calla la parte alegre de la pieza (la misma lista `low` de las necesidades).
- Lo de fondo (`E.amb`) va directo a la salida, no con la música, y suena también con «Solo efectos»: río y viento son ruido filtrado que corre siempre (con volumen 0 donde no hay) y los pájaros se agendan al azar (`bird`, `pumpAmb`). `ambFor(lugar, cercaníaAlRío, altura)` da los niveles de 0 a 1 y `AMB_VOL` los calibra (el río en la orilla, RMS ≈ 0.006, debajo de la música). Las piezas leen `E.param.alt` (altura en las montañas, 0 a 1: menos campanitas) y `E.param.near` (cerca del kiosco: la banda suena más); los pone `updateMusic`.
- Reacciones (`updateMusic`): dormido suena la pieza `cuna` (lo de fondo sigue al lugar de `musicZone`). `E.param.run` (de `player.running`, que pone `updatePlayer`) suma `runPerc` en el compás de la pieza (`meter`; `noRun` en casa y cuna) por `E.runBus`, con volumen que entra y sale en unas corcheas. `E.setLow` (con `player.needLow`) baja las capas que cada pieza lista en `low`. `snd.tune` transporta los efectos con tono (`jump`, `pop`, `dizzy`, `nice`, `yay`, `low`) a la tonalidad (`key`) de la pieza que suena (`E.tune`, de −6 a +5 semitonos). `jingle()` agacha la música bajo el premio de los encargos y `fanfare()` toca `FANFARE` en las cimas por `E.fx`, que va directo a la salida (suena también con «Solo efectos»).
- **Pasos** (`STEPS` y `footstep` en `01-core.js`; `walkSteps`, `landStep`, `stepSurface` en `06-main.js`): suenan cuando un pie baja en la animación (`T.walk` cruza π/2 + kπ), solo en el suelo, caminando de verdad (`speedN` > 0.25) y con pies (`def.feet`: el fantasma no). Al caer de un salto (`P.vy` < −4) suena uno más fuerte, salvo si salpicó un charco o el río. `stepSurface` dice qué pisa con las mismas medidas con que se pinta cada suelo: `LAWNS`, `SAND_PATHS` y `PARK_PLAZA` (ciudad, `03-world.js`), `pathX` y `nearTrail` (caminos), `northSurface` (`05-norte.js`: el pueblo con `TOWN_GARDEN`, y en los cerros la roca y la nieve con `rockK`/`snowK`, que también pintan la malla). Lo que se puede pisar encima lleva `step` al registrarlo (`metal`, `piedra`, `cama`); si agregas un suelo o algo para subirse, dale su sonido. Van directo a la salida como los efectos, con su propio try; `foot` cuenta por suelo aunque no haya audio y se salta el sonido si el anterior fue hace menos de 0.07 s del reloj del audio (`advance()` no lo mueve). La ganancia de `swish`/`blip` empieza en 0: si una nota empieza entre dos muestras, la primera sonaba entera antes de la envolvente (con el filtro de agudos, un chasquido de 0.9). `npm test -- pasos` mide volumen y brillo de cada suelo y qué pisa en cada lugar.
- Colchones lentos (`pad` con `att` mayor que 0.5): entran en línea recta y se enciman con el siguiente. Con la curva exponencial, el acorde nuevo se quedaba casi mudo más de un segundo y entre acorde y acorde quedaba un hueco.
- Todo se programa con `ctx.currentTime`, nunca con `clock`/`dt` (que se atrasan). `pump(ahora, hasta)` agenda 0.45 s adelante y, si se atrasó (pestaña oculta, cuadro lento), salta lo perdido sin tocarlo. Para mutear o cambiar de pieza se rampa una ganancia (`setTargetAtTime`): las notas ya agendadas siguen sonando.
- En el juego, `updateMusic` (en `frame`, dentro de un try: si falla, la música se apaga y el error queda en `musErr`) usa `musicZone()`, más grueso que el nombre del HUD, y espera 0.8 s antes de cambiar (la puerta de la casa). Si es la misma pieza solo rampan las capas; si es otra, la vieja se apaga y la nueva empieza del principio 0.8 s después.
- Para agregar un lugar: una entrada en `MUSIC` (o una mezcla nueva de una pieza) y en `MUSIC_ZONES`, y su caso en `musicZone()`. Las pruebas se corren con Chrome mudo (`--mute-audio`); `npm test -- musica --wav` renderiza las mezclas a `tests/out/musica-*.wav` para escucharlas.

## Día y noche (`01-core.js`, reloj en `06-main.js`)

- `day.h` es la hora (0 a 24); corre `DAY.rate` (1/60 de hora por segundo de juego) en `updateDay(dt)`, con el `dt` del cuadro (la pestaña oculta no avanza). `setHour(h)` la pone de golpe (al arrancar, `?hora=`, pruebas). Se guarda como `hora`; las partidas viejas y nuevas empiezan en `DAY.start` (8).
- `applyDay` interpola `SKY_KEYS` (cielo arriba/medio/horizonte, luz del cielo y del suelo de `hemi`, tinte de lo que no recibe luz, `day.light` 1 de día a 0 de noche, `day.warm`). De 8 a 17:30 es `SKY_DAY`, que son los valores de antes del ciclo; la prueba `dia` lo revisa. La niebla y el fondo toman el color del horizonte.
- **Una sola luz con sombra.** `sun` es el sol de día y la luna de noche: se cambian cuando las dos pasan por cero en el crepúsculo. Nunca agregues ni quites una luz con sombra, ni cambies `castShadow` en marcha: en r128 eso recompila todos los materiales y el juego se traba. Si una luz nueva hace falta (el farolito), agrégala desde el principio con intensidad 0.
- `SUN_OFF` (de Tamachin hacia la luz) mide siempre lo mismo y su altura nunca baja de 30° (`LIGHT_MIN_E`): la caja de la sombra es de ±42 m. El sol dibujado sí llega al horizonte. El sol va del este-sureste al sur, al sureste a mediodía como antes: con el sol justo detrás de la cámara las sombras quedan escondidas detrás de cada cosa. La luna cruza bajita por el norte (para que se vea caminando hacia las montañas) y su luz viene del sur.
- El cielo es `skyMesh` con color por vértice; `paintSky` lo repinta cuando la hora cambia (y agrega el resplandor hacia el sol). Estrellas (`skyStars`, con su propia semilla), luna y sol (`skyMoon`, `skySun`) van dentro de él con `SKY_ADD`: sin transparencia (así van en la lista de lo opaco, que respeta `renderOrder`) pero con mezcla aditiva y sin profundidad. Se dibujan justo después del cielo y antes que todo: cualquier cerro las tapa aunque esté más lejos que la esfera.
- `MeshBasicMaterial` no recibe luz y de noche brillaría: regístralo con `dimmable(mat)` (nubes, mariposas). Los focos del semáforo, la fogata, la tele y el refri sí deben brillar.
- De noche la luz es azul y un Tamachin amarillo se vería verde oscuro: `player.T.glow(k)` le pone brillo propio en su color (lo ajusta `frame`).
- El reloj (`updateClock`, `hourText`, `clockSay`) gira las manecillas con el atributo `transform` del SVG (centrado en 0,0), no con CSS (en iPhone `transform-origin` en SVG falla). La carátula de noche, la del atardecer, el sol y la luna son capas con opacidad.
- La cámara casi siempre mira hacia abajo y ve poco cielo: lo que dice "es de noche" es el color del suelo. Las estrellas empiezan a 1° del horizonte.
- **Luces de noche** (`day.lamps`, de 0 a 1, se prende al oscurecer): sin luces de verdad. `nightMat(color, max)` es un material sin luz que aparece con la noche (ventanas y lámparas de la casa, focos, charcos de luz). Las paredes de los edificios (`LIT_WALLS`) llevan `emissiveMap` (`WIN_GLOW`: las mismas casillas que `winTex`, con su propia semilla). Los focos van en `LAMPS` (`lampAt` para un farol `PF_LAMP`) y `lampMeshes` (`06-main.js`) los dibuja todos en dos InstancedMesh. Los autos prenden faros y calaveras (las mismas bolitas, más grandes, de luz propia) y una mancha de luz en el piso enfrente (`carLights`, `updateCarLights` en 04-life.js: un InstancedMesh para los autos, otro para el autobús y otro para las manchas, que siguen a cada auto solo mientras están prendidos). Lo de la fachada de la casa (`house.glowFront`, el foco del porche) se esconde con ella cuando Tamachin entra; adentro de noche la luz del cielo se vuelve cálida (`houseWarm`).
- **El farolito** de Tamachin es la única luz que se agregó: una `PointLight` que está en la escena desde el principio, siempre visible, con intensidad 0 de día. No la escondas ni la metas en un grupo que se esconda: cambiaría el número de luces y recompilaría todo. `dia` revisa que haya las mismas luces de día y de noche (3).
- **Dormir de noche** (`isNight`, `NIGHT_SLEEP`, `sleepThroughNight`): el reloj corre 2 horas por segundo hasta las 7 y se despierta solo (`wake(true)`: «¡Buenos días!»), con la energía llena. De día sigue siendo una siesta de 9 s.
- De noche las mariposas se esconden (`updateButterflies`), salen luciérnagas (`fireflies`, un Points que vive en el mundo; `FIREFLY_ZONES`) y los vecinos a veces dicen `NIGHT_LINES` (`talkTo`, `04-life.js`).
- **A ciertas horas** (`updateTownHours`, `06-main.js`): el mercado (`MARKET`, `marketOpen`; la lona y el letrero son `TOWN.closed`, `05-norte.js`) y Lila dormida (`lila.onTalk`). La banda (`BAND`): cinco vecinos (`DANCERS`) siguen su paseo hasta la esquina de su manzana más cercana al kiosco, cruzan la calle a su lugar y bailan; al terminar regresan a esa esquina y siguen paseando (caminar derecho los metía en los edificios). Con Tamachin lejos se acomodan de golpe. Tres `musicians` (en `creatures`, `kind: 'músico'`) aparecen en la tarima del kiosco; `E.param.band` le pone trompeta al vals y quita el filtro de la noche. El búho (`owlAwake`, `04-life.js`) duerme de día.
- **Encargos de noche**: `amanecer` (lo da el búho; se cumple en una cima entre las 5 y las 6:30, en `updateQuests`) y `luciernagas` (lo da Musgo; `catchFly`, `tapFly`; `fliesCaught` se guarda; al terminar aparece `jar` en la mesa).
- **Estrellas fugaces** (`shoot`, `spawnShootingStar`, `tapShootingStar`): se ponen donde la cámara las ve (arriba de la pantalla, a 90 m), sin profundidad. `handleClick` revisa primero la estrella y las luciérnagas.
- **El día** (`day.n`, `updateDayCount`): sube al pasar las 5 hacia adelante (también dormido). Los saltos de `setHour` hacia atrás o de más de 12 horas no cuentan, pero uno hacia adelante sí: las pruebas que saltan de hora no pueden esperar un día fijo.

## El tiempo (`06-main.js`; el cielo y la luz en `applyDay`, `01-core.js`)

- `weather` (`01-core.js`): `cloud` y `rain` (0 a 1, suben y bajan suave), `here` (lo que llueve donde está Tamachin: arriba de `WEATHER.top` no) y `wet` (los charcos: se llenan en ~50 s de lluvia y se secan en ~3 min). `updateWeather` los mueve hacia `weatherAt(hora)`, que sale del plan del día: `dayWeather(n)` usa `mulberry` con el número del día (el mismo día siempre igual; el primero, sol). `?clima=` lo fija (`weather.force`) y al arrancar `updateWeather(0, true)` lo pone sin esperar.
- Nublado en `applyDay`: los colores del cielo y la luz del cielo pierden color (mismo brillo), el sol baja (sombras suaves), la neblina se acerca (`updateNorth`), las nubes se ponen grises (`cloudMat`), no hay estrellas ni luna. Con lluvia se prenden las ventanas (`day.lamps`).
- Gotas: `rainDrops`, un `fireParts` de 900 rayitas en una caja de 30 m hacia donde mira la cámara; las pegadas a la cámara se desvanecen. Charcos: `puddles`, un InstancedMesh con lugares fijos (calles, caminos, Valle Alegre) que refleja el color de la niebla.
- Sonido: `ambFor(…, rain)` calla pájaros y grillos; `E.amb` tiene un canal `rain` (ruido filtrado) que adentro de la casa se apaga con un filtro (`roof`) y suma gotas en el techo (`drip`).
- Arriba de `WEATHER.top` la lluvia es nieve (`weather.snow`, `snowFlakes`). El arcoíris (`skyBow`, en el cielo como la luna, con `CustomBlending` para pintarse encima del cielo claro en la lista de lo opaco) sale en cuanto deja de llover de día (`weather.bowT`, unas 2 horas de juego); mide 15° y se sienta en el horizonte para que se vea con la cámara baja (uno de 42° quedaba fuera de la pantalla).
- Paraguas (`UMB_GEO`, `umbrella`, `updateUmbrellas`): el de Tamachin sigue al jugador como el farolito; los vecinos pares llevan uno en su grupo. Charcos: `puddles.list` (círculos) y `puddleJump` al caer de un salto; en la ciudad van en las banquetas (a media calle era jugar entre autos). La banda no toca con lluvia (`BAND.rain`).
- Encargos `charcos` (sale con la primera lluvia, o al platicar con lluvia; `puddleJumps` se guarda) y `arcoiris` (sale con el primer arcoíris y se cumple a los 2 s de verlo afuera). `weatherText`/`weatherWord`: el tiempo en el toque del reloj y el diario; la carátula cambia sol o luna por una nube (`cCloud`, `cRain`).

## Tráfico (`04-life.js`; el susto y el cruce en `06-main.js`)

- **Tráfico amable**: los autos nunca atropellan a Tamachin. En `updateCars`, si va delante en su carril, el auto frena (y en seco, hasta 40 m/s², si se le puso enfrente de golpe) y para antes de tocarlo; un choque de lado solo lo empuja (`resolvePlayer`). Si uno tenía que frenar por él y venía rápido, pita, rechinan las llantas si fue en seco (`SFX.screech`) y Tamachin se asusta (`startle`: brinco, asombrado), una vez por acercamiento; la primera vez sale un aviso. `knock` (atropellarlo, aventarlo y marearlo) ya no se usa: es lo de antes, por si se quiere volver.
- **Pasos de cebra** (`ZEBRAS`, cuatro por cruce, las rayas que pinta `cityTex`): cada uno cruza la calle de un eje (`ax`: los autos que pasan por él), `along` es hacia dónde camina el que cruza, `c` el centro de la calle y `w0..w1` el ancho de las rayas; `zebraAt`, `zebraU`, `zebraW`. Un poste por paso (`PED_SIGNS`, sólidos, en su propia malla sin raycast), del lado de afuera de las rayas y en una sola punta, como un rehilete (el del norte en la punta noreste, el del este en la sureste, el del sur en la suroeste, el del oeste en la noroeste): cada esquina tiene uno, junto a su paso, y desde la otra punta se mira el del otro lado de la calle. Antes había dos por paso y una franja de color en la orilla para decir cuál era de cuál: la ciudad se veía llena de postes.
- **El monito** (`pedState`) sale de `lightState`, el mismo reloj de los autos: verde 3.5 s después de que sus autos tienen rojo (medido: el último que pasó en amarillo deja las rayas hasta 2.6 s después, un autobús 3.1), 4 s fijo, 1.5 s parpadeando y rojo 0.5 s antes de que les toque verde. Si cambias los tiempos del semáforo de los autos, `trafico` simula 10 minutos de tráfico y revisa que con el monito verde no haya autos sobre las rayas. Arriba de cada poste, una caja (`pedHeads.box`) con el monito en sus dos caras (`pedHeads.walk` y `pedHeads.stop`, 2·i al frente y 2·i + 1 atrás), que miran a lo largo de su paso, una hacia cada punta, como los semáforos de dos caras: de lado se ve la caja oscura, y así también se sabe de qué paso es. Antes eran Points que siempre miraban a la cámara y no tenían lado. Las caras tienen luz propia; `updatePedSigns` prende en cada una la que toca y, parpadeando, la apaga a ratos (`instanceColor`). Van con `renderOrder` 2.5 (la caja 2.4): después del halo del farolito (aditivo; si no, de noche pintaba encima) y antes que la lluvia. Si la caja queda entre la cámara y Tamachin, caja y caras se desvanecen (`signFade`), con un valor por instancia (`aFade`, `pedFadeMat`), como los árboles que se agachan; `vista` no lo vería (no tienen raycast).
- Con el monito verde (o parpadeando) y Tamachin sobre ese paso, los autos lo esperan sin pitar ni asustarlo. **Cruzar** (`updateCrossing`): se juzga al bajar de la banqueta (con el monito fijo, no parpadeando) y cuenta al llegar a la otra orilla sin salirse de las rayas: diversión (`gain(…, 'cruce', 20)`).

## Carretera a Valle Alegre (`03-world.js`, `05-norte.js`; los autos en `04-life.js`)

- **El trazo** (`ROAD`, `ROAD_N`, `roadPath`, `roadAt`, `roadDist`/`nearRoad`): curvas suaves por puntos de control, con un punto cada metro. Son datos puros, sin `rnd`.
  - `ROAD` sale de la ciudad por donde estaba el túnel del noroeste: el seto norte se abre en `EXIT`, y `hedge()` sortea igual los bultos del hueco. Rodea el molino por el oeste, cruza el bosque y el río, y entra 10 m a la boca sur del túnel de las montañas (`ROAD_FACE`, z −280).
  - `ROAD_N` va de la boca norte (`ROAD_N_FACE`, al sur de Valle Alegre, del lado este, donde no pasa el sendero) a la entrada del pueblo.
  - 8 m de ancho (`ROAD_HALF` incluye las orillas blancas), carriles a ±2 m.
- **Despejar sin mover `rnd`.** Lo que cayó sobre la carretera se quita después de generarlo, y después de las bayas, que se acomodan según los árboles, arbustos y rocas. Saltarlo al generarlo movería todo lo que viene después.
  - Los árboles se encogen a `s = 0.001`.
  - Cada cosa que se quita se lleva su colisionador (`drop`, por posición; si no, quedaban troncos invisibles). Después sale cualquier otro círculo que pise el asfalto, y lo que se salta deja `perches`.
  - Arbustos, rocas, hierba y flores salen de sus listas.
  - Lo que se dibuja directo en un Batch (hongos, piedras y plantas del río, carrizos) sortea sus números y luego se salta.
  - En los cerros, `05-norte.js` no pone vegetación cerca (`nearRoad`, `flatK`, `MOUTHS`).
  - Si agregas algo al prado o al bosque, que no caiga en la carretera: `carretera` lo revisa en una rejilla de puntos.
- **El puente** (`RB`, `onRoadBridge`, `roadBridgeY`): la losa sube 0.75 m sobre el río y baja en rampas. `groundY` lo sabe: ahí no hay agua, y el asfalto, Tamachin y los autos suben solos. Los barandales son `solidBox`.
- **Las bocas** (`MOUTHS`, `05-norte.js`): un `PF_PORTAL` en una explanada.
  - La explanada está en `FLATS`: `flatK` en `mountainH` deja el suelo a nivel y la ladera vuelve a subir en `m` metros, como un corte.
  - El frente es sólido, como en los túneles de la ciudad, y la placa dice a dónde lleva.
  - Van en `PORTALS`, así la cámara sube por encima.
  - Empujar contra el frente lleva al túnel (abajo).
- **El asfalto** (`roadRibbon`): tres filas que siguen `groundY` a 0.035 m, con la textura de las calles. Los pasos dicen `'piedra'` y arriba dice «Carretera a Valle Alegre» (`zoneName`).
- **Los autos** (`04-life.js`).
  - **Rutas:** cada carril es una ruta: `L.at(s)` da x, z, rumbo (`fx`, `fz`) y altura. En la ciudad, `c.s` es la coordenada del eje. Al frente y al lado se mide con el rumbo de cada auto; en una curva, el empujón va con tres círculos (`earthCollide`).
  - **Los dos carriles de la calle del oeste** (`L.ext`) siguen por `ROAD`: más allá de z −62, `c.s` baja un metro por cada metro de carretera.
    - Los que van al norte se pierden dentro de la boca (`L.lo`) y vuelven a salir por el túnel sur de su calle; los que van al sur salen de la boca.
    - Dentro de la boca van a nivel: el cerro queda encima.
  - **Tráfico amable:** frenan ante Tamachin también en la carretera, y en la boca está `CALM`.
  - **Animales:** los autos no frenan por animales; los conejos y el venado de junto escogen sus paseos fuera del asfalto.

## El autobús a Valle Alegre (`04-life.js`; subir, ir arriba y bajarse en `06-main.js`)

- **La línea** (`BUS_LINE`) es una ruta cerrada de 8 tramos (`legs`):
  1. la terminal de la ciudad (`BUS_C`);
  2. la carretera al norte;
  3. el túnel (escondido);
  4. la boca norte (`ROAD_N`);
  5. la terminal de Valle Alegre (`BUS_V`);
  6. la boca norte, de regreso;
  7. el túnel, de regreso;
  8. la carretera al sur.

  La vuelta dura unos 3 minutos.
- **Las terminales** son glorietas fuera de la ciudad y del pueblo (`BUS_RING`, en `03-world.js` con la carretera), y se recorren al revés de las manecillas.
  - Empiezan y terminan en un carril de su carretera, así el autobús pasa sin brincos.
  - En la isla hay un farol, y alrededor `CALM`: ahí el autobús no le pita a nadie.
  - Su asfalto (`busMat`, un carril) va un poco abajo de la carretera donde se juntan.
- **El autobús** (`bus`) es un auto más en `cars`, agregado antes de `carLights` para que tenga luces.
  - No usa `rnd`.
  - En las terminales va a `BUS.slow` y en la carretera a `BUS.road`.
  - Sus paradas (`BUS_STOPS`) son como un alto: se detiene `BUS.dwell` s (`halt`, `done`) y avisa con `onHalt`.
  - En el túnel está escondido (`c.hidden`): no se dibuja, no estorba ni lo estorban, y sus luces y su sombra se apagan. Al salir de la boca sur cede el paso a quien salga ahí.
  - El letrero de enfrente dice a dónde va (los tramos `north`).
- **Las paradas** (`05-norte.js`) tienen techito, banca y su placa por los dos lados.
  - El techo va aparte y se quita con Tamachin abajo (`updateBusStops`).
  - Arriba dice «Terminal del autobús» o «Parada del autobús de Valle Alegre».
  - «Subir al autobús» sale solo con él parado ahí; si no, «Esperar el autobús» y Tamachin dice en cuánto llega (`busEta`).
- **Arriba** (estado `ride`, `P.ride`; `boardBus`, `updateRide`, `leaveBus`):
  - Tamachin y el conejo que lo sigue (`c.riding`) no se ven, y Tamachin va donde va el autobús.
  - La cámara va más lejos (×1.45) y se pone detrás del autobús, salvo 2.5 s después de girarla a mano (`camView.userT`).
  - El botón de acción saluda.
  - En la otra parada se baja solo.
  - **Por el túnel:** el telón, y el autobús recorre el tubo de `mundos/tunel.js` (lo mueve `updateRide`, con su malla en la raíz del túnel). Al otro extremo, otro telón, y sale por la otra boca (`bus.s` al final del tramo escondido). Mientras, la Tierra no se mueve.
  - **Guardar arriba** cuenta como si ya hubiera llegado a la otra parada.
  - **«Volver al inicio»** lo baja (`leaveBus(START)`), también a medio túnel.
- **La prueba** `autobus` revisa la vuelta, subirse, el túnel, bajarse con el conejo, que frene por Tamachin, guardar arriba y «Volver al inicio».

## La ayuda de los controles

`#help` sale sola la primera vez y se va con «Entendido» o al caminar 14 m (`helpAuto`); queda guardado (`helpSeen`). Después se ve con la tecla H o con «Ver los controles» del diario (`showHelp`, que cierra el diario: con él abierto, el CSS la esconde), y vista así se queda hasta cerrarla. En la compu muestra las teclas (`.k`) y en pantallas táctiles la palanca y los toques (`.t`).

## La barra de arriba

`.top` tiene dos partes: `.brand` (el nombre y el lugar) y `.hud` (medidores, reloj y `.tools`: Diario, Acercar, Sonido y Personalizar). El diario se abre con su botón (`bDiary`) y también tocando los medidores (`bNeeds`); `toggleDiary` pone `aria-expanded` en los dos, y un botón de `.tools` con `aria-expanded="true"` se ve hundido. Los botones de `.tools` llevan un ícono y su texto en `.lab`: cambia el texto con `boton.querySelector('.lab').textContent`, no con `textContent` del botón (borraría el ícono). Hasta 760 px de ancho (`ICONS_ONLY` en `06-main.js` usa la misma medida que el CSS) son íconos redondos de 44 px junto al reloj y el texto queda solo para lectores de pantalla; el de sonido cambia de ícono con `data-mode` y al tocarlo avisa en qué quedó. Para que todo quepa en una fila, las barras de los medidores se encogen (hasta 12 px) y abajo de 400 px los íconos de los medidores se achican (las barras quedan en 18 px a 360) y se esconde Acercar (solo aparece con mouse; la rueda acerca). `arranque` lo revisa a 390 y 360 px.

## App instalable y sin internet (`manifest.webmanifest`, `sw.js`)

- **El service worker** (`sw.js`, lo registra `offline()` al final de `06-main.js`, después de `load`) solo toca tres cosas y deja pasar todo lo demás. Si algo suyo falla, la petición va a la red.
  - **La página** (`/` con cualquier `?…`, o `/index.html`) va primero a la red. Sin red, o si tarda más de `NAV_WAIT` (4 s), sale la copia `./`. Entonces esa página queda en `fromCopy` y su `game.js` también sale de la copia: una página vieja con un `game.js` nuevo se rompería.
  - **`game.js` y el manifiesto** (`SHELL`) van primero a la red y, sin red, salen de la copia.
  - **Three.js y los archivos de las fuentes** (`FIXED`) salen de la copia, y solo la primera vez de la red. La hoja de las fuentes (`FONT_CSS`) sale de la copia y se renueva por detrás. Se piden con CORS: una respuesta opaca no se puede revisar.
- **La copia se guarda completa y de una vez** (`saveShell`), nunca un archivo suelto. Pasa al instalarse y cada vez que una página termina de cargar: le manda `{ type: 'loaded', urls }` con lo que usó de afuera (en la primera visita eso cargó antes de que existiera el service worker). Usa `cache: 'no-cache'`, así que casi siempre el servidor contesta "no cambió". La hoja de Google Fonts lleva `crossorigin`: sin eso, Chrome no anota en `performance` los archivos de fuente que pide, la página no puede decir cuáles usó y sin red salen otras fuentes.
- **Si el juego necesita un archivo nuevo al abrir** (otro script, una imagen o un sonido), agrégalo a `SHELL` y a `FILES` de `publicar.cjs`, que arma `dist/` (lo único que se publica; `wrangler.jsonc` lo llama después de `./build.sh`). Si es parte del juego, también a `HASHED`, para que cambie la versión. `pwa` corre `publicar` en una carpeta temporal y revisa que estén la página, `game.js`, el manifiesto, `sw.js` y los íconos. Sube el número de `CACHE` solo si cambia la forma de guardar: al activarse borra las copias con otro nombre.
- **Al publicar, en línea llega lo nuevo al recargar.** No hace falta tocar `sw.js`. Si `sw.js` cambia, el navegador lo nota en la siguiente visita y el nuevo toma el control enseguida (`skipWaiting`, `clients.claim`).
- **La versión** (`publicar.cjs`): un resumen de `index.html`, `game.js` y el manifiesto (10 letras) y la hora, «3f9a2c1d0b 2026-11-18T16:42:00Z». Va en `<meta name="version">` y en `VERSION` de `sw.js`; en el repo los dos dicen `dev` (`publicar` falla si no los encuentra). Mismo contenido, mismo resumen: volver a publicar lo mismo no hace recargar a nadie, aunque `sw.js` cambie por la hora. El final del diario la muestra (`showVer`); con `dev`, «Versión local (sin publicar)» y no se busca nada.
- **Versión nueva** (`upd`, junto a `offline()` en `06-main.js`). Una app abierta se queda en segundo plano con la versión que tenía, así que:
  - **Al volver al juego** (`visibilitychange` visible, `pageshow` de la caché del navegador) `updReturn` llama `reg.update()`. También al enfocar la ventana (una vez por minuto) y cada 30 min con la pestaña visible.
  - **Si `sw.js` cambió**, el nuevo se instala (`saveShell` guarda la copia nueva completa) y toma el control. `controllerchange` y cada vuelta al juego preguntan su versión al que manda (`askVer`, por un `MessageChannel`, 2 s como máximo; uno viejo sin `VERSION` no contesta). Hay versión nueva solo si el resumen es otro y la hora es posterior a la de la página (`newer`). Si no, es que la página llegó por la red antes de que él se pusiera al día.
  - **Lista** (`upd.ready`): un aviso, y arriba del diario «Actualizar ahora» (`#dNew`), que recarga sin esperar. La siguiente vuelta al juego recarga sola si `updSafe()`: estado `normal`, en el suelo, sin mareo, sin Personalizar ni el diario abiertos, y sin nadie acompañándolo (conejo con `follow`, vecino con `n.follow`). Eso no se guarda y se perdería.
  - **Antes de recargar** vuelve a preguntar la versión, guarda (`save`), muestra `#updating` («Actualizando…») y anota en `sessionStorage` de qué versión viene (`tamachin-from`) y cuáles ya intentó (`tamachin-tried`). Nunca recarga sola dos veces por la misma versión: si la recarga no la trajo, no hay ciclo. Al arrancar, si la versión cambió, Tamachin dice «¡Me actualicé! ¿Qué habrá de nuevo?» en vez de «¡Hola! Soy Tamachin.».
  - **Las pruebas** (`pwa`) usan su propio servidor (`serve(over)` de `lib.cjs`, en otro puerto: otro origen y otro service worker), que contesta como si se hubiera publicado otra vez. Con rutas no se puede: la revisión de `sw.js` del navegador (`update()`) va directo al servidor. Chrome sin interfaz no oculta la página: `away()` cambia `document.hidden` y avisa.
  - **Las apps instaladas antes de esto** no tienen `upd`: hay que cerrarlas y abrirlas una última vez.
- **Muesca y rayita de iPhone.** Con `viewport-fit=cover` y la barra de estado translúcida, el juego llega a las orillas. Lo que va pegado a una orilla suma su margen con `--sa-t`, `--sa-r`, `--sa-b` y `--sa-l` (en `:root`, son `env(safe-area-inset-*)`). Usa siempre las variables, nunca `env()` directo: así `pwa` las cambia para simular un iPhone de pie (47 y 34 px) y acostado (47 a los lados y 21 abajo). `#app::after` oscurece un poco el alto de la barra de estado, porque la hora y la batería van en blanco.
- **Íconos.** Salen de `iconos/icono.svg`, y `node iconos/hacer.cjs` arma los PNG:
  - `icono-*` («any»): cuadro redondeado;
  - `mascara-*` («maskable»): a todo el cuadro, con la cara dentro del círculo central del 80 %;
  - `apple-touch-icon.png`: 180 px, sin transparencia.
  El ícono de la pestaña sigue siendo el SVG dentro de `index.html`.

## Capas del panel

El área con scroll del panel (`.pbody`) es una caja interior sin esquinas redondeadas a propósito: un contenedor con `overflow:auto` y `border-radius` produjo un rectángulo negro sobre el canvas en pruebas con Chrome sin interfaz.

Cuando el contenido de Personalizar o del diario no cabe (en teléfono), `updMore()` le pone la clase `more` al panel y aparece "Más abajo" (`.pmore`, encima del final de `.pbody`). Si cambias lo que hay dentro de un panel, llama `updMore` después.

## Pruebas (`tests/`)

`npm test` (después de `npm install`) corre los grupos de `tests/run.cjs` en el Chrome instalado; `npm run test:largo` suma la caminata de 4 minutos. Corre `npm test` antes de cada commit que toque el juego.

- `tests/lib.cjs` sirve el repo, abre el juego a mediodía y con sol (`?hora=12&clima=sol`; con `hora: false` manda la partida guardada, y al recargar la dirección se queda; `clima: false` deja el tiempo del día) y, con `expose`, deja variables internas de la IIFE en `window.__dbg` (reemplaza `window.__tamachin = {` en `game.js` al servirlo). `window.__tamachin` ya expone `player`, `cars`, `npcs`, `ui`, `view` (el ángulo de la cámara), `day` y `setHour(h)`, `togglePanel()`, `makeDizzy()` y `go(x, z)` para teletransportar.
- `mundo` compara lo que se genera con `tests/mundo.json`. Si falla sin que quisieras cambiar el mundo, es casi siempre una llamada de más a `rnd()`. Si el cambio es a propósito: `npm test -- mundo --actualizar`.
- El raycast de `BLOCKER` no ve el shader: lo cortado se descarta a mano, y los árboles y arbustos (`userData.see`) no cuentan, porque se abren alrededor de Tamachin. `vista` revisa esa ventana en los píxeles.
- Con render por software el juego corre lento y su reloj también (dt se limita a 0.05 s): las esperas deben ser generosas.
- Para no esperar en tiempo real: `window.__tamachin.advance(seg)` corre el juego `seg` segundos de golpe (`step(dt)` repetido, sin dibujar, y dibuja una vez al final para que las matrices queden al día). `vista` lo usa en cada lugar (de 7 minutos a 5 s). Lo que depende del reloj del audio o de eventos reales (la palanca con `setInterval`, la música en vivo) no se puede adelantar así.
- `openGame` bloquea el service worker (`serviceWorkers: 'block'`). Si no, al recargar sería él quien sirve `game.js` y no pasaría por la ruta de `expose`. Con `sw: true` lo deja instalarse y pone las rutas en el contexto. `lib.cjs` pone `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`: sin eso, lo que pide el service worker no pasa por `ctx.route` y `setOffline` no lo corta. `before(page, ctx)` corre antes de abrir la página, para agregar rutas. `world` es `let` y cambia: para verlo desde la página, `expose` puede llevar `get W() { return world; }` (como `luna`). La revisión de `sw.js` que hace el navegador (`update()`) no pasa por ninguna ruta: para cambiar lo que contesta el servidor, `serve(over)`, como hace `pwa` con las versiones nuevas. Las rutas de Three.js y de las fuentes contestan aunque esté `setOffline`: para probar sin red de verdad, `pwa` las corta y además apaga la caché del navegador (`Network.setCacheDisabled`, también la de memoria, que guarda las fuentes al recargar).
- `run.cjs` corre 3 grupos a la vez (`--paralelo=N`) e imprime cada uno al terminar; los que llevan `solo: true` (`cuidados`, `musica`, `caminata`) van solos al final porque con la máquina ocupada su tiempo real se atrasa. Three.js lo sirve `lib.cjs` desde `tests/.cache/` (se baja la primera vez).

## Rendimiento

En un iPhone corre a unos 60 cuadros por segundo en todas las zonas (casa, ciudad, cima, Valle Alegre, bosque sin fin, también con la cámara girada; medido con `?stats` en noviembre de 2026). Teléfonos más viejos o Android no se han medido. Para medir, abre el juego con `?stats` (`updateStats` en `06-main.js`): cuadros por segundo, el cuadro más lento, cuántos pasan de 50 ms (ahí el juego va en cámara lenta), llamadas de dibujo y triángulos (≈300 000 en la ciudad, con sombras).

Con la cámara baja (15°) se ve hasta el horizonte: unas dos veces las llamadas de dibujo de la altura normal (346 contra 193 en el jardín, 139 contra 71 en la ciudad, en Chrome de escritorio). Esa altura no se ha medido en un teléfono. Para no dibujar lo que la niebla ya borró, `camera.far` sigue a la niebla (`scene.fog.far` + 10, hasta 1700 en las cimas) y la esfera del cielo se encoge para quedar dentro (`updateCamera`).

## Sin verificar

- Cómo suenan la música, los efectos y los pasos (se sintetizan con WebAudio). Los pasos van al ritmo de la animación y la percusión de correr al de la música: corriendo, los dos ritmos no coinciden. Las pruebas miden volumen y tiempo; las notas se revisaron a mano en espectrogramas (`sox archivo.wav -n spectrogram`). La música no se ha medido en un teléfono (la reverberación, el río y el viento corren todo el tiempo).
- Que en iPhone el interruptor de silencio calle el juego (así suele hacer Safari con WebAudio).
- Los semáforos de peatones en un teléfono: cómo suenan el pitido del monito verde y el rechinido de las llantas, y cuánto cuestan las llamadas de dibujo de más en la ciudad (las cajas, sus dos caras, los postes y sus sombras; de noche, las luces de los autos).
- La app instalada en un teléfono de verdad, porque Chrome sin interfaz no tiene muesca y `pwa` la simula. Falta ver:
  - cómo se lee la barra de estado translúcida sobre el juego, con la sombra de `#app::after`;
  - que las orillas reales coincidan con la simulación;
  - que en iPhone abra en modo avión;
  - que la partida de la app vaya aparte de la de Safari (así lo hace iOS con las apps de la pantalla de inicio);
  - cómo se instala en Android.
- Dos cosas de `sw.js` solo se probaron en Chrome:
  - **`resultingClientId`.** Sin él no se anota `fromCopy`. En un Safari que no lo dé, con red lenta justo después de publicar, la página de la copia podría cargar el `game.js` nuevo.
  - **Las fuentes en `performance`.** Que con `crossorigin` aparezcan ahí los archivos de fuente. Si Safari no los anota, las fuentes se guardan desde la segunda visita, no desde la primera.
- La ventana en los árboles en un teléfono: mientras está prendida (una planta lo tapa), el `discard` le quita a la GPU del iPhone una optimización en todo lo que dibujan árboles y arbustos; cuánto cuesta ahí, sobre todo en el bosque, donde casi siempre hay uno delante.
- La luz de más en un teléfono: cuánto cuestan el viento y las nubes en el shader (una lectura de textura por pixel en todo lo que recibe luz) y las sombras de contacto (hasta 90 que se mueven, más las fijas); cómo se ven las sombras de las nubes al aire libre.
- El autobús en un teléfono: si la cámara que lo sigue (más lejos, detrás de él) se ve bien en las curvas de las terminales y en el túnel.
- La carretera y el túnel en un teléfono: cuánto cuesta el tubo (no echa sombra, pero sí la recibe) y si la luz tibia y la cámara baja, debajo de la bóveda, se ven bien.
- La luna en un teléfono: cuánto cuesta (la malla del suelo, de unos 33 000 triángulos, también echa sombra), cómo se ven el cielo negro y la Tierra, y si con la cámara baja (16°) se juega bien. Que en iPhone empujar contra la boca del túnel con la palanca se sienta natural.
- La versión nueva en un iPhone de verdad:
  - que la app instalada avise `visibilitychange` al salir del fondo, y que desde ahí `reg.update()` de verdad revise `sw.js`;
  - cuánto tarda la vuelta: bajar la versión nueva y luego la recarga, con «Actualizando…».
- Cómo se ve la noche en un teléfono (brillo de pantalla, al aire libre), y cuánto cuestan en uno el farolito (una luz más para cada material) y las luces de noche. `dia` mide que a medianoche la imagen conserve al menos 42 % del brillo de mediodía y Tamachin 60 %.
