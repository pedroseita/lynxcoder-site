#!/bin/bash
# Faz pull das alterações do GitHub e reconstrói o container

SITE_DIR="/root/lynxcoder-site"

echo ">>> A fazer pull do GitHub..."
cd "$SITE_DIR" && git pull origin main

echo ">>> A reconstruir e reiniciar o container..."
docker compose up -d --build

echo "✔ Deploy concluído — site actualizado em lynxcoder.com.br"
