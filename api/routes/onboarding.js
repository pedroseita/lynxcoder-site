// POST /api/onboarding — formulário de /comecar.
// Multipart: campo "data" (JSON) + ficheiros "logo", "fotos" (vários) e "retrato".
// Valida tudo de novo no servidor e grava o pedido em /data/pedidos/<id>/.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { DIRS, HttpError, str, isEmail, newId, createLimiter } = require('../lib/common');
const mail = require('../lib/mail');
const propostas = require('./propostas');

const MB = 1024 * 1024;
const LIMITS = { logo: 5 * MB, fotos: 8 * MB, retrato: 8 * MB };
const MAX_FOTOS = 12;
const MIN_FOTOS = 3;
const RESERVED = new Set(['www', 'api', 'blog', 'mail', 'email', 'admin', 'app', 'ftp', 'smtp', 'cdn', 'static', 'dev', 'staging', 'teste', 'test', 'lynx', 'lynxcoder', 'comecar']);

// Por IP e por hora: 5 pedidos aceites e 20 tentativas (inclui recusadas).
const limiter = createLimiter({ windowMs: 60 * 60 * 1000, maxTries: 20, maxOk: 5 });

// Tipo real do ficheiro, pelos primeiros bytes (não pela extensão).
async function sniff(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(1024);
    const { bytesRead } = await fh.read(buf, 0, 1024, 0);
    const b = buf.subarray(0, bytesRead);
    if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
    if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    const text = b.toString('utf8').replace(/^﻿/, '').trimStart();
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text)) return 'svg';
    return null;
  } finally {
    await fh.close();
  }
}

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function validate(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { throw new HttpError(400, 'Dados do formulário inválidos.'); }
  if (!d || typeof d !== 'object') throw new HttpError(400, 'Dados do formulário inválidos.');
  const n = d.negocio || {};
  const r = n.redes || {};
  const p = d.plano || {};
  const v = d.visual || {};

  const out = {
    negocio: {
      nome: str(n.nome, 80),
      especialidade: str(n.especialidade, 100),
      cidade: str(n.cidade, 80),
      area: str(n.area, 120),
      whatsapp: str(n.whatsapp, 11).replace(/\D/g, ''),
      email: str(n.email, 120).toLowerCase(),
      redes: {
        instagram: str(r.instagram, 40),
        facebook: str(r.facebook, 200),
        tiktok: str(r.tiktok, 40),
        youtube: str(r.youtube, 200),
      },
    },
    plano: {
      tipo: p.tipo === 'profissional' ? 'profissional' : 'essencial',
      subdominio: str(p.subdominio, 40).toLowerCase(),
      dominio: str(p.dominio, 100).toLowerCase(),
      dominioRegistrado: p.tipo === 'profissional' ? p.dominioRegistrado === true : null,
      extras: Array.isArray(p.extras) ? p.extras.filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)).slice(0, 10) : [],
    },
    visual: {
      paleta: str(v.paleta, 30),
      corPrincipal: isHex(v.corPrincipal) ? v.corPrincipal.toLowerCase() : '',
      corDestaque: isHex(v.corDestaque) ? v.corDestaque.toLowerCase() : '',
    },
    servicos: (Array.isArray(d.servicos) ? d.servicos : []).slice(0, 10)
      .map((s) => ({ nome: str(s && s.nome, 60), descricao: str(s && s.descricao, 160) }))
      .filter((s) => s.nome),
    sobre: { historia: str(d.sobre && d.sobre.historia, 1500) },
    depoimentos: (Array.isArray(d.depoimentos) ? d.depoimentos : []).slice(0, 6)
      .map((t) => ({ nome: str(t && t.nome, 60), texto: str(t && t.texto, 400) }))
      .filter((t) => t.texto),
  };

  const ng = out.negocio;
  const fail = (msg) => { throw new HttpError(400, msg); };
  if (ng.nome.length < 2) fail('Informe o nome do negócio.');
  if (ng.especialidade.length < 2) fail('Informe a especialidade.');
  if (ng.cidade.length < 2) fail('Informe a cidade.');
  // fixo: DDD + 8 dígitos começando por 2–5; celular: DDD + 9 + 8 dígitos
  if (!/^[1-9][1-9](?:[2-5]\d{7}|9\d{8})$/.test(ng.whatsapp)) fail('Informe um WhatsApp com DDD.');
  if (!isEmail(ng.email)) fail('Informe um e-mail válido.');
  if (out.plano.tipo === 'essencial') {
    const s = out.plano.subdominio;
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s) || s.includes('--')) fail('Endereço inválido.');
    if (RESERVED.has(s)) fail('Esse endereço é reservado. Escolha outro.');
    out.plano.dominio = '';
  } else {
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(out.plano.dominio)) fail('Domínio inválido.');
    out.plano.subdominio = '';
  }
  if (!out.visual.corPrincipal || !out.visual.corDestaque) fail('Cores inválidas.');
  if (!out.servicos.length) fail('Adicione pelo menos um serviço.');
  if (!(d.consentimentos && d.consentimentos.uso === true && d.consentimentos.termos === true)) {
    fail('É preciso aceitar as duas autorizações.');
  }
  out.consentimentos = { uso: true, termos: true };
  return out;
}

function summary(id, d, files) {
  const ng = d.negocio;
  return [
    `Pedido ${id}`,
    '',
    `Negócio: ${ng.nome}`,
    `Especialidade: ${ng.especialidade}`,
    `Cidade: ${ng.cidade}${ng.area ? ` (atende: ${ng.area})` : ''}`,
    `WhatsApp: ${ng.whatsapp}`,
    `E-mail: ${ng.email}`,
    ...Object.entries(ng.redes).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    '',
    `Plano: ${d.plano.tipo}`,
    d.plano.tipo === 'essencial'
      ? `Endereço: ${d.plano.subdominio}.lynxcoder.com.br`
      : `Domínio: ${d.plano.dominio} (${d.plano.dominioRegistrado ? 'já registrado' : 'ainda vai registrar'})`,
    `Extras: ${d.plano.extras.join(', ') || '—'}`,
    '',
    `Cores: ${d.visual.paleta} ${d.visual.corPrincipal} / ${d.visual.corDestaque}`,
    '',
    'Serviços:',
    ...d.servicos.map((s, i) => `  ${i + 1}. ${s.nome}${s.descricao ? ` — ${s.descricao}` : ''}`),
    '',
    `História: ${d.sobre.historia || '—'}`,
    '',
    'Depoimentos:',
    ...(d.depoimentos.length ? d.depoimentos.map((t) => `  "${t.texto}" — ${t.nome || 'cliente'}`) : ['  —']),
    '',
    `Ficheiros: ${files.join(', ')}`,
  ].join('\n');
}

module.exports = async function onboardingRoutes(app) {
  app.post('/api/onboarding', async (req, reply) => {
    if (!req.isMultipart()) throw new HttpError(415, 'Formato de envio inválido.');
    if (limiter.blocked(req.ip)) throw new HttpError(429, 'Muitos envios. Tente de novo mais tarde.');
    limiter.hit(req.ip);

    const id = newId();
    const work = path.join(DIRS.tmp, id);
    await fsp.mkdir(work, { recursive: true });
    let liberar = null;

    try {
      let rawData = null;
      let honeypot = '';
      let convite = null;
      let proposta = null;
      const saved = { logo: null, fotos: [], retrato: null };

      for await (const part of req.parts()) {
        if (part.type === 'field') {
          if (part.fieldname === 'convite' && !convite) {
            // Só quem recebeu o link (painel → "Liberar formulário") pode enviar.
            convite = String(part.value);
            proposta = await propostas.conviteValido(convite);
            liberar = propostas.reservar(convite);
          } else if (part.fieldname === 'data') rawData = String(part.value);
          else if (part.fieldname === 'website') honeypot = String(part.value);
          continue;
        }
        if (!proposta) { part.file.resume(); throw new HttpError(400, 'Link do formulário em falta.'); }
        const kind = part.fieldname;
        if (!(kind in LIMITS)) { part.file.resume(); throw new HttpError(400, 'Ficheiro inesperado.'); }
        if (kind === 'fotos' && saved.fotos.length >= MAX_FOTOS) { part.file.resume(); throw new HttpError(400, `Máximo de ${MAX_FOTOS} fotos.`); }
        if (kind !== 'fotos' && saved[kind]) { part.file.resume(); throw new HttpError(400, 'Ficheiro repetido.'); }

        const tmpFile = path.join(work, `upload-${crypto.randomBytes(6).toString('hex')}`);
        await pipeline(part.file, fs.createWriteStream(tmpFile, { flags: 'wx' }));
        const size = (await fsp.stat(tmpFile)).size;
        if (size === 0) throw new HttpError(400, 'Ficheiro vazio.');
        if (size > LIMITS[kind]) throw new HttpError(413, 'Ficheiro grande demais.');

        const type = await sniff(tmpFile);
        const allowed = kind === 'logo' ? ['png', 'jpg', 'webp', 'svg'] : ['png', 'jpg', 'webp'];
        if (!type || !allowed.includes(type)) throw new HttpError(400, 'Envie apenas imagens JPG, PNG ou WEBP (SVG só no logotipo).');

        const name = kind === 'fotos'
          ? `foto-${String(saved.fotos.length + 1).padStart(2, '0')}.${type}`
          : `${kind}.${type}`;
        await fsp.rename(tmpFile, path.join(work, name));
        if (kind === 'fotos') saved.fotos.push(name); else saved[kind] = name;
      }

      // Bot preencheu o honeypot: finge sucesso e descarta.
      if (honeypot) {
        await fsp.rm(work, { recursive: true, force: true });
        req.log.warn('honeypot preenchido — envio descartado');
        return reply.send({ ok: true, id });
      }
      if (!proposta) throw new HttpError(400, 'Link do formulário em falta.');
      if (rawData === null) throw new HttpError(400, 'Dados do formulário em falta.');
      const data = validate(rawData);
      if (saved.fotos.length < MIN_FOTOS) throw new HttpError(400, `Envie pelo menos ${MIN_FOTOS} fotos de trabalhos.`);

      const files = [saved.logo, ...saved.fotos, saved.retrato].filter(Boolean);
      const record = { id, recebidoEm: new Date().toISOString(), propostaId: proposta.id, ...data, ficheiros: files };
      await fsp.writeFile(path.join(work, 'dados.json'), JSON.stringify(record, null, 2));
      await fsp.writeFile(path.join(work, 'resumo.txt'), summary(id, data, files) + '\n');

      // Só depois de tudo validado e gravado o pedido aparece em pedidos/.
      await fsp.rename(work, path.join(DIRS.pedidos, id));
      await propostas.marcarUsado(convite, id);
      limiter.ok(req.ip);
      req.log.info({ id, fotos: saved.fotos.length }, 'pedido recebido');

      // Confirmação ao cliente (a proposta promete-a), com o resumo do que enviou.
      mail.sendTo({
        to: data.negocio.email,
        subject: 'Recebemos as informações da sua página: LynxCoder',
        text: `Olá!

Recebemos as informações e as fotos da página de ${data.negocio.nome}. ` +
          `Vamos começar o desenvolvimento e enviamos a prévia pelo WhatsApp.
` +
          `Se faltar alguma informação, entramos em contato.

Código do pedido: ${id}

` +
          `Resumo do que recebemos:

${summary(id, data, files)}

LynxCoder · lynxcoder.com.br
`,
      }, req.log);

      mail.notify({
        subject: `Novo pedido de página: ${data.negocio.nome}`,
        text: summary(id, data, files) + `\n\nVer no painel: https://admin.lynxcoder.com.br/#/pedido/${id}\n`,
        replyTo: data.negocio.email,
      }, req.log);

      return reply.send({ ok: true, id });
    } catch (err) {
      await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
      throw err;
    } finally {
      if (liberar) liberar();
    }
  });
};
