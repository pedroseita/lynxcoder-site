// Bandeira de manutenção: um ficheiro no volume partilhado com o nginx do site.
// Com o ficheiro presente, o nginx devolve a página de manutenção (503) e a API
// recusa os formulários públicos; o painel continua a funcionar.
// O painel nunca controla o Docker: só cria ou apaga este ficheiro.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const FLAGS_DIR = process.env.FLAGS_DIR || '/flags';
const FILE = path.join(FLAGS_DIR, 'manutencao');

function manutencaoAtiva() {
  return fs.existsSync(FILE);
}

async function estado() {
  try {
    const info = JSON.parse(await fsp.readFile(FILE, 'utf8'));
    return { ativo: true, desde: info.desde || null };
  } catch (err) {
    if (err.code === 'ENOENT') return { ativo: false, desde: null };
    return { ativo: manutencaoAtiva(), desde: null };
  }
}

async function definir(ativo) {
  if (ativo) {
    await fsp.writeFile(FILE, JSON.stringify({ desde: new Date().toISOString() }), { mode: 0o644 });
  } else {
    await fsp.rm(FILE, { force: true });
  }
  return estado();
}

// No arranque: avisa nos logs se o volume não deixa escrever (ex.: criado
// por outro container com dono root), em vez de falhar só quando o botão é usado.
async function verificarEscrita(log) {
  const teste = path.join(FLAGS_DIR, '.teste-escrita');
  try {
    await fsp.mkdir(FLAGS_DIR, { recursive: true });
    await fsp.writeFile(teste, '');
    await fsp.rm(teste, { force: true });
  } catch (err) {
    log.error({ err: err.message, dir: FLAGS_DIR }, 'sem permissão para escrever a bandeira de manutenção');
  }
}

module.exports = { manutencaoAtiva, estado, definir, verificarEscrita };
