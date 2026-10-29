#!/bin/bash
set -euo pipefail
# Página de TESTE em <nome>.lynxsites.com.br (padrão: pedroeletricista), para
# testar o percurso completo antes de um cliente real. Usa o exemplo do
# eletricista com outro nome; o WhatsApp continua fictício (modo demonstração).
#
#   bash scripts/cliente-teste.sh              cria e publica
#   bash scripts/cliente-teste.sh --remover    apaga e tira do ar
#
# Antes: registo A "<nome>" -> IP do VPS na zona lynxsites.com.br (Registro.br).
# Só apaga pastas criadas por este script (marcadas com .teste-lynxcoder).

SITE_DIR="${LYNX_SITE_DIR:-/root/lynxcoder-site}"
SITES_DIR="${LYNXSITES_DIR:-/root/lynxsites}"
NOME="pedroeletricista"
ACAO="criar"
for arg in "$@"; do
  case "$arg" in
    --remover) ACAO="remover" ;;
    *) NOME="$arg" ;;
  esac
done
if ! [[ "$NOME" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "Nome inválido: \"$NOME\" (só letras minúsculas, números e hífen)" >&2
  exit 1
fi
DEST="$SITES_DIR/$NOME"
MARCA="$DEST/.teste-lynxcoder"

if [ "$ACAO" = "remover" ]; then
  if [ ! -d "$DEST" ]; then echo "Não existe $DEST: nada a remover."; exit 0; fi
  if [ ! -f "$MARCA" ]; then
    echo "!!! $DEST não foi criada por este script (é de um cliente real?). Não apago." >&2
    exit 1
  fi
  rm -rf "$DEST"
  echo "✔ Pasta de teste removida: $DEST"
  bash "$SITE_DIR/scripts/lynxsites.sh"
  echo "Lembrete: apague também o registo \"$NOME\" no Registro.br."
  exit 0
fi

if [ -d "$DEST" ] && [ ! -f "$MARCA" ]; then
  echo "!!! $DEST já existe e não é uma página de teste. Não mexo." >&2
  exit 1
fi

echo ">>> A montar a página de teste em $DEST ..."
mkdir -p "$DEST"
cp -r "$SITE_DIR/src/assets" "$DEST/"
cp "$SITE_DIR/src/favicon.ico" "$DEST/"
# Mesmo exemplo, outro nome; os links "/" do exemplo apontavam para o site da
# LynxCoder (aqui "/" é a própria página do cliente).
sed -e 's/Duarte Elétrica/Pedro Eletricista/g' \
    -e 's/Duarte/Pedro/g' \
    -e 's#href="/"#href="https://lynxcoder.com.br/"#g' \
    -e 's#href="/\#contato"#href="https://lynxcoder.com.br/\#contato"#g' \
    "$SITE_DIR/src/exemplos/eletricista.html" > "$DEST/index.html"
date -u +%FT%TZ > "$MARCA"

bash "$SITE_DIR/scripts/lynxsites.sh"
echo ""
echo "Se apareceu \"✔ https://$NOME.lynxsites.com.br\" acima, abra o endereço (o HTTPS"
echo "pode levar um minuto na primeira visita). Se apareceu o aviso de DNS, espere o"
echo "Registro.br publicar o registo e corra este script de novo."
