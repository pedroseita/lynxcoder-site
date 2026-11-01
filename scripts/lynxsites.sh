#!/bin/bash
set -euo pipefail
# Páginas dos clientes em <nome>.lynxsites.com.br.
#
# Cada pasta em $LYNXSITES_DIR (padrão /root/lynxsites) é um cliente:
#   /root/lynxsites/quentinhas/index.html  ->  https://quentinhas.lynxsites.com.br
#
# O DNS tem um registo * (Cloudflare) e o Traefik um só certificado
# *.lynxsites.com.br com um só router para todos: publicar um cliente é só
# criar a pasta, sem correr nada. Este script sobe o container (o deploy.sh
# também o corre) e avisa de pastas que o nginx nunca vai servir.

SITE_DIR="${LYNX_SITE_DIR:-/root/lynxcoder-site}"
export LYNXSITES_DIR="${LYNXSITES_DIR:-/root/lynxsites}"
DOMINIO="lynxsites.com.br"
cd "$SITE_DIR"

mkdir -p "$LYNXSITES_DIR"
# Restos do tempo de um router por cliente.
rm -f infra/lynxsites/clientes.yml infra/lynxsites/clientes.yml.tmp

# Nomes reservados (painel, admin, api…): fonte única em api/lib/reservados.txt.
RESERVADOS=" $(sed -e 's/#.*//' -e 's/[[:space:]]//g' api/lib/reservados.txt | grep -v '^$' | tr '\n' ' ') "

ativos=0
for dir in "$LYNXSITES_DIR"/*/; do
  [ -d "$dir" ] || continue
  nome="$(basename "$dir")"
  if ! [[ "$nome" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    echo "  ! Ignorado: \"$nome\" (use só letras minúsculas, números e hífen)" >&2
    continue
  fi
  if [[ "$RESERVADOS" == *" $nome "* ]]; then
    echo "  ! Ignorado: \"$nome\" é um endereço reservado da LynxSites (api/lib/reservados.txt)" >&2
    continue
  fi
  if [ ! -f "$dir/index.html" ]; then
    echo "  ! $nome: falta o index.html, fica de fora por agora" >&2
    continue
  fi
  ativos=$((ativos + 1))
  echo "  ✔ https://$nome.$DOMINIO"
done

echo ">>> A subir as páginas dos clientes ($ativos no ar)..."
docker compose -f infra/lynxsites/docker-compose.yml up -d --build

echo "✔ lynxsites.com.br atualizado"
