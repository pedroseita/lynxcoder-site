FROM nginx:1.27-alpine
COPY infra/lynxsites/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/lynxsites/headers.conf /etc/nginx/snippets/lynxsites-headers.conf
# Endereços reservados (painel, admin…) nunca servem uma pasta, mesmo que ela
# exista: $lx_reservado a partir da lista única da API.
COPY api/lib/reservados.txt /tmp/reservados.txt
RUN { echo 'map $host $lx_reservado {'; echo '    default 0;'; \
      sed -e 's/#.*//' -e 's/[[:space:]]//g' /tmp/reservados.txt | grep -v '^$' | sed 's/.*/    &.lynxsites.com.br 1;/'; \
      echo '}'; } > /etc/nginx/conf.d/00-reservados.conf \
 && rm /tmp/reservados.txt
COPY infra/lynxsites/inicio/ /usr/share/nginx/inicio/
COPY src/favicon.ico /usr/share/nginx/inicio/favicon.ico
COPY src/assets/img/logo.png /usr/share/nginx/inicio/logo.png
