# Como configurei meu VPS com Docker, Traefik e HTTPS automático

Quando decidi colocar a LynxCoder no ar, precisava de uma solução simples: um servidor que suportasse múltiplos sites, com HTTPS automático, sem ter que configurar nginx na mão para cada novo projeto.

A resposta foi **Docker + Traefik**. Hoje vou mostrar exatamente como configurei, passo a passo.

---

## O que é o Traefik e por que usar?

O [Traefik](https://traefik.io) é um reverse proxy moderno pensado para containers. A diferença em relação ao nginx como proxy é que ele **se configura sozinho** — quando você sobe um novo container com as labels certas, o Traefik detecta automaticamente e começa a rotear o tráfego.

E o melhor: integra diretamente com o **Let's Encrypt**, então HTTPS fica automático sem nenhuma configuração extra.

---

## Pré-requisitos

- VPS com Ubuntu (uso Ubuntu 22.04)
- Docker + Docker Compose instalados
- Um domínio apontando para o IP do seu servidor (registro A no DNS)

---

## Estrutura de pastas

```
/srv/
├── traefik/
│   ├── docker-compose.yml
│   ├── traefik.yml
│   └── acme.json          ← gerado automaticamente (certificados SSL)
└── meu-site/
    ├── docker-compose.yml
    ├── Dockerfile
    └── index.html
```

---

## 1. Configurar o Traefik

Crie a pasta e os arquivos:

```bash
mkdir -p /srv/traefik
cd /srv/traefik
touch acme.json
chmod 600 acme.json  # obrigatório — o Let's Encrypt exige permissão restrita
```

**`traefik.yml`** — configuração estática:

```yaml
api:
  dashboard: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: seu@email.com
      storage: /acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    exposedByDefault: false
```

**`docker-compose.yml`** do Traefik:

```yaml
services:
  traefik:
    image: traefik:v3.0
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/traefik.yml:ro
      - ./acme.json:/acme.json
    networks:
      - proxy

networks:
  proxy:
    external: true
```

Crie a rede e suba o Traefik:

```bash
docker network create proxy
docker compose up -d
```

---

## 2. Adicionar um site

Agora qualquer container que você subir na rede `proxy` com as labels certas fica automaticamente disponível com HTTPS.

Exemplo de um site estático com nginx:

**`docker-compose.yml`** do site:

```yaml
services:
  site:
    build: .
    container_name: meu-site
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.meusite.rule=Host(`meusite.com.br`) || Host(`www.meusite.com.br`)"
      - "traefik.http.routers.meusite.entrypoints=websecure"
      - "traefik.http.routers.meusite.tls.certresolver=letsencrypt"
      - "traefik.http.services.meusite.loadbalancer.server.port=80"
    networks:
      - proxy

networks:
  proxy:
    external: true
```

**`Dockerfile`** do site:

```dockerfile
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
```

Sobe o site:

```bash
docker compose up -d --build
```

Pronto. Em 30 segundos o Traefik detecta o container, solicita o certificado ao Let's Encrypt e o site está no ar com HTTPS.

---

## 3. Adicionar um segundo site (aqui está a mágica)

Quer subir outro projeto? Cria outro `docker-compose.yml` com labels diferentes:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.outroprojeto.rule=Host(`outroprojeto.com.br`)"
  - "traefik.http.routers.outroprojeto.entrypoints=websecure"
  - "traefik.http.routers.outroprojeto.tls.certresolver=letsencrypt"
  - "traefik.http.services.outroprojeto.loadbalancer.server.port=3000"
```

Sem tocar no Traefik. Sem reiniciar nada. Ele detecta e configura tudo automaticamente.

---

## Resultado

Com essa estrutura, o meu servidor hoje serve:

- `lynxcoder.com.br` — site principal
- `sondagem.lynxcoder.com.br` — projeto separado
- `blog.lynxcoder.com.br` — este blog

Todos com HTTPS automático, num único VPS, sem configuração manual de certificados.

---

## O que ficou de fora

- **Dashboard do Traefik** com autenticação básica
- **Rate limiting** por IP
- **Deploy automático via GitHub Actions**

Esses ficam para os próximos artigos. Se tiveres dúvidas, deixa nos comentários ou fala comigo em [devlynxcoder@gmail.com](mailto:devlynxcoder@gmail.com).
