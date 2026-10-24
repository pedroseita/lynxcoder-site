#!/bin/bash
set -euo pipefail
# Põe a página de manutenção à frente do site.
#
# Ordem deliberada: SOBE a manutenção primeiro, só depois derruba o site.
# Como a manutenção tem priority 100 e o site 10, o Traefik passa a servi-la no
# instante em que fica saudável — zero segundos sem resposta. A ordem inversa
# (down do site primeiro) deixava o domínio a dar erro durante o build.

SITE_DIR="${LYNX_SITE_DIR:-/root/lynxcoder-site}"
cd "$SITE_DIR"

echo ">>> A subir a página de manutenção (ganha o routing por prioridade)..."
docker compose -f infra/maintenance/docker-compose.yml up -d --build

echo ">>> A aguardar que o Traefik a assuma..."
sleep 3

echo ">>> A derrubar o site principal (a API e o painel admin continuam no ar)..."
docker compose -f infra/docker-compose.yml rm -s -f site

echo "✔ Modo manutenção activo — lynxcoder.com.br devolve 503 + página de manutenção"
