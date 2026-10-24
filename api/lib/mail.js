// Aviso por e-mail (opcional): só envia se SMTP_HOST estiver configurado.
'use strict';

const nodemailer = require('nodemailer');

const port = Number(process.env.SMTP_PORT || 465);
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

// Nunca falha o pedido do cliente por causa do e-mail: só regista o erro.
function notify({ subject, text, replyTo }, log) {
  if (!transport) return;
  transport.sendMail({
    from: process.env.NOTIFY_FROM || process.env.SMTP_USER,
    to: process.env.NOTIFY_TO || process.env.SMTP_USER,
    replyTo,
    subject,
    text,
  }).catch((err) => log.error({ err: err.message }, 'falha ao enviar e-mail de aviso'));
}

module.exports = { notify, enabled: !!transport };
