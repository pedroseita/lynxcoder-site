// Proposta enviada ao cliente: cabeçalho fixo (cliente, data, mensagem) +
// corpo no formato simples de lib/markdown.js, editável no painel.
// Cada proposta guarda a sua cópia do texto (p.texto); propostas antigas, sem
// cópia, usam o texto padrão. Todos os valores são escapados.
'use strict';

const { dinheiro, CAMPOS } = require('./config');
const { render: md, esc } = require('./markdown');
const { PADRAO } = require('./proposta-texto');

const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' });
const TBD = '<span class="tbd">a combinar</span>';

// Valores disponíveis como {{campo}} no texto.
function campos(p, val) {
  const out = {};
  for (const [, chave, , tipo] of CAMPOS) {
    const v = String(val[chave] || '').trim();
    out[chave] = !v ? TBD : esc(tipo === 'dinheiro' ? dinheiro(v) : v);
  }
  out.contato = ['lynxcoder.com.br', val.whatsapp ? `WhatsApp ${esc(val.whatsapp)}` : '', val.email ? esc(val.email) : '']
    .filter(Boolean).join(' · ');
  out.validade = esc(dataBR(p.expiraEm));
  out.cliente = esc(p.cliente.nome);
  out.negocio = esc(p.cliente.negocio || '');
  return out;
}

const AJUDA_CAMPOS = [
  ...CAMPOS.map(([, chave, rotulo]) => [chave, rotulo]),
  ['contato', 'Linha de contato (site, WhatsApp e e-mail)'],
  ['validade', 'Data de validade da proposta'],
  ['cliente', 'Nome do cliente'],
  ['negocio', 'Nome do negócio'],
];

function render(p, val) {
  return `
${p.teste ? '<p class="pp-test">Proposta de teste: não tem validade comercial.</p>' : ''}
<header class="pp-head">
  <p class="pp-kicker">Proposta</p>
  <h1>Página Profissional LynxCoder</h1>
  <p class="pp-meta">Para <strong>${esc(p.cliente.nome)}</strong>${p.cliente.negocio ? ` · ${esc(p.cliente.negocio)}` : ''}<br>
  ${esc(dataBR(p.criadoEm))} · Pedro Seita, LynxCoder</p>
  ${p.mensagem ? `<p class="pp-note">${esc(p.mensagem).replace(/\n/g, '<br>')}</p>` : ''}
</header>
${md(p.texto || PADRAO, campos(p, val))}`;
}

module.exports = { render, AJUDA_CAMPOS };
