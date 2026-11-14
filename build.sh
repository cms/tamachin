#!/usr/bin/env sh
# Regenera game.js a partir de parts/ (una sola IIFE, en orden).
# Con --staged no escribe nada: imprime en stdout el resultado de unir las partes preparadas en el índice (lo usa el hook pre-commit).
set -e
cd "$(dirname "$0")"
PARTS="parts/01-core.js parts/02-tamachin.js parts/03-world.js parts/04-life.js parts/05-norte.js parts/06-main.js"
if [ "$1" = "--staged" ]; then
  for p in $PARTS; do git cat-file blob ":$p"; done
  exit 0
fi
cat $PARTS > game.js
if command -v node >/dev/null 2>&1; then node --check game.js; fi
echo "game.js listo ($(wc -c < game.js) bytes)"
