#!/bin/bash
set -euo pipefail
# Faz pull das alterações do GitHub e reconstrói o container do site.
# Caminho configurável por env var em vez de hardcoded.

SITE_DIR="${LYNX_SITE_DIR:-/root/lynxcoder-site}"
cd "$SITE_DIR"

echo ">>> Pull do GitHub..."
git pull origin main

echo ">>> Rebuild e restart do container..."
docker compose -f infra/docker-compose.yml up -d --build

# O container de manutenção tem priority 100 contra os 10 do site, por isso
# continuaria a ganhar o routing mesmo depois deste deploy. Avisar em vez de
# derrubar sozinho: desligar a manutenção é uma decisão explícita.
if docker ps --format '{{.Names}}' | grep -q '^lynxcoder-maintenance$'; then
  echo ""
  echo "!!! ATENÇÃO: o modo de manutenção está ACTIVO."
  echo "    O site novo já está no ar mas escondido atrás da página de manutenção."
  echo "    Corre ./scripts/maintenance-off.sh para o expor."
  exit 0
fi

echo "✔ Deploy concluído — site actualizado em lynxcoder.com.br"
