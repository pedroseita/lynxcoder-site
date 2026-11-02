// Compra direta de páginas em lynxsites.com.br/criar (docs/specs, fase 02).
//
//   GET    /api/criar/catalogo                    profissões, tipos e extras ativos
//   GET    /api/criar/subdominio?nome=            disponibilidade + sugestão
//   POST   /api/criar/rascunho                    cria (sem id) ou atualiza o rascunho
//   GET    /api/criar/rascunho/:id                retomar (com o token)
//   POST   /api/criar/rascunho/:id/fotos?tipo=    uma foto (retrato | trabalho)
//   GET    /api/criar/rascunho/:id/fotos/:nome    ver uma foto já enviada
//   DELETE /api/criar/rascunho/:id/fotos/:nome
//   POST   /api/criar/rascunho/:id/checkout       recalcula o total e cria a cobrança
//   POST   /api/criar/pagamentos/webhook          confirmação do gateway (lib/gateway.js)
//
// Cada compra fica em /data/criar/<id>/ (compra.json + fotos/). O token do
// rascunho vai no cabeçalho X-Token; no servidor só se guarda o hash.
// Rascunhos sem pagamento há 48 h são apagados, com as fotos.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { DIRS, HttpError, str, isEmail, newId, ID_RE, readJson, writeJson, createLimiter } = require('../lib/common');
const { RESERVADOS } = require('../lib/reservados');
const catalogo = require('../lib/catalogo');
const gateway = require('../lib/gateway');
const empresa = require('../lib/empresa');
const pix = require('../lib/pix');
const mail = require('../lib/mail');
const { sniff } = require('./onboarding');

const MB = 1024 * 1024;
const EXPIRA_MS = 48 * 60 * 60 * 1000;
const MAX_TRABALHO = 5;
const MIN_TRABALHO = 3;
const ESTADOS = ['rascunho', 'aguardando_pagamento', 'pago', 'em_revisao', 'publicado', 'recusado'];
const CORES = { amarelo: '#f5b700', azul: '#2563eb', verde: '#16a34a', roxo: '#7c3aed', coral: '#f0573a' };
const ATENDE = ['local', 'domicilio', 'online'];
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const FORMAS_PRESTADOR = ['pix', 'cartao', 'dinheiro'];
const PRECO = ['fixo', 'a_partir_de', 'sob_orcamento'];
const SUB_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const FOTO_RE = /^(retrato|trabalho-[1-5])\.(jpg|png|webp)$/;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const EVENTOS = path.join(DIRS.criar, '_eventos.json');

// Por IP e por hora.
const limCriar = createLimiter({ windowMs: 3600e3, maxTries: 30, maxOk: 10 });
const limEscrita = createLimiter({ windowMs: 3600e3, maxTries: 300 });
const limFotos = createLimiter({ windowMs: 3600e3, maxTries: 80 });
const limSub = createLimiter({ windowMs: 3600e3, maxTries: 400 });
const limCheckout = createLimiter({ windowMs: 3600e3, maxTries: 30 });
const limitar = (lim, req) => {
  if (lim.blocked(req.ip)) throw new HttpError(429, 'Muitos pedidos seguidos. Espere um pouco e tente de novo.');
  lim.hit(req.ip);
};

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const dir = (id) => {
  if (!ID_RE.test(String(id))) throw new HttpError(404, 'Compra não encontrada.');
  return path.join(DIRS.criar, id);
};
const ficheiro = (id) => path.join(dir(id), 'compra.json');
const agora = () => new Date().toISOString();

async function carregar(id) {
  const c = await readJson(ficheiro(id));
  if (!c) throw new HttpError(404, 'Compra não encontrada. Comece de novo.');
  return c;
}

async function autenticar(req) {
  const c = await carregar(req.params.id);
  const t = String(req.headers['x-token'] || '');
  const a = Buffer.from(hash(t), 'hex');
  const b = Buffer.from(String(c.tokenHash || ''), 'hex');
  if (!t || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(404, 'Compra não encontrada. Comece de novo.');
  return c;
}

const editavel = (c) => {
  if (!['rascunho', 'aguardando_pagamento'].includes(c.estado)) throw new HttpError(409, 'Esta compra já foi paga e não pode ser alterada aqui. Fale connosco pelo WhatsApp.');
};

// O que o browser pode ver da compra (nunca o hash do token).
function paraCliente(c) {
  const { tokenHash, historico, notas, ...rest } = c;
  return rest;
}

// ---------- validação por etapas ----------

function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
function cnpjValido(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((acc, x, i) => acc + x * Number(d[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

const hora = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '');
const lista = (v, permitidos) => [...new Set((Array.isArray(v) ? v : []).filter((x) => permitidos.includes(x)))];

function limparDados(d, cat, etapa) {
  const fail = (msg) => { throw new HttpError(400, msg); };
  const n = d.negocio || {};
  const out = {
    prof: str(d.prof, 40),
    tipo: str(d.tipo, 40),
    negocio: {
      nome: str(n.nome, 60),
      whatsapp: str(n.whatsapp, 20).replace(/\D/g, '').slice(0, 11),
      cidade: str(n.cidade, 60),
      email: str(n.email, 120).toLowerCase(),
      atende: lista(n.atende, ATENDE),
      dias: lista(n.dias, DIAS),
      inicio: hora(n.inicio),
      fim: hora(n.fim),
    },
    servicos: (Array.isArray(d.servicos) ? d.servicos : []).slice(0, 8).map((s) => {
      const tipo = PRECO.includes(s && s.preco) ? s.preco : 'fixo';
      const v = Number(String(s && s.valor != null ? s.valor : '').replace(',', '.'));
      return { nome: str(s && s.nome, 60), preco: tipo, valor: tipo === 'sob_orcamento' || !Number.isFinite(v) ? null : Math.round(v * 100) / 100 };
    }).filter((s) => s.nome),
    pagamentos: lista(d.pagamentos, FORMAS_PRESTADOR),
    extras: [...new Set((Array.isArray(d.extras) ? d.extras : []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)))].slice(0, 20),
    cor: Object.prototype.hasOwnProperty.call(CORES, d.cor) ? d.cor : '',
    subdominio: str(d.subdominio, 40).toLowerCase(),
  };

  // Etapa 1: profissão e tipo (o calcular confirma que existem e estão ativos).
  catalogo.calcular(cat, { prof: out.prof, tipo: out.tipo, extras: etapa >= 4 ? out.extras : [] });

  if (etapa >= 2) {
    const ng = out.negocio;
    if (ng.nome.length < 2) fail('Informe o nome do negócio.');
    if (!/^[1-9][1-9](?:[2-5]\d{7}|9\d{8})$/.test(ng.whatsapp)) fail('Informe um WhatsApp com DDD.');
    if (ng.cidade.length < 2) fail('Informe a cidade.');
    if (!isEmail(ng.email)) fail('Informe um e-mail válido.');
    if (!ng.atende.length) fail('Escolha pelo menos uma forma de atendimento.');
    if (!ng.dias.length) fail('Escolha pelo menos um dia de atendimento.');
    if (!ng.inicio || !ng.fim || ng.inicio >= ng.fim) fail('O horário de início tem de ser antes do fim.');
  }
  if (etapa >= 3) {
    if (!out.servicos.length) fail('Adicione pelo menos um serviço.');
    for (const s of out.servicos) {
      if (s.preco !== 'sob_orcamento' && !(s.valor > 0 && s.valor <= 100000)) fail(`Informe o valor de "${s.nome}" (ou escolha "Sob orçamento").`);
    }
  }
  if (etapa >= 5) {
    if (!out.cor) fail('Escolha a cor principal da página.');
    if (!SUB_RE.test(out.subdominio) || out.subdominio.includes('--')) fail('Endereço inválido: de 3 a 32 letras, números ou hífen.');
    if (RESERVADOS.has(out.subdominio)) fail('Esse endereço é reservado. Escolha outro.');
  }
  return out;
}

// ---------- subdomínios ocupados ----------

let cacheOcupados = { em: 0, mapa: new Map() };

// nome -> id da compra que o tem (ou "pedido"/"cliente"). Cache curto: a
// verificação corre enquanto o cliente escreve.
async function ocupados() {
  if (Date.now() - cacheOcupados.em < 20000) return cacheOcupados.mapa;
  const mapa = new Map();
  const ler = async (pasta, fn) => {
    let entradas = [];
    try { entradas = await fsp.readdir(pasta); } catch { return; }
    await Promise.all(entradas.map(fn));
  };
  await ler(DIRS.criar, async (id) => {
    if (!ID_RE.test(id)) return;
    const c = await readJson(path.join(DIRS.criar, id, 'compra.json'));
    if (c && c.subdominio && c.estado !== 'recusado') mapa.set(c.subdominio, id);
  });
  await ler(DIRS.pedidos, async (id) => {
    const d = await readJson(path.join(DIRS.pedidos, id, 'dados.json'));
    const s = d && d.plano && d.plano.subdominio;
    if (s) mapa.set(s, 'pedido');
  });
  await ler(DIRS.clientes, async (f) => {
    const c = await readJson(path.join(DIRS.clientes, f));
    const m = c && /^(?:https?:\/\/)?([a-z0-9-]+)\.lynxsites\.com\.br/.exec(String(c.endereco || ''));
    if (m) mapa.set(m[1], 'cliente');
  });
  cacheOcupados = { em: Date.now(), mapa };
  return mapa;
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function disponibilidade(nome, cidade, proprioId) {
  if (!SUB_RE.test(nome) || nome.includes('--')) return { disponivel: false, motivo: 'De 3 a 32 letras minúsculas, números ou hífen (sem hífen nas pontas).' };
  if (RESERVADOS.has(nome)) return { disponivel: false, motivo: 'Esse endereço é reservado.' };
  const mapa = await ocupados();
  const livre = (s) => SUB_RE.test(s) && !s.includes('--') && !RESERVADOS.has(s) && (!mapa.has(s) || mapa.get(s) === proprioId);
  if (livre(nome)) return { disponivel: true };
  const base = `${nome}-${slug(cidade)}`.replace(/-+$/, '').slice(0, 32).replace(/-+$/, '');
  let sugestao = null;
  for (const s of [base, ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => `${nome.slice(0, 30)}${i}`)]) if (s !== nome && livre(s)) { sugestao = s; break; }
  return { disponivel: false, motivo: 'Esse endereço já está ocupado.', sugestao };
}

// ---------- Turnstile (Cloudflare), só se TURNSTILE_SECRET existir ----------

async function verificarTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: String(token || ''), remoteip: ip }),
    signal: AbortSignal.timeout(10000),
  }).then((r) => r.json()).catch(() => ({}));
  if (!res.success) throw new HttpError(400, 'Não foi possível confirmar que não é um robô. Recarregue a página e tente de novo.');
}

// ---------- fotos ----------

async function listarFotos(id) {
  let nomes = [];
  try { nomes = await fsp.readdir(path.join(dir(id), 'fotos')); } catch { return { retrato: null, trabalho: [] }; }
  nomes = nomes.filter((f) => FOTO_RE.test(f)).sort();
  return { retrato: nomes.find((f) => f.startsWith('retrato.')) || null, trabalho: nomes.filter((f) => f.startsWith('trabalho-')) };
}

// ---------- resumo e avisos ----------

const dinheiro = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function textoCompra(c) {
  const n = c.negocio;
  return [
    `Compra ${c.id} — ${c.estado}`,
    '',
    `Negócio: ${n.nome} (${c.profNome || c.prof})`,
    `Tipo: ${c.tipoNome || c.tipo}`,
    `Endereço: ${c.subdominio}.lynxsites.com.br`,
    `WhatsApp: ${n.whatsapp} · E-mail: ${n.email} · ${n.cidade}`,
    '',
    ...(c.totais ? [...c.totais.linhas.map((l) => `${l.descricao}: ${dinheiro(l.valor)}`), `Total: ${dinheiro(c.totais.total)} (${c.totais.plano})`] : []),
    '',
    'Abrir no painel: https://admin.lynxcoder.com.br/#/compra/' + c.id,
  ].join('\n');
}

function resumo(c) {
  const n = c.negocio || {};
  return {
    tipo: 'compra', id: c.id, recebidoEm: c.criadoEm, status: c.estado, teste: false,
    titulo: n.nome || '(sem nome)',
    subtitulo: `${c.profNome || c.prof || ''} · ${c.tipoNome || c.tipo || ''}${c.totais ? ' · ' + dinheiro(c.totais.total) : ''}`,
    detalhe: c.subdominio ? `${c.subdominio}.lynxsites.com.br` : 'Rascunho a meio',
  };
}

async function todas() {
  let ids = [];
  try { ids = (await fsp.readdir(DIRS.criar)).filter((x) => ID_RE.test(x)); } catch { return []; }
  return (await Promise.all(ids.map((id) => readJson(path.join(DIRS.criar, id, 'compra.json'))))).filter(Boolean);
}

async function guardar(c, evento) {
  c.atualizadoEm = agora();
  if (evento) (c.historico = c.historico || []).push({ em: c.atualizadoEm, ...evento });
  await writeJson(ficheiro(c.id), c);
  cacheOcupados.em = 0;
}

// Rascunhos e cobranças por pagar, sem mexer há 48 h: apagados com as fotos.
async function limparExpirados(log) {
  for (const c of await todas()) {
    if (!['rascunho', 'aguardando_pagamento'].includes(c.estado)) continue;
    if (Date.now() - Date.parse(c.atualizadoEm || c.criadoEm) < EXPIRA_MS) continue;
    await fsp.rm(dir(c.id), { recursive: true, force: true });
    log.info({ id: c.id, estado: c.estado }, 'compra expirada apagada');
  }
  cacheOcupados.em = 0;
}

// ---------- rotas públicas ----------

async function publicRoutes(app) {
  setInterval(() => limparExpirados(app.log).catch((err) => app.log.error({ err }, 'limpeza de compras')), 3600e3).unref();
  setTimeout(() => limparExpirados(app.log).catch(() => {}), 30e3).unref();

  app.get('/api/criar/catalogo', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const cat = await catalogo.load();
    const g = gateway.ativo();
    const emp = await empresa.load();
    const pixCfg = await pix.load();
    return {
      ok: true,
      catalogo: catalogo.publico(cat),
      cores: CORES,
      reservados: [...RESERVADOS],
      pagamento: { gateway: g.id, formas: g.formas, pixManual: g.id === 'manual' && !!pixCfg.chave },
      turnstile: process.env.TURNSTILE_SITEKEY || null,
      vendedor: {
        nome: emp.nome,
        documento: emp.documento,
        endereco: emp.endereco,
        whatsapp: emp.whatsapp,
      },
    };
  });

  app.get('/api/criar/subdominio', async (req) => {
    limitar(limSub, req);
    const nome = str(req.query.nome, 40).toLowerCase();
    return { ok: true, nome, ...(await disponibilidade(nome, str(req.query.cidade, 60), str(req.query.id, 40))) };
  });

  // Cria (sem id: exige etapa 2 completa e o Turnstile) ou atualiza.
  app.post('/api/criar/rascunho', async (req) => {
    const b = req.body || {};
    const etapa = Math.min(Math.max(Number(b.etapa) || 2, 2), 5);
    const cat = await catalogo.load();
    const dados = limparDados(b.dados || {}, cat, etapa);

    let c;
    let token = null;
    if (b.id) {
      limitar(limEscrita, req);
      req.params = { id: String(b.id) };
      c = await autenticar(req);
      editavel(c);
    } else {
      limitar(limCriar, req);
      await verificarTurnstile(b.turnstile, req.ip);
      token = crypto.randomBytes(32).toString('base64url');
      c = { id: newId(), tokenHash: hash(token), estado: 'rascunho', criadoEm: agora(), ip: req.ip };
      await fsp.mkdir(path.join(DIRS.criar, c.id, 'fotos'), { recursive: true });
      limCriar.ok(req.ip);
    }

    if (etapa >= 5) {
      const d = await disponibilidade(dados.subdominio, dados.negocio.cidade, c.id);
      if (!d.disponivel) throw new HttpError(409, d.motivo + (d.sugestao ? ` Sugestão: ${d.sugestao}` : ''));
      const fotos = await listarFotos(c.id);
      if (!fotos.retrato) throw new HttpError(400, 'Envie a sua foto (de rosto).');
      if (fotos.trabalho.length < MIN_TRABALHO) throw new HttpError(400, `Envie pelo menos ${MIN_TRABALHO} fotos do seu trabalho.`);
    }
    const p = cat.profissoes.find((x) => x.id === dados.prof);
    Object.assign(c, dados, { etapa: Math.max(c.etapa || 0, etapa), profNome: p ? p.nome : dados.prof, tipoNome: cat.tipos[dados.tipo].nome });
    // Mudou algo que mexe no preço depois de criar a cobrança: volta a rascunho.
    if (c.estado === 'aguardando_pagamento') { c.estado = 'rascunho'; c.cobranca = null; }
    await guardar(c, token ? { acao: 'criado' } : null);
    return { ok: true, id: c.id, ...(token ? { token } : {}), expiraEm: new Date(Date.parse(c.atualizadoEm) + EXPIRA_MS).toISOString() };
  });

  app.get('/api/criar/rascunho/:id', async (req) => {
    const c = await autenticar(req);
    return { ok: true, compra: paraCliente(c), fotos: await listarFotos(c.id) };
  });

  app.post('/api/criar/rascunho/:id/fotos', async (req) => {
    limitar(limFotos, req);
    const c = await autenticar(req);
    editavel(c);
    const tipo = req.query.tipo === 'retrato' ? 'retrato' : 'trabalho';
    const pasta = path.join(dir(c.id), 'fotos');
    await fsp.mkdir(pasta, { recursive: true });
    const atuais = await listarFotos(c.id);
    let base;
    if (tipo === 'retrato') base = 'retrato';
    else {
      const usados = new Set(atuais.trabalho.map((f) => f.split('.')[0]));
      const livre = [1, 2, 3, 4, 5].find((i) => !usados.has(`trabalho-${i}`));
      if (!livre) throw new HttpError(400, `No máximo ${MAX_TRABALHO} fotos do trabalho.`);
      base = `trabalho-${livre}`;
    }

    const part = await req.file({ limits: { fileSize: 8 * MB, files: 1, fields: 0 } });
    if (!part) throw new HttpError(400, 'Nenhuma foto recebida.');
    const tmp = path.join(DIRS.tmp, `criar-${crypto.randomBytes(8).toString('hex')}`);
    try {
      await pipeline(part.file, fs.createWriteStream(tmp));
      if (part.file.truncated) throw new HttpError(413, 'Foto grande demais (máximo 8 MB).');
      const ext = await sniff(tmp);
      if (!['jpg', 'png', 'webp'].includes(ext)) throw new HttpError(400, 'Formato não aceite. Use JPG, PNG ou WebP.');
      if (tipo === 'retrato' && atuais.retrato) await fsp.rm(path.join(pasta, atuais.retrato), { force: true });
      const nome = `${base}.${ext}`;
      await fsp.rename(tmp, path.join(pasta, nome));
      await guardar(c);
      return { ok: true, foto: nome, fotos: await listarFotos(c.id) };
    } finally {
      await fsp.rm(tmp, { force: true });
    }
  });

  app.get('/api/criar/rascunho/:id/fotos/:nome', async (req, reply) => {
    const c = await autenticar(req);
    const m = FOTO_RE.exec(req.params.nome);
    if (!m) throw new HttpError(404, 'Foto não encontrada.');
    const file = path.join(dir(c.id), 'fotos', req.params.nome);
    try { await fsp.access(file); } catch { throw new HttpError(404, 'Foto não encontrada.'); }
    reply.header('cache-control', 'private, no-store').header('content-security-policy', "default-src 'none'");
    return reply.type(MIME[m[2]]).send(fs.createReadStream(file));
  });

  app.delete('/api/criar/rascunho/:id/fotos/:nome', async (req) => {
    limitar(limEscrita, req);
    const c = await autenticar(req);
    editavel(c);
    if (!FOTO_RE.test(req.params.nome)) throw new HttpError(404, 'Foto não encontrada.');
    await fsp.rm(path.join(dir(c.id), 'fotos', req.params.nome), { force: true });
    await guardar(c);
    return { ok: true, fotos: await listarFotos(c.id) };
  });

  app.post('/api/criar/rascunho/:id/checkout', async (req, reply) => {
    limitar(limCheckout, req);
    const c = await autenticar(req);
    editavel(c);
    const b = req.body || {};
    const fail = (msg) => { throw new HttpError(400, msg); };

    const cat = await catalogo.load();
    if (!cat.pagamentos_ativos) throw new HttpError(503, 'Os pagamentos abrem em breve.');
    limparDados(c, cat, 5); // confirma que o rascunho guardado continua completo e válido
    const fotos = await listarFotos(c.id);
    if (!fotos.retrato || fotos.trabalho.length < MIN_TRABALHO) fail('Faltam fotos. Volte ao passo 5.');
    const d = await disponibilidade(c.subdominio, c.negocio.cidade, c.id);
    if (!d.disponivel) throw new HttpError(409, `${d.motivo} Volte ao passo 5 e escolha outro.`);

    const g = gateway.ativo();
    const forma = b.forma === 'cartao' ? 'cartao' : 'pix';
    if (!g.formas.includes(forma)) fail('Essa forma de pagamento ainda não está disponível.');
    const nome = str(b.nome, 100).replace(/\s+/g, ' ');
    const documento = str(b.documento, 20).replace(/\D/g, '');
    if (nome.length < 5 || !nome.includes(' ')) fail('Informe o nome completo.');
    if (!(documento.length === 11 ? cpfValido(documento) : cnpjValido(documento))) fail('CPF ou CNPJ inválido.');
    if (b.termos !== true) fail('É preciso aceitar os termos e a política de privacidade.');

    const totais = catalogo.calcular(cat, { prof: c.prof, tipo: c.tipo, extras: c.extras, plano: b.plano });
    if (Math.round(Number(b.totalEsperado) * 100) !== Math.round(totais.total * 100)) {
      return reply.code(409).send({ ok: false, message: 'Os valores foram atualizados. Confira o novo total antes de pagar.', totais });
    }

    const cobranca = await g.criarCobranca({ compra: c, total: totais.total, forma, nome, documento });
    Object.assign(c, {
      estado: 'aguardando_pagamento',
      totais,
      comprador: { nome, documento, forma },
      consentimentos: { termos: true, lembrete: b.lembrete === true, em: agora(), ip: req.ip },
      cobranca: { ...cobranca, criadaEm: agora(), valor: totais.total },
    });
    await guardar(c, { acao: 'cobranca', gateway: g.id, forma, total: totais.total });
    mail.notify({ subject: `Compra a aguardar pagamento: ${c.negocio.nome} (${dinheiro(totais.total)})`, text: textoCompra(c), replyTo: c.negocio.email }, req.log);
    return { ok: true, estado: c.estado, totais, cobranca: c.cobranca, emiteNota: cat.emite_nota_fiscal };
  });

  // Webhook do gateway: assinatura validada, idempotente, e o pagamento é
  // confirmado consultando o gateway (o corpo recebido não chega).
  app.post('/api/criar/pagamentos/webhook', { bodyLimit: 64 * 1024 }, async (req) => {
    const g = gateway.ativo();
    const ev = g.validarWebhook(req);
    const vistos = await readJson(EVENTOS, []);
    if (vistos.includes(ev.evento)) return { ok: true, repetido: true };
    if (ev.pagamentoId) {
      const info = await g.consultar(ev.pagamentoId);
      const id = (info && info.compraId) || ev.compraId;
      if (info && info.pago && ID_RE.test(id)) {
        const c = await readJson(ficheiro(id));
        if (c && c.estado === 'aguardando_pagamento' && c.cobranca && c.cobranca.pagamentoId === ev.pagamentoId
            && Math.round(info.valor * 100) >= Math.round(c.totais.total * 100)) {
          c.estado = 'pago';
          c.pagoEm = agora();
          await guardar(c, { acao: 'pago', gateway: g.id, pagamentoId: ev.pagamentoId });
          mail.notify({ subject: `Compra paga: ${c.negocio.nome}`, text: textoCompra(c), replyTo: c.negocio.email }, req.log);
          mail.sendTo({ to: c.negocio.email, subject: 'Pagamento confirmado — a sua página LynxSites', text: `Olá! Recebemos o pagamento da página ${c.subdominio}.lynxsites.com.br. Ela fica no ar em até 24 horas, depois da nossa revisão. Avisamos por WhatsApp e e-mail.` }, req.log);
        }
      }
    }
    await writeJson(EVENTOS, [...vistos, ev.evento].slice(-2000));
    return { ok: true };
  });
}

// ---------- painel ----------

async function adminRoutes(app) {
  app.get('/adm/compras/:id', async (req) => {
    const c = await carregar(req.params.id);
    const { tokenHash, ...rest } = c;
    const cat = await catalogo.load();
    const extrasNomes = Object.fromEntries(Object.entries(cat.extras).map(([k, e]) => [k, e.nome]));
    return { ok: true, compra: rest, fotos: await listarFotos(c.id), cores: CORES, extrasNomes };
  });

  app.get('/adm/compras/:id/fotos/:nome', async (req, reply) => {
    const m = FOTO_RE.exec(req.params.nome);
    if (!m) throw new HttpError(404, 'Foto não encontrada.');
    const file = path.join(dir(req.params.id), 'fotos', req.params.nome);
    try { await fsp.access(file); } catch { throw new HttpError(404, 'Foto não encontrada.'); }
    return reply.type(MIME[m[2]]).send(fs.createReadStream(file));
  });

  // Mudança de estado à mão (ex.: "Confirmar pagamento" do PIX manual) e notas.
  app.patch('/adm/compras/:id', async (req) => {
    const c = await carregar(req.params.id);
    const b = req.body || {};
    if (typeof b.notas === 'string') c.notas = b.notas.slice(0, 5000);
    let evento = null;
    if (b.estado && b.estado !== c.estado) {
      if (!ESTADOS.includes(b.estado)) throw new HttpError(400, 'Estado inválido.');
      if (b.estado === 'pago' && c.estado !== 'aguardando_pagamento') throw new HttpError(409, 'Só se confirma o pagamento de uma compra a aguardar pagamento.');
      if (b.estado === 'pago') c.pagoEm = agora();
      evento = { acao: 'estado', de: c.estado, para: b.estado, por: req.session.user };
      c.estado = b.estado;
    }
    await guardar(c, evento);
    return { ok: true, admin: { atualizadoEm: c.atualizadoEm } };
  });

  app.delete('/adm/compras/:id', async (req) => {
    await fsp.rm(dir(req.params.id), { recursive: true, force: true });
    cacheOcupados.em = 0;
    return { ok: true };
  });

  app.get('/adm/catalogo', async () => ({ ok: true, catalogo: await catalogo.load(), padrao: catalogo.PADRAO }));
  app.put('/adm/catalogo', async (req) => ({ ok: true, catalogo: await catalogo.save(req.body && req.body.catalogo) }));
  app.post('/adm/catalogo/restaurar', async () => ({ ok: true, catalogo: await catalogo.restaurar() }));
}

module.exports = { publicRoutes, adminRoutes, todas, resumo, ESTADOS, CORES, cpfValido, cnpjValido };
