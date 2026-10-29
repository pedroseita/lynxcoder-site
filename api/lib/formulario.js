// Opções do formulário /comecar editáveis no painel: extras (etapa 2),
// paletas de cores (etapa 3) e textos das etapas. Guardadas em
// /data/config/formulario.json (dos textos, só os que diferem do padrão).
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

// Textos editáveis: [chave, grupo, rótulo no painel, texto padrão, máximo].
// A chave é a mesma do data-txt / data-ph em src/comecar.html e comecar.js.
const TEXTOS = [
  ['e1_nome', 'Etapa 1', 'Nome da etapa', 'Seu negócio', 40],
  ['e1_titulo', 'Etapa 1', 'Título', 'Vamos começar pelo seu negócio', 120],
  ['e1_intro', 'Etapa 1', 'Explicação', 'São 6 etapas curtas, cerca de 10 minutos. Suas respostas ficam salvas neste aparelho se precisar parar no meio.', 400],
  ['l_nome', 'Etapa 1', 'Rótulo: nome', 'Nome do negócio ou profissional', 80],
  ['ph_nome', 'Etapa 1', 'Exemplo: nome', 'Ex.: João Eletricista', 80],
  ['l_especialidade', 'Etapa 1', 'Rótulo: especialidade', 'Especialidade', 80],
  ['ph_especialidade', 'Etapa 1', 'Exemplo: especialidade', 'Ex.: Eletricista residencial e comercial', 100],
  ['l_cidade', 'Etapa 1', 'Rótulo: cidade', 'Cidade', 80],
  ['ph_cidade', 'Etapa 1', 'Exemplo: cidade', 'Ex.: Campinas - SP', 80],
  ['l_area', 'Etapa 1', 'Rótulo: área de atendimento', 'Área de atendimento', 80],
  ['ph_area', 'Etapa 1', 'Exemplo: área de atendimento', 'Ex.: Campinas e região', 100],
  ['e1_dica', 'Etapa 1', 'Dica no fim', 'As redes informadas aparecem como links na página, sem custo extra.', 300],
  ['e2_nome', 'Etapa 2', 'Nome da etapa', 'Plano e endereço', 40],
  ['e2_titulo', 'Etapa 2', 'Título', 'Escolha o plano e o endereço', 120],
  ['e2_intro', 'Etapa 2', 'Explicação', 'A página é a mesma nos dois planos. Muda o endereço e quem é dono do domínio.', 400],
  ['e2_essencial', 'Etapa 2', 'Descrição do Essencial', 'Endereço da LynxCoder, sem registrar nada.', 160],
  ['e2_profissional', 'Etapa 2', 'Descrição do Profissional', 'Seu próprio domínio, registrado em seu nome.', 160],
  ['e3_nome', 'Etapa 3', 'Nome da etapa', 'Logotipo e cores', 40],
  ['e3_titulo', 'Etapa 3', 'Título', 'Logotipo e cores', 120],
  ['e3_intro', 'Etapa 3', 'Explicação', 'Sem logotipo? Sem problema: usamos o nome do negócio com uma tipografia forte.', 400],
  ['e4_nome', 'Etapa 4', 'Nome da etapa', 'Seus serviços', 40],
  ['e4_titulo', 'Etapa 4', 'Título', 'Seus serviços', 120],
  ['e4_intro', 'Etapa 4', 'Explicação', 'Liste os principais, do mais procurado para o menos. Entre 3 e 6 funciona melhor.', 400],
  ['ph_servico', 'Etapa 4', 'Exemplo: nome do serviço', 'Nome do serviço, ex.: Instalação de chuveiro', 100],
  ['e5_nome', 'Etapa 5', 'Nome da etapa', 'Fotos e depoimentos', 40],
  ['e5_titulo', 'Etapa 5', 'Título', 'Fotos e depoimentos', 120],
  ['e5_intro', 'Etapa 5', 'Explicação', 'Fotos nítidas, com boa luz e na horizontal fazem mais diferença do que qualquer outro detalhe.', 400],
  ['ph_historia', 'Etapa 5', 'Exemplo: história', 'Há quanto tempo trabalha na área, o que o diferencia, como gosta de atender.', 200],
  ['e6_nome', 'Etapa 6', 'Nome da etapa', 'Confira e envie', 40],
  ['e6_titulo', 'Etapa 6', 'Título', 'Confira e envie', 120],
  ['e6_intro', 'Etapa 6', 'Explicação', 'Toque em "Editar" para corrigir qualquer etapa.', 400],
  ['fim_titulo', 'Depois do envio', 'Título', 'Obrigado! Já recebemos tudo.', 120],
  ['fim_intro', 'Depois do envio', 'Explicação', 'Vamos analisar as suas informações e falar com você pelo WhatsApp. Guarde o código do seu pedido:', 400],
];
const TEXTOS_PADRAO = Object.fromEntries(TEXTOS.map((t) => [t[0], t[3]]));
const TEXTOS_CAMPOS = TEXTOS.map(([chave, grupo, rotulo, padrao, max]) => ({ chave, grupo, rotulo, padrao, max }));

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : null);

// Só guarda os textos alterados: assim, melhorar um texto padrão no código
// chega a quem nunca o editou.
function normalizarTextos(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [chave, , , padrao, max] of TEXTOS) {
    const v = str(input[chave], max);
    if (v && v !== padrao) out[chave] = v;
  }
  return out;
}

// Normaliza o que vem do painel: ids estáveis a partir do rótulo, sem repetidos.
function normalizar(input) {
  const out = { extras: [], paletas: [], textos: normalizarTextos(input && input.textos) };
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

async function lerGuardado() {
  const saved = await readJson(FILE, null);
  return saved ? normalizar(saved) : { ...JSON.parse(JSON.stringify(PADRAO)), textos: {} };
}

// Para o formulário e o painel: textos já completos (padrão + alterados).
async function load() {
  const g = await lerGuardado();
  return { extras: g.extras, paletas: g.paletas, textos: { ...TEXTOS_PADRAO, ...g.textos } };
}

// Cada parte só muda se vier no pedido (o editor de opções não manda os textos).
async function save(input) {
  const atual = await lerGuardado();
  const data = normalizar({
    extras: input.extras !== undefined ? input.extras : atual.extras,
    paletas: input.paletas !== undefined ? input.paletas : atual.paletas,
    textos: input.textos !== undefined ? input.textos : atual.textos,
  });
  if (!data.paletas.length) data.paletas = PADRAO.paletas;
  await writeJson(FILE, data);
  return load();
}

async function restaurar() {
  const atual = await lerGuardado();
  await writeJson(FILE, { ...JSON.parse(JSON.stringify(PADRAO)), textos: atual.textos });
  return load();
}

async function restaurarTextos() {
  const atual = await lerGuardado();
  await writeJson(FILE, { extras: atual.extras, paletas: atual.paletas, textos: {} });
  return load();
}

module.exports = { PADRAO, TEXTOS_CAMPOS, load, save, restaurar, restaurarTextos };
