# Tamachin

Juego 3D en el navegador hecho con Three.js (r128, cargado desde cdnjs). Tamachin es una criatura de ojos grandes que se puede personalizar (forma, color, ánimo) y pasear por su casa, la ciudad y un bosque a 100 m al norte.

No hay dependencias ni paso de compilación obligatorio: es HTML + un solo script.

## Ejecutar

Abre `index.html` en el navegador, o sirve la carpeta:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

La primera vez necesita internet para cargar Three.js y las fuentes de Google Fonts; después abre también sin red (con `http://localhost` o `https`, no abriendo el archivo directo: ver [Como app](#como-app-y-sin-internet)).

## Estructura

```
index.html        Marcado, estilos y HUD (panel, palanca táctil, globos de texto)
game.js           Script que carga la página. SE GENERA a partir de parts/
parts/
  01-core.js      Render, luces, geometría compartida, Batch, colisiones, partículas, globos, sonido y música
  02-tamachin.js  Formas, cara, ánimos y animación de la criatura (makeTamachin)
  03-world.js     Suelo, ciudad, casa, parque, camino, bosque, río, instancias
  04-life.js      Autos, semáforos y pasos de cebra, vecinos, animales del bosque
  05-norte.js     Montañas, Valle Alegre y el bosque sin fin (terreno, límites, vegetación por sectores y por casillas)
  06-main.js      Jugador, necesidades, encargos, entrada (teclado/puntero/táctil), panel, cámara, mundos, bucle principal
mundos/
  luna.js         La luna: un mundo aparte, al que se llega por un túnel de la ciudad
  tunel.js        El túnel de las montañas: la carretera a Valle Alegre por debajo de los picos
build.sh          Concatena parts/ y mundos/ en game.js
publicar.cjs      Arma dist/ (lo que se publica) y le pone la versión; lo llama `wrangler deploy`
manifest.webmanifest  La app instalable: nombre, colores, íconos
sw.js             Service worker: la copia para jugar sin internet
iconos/           Íconos de la app (PNG) y de dónde salen (icono.svg, hacer.cjs)
tests/            Pruebas en Chrome sin interfaz (npm test)
```

Las seis partes son fragmentos de **una sola IIFE**: `01-core.js` la abre y `06-main.js` la cierra. No son módulos; comparten el mismo ámbito y el orden importa. Los mundos de `mundos/` van dentro de la misma IIFE, entre `05-norte.js` y `06-main.js`: al cargar solo se registran, y lo suyo se arma la primera vez que Tamachin va.

## Flujo de trabajo

1. Edita los archivos de `parts/` (o de `mundos/`).
2. Ejecuta `./build.sh` para regenerar `game.js`.
3. Recarga la página.

`game.js` está versionado a propósito para que el proyecto funcione al clonar, sin compilar.

Para que nunca quede desfasado de `parts/`, activa el hook que lo regenera en cada commit con las partes preparadas (`git add`), aunque haya otros cambios sin preparar (una vez por clon):

```sh
git config core.hooksPath .githooks
```

## Medir el rendimiento

Agrega `?stats` a la dirección (por ejemplo `https://tamachin.matteo.games/?stats`) y aparece un recuadro con los cuadros por segundo, el cuadro más lento, cuántos tardaron más de 50 ms (ahí el juego va en cámara lenta), las llamadas de dibujo y los triángulos. Sirve para probar en un teléfono de verdad.

## Como app y sin internet

Tamachin se puede instalar como app, con su ícono y sin las barras del navegador:

- **iPhone o iPad** (Safari): botón Compartir → «Agregar a pantalla de inicio».
- **Android** (Chrome): menú ⋮ → «Instalar app» (o «Agregar a la pantalla principal»).
- **Computadora** (Chrome o Edge): el ícono de instalar al final de la barra de direcciones.

Después de la primera visita abre también sin internet, instalado o en el navegador. Lo hace `sw.js`, un service worker:

- **En línea, siempre lo último.** La página y `game.js` se piden primero a la red, así que al recargar después de publicar ya está lo nuevo.
- **Sin red, la copia.** Se usa la copia guardada sin red, o si la página tarda más de 4 s. En ese caso todo lo de esa página sale de la copia, para no mezclar una página vieja con un `game.js` nuevo. La copia de la página, `game.js` y el manifiesto se guarda completa y de una vez, y se pone al día cada vez que el juego termina de cargar.
- **Three.js y las fuentes** se guardan la primera vez y después salen de la copia.

En iPhone la app instalada guarda su propia partida, aparte de la de Safari: al instalarla Tamachin empieza de nuevo.

**Versiones nuevas.** Una app abierta se queda en segundo plano con la versión que tenía, así que el juego busca solo lo nuevo:

- Al publicar, `publicar.cjs` pone una versión en la página y en `sw.js`: un resumen de lo que se publica del juego y la hora. El final del diario la dice («Versión 3f9a2c · 18 nov, 10:42»); en local dice «Versión local (sin publicar)».
- Cada vez que vuelves al juego (la app sale del fondo, la pestaña se ve otra vez) le pide al navegador revisar `sw.js`. Si hay una versión nueva, se baja entera y avisa: «Hay una versión nueva de Tamachin…». El diario lo dice arriba, con «Actualizar ahora».
- La siguiente vez que vuelves, si es buen momento (sin un panel abierto ni nada a medias: una secuencia, el mareo, alguien que lo acompaña), se recarga sola: «Actualizando…» un segundo, y Tamachin sigue donde estaba y dice «¡Me actualicé!».
- Volver a publicar lo mismo, o algo que no cambia el juego, no hace recargar a nadie.

Las apps instaladas antes de esto no tienen quien busque versiones: hay que cerrarlas y abrirlas una última vez.

En iPhone el juego llega hasta las orillas de la pantalla (`viewport-fit=cover`, barra de estado translúcida) y la barra de arriba, la palanca, los botones y los paneles se apartan de la muesca y de la rayita de abajo (`env(safe-area-inset-*)`, a través de las variables `--sa-*` de `index.html`).

Los íconos salen de `iconos/icono.svg`; si lo cambias, `node iconos/hacer.cjs` vuelve a armar los PNG con el Chrome instalado. `wrangler deploy` publica el manifiesto, `sw.js` y los PNG junto con el juego (`publicar.cjs` dice qué se copia a `dist/`).

## Pruebas

Corren el juego en el Chrome instalado, sin interfaz, y lo juegan: caminan con la palanca, abren el refri, cumplen encargos, giran la cámara con el mouse y con los dedos, y revisan que nada tape a Tamachin. El juego en sí no necesita instalar nada; las pruebas sí:

```sh
npm install                  # una vez: playwright-core (usa el Chrome que ya tienes, no descarga navegadores)
npm test                     # todas menos la caminata larga (unos 6 minutos; van 3 grupos a la vez)
npm test -- vista controles  # solo algunas
npm run test:largo           # también la caminata de la fogata al bosque sin fin (4 minutos más)
```

Hay quince grupos: `arranque`, `mundo`, `guardado`, `cuidados`, `vista`, `controles`, `saltos`, `musica`, `dia`, `clima`, `pasos`, `trafico`, `pwa`, `luna` y `caminata`. Todas abren el juego a mediodía y con sol (`?hora=12&clima=sol`), salvo las que revisan la hora o el tiempo. Van tres grupos a la vez (`--paralelo=1` los corre uno por uno); `cuidados`, `musica` y `caminata` dependen del tiempo real y van solos, al final. Three.js se baja una vez a `tests/.cache/`. `mundo` compara el mundo generado con `tests/mundo.json`: si cambias algo del mundo a propósito, acéptalo con `npm test -- mundo --actualizar`. Las capturas de pantalla quedan en `tests/out/`. Necesitan red, porque Three.js viene de cdnjs. Chrome corre mudo: `musica` renderiza cada mezcla y mide su volumen; con `npm test -- musica --wav` también deja `tests/out/musica-*.wav` para escucharlas (y `npm test -- pasos --wav`, los pasos en cada suelo y con la música).

## Controles

| Acción | Teclado | Táctil |
| --- | --- | --- |
| Caminar | WASD o flechas | Palanca |
| Correr | Shift | Palanca al máximo |
| Saltar | Espacio | Botón Saltar |
| Interactuar / truco | E | Botón de acción |
| Personalizar | C | Botón Personalizar |
| Diario (necesidades y encargos) | J, botón Diario o clic en los medidores | Botón del libro o tocar los medidores |
| Ver los controles otra vez (la ayuda) | H | En el diario, «Ver los controles» |
| Girar la cámara | Arrastrar con el mouse de lado, o Z y X | Arrastrar con un dedo (o con dos) de lado |
| Subir o bajar la cámara (entre 15° y 60°) | Arrastrar con el mouse hacia arriba o abajo | Arrastrar con un dedo (o con dos) hacia arriba o abajo |
| Zoom | Rueda del mouse o botón Acercar | Pellizcar (en pantallas táctiles no aparece el botón) |
| Subirse a su auto / bajarse | E junto a la puerta del auto / E | «Manejar» / «Bajar del auto» |
| Manejar | W y S (o ↑ ↓) aceleran y frenan (luego reversa); A y D (o ← →) dan vuelta | La palanca apunta a dónde ir; hacia atrás frena y va en reversa |
| Bocina | Espacio | «Bocina» (el botón de saltar) |

El botón Sonido pasa por tres pasos: «Sonido: sí» (música y efectos), «Solo efectos» y «Sonido: no». En el teléfono, Diario, Sonido y Personalizar son íconos redondos junto al reloj: el libro abre el diario (también se abre tocando los medidores), la bocina con una nota es música y efectos, con ondas solo efectos y con un tache sin sonido (al tocarla, un aviso dice en qué quedó), y la paleta abre Personalizar.

El reloj de arriba, junto a los medidores, marca la hora del juego; tocarlo dice la hora y cuándo amanece u oscurece.

Clic o toque sobre Tamachin: hace un truco; cinco seguidos, rápido, lo marean. Con el mouse, moverlo en círculos a su alrededor también lo marea.

En la ciudad, cada paso de cebra tiene su semáforo de peatones: un monito verde caminando o uno rojo parado, en un poste junto a una de sus puntas (uno en cada esquina; desde la otra punta se mira el del otro lado de la calle). El monito se pone verde un rato después de que los autos de esa calle tienen rojo y parpadea antes de que vuelvan a pasar. Cruzar por el paso de cebra con el monito verde da diversión. Las cajas del monito tienen dos caras, una hacia cada punta de su paso: de lado se ve la caja. De noche (y con lluvia) los autos prenden los faros y las calaveras, y los faros alumbran la calle enfrente. Los autos nunca atropellan a Tamachin: si se les pone enfrente, frenan (en seco si hace falta), pitan y él se lleva un susto; con el monito verde solo esperan.

Saltando, Tamachin se sube a los botes de basura y los hidrantes de la ciudad, a las rocas grandes del bosque y a su cama (que rebota; saltar justo al caer lo impulsa otra vez), y brinca la cerca del jardín. Subirse a algo le da un poco de diversión.

Manejando, Tamachin va sentado en su descapotable y la cámara se pone detrás del auto. Puede ir por las calles, la carretera, el pasto y hasta el túnel de la montaña (por el de la luna no cabe); la casa, los edificios, el agua y las cuestas muy empinadas no lo dejan pasar. Nunca le pega a nadie: frena solo antes de vecinos, animales y autos, y los autos lo esperan (si se estaciona en un carril, al rato le pitan). Si se pasa un alto, solo dice «¡Uy, estaba en rojo!».

## Cuidados y encargos

- Tamachin tiene tres necesidades que bajan solas: **panza** (refri de casa, bayas del bosque), **energía** (siesta en la cama, fogata) y **diversión** (trucos, tele, fuente, platicar, acariciar animales). Si una queda baja, cambia su ánimo hasta que se recupera; no pasa nada peor.
- Encargos que salen de lo que dicen los vecinos: llevarle un conejo a Tofu, ver un pez saltarín, acompañar a Lulú a la fuente y llevarle gelatina del refri a Nube. De noche, el búho pide ver el amanecer desde una cima (entre las 5 y las 6:30) y Musgo, junto a la fogata, atrapar diez luciérnagas (tocándolas o pasando junto a ellas): quedan brillando en un frasco sobre la mesa de la casa. El diario los lista.
- **La luna.** Uno de los túneles por donde los autos salen de la ciudad, el del noreste, tiene una luna pintada en la placa (de noche brilla). Caminando hacia dentro, Tamachin llega a la luna: un cráter grande con cráteres chicos, peñascos, el cielo negro con estrellas y la Tierra asomando detrás de la orilla. Ahí pesa un tercio, así que salta unos 4 m, y se resbala un poco. El encargo es plantar su bandera (de su color) en la loma del centro. Se vuelve por el túnel de la orilla del cráter. Si lo sigue un conejo (acaríciale para que lo siga), se va con él a la luna, brinca altísimo y vuelve con él. En la boca del túnel de la ciudad los autos lo esperan sin pitar, y mientras está en la luna en la Tierra todo lo espera quieto.
- Se guardan forma, color, ánimo, necesidades, encargos, en qué mundo y el lugar donde quedó Tamachin, hacia dónde mira la cámara y a qué altura, qué suena (todo, solo efectos o nada), la hora y el día, las luciérnagas atrapadas y si ya cerraste la ayuda (en `localStorage`). En el diario, «Volver al inicio» lo regresa frente a su casa.

## Día y noche

Un día dura 24 minutos: una hora del juego es un minuto. Amanece a las 5 y oscurece a las 8 de la noche; una partida nueva empieza a las 8 de la mañana. Con la página cerrada o la pestaña oculta, el tiempo no corre.

- El sol cruza el cielo y las sombras se mueven; al amanecer y al atardecer el cielo se pone durazno y rosa.
- De noche todo se ve azul, más oscuro pero no negro (a medianoche la imagen tiene entre 46 % del brillo de mediodía, en la cima nevada, y 77 %, dentro de la casa). Hay estrellas y una luna creciente bajita hacia el norte: se ven mejor con la cámara baja.
- Al oscurecer se prenden las ventanas de los edificios y de la casa, los faroles (con su círculo de luz en el suelo) y las lámparas de adentro, y Tamachin lleva un farolito que flota a su lado.
- Dormir de noche (de 8 de la noche a 5 de la mañana, en su cama o en la hamaca) lo lleva hasta las 7 de la mañana en unos segundos y se despierta solo, con la energía llena. De día es una siesta.
- De noche las mariposas se esconden, salen luciérnagas en el jardín, el parque, el camino y los bosques, y los vecinos a veces hablan de la noche.
- A ciertas horas: el mercado de Valle Alegre abre de 8 de la mañana a 7 de la noche (cerrado, la fruta se tapa y Lila se duerme en su puesto); de 7 a 10 de la noche toca la banda en el kiosco (tres músicos con acordeón, trompeta y tambor, cinco vecinos bailan alrededor y el vals lleva trompeta); el búho del claro duerme de día y platica de noche.
- De noche, de vez en cuando, cruza una estrella fugaz por arriba de la pantalla: tocarla pide un deseo (diversión y un ánimo alegre).
- El diario dice qué día es («Día 3»): sube cada mañana, a las 5.
- El reloj es analógico: la manecilla larga da una vuelta por minuto. De noche la carátula se pone azul y sale la luna.
- Para probar una hora: `?hora=21` o `?hora=21:30` en la dirección (por ejemplo `https://tamachin.matteo.games/?hora=21`). Desde ahí sigue corriendo y se guarda.

## El tiempo

Cada día tiene su tiempo, según su número (al recargar es el mismo): 1 de cada 5 días llueve, en un chubasco de 2 a 4 horas entre las 9 de la mañana y las 9 de la noche; 1 de cada 4 está nublado; los demás hace sol. El primer día siempre hace sol.

- Nublado: el cielo y la luz se ponen grises, las sombras se suavizan, la neblina se acerca y de noche no se ven estrellas ni luna.
- Con lluvia caen gotas alrededor de Tamachin (adentro de la casa no), se prenden las ventanas, se forman charcos en las banquetas de la ciudad, los caminos y Valle Alegre que se secan despacio cuando deja de llover, se oye la lluvia (apagada y con gotas en el techo adentro de la casa) y se callan los pájaros. Las mariposas y las luciérnagas se esconden.
- Tamachin abre un paraguas rojo y blanco, y la mitad de los vecinos también; los vecinos hablan de la lluvia. Brincar en un charco salpica y divierte. La banda del kiosco no toca si llueve (el mercado sí abre).
- Arriba de los cerros (más de 180 m), en vez de llover, nieva.
- Cuando deja de llover de día sale un arcoíris del lado contrario al sol, sentado en el horizonte (se ve bajando la cámara).
- Encargos: la primera lluvia trae «Diez charcos» (brincar en diez) y el primer arcoíris, «Un arcoíris» (verlo).
- Tocar el reloj también dice el tiempo («Está lloviendo», «Al rato va a llover»…), y su carátula muestra una nube con gotas; el diario dice si el día está soleado, nublado o lluvioso.
- Para probar: `?clima=lluvia`, `?clima=nublado`, `?clima=sol` o `?clima=arcoiris` en la dirección (no se guarda).

## Música

Se sintetiza en el navegador, sin archivos de audio, y empieza con el primer toque o tecla (antes el navegador no deja sonar nada). Cada lugar tiene la suya, hecha del mismo tema:

- Casa: una caja de música.
- Jardín, parque y ciudad: marimba, bajo y acordes; la percusión entra en la ciudad.
- Camino y bosque: arpa y flautita, con huecos para los pájaros.
- Montañas: acordes amplios y campanitas sueltas; mientras más alto, menos notas y más viento.
- Valle Alegre: un vals de acordeón, más fuerte cerca del kiosco.
- Bosque sin fin: nunca se repite; los acordes y la flautita se inventan al momento.

La música también sigue a Tamachin: dormido (en su cama o en la hamaca) suena una canción de cuna; corriendo entra percusión; si tiene hambre, sueño o aburrimiento, una parte alegre se calla hasta que se recupera; los efectos con tono (saltar, trucos, premios) suenan en la tonalidad de la música, que se agacha un momento bajo los premios, y en cada cima suena una fanfarria.

Los pasos de Tamachin suenan según lo que pisa: pasto, tierra (senderos y caminos), piso (calles, banquetas y el empedrado de Valle Alegre), madera (la casa y el puente), roca y nieve en los cerros, agua en el río, charcos, metal (botes e hidrantes), la cama y el polvo de la luna. Corriendo van más seguido, al caer de un salto suenan más fuerte, después de llover chapotean un poco y el fantasma, que flota, no hace ruido. Son efectos: suenan también con «Solo efectos».

De fondo cantan pájaros, suena el río cerca del puente y sopla el viento en las montañas; eso sigue sonando con «Solo efectos». De noche cantan grillos en vez de pájaros, ulula un búho en el camino y los bosques, y la música se oye más suave. Con la pestaña oculta todo se detiene. Si en iPhone no suena nada, revisa el interruptor de silencio: Safari suele callar con él el audio de las páginas.

## Cómo se ve

Todo es de colores lisos, como juguetes. Para que no parezca pegado encima del suelo, la base de las paredes, los troncos y los setos es un poco más oscura (se calcula al armar el mundo), y debajo de Tamachin, los vecinos, los autos, los animales, los árboles y los arbustos hay una mancha de sombra suave (la de Tamachin se achica cuando salta). Los árboles, los arbustos, la hierba y las flores se mecen con el viento, de día pasan sombras de nubes por el suelo, y las orillas de Tamachin y los vecinos brillan con la luz del cielo.

## Mapa (unidades en metros)

- Al empezar, la cámara mira al norte (−Z); se puede girar. La puerta de la casa mira al sur (+Z).
- Ciudad: X y Z entre −62 y 62. Calles en X = ±24 y Z = ±24.
- Casa: manzana central. Parque: manzana norte del centro, con el portón hacia el camino.
- Camino: de Z = −62 a Z = −160. Bosque: de Z = −160 a Z = −268, con el río cerca de Z = −205.
- Carretera a Valle Alegre: sale de la ciudad por el norte de la calle X = −24 (donde antes había un túnel), rodea el molino, cruza el bosque y el río por un puente y llega a la boca de un túnel al pie de la montaña, en Z = −280. Empujando contra la boca se entra al túnel, de unos 400 m con curvas, lámparas y banquetas (un mundo aparte, como la luna), y del otro lado se sale por la otra boca, al sur de Valle Alegre, en (34, −1262).
- Casa: en el jardín, al oeste de la vereda, está el auto de Tamachin, con su propia puerta en la cerca hacia la calle del sur.
- Autobús a Valle Alegre: sale de la terminal que está junto a la salida de la ciudad (una glorieta con su parada, en el prado), va por la carretera y el túnel hasta la parada que está afuera del portón de Valle Alegre, y regresa; da la vuelta en unos 3 minutos. En la parada, «Subir al autobús» (con el autobús ahí); Tamachin se baja solo en la otra.
- Montañas: de Z = −268 a Z = −1288, X entre −340 y 340. Tres picos de 400 m: Malvavisco (X −300), Gelatina (X 0, Z −770) y Turrón (X 300). Un sendero sale del claro de la fogata, sube al Pico Gelatina y baja al pueblo.
- Valle Alegre: el pueblo, de Z = −1288 a Z = −1416 (centro en Z = −1352), con mercado al sur, kiosco en la plaza y posada con hamaca al norte.
- La luna: un mundo aparte, con sus propias coordenadas: el Cráter Grande, de 52 m de radio, con el túnel de vuelta en (0, −50), mirando al centro. Se entra por el túnel de los autos de la calle X = 24, en Z = −60.
- Bosque sin fin: al norte de Z = −1440, sin límite. Se genera por casillas de 26 m alrededor de Tamachin; tiene naranjas, manzanas, uvas, arándanos, sandías, fresas y granadas.
