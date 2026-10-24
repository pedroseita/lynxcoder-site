// Opções do formulário /comecar editáveis no painel: extras (etapa 2) e
// paletas de cores (etapa 3). Guardadas em /data/config/formulario.json.
'use strict';

const path = require('node:path');
const { DIRS, readJson, writeJson, str } = require('./common');

const FILE = path.join(DIRS.config, 'formulario.json');

const PADRAO = {
  extras: [
    { id: 'manutencao', label: 'Manutenção' },
  ],
  paletas: [
    { id: 'confianca', label: 'Confiança', c1: '#1e3a5f', c2: '#f2b134' },
    { id: 'natureza', label: 'Natureza', c1: '#2f5d3a', c2: '#e9c46a' },
    { id: 'energia', label: 'Energia', c1: '#9e2a2b', c2: '#ffd166' },
    { id: 'elegante', label: 'Elegante', c1: '#1c1c1e', c2: '#c9a227' },
    { id: 'moderno', label: 'Moderno', c1: '#33296b', c2: '#2dd4bf' },
    { id: 'claro', label: 'Claro', c1: '#eef3f7', c2: '#1f6f9f' },
  ],
};

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : null);

// Normaliza o que vem do painel: ids estáveis a partir do rótulo, sem repetidos.
function normalizar(input) {
  const out = { extras: [], paletas: [] };
  const usados = new Set();
  const id = (x) => {
    let base = slug(x.id) || slug(x.label) || 'opcao';
    let k = base, n = 2;
    while (usados.has(k)) k = `${base}_${n++}`;
    usados.add(k);
    return k;
  };
  for (const e of (Array.isArray(input && input.extras) ? input.extras : []).slice(0, 20)) {
    const label = str(e && e.label, 60);
    if (label) out.extras.push({ id: id({ id: e.id, label }), label });
  }
  usados.clear();
  for (const p of (Array.isArray(input && input.paletas) ? input.paletas : []).slice(0, 12)) {
    const label = str(p && p.label, 30);
    const c1 = hex(p && p.c1), c2 = hex(p && p.c2);
    if (label && c1 && c2) out.paletas.push({ id: id({ id: p.id, label }), label, c1, c2 });
  }
  return out;
}

async function load() {
  const saved = await readJson(FILE, null);
  return saved ? normalizar(saved) : JSON.parse(JSON.stringify(PADRAO));
}

async function save(input) {
  const data = normalizar(input);
  if (!data.paletas.length) data.paletas = PADRAO.paletas;
  await writeJson(FILE, data);
  return data;
}

async function restaurar() {
  await writeJson(FILE, PADRAO);
  return JSON.parse(JSON.stringify(PADRAO));
}

module.exports = { PADRAO, load, save, restaurar };
