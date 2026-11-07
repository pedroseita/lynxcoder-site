# Site LynxCoder — lynxcoder.com.br e lynxsites.com.br

Site institucional da LynxCoder, painel de gestão, blog, compra direta de
páginas e as páginas dos clientes. O site é HTML/CSS/JS estático, sem build
step e sem framework; a API é Node + Fastify. Tudo corre em containers Docker
atrás de um Traefik já existente no VPS.

## Endereços

| Endereço | O que é | Servido por |
|---|---|---|
| `lynxcoder.com.br` | site institucional, portfólio e páginas de exemplo | `lynxcoder-site` (nginx, `src/`) |
| `admin.lynxcoder.com.br` | painel de gestão (login + 2 etapas) | `lynxcoder-onboarding` (API) |
| `blog.lynxcoder.com.br` | blog próprio, escrito no painel | `lynxcoder-onboarding` (API) |
| `lynxcoder.com.br/ajuda` | central de ajuda para os clientes (páginas fixas) | `lynxcoder-site` (nginx, `src/ajuda/`) |
| `lynxsites.com.br` | vitrine da compra direta: passos, exemplos, preço "a partir de" | `lynxsites-paginas` (nginx) |
| `lynxsites.com.br/criar` | compra de página em 6 passos, com prévia ao vivo | `lynxsites-paginas` + API em `/api/criar/` |
| `painel.lynxsites.com.br` | painel do cliente (login por código no e-mail) | `lynxcoder-onboarding` (API) |
| `<nome>.lynxsites.com.br` | página de cada cliente (uma pasta por cliente) | `lynxsites-paginas` (nginx) |

DNS: `lynxcoder.com.br` no Registro.br; `lynxsites.com.br` na Cloudflare
(registo `*`, só DNS), com um certificado único `*.lynxsites.com.br`.

## Estrutura

```
src/                     ← site lynxcoder.com.br (um só COPY no Dockerfile)
├── index.html             página principal (portfólio com "Quero uma assim" -> /criar)
├── privacy.html           política de privacidade (noindex)
├── terms.html             termos de uso (noindex)
├── 404.html               página de erro (servida pelo nginx via error_page)
├── obrigado.html          destino do formulário de contato após envio
├── manutencao.html        página de manutenção (painel e container de manutenção)
├── comecar.html           formulário de início de projeto (só abre com link de convite)
├── proposta.html          proposta individual (só abre com link; texto vem da API)
├── ajuda/                 central de ajuda: index.html (com pesquisa) e um .html por artigo
├── exemplos/              páginas de exemplo do portfólio (noindex, dados fictícios)
│   ├── eletricista.html     só assets/js/exemplo.js (WhatsApp em modo demonstração)
│   ├── quentinhas.html      + js/quentinhas.js   (cardápio e carrinho)
│   ├── churrasco.html       + js/churrasco.js    (calculadora por convidados)
│   ├── manicure.html        + js/manicure.js     (pedido de horário)
│   ├── hidraulica.html      + js/hidraulica.js   (triagem de urgência)
│   ├── dog-walker.html      + js/dog-walker.js   (montador de plano semanal)
│   └── mudancas.html        + js/mudancas.js     (inventário, veículo e preço)
├── robots.txt
├── sitemap.xml
└── assets/
    ├── css/               styles.css (design system), comecar.css, proposta.css, ajuda.css
    ├── js/                app.js (nav, blog na home), comecar.js, proposta.js, ajuda.js,
    │                      exemplo.js (comum aos exemplos) + um por exemplo
    ├── fonts/*.woff2      self-hosted (fontsource), sem pedidos à Google
    └── img/               logo.png e portfolio/<exemplo>-celular.jpg (480×3569)

infra/
├── Dockerfile             imagem do site
├── nginx.conf             routing do site (404 real, cache de assets)
├── security-headers.conf  ← FONTE ÚNICA dos security headers do site
├── docker-compose.yml     site + API, labels Traefik (site, admin, blog, /api/criar, painel)
├── maintenance/           modo de manutenção pesada, container independente (503)
└── lynxsites/             tudo o que é servido em lynxsites.com.br (projeto à parte)
    ├── Dockerfile, nginx.conf, headers.conf
    ├── docker-compose.yml   router único *.lynxsites.com.br (prioridade 1)
    ├── inicio/              vitrine do lynxsites.com.br (usa as imagens de src/assets/img/portfolio)
    ├── criar/               compra de página: index.html, criar.css, criar.js
    │   └── modelos/         prévia com o layout do exemplo (eletricista); modelo.js
    │                        aplica os dados do cliente (marcadores data-pv)
    └── criar-headers.conf, inicio-headers.conf   CSP própria do /criar e da vitrine

api/                     ← API (Node + Fastify), container lynxcoder-onboarding
├── server.js
├── routes/
│   ├── onboarding.js        POST /api/onboarding (formulário /comecar)
│   ├── contato.js           POST /api/contato (formulário de contato)
│   ├── propostas.js         propostas e convites (públicas + painel)
│   ├── criar.js             compra direta /api/criar (rascunho, fotos, PIX, webhook) + painel
│   ├── painel.js            painel do cliente painel.lynxsites.com.br + pedidos de alteração
│   ├── clientes.js          clientes: mensalidades, pagamentos, estado do site
│   ├── configuracoes.js     Configurações › Empresa, Pagamentos, Estado do sistema
│   ├── blog.js              blog próprio em blog.lynxcoder.com.br
│   └── admin.js             painel admin.lynxcoder.com.br (login + 2 etapas)
├── lib/
│   ├── catalogo.js          catálogo do /criar (profissões, tipos, extras, preços)
│   ├── gateway.js, pix.js   cobrança: PIX manual (QR + copia e cola); Asaas preparado
│   ├── empresa.js           dados da empresa (um só sítio)
│   ├── config.js            preços e prazos das propostas (extras vêm do catálogo)
│   ├── reservados.txt       ← FONTE ÚNICA dos subdomínios reservados (painel, admin…)
│   └── …                    mail, markdown, totp, password, flags, zip, formulario
├── admin/                 interface do painel (fonts/ = cópia das fontes do site; manter iguais)
├── painel/                interface do painel do cliente
├── blog/                  visual do blog (blog.css) e favicon
└── tools/admin-setup.js   cria o acesso ao painel (correr no VPS)

scripts/                 ← deploy, manutenção, páginas dos clientes, backup e restauro
docs/
├── runbook.md             operação: deploy, manutenção, clientes, /criar, painel, backups
└── specs/                 especificações por fase (só local, fora do git)
```

## Correr localmente

```bash
docker compose -f infra/docker-compose.yml up --build
# http://localhost  (o Traefik não é usado localmente)
```

Sem Docker, qualquer servidor estático sobre `src/` serve, mas as regras de
404 e os security headers só existem através do nginx:

```bash
python -m http.server 8000 --directory src
```

A API sozinha: `cd api && npm ci && node server.js` (variáveis em
docs/runbook.md: `DATA_DIR`, `ADMIN_HOST`, `PAINEL_HOST`…).

## Deploy

```bash
./scripts/deploy.sh            # pull + rebuild do site, da API e das páginas dos clientes
./scripts/maintenance-on.sh    # manutenção pesada: para o site e sobe o container de manutenção
./scripts/maintenance-off.sh   # devolve o site ao ar
./scripts/lynxsites.sh         # sobe o container das páginas e avisa de pastas com nome inválido
./scripts/cliente-teste.sh     # página de teste pedroeletricista.lynxsites.com.br (--remover apaga)
```

Um exemplo novo do portfólio entra em dois sítios: o cartão em `src/index.html`
e o da vitrine em `infra/lynxsites/inicio/index.html` (a imagem é a mesma).

Publicar um cliente é só criar a pasta `/root/lynxsites/<nome>/` com o
`index.html`: o certificado e o router já cobrem qualquer `<nome>.lynxsites.com.br`.

Para uma manutenção normal, use o botão **Manutenção** no painel: liga e
desliga na hora, sem parar containers. Com ela ligada, o `/criar` também para
(o painel do cliente não).

Os scripts leem `LYNX_SITE_DIR` (default `/root/lynxcoder-site`).
Detalhe completo, incluindo rollback e o que fazer quando algo falha, em
[docs/runbook.md](docs/runbook.md).

## Pendentes conhecidos

| O que | Onde | Porquê está pendente |
|---|---|---|
| Pagamentos no /criar | Painel › Configurações › Pagamentos | desligados: falta a chave PIX e um PIX de teste; gateway (Asaas) por escolher |
| Termos e privacidade da compra direta | `src/terms.html`, `src/privacy.html` | não falam ainda dos 7 dias de arrependimento nem do gateway |
| CPF/CNPJ e endereço no rodapé do /criar | Painel › Configurações › Empresa | obrigatórios em vendas online (Decreto 7.962/2013) |
| Modelos da prévia | `infra/lynxsites/criar/modelos/` | só o eletricista; faltam os outros 6 exemplos |
| Artigos da ajuda em falta | `src/ajuda/` | atrasos, cancelamento e formas de pagamento esperam pelas regras e pelo gateway |
| Gerador de páginas e "Publicar" | — | hoje a página do cliente publica-se à mão; os modelos são a base |
| Anti-robô (Turnstile) no /criar | `infra/onboarding.env` | código pronto, faltam as chaves |
| Capa Open Graph 1200×630 | `src/assets/img/` | hoje o `og:image` aponta para o logo quadrado |
| HSTS a 300s | `infra/docker-compose.yml`, `infra/lynxsites/docker-compose.yml` | subir para 31536000 depois de um período estável |
| Perfis sociais | `src/index.html` (footer) | só o GitHub está ligado |
