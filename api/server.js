// LynxCoder — API (container lynxcoder-onboarding)
//
//   lynxcoder.com.br/api/onboarding   formulário de /comecar      (routes/onboarding.js)
//   lynxcoder.com.br/api/contato      formulário de contato       (routes/contato.js)
//   lynxcoder.com.br/api/proposta|comecar  links individuais       (routes/propostas.js)
//   admin.lynxcoder.com.br            painel com login + 2 etapas (routes/admin.js)
//
// Os dados ficam no volume /data (ver docs/runbook.md).
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const { DIRS, HttpError } = require('./lib/common');

const PORT = Number(process.env.PORT || 3000);
const MB = 1024 * 1024;

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' }, trustProxy: true, bodyLimit: 1 * MB });

app.register(multipart, {
  limits: { fileSize: 8 * MB, files: 14, fields: 4, fieldSize: 256 * 1024, parts: 18, headerPairs: 200 },
});

// O formulário de contato faz POST nativo (urlencoded), sem JavaScript.
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 64 * 1024 }, (req, body, done) => {
  try { done(null, Object.fromEntries(new URLSearchParams(body))); } catch (err) { done(err); }
});

app.get('/api/health', async () => ({ ok: true }));

app.register(require('./routes/onboarding'));
app.register(require('./routes/contato'));
app.register(require('./routes/propostas').publicRoutes);
app.register(require('./routes/admin'));

app.setErrorHandler((err, req, reply) => {
  let status = err.status || err.statusCode || 500;
  let message = err instanceof HttpError ? err.message : null;
  if (err.code === 'FST_REQ_FILE_TOO_LARGE') { status = 413; message = 'Ficheiro grande demais.'; }
  else if (['FST_FILES_LIMIT', 'FST_PARTS_LIMIT', 'FST_FIELDS_LIMIT'].includes(err.code)) { status = 400; message = 'Envio com ficheiros ou campos a mais.'; }
  else if (status === 400 && !message) message = 'Pedido inválido.';
  if (status >= 500) req.log.error({ err }, 'erro na API');
  reply.status(status).send({ ok: false, message: message || 'Erro ao processar o pedido. Tente de novo.' });
});

app.setNotFoundHandler((req, reply) => reply.status(404).send({ ok: false, message: 'Não encontrado.' }));

(async () => {
  for (const dir of Object.values(DIRS)) await fsp.mkdir(dir, { recursive: true });
  // Restos de envios interrompidos (ex.: restart a meio de um upload).
  for (const entry of await fsp.readdir(DIRS.tmp)) {
    await fsp.rm(path.join(DIRS.tmp, entry), { recursive: true, force: true });
  }
  await app.listen({ host: '0.0.0.0', port: PORT });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
