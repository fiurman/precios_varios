#!/usr/bin/env bash
# Refresco automatico del catalogo: scrapea, empareja, publica.
#
# Pensado para cron, que arranca con un entorno casi vacio: no hereda el PATH
# de tu terminal ni sabe nada de fnm. Por eso la ruta de node va explicita.
set -uo pipefail

RAIZ="/home/fran/workspace/git2/precios_varios"
NODE_BIN="/home/fran/.local/share/fnm/node-versions/v24.13.0/installation/bin"
LOGS="$RAIZ/logs"

export PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$LOGS"
LOG="$LOGS/refresco-$(date +%Y-%m-%d).log"
MARCA="$LOGS/.ultimo-exito"
HOY="$(date +%Y-%m-%d)"

# Corre cada hora entre las 17 y las 22 porque la maquina no siempre esta
# prendida: seis intentos dan mucha mas chance de agarrarla que uno solo. Pero
# alcanza con que salga bien una vez, asi que si ya hubo exito hoy, se va.
if [ -f "$MARCA" ] && [ "$(cat "$MARCA")" = "$HOY" ]; then
  exit 0
fi

cd "$RAIZ" || exit 1

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="

  # La base corre en Docker. Si la maquina se reinicio hace poco puede no estar
  # lista todavia: esperamos hasta un minuto antes de rendirnos.
  for _ in $(seq 1 12); do
    docker compose exec -T db pg_isready -U precios >/dev/null 2>&1 && break
    sleep 5
  done

  if ! docker compose exec -T db pg_isready -U precios >/dev/null 2>&1; then
    echo "La base no responde. Se cancela el refresco."
    exit 1
  fi

  npm run refrescar
  CODIGO=$?
  echo "salida: $CODIGO"

  # Solo si salio bien: si fallo, el proximo intento de la ventana reintenta.
  if [ "$CODIGO" -eq 0 ]; then
    echo "$HOY" > "$MARCA"
  fi
} >> "$LOG" 2>&1

# Solo los ultimos 14 dias de logs.
find "$LOGS" -name 'refresco-*.log' -mtime +14 -delete 2>/dev/null
