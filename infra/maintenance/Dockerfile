FROM nginx:1.27-alpine
# Fonte única: a página e o logo vêm de src/ (a mesma página que o site mostra
# quando a manutenção é ligada pelo painel).
COPY src/manutencao.html /usr/share/nginx/html/index.html
COPY src/assets/img/logo.png /usr/share/nginx/html/assets/img/logo.png
COPY infra/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY infra/maintenance/nginx.conf /etc/nginx/conf.d/default.conf
