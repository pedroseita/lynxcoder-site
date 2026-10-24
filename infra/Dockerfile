# Tag pinada: um --build amanhã não traz um nginx major diferente sem aviso.
FROM nginx:1.27-alpine
# Um único COPY: acrescentar uma página nova deixa de exigir editar o Dockerfile
# (esquecer-se disso dava 404 silencioso em produção).
COPY src/ /usr/share/nginx/html/
COPY infra/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
