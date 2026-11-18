#!/usr/bin/env sh
# Regenera game.js a partir de parts/ y mundos/ (una sola IIFE, en orden): los mundos (mundos/*.js, en orden alfabético) van entre
# 05-norte.js y 06-main.js, así usan todo lo de antes y 06-main.js los encuentra ya registrados.
# Con --staged no escribe nada: imprime en stdout el resultado de unir las partes preparadas en el índice (lo usa el hook pre-commit).
set -e
cd "$(dirname "$0")"
BEFORE="parts/01-core.js parts/02-tamachin.js parts/03-world.js parts/04-life.js parts/05-norte.js"
AFTER="parts/06-main.js"
if [ "$1" = "--staged" ]; then
  for p in $BEFORE $(git ls-files -- 'mundos/*.js' | sort) $AFTER; do git cat-file blob ":$p"; done
  exit 0
fi
cat $BEFORE $(ls mundos/*.js 2>/dev/null | sort) $AFTER > game.js
if command -v node >/dev/null 2>&1; then node --check game.js; fi
echo "game.js listo ($(wc -c < game.js) bytes)"
