# Tamachin

Juego 3D en el navegador hecho con Three.js (r128, cargado desde cdnjs). Tamachin es una criatura de ojos grandes que se puede personalizar (forma, color, ánimo) y pasear por su casa, la ciudad y un bosque a 100 m al norte.

No hay dependencias ni paso de compilación obligatorio: es HTML + un solo script.

## Ejecutar

Abre `index.html` en el navegador, o sirve la carpeta:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

Necesita conexión a internet para cargar Three.js y las fuentes de Google Fonts.

## Estructura

```
index.html        Marcado, estilos y HUD (panel, palanca táctil, globos de texto)
game.js           Script que carga la página. SE GENERA a partir de parts/
parts/
  01-core.js      Render, luces, geometría compartida, Batch, colisiones, partículas, globos, sonido y música
  02-tamachin.js  Formas, cara, ánimos y animación de la criatura (makeTamachin)
  03-world.js     Suelo, ciudad, casa, parque, camino, bosque, río, instancias
  04-life.js      Autos y semáforos, vecinos, animales del bosque
  05-norte.js     Montañas, Valle Alegre y el bosque sin fin (terreno, límites, vegetación por sectores y por casillas)
  06-main.js      Jugador, necesidades, encargos, entrada (teclado/puntero/táctil), panel, cámara, bucle principal
build.sh          Concatena parts/ en game.js
tests/            Pruebas en Chrome sin interfaz (npm test)
```

Las seis partes son fragmentos de **una sola IIFE**: `01-core.js` la abre y `06-main.js` la cierra. No son módulos; comparten el mismo ámbito y el orden importa.

## Flujo de trabajo

1. Edita los archivos de `parts/`.
2. Ejecuta `./build.sh` para regenerar `game.js`.
3. Recarga la página.

`game.js` está versionado a propósito para que el proyecto funcione al clonar, sin compilar.

Para que nunca quede desfasado de `parts/`, activa el hook que lo regenera en cada commit con las partes preparadas (`git add`), aunque haya otros cambios sin preparar (una vez por clon):

```sh
git config core.hooksPath .githooks
```

## Medir el rendimiento

Agrega `?stats` a la dirección (por ejemplo `https://tamachin.matteo.games/?stats`) y aparece un recuadro con los cuadros por segundo, el cuadro más lento, cuántos tardaron más de 50 ms (ahí el juego va en cámara lenta), las llamadas de dibujo y los triángulos. Sirve para probar en un teléfono de verdad.

## Pruebas

Corren el juego en el Chrome instalado, sin interfaz, y lo juegan: caminan con la palanca, abren el refri, cumplen encargos, giran la cámara con el mouse y con los dedos, y revisan que nada tape a Tamachin. El juego en sí no necesita instalar nada; las pruebas sí:

```sh
npm install                  # una vez: playwright-core (usa el Chrome que ya tienes, no descarga navegadores)
npm test                     # todas menos la caminata larga (unos 6 minutos)
npm test -- vista controles  # solo algunas
npm run test:largo           # también la caminata de la fogata al bosque sin fin (4 minutos más)
```

Hay diez grupos: `arranque`, `mundo`, `guardado`, `cuidados`, `vista`, `controles`, `saltos`, `musica`, `dia` y `caminata`. Todas abren el juego a mediodía (`?hora=12`), salvo las que revisan la hora. `mundo` compara el mundo generado con `tests/mundo.json`: si cambias algo del mundo a propósito, acéptalo con `npm test -- mundo --actualizar`. Las capturas de pantalla quedan en `tests/out/`. Necesitan red, porque Three.js viene de cdnjs. Chrome corre mudo: `musica` renderiza cada mezcla y mide su volumen; con `npm test -- musica --wav` también deja `tests/out/musica-*.wav` para escucharlas.

## Controles

| Acción | Teclado | Táctil |
| --- | --- | --- |
| Caminar | WASD o flechas | Palanca |
| Correr | Shift | Palanca al máximo |
| Saltar | Espacio | Botón Saltar |
| Interactuar / truco | E | Botón de acción |
| Personalizar | C | Botón Personalizar |
| Diario (necesidades y encargos) | J | Botón Diario (junto a los medidores) |
| Girar la cámara | Arrastrar con el mouse de lado, o Z y X | Arrastrar con un dedo (o con dos) de lado |
| Subir o bajar la cámara (entre 15° y 60°) | Arrastrar con el mouse hacia arriba o abajo | Arrastrar con un dedo (o con dos) hacia arriba o abajo |
| Zoom | Rueda del mouse o botón Acercar | Pellizcar (en pantallas táctiles no aparece el botón) |

El botón Sonido pasa por tres pasos: «Sonido: sí» (música y efectos), «Solo efectos» y «Sonido: no».

El reloj de arriba, junto a los medidores, marca la hora del juego; tocarlo dice la hora y cuándo amanece u oscurece.

Clic o toque sobre Tamachin: hace un truco; cinco seguidos, rápido, lo marean. Con el mouse, moverlo en círculos a su alrededor también lo marea.

Saltando, Tamachin se sube a los botes de basura y los hidrantes de la ciudad, a las rocas grandes del bosque y a su cama (que rebota; saltar justo al caer lo impulsa otra vez), y brinca la cerca del jardín. Subirse a algo le da un poco de diversión.

## Cuidados y encargos

- Tamachin tiene tres necesidades que bajan solas: **panza** (refri de casa, bayas del bosque), **energía** (siesta en la cama, fogata) y **diversión** (trucos, tele, fuente, platicar, acariciar animales). Si una queda baja, cambia su ánimo hasta que se recupera; no pasa nada peor.
- Encargos que salen de lo que dicen los vecinos: llevarle un conejo a Tofu, ver un pez saltarín, acompañar a Lulú a la fuente y llevarle gelatina del refri a Nube. De noche, el búho pide ver el amanecer desde una cima (entre las 5 y las 6:30) y Musgo, junto a la fogata, atrapar diez luciérnagas (tocándolas o pasando junto a ellas): quedan brillando en un frasco sobre la mesa de la casa. El diario los lista.
- Se guardan forma, color, ánimo, necesidades, encargos, el lugar donde quedó Tamachin, hacia dónde mira la cámara y a qué altura, qué suena (todo, solo efectos o nada), la hora y el día, las luciérnagas atrapadas y si ya cerraste la ayuda (en `localStorage`). En el diario, «Volver al inicio» lo regresa frente a su casa.

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

## Música

Se sintetiza en el navegador, sin archivos de audio, y empieza con el primer toque o tecla (antes el navegador no deja sonar nada). Cada lugar tiene la suya, hecha del mismo tema:

- Casa: una caja de música.
- Jardín, parque y ciudad: marimba, bajo y acordes; la percusión entra en la ciudad.
- Camino y bosque: arpa y flautita, con huecos para los pájaros.
- Montañas: acordes amplios y campanitas sueltas; mientras más alto, menos notas y más viento.
- Valle Alegre: un vals de acordeón, más fuerte cerca del kiosco.
- Bosque sin fin: nunca se repite; los acordes y la flautita se inventan al momento.

La música también sigue a Tamachin: dormido (en su cama o en la hamaca) suena una canción de cuna; corriendo entra percusión; si tiene hambre, sueño o aburrimiento, una parte alegre se calla hasta que se recupera; los efectos con tono (saltar, trucos, premios) suenan en la tonalidad de la música, que se agacha un momento bajo los premios, y en cada cima suena una fanfarria.

De fondo cantan pájaros, suena el río cerca del puente y sopla el viento en las montañas; eso sigue sonando con «Solo efectos». De noche cantan grillos en vez de pájaros, ulula un búho en el camino y los bosques, y la música se oye más suave. Con la pestaña oculta todo se detiene. Si en iPhone no suena nada, revisa el interruptor de silencio: Safari suele callar con él el audio de las páginas.

## Mapa (unidades en metros)

- Al empezar, la cámara mira al norte (−Z); se puede girar. La puerta de la casa mira al sur (+Z).
- Ciudad: X y Z entre −62 y 62. Calles en X = ±24 y Z = ±24.
- Casa: manzana central. Parque: manzana norte del centro, con el portón hacia el camino.
- Camino: de Z = −62 a Z = −160. Bosque: de Z = −160 a Z = −268, con el río cerca de Z = −205.
- Montañas: de Z = −268 a Z = −1288, X entre −340 y 340. Tres picos de 400 m: Malvavisco (X −300), Gelatina (X 0, Z −770) y Turrón (X 300). Un sendero sale del claro de la fogata, sube al Pico Gelatina y baja al pueblo.
- Valle Alegre: el pueblo, de Z = −1288 a Z = −1416 (centro en Z = −1352), con mercado al sur, kiosco en la plaza y posada con hamaca al norte.
- Bosque sin fin: al norte de Z = −1440, sin límite. Se genera por casillas de 26 m alrededor de Tamachin; tiene naranjas, manzanas, uvas, arándanos, sandías, fresas y granadas.
