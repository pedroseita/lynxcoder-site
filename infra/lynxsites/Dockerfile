FROM nginx:1.27-alpine
COPY infra/lynxsites/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/lynxsites/headers.conf /etc/nginx/snippets/lynxsites-headers.conf
COPY infra/lynxsites/inicio/ /usr/share/nginx/inicio/
COPY src/favicon.ico /usr/share/nginx/inicio/favicon.ico
COPY src/assets/img/logo.png /usr/share/nginx/inicio/logo.png
