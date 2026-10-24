#!/bin/bash
set -euo pipefail
# Restaura os dados da API a partir de um backup.
#
#   bash scripts/restore.sh                       # lista os backups locais
#   bash scripts/restore.sh latest                # restaura o mais recente
#   bash scripts/restore.sh /caminho/arquivo.tar.gz
#
# Para restaurar uma cópia do Google Drive, primeiro traga-a para o VPS
# (docs/runbook.md › Backups › Restaurar). Pede confirmação antes de apagar.

SITE_DIR="${LYNX_SITE_DIR:-/root/lynxcoder-site}"
ENV_FILE="$SITE_DIR/infra/backup.env"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
VOLUME="${BACKUP_VOLUME:-lynxcoder-site_onboarding-data}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups/lynxcoder}"
CONTAINER="lynxcoder-onboarding"

if [ $# -eq 0 ]; then
  echo "Backups locais em $BACKUP_DIR:"
  ls -1t "$BACKUP_DIR"/lynxcoder-data-*.tar.gz 2>/dev/null || echo "  (nenhum)"
  echo
  echo "Uso: bash scripts/restore.sh latest | <arquivo.tar.gz>"
  exit 0
fi

if [ "$1" = "latest" ]; then
  FILE="$(ls -1t "$BACKUP_DIR"/lynxcoder-data-*.tar.gz 2>/dev/null | head -1)"
  [ -n "$FILE" ] || { echo "Nenhum backup em $BACKUP_DIR"; exit 1; }
else
  FILE="$1"
fi
[ -f "$FILE" ] || { echo "Arquivo não encontrado: $FILE"; exit 1; }
tar tzf "$FILE" >/dev/null || { echo "Arquivo corrompido: $FILE"; exit 1; }

echo "Vai SUBSTITUIR todos os dados atuais (pedidos, mensagens, propostas, painel)"
echo "pelo conteúdo de: $FILE"
echo "Antes disso é feito um backup do estado atual, por segurança."
read -r -p "Escreva RESTAURAR para continuar: " CONFIRM
[ "$CONFIRM" = "RESTAURAR" ] || { echo "Cancelado. Nada foi alterado."; exit 1; }

echo ">>> Backup de segurança do estado atual..."
BACKUP_RCLONE_REMOTE="" BACKUP_PREFIX="lynxcoder-antes-de-restaurar" bash "$SITE_DIR/scripts/backup.sh"

echo ">>> A parar a API..."
docker stop "$CONTAINER" >/dev/null 2>&1 || true

echo ">>> A restaurar..."
DIR="$(cd "$(dirname "$FILE")" && pwd)"
docker run --rm \
  -v "$VOLUME":/data \
  -v "$DIR":/backup:ro \
  alpine:3.20 \
  sh -c "find /data -mindepth 1 -delete && tar xzf /backup/$(basename "$FILE") -C /data && chown -R 1000:1000 /data"

echo ">>> A arrancar a API..."
docker compose -f "$SITE_DIR/infra/docker-compose.yml" up -d onboarding

echo "✔ Restauro concluído a partir de $(basename "$FILE")"
