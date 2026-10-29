// LynxCoder — API (container lynxcoder-onboarding)
//
//   lynxcoder.com.br/api/onboarding   formulário de /comecar      (routes/onboarding.js)
//   lynxcoder.com.br/api/contato      formulário de contato       (routes/contato.js)
//   lynxcoder.com.br/api/proposta|comecar  links individuais       (routes/propostas.js)
//   admin.lynxcoder.com.br            painel com login + 2 etapas (routes/admin.js)
//   blog.lynxcoder.com.br             blog, escrito no painel      (routes/blog.js)
//
// Os dados ficam no volume /data (ver docs/runbook.md).
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const { DIRS, HttpError } = require('./lib/common');
const flags = require('./lib/flags');

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

// blog.lynxcoder.com.br: atendido inteiro neste hook, antes do roteamento,
// para "/" e "/assets/…" do blog não chocarem com os do painel (routes/blog.js).
const blog = require('./routes/blog');
app.addHook('onRequest', blog.publicHook);

// Manutenção ligada no painel: os formulários públicos ficam indisponíveis
// (o site mostra a página de manutenção). O painel e o health não são afetados.
app.addHook('onRequest', async (req, reply) => {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/') || url === '/api/health' || !flags.manutencaoAtiva()) return;
  const message = 'O site está em manutenção neste momento. Tente de novo daqui a pouco.';
  reply.code(503).header('retry-after', '3600');
  if (url === '/api/contato') {
    return reply.type('text/html; charset=utf-8').send(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">` +
      `<title>Em manutenção — LynxCoder</title><link rel="stylesheet" href="/assets/css/styles.css"></head><body><main class="state-page">` +
      `<div class="state-inner"><h1>Em manutenção.</h1><p class="lead">${message} A sua mensagem não foi enviada.</p></div></main></body></html>`);
  }
  return reply.send({ ok: false, message });
});

app.register(require('./routes/onboarding'));
app.register(require('./routes/contato'));
app.register(require('./routes/propostas').publicRoutes);
app.register(blog.publicRoutes);
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
  await flags.verificarEscrita(app.log);
  await app.listen({ host: '0.0.0.0', port: PORT });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
