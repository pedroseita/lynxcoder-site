# Runbook — Site LynxCoder

Operação do `lynxcoder.com.br`. Assume acesso SSH ao VPS e que o Traefik já
corre na rede Docker externa `proxy`.

## Topologia

Dois containers, nunca os dois a servir ao mesmo tempo de forma ambígua:

| Container | Routers Traefik | Prioridade | Serve |
|---|---|---|---|
| `lynxcoder-site` | `lynx-site`, `lynx-site-http` | 10 | o site, 200 |
| `lynxcoder-maintenance` | `lynx-maint`, `lynx-maint-http` | 100 | página de manutenção, **503** |

A prioridade é o mecanismo central: enquanto o container de manutenção existir,
**ganha sempre**. Isto torna o estado determinístico e permite transições sem
downtime (sobe-se o novo antes de derrubar o velho).

> **Nunca reutilizar nomes de router entre os dois composes.** Era o que havia
> antes: ambos declaravam `lynxcoder`/`lynxcoder-http`, e com os dois no ar o
> Traefik descartava um deles de forma não-determinística — o site podia ficar
> escondido ou a manutenção podia desaparecer, mudando a cada reload do provider.

## Tarefas

### Deploy de uma alteração

```bash
cd /root/lynxcoder-site
./scripts/deploy.sh
```

Faz `git pull origin main` e `docker compose up -d --build`. Se o modo de
manutenção estiver activo, o script avisa e **não** o desliga sozinho.

### Entrar em manutenção

```bash
./scripts/maintenance-on.sh
```

Sobe a manutenção, espera 3s para o Traefik a assumir, e só então derruba o
site. Verificar:

```bash
curl -sI https://lynxcoder.com.br | head -1
# espera-se: HTTP/2 503
```

### Sair de manutenção

```bash
./scripts/maintenance-off.sh
```

Sobe o site, aguarda o healthcheck ficar `healthy` (até 40s), e só depois
remove a manutenção.

```bash
curl -sI https://lynxcoder.com.br | head -1
# espera-se: HTTP/2 200
```

### Rollback

Não há registry nem tags de imagem: o rollback é por git.

```bash
cd /root/lynxcoder-site
git log --oneline -10
git checkout SHA_BOM
docker compose -f infra/docker-compose.yml up -d --build
```

Depois de confirmar que está bom, voltar a um branch nomeado em vez de ficar
em detached HEAD:

```bash
git checkout main
git revert SHA_MAU
```

Se o deploy deixou o site em estado inutilizável, entrar em manutenção primeiro
e só depois investigar com calma.

## Verificações pós-deploy

```bash
# 404 real, não a homepage com 200  (regressão clássica deste site)
curl -sI https://lynxcoder.com.br/caminho-que-nao-existe | head -1   # 404

# security headers presentes na página E nos assets
curl -sI https://lynxcoder.com.br/ | grep -i content-security-policy
curl -sI https://lynxcoder.com.br/assets/css/styles.css | grep -i content-security-policy

# www redirecciona para o apex
curl -sI https://www.lynxcoder.com.br/ | head -3                     # 301 -> apex

# healthcheck
docker inspect -f '{{.State.Health.Status}}' lynxcoder-site
```

Se o header de CSP aparecer na página mas **não** no CSS: alguém acrescentou um
`add_header` dentro de um `location` sem repetir o `include`. No nginx, qualquer
`add_header` num `location` anula a herança de todos os headers do bloco
`server`. É por isso que `infra/nginx.conf` repete
`include /etc/nginx/snippets/security-headers.conf` dentro do `location` dos
assets — e porque os headers vivem num ficheiro à parte em vez de copiados.

## Assets a gerar

Pendentes porque exigem ferramenta de imagem (ou o Danu/Ogma):

```bash
# favicon 32x32 e apple-touch-icon 180x180, a partir do logo
magick src/assets/img/logo.png -resize 32x32 src/favicon.ico
magick src/assets/img/logo.png -resize 180x180 src/apple-touch-icon.png

# capa Open Graph 1200x630 (fundo escuro, logo centrado) — provisória;
# o ideal é uma peça desenhada, não o logo esticado
magick -size 1200x630 "xc:#08090b" \
  "(" src/assets/img/logo.png -resize 260x260 ")" \
  -gravity center -composite \
  src/assets/img/og-cover.png
```

Depois de gerar a capa, trocar as metas `og:image` e `twitter:image` em
`src/index.html` (estão marcadas com `TODO`) para
`https://lynxcoder.com.br/assets/img/og-cover.png`.

`src/favicon.ico` (16/32/48) e `src/apple-touch-icon.png` (180, fundo #08090b) já
existem. Para os regenerar sem distorcer o logo (que não é quadrado), centrar
primeiro num quadrado: `-background none -gravity center -extent 484x484`.

## Formulário de contacto

`src/index.html` tem um `<form>` que faz **POST nativo do browser** para o
Web3Forms (`https://api.web3forms.com/submit`) — sem `fetch`, o que permite manter
`connect-src 'none'` na CSP. A CSP autoriza `form-action https://api.web3forms.com`.

- `access_key`: chave do Web3Forms associada a devlynxcoder@gmail.com. Não é
  segredo (só permite enviar para esse e-mail); para trocar o destino, gerar
  nova chave em <https://web3forms.com>.
- `redirect`: página de sucesso (`/obrigado.html`).
- `botcheck`: honeypot anti-spam. Fica fora de ecrã via `.hp`, nunca com
  `display:none` (muitos bots ignoram campos escondidos assim).

Depois de qualquer alteração ao formulário, testar um envio a sério e confirmar
a chegada do e-mail.

## Subir o HSTS

Hoje está em `stsSeconds=300` de propósito, para poder reverter depressa.
Depois de confirmar HTTPS estável no apex, no `www` **e** no
`blog.lynxcoder.com.br`, subir em `infra/docker-compose.yml` para `31536000`.

Não adicionar `stsIncludeSubdomains` antes de **todos** os subdomínios terem
HTTPS válido — um subdomínio em HTTP fica inacessível e o HSTS é cacheado
pelos browsers durante o max-age inteiro.
