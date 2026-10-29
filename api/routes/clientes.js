// Clientes ativos: ficha, mensalidade, pagamentos e estado do site.
//
// Os pagamentos são registados à mão no painel (PIX, transferência…); daqui
// sai a situação de cada cliente: em dia, vence em breve ou em atraso. O painel
// só avisa: suspender uma página é uma decisão tomada no VPS.
//
// Mensalidade: vence todos os meses no dia do primeiro vencimento (num mês
// mais curto, no último dia). Um pagamento quita um mês ("referência" AAAA-MM).
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const { DIRS, HttpError, str, isEmail, newId, ID_RE, readJson, writeJson } = require('../lib/common');

const STATUS = ['ativo', 'pausado', 'cancelado'];
const FORMAS = ['PIX', 'Transferência', 'Boleto', 'Cartão', 'Dinheiro', 'Outro'];
const AVISO_DIAS = 5; // "vence em breve" com esta antecedência
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

const fileOf = (id) => {
  if (!ID_RE.test(id)) throw new HttpError(404, 'Cliente não encontrado.');
  return path.join(DIRS.clientes, `${id}.json`);
};

// "49" / "49,90" / "R$ 1.490,00" -> 49 / 49.9 / 1490; inválido -> null
function valor(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  const s = String(v || '').replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// ---------- datas (sempre no fuso de Brasília) ----------
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const diasNoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
function vencimentoDe(ref, dia) {
  const [a, m] = ref.split('-').map(Number);
  return `${ref}-${String(Math.min(dia, diasNoMes(a, m))).padStart(2, '0')}`;
}
function proximoMes(ref) {
  let [a, m] = ref.split('-').map(Number);
  m += 1; if (m > 12) { m = 1; a += 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
}
const diasEntre = (de, ate) => Math.round((Date.parse(ate) - Date.parse(de)) / 86400000);

// Situação de um cliente a partir dos pagamentos registados.
function situacao(c, dataHoje = hoje()) {
  const base = { situacao: c.status, emAberto: [], atrasados: 0, proximo: null };
  if (c.status !== 'ativo' || !DATA_RE.test(c.primeiroVencimento || '')) return base;
  const dia = Number(c.primeiroVencimento.slice(8, 10));
  const pagos = new Set((c.pagamentos || []).map((p) => p.referencia));
  const emAberto = [];
  let proximo = null;
  let ref = c.primeiroVencimento.slice(0, 7);
  // até 10 anos para trás e 2 anos à frente, chega e garante que o ciclo acaba
  for (let i = 0; i < 144; i++, ref = proximoMes(ref)) {
    const venc = vencimentoDe(ref, dia);
    if (venc > dataHoje) {
      if (!proximo && !pagos.has(ref)) proximo = { referencia: ref, vencimento: venc };
      if (proximo || i > 120) break;
      continue;
    }
    if (!pagos.has(ref)) emAberto.push({ referencia: ref, vencimento: venc, atrasado: venc < dataHoje });
  }
  const atrasados = emAberto.filter((x) => x.atrasado).length;
  const venceHoje = emAberto.some((x) => !x.atrasado);
  let s = 'em_dia';
  if (atrasados) s = 'atraso';
  else if (venceHoje || (proximo && diasEntre(dataHoje, proximo.vencimento) <= AVISO_DIAS)) s = 'vence';
  return { situacao: s, emAberto, atrasados, proximo };
}

// ---------- estado do site (em memória; verificado de 30 em 30 min) ----------
const sites = new Map(); // id -> { em, ok, status, erro }

async function verificarSite(host) {
  const em = new Date().toISOString();
  if (!HOST_RE.test(host || '')) return { em, ok: false, erro: 'Endereço inválido.' };
  try {
    const res = await fetch(`https://${host}/`, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'LynxCoder-painel/1 (verificacao)' } });
    await res.body?.cancel().catch(() => {});
    return { em, ok: res.ok, status: res.status, erro: res.ok ? null : `Respondeu ${res.status}.` };
  } catch (err) {
    const code = (err.cause && err.cause.code) || err.code || err.name;
    let erro = 'Não foi possível abrir a página.';
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/i.test(code || '')) erro = 'Certificado HTTPS inválido.';
    else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') erro = 'O endereço não existe no DNS.';
    else if (code === 'ECONNREFUSED') erro = 'O servidor recusou a ligação.';
    else if (code === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT') erro = 'Não respondeu em 8 segundos.';
    return { em, ok: false, erro };
  }
}

// ---------- dados ----------
async function all() {
  const files = (await fsp.readdir(DIRS.clientes).catch(() => [])).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) { const c = await readJson(path.join(DIRS.clientes, f)); if (c) out.push(c); }
  return out;
}
const save = (c) => writeJson(fileOf(c.id), c);

function comSituacao(c) {
  return { ...c, ...situacao(c), site: sites.get(c.id) || null };
}

// Item da lista do painel (mesmo formato de pedidos, mensagens e propostas).
function resumo(c) {
  const s = situacao(c);
  const fmt = (d) => d.split('-').reverse().join('/');
  const partes = [];
  if (s.situacao === 'atraso') partes.push(`${s.atrasados} ${s.atrasados === 1 ? 'mensalidade' : 'mensalidades'} em atraso`);
  else if (s.situacao === 'vence') partes.push(`Vence ${fmt((s.emAberto[0] || s.proximo).vencimento)}`);
  const site = sites.get(c.id);
  if (site && !site.ok && c.status === 'ativo') partes.push(`site com problema: ${site.erro}`);
  const aviso = partes.join(' · ');
  const detalhe = aviso ? aviso.charAt(0).toUpperCase() + aviso.slice(1) : c.endereco || '';
  return {
    tipo: 'cliente', id: c.id, recebidoEm: c.criadoEm, status: s.situacao, teste: !!c.teste,
    titulo: c.nome,
    subtitulo: `${c.plano === 'profissional' ? 'Profissional' : 'Essencial'} · ${c.mensalidade != null ? c.mensalidade.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/mês' : 'mensalidade a definir'}`,
    detalhe,
  };
}

// Valida a ficha vinda do painel (criação e edição).
function limparFicha(b, atual = {}) {
  const out = {
    nome: str(b.nome, 120),
    contato: str(b.contato, 120),
    whatsapp: str(b.whatsapp, 20).replace(/\D/g, '').slice(-13),
    email: str(b.email, 160).toLowerCase(),
    plano: b.plano === 'profissional' ? 'profissional' : 'essencial',
    endereco: str(b.endereco, 120).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    mensalidade: valor(b.mensalidade),
    clienteDesde: str(b.clienteDesde, 10),
    primeiroVencimento: str(b.primeiroVencimento, 10),
    status: STATUS.includes(b.status) ? b.status : (atual.status || 'ativo'),
  };
  if (out.nome.length < 2) throw new HttpError(400, 'Informe o nome do cliente.');
  if (out.email && !isEmail(out.email)) throw new HttpError(400, 'E-mail inválido.');
  if (out.endereco && !HOST_RE.test(out.endereco)) throw new HttpError(400, 'Endereço inválido: use só o domínio, ex.: quentinhas.lynxsites.com.br');
  if (!DATA_RE.test(out.clienteDesde)) throw new HttpError(400, 'Informe a data de início.');
  if (!DATA_RE.test(out.primeiroVencimento)) throw new HttpError(400, 'Informe a data do primeiro vencimento.');
  return out;
}

// Ficha sugerida a partir de um pedido (e da proposta dele): o painel mostra-a
// num formulário para conferir antes de criar.
async function sugestaoDoPedido(pedidoId) {
  if (!ID_RE.test(pedidoId || '')) throw new HttpError(404, 'Pedido não encontrado.');
  const d = await readJson(path.join(DIRS.pedidos, pedidoId, 'dados.json'));
  if (!d) throw new HttpError(404, 'Pedido não encontrado.');
  const p = d.propostaId && ID_RE.test(d.propostaId) ? await readJson(path.join(DIRS.propostas, `${d.propostaId}.json`)) : null;
  const plano = d.plano.tipo;
  const v = (p && p.valores) || {};
  const inicio = hoje();
  const [a, m, dia] = inicio.split('-').map(Number);
  const ref = proximoMes(`${a}-${String(m).padStart(2, '0')}`);
  return {
    nome: d.negocio.nome,
    contato: p ? p.cliente.nome : '',
    whatsapp: d.negocio.whatsapp,
    email: d.negocio.email,
    plano,
    endereco: plano === 'essencial' ? `${d.plano.subdominio}.lynxsites.com.br` : d.plano.dominio,
    mensalidade: valor(v[`${plano}_mensalidade`]),
    clienteDesde: inicio,
    primeiroVencimento: vencimentoDe(ref, dia),
    pedidoId, propostaId: d.propostaId || null, teste: !!d.teste,
  };
}

async function clienteDoPedido(pedidoId) {
  return (await all()).find((c) => c.pedidoId === pedidoId) || null;
}

// ---------- rotas do painel (registadas dentro de routes/admin.js) ----------
async function adminRoutes(app) {
  app.get('/adm/clientes/sugestao/:pedidoId', async (req) => ({ ok: true, ficha: await sugestaoDoPedido(req.params.pedidoId) }));

  app.post('/adm/clientes', async (req) => {
    const b = req.body || {};
    const ficha = limparFicha(b);
    let origem = {};
    if (b.pedidoId) {
      if (await clienteDoPedido(b.pedidoId)) throw new HttpError(400, 'Este pedido já tem uma ficha de cliente.');
      const s = await sugestaoDoPedido(b.pedidoId);
      origem = { pedidoId: s.pedidoId, propostaId: s.propostaId, ...(s.teste ? { teste: true } : {}) };
    }
    const c = { id: newId(), criadoEm: new Date().toISOString(), ...ficha, ...origem, notas: '', pagamentos: [] };
    await save(c);
    req.log.info({ id: c.id }, 'cliente criado no painel');
    if (c.status === 'ativo' && c.endereco) verificarSite(c.endereco).then((r) => sites.set(c.id, r));
    return { ok: true, id: c.id };
  });

  app.get('/adm/clientes/:id', async (req) => {
    const c = await readJson(fileOf(req.params.id));
    if (!c) throw new HttpError(404, 'Cliente não encontrado.');
    return { ok: true, cliente: comSituacao(c), formas: FORMAS };
  });

  // Edição da ficha, mudança de situação (ativo/pausado/cancelado) ou notas.
  app.patch('/adm/clientes/:id', async (req) => {
    const c = await readJson(fileOf(req.params.id));
    if (!c) throw new HttpError(404, 'Cliente não encontrado.');
    const b = req.body || {};
    if (b.ficha) Object.assign(c, limparFicha(b.ficha, c));
    if (b.status !== undefined) {
      if (!STATUS.includes(b.status)) throw new HttpError(400, 'Situação inválida.');
      c.status = b.status;
    }
    if (b.notas !== undefined) c.notas = str(b.notas, 5000);
    c.atualizadoEm = new Date().toISOString();
    await save(c);
    return { ok: true, cliente: comSituacao(c), admin: { notas: c.notas, atualizadoEm: c.atualizadoEm } };
  });

  app.post('/adm/clientes/:id/pagamentos', async (req) => {
    const c = await readJson(fileOf(req.params.id));
    if (!c) throw new HttpError(404, 'Cliente não encontrado.');
    const b = req.body || {};
    const pg = {
      id: newId(),
      referencia: str(b.referencia, 7),
      valor: valor(b.valor),
      pagoEm: str(b.pagoEm, 10),
      forma: FORMAS.includes(b.forma) ? b.forma : 'Outro',
      nota: str(b.nota, 300),
      registadoEm: new Date().toISOString(),
    };
    if (!MES_RE.test(pg.referencia)) throw new HttpError(400, 'Escolha o mês a que o pagamento se refere.');
    if (pg.valor == null) throw new HttpError(400, 'Valor inválido.');
    if (!DATA_RE.test(pg.pagoEm)) throw new HttpError(400, 'Informe a data do pagamento.');
    c.pagamentos = c.pagamentos || [];
    if (c.pagamentos.some((p) => p.referencia === pg.referencia)) throw new HttpError(400, 'Esse mês já tem um pagamento registado.');
    c.pagamentos.push(pg);
    c.pagamentos.sort((x, y) => x.referencia.localeCompare(y.referencia));
    await save(c);
    return { ok: true, cliente: comSituacao(c) };
  });

  app.delete('/adm/clientes/:id/pagamentos/:pid', async (req) => {
    const c = await readJson(fileOf(req.params.id));
    if (!c) throw new HttpError(404, 'Cliente não encontrado.');
    c.pagamentos = (c.pagamentos || []).filter((p) => p.id !== req.params.pid);
    await save(c);
    return { ok: true, cliente: comSituacao(c) };
  });

  app.post('/adm/clientes/:id/verificar-site', async (req) => {
    const c = await readJson(fileOf(req.params.id));
    if (!c) throw new HttpError(404, 'Cliente não encontrado.');
    if (!c.endereco) throw new HttpError(400, 'Este cliente ainda não tem endereço.');
    const r = await verificarSite(c.endereco);
    sites.set(c.id, r);
    return { ok: true, site: r };
  });

  app.delete('/adm/clientes/:id', async (req) => {
    await fsp.rm(fileOf(req.params.id), { force: true });
    sites.delete(req.params.id);
    req.log.info({ id: req.params.id }, 'cliente excluído no painel');
    return { ok: true };
  });
}

// Verifica os sites dos clientes ativos ao arrancar e de 30 em 30 minutos.
async function verificarTodos() {
  for (const c of await all()) {
    if (c.status === 'ativo' && c.endereco && !c.teste) sites.set(c.id, await verificarSite(c.endereco));
  }
}
setTimeout(() => { verificarTodos().catch(() => {}); }, 20 * 1000).unref();
setInterval(() => { verificarTodos().catch(() => {}); }, 30 * 60 * 1000).unref();

module.exports = { adminRoutes, all, resumo, clienteDoPedido, situacao, valor };
