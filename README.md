# Site LynxCoder — lynxcoder.com.br

Site institucional da LynxCoder. HTML/CSS/JS estático, sem build step e sem
framework, servido por nginx num container Docker atrás de um Traefik já
existente no VPS.

## Estrutura

```
src/                     ← tudo o que vai para o browser (um só COPY no Dockerfile)
├── index.html             página principal
├── privacy.html           política de privacidade (noindex)
├── terms.html             termos de uso (noindex)
├── 404.html               página de erro (servida pelo nginx via error_page)
├── obrigado.html          destino do formulário após envio
├── manutencao.html        página de manutenção (painel e container de manutenção)
├── comecar.html           formulário de início de projeto (só abre com link de convite)
├── proposta.html          proposta individual (só abre com link; texto vem da API)
├── exemplos/              páginas de exemplo do portfólio (noindex, dados fictícios)
│   ├── eletricista.html     usa assets/js/exemplo.js (WhatsApp em modo demonstração)
│   └── quentinhas.html      + assets/js/quentinhas.js (carrinho; envia via window.lxDemoSend)
│   ├── churrasco.html       + assets/js/churrasco.js (calculadora; envia via window.lxDemoSend)
│   └── manicure.html        + assets/js/manicure.js (pedido de horário; envia via window.lxDemoSend)
├── robots.txt
├── sitemap.xml
└── assets/
    ├── css/styles.css     design system completo
    ├── css/comecar.css    estilos do /comecar
    ├── js/app.js          nav, menu mobile, animação do terminal
    ├── js/comecar.js      lógica do /comecar (validação, rascunho, prévia, envio)
    ├── fonts/*.woff2      self-hosted, sem pedidos à Google
    └── img/logo.png

infra/
├── Dockerfile             imagem do site
├── nginx.conf             routing do site (404 real, cache de assets)
├── security-headers.conf  ← FONTE ÚNICA dos security headers (incluída pelos dois)
├── docker-compose.yml     serviço + labels Traefik (routers lynx-site, priority 10)
├── maintenance/           modo de manutenção, container independente
│   ├── Dockerfile         usa src/manutencao.html (fonte única)
│   ├── nginx.conf         devolve 503 em tudo (routers lynx-maint, priority 100)
│   └── docker-compose.yml
└── lynxsites/             páginas dos clientes em <nome>.lynxsites.com.br (projeto à parte)
    ├── nginx.conf         host -> pasta do cliente; lynxsites.com.br -> inicio/
    ├── inicio/            página de apresentação do lynxsites.com.br
    └── docker-compose.yml subir com scripts/lynxsites.sh (gera clientes.yml)

api/                     ← API (Node + Fastify), container lynxcoder-onboarding
├── routes/onboarding.js   POST /api/onboarding (formulário /comecar)
├── routes/contato.js      POST /api/contato (formulário de contato)
├── routes/propostas.js    propostas e convites (públicas + painel)
├── routes/clientes.js     clientes ativos: mensalidade, pagamentos, estado do site (painel)
├── lib/proposta-template.js  texto da proposta
├── routes/admin.js        painel admin.lynxcoder.com.br (login + 2 etapas)
├── admin/                 interface do painel (fonts/ = cópia das fontes do site; manter iguais)
└── tools/admin-setup.js   cria o acesso ao painel (correr no VPS)
scripts/                 ← deploy, manutenção, backup e restauro (ver docs/runbook.md)
docs/                    ← runbook operacional e rascunhos
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

## Deploy

```bash
./scripts/deploy.sh            # pull + rebuild
./scripts/maintenance-on.sh    # manutenção pesada: para o site e sobe o container de manutenção
./scripts/maintenance-off.sh   # devolve o site ao ar
./scripts/lynxsites.sh         # páginas dos clientes: depois de criar/apagar uma pasta em /root/lynxsites
```

Para uma manutenção normal, use o botão **Manutenção** no painel: liga e
desliga na hora, sem parar containers (ver docs/runbook.md).

Os scripts leem `LYNX_SITE_DIR` (default `/root/lynxcoder-site`).
Detalhe completo, incluindo rollback e o que fazer quando algo falha, em
[docs/runbook.md](docs/runbook.md).

## Pendentes conhecidos

| O que | Onde | Porquê está pendente |
|---|---|---|
| Capa Open Graph 1200×630 | `src/assets/img/` | hoje o `og:image` aponta para o logo quadrado |
| HSTS a 300s | `infra/docker-compose.yml` | subir para 31536000 depois de validar HTTPS no blog |
| Perfis sociais | `src/index.html` (footer) | só o GitHub está ligado; links mortos foram removidos |
