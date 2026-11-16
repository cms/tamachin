# Notas para trabajar en Tamachin

## Lo esencial

- `game.js` se genera: edita `parts/*.js` y ejecuta `./build.sh`. Nunca edites `game.js` a mano.
- Las partes forman una sola IIFE en orden 01 → 06 (la lista está en `build.sh`). Una `const` usada antes de su declaración (en otra parte o más arriba) falla por zona muerta temporal; las declaraciones `function` sí se elevan.
- Three.js es r128 en build UMD (`THREE` global). No existen `CapsuleGeometry` ni `BufferGeometryUtils`; no se usa `outputEncoding`, los colores se escriben tal cual en hex.
- Tras cada cambio: `./build.sh && node --check game.js`.

## Convenciones del código

- **Batch** (`01-core.js`): junta muchas piezas con color por vértice en una sola malla. Úsalo para todo lo estático (`b.box`, `b.cyl`, `b.sph`, `b.cone`, `b.ico`, `b.rbox`, `b.merge`). Las posiciones son el centro de la pieza.
- **Colisiones**: `solidBox(x0, x1, z0, z1)` y `solidCircle(x, z, r)`. Solo el jugador colisiona; vecinos y animales siguen rutas propias.
- **Lo que se salta**: un quinto argumento `top` (altura de arriba, en metros absolutos: úsalo solo donde el suelo está en 0) hace la cosa baja. Tamachin la libra si sus pies ya iban por encima, y se para encima (va a `perches`; `perchUnder` en `06-main.js`) salvo que el sexto argumento `stand` sea `false` (la cerca). Devuelven el objeto: `.rim` deja pararse un poco fuera de la orilla (cosas delgadas) y `.bounce` rebota (la cama). El salto llega a unos 1.38 m. Antes de etiquetar algo, revisa que su malla de verdad tenga esa altura en toda la planta del colisionador (las bancas tienen respaldo, el tocón tiene al búho, los troncos están girados). Paredes, edificios, setos, barandales y troncos de árbol no llevan `top`. Quien acompaña a Tamachin (`resolveAgent`) no salta.
- **Azar**: `rnd/rr/pick` usan semilla fija y son para construir el mundo (siempre igual). `rand/choose` son para el comportamiento en tiempo de ejecución.
- **Árboles, flores, hierba, arbustos, rocas**: se agregan a listas (`addTree`, `addFlower`, `tufts`, `bushes`, `rocks`) y se instancian al final de `03-world.js`. Cualquier alta debe ocurrir antes de ese bloque.
- **Interacciones**: empuja a `interacts` un objeto `{ pos: {x, z}, range, label, act }`. `label` puede ser función.
- **Formas de Tamachin**: una entrada en `SHAPES` (medidas de cara) más un caso en `shapeParts()`. Si la forma es de revolución basta con `prof`; si no, define `flatZ`.
- **Ánimos**: una entrada en `MOODS` (párpados, boca, pupila especial, velocidad) y un ícono en `MOOD_ICON` (`06-main.js`).
- **Textos**: todo en español, sin emojis en la interfaz.

## Cámara que gira y visibilidad

La cámara gira alrededor de Tamachin: arrastrando con el mouse o con un dedo (o dos, que además pellizcan para el zoom) y con Z/X. Un toque o clic (menos de 12 px) no gira: hace truco, y cinco seguidos lo marean (`pester`); con el dedo ya no hay círculos para marearlo, con el mouse sí. El ángulo está en `camView` (`01-core.js`): `yaw` 0 es la cámara al sur mirando al norte, como al empezar; `c` y `s` son su coseno y seno. La derecha de la pantalla es `(c, -s)` en el mundo y "hacia la cámara" es `(s, c)`. Caminar es relativo a la cámara (arriba en la palanca es alejarse de ella). El ángulo se guarda; `goHome()` lo regresa a 0.

Arrastrar hacia arriba o abajo cambia la altura: `camView.pitch` es el ángulo de la cámara sobre el suelo visto desde Tamachin, entre `PITCH.min` (15°) y `PITCH.max` (60°), 34° al empezar (`PITCH.def`); en casa va `PITCH.house` más alta. La distancia no cambia con la altura, solo con el zoom. También se guarda y `goHome()` la regresa. En Personalizar no se cambia (la cámara va a la altura de sus ojos). Las pruebas de visibilidad usan la pendiente real del rayo (`camSlope`), así que valen a cualquier altura; `vista` las corre también a 15° y 60°. Lo que no se corta y queda bajo (los setos, los túneles y sus lomas al borde de la ciudad, `edgeTop` en `03-world.js`) sube la cámara lo necesario para verlo desde los pies, igual que las laderas de las montañas (`updateCamera`); si agregas algo así al borde, súmalo a `edgeTop`.

Lo que queda entre la cámara y Tamachin se aparta solo, en `updateScenery()`: los edificios (`occluders`) y la casa se cortan casi al ras (un plano de corte baja hasta `CUT_Y`, 0.75 m, y quedan la planta, las paredes vistas por dentro y la sombra entera), los árboles se agachan, y dentro de la casa se esconden el techo y la fachada. No uses transparencias para esto: dibujaban ventanas fantasma enormes. `k` (o `house.oWalls`) va de 1, entero, a 0, cortado; los materiales cortados llevan `clippingPlanes` y las paredes `DoubleSide` solo mientras dura el corte. Todas las pruebas van en el marco de la cámara (`u` a la derecha, `d` hacia la cámara; `camBox`, `rayCrosses`, `rayU`), así que con `yaw` 0 dan lo mismo que cuando la cámara era fija. Si agregas algo alto junto a una zona caminable, regístralo en `occluders` con su planta y altura, y si tiene toldos, cuánto sobresalen por lado (`padW`, `padE`, `padN`, `padS`). Lo que no es edificio pero tapa (el techo del kiosco, el librero de la casa) va en su propia malla para poder cortarlo.

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

## Sonido y música (`01-core.js`, `06-main.js`)

- `snd.mode` es `'todo'`, `'efectos'` o `'no'` (el botón Sonido pasa por los tres; `setSound`). `snd.on` deja sonar los efectos y `snd.music` la música. Con `'no'` el `AudioContext` se suspende; también con la pestaña oculta. Las partidas viejas guardaban `sound: false`.
- Efectos: `tone()` y `SFX`, picos de 0.02 a 0.08 directo a la salida. La música va unos 10 dB abajo (RMS ≈ 0.01); si cambias volúmenes, `npm test -- musica` los mide.
- Música: `makeMusic(ctx, destino)` arma el motor (reverberación con ruido, un `GainNode` por pieza y por capa; sin compresor, que en Chrome agrega unos 5 dB por su cuenta y movería la calibración). `MUSIC` son las piezas (tempo, swing, `wet`, `vol`, capas y `step`, que toca la corchea `i` en el tiempo `t`), `MUSIC_ZONES` la mezcla de cada lugar. Las notas se escriben en do mayor (MIDI, 60 es el do central) y cada pieza transporta lo suyo; el tema está en `MEL_A`/`MEL_B` con `PROG_A`/`PROG_B`. Lo sostenido (colchón, flautita) suena mucho más fuerte que lo pulsado con el mismo volumen: mide antes de subirlo.
- Todo se programa con `ctx.currentTime`, nunca con `clock`/`dt` (que se atrasan). `pump(ahora, hasta)` agenda 0.45 s adelante y, si se atrasó (pestaña oculta, cuadro lento), salta lo perdido sin tocarlo. Para mutear o cambiar de pieza se rampa una ganancia (`setTargetAtTime`): las notas ya agendadas siguen sonando.
- En el juego, `updateMusic` (en `frame`, dentro de un try: si falla, la música se apaga y el error queda en `musErr`) usa `musicZone()`, más grueso que el nombre del HUD, y espera 0.8 s antes de cambiar (la puerta de la casa). Si es la misma pieza solo rampan las capas; si es otra, la vieja se apaga y la nueva empieza del principio 0.8 s después.
- Para agregar un lugar: una entrada en `MUSIC` (o una mezcla nueva de una pieza) y en `MUSIC_ZONES`, y su caso en `musicZone()`. Las pruebas se corren con Chrome mudo (`--mute-audio`); `npm test -- musica --wav` renderiza las mezclas a `tests/out/musica-*.wav` para escucharlas.

## Capas del panel

El área con scroll del panel (`.pbody`) es una caja interior sin esquinas redondeadas a propósito: un contenedor con `overflow:auto` y `border-radius` produjo un rectángulo negro sobre el canvas en pruebas con Chrome sin interfaz.

Cuando el contenido de Personalizar o del diario no cabe (en teléfono), `updMore()` le pone la clase `more` al panel y aparece "Más abajo" (`.pmore`, encima del final de `.pbody`). Si cambias lo que hay dentro de un panel, llama `updMore` después.

## Pruebas (`tests/`)

`npm test` (después de `npm install`) corre los grupos de `tests/run.cjs` en el Chrome instalado; `npm run test:largo` suma la caminata de 4 minutos. Corre `npm test` antes de cada commit que toque el juego.

- `tests/lib.cjs` sirve el repo, abre el juego y, con `expose`, deja variables internas de la IIFE en `window.__dbg` (reemplaza `window.__tamachin = {` en `game.js` al servirlo). `window.__tamachin` ya expone `player`, `cars`, `npcs`, `ui`, `view` (el ángulo de la cámara), `togglePanel()`, `makeDizzy()` y `go(x, z)` para teletransportar.
- `mundo` compara lo que se genera con `tests/mundo.json`. Si falla sin que quisieras cambiar el mundo, es casi siempre una llamada de más a `rnd()`. Si el cambio es a propósito: `npm test -- mundo --actualizar`.
- El raycast de `BLOCKER` no ve a los árboles del norte agachados (eso pasa en el shader): ahí un "árbol" puede ser falso.
- Con render por software el juego corre lento y su reloj también (dt se limita a 0.05 s): las esperas deben ser generosas.

## Rendimiento

En un iPhone corre a unos 60 cuadros por segundo en todas las zonas (casa, ciudad, cima, Valle Alegre, bosque sin fin, también con la cámara girada; medido con `?stats` en noviembre de 2026). Teléfonos más viejos o Android no se han medido. Para medir, abre el juego con `?stats` (`updateStats` en `06-main.js`): cuadros por segundo, el cuadro más lento, cuántos pasan de 50 ms (ahí el juego va en cámara lenta), llamadas de dibujo y triángulos (≈300 000 en la ciudad, con sombras).

Con la cámara baja (15°) se ve hasta el horizonte: unas dos veces las llamadas de dibujo de la altura normal (346 contra 193 en el jardín, 139 contra 71 en la ciudad, en Chrome de escritorio). Esa altura no se ha medido en un teléfono. Para no dibujar lo que la niebla ya borró, `camera.far` sigue a la niebla (`scene.fog.far` + 10, hasta 1700 en las cimas) y la esfera del cielo se encoge para quedar dentro (`updateCamera`).

## Sin verificar

- Cómo suenan la música y los efectos (se sintetizan con WebAudio). Las pruebas miden volumen y tiempo; las notas se revisaron a mano en espectrogramas (`sox archivo.wav -n spectrogram`). La música no se ha medido en un teléfono (la reverberación corre todo el tiempo).
- Que en iPhone el interruptor de silencio calle el juego (así suele hacer Safari con WebAudio).
