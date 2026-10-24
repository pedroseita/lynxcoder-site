// Painel em admin.lynxcoder.com.br — só responde nesse host.
//
// Segurança:
// - credenciais (hash scrypt + segredo TOTP) em /data/admin/credentials.json,
//   criadas no VPS com `node tools/admin-setup.js`; nunca passam pelo git;
// - login = utilizador + senha + código de 6 dígitos (verificação em 2 etapas);
// - 5 falhas por IP em 15 min bloqueiam esse IP durante 15 min;
// - sessão em memória, cookie __Host- (Secure, HttpOnly, SameSite=Strict),
//   expira com 2 h sem uso ou 12 h no total; restart do container = logout;
// - pedidos que alteram dados exigem o cabeçalho X-LX (defesa extra contra CSRF);
// - CSP estrita e noindex em todas as respostas deste host.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { DIRS, HttpError, str, ID_RE, readJson, writeJson, createLimiter } = require('../lib/common');
const { verifyPassword } = require('../lib/password');
const totp = require('../lib/totp');
const { zipStream } = require('../lib/zip');

const ADMIN_HOST = (process.env.ADMIN_HOST || 'admin.lynxcoder.com.br').toLowerCase();
const CREDENTIALS = path.join(DIRS.admin, 'credentials.json');
const COOKIE = '__Host-lx_admin';
const IDLE_MS = 2 * 60 * 60 * 1000;
const MAX_MS = 12 * 60 * 60 * 1000;
const STATIC_DIR = path.join(__dirname, '..', 'admin');

const PEDIDO_STATUS = ['novo', 'producao', 'publicado', 'arquivado'];
const MENSAGEM_STATUS = ['nova', 'respondida', 'arquivada'];
const FILE_RE = /^(logo|retrato|foto-\d{2})\.(png|jpg|webp|svg)$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

const loginLimiter = createLimiter({ windowMs: 15 * 60 * 1000, maxTries: 5 });
const sessions = new Map(); // token -> { user, created, seen }
let lastTotpCounter = -1;

setInterval(() => {
  const now = Date.now();
  for (const [t, s] of sessions) if (now - s.seen > IDLE_MS || now - s.created > MAX_MS) sessions.delete(t);
}, 10 * 60 * 1000).unref();

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-robots-tag': 'noindex, nofollow',
  'cache-control': 'no-store',
};

const isAdminHost = (req) => (req.hostname || '').toLowerCase() === ADMIN_HOST;

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function currentSession(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  const now = Date.now();
  if (now - s.seen > IDLE_MS || now - s.created > MAX_MS) { sessions.delete(token); return null; }
  s.seen = now;
  return { token, ...s };
}

function setSessionCookie(reply, token, maxAgeSec) {
  reply.header('set-cookie', `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`);
}

// ---------- leitura dos dados ----------
async function listPedidos() {
  const ids = (await fsp.readdir(DIRS.pedidos).catch(() => [])).filter((x) => ID_RE.test(x));
  const out = [];
  for (const id of ids) {
    const dados = await readJson(path.join(DIRS.pedidos, id, 'dados.json'));
    if (!dados) continue;
    const admin = await readJson(path.join(DIRS.pedidos, id, 'admin.json'), {});
    out.push({
      tipo: 'pedido', id, recebidoEm: dados.recebidoEm,
      titulo: dados.negocio.nome,
      subtitulo: `${dados.negocio.especialidade} · ${dados.negocio.cidade}`,
      detalhe: dados.plano.tipo === 'essencial' ? `${dados.plano.subdominio}.lynxcoder.com.br` : dados.plano.dominio,
      status: admin.status || 'novo',
    });
  }
  return out;
}

async function listMensagens() {
  const files = (await fsp.readdir(DIRS.mensagens).catch(() => [])).filter((f) => ID_RE.test(f.replace(/\.json$/, '')));
  const out = [];
  for (const f of files) {
    const m = await readJson(path.join(DIRS.mensagens, f));
    if (!m) continue;
    out.push({
      tipo: 'mensagem', id: m.id, recebidoEm: m.recebidoEm,
      titulo: m.nome, subtitulo: m.email,
      detalhe: m.mensagem.slice(0, 120),
      status: (m.admin && m.admin.status) || 'nova',
    });
  }
  return out;
}

function pedidoDir(id) {
  if (!ID_RE.test(id)) throw new HttpError(404, 'Não encontrado.');
  return path.join(DIRS.pedidos, id);
}
function mensagemFile(id) {
  if (!ID_RE.test(id)) throw new HttpError(404, 'Não encontrado.');
  return path.join(DIRS.mensagens, `${id}.json`);
}

// ---------- blog (Hashnode) ----------
// Lido do RSS do blog: formato padrão e estável (a API GraphQL do Hashnode
// mudou de endereço sem aviso, o RSS não).
const BLOG_URL = 'https://blog.lynxcoder.com.br';
let blogCache = { at: 0, data: null };
const xmlText = (s) => String(s || '')
  .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .trim();
const tag = (xml, name) => { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml); return m ? xmlText(m[1]) : ''; };

async function blogPosts() {
  if (blogCache.data && Date.now() - blogCache.at < 10 * 60 * 1000) return blogCache.data;
  const res = await fetch(`${BLOG_URL}/rss.xml`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`RSS ${res.status}`);
  const xml = await res.text();
  const posts = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, 5).map((item) => {
    const date = new Date(tag(item, 'pubDate'));
    return { title: tag(item, 'title'), url: tag(item, 'link'), publishedAt: isNaN(date) ? null : date.toISOString() };
  }).filter((p) => p.title && /^https:\/\//.test(p.url));
  const data = { url: BLOG_URL, posts };
  blogCache = { at: Date.now(), data };
  return data;
}

module.exports = async function adminRoutes(app) {
  // Ficheiros estáticos do painel, carregados uma vez no arranque.
  const statics = {};
  for (const [url, file, type] of [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/assets/admin.css', 'admin.css', 'text/css; charset=utf-8'],
    ['/assets/admin.js', 'admin.js', 'text/javascript; charset=utf-8'],
  ]) statics[url] = { body: fs.readFileSync(path.join(STATIC_DIR, file)), type };

  // Tudo o que chega por este host recebe os cabeçalhos de segurança.
  app.addHook('onSend', async (req, reply, payload) => {
    if (isAdminHost(req)) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!reply.hasHeader(k)) reply.header(k, v);
    }
    return payload;
  });

  // Rotas do painel só existem no host admin; noutro host são 404.
  // Rotas /adm/* (excepto login) exigem sessão; escritas exigem o cabeçalho X-LX.
  app.addHook('onRequest', async (req) => {
    const url = req.url.split('?')[0];
    const isAdminRoute = url === '/' || url === '/robots.txt' || url.startsWith('/assets/') || url.startsWith('/adm/');
    if (!isAdminRoute) return;
    if (!isAdminHost(req)) throw new HttpError(404, 'Não encontrado.');
    if (!url.startsWith('/adm/') || url === '/adm/login') return;
    const s = currentSession(req);
    if (!s) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
    req.session = s;
    if (req.method !== 'GET' && req.headers['x-lx'] !== '1') throw new HttpError(403, 'Pedido recusado.');
  });

  for (const [url, s] of Object.entries(statics)) {
    app.get(url, async (req, reply) => reply.type(s.type).send(s.body));
  }
  app.get('/robots.txt', async (req, reply) => reply.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  // ---------- sessão ----------
  app.post('/adm/login', async (req, reply) => {
    if (req.headers['x-lx'] !== '1') throw new HttpError(403, 'Pedido recusado.');
    if (loginLimiter.blocked(req.ip)) throw new HttpError(429, 'Muitas tentativas falhadas. Espere 15 minutos.');
    const creds = await readJson(CREDENTIALS);
    if (!creds) throw new HttpError(503, 'Painel ainda não configurado. Corra o admin-setup no servidor.');

    const body = req.body || {};
    const user = str(body.user, 100);
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    const code = (typeof body.code === 'string' ? body.code : '').replace(/\D/g, '').slice(0, 6);

    const userOk = crypto.timingSafeEqual(
      crypto.createHash('sha256').update(user).digest(),
      crypto.createHash('sha256').update(String(creds.user)).digest(),
    );
    const passOk = await verifyPassword(password, creds.passwordHash);
    const counter = userOk && passOk ? totp.verify(creds.totpSecret, code, lastTotpCounter) : -1;

    if (!userOk || !passOk || counter < 0) {
      loginLimiter.hit(req.ip);
      req.log.warn({ ip: req.ip }, 'login falhado no painel');
      await new Promise((r) => setTimeout(r, 400));
      throw new HttpError(401, 'Utilizador, senha ou código incorretos.');
    }
    lastTotpCounter = counter;
    loginLimiter.reset(req.ip);

    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, { user, created: Date.now(), seen: Date.now() });
    setSessionCookie(reply, token, MAX_MS / 1000);
    req.log.info({ ip: req.ip }, 'login no painel');
    return { ok: true, user };
  });

  app.post('/adm/logout', async (req, reply) => {
    sessions.delete(req.session.token);
    setSessionCookie(reply, '', 0);
    return { ok: true };
  });

  app.get('/adm/session', async (req) => ({ ok: true, user: req.session.user }));

  // ---------- entradas ----------
  app.get('/adm/entradas', async () => {
    const items = [...await listPedidos(), ...await listMensagens()]
      .sort((a, b) => String(b.recebidoEm).localeCompare(String(a.recebidoEm)));
    return {
      ok: true,
      items,
      contagem: {
        pedidosNovos: items.filter((i) => i.tipo === 'pedido' && i.status === 'novo').length,
        mensagensNovas: items.filter((i) => i.tipo === 'mensagem' && i.status === 'nova').length,
      },
    };
  });

  // ---------- pedidos ----------
  app.get('/adm/pedidos/:id', async (req) => {
    const dir = pedidoDir(req.params.id);
    const dados = await readJson(path.join(dir, 'dados.json'));
    if (!dados) throw new HttpError(404, 'Pedido não encontrado.');
    const admin = await readJson(path.join(dir, 'admin.json'), {});
    return { ok: true, dados, admin: { status: admin.status || 'novo', notas: admin.notas || '', atualizadoEm: admin.atualizadoEm || null } };
  });

  app.patch('/adm/pedidos/:id', async (req) => {
    const dir = pedidoDir(req.params.id);
    if (!(await readJson(path.join(dir, 'dados.json')))) throw new HttpError(404, 'Pedido não encontrado.');
    const current = await readJson(path.join(dir, 'admin.json'), {});
    const body = req.body || {};
    const next = { status: current.status || 'novo', notas: current.notas || '' };
    if (body.status !== undefined) {
      if (!PEDIDO_STATUS.includes(body.status)) throw new HttpError(400, 'Situação inválida.');
      next.status = body.status;
    }
    if (body.notas !== undefined) next.notas = str(body.notas, 5000);
    next.atualizadoEm = new Date().toISOString();
    await writeJson(path.join(dir, 'admin.json'), next);
    return { ok: true, admin: next };
  });

  app.delete('/adm/pedidos/:id', async (req) => {
    const dir = pedidoDir(req.params.id);
    await fsp.rm(dir, { recursive: true, force: true });
    req.log.info({ id: req.params.id }, 'pedido excluído no painel');
    return { ok: true };
  });

  app.get('/adm/pedidos/:id/ficheiros/:nome', async (req, reply) => {
    const dir = pedidoDir(req.params.id);
    const nome = req.params.nome;
    const m = FILE_RE.exec(nome);
    if (!m) throw new HttpError(404, 'Não encontrado.');
    const file = path.join(dir, nome);
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat) throw new HttpError(404, 'Não encontrado.');
    // Um SVG aberto diretamente poderia correr scripts neste domínio: sandbox.
    reply.header('content-security-policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    reply.header('cache-control', 'private, max-age=3600');
    if (req.query.download) reply.header('content-disposition', `attachment; filename="${req.params.id}-${nome}"`);
    return reply.type(MIME[m[2]]).header('content-length', stat.size).send(fs.createReadStream(file));
  });

  app.get('/adm/pedidos/:id/zip', async (req, reply) => {
    const dir = pedidoDir(req.params.id);
    const dados = await readJson(path.join(dir, 'dados.json'));
    if (!dados) throw new HttpError(404, 'Pedido não encontrado.');
    const entries = [];
    for (const f of ['resumo.txt', 'dados.json', ...(dados.ficheiros || []).filter((x) => FILE_RE.test(x))]) {
      if (await fsp.stat(path.join(dir, f)).catch(() => null)) entries.push({ name: f, file: path.join(dir, f) });
    }
    const slug = String(dados.negocio.nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    reply.header('content-disposition', `attachment; filename="${slug || 'pedido'}-${req.params.id}.zip"`);
    return reply.type('application/zip').send(Readable.from(zipStream(entries)));
  });

  // ---------- mensagens ----------
  app.get('/adm/mensagens/:id', async (req) => {
    const m = await readJson(mensagemFile(req.params.id));
    if (!m) throw new HttpError(404, 'Mensagem não encontrada.');
    return { ok: true, mensagem: m };
  });

  app.patch('/adm/mensagens/:id', async (req) => {
    const file = mensagemFile(req.params.id);
    const m = await readJson(file);
    if (!m) throw new HttpError(404, 'Mensagem não encontrada.');
    const body = req.body || {};
    m.admin = m.admin || { status: 'nova', notas: '' };
    if (body.status !== undefined) {
      if (!MENSAGEM_STATUS.includes(body.status)) throw new HttpError(400, 'Situação inválida.');
      m.admin.status = body.status;
    }
    if (body.notas !== undefined) m.admin.notas = str(body.notas, 5000);
    m.admin.atualizadoEm = new Date().toISOString();
    await writeJson(file, m);
    return { ok: true, admin: m.admin };
  });

  app.delete('/adm/mensagens/:id', async (req) => {
    await fsp.rm(mensagemFile(req.params.id), { force: true });
    req.log.info({ id: req.params.id }, 'mensagem excluída no painel');
    return { ok: true };
  });

  // ---------- blog ----------
  app.get('/adm/blog', async (req) => {
    try {
      return { ok: true, ...(await blogPosts()) };
    } catch (err) {
      req.log.warn({ err: err.message }, 'falha ao ler posts do Hashnode');
      return { ok: true, url: 'https://blog.lynxcoder.com.br', posts: [], erro: 'Não foi possível carregar os posts agora.' };
    }
  });
};
