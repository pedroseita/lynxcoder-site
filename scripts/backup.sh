#!/bin/bash
set -euo pipefail
# Backup diário de duas coisas, com a mesma data no nome:
#   - dados da API (pedidos, fotos, mensagens, propostas, compras, configurações e
#     acesso aos painéis): volume Docker lynxcoder-site_onboarding-data
#     -> lynxcoder-data-<data>.tar.gz
#   - páginas publicadas dos clientes: pasta /root/lynxsites
#     -> lynxsites-paginas-<data>.tar.gz
# O código não entra: está no GitHub.
#
#   1. tar.gz do volume (sem a pasta tmp/ de envios a decorrer) e da pasta das páginas
#   2. confirma que os arquivos abrem
#   3. guarda BACKUP_KEEP_DAYS dias no VPS
#   4. se houver um remote rclone configurado, envia uma cópia (criptografada
#      pelo remote "crypt") e apaga lá as cópias com mais de BACKUP_REMOTE_DAYS
#
# Configuração opcional em infra/backup.env (fora do git). Ver docs/runbook.md.
# Agendado pelo cron (docs/runbook.md › Backups).

SITE_DIR="${LYNX_SITE_DIR:-/root/lynxcoder-site}"
ENV_FILE="$SITE_DIR/infra/backup.env"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

VOLUME="${BACKUP_VOLUME:-lynxcoder-site_onboarding-data}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups/lynxcoder}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
REMOTE="${BACKUP_RCLONE_REMOTE:-}"           # ex.: lynxbackup:
REMOTE_DAYS="${BACKUP_REMOTE_DAYS:-60}"
RCLONE_CONFIG_DIR="${BACKUP_RCLONE_CONFIG_DIR:-/root/.config/rclone}"
RCLONE_IMAGE="${BACKUP_RCLONE_IMAGE:-rclone/rclone:1.68}"
# "lynxcoder-data" nos backups normais; o restore.sh usa outro prefixo para o
# backup de segurança, que assim nunca é escolhido como "o mais recente".
PREFIX="${BACKUP_PREFIX:-lynxcoder-data}"
PAGES_PREFIX="${BACKUP_PAGES_PREFIX:-lynxsites-paginas}"
SITES_DIR="${LYNXSITES_DIR:-/root/lynxsites}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

docker volume inspect "$VOLUME" >/dev/null 2>&1 || { log "ERRO: volume $VOLUME não existe"; exit 1; }
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

TS="$(date '+%Y%m%d-%H%M%S')"
NAME="$PREFIX-$TS.tar.gz"
PNAME="$PAGES_PREFIX-$TS.tar.gz"
log "A criar $NAME"
# Os ficheiros da API são escritos de forma atómica (ficheiro temporário +
# rename), por isso uma cópia com o container a correr fica consistente.
docker run --rm \
  -v "$VOLUME":/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine:3.20 \
  tar czf "/backup/$NAME" --exclude=./tmp -C /data .

chmod 600 "$BACKUP_DIR/$NAME"
tar tzf "$BACKUP_DIR/$NAME" >/dev/null || { log "ERRO: o arquivo criado está corrompido"; rm -f "$BACKUP_DIR/$NAME"; exit 1; }
SIZE="$(du -h "$BACKUP_DIR/$NAME" | cut -f1)"
log "OK local: $BACKUP_DIR/$NAME ($SIZE)"

# Páginas dos clientes: ficheiros estáticos numa pasta do VPS (sem container).
if [ -d "$SITES_DIR" ]; then
  log "A criar $PNAME"
  tar czf "$BACKUP_DIR/$PNAME" -C "$(dirname "$SITES_DIR")" "$(basename "$SITES_DIR")"
  chmod 600 "$BACKUP_DIR/$PNAME"
  tar tzf "$BACKUP_DIR/$PNAME" >/dev/null || { log "ERRO: o arquivo das páginas está corrompido"; rm -f "$BACKUP_DIR/$PNAME"; exit 1; }
  log "OK local: $BACKUP_DIR/$PNAME ($(du -h "$BACKUP_DIR/$PNAME" | cut -f1))"
else
  PNAME=""
  log "AVISO: a pasta das páginas $SITES_DIR não existe; só os dados da API"
fi

find "$BACKUP_DIR" -maxdepth 1 \( -name 'lynxcoder-*.tar.gz' -o -name 'lynxsites-*.tar.gz' \) -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/  apagado (local): /'

if [ -n "$REMOTE" ] && [ "$PREFIX" = "lynxcoder-data" ]; then
  log "A enviar para $REMOTE"
  for F in "$NAME" $PNAME; do
    docker run --rm \
      -v "$RCLONE_CONFIG_DIR":/config/rclone \
      -v "$BACKUP_DIR":/data:ro \
      "$RCLONE_IMAGE" copy "/data/$F" "$REMOTE" --quiet
  done
  docker run --rm \
    -v "$RCLONE_CONFIG_DIR":/config/rclone \
    "$RCLONE_IMAGE" delete "$REMOTE" --min-age "${REMOTE_DAYS}d" --include 'lynxcoder-data-*.tar.gz' --include 'lynxsites-paginas-*.tar.gz' --quiet
  log "OK remoto: $REMOTE$NAME${PNAME:+ e $PNAME}"
elif [ "$PREFIX" = "lynxcoder-data" ]; then
  log "AVISO: sem cópia externa (BACKUP_RCLONE_REMOTE vazio em $ENV_FILE)"
fi

[ "$PREFIX" = "lynxcoder-data" ] && date '+%Y-%m-%d %H:%M:%S' > "$BACKUP_DIR/.ultimo-backup-ok"
log "Backup concluído"
