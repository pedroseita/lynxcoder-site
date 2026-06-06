#!/bin/bash
# Desliga a página de manutenção e volta o site ao ar

SITE_DIR="/root/lynxcoder-site"
PLACEHOLDER_DIR="/root/lynxcoder"

echo ">>> A parar página de manutenção..."
cd "$PLACEHOLDER_DIR" && docker compose down

echo ">>> A iniciar site principal..."
cd "$SITE_DIR" && docker compose up -d

echo "✔ Site no ar — lynxcoder.com.br está acessível"
