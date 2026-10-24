#!/bin/bash
set -euo pipefail
# Devolve o site ao ar e remove a página de manutenção.
#
# Ordem deliberada: SOBE o site primeiro e só depois derruba a manutenção.
# Enquanto a manutenção existe ela ganha (priority 100), por isso o site pode
# ficar a aquecer sem ninguém ver um estado intermédio.

SITE_DIR="${LYNX_SITE_DIR:-/root/lynxcoder-site}"
cd "$SITE_DIR"

echo ">>> A subir o site principal..."
docker compose -f infra/docker-compose.yml up -d --build

echo ">>> A aguardar que o container fique saudável..."
for i in $(seq 1 20); do
  status="$(docker inspect -f '{{.State.Health.Status}}' lynxcoder-site 2>/dev/null || echo unknown)"
  [ "$status" = "healthy" ] && break
  sleep 2
done
echo "    estado: ${status:-unknown}"

echo ">>> A remover a página de manutenção..."
docker compose -f infra/maintenance/docker-compose.yml down

echo "✔ Site no ar — lynxcoder.com.br está acessível"
