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
- **Partículas** (la fogata, `03-world.js`): `fireParts(n, textura, mezcla)` es un `Points` con shader propio: tamaño en metros, color, opacidad y giro por partícula, una llamada de dibujo por sistema. Las llamas tapan (mezcla normal: aditivas se borraban sobre el suelo claro de día), su centro y las chispas suman luz, el humo tapa. Se mueven en `updateCampfire` solo con Tamachin cerca. Lo decorativo lleva `raycast` vacío para que el rayo de las pruebas no lo cuente como estorbo.
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
- Música: piezas `ciudad` (jardín, parque, ciudad), `casa`, `bosque` (camino y bosque), `montes`, `pueblo` (vals en 3/4: 6 corcheas por compás) y `sinfin` (generativa, con `rand`/`choose`: nunca se repite). `makeMusic(ctx, destino)` arma el motor (reverberación con ruido, un `GainNode` por pieza y por capa; sin compresor, que en Chrome agrega unos 5 dB por su cuenta y movería la calibración). `MUSIC` son las piezas (tempo, swing, `wet`, `vol`, capas y `step`, que toca la corchea `i` en el tiempo `t`), `MUSIC_ZONES` la mezcla de cada lugar. Las notas se escriben en do mayor (MIDI, 60 es el do central) y cada pieza transporta lo suyo; el tema está en `MEL_A`/`MEL_B` con `PROG_A`/`PROG_B`. Lo sostenido (colchón, flautita) suena mucho más fuerte que lo pulsado con el mismo volumen: mide antes de subirlo.
- De noche (`night` = 1 − `day.light`): `ambFor` cambia pájaros por grillos (`cricket`, donde hay pájaros) y agrega el búho (`owl`, `OWL_ZONES`); `E.setNight` cierra un filtro a la salida de la música (`E.lp`) y, ya oscuro, calla la parte alegre de la pieza (la misma lista `low` de las necesidades).
- Lo de fondo (`E.amb`) va directo a la salida, no con la música, y suena también con «Solo efectos»: río y viento son ruido filtrado que corre siempre (con volumen 0 donde no hay) y los pájaros se agendan al azar (`bird`, `pumpAmb`). `ambFor(lugar, cercaníaAlRío, altura)` da los niveles de 0 a 1 y `AMB_VOL` los calibra (el río en la orilla, RMS ≈ 0.006, debajo de la música). Las piezas leen `E.param.alt` (altura en las montañas, 0 a 1: menos campanitas) y `E.param.near` (cerca del kiosco: la banda suena más); los pone `updateMusic`.
- Reacciones (`updateMusic`): dormido suena la pieza `cuna` (lo de fondo sigue al lugar de `musicZone`). `E.param.run` (de `player.running`, que pone `updatePlayer`) suma `runPerc` en el compás de la pieza (`meter`; `noRun` en casa y cuna) por `E.runBus`, con volumen que entra y sale en unas corcheas. `E.setLow` (con `player.needLow`) baja las capas que cada pieza lista en `low`. `snd.tune` transporta los efectos con tono (`jump`, `pop`, `dizzy`, `nice`, `yay`, `low`) a la tonalidad (`key`) de la pieza que suena (`E.tune`, de −6 a +5 semitonos). `jingle()` agacha la música bajo el premio de los encargos y `fanfare()` toca `FANFARE` en las cimas por `E.fx`, que va directo a la salida (suena también con «Solo efectos»).
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
- **Luces de noche** (`day.lamps`, de 0 a 1, se prende al oscurecer): sin luces de verdad. `nightMat(color, max)` es un material sin luz que aparece con la noche (ventanas y lámparas de la casa, focos, charcos de luz). Las paredes de los edificios (`LIT_WALLS`) llevan `emissiveMap` (`WIN_GLOW`: las mismas casillas que `winTex`, con su propia semilla). Los focos van en `LAMPS` (`lampAt` para un farol `PF_LAMP`) y `lampMeshes` (`06-main.js`) los dibuja todos en dos InstancedMesh. Lo de la fachada de la casa (`house.glowFront`, el foco del porche) se esconde con ella cuando Tamachin entra; adentro de noche la luz del cielo se vuelve cálida (`houseWarm`).
- **El farolito** de Tamachin es la única luz que se agregó: una `PointLight` que está en la escena desde el principio, siempre visible, con intensidad 0 de día. No la escondas ni la metas en un grupo que se esconda: cambiaría el número de luces y recompilaría todo. `dia` revisa que haya las mismas luces de día y de noche (3).
- **Dormir de noche** (`isNight`, `NIGHT_SLEEP`, `sleepThroughNight`): el reloj corre 2 horas por segundo hasta las 7 y se despierta solo (`wake(true)`: «¡Buenos días!»), con la energía llena. De día sigue siendo una siesta de 9 s.
- De noche las mariposas se esconden (`updateButterflies`), salen luciérnagas (`fireflies`, un Points que vive en el mundo; `FIREFLY_ZONES`) y los vecinos a veces dicen `NIGHT_LINES` (`talkTo`, `04-life.js`).

## Capas del panel

El área con scroll del panel (`.pbody`) es una caja interior sin esquinas redondeadas a propósito: un contenedor con `overflow:auto` y `border-radius` produjo un rectángulo negro sobre el canvas en pruebas con Chrome sin interfaz.

Cuando el contenido de Personalizar o del diario no cabe (en teléfono), `updMore()` le pone la clase `more` al panel y aparece "Más abajo" (`.pmore`, encima del final de `.pbody`). Si cambias lo que hay dentro de un panel, llama `updMore` después.

## Pruebas (`tests/`)

`npm test` (después de `npm install`) corre los grupos de `tests/run.cjs` en el Chrome instalado; `npm run test:largo` suma la caminata de 4 minutos. Corre `npm test` antes de cada commit que toque el juego.

- `tests/lib.cjs` sirve el repo, abre el juego a mediodía (`?hora=12`; con `hora: false` manda la partida guardada, y al recargar la dirección se queda) y, con `expose`, deja variables internas de la IIFE en `window.__dbg` (reemplaza `window.__tamachin = {` en `game.js` al servirlo). `window.__tamachin` ya expone `player`, `cars`, `npcs`, `ui`, `view` (el ángulo de la cámara), `day` y `setHour(h)`, `togglePanel()`, `makeDizzy()` y `go(x, z)` para teletransportar.
- `mundo` compara lo que se genera con `tests/mundo.json`. Si falla sin que quisieras cambiar el mundo, es casi siempre una llamada de más a `rnd()`. Si el cambio es a propósito: `npm test -- mundo --actualizar`.
- El raycast de `BLOCKER` no ve a los árboles del norte agachados (eso pasa en el shader): ahí un "árbol" puede ser falso.
- Con render por software el juego corre lento y su reloj también (dt se limita a 0.05 s): las esperas deben ser generosas.

## Rendimiento

En un iPhone corre a unos 60 cuadros por segundo en todas las zonas (casa, ciudad, cima, Valle Alegre, bosque sin fin, también con la cámara girada; medido con `?stats` en noviembre de 2026). Teléfonos más viejos o Android no se han medido. Para medir, abre el juego con `?stats` (`updateStats` en `06-main.js`): cuadros por segundo, el cuadro más lento, cuántos pasan de 50 ms (ahí el juego va en cámara lenta), llamadas de dibujo y triángulos (≈300 000 en la ciudad, con sombras).

Con la cámara baja (15°) se ve hasta el horizonte: unas dos veces las llamadas de dibujo de la altura normal (346 contra 193 en el jardín, 139 contra 71 en la ciudad, en Chrome de escritorio). Esa altura no se ha medido en un teléfono. Para no dibujar lo que la niebla ya borró, `camera.far` sigue a la niebla (`scene.fog.far` + 10, hasta 1700 en las cimas) y la esfera del cielo se encoge para quedar dentro (`updateCamera`).

## Sin verificar

- Cómo suenan la música y los efectos (se sintetizan con WebAudio). Las pruebas miden volumen y tiempo; las notas se revisaron a mano en espectrogramas (`sox archivo.wav -n spectrogram`). La música no se ha medido en un teléfono (la reverberación, el río y el viento corren todo el tiempo).
- Que en iPhone el interruptor de silencio calle el juego (así suele hacer Safari con WebAudio).
- Cómo se ve la noche en un teléfono (brillo de pantalla, al aire libre), y cuánto cuestan en uno el farolito (una luz más para cada material) y las luces de noche. `dia` mide que a medianoche la imagen conserve al menos 42 % del brillo de mediodía y Tamachin 60 %.
