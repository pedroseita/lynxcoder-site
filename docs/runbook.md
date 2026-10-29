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

### Manutenção pelo painel (recomendado)

Botão **Manutenção** no topo do painel (pede confirmação). A API cria a
bandeira `/flags/manutencao` num volume partilhado (`site-flags`); o nginx do
site passa a devolver `src/manutencao.html` com 503 + `Retry-After` em todas as
páginas (assets continuam), e a API recusa os formulários públicos com 503.
O painel continua a funcionar. Nenhum container é parado e o painel não tem
acesso ao Docker.

Pela linha de comandos, o mesmo efeito:

```bash
docker exec lynxcoder-onboarding sh -c 'echo "{}" > /flags/manutencao'   # ligar
docker exec lynxcoder-onboarding rm -f /flags/manutencao                  # desligar
```

Os scripts abaixo são para manutenção pesada do servidor (parar o site de vez).

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

## Propostas e convites para o formulário

Fluxo: painel → **+ Nova proposta** → enviar o link ao cliente (WhatsApp/e-mail)
→ o cliente aceita na própria página → pagamento da implantação → painel →
**Liberar formulário** → enviar o link do `/comecar`.

- Proposta: `lynxcoder.com.br/proposta#<token>`. Expira na validade definida
  (15 dias por omissão); aceite regista nome, plano, data, IP e navegador.
  "Cancelar link" desativa-a. "Ver como o cliente" abre com `?previa=1`, que
  não conta como visualização.
- O texto da proposta está em `api/lib/proposta-template.js` (não no site
  público). Os valores vêm de **Configurações** no painel e são copiados para a
  proposta no momento em que é criada: mudar a tabela não altera propostas já
  enviadas.
- Formulário: `lynxcoder.com.br/comecar#<token>`, válido 30 dias e para um
  único envio. Sem link válido o `/comecar` só mostra uma mensagem. O link
  pré-preenche negócio, e-mail, WhatsApp, o plano aceite e o que for
  preparado em "Personalizar formulário".
- Ao enviar o formulário, o cliente recebe um e-mail de confirmação com o
  resumo (requer o SMTP configurado).
- Dados: `/data/propostas/<id>.json` e `/data/config/proposta.json` no volume.

### Editar a proposta e o formulário pelo painel

Painel → **Configurações**:

- **Valores**: preços, prazos, contactos (`/data/config/proposta.json`).
- **Texto da proposta**: formato simples (`## título`, `- lista`, `**negrito**`,
  `| tabela |`, `[link](/caminho)`) com campos `{{…}}` trocados pelos valores.
  Guardado em `/data/config/proposta-texto.md`; vazio volta ao texto padrão
  (`api/lib/proposta-texto.js`). Cada proposta copia o texto ao ser criada.
- **Formulário**: extras (etapa 2), paletas (etapa 3) e os textos de cada
  etapa do `/comecar` (`/data/config/formulario.json`; dos textos só guarda os
  alterados, em branco volta ao padrão de `api/lib/formulario.js`).

Na **proposta** → **Personalizar formulário**: respostas adiantadas, extras e
paletas visíveis e um recado no topo, só para esse cliente (guardado na
própria proposta, em `formulario`). Editável até o cliente enviar. **Ver como
o cliente** abre `/comecar?previa=1#<token>`: sem rascunho e sem envio. Se o
cliente já tiver aberto o link, o rascunho no aparelho dele tem prioridade
sobre o pré-preenchimento.

No **pedido** → **Editar respostas**: corrige os dados enviados (com as mesmas
regras do formulário). A primeira correção guarda o original em
`dados.original.json`; o `resumo.txt` é refeito. Fotos e logotipo não mudam.

**Propostas de teste** (caixa "Proposta de teste" ou "Salvar e testar"):
mostram uma faixa de teste, não enviam e-mails, não contam nos números, e o
pedido feito a partir delas fica marcado `teste`. Filtro **Testes** na lista →
**Apagar todos os testes**.

## Páginas dos clientes (`lynxsites.com.br`)

Container `lynxsites-paginas`, num projeto Docker **à parte**
(`infra/lynxsites/docker-compose.yml`, projeto `lynxsites`): o deploy e a
manutenção do lynxcoder.com.br não lhe tocam, e o site em manutenção não
derruba as páginas dos clientes.

- Cada cliente é uma pasta no VPS: `/root/lynxsites/<nome>/index.html` →
  `https://<nome>.lynxsites.com.br`. O nome é o endereço escolhido no
  formulário (só minúsculas, números e hífen).
- `lynxsites.com.br` mostra a página de apresentação (`infra/lynxsites/inicio/`);
  `www.` redireciona para lá.
- O DNS está no Registro.br, que **não aceita `*`**: cada cliente precisa do seu
  registo A. Registos fixos: `lynxsites.com.br` (nome em branco) e `www`,
  ambos → `187.127.22.113`.

### Publicar um cliente

1. Registro.br → lynxsites.com.br → Configurar zona DNS → registo **A**
   `<nome>` → `187.127.22.113`.
2. No VPS, copiar a página para `/root/lynxsites/<nome>/` (com `index.html`).
3. `bash /root/lynxcoder-site/scripts/lynxsites.sh`

O script gera um router Traefik (e um certificado) por cliente em
`infra/lynxsites/clientes.yml` (não vai para o git) e sobe o container. Uma
pasta cujo nome ainda não aponta para o VPS fica de fora com aviso, para o
Let's Encrypt não falhar em repetição: criar o registo e correr de novo.
Atualizar ficheiros de um cliente que já está no ar não precisa do script.

Para tirar um cliente do ar: apagar (ou mover) a pasta e correr o script.

**Cliente de teste**: `bash /root/lynxcoder-site/scripts/cliente-teste.sh` monta
`pedroeletricista.lynxsites.com.br` a partir do exemplo do eletricista (WhatsApp
fictício) e publica; `… cliente-teste.sh --remover` tira-o do ar. Só apaga
pastas que ele próprio criou. Precisa do registo A `pedroeletricista` no DNS.

## Painel admin (`admin.lynxcoder.com.br`)

Servido pelo container `lynxcoder-onboarding` (`api/routes/admin.js` +
`api/admin/`). Lista pedidos do `/comecar` e mensagens de contato, com
situação, notas internas, fotos, download em ZIP e exclusão (direito de
eliminação da LGPD). Mostra também os últimos posts do blog (Hashnode).

### Blog (`blog.lynxcoder.com.br`)

Blog próprio, sem Hashnode (`api/routes/blog.js`), servido pelo container
`lynxcoder-onboarding` (router Traefik `lynx-blog`). Fica no ar durante a
manutenção do site, como o painel.

- Escrever: painel → **Blog** (coluna da esquerda) → **+ Escrever post**.
  Formato simples (`## título`, `**negrito**`, listas, links, `> dica`,
  tabelas); o botão **Imagem** envia a foto (reduzida no navegador) e insere-a.
- **Publicar** exige título, texto e resumo (o resumo aparece no Google e na
  partilha). **Pré-visualizar** mostra o post com o visual do blog, também em
  rascunho. Mudar o endereço de um post publicado mantém o antigo a
  redirecionar (301).
- Dados: `/data/blog/posts/<id>.json` e `/data/blog/imagens/` (no backup).
- O blog gera `/rss.xml` e `/sitemap.xml`; a página inicial do site mostra os
  3 posts mais recentes (`/api/blog/recentes`).
- DNS: no Registro.br (zona de lynxcoder.com.br) o `blog` tem de ser um
  registo **A** → `187.127.22.113` (era um CNAME para o Hashnode).

### Clientes ativos

Separador **Clientes** (`api/routes/clientes.js`, dados em `/data/clientes/<id>.json`).

- **Tornar cliente** (no pedido, quando a página vai ao ar) cria a ficha com os
  dados do pedido e o valor da proposta; **+ Cliente sem pedido** para quem
  veio por fora do formulário.
- A mensalidade vence todos os meses no dia do **primeiro vencimento** (num mês
  mais curto, no último dia). Cada pagamento registado quita um mês. A
  situação sai daí: **em dia**, **vence em breve** (5 dias) ou **em atraso**;
  o contador no topo mostra os clientes em atraso. Pausado e cancelado não
  contam mensalidades.
- O painel só **avisa**: não suspende páginas (não tem acesso ao Docker).
  Para tirar uma página do ar, ver "Publicar um cliente".
- **Estado do site**: a API abre `https://<endereço>/` ao arrancar e de 30 em
  30 minutos (clientes ativos, sem os de teste) e mostra se está no ar, com o
  motivo quando não está (DNS, certificado, erro). O resultado fica em memória:
  depois de um restart aparece na verificação seguinte (ou em "Verificar agora").

### DNS

Registo **A** `admin` → IP do VPS, no Registro.br (onde está o DNS do
domínio). O certificado HTTPS é emitido sozinho pelo Traefik na primeira visita.

### Criar / trocar o acesso

```bash
docker exec -it lynxcoder-onboarding node tools/admin-setup.js
```

Pede usuário e senha (mín. 12 caracteres), mostra um QR code para o app
autenticadora e só grava depois de um código válido. Correr de novo substitui o
acesso (útil se perder o celular). As credenciais ficam em
`/data/admin/credentials.json` (hash scrypt + segredo TOTP), no volume, nunca no git.

### Segurança

- Login = usuário + senha + código de 6 dígitos.
- 5 falhas por IP em 15 min bloqueiam esse IP 15 min.
- Sessão em memória: expira com 2 h sem uso ou 12 h no total. Reiniciar o
  container termina todas as sessões.
- Só responde no host `admin.lynxcoder.com.br`; noutro host as rotas não existem.
- CSP estrita, `noindex`, `no-store`; SVG enviados por clientes são servidos com
  `sandbox` (não correm scripts mesmo abertos diretamente).
- Não sai do ar com o modo de manutenção (`maintenance-on.sh` só derruba o site).

## Backups

`scripts/backup.sh` corre todos os dias às 03:30 (cron) e guarda o volume
`lynxcoder-site_onboarding-data` (pedidos, fotos, mensagens, propostas,
configurações e acesso ao painel). O código não entra: está no GitHub.

- Local: `/root/backups/lynxcoder/`, 14 dias.
- Externo: Google Drive, pasta `lynxcoder-backups`, 60 dias, **criptografado**
  pelo rclone (o Google só vê nomes e conteúdos embaralhados). O rclone corre
  num container (`rclone/rclone:1.68`); nada é instalado no VPS.
- Último backup bem-sucedido: `cat /root/backups/lynxcoder/.ultimo-backup-ok`
- Log: `/var/log/lynxcoder-backup.log`

### Configurar (uma vez)

1. **No seu computador (Windows)**, instalar o rclone — só serve para autorizar
   o Google Drive no browser:
   ```powershell
   winget install Rclone.Rclone
   ```
2. **No VPS**, criar a ligação ao Drive:
   ```bash
   mkdir -p /root/.config/rclone && chmod 700 /root/.config/rclone
   docker run --rm -it -v /root/.config/rclone:/config/rclone rclone/rclone:1.68 config
   ```
   - `n` (novo) → nome **`gdrive`** → tipo **`drive`** (Google Drive)
   - `client_id` e `client_secret`: Enter (vazio)
   - `scope`: **`drive.file`** — o rclone só vê os ficheiros que ele próprio criou,
     nunca o resto do seu Drive
   - `service_account_file`: Enter · configuração avançada: `n`
   - "Use web browser to automatically authenticate?": **`n`**. O rclone mostra um
     comando `rclone authorize "drive" "…"`: copie-o, corra-o no **PowerShell do
     seu computador**, entre na conta Google no browser que abrir e cole no VPS o
     código que aparecer no PowerShell.
   - "Configure this as a Shared Drive?": `n` · confirmar: `y`
3. Ainda no mesmo `config`, criar a camada de criptografia:
   - `n` → nome **`lynxbackup`** → tipo **`crypt`**
   - `remote`: **`gdrive:lynxcoder-backups`**
   - `filename_encryption`: `standard` · `directory_name_encryption`: `true`
   - `password`: **`g`** (gerar, 1024 bits) e depois `password2`: **`g`** também
   - **Guarde as duas senhas geradas num gestor de senhas.** Sem elas, os backups
     do Drive não podem ser abertos por ninguém, incluindo você.
   - confirmar: `y` · sair: `q`
4. Ligar a cópia externa e testar:
   ```bash
   echo 'BACKUP_RCLONE_REMOTE=lynxbackup:' > /root/lynxcoder-site/infra/backup.env
   chmod 600 /root/lynxcoder-site/infra/backup.env /root/.config/rclone/rclone.conf
   bash /root/lynxcoder-site/scripts/backup.sh
   ```
   Deve terminar com `OK remoto` e `Backup concluído`; no Drive aparece a pasta
   `lynxcoder-backups` com um ficheiro de nome embaralhado.
5. Agendar:
   ```bash
   echo '30 3 * * * root bash /root/lynxcoder-site/scripts/backup.sh >> /var/log/lynxcoder-backup.log 2>&1' > /etc/cron.d/lynxcoder-backup
   ```
6. Guarde também uma cópia de `/root/.config/rclone/rclone.conf` no gestor de
   senhas: é o que permite recuperar os backups se o VPS se perder.

### Restaurar

```bash
cd /root/lynxcoder-site
bash scripts/restore.sh            # lista os backups locais
bash scripts/restore.sh latest     # restaura o mais recente (pede "RESTAURAR")
```

Antes de apagar, o restore guarda o estado atual em
`lynxcoder-antes-de-restaurar-*.tar.gz`. Para restaurar uma cópia do Drive:

```bash
docker run --rm -v /root/.config/rclone:/config/rclone rclone/rclone:1.68 lsf lynxbackup:
docker run --rm -v /root/.config/rclone:/config/rclone -v /root/backups/lynxcoder:/data   rclone/rclone:1.68 copy lynxbackup:<nome-do-ficheiro> /data
bash scripts/restore.sh /root/backups/lynxcoder/<nome-do-ficheiro>
```

Num VPS novo: clonar o repositório, repor `/root/.config/rclone/rclone.conf`
(da cópia no gestor de senhas), `bash scripts/deploy.sh` e restaurar como acima.

## Subir o HSTS

Hoje está em `stsSeconds=300` de propósito, para poder reverter depressa.
Depois de confirmar HTTPS estável no apex, no `www` **e** no
`blog.lynxcoder.com.br`, subir em `infra/docker-compose.yml` para `31536000`.

Não adicionar `stsIncludeSubdomains` antes de **todos** os subdomínios terem
HTTPS válido — um subdomínio em HTTP fica inacessível e o HSTS é cacheado
pelos browsers durante o max-age inteiro.
