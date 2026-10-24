// POST /api/contato — formulário de contato da página inicial.
// POST nativo do browser (application/x-www-form-urlencoded, sem JS): em caso
// de sucesso redireciona para /obrigado.html; em caso de erro devolve uma
// página HTML curta com o motivo e um link de volta.
'use strict';

const path = require('node:path');
const { DIRS, HttpError, str, isEmail, newId, writeJson, createLimiter } = require('../lib/common');
const mail = require('../lib/mail');

const limiter = createLimiter({ windowMs: 60 * 60 * 1000, maxTries: 20, maxOk: 5 });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function errorPage(message) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<meta name="robots" content="noindex"><title>Não foi possível enviar — LynxCoder</title><link rel="stylesheet" href="/assets/css/styles.css"></head>` +
    `<body><main class="state-page"><div class="state-inner"><p class="state-code" aria-hidden="true">!</p><h1>Não foi possível enviar.</h1>` +
    `<p class="lead">${esc(message)}</p><div class="state-actions"><a class="btn btn-primary" href="/#contato">Voltar ao formulário</a></div></div></main></body></html>`;
}

module.exports = async function contatoRoutes(app) {
  app.post('/api/contato', async (req, reply) => {
    try {
      if (limiter.blocked(req.ip)) throw new HttpError(429, 'Recebemos muitas mensagens deste endereço. Tente de novo mais tarde.');
      limiter.hit(req.ip);
      const body = req.body && typeof req.body === 'object' ? req.body : {};

      // Honeypot: bots preenchem-no. Finge sucesso e descarta.
      if (str(body.website, 200)) {
        req.log.warn('honeypot preenchido no contato — descartado');
        return reply.redirect('/obrigado.html', 303);
      }

      const nome = str(body.nome, 120);
      const email = str(body.email, 200).toLowerCase();
      const mensagem = str(body.mensagem, 4000);
      if (nome.length < 2) throw new HttpError(400, 'Informe o seu nome.');
      if (!isEmail(email)) throw new HttpError(400, 'Informe um e-mail válido.');
      if (mensagem.length < 20) throw new HttpError(400, 'Escreva uma mensagem com pelo menos 20 caracteres.');

      const id = newId();
      await writeJson(path.join(DIRS.mensagens, `${id}.json`), {
        id, recebidoEm: new Date().toISOString(), nome, email, mensagem,
        admin: { status: 'nova', notas: '' },
      });
      limiter.ok(req.ip);
      req.log.info({ id }, 'mensagem de contato recebida');

      mail.notify({
        subject: `Nova mensagem de contato: ${nome}`,
        text: `${nome} <${email}>\n\n${mensagem}\n\nVer no painel: https://admin.lynxcoder.com.br/#/mensagem/${id}\n`,
        replyTo: email,
      }, req.log);

      return reply.redirect('/obrigado.html', 303);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) req.log.error({ err }, 'erro no contato');
      return reply.status(status).type('text/html; charset=utf-8')
        .send(errorPage(err instanceof HttpError ? err.message : 'Erro inesperado. Tente de novo ou escreva para devlynxcoder@gmail.com.'));
    }
  });
};
