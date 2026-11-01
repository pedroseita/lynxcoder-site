// Painel do cliente em painel.lynxsites.com.br (fase 1).
//
// O cliente vê a página dele e o estado dela, as mensalidades (com PIX) e pede
// alterações, que a LynxCoder faz. Editar sozinho fica para a fase 2 (gerador).
//
// Segurança:
// - entra com o e-mail da ficha de cliente + código de 6 dígitos enviado por
//   e-mail (10 min, 5 tentativas); a resposta é a mesma exista ou não o e-mail;
// - sessão em /data/painel/sessoes.json (só o hash do token), cookie __Host-
//   (Secure, HttpOnly, SameSite=Strict), 30 dias no máximo, 14 sem uso;
// - pedidos que alteram dados exigem o cabeçalho X-LX (como no admin);
// - só responde no host do painel, com CSP estrita;
// - os pedidos de alteração ficam em /data/painel/alteracoes/<cliente>.json,
//   à parte da ficha, que é do admin.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { DIRS, HttpError, str, isEmail, newId, ID_RE, readJson, writeJson, createLimiter } = require('../lib/common');
const clientes = require('./clientes');
const mail = require('../lib/mail');
const gateway = require('../lib/gateway');
const { sniff } = require('./onboarding');

const PAINEL_HOST = (process.env.PAINEL_HOST || 'painel.lynxsites.com.br').toLowerCase();
const COOKIE = '__Host-lx_painel';
const MAX_MS = 30 * 86400e3;
const IDLE_MS = 14 * 86400e3;
const CODIGO_MS = 10 * 60e3;
const SESSOES = path.join(DIRS.painel, 'sessoes.json');
const ALT_DIR = path.join(DIRS.painel, 'alteracoes');
const ANEXOS_DIR = path.join(DIRS.painel, 'anexos');
const STATIC_DIR = path.join(__dirname, '..', 'painel');
const ADMIN_STATIC = path.join(__dirname, '..', 'admin');
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const ANEXO_RE = /^[\w-]+\.(jpg|png|webp)$/;

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-robots-tag': 'noindex, nofollow',
};

const limCodigoIp = createLimiter({ windowMs: 3600e3, maxTries: 10 });
const limCodigoEmail = createLimiter({ windowMs: 3600e3, maxTries: 5 });
const limEntrar = createLimiter({ windowMs: 3600e3, maxTries: 20 });
const limAlteracao = createLimiter({ windowMs: 86400e3, maxTries: 10 });

const codigos = new Map(); // email -> { hash, exp, tentativas }
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const iguais = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const isPainel = (req) => (req.hostname || '').toLowerCase() === PAINEL_HOST;

setInterval(() => { const now = Date.now(); for (const [k, c] of codigos) if (c.exp < now) codigos.delete(k); }, 10 * 60e3).unref();

// ---------- sessões (persistidas: um deploy não desliga os clientes) ----------
let sessoes = null;
async function carregarSessoes() {
  if (!sessoes) sessoes = await readJson(SESSOES, {});
  const now = Date.now();
  let mudou = false;
  for (const [k, s] of Object.entries(sessoes)) {
    if (now - s.criado > MAX_MS || now - s.visto > IDLE_MS) { delete sessoes[k]; mudou = true; }
  }
  if (mudou) await gravarSessoes();
  return sessoes;
}
async function gravarSessoes() {
  await fsp.mkdir(DIRS.painel, { recursive: true });
  await writeJson(SESSOES, sessoes, 0o600);
}
function lerCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function definirCookie(reply, token, maxAgeSec) {
  reply.header('set-cookie', `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`);
}

// Sessão válida + ficha do cliente (ativo ou pausado). Sem isso, 401.
async function exigirCliente(req) {
  if (!isPainel(req)) throw new HttpError(404, 'Não encontrado.');
  const token = lerCookie(req);
  const all = await carregarSessoes();
  const s = token && all[hash(token)];
  if (!s) throw new HttpError(401, 'A sua sessão terminou. Entre de novo.');
  const c = await clientes.porId(s.clienteId);
  if (!c || c.status === 'cancelado') {
    delete all[hash(token)];
    await gravarSessoes();
    throw new HttpError(401, 'A sua sessão terminou. Entre de novo.');
  }
  if (Date.now() - s.visto > 3600e3) { s.visto = Date.now(); await gravarSessoes(); }
  return c;
}
const exigirEscrita = (req) => { if (req.headers['x-lx'] !== '1') throw new HttpError(403, 'Pedido recusado.'); };

// ---------- pedidos de alteração ----------
const altFile = (clienteId) => {
  if (!ID_RE.test(String(clienteId))) throw new HttpError(404, 'Não encontrado.');
  return path.join(ALT_DIR, `${clienteId}.json`);
};
const listarAlteracoes = async (clienteId) => readJson(altFile(clienteId), []);

// Para o Início do admin: pedidos por fazer, de todos os clientes.
async function abertas() {
  let files = [];
  try { files = (await fsp.readdir(ALT_DIR)).filter((f) => f.endsWith('.json')); } catch { return []; }
  const nomes = new Map((await clientes.all()).map((c) => [c.id, c.nome]));
  const out = [];
  for (const f of files) {
    const id = f.slice(0, -5);
    for (const a of await readJson(path.join(ALT_DIR, f), [])) {
      if (a.estado === 'aberta' && nomes.has(id)) out.push({ clienteId: id, nome: nomes.get(id), id: a.id, texto: a.texto, criadoEm: a.criadoEm });
    }
  }
  return out.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

// ---------- o que o cliente vê ----------
async function resumoCliente(c) {
  const pix = (process.env.PIX_CHAVE || '').trim();
  const alvo = c.emAberto[0] || (c.situacao === 'vence' ? c.proximo : null);
  let cobranca = null;
  if (alvo && c.mensalidade) {
    cobranca = { referencia: alvo.referencia, vencimento: alvo.vencimento, valor: c.mensalidade, pix: null };
    if (pix) {
      const payload = gateway.pixCopiaECola({
        chave: pix, nome: process.env.PIX_NOME || 'LynxCoder', cidade: process.env.PIX_CIDADE || 'Brasil',
        valor: c.mensalidade, txid: `M${c.id.replace(/-/g, '')}${alvo.referencia.replace('-', '')}`,
      });
      cobranca.pix = { payload, qr: await require('qrcode').toDataURL(payload, { margin: 1, width: 280 }) };
    }
  }
  return {
    negocio: c.nome,
    contato: c.contato || '',
    email: c.email,
    whatsapp: c.whatsapp,
    endereco: c.endereco || '',
    plano: c.plano,
    status: c.status,
    site: c.site ? { ok: c.site.ok, em: c.site.em, erro: c.site.erro } : null,
    mensalidade: c.mensalidade,
    situacao: c.situacao,
    emAberto: c.emAberto,
    proximo: c.proximo,
    pagamentos: (c.pagamentos || []).slice(-12).reverse().map((p) => ({ referencia: p.referencia, valor: p.valor, pagoEm: p.pagoEm })),
    cobranca,
    alteracoes: (await listarAlteracoes(c.id)).slice().reverse().map(({ id, texto, criadoEm, estado, feitaEm, resposta, anexo }) => ({ id, texto, criadoEm, estado, feitaEm, resposta, anexo: !!anexo })),
    contactoLynx: process.env.VENDEDOR_WHATSAPP || '',
  };
}

// ---------- estáticos do painel (antes do roteamento, como o blog) ----------
const statics = {};
for (const [url, file, type] of [
  ['/', path.join(STATIC_DIR, 'index.html'), 'text/html; charset=utf-8'],
  ['/assets/painel.css', path.join(STATIC_DIR, 'painel.css'), 'text/css; charset=utf-8'],
  ['/assets/painel.js', path.join(STATIC_DIR, 'painel.js'), 'text/javascript; charset=utf-8'],
  ['/assets/logo.png', path.join(ADMIN_STATIC, 'logo.png'), 'image/png'],
  ['/favicon.ico', path.join(__dirname, '..', 'blog', 'favicon.ico'), 'image/x-icon'],
  ['/assets/fonts/space-grotesk-latin.woff2', path.join(ADMIN_STATIC, 'fonts', 'space-grotesk-latin.woff2'), 'font/woff2'],
  ['/assets/fonts/space-grotesk-latin-ext.woff2', path.join(ADMIN_STATIC, 'fonts', 'space-grotesk-latin-ext.woff2'), 'font/woff2'],
  ['/assets/fonts/manrope-latin.woff2', path.join(ADMIN_STATIC, 'fonts', 'manrope-latin.woff2'), 'font/woff2'],
  ['/assets/fonts/manrope-latin-ext.woff2', path.join(ADMIN_STATIC, 'fonts', 'manrope-latin-ext.woff2'), 'font/woff2'],
  ['/assets/fonts/jetbrains-mono-latin.woff2', path.join(ADMIN_STATIC, 'fonts', 'jetbrains-mono-latin.woff2'), 'font/woff2'],
]) statics[url] = { body: fs.readFileSync(file), type };

async function publicHook(req, reply) {
  if (!isPainel(req)) return;
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) reply.header(k, v);
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/painel/')) return; // segue para as rotas abaixo
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply.code(405).send({ ok: false, message: 'Método não permitido.' });
  if (url === '/robots.txt') return reply.type('text/plain').send('User-agent: *\nDisallow: /\n');
  const s = statics[url];
  if (!s) return reply.code(404).type('text/plain; charset=utf-8').send('Não encontrado.');
  reply.header('cache-control', /\.(woff2|png|ico)$/.test(url) ? 'public, max-age=2592000' : 'no-cache');
  return reply.type(s.type).send(s.body);
}

// ---------- API do cliente ----------
async function publicRoutes(app) {
  await fsp.mkdir(ALT_DIR, { recursive: true });
  await fsp.mkdir(ANEXOS_DIR, { recursive: true });

  app.post('/api/painel/codigo', async (req) => {
    if (!isPainel(req)) throw new HttpError(404, 'Não encontrado.');
    exigirEscrita(req);
    const email = str((req.body || {}).email, 160).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Escreva o e-mail com que contratou a página.');
    const logar = process.env.PAINEL_CODIGO_LOG === '1'; // só em testes locais
    if (!mail.enabled && !logar) throw new HttpError(503, 'O acesso por e-mail ainda está a ser ativado. Fale connosco pelo WhatsApp.');
    if (limCodigoIp.blocked(req.ip) || limCodigoEmail.blocked(email)) throw new HttpError(429, 'Muitos pedidos de código. Espere um pouco e tente de novo.');
    limCodigoIp.hit(req.ip);
    limCodigoEmail.hit(email);
    const c = (await clientes.all()).find((x) => (x.email || '').toLowerCase() === email && x.status !== 'cancelado');
    if (c) {
      const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      codigos.set(email, { hash: hash(`${email}:${codigo}`), exp: Date.now() + CODIGO_MS, tentativas: 0, clienteId: c.id });
      if (logar) req.log.warn({ email, codigo }, 'PAINEL_CODIGO_LOG: código de acesso (só testes)');
      mail.sendTo({
        to: email,
        subject: `${codigo} é o seu código de acesso — LynxSites`,
        text: `Olá!\n\nO seu código para entrar no painel da sua página é:\n\n    ${codigo}\n\nVale 10 minutos. Se não foi você que pediu, ignore este e-mail.\n\nhttps://${PAINEL_HOST}\n\nLynxCoder`,
      }, req.log);
    }
    // A mesma resposta exista ou não: não revela quem é cliente.
    return { ok: true, message: 'Se este e-mail tiver uma página connosco, acabámos de enviar um código de 6 dígitos.' };
  });

  app.post('/api/painel/entrar', async (req, reply) => {
    if (!isPainel(req)) throw new HttpError(404, 'Não encontrado.');
    exigirEscrita(req);
    if (limEntrar.blocked(req.ip)) throw new HttpError(429, 'Muitas tentativas. Espere uma hora e tente de novo.');
    limEntrar.hit(req.ip);
    const b = req.body || {};
    const email = str(b.email, 160).toLowerCase();
    const codigo = String(b.codigo || '').replace(/\D/g, '').slice(0, 6);
    const c = codigos.get(email);
    const falha = () => { throw new HttpError(400, 'Código inválido ou expirado. Peça um novo.'); };
    if (!c || c.exp < Date.now()) { codigos.delete(email); falha(); }
    c.tentativas += 1;
    if (c.tentativas > 5) { codigos.delete(email); falha(); }
    if (!iguais(c.hash, hash(`${email}:${codigo}`))) {
      await new Promise((r) => setTimeout(r, 300));
      falha();
    }
    codigos.delete(email);
    const token = crypto.randomBytes(32).toString('base64url');
    const all = await carregarSessoes();
    all[hash(token)] = { clienteId: c.clienteId, criado: Date.now(), visto: Date.now(), ip: req.ip };
    await gravarSessoes();
    definirCookie(reply, token, MAX_MS / 1000);
    req.log.info({ clienteId: c.clienteId }, 'cliente entrou no painel');
    return { ok: true };
  });

  app.post('/api/painel/sair', async (req, reply) => {
    if (!isPainel(req)) throw new HttpError(404, 'Não encontrado.');
    exigirEscrita(req);
    const token = lerCookie(req);
    const all = await carregarSessoes();
    if (token && all[hash(token)]) { delete all[hash(token)]; await gravarSessoes(); }
    definirCookie(reply, '', 0);
    return { ok: true };
  });

  app.get('/api/painel/eu', async (req, reply) => {
    const c = await exigirCliente(req);
    reply.header('cache-control', 'no-store');
    return { ok: true, ...(await resumoCliente(c)) };
  });

  // Pedido de alteração: texto + uma foto opcional (multipart: "texto" e "foto").
  app.post('/api/painel/alteracoes', async (req) => {
    const c = await exigirCliente(req);
    exigirEscrita(req);
    if (limAlteracao.blocked(c.id)) throw new HttpError(429, 'Já enviou muitos pedidos hoje. Fale connosco pelo WhatsApp se for urgente.');
    let texto = '';
    let anexo = null;
    const id = newId();
    const tmp = path.join(DIRS.tmp, `alt-${crypto.randomBytes(8).toString('hex')}`);
    try {
      for await (const part of req.parts({ limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 } })) {
        if (part.type === 'field' && part.fieldname === 'texto') texto = str(part.value, 2000);
        else if (part.type === 'file' && part.fieldname === 'foto' && !anexo) {
          await pipeline(part.file, fs.createWriteStream(tmp));
          if (part.file.truncated) throw new HttpError(413, 'Foto grande demais (máximo 8 MB).');
          const ext = await sniff(tmp);
          if (!MIME[ext]) throw new HttpError(400, 'A foto tem de ser JPG, PNG ou WebP.');
          anexo = `${id}.${ext}`;
        } else if (part.type === 'file') part.file.resume();
      }
      if (texto.length < 5) throw new HttpError(400, 'Descreva a alteração que quer fazer.');
      if (anexo) {
        await fsp.mkdir(path.join(ANEXOS_DIR, c.id), { recursive: true });
        await fsp.rename(tmp, path.join(ANEXOS_DIR, c.id, anexo));
      }
    } finally {
      await fsp.rm(tmp, { force: true });
    }
    limAlteracao.hit(c.id);
    const lista = await listarAlteracoes(c.id);
    lista.push({ id, texto, criadoEm: new Date().toISOString(), estado: 'aberta', anexo });
    await writeJson(altFile(c.id), lista);
    mail.notify({
      subject: `Pedido de alteração: ${c.nome}`,
      text: `${c.nome} (${c.endereco || 'sem endereço'}) pediu pelo painel:\n\n${texto}\n\n${anexo ? 'Com foto anexada.\n\n' : ''}Abrir: https://admin.lynxcoder.com.br/#/cliente/${c.id}`,
      replyTo: c.email,
    }, req.log);
    return { ok: true };
  });

  app.get('/api/painel/alteracoes/:id/anexo', async (req, reply) => {
    const c = await exigirCliente(req);
    const a = (await listarAlteracoes(c.id)).find((x) => x.id === req.params.id);
    if (!a || !a.anexo || !ANEXO_RE.test(a.anexo)) throw new HttpError(404, 'Não encontrado.');
    reply.header('cache-control', 'private, no-store');
    return reply.type(MIME[a.anexo.split('.').pop()]).send(fs.createReadStream(path.join(ANEXOS_DIR, c.id, a.anexo)));
  });
}

// ---------- admin (registado dentro de routes/admin.js) ----------
async function adminRoutes(app) {
  app.get('/adm/clientes/:id/alteracoes', async (req) => ({ ok: true, alteracoes: (await listarAlteracoes(req.params.id)).slice().reverse(), painel: PAINEL_HOST }));

  app.patch('/adm/clientes/:id/alteracoes/:aid', async (req) => {
    const lista = await listarAlteracoes(req.params.id);
    const a = lista.find((x) => x.id === req.params.aid);
    if (!a) throw new HttpError(404, 'Pedido não encontrado.');
    const b = req.body || {};
    if (b.estado === 'feita' || b.estado === 'aberta') {
      a.estado = b.estado;
      a.feitaEm = b.estado === 'feita' ? new Date().toISOString() : null;
    }
    if (typeof b.resposta === 'string') a.resposta = b.resposta.trim().slice(0, 1000);
    await writeJson(altFile(req.params.id), lista);
    return { ok: true };
  });

  app.get('/adm/clientes/:id/alteracoes/:aid/anexo', async (req, reply) => {
    const a = (await listarAlteracoes(req.params.id)).find((x) => x.id === req.params.aid);
    if (!a || !a.anexo || !ANEXO_RE.test(a.anexo)) throw new HttpError(404, 'Não encontrado.');
    return reply.type(MIME[a.anexo.split('.').pop()]).send(fs.createReadStream(path.join(ANEXOS_DIR, req.params.id, a.anexo)));
  });
}

module.exports = { publicHook, publicRoutes, adminRoutes, abertas, PAINEL_HOST };
