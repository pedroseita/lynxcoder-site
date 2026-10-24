FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY lib ./lib
COPY routes ./routes
COPY tools ./tools
COPY admin ./admin
# /data é um volume: criado aqui com dono "node" para o volume herdar as permissões.
# /flags: volume partilhado com o nginx do site (bandeira de manutenção).
RUN mkdir -p /data /flags && chown node:node /data /flags
USER node
EXPOSE 3000
CMD ["node", "server.js"]
