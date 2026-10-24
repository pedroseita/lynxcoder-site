# Runbook — Site LynxCoder

Operação do `lynxcoder.com.br`. Assume acesso SSH ao VPS e que o Traefik já
corre na rede Docker externa `proxy`.

## Topologia

Três containers; site e manutenção nunca a servir ao mesmo tempo de forma ambígua:

| Container | Routers Traefik | Prioridade | Serve |
|---|---|---|---|
| `lynxcoder-site` | `lynx-site`, `lynx-site-http` | 10 | o site, 200 |
| `lynxcoder-maintenance` | `lynx-maint`, `lynx-maint-http` | 100 | página de manutenção, **503** |
| `lynxcoder-onboarding` | `lynx-api` (só `/api/` no apex), `lynx-admin` (`admin.`) | 20 | API dos formulários + painel admin |

A API sobe e desce junto com o site (mesmo compose, `infra/docker-compose.yml`).
Durante a manutenção o router `lynx-maint` (100) também apanha `/api/`, por isso
não entram pedidos com o site em baixo.

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

`src/index.html` tem um `<form>` que faz **POST nativo do browser** (sem JS)
para `/api/contato` (`api/routes/contato.js`). A mensagem é gravada em
`/data/mensagens/<id>.json`, aparece no painel e, com SMTP configurado, chega
por e-mail com `Reply-To` do remetente. Sucesso → `303` para `/obrigado.html`;
erro → página HTML curta com o motivo e link de volta ao formulário.

- `website`: honeypot anti-spam. Fica fora de ecrã via `.hp`, nunca com
  `display:none` (muitos bots ignoram campos escondidos assim). Se vier
  preenchido, a API finge sucesso e descarta.
- Limite por IP e por hora: 5 mensagens aceites e 20 tentativas.

## Formulário de início de projeto (`/comecar`)

Página `src/comecar.html` + `src/assets/js/comecar.js`. Envia em multipart para
`POST /api/onboarding`, servido pelo container `lynxcoder-onboarding` (`api/`).

A API valida tudo de novo, confirma o tipo real de cada ficheiro pelos bytes,
e grava cada pedido numa pasta do volume `lynxcoder-site_onboarding-data`:

```
/data/pedidos/<AAAAMMDD-HHMM-xxxxxx>/
├── dados.json     tudo o que o cliente preencheu
├── resumo.txt     o mesmo, legível
├── logo.<ext>     se enviou
├── foto-01.jpg …  3 a 12 fotos (já reduzidas no browser para ≤ 2400 px)
└── retrato.<ext>  se enviou
```

> **Nunca correr `docker compose down -v`** — o `-v` apaga o volume e todos os
> pedidos recebidos. `down` sem `-v` (o que os scripts usam) mantém-nos.

O normal é tratar tudo no painel (ver abaixo). Para ver e copiar os pedidos
direto no VPS:

```bash
docker exec lynxcoder-onboarding ls /data/pedidos
docker exec lynxcoder-onboarding cat /data/pedidos/<id>/resumo.txt
docker cp lynxcoder-onboarding:/data/pedidos/<id> /root/pedidos/
```

### Aviso por e-mail (opcional)

Sem configuração, os pedidos são gravados na mesma, só não chega e-mail. Para
receber o resumo no Gmail, criar uma **senha de app** na conta Google
(Segurança → Verificação em duas etapas → Senhas de app) e, no VPS:

```bash
cat > /root/lynxcoder-site/infra/onboarding.env <<'ENV'
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=devlynxcoder@gmail.com
SMTP_PASS=<senha de app de 16 letras>
NOTIFY_TO=devlynxcoder@gmail.com
ENV
chmod 600 /root/lynxcoder-site/infra/onboarding.env
docker compose -f /root/lynxcoder-site/infra/docker-compose.yml up -d onboarding
```

O ficheiro está no `.gitignore`: nunca o commitar. O e-mail leva `Reply-To`
com o e-mail do cliente, por isso "Responder" vai direto para ele.

### Limites

- Por IP e por hora: 5 pedidos aceites e 20 tentativas (na API) + 30 pedidos/min
  no Traefik.
- Logotipo até 5 MB (PNG, JPG, WEBP, SVG); fotos até 8 MB cada, máximo 12;
  corpo total até ~125 MB (acima disso o Traefik responde 413).
- Os extras da etapa 2 estão no topo de `comecar.js` (`EXTRAS`); a API aceita
  qualquer id curto, por isso basta editar essa lista.

## Painel admin (`admin.lynxcoder.com.br`)

Servido pelo container `lynxcoder-onboarding` (`api/routes/admin.js` +
`api/admin/`). Lista pedidos do `/comecar` e mensagens de contato, com
situação, notas internas, fotos, download em ZIP e exclusão (direito de
eliminação da LGPD). Mostra também os últimos posts do blog (Hashnode).

### DNS

Registo **A** `admin` → IP do VPS, no Registro.br (onde está o DNS do
domínio). O certificado HTTPS é emitido sozinho pelo Traefik na primeira visita.

### Criar / trocar o acesso

```bash
docker exec -it lynxcoder-onboarding node tools/admin-setup.js
```

Pede utilizador e senha (mín. 12 caracteres), mostra um QR code para a app
autenticadora e só grava depois de um código válido. Correr de novo substitui o
acesso (útil se perder o celular). As credenciais ficam em
`/data/admin/credentials.json` (hash scrypt + segredo TOTP), no volume, nunca no git.

### Segurança

- Login = utilizador + senha + código de 6 dígitos.
- 5 falhas por IP em 15 min bloqueiam esse IP 15 min.
- Sessão em memória: expira com 2 h sem uso ou 12 h no total. Reiniciar o
  container termina todas as sessões.
- Só responde no host `admin.lynxcoder.com.br`; noutro host as rotas não existem.
- CSP estrita, `noindex`, `no-store`; SVG enviados por clientes são servidos com
  `sandbox` (não correm scripts mesmo abertos diretamente).
- Não sai do ar com o modo de manutenção (`maintenance-on.sh` só derruba o site).

## Subir o HSTS

Hoje está em `stsSeconds=300` de propósito, para poder reverter depressa.
Depois de confirmar HTTPS estável no apex, no `www` **e** no
`blog.lynxcoder.com.br`, subir em `infra/docker-compose.yml` para `31536000`.

Não adicionar `stsIncludeSubdomains` antes de **todos** os subdomínios terem
HTTPS válido — um subdomínio em HTTP fica inacessível e o HSTS é cacheado
pelos browsers durante o max-age inteiro.
