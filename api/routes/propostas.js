// Propostas individuais e convites para o formulário /comecar.
//
// Cada proposta tem um link só do cliente (lynxcoder.com.br/proposta#<token>),
// expira na validade configurada (15 dias por omissão), regista quando foi
// aberta e o aceite. Depois, o painel "liberta" o formulário: gera um convite
// (lynxcoder.com.br/comecar#<token>) de uso único, válido 30 dias.
// Sem link válido, nem o texto da proposta nem o formulário ficam acessíveis.
//
// Os valores (preços, prazos…) são copiados da configuração no momento da
// criação: mudar a tabela depois não altera propostas já enviadas.
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { DIRS, HttpError, str, isEmail, newId, ID_RE, readJson, writeJson, createLimiter } = require('../lib/common');
const config = require('../lib/config');
const { render, AJUDA_CAMPOS } = require('../lib/proposta-template');
const propostaTexto = require('../lib/proposta-texto');
const formulario = require('../lib/formulario');
const mail = require('../lib/mail');

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://lynxcoder.com.br').replace(/\/$/, '');
const TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;
const CONVITE_DIAS = 30;
const DAY = 24 * 60 * 60 * 1000;
const PLANOS = { essencial: 'Essencial', profissional: 'Profissional' };
const PRECOS = ['essencial_implantacao', 'essencial_mensalidade', 'profissional_implantacao', 'profissional_mensalidade'];

const publicLimiter = createLimiter({ windowMs: 15 * 60 * 1000, maxTries: 120 });
const emUso = new Set(); // convites com um envio do formulário a decorrer

const newToken = () => crypto.randomBytes(18).toString('base64url');
const fileOf = (id) => {
  if (!ID_RE.test(id)) throw new HttpError(404, 'Proposta não encontrada.');
  return path.join(DIRS.propostas, `${id}.json`);
};
const linkProposta = (p) => `${PUBLIC_URL}/proposta#${p.token}`;
const linkConvite = (p) => (p.convite ? `${PUBLIC_URL}/comecar#${p.convite.token}` : null);

// Comparação a tempo constante: evita que o tempo de resposta ajude a
// adivinhar um token carácter a carácter. Ambos têm sempre 24 chars (TOKEN_RE
// já validou o recebido; newToken() garante o guardado), mas o comprimento é
// confirmado primeiro porque timingSafeEqual lança erro em buffers desiguais.
function tokenEquals(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

async function all() {
  const files = (await fsp.readdir(DIRS.propostas).catch(() => [])).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) { const p = await readJson(path.join(DIRS.propostas, f)); if (p) out.push(p); }
  return out;
}
async function byToken(token) {
  if (!TOKEN_RE.test(token || '')) return null;
  return (await all()).find((p) => tokenEquals(p.token, token)) || null;
}
async function byConvite(token) {
  if (!TOKEN_RE.test(token || '')) return null;
  return (await all()).find((p) => p.convite && tokenEquals(p.convite.token, token)) || null;
}
const save = (p) => writeJson(fileOf(p.id), p);

function status(p) {
  if (p.canceladaEm) return 'cancelada';
  if (p.convite && p.convite.usadoEm) return 'concluida';
  if (p.convite) return 'formulario';
  if (p.aceite) return 'aceita';
  if (Date.now() > Date.parse(p.expiraEm)) return 'expirada';
  if ((p.visualizacoes || []).length) return 'aberta';
  return 'enviada';
}

function resumo(p) {
  const st = status(p);
  const fmt = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return {
    tipo: 'proposta', id: p.id, recebidoEm: p.criadoEm, status: st, teste: !!p.teste,
    titulo: p.cliente.nome,
    subtitulo: p.cliente.negocio || 'Proposta',
    detalhe: p.aceite ? `Aceita: plano ${PLANOS[p.aceite.plano]}` : (st === 'expirada' ? `Expirou em ${fmt(p.expiraEm)}` : `Válida até ${fmt(p.expiraEm)}`),
  };
}

// ---------- formulário personalizado para um cliente ----------
// p.formulario = { preenchido: {...}, extras: [ids] | null, paletas: [ids] | null, mensagem }
// extras/paletas a null = mostra todas as opções gerais.
function limparPersonalizacao(b) {
  b = b || {};
  const pf = b.preenchido || {};
  const preenchido = {
    nome: str(pf.nome, 80),
    especialidade: str(pf.especialidade, 100),
    cidade: str(pf.cidade, 80),
    area: str(pf.area, 120),
    whatsapp: str(pf.whatsapp, 20).replace(/\D/g, '').slice(-11),
    email: str(pf.email, 120).toLowerCase(),
    instagram: str(pf.instagram, 40).replace(/^@+/, ''),
    subdominio: str(pf.subdominio, 40).toLowerCase().replace(/[^a-z0-9-]/g, ''),
    dominio: str(pf.dominio, 100).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
    paleta: str(pf.paleta, 40),
    historia: str(pf.historia, 1500),
    servicos: (Array.isArray(pf.servicos) ? pf.servicos : []).slice(0, 10)
      .map((s) => ({ nome: str(s && s.nome, 60), descricao: str(s && s.descricao, 160) }))
      .filter((s) => s.nome),
  };
  if (preenchido.email && !isEmail(preenchido.email)) throw new HttpError(400, 'E-mail pré-preenchido inválido.');
  const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)).slice(0, 20) : null);
  return { preenchido, extras: ids(b.extras), paletas: ids(b.paletas), mensagem: str(b.mensagem, 600) };
}

// O que o /comecar recebe: opções gerais filtradas pelo que foi escolhido para este cliente.
async function opcoesDoCliente(p) {
  const geral = await formulario.load();
  const pf = p.formulario || {};
  const extras = Array.isArray(pf.extras) ? geral.extras.filter((x) => pf.extras.includes(x.id)) : geral.extras;
  const escolhidas = Array.isArray(pf.paletas) ? geral.paletas.filter((x) => pf.paletas.includes(x.id)) : [];
  return { extras, paletas: escolhidas.length ? escolhidas : geral.paletas, textos: geral.textos };
}

// ---------- uso pelo formulário (routes/onboarding.js) ----------
async function conviteValido(token) {
  const p = await byConvite(token);
  if (!p || p.canceladaEm) throw new HttpError(403, 'Este link do formulário não é válido. Fale com a LynxCoder.');
  if (p.convite.usadoEm) throw new HttpError(410, 'Este formulário já foi enviado. Se precisar de corrigir algo, fale com a LynxCoder.');
  if (Date.now() > Date.parse(p.convite.expiraEm)) throw new HttpError(410, 'Este link do formulário expirou. Peça um novo à LynxCoder.');
  return p;
}
// Garante que o mesmo convite não é usado em dois envios simultâneos.
function reservar(token) {
  if (emUso.has(token)) throw new HttpError(409, 'Já há um envio deste formulário a decorrer.');
  emUso.add(token);
  return () => emUso.delete(token);
}
async function marcarUsado(token, pedidoId) {
  const p = await byConvite(token);
  if (!p) return;
  p.convite.usadoEm = new Date().toISOString();
  p.convite.pedidoId = pedidoId;
  await save(p);
}

// ---------- rotas públicas (lynxcoder.com.br/api/...) ----------
async function publicRoutes(app) {
  const guard = (req) => {
    if (publicLimiter.blocked(req.ip)) throw new HttpError(429, 'Muitos pedidos. Tente de novo daqui a pouco.');
    publicLimiter.hit(req.ip);
  };

  app.get('/api/proposta/:token', async (req, reply) => {
    guard(req);
    const p = await byToken(req.params.token);
    if (!p || p.canceladaEm) throw new HttpError(404, 'Esta proposta não existe ou foi cancelada.');
    if (!p.aceite && Date.now() > Date.parse(p.expiraEm)) throw new HttpError(410, 'Esta proposta expirou. Fale com a LynxCoder para receber uma atualizada.');
    if (!req.query.previa) {
      p.visualizacoes = [...(p.visualizacoes || []), new Date().toISOString()].slice(-50);
      await save(p);
    }
    reply.header('cache-control', 'no-store');
    reply.header('x-robots-tag', 'noindex, nofollow');
    return {
      ok: true,
      html: render(p, p.valores || {}),
      cliente: { nome: p.cliente.nome },
      expiraEm: p.expiraEm,
      aceite: p.aceite ? { em: p.aceite.em, plano: p.aceite.plano, nome: p.aceite.nome } : null,
    };
  });

  app.post('/api/proposta/:token/aceitar', async (req, reply) => {
    guard(req);
    const p = await byToken(req.params.token);
    if (!p || p.canceladaEm) throw new HttpError(404, 'Esta proposta não existe ou foi cancelada.');
    if (p.aceite) return { ok: true, aceite: { em: p.aceite.em, plano: p.aceite.plano, nome: p.aceite.nome } };
    if (Date.now() > Date.parse(p.expiraEm)) throw new HttpError(410, 'Esta proposta expirou.');
    const body = req.body || {};
    const plano = PLANOS[body.plano] ? body.plano : null;
    const nome = str(body.nome, 120);
    if (!plano) throw new HttpError(400, 'Escolha um dos planos.');
    if (nome.length < 3) throw new HttpError(400, 'Escreva o seu nome completo.');
    if (body.concordo !== true) throw new HttpError(400, 'Marque que leu e aceita os termos da proposta.');
    // Registo do aceite: data, nome, plano, IP e navegador servem de prova do acordo.
    p.aceite = {
      em: new Date().toISOString(), plano, nome,
      ip: req.ip, navegador: str(req.headers['user-agent'] || '', 300),
    };
    await save(p);
    req.log.info({ id: p.id, plano, teste: !!p.teste }, 'proposta aceite');
    if (!p.teste) mail.notify({
      subject: `Proposta aceite: ${p.cliente.nome} (plano ${PLANOS[plano]})`,
      text: `${nome} aceitou a proposta para ${p.cliente.nome} no plano ${PLANOS[plano]}.\n\n` +
        `Próximo passo: enviar o link de pagamento e liberar o formulário no painel:\n` +
        `https://admin.lynxcoder.com.br/#/proposta/${p.id}\n`,
      replyTo: p.cliente.email || undefined,
    }, req.log);
    reply.header('cache-control', 'no-store');
    return { ok: true, aceite: { em: p.aceite.em, plano, nome } };
  });

  app.get('/api/comecar/:token', async (req, reply) => {
    guard(req);
    const p = await conviteValido(req.params.token);
    reply.header('cache-control', 'no-store');
    const pf = p.formulario || {};
    return {
      ok: true,
      teste: !!p.teste,
      cliente: { nome: p.cliente.negocio || '', email: p.cliente.email || '', whatsapp: p.cliente.whatsapp || '' },
      plano: p.aceite ? p.aceite.plano : null,
      preenchido: pf.preenchido || null,
      mensagem: pf.mensagem || '',
      opcoes: await opcoesDoCliente(p),
    };
  });
}

// ---------- rotas do painel (registadas dentro de routes/admin.js) ----------
async function adminRoutes(app) {
  app.get('/adm/config', async () => ({ ok: true, campos: config.CAMPOS, valores: await config.load() }));

  app.put('/adm/config', async (req) => ({ ok: true, valores: await config.save(req.body || {}) }));

  app.post('/adm/propostas', async (req) => {
    const b = req.body || {};
    const c = b.cliente || {};
    const cliente = {
      nome: str(c.nome, 120),
      negocio: str(c.negocio, 120),
      whatsapp: str(c.whatsapp, 20).replace(/\D/g, ''),
      email: str(c.email, 160).toLowerCase(),
    };
    if (cliente.nome.length < 2) throw new HttpError(400, 'Informe o nome do cliente.');
    if (cliente.email && !isEmail(cliente.email)) throw new HttpError(400, 'E-mail do cliente inválido.');
    const valores = await config.load();
    for (const k of PRECOS) {
      if (b.precos && typeof b.precos[k] === 'string' && b.precos[k].trim()) valores[k] = str(b.precos[k], 40);
    }
    const dias = Math.min(90, Math.max(1, parseInt(b.validadeDias || valores.validade_dias || 15, 10) || 15));
    const p = {
      id: newId(), token: newToken(),
      criadoEm: new Date().toISOString(),
      expiraEm: new Date(Date.now() + dias * DAY).toISOString(),
      cliente, valores,
      texto: (await propostaTexto.load()).texto,
      teste: b.teste === true,
      mensagem: str(b.mensagem, 1000),
      visualizacoes: [], aceite: null, convite: null, canceladaEm: null,
    };
    await save(p);
    return { ok: true, id: p.id };
  });

  app.get('/adm/propostas/:id', async (req) => {
    const p = await readJson(fileOf(req.params.id));
    if (!p) throw new HttpError(404, 'Proposta não encontrada.');
    return { ok: true, proposta: { ...p, status: status(p), link: linkProposta(p), linkFormulario: linkConvite(p) } };
  });

  app.post('/adm/propostas/:id/cancelar', async (req) => {
    const p = await readJson(fileOf(req.params.id));
    if (!p) throw new HttpError(404, 'Proposta não encontrada.');
    p.canceladaEm = p.canceladaEm || new Date().toISOString();
    await save(p);
    return { ok: true };
  });

  // Gera (ou renova, se ainda não foi usado) o link do formulário /comecar.
  app.post('/adm/propostas/:id/convite', async (req) => {
    const p = await readJson(fileOf(req.params.id));
    if (!p) throw new HttpError(404, 'Proposta não encontrada.');
    if (p.canceladaEm) throw new HttpError(400, 'A proposta foi cancelada.');
    if (p.convite && p.convite.usadoEm) throw new HttpError(400, 'O formulário deste cliente já foi enviado.');
    p.convite = {
      token: newToken(),
      criadoEm: new Date().toISOString(),
      expiraEm: new Date(Date.now() + CONVITE_DIAS * DAY).toISOString(),
      usadoEm: null, pedidoId: null,
    };
    await save(p);
    return { ok: true, linkFormulario: linkConvite(p) };
  });

  // Personaliza o formulário deste cliente (antes ou depois de liberado, até ao envio).
  app.put('/adm/propostas/:id/formulario', async (req) => {
    const p = await readJson(fileOf(req.params.id));
    if (!p) throw new HttpError(404, 'Proposta não encontrada.');
    if (p.canceladaEm) throw new HttpError(400, 'A proposta foi cancelada.');
    if (p.convite && p.convite.usadoEm) throw new HttpError(400, 'O cliente já enviou o formulário: edite as respostas no pedido.');
    p.formulario = { ...limparPersonalizacao(req.body), atualizadoEm: new Date().toISOString() };
    await save(p);
    return { ok: true, formulario: p.formulario };
  });

  // ---------- texto da proposta ----------
  app.get('/adm/proposta-texto', async () => ({ ok: true, ...(await propostaTexto.load()), campos: AJUDA_CAMPOS }));
  app.put('/adm/proposta-texto', async (req) => {
    const texto = req.body && typeof req.body.texto === 'string' ? req.body.texto : null;
    return { ok: true, ...(await propostaTexto.save(texto)) };
  });

  // ---------- opções do formulário /comecar ----------
  const comCampos = (r) => ({ ok: true, ...r, textosCampos: formulario.TEXTOS_CAMPOS });
  app.get('/adm/formulario', async () => comCampos(await formulario.load()));
  app.put('/adm/formulario', async (req) => {
    if (req.body && req.body.restaurar === true) return comCampos(await formulario.restaurar());
    if (req.body && req.body.restaurarTextos === true) return comCampos(await formulario.restaurarTextos());
    return comCampos(await formulario.save(req.body || {}));
  });

  // ---------- apagar todos os testes (propostas e pedidos de teste) ----------
  app.delete('/adm/testes', async (req) => {
    let propostasApagadas = 0, pedidosApagados = 0;
    for (const p of await all()) {
      if (!p.teste) continue;
      await fsp.rm(fileOf(p.id), { force: true });
      propostasApagadas++;
    }
    for (const id of (await fsp.readdir(DIRS.pedidos).catch(() => [])).filter((x) => ID_RE.test(x))) {
      const d = await readJson(path.join(DIRS.pedidos, id, 'dados.json'));
      if (d && d.teste) { await fsp.rm(path.join(DIRS.pedidos, id), { recursive: true, force: true }); pedidosApagados++; }
    }
    let clientesApagados = 0;
    for (const c of await require('./clientes').all()) {
      if (c.teste) { await fsp.rm(path.join(DIRS.clientes, `${c.id}.json`), { force: true }); clientesApagados++; }
    }
    req.log.info({ propostasApagadas, pedidosApagados, clientesApagados }, 'testes apagados no painel');
    return { ok: true, propostasApagadas, pedidosApagados, clientesApagados };
  });

  app.delete('/adm/propostas/:id', async (req) => {
    await fsp.rm(fileOf(req.params.id), { force: true });
    req.log.info({ id: req.params.id }, 'proposta excluída no painel');
    return { ok: true };
  });
}

module.exports = { publicRoutes, adminRoutes, all, resumo, status, conviteValido, reservar, marcarUsado, PLANOS };
