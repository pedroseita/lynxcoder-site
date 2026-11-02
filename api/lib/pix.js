// Chave PIX da LynxCoder (Configurações › Pagamentos), usada na compra direta
// (/criar) e nas mensalidades do painel do cliente. Guardada em
// /data/config/pagamentos.json; sem ficheiro, valem as variáveis PIX_*.
// A chave PIX não é secreta (vai dentro de cada QR Code), por isso pode
// ficar nos dados em vez do ficheiro de ambiente.
'use strict';

const path = require('node:path');
const { DIRS, HttpError, str, readJson, writeJson } = require('./common');

const FILE = path.join(DIRS.config, 'pagamentos.json');

async function load() {
  const salvo = await readJson(FILE);
  return {
    chave: (salvo ? salvo.chave : process.env.PIX_CHAVE) || '',
    nome: (salvo ? salvo.nome : process.env.PIX_NOME) || 'LynxCoder',
    cidade: (salvo ? salvo.cidade : process.env.PIX_CIDADE) || 'Brasil',
  };
}

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

async function save(input) {
  const b = input || {};
  const out = {
    chave: str(b.chave, 77).replace(/\s+/g, ''),
    nome: semAcento(str(b.nome, 25)),
    cidade: semAcento(str(b.cidade, 15)),
  };
  if (out.chave && !/^([^\s@]+@[^\s@]+\.[^\s@]+|\+?\d{10,14}|\d{11}|\d{14}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(out.chave)) {
    throw new HttpError(400, 'Chave PIX inválida: use e-mail, telefone (+55…), CPF, CNPJ ou chave aleatória.');
  }
  if (!out.nome) out.nome = 'LynxCoder';
  if (!out.cidade) out.cidade = 'Brasil';
  await writeJson(FILE, out);
  return out;
}

module.exports = { load, save };
