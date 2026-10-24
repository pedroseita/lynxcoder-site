// Utilidades partilhadas pelas rotas da API.
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR || '/data';
const DIRS = {
  pedidos: path.join(DATA_DIR, 'pedidos'),
  mensagens: path.join(DATA_DIR, 'mensagens'),
  tmp: path.join(DATA_DIR, 'tmp'),
  admin: path.join(DATA_DIR, 'admin'),
  propostas: path.join(DATA_DIR, 'propostas'),
  config: path.join(DATA_DIR, 'config'),
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

// AAAAMMDD-HHMM-xxxxxx (UTC): ordena por data e não colide na prática.
function newId() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}
const ID_RE = /^\d{8}-\d{4}-[0-9a-f]{6}$/;

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}

// Escreve num ficheiro temporário e renomeia: nunca deixa um JSON a meio.
async function writeJson(file, data, mode) {
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), mode ? { mode } : undefined);
  await fsp.rename(tmp, file);
}

// Limite por chave (IP) numa janela: `tries` conta tudo, `oks` só os aceites.
function createLimiter({ windowMs, maxTries, maxOk = Infinity }) {
  const tries = new Map();
  const oks = new Map();
  const recent = (map, key) => (map.get(key) || []).filter((t) => Date.now() - t < windowMs);
  setInterval(() => {
    for (const map of [tries, oks]) for (const key of map.keys()) if (!recent(map, key).length) map.delete(key);
  }, 10 * 60 * 1000).unref();
  return {
    blocked(key) {
      return recent(tries, key).length >= maxTries || recent(oks, key).length >= maxOk;
    },
    hit(key) { const t = recent(tries, key); t.push(Date.now()); tries.set(key, t); },
    ok(key) { const o = recent(oks, key); o.push(Date.now()); oks.set(key, o); },
    reset(key) { tries.delete(key); },
  };
}

module.exports = { DATA_DIR, DIRS, HttpError, str, isEmail, newId, ID_RE, readJson, writeJson, createLimiter };
