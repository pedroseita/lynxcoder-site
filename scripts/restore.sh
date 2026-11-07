#!/bin/bash
set -euo pipefail
# Restaura a partir de um backup (scripts/backup.sh).
#
# Dados da API:
#   bash scripts/restore.sh                       # lista os backups locais
#   bash scripts/restore.sh latest                # restaura o mais recente
#   bash scripts/restore.sh /caminho/arquivo.tar.gz
#
# Páginas dos clientes (/root/lynxsites):
#   bash scripts/restore.sh paginas               # lista os backups das páginas
#   bash scripts/restore.sh paginas latest
#   bash scripts/restore.sh paginas /caminho/lynxsites-paginas-<data>.tar.gz
#
# Para restaurar uma cópia do Google Drive, primeiro traga-a para o VPS
# (docs/runbook.md › Backups › Restaurar). Pede confirmação antes de alterar.

SITE_DIR="${LYNX_SITE_DIR:-/root/lynxcoder-site}"
ENV_FILE="$SITE_DIR/infra/backup.env"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
VOLUME="${BACKUP_VOLUME:-lynxcoder-site_onboarding-data}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups/lynxcoder}"
CONTAINER="lynxcoder-onboarding"
SITES_DIR="${LYNXSITES_DIR:-/root/lynxsites}"

# ---------- páginas dos clientes ----------
if [ "${1:-}" = "paginas" ]; then
  if [ $# -lt 2 ]; then
    echo "Backups das páginas em $BACKUP_DIR:"
    ls -1t "$BACKUP_DIR"/lynxsites-paginas-*.tar.gz 2>/dev/null || echo "  (nenhum)"
    echo
    echo "Uso: bash scripts/restore.sh paginas latest | <arquivo.tar.gz>"
    exit 0
  fi
  if [ "$2" = "latest" ]; then
    FILE="$(ls -1t "$BACKUP_DIR"/lynxsites-paginas-*.tar.gz 2>/dev/null | head -1)"
    [ -n "$FILE" ] || { echo "Nenhum backup das páginas em $BACKUP_DIR"; exit 1; }
  else
    FILE="$2"
  fi
  [ -f "$FILE" ] || { echo "Arquivo não encontrado: $FILE"; exit 1; }
  NOME="$(basename "$SITES_DIR")"
  tar tzf "$FILE" >/dev/null || { echo "Arquivo corrompido: $FILE"; exit 1; }
  # Só aceita arquivos com tudo dentro de <pasta das páginas>/, como os do backup.sh.
  if tar tzf "$FILE" | grep -qv "^$NOME/"; then echo "Arquivo inesperado: nem tudo está dentro de $NOME/"; exit 1; fi

  ANTIGA="$SITES_DIR.antes-de-restaurar-$(date '+%Y%m%d-%H%M%S')"
  echo "Vai SUBSTITUIR as páginas publicadas em $SITES_DIR"
  echo "pelo conteúdo de: $FILE"
  echo "A pasta atual não é apagada: fica guardada em $ANTIGA"
  read -r -p "Escreva RESTAURAR para continuar: " CONFIRM
  [ "$CONFIRM" = "RESTAURAR" ] || { echo "Cancelado. Nada foi alterado."; exit 1; }

  [ -d "$SITES_DIR" ] && mv "$SITES_DIR" "$ANTIGA"
  tar xzf "$FILE" -C "$(dirname "$SITES_DIR")"
  # O container tinha montado a pasta antiga (que mudou de nome): reiniciar para ver a nova.
  docker restart lynxsites-paginas >/dev/null
  echo "✔ Páginas restauradas a partir de $(basename "$FILE")"
  echo "  Quando confirmar que está tudo bem: rm -rf $ANTIGA"
  exit 0
fi

# ---------- dados da API ----------
if [ $# -eq 0 ]; then
  echo "Backups locais em $BACKUP_DIR:"
  ls -1t "$BACKUP_DIR"/lynxcoder-data-*.tar.gz 2>/dev/null || echo "  (nenhum)"
  echo
  echo "Uso: bash scripts/restore.sh latest | <arquivo.tar.gz>"
  echo "     bash scripts/restore.sh paginas [latest | <arquivo.tar.gz>]"
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
BACKUP_RCLONE_REMOTE="" BACKUP_PREFIX="lynxcoder-antes-de-restaurar" BACKUP_PAGES_PREFIX="lynxsites-antes-de-restaurar" bash "$SITE_DIR/scripts/backup.sh"

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
