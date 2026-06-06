FROM nginx:alpine
COPY ["Lynx Coder.html", "/usr/share/nginx/html/index.html"]
COPY styles.css /usr/share/nginx/html/styles.css
COPY app.js /usr/share/nginx/html/app.js
COPY logo.png /usr/share/nginx/html/logo.png
COPY nginx.conf /etc/nginx/conf.d/default.conf
