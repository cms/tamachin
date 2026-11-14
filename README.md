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
  01-core.js      Render, luces, geometría compartida, Batch, colisiones, partículas, globos, sonido
  02-tamachin.js  Formas, cara, ánimos y animación de la criatura (makeTamachin)
  03-world.js     Suelo, ciudad, casa, parque, camino, bosque, río, instancias
  04-life.js      Autos y semáforos, vecinos, animales del bosque
  05-norte.js     Montañas, Valle Alegre y el bosque sin fin (terreno, límites, vegetación por sectores y por casillas)
  06-main.js      Jugador, necesidades, encargos, entrada (teclado/puntero/táctil), panel, cámara, bucle principal
build.sh          Concatena parts/ en game.js
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

## Controles

| Acción | Teclado | Táctil |
| --- | --- | --- |
| Caminar | WASD o flechas | Palanca |
| Correr | Shift | Palanca al máximo |
| Saltar | Espacio | Botón Saltar |
| Interactuar / truco | E | Botón de acción |
| Personalizar | C | Botón Personalizar |
| Diario (necesidades y encargos) | J | Tocar los medidores |
| Zoom | Rueda del mouse | Botón Acercar |

Clic o toque sobre Tamachin: hace un truco. Mover el puntero en círculos a su alrededor: se marea.

## Cuidados y encargos

- Tamachin tiene tres necesidades que bajan solas: **panza** (refri de casa, bayas del bosque), **energía** (siesta en la cama, fogata) y **diversión** (trucos, tele, fuente, platicar, acariciar animales). Si una queda baja, cambia su ánimo hasta que se recupera; no pasa nada peor.
- Encargos que salen de lo que dicen los vecinos: llevarle un conejo a Tofu, ver un pez saltarín, acompañar a Lulú a la fuente y llevarle gelatina del refri a Nube. El diario los lista.
- Se guardan forma, color, ánimo, necesidades y encargos (en `localStorage`).

## Mapa (unidades en metros)

- La cámara siempre mira al norte (−Z). La puerta de la casa mira al sur (+Z).
- Ciudad: X y Z entre −62 y 62. Calles en X = ±24 y Z = ±24.
- Casa: manzana central. Parque: manzana norte del centro, con el portón hacia el camino.
- Camino: de Z = −62 a Z = −160. Bosque: de Z = −160 a Z = −268, con el río cerca de Z = −205.
- Montañas: de Z = −268 a Z = −1288, X entre −340 y 340. Tres picos de 400 m: Malvavisco (X −300), Gelatina (X 0, Z −770) y Turrón (X 300). Un sendero sale del claro de la fogata, sube al Pico Gelatina y baja al pueblo.
- Valle Alegre: el pueblo, de Z = −1288 a Z = −1416 (centro en Z = −1352), con mercado al sur, kiosco en la plaza y posada con hamaca al norte.
- Bosque sin fin: al norte de Z = −1440, sin límite. Se genera por casillas de 26 m alrededor de Tamachin; tiene naranjas, manzanas, uvas, arándanos, sandías, fresas y granadas.
