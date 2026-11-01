// Catálogo da compra direta em lynxsites.com.br/criar: profissões, tipos de
// página, extras e preços. Editado no painel (Configurações › Catálogo) e
// guardado em /data/config/catalogo.json; sem ficheiro, vale o PADRAO.
// Os preços cobrados vêm SEMPRE daqui, nunca do browser.
'use strict';

const path = require('node:path');
const { DIRS, HttpError, readJson, writeJson } = require('./common');

const FILE = path.join(DIRS.config, 'catalogo.json');

const PADRAO = {
  profissoes: [
    { id: 'eletricista', nome: 'Eletricista', ativa: true, tipos: ['apresentacao', 'orcamento'], extras: ['edicao', 'qr', 'logo', 'textos', 'google', 'avaliacoes', 'dominio'] },
    { id: 'manicure', nome: 'Manicure', ativa: true, tipos: ['apresentacao', 'horario', 'agenda'], extras: ['edicao', 'qr', 'logo', 'avaliacoes', 'dominio'] },
    { id: 'hidraulica', nome: 'Encanador', ativa: true, tipos: ['apresentacao', 'orcamento'], extras: ['edicao', 'qr', 'logo', 'textos', 'google', 'avaliacoes', 'dominio'] },
    { id: 'quentinhas', nome: 'Quentinhas', ativa: true, tipos: ['apresentacao', 'cardapio'], extras: ['edicao', 'qr', 'logo', 'textos', 'google', 'avaliacoes', 'dominio'] },
    { id: 'churrasco', nome: 'Churrasqueiro', ativa: true, tipos: ['apresentacao', 'orcamento'], extras: ['edicao', 'qr', 'logo', 'textos', 'google', 'avaliacoes', 'dominio'] },
  ],
  tipos: {
    apresentacao: { nome: 'Página de apresentação', descricao: 'Serviços, fotos, avaliações e botão de WhatsApp.', implantacao: 147, mensal: 19.90 },
    orcamento: { nome: 'Com pedido de orçamento', descricao: 'O cliente descreve o problema e manda tudo organizado no WhatsApp.', implantacao: 197, mensal: 24.90 },
    horario: { nome: 'Com pedido de horário', descricao: 'O cliente escolhe serviço, dia e período.', implantacao: 197, mensal: 24.90 },
    agenda: { nome: 'Com agenda online', descricao: 'Horários livres em tempo real, que o prestador bloqueia no painel.', implantacao: 197, mensal: 44.90 },
    cardapio: { nome: 'Com cardápio e pedido', descricao: 'Cardápio do dia com carrinho e entrega.', implantacao: 197, mensal: 24.90 },
    calculo: { nome: 'Com orçamento automático', descricao: 'O cliente informa medidas e vê o valor na hora.', implantacao: 247, mensal: 29.90 },
  },
  extras: {
    edicao: { nome: 'Editar preços e fotos sozinho', unico: 0, mensal: 10, ativo: true },
    qr: { nome: 'Cartão digital e QR Code', unico: 29, mensal: 0, ativo: true },
    logo: { nome: 'Logotipo simples', unico: 97, mensal: 0, ativo: true },
    textos: { nome: 'Textos escritos por nós', unico: 49, mensal: 0, ativo: true },
    google: { nome: 'Perfil da empresa no Google', unico: 79, mensal: 0, ativo: true },
    avaliacoes: { nome: 'Avaliações do Google na página', unico: 0, mensal: 9.90, ativo: true },
    dominio: { nome: 'Domínio próprio', unico: 50, mensal: 10, ativo: true },
  },
  plano_anual: { ativo: true, meses_pagos: 10 },
  emite_nota_fiscal: false,
  // Desligado: o /criar percorre os 6 passos mas o pagamento mostra "em breve".
  pagamentos_ativos: false,
};

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const valor = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
};

// Valida o catálogo vindo do painel; erros com a localização exata, para o
// editor de JSON mostrar onde corrigir.
function validar(c) {
  const fail = (msg) => { throw new HttpError(400, msg); };
  if (!c || typeof c !== 'object' || Array.isArray(c)) fail('O catálogo tem de ser um objeto JSON.');
  const out = { profissoes: [], tipos: {}, extras: {}, plano_anual: { ativo: false, meses_pagos: 12 }, emite_nota_fiscal: c.emite_nota_fiscal === true, pagamentos_ativos: c.pagamentos_ativos === true };

  for (const [id, t] of Object.entries(c.tipos || {})) {
    if (!ID.test(id)) fail(`tipos: id inválido "${id}" (minúsculas, números, - e _).`);
    const nome = texto(t && t.nome, 60);
    const implantacao = valor(t && t.implantacao);
    const mensal = valor(t && t.mensal);
    if (!nome) fail(`tipos.${id}: falta o nome.`);
    if (implantacao == null || mensal == null) fail(`tipos.${id}: implantacao e mensal têm de ser números (ex.: 147 ou 19.90).`);
    out.tipos[id] = { nome, descricao: texto(t.descricao, 160), implantacao, mensal };
  }
  for (const [id, e] of Object.entries(c.extras || {})) {
    if (!ID.test(id)) fail(`extras: id inválido "${id}".`);
    const nome = texto(e && e.nome, 60);
    const unico = valor(e && e.unico);
    const mensal = valor(e && e.mensal);
    if (!nome) fail(`extras.${id}: falta o nome.`);
    if (unico == null || mensal == null) fail(`extras.${id}: unico e mensal têm de ser números.`);
    out.extras[id] = { nome, unico, mensal, ativo: e.ativo !== false };
  }
  const vistos = new Set();
  for (const [i, p] of (Array.isArray(c.profissoes) ? c.profissoes : []).entries()) {
    const id = p && p.id;
    if (!ID.test(id || '')) fail(`profissoes[${i}]: id inválido.`);
    if (vistos.has(id)) fail(`profissoes: "${id}" repetida.`);
    vistos.add(id);
    const nome = texto(p.nome, 60);
    if (!nome) fail(`profissoes[${i}] (${id}): falta o nome.`);
    const tipos = Array.isArray(p.tipos) ? p.tipos : [];
    const extras = Array.isArray(p.extras) ? p.extras : [];
    for (const t of tipos) if (!out.tipos[t]) fail(`profissoes "${id}": o tipo "${t}" não existe em tipos.`);
    for (const e of extras) if (!out.extras[e]) fail(`profissoes "${id}": o extra "${e}" não existe em extras.`);
    out.profissoes.push({ id, nome, ativa: p.ativa !== false, tipos: [...new Set(tipos)], extras: [...new Set(extras)] });
  }
  const pa = c.plano_anual || {};
  const meses = Number(pa.meses_pagos);
  if (pa.ativo === true && !(Number.isInteger(meses) && meses >= 1 && meses <= 12)) fail('plano_anual.meses_pagos tem de ser um número inteiro de 1 a 12.');
  out.plano_anual = { ativo: pa.ativo === true, meses_pagos: Number.isInteger(meses) && meses >= 1 && meses <= 12 ? meses : 12 };
  return out;
}

async function load() {
  const salvo = await readJson(FILE);
  if (!salvo) return PADRAO;
  try { return validar(salvo); } catch { return PADRAO; }
}

async function save(input) {
  const c = validar(input);
  await writeJson(FILE, c);
  return c;
}

async function restaurar() {
  await writeJson(FILE, PADRAO);
  return PADRAO;
}

// O que o formulário público vê: só profissões ativas com pelo menos um tipo,
// só extras ativos que a profissão inclui.
function publico(c) {
  const tiposUsados = new Set();
  const extrasUsados = new Set();
  const profissoes = c.profissoes
    .filter((p) => p.ativa && p.tipos.length)
    .map((p) => {
      const extras = p.extras.filter((e) => c.extras[e] && c.extras[e].ativo);
      p.tipos.forEach((t) => tiposUsados.add(t));
      extras.forEach((e) => extrasUsados.add(e));
      return { id: p.id, nome: p.nome, tipos: p.tipos, extras };
    });
  const pick = (obj, ids) => Object.fromEntries([...ids].map((id) => [id, obj[id]]));
  const extras = Object.fromEntries(Object.entries(pick(c.extras, extrasUsados)).map(([id, e]) => [id, { nome: e.nome, unico: e.unico, mensal: e.mensal }]));
  return {
    profissoes,
    tipos: pick(c.tipos, tiposUsados),
    extras,
    plano_anual: c.plano_anual,
    emite_nota_fiscal: c.emite_nota_fiscal,
    pagamentos_ativos: c.pagamentos_ativos === true,
  };
}

// Valores em centavos, para somar sem erros de vírgula flutuante.
const cents = (v) => Math.round(Number(v || 0) * 100);

// Total de uma compra, só a partir do catálogo do servidor.
function calcular(c, { prof, tipo, extras, plano }) {
  const p = c.profissoes.find((x) => x.id === prof && x.ativa);
  if (!p || !p.tipos.includes(tipo) || !c.tipos[tipo]) throw new HttpError(400, 'Essa profissão ou tipo de página já não está disponível. Atualize a página.');
  const lista = [...new Set(extras || [])];
  for (const e of lista) {
    if (!p.extras.includes(e) || !c.extras[e] || !c.extras[e].ativo) throw new HttpError(400, 'Um dos extras escolhidos já não está disponível. Atualize a página.');
  }
  const anual = plano === 'anual';
  if (anual && !c.plano_anual.ativo) throw new HttpError(400, 'O plano anual não está disponível.');
  const t = c.tipos[tipo];
  const mensalCents = cents(t.mensal) + lista.reduce((s, e) => s + cents(c.extras[e].mensal), 0);
  const unicosCents = lista.reduce((s, e) => s + cents(c.extras[e].unico), 0);
  const recorrenteCents = anual ? mensalCents * c.plano_anual.meses_pagos : mensalCents;
  const linhas = [
    { descricao: `Criação da página (${t.nome})`, valor: cents(t.implantacao) / 100 },
    ...lista.filter((e) => cents(c.extras[e].unico) > 0).map((e) => ({ descricao: c.extras[e].nome, valor: c.extras[e].unico })),
    { descricao: anual ? `Plano anual (${c.plano_anual.meses_pagos} meses pagos, 12 de uso)` : 'Primeira mensalidade', valor: recorrenteCents / 100 },
  ];
  return {
    plano: anual ? 'anual' : 'mensal',
    linhas,
    mensal: mensalCents / 100,
    total: (cents(t.implantacao) + unicosCents + recorrenteCents) / 100,
  };
}

module.exports = { PADRAO, load, save, restaurar, publico, calcular, validar };
