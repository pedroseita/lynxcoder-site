// Dados da empresa (Configurações › Empresa), num só sítio: aparecem nas
// propostas, no rodapé do lynxsites.com.br/criar (identificação de quem vende,
// Decreto 7.962/2013) e no painel do cliente. Guardados em
// /data/config/empresa.json. Sem ficheiro, começa com o que já existia: o
// contato dos "Valores da proposta" e as variáveis VENDEDOR_* do ambiente.
'use strict';

const path = require('node:path');
const { DIRS, HttpError, str, isEmail, readJson, writeJson } = require('./common');

const FILE = path.join(DIRS.config, 'empresa.json');

// [chave, rótulo, máximo, dica]
const CAMPOS = [
  ['nome', 'Nome ou razão social', 120, 'Aparece no rodapé da compra e nas propostas.'],
  ['documento', 'CPF ou CNPJ', 20, 'Obrigatório por lei em vendas online (rodapé do /criar).'],
  ['endereco', 'Endereço', 200, 'Cidade e estado chegam; o endereço completo é o recomendado em vendas online.'],
  ['whatsapp', 'WhatsApp', 20, 'Com DDD. Usado nas propostas e no botão "Tenho dúvidas".'],
  ['email', 'E-mail de contato', 160, ''],
  ['horario_inicio', 'Atendimento: das', 10, 'Ex.: 8h'],
  ['horario_fim', 'Atendimento: até', 10, 'Ex.: 18h'],
];

async function load() {
  const salvo = await readJson(FILE);
  if (salvo) return { ...Object.fromEntries(CAMPOS.map(([k]) => [k, ''])), ...salvo };
  const antigo = (await readJson(path.join(DIRS.config, 'proposta.json'))) || {};
  return {
    nome: process.env.VENDEDOR_NOME || 'LynxCoder',
    documento: process.env.VENDEDOR_DOCUMENTO || '',
    endereco: process.env.VENDEDOR_ENDERECO || '',
    whatsapp: (process.env.VENDEDOR_WHATSAPP || antigo.whatsapp || '').replace(/\D/g, ''),
    email: antigo.email || 'devlynxcoder@gmail.com',
    horario_inicio: antigo.horario_inicio || '',
    horario_fim: antigo.horario_fim || '',
  };
}

async function save(input) {
  const out = {};
  for (const [k, , max] of CAMPOS) out[k] = str((input || {})[k], max);
  out.whatsapp = out.whatsapp.replace(/\D/g, '');
  out.documento = out.documento.replace(/[^\d./-]/g, '');
  if (out.email && !isEmail(out.email)) throw new HttpError(400, 'E-mail inválido.');
  if (out.whatsapp && !/^\d{10,13}$/.test(out.whatsapp)) throw new HttpError(400, 'WhatsApp inválido: use o DDD e o número.');
  if (out.nome.length < 2) throw new HttpError(400, 'Informe o nome da empresa.');
  await writeJson(FILE, out);
  return out;
}

module.exports = { CAMPOS, load, save };
