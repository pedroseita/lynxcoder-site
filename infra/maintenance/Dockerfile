FROM nginx:1.27-alpine
COPY infra/maintenance/index.html /usr/share/nginx/html/index.html
# Fonte única: o logo vem de src/, não de uma cópia local.
COPY src/assets/img/logo.png /usr/share/nginx/html/logo.png
COPY infra/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY infra/maintenance/nginx.conf /etc/nginx/conf.d/default.conf
