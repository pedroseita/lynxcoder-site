#!/bin/bash
# Tira o site do ar e mostra a página de manutenção

SITE_DIR="/root/lynxcoder-site"
PLACEHOLDER_DIR="/root/lynxcoder"

echo ">>> A parar o site principal..."
cd "$SITE_DIR" && docker compose down

echo ">>> A iniciar página de manutenção..."
cd "$PLACEHOLDER_DIR" && docker compose up -d

echo "✔ Modo manutenção activo — lynxcoder.com.br mostra página de construção"
