// Valores da proposta, editados no painel em Configurações › Propostas ›
// Preços e prazos e guardados em /data/config/proposta.json.
// Cada proposta nova copia estes valores; os preços dos planos podem ser
// ajustados por cliente.
//
// Não são guardados aqui (vêm de outro sítio, para haver um só valor):
// - preços dos extras: do catálogo da compra direta (lib/catalogo.js);
// - contato e horário: dos dados da empresa (lib/empresa.js).
'use strict';

const path = require('node:path');
const { DIRS, readJson, writeJson, str } = require('./common');

const FILE = path.join(DIRS.config, 'proposta.json');

// [grupo, chave, rótulo, tipo]   tipo: dinheiro | numero | texto
const CAMPOS = [
  ['Planos', 'essencial_implantacao', 'Essencial: taxa de implantação', 'dinheiro'],
  ['Planos', 'essencial_mensalidade', 'Essencial: mensalidade', 'dinheiro'],
  ['Planos', 'profissional_implantacao', 'Profissional: taxa de implantação', 'dinheiro'],
  ['Planos', 'profissional_mensalidade', 'Profissional: mensalidade', 'dinheiro'],
  ['Planos', 'alteracoes_mes', 'Alterações de conteúdo por mês (incluídas)', 'numero'],
  ['Planos', 'prazo_publicacao', 'Prazo de publicação (dias úteis)', 'numero'],
  ['Planos', 'prazo_previa', 'Prazo para a prévia (dias úteis)', 'numero'],
  ['Extras', 'extra_logo', 'Criação de logotipo', 'dinheiro'],
  ['Extras', 'extra_textos', 'Textos profissionais', 'dinheiro'],
  ['Extras', 'extra_cartao', 'Cartão de visita digital e QR Code', 'dinheiro'],
  ['Extras', 'extra_antes_depois', 'Galeria antes e depois', 'dinheiro'],
  ['Extras', 'extra_video', 'Vídeo de apresentação', 'dinheiro'],
  ['Extras', 'extra_perfil_google', 'Perfil da Empresa no Google', 'dinheiro'],
  ['Extras', 'extra_avaliacoes_google', 'Avaliações do Google na página', 'dinheiro'],
  ['Extras', 'extra_avaliacao_servicos', 'Avaliação dos serviços (por mês)', 'dinheiro'],
  ['Extras', 'extra_feed_instagram', 'Feed do Instagram (por mês)', 'dinheiro'],
  ['Extras', 'extra_email', 'E-mail profissional', 'dinheiro'],
  ['Manutenção', 'plus_alteracoes', 'Plus: alterações por mês', 'numero'],
  ['Manutenção', 'plus_valor', 'Plus: valor adicional por mês', 'dinheiro'],
  ['Manutenção', 'premium_valor', 'Premium: valor adicional por mês', 'dinheiro'],
  ['Manutenção', 'hora_valor', 'Valor da hora (alterações sem mensalidade)', 'dinheiro'],
  ['Termos', 'atraso_dias', 'Dias de atraso até a suspensão', 'numero'],
  ['Termos', 'aviso_cancelamento', 'Aviso prévio de cancelamento (dias)', 'numero'],
  ['Termos', 'validade_dias', 'Validade da proposta (dias)', 'numero'],
  ['Contato', 'horario_inicio', 'Atendimento: das (ex.: 9h)', 'texto'],
  ['Contato', 'horario_fim', 'Atendimento: até (ex.: 18h)', 'texto'],
  ['Contato', 'whatsapp', 'WhatsApp da LynxCoder', 'texto'],
  ['Contato', 'email', 'E-mail da LynxCoder', 'texto'],
];
// Grupos que vêm de outro sítio e não se editam nesta página.
const DE_FORA = new Set(['Extras', 'Contato']);
const CHAVES = new Set(CAMPOS.filter((c) => !DE_FORA.has(c[0])).map((c) => c[1]));
const PADRAO = { validade_dias: '15' };

// Preço de um extra do catálogo como texto da proposta ("" = a combinar).
function precoExtra(e) {
  if (!e) return '';
  if (e.mensal > 0 && !(e.unico > 0)) return String(e.mensal);
  return e.unico > 0 ? String(e.unico) : '';
}

async function load() {
  const proprios = Object.fromEntries(Object.entries(await readJson(FILE, {})).filter(([k]) => CHAVES.has(k)));
  const cat = await require('./catalogo').load();
  const emp = await require('./empresa').load();
  const extras = Object.fromEntries(Object.entries(require('./catalogo').EXTRAS_PROPOSTA).map(([k, id]) => [k, precoExtra(cat.extras[id])]));
  return {
    ...PADRAO, ...proprios, ...extras,
    whatsapp: emp.whatsapp, email: emp.email, horario_inicio: emp.horario_inicio, horario_fim: emp.horario_fim,
  };
}

async function save(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (CHAVES.has(k)) out[k] = str(v, 120);
  }
  await writeJson(FILE, out);
  return load();
}

// "490" / "490,5" / "1.490,00" -> "R$ 490,00"; texto livre (ex.: "sob consulta") fica como está.
function dinheiro(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const n = Number(s.replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = { CAMPOS, DE_FORA, load, save, dinheiro };
