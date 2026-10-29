#!/bin/bash
set -euo pipefail
# Páginas dos clientes em <nome>.lynxsites.com.br.
#
# Cada pasta em $LYNXSITES_DIR (padrão /root/lynxsites) é um cliente:
#   /root/lynxsites/quentinhas/index.html  ->  https://quentinhas.lynxsites.com.br
#
# Este script gera um router Traefik por cliente (cada um com o seu
# certificado) em infra/lynxsites/clientes.yml e sobe o container.
# Correr depois de criar ou apagar a pasta de um cliente; o deploy.sh também
# o corre. Mudar só os ficheiros de uma pasta que já existe não precisa dele.
#
# Uma pasta cujo nome ainda não aponta para o VPS no DNS fica de fora, com
# aviso: um router sem DNS fazia o Let's Encrypt falhar em repetição. Criar o
# registo A no Registro.br e correr o script de novo.

SITE_DIR="${LYNX_SITE_DIR:-/root/lynxcoder-site}"
export LYNXSITES_DIR="${LYNXSITES_DIR:-/root/lynxsites}"
VPS_IP="${LYNXSITES_IP:-187.127.22.113}"
DOMINIO="lynxsites.com.br"
cd "$SITE_DIR"

OUT="infra/lynxsites/clientes.yml"
mkdir -p "$LYNXSITES_DIR"

labels=""
ativos=0
for dir in "$LYNXSITES_DIR"/*/; do
  [ -d "$dir" ] || continue
  nome="$(basename "$dir")"
  if ! [[ "$nome" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    echo "  ! Ignorado: \"$nome\" (use só letras minúsculas, números e hífen)" >&2
    continue
  fi
  if [ ! -f "$dir/index.html" ]; then
    echo "  ! $nome: falta o index.html, fica de fora por agora" >&2
    continue
  fi
  host="$nome.$DOMINIO"
  ip="$(getent ahostsv4 "$host" | awk 'NR==1 { print $1 }' || true)"
  if [ "$ip" != "$VPS_IP" ]; then
    echo "  ! $host ainda não aponta para $VPS_IP no DNS (agora: ${ip:-sem registo})." >&2
    echo "    Crie no Registro.br o registo A \"$nome\" -> $VPS_IP e corra este script de novo." >&2
    continue
  fi
  r="lynxsites-$nome"
  labels+="      - \"traefik.http.routers.$r.rule=Host(\`$host\`)\""$'\n'
  labels+="      - \"traefik.http.routers.$r.entrypoints=websecure\""$'\n'
  labels+="      - \"traefik.http.routers.$r.tls.certresolver=letsencrypt\""$'\n'
  labels+="      - \"traefik.http.routers.$r.service=lynxsites\""$'\n'
  labels+="      - \"traefik.http.routers.$r.middlewares=lynxsites-hsts\""$'\n'
  labels+="      - \"traefik.http.routers.$r-http.rule=Host(\`$host\`)\""$'\n'
  labels+="      - \"traefik.http.routers.$r-http.entrypoints=web\""$'\n'
  labels+="      - \"traefik.http.routers.$r-http.service=lynxsites\""$'\n'
  labels+="      - \"traefik.http.routers.$r-http.middlewares=lynxsites-to-https\""$'\n'
  ativos=$((ativos + 1))
  echo "  ✔ https://$host"
done

# Escreve num temporário e renomeia: nunca deixa o ficheiro a meio.
{
  echo "# GERADO por scripts/lynxsites.sh a partir das pastas em $LYNXSITES_DIR. Não editar."
  echo "services:"
  echo "  paginas:"
  echo "    labels:"
  echo "      - \"lynxsites.clientes=$ativos\""
  printf '%s' "$labels"
} > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"

echo ">>> A subir as páginas dos clientes ($ativos no ar)..."
docker compose -f infra/lynxsites/docker-compose.yml -f "$OUT" up -d --build

echo "✔ lynxsites.com.br atualizado"
