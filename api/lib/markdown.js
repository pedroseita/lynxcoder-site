// Formato simples para o texto da proposta editado no painel.
//
//   ## Título de secção        ### Subtítulo
//   parágrafo (linhas seguidas juntam-se; linha em branco separa)
//   - item de lista            1. item numerado
//   > destaque (caixa)
//   | a | b |  tabela (1.ª linha = cabeçalho; a linha |---| é opcional)
//   **negrito**   [texto](https://… ou /caminho)   {{campo}}
//
// Tudo é escapado antes de qualquer marcação: o texto nunca injeta HTML.
// Os {{campos}} são substituídos por HTML já seguro, fornecido por quem chama.
//
// Com { blog: true } (posts do blog), além do acima:
//   ![descrição](/imagens/foto.jpg)   imagem sozinha numa linha (com legenda)
//   `código`, blocos entre ``` e _itálico_
//   títulos sem <section> e com âncora; links internos abrem na mesma aba
'use strict';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// só https:// ou caminhos do próprio site ("/x", nunca "//outro-site")
const URL_RE = String.raw`((?:https:\/\/|\/(?!\/))[^\s)"']*)`;
const LINK_RE = new RegExp(String.raw`\[([^\]]+)\]\(` + URL_RE + String.raw`\)`, 'g');
const IMG_RE = new RegExp(String.raw`^!\[([^\]]*)\]\(` + URL_RE + String.raw`\)$`);
const INTERNO_RE = /^https:\/\/(blog\.)?lynxcoder\.com\.br(\/|$)/;

function inline(text, campos, blog) {
  let s = esc(text);
  // `código`: guardado à parte para não receber negrito nem links
  const codigos = [];
  if (blog) s = s.replace(/`([^`]+)`/g, (m, c) => { codigos.push(c); return `\u0000${codigos.length - 1}\u0000`; });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  if (blog) s = s.replace(/(^|[\s(])_(\S(?:.*?\S)?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  s = s.replace(LINK_RE, (m, t, url) => {
    const ext = url.startsWith('https://');
    if (blog) {
      const interno = !ext || INTERNO_RE.test(url);
      return `<a href="${url}"${interno ? '' : ' target="_blank" rel="noopener noreferrer"'}>${t}</a>`;
    }
    return `<a href="${url}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ' target="_blank" rel="noopener"'}>${t}</a>`;
  });
  if (blog) s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codigos[i]}</code>`);
  s = s.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (m, k) => (k in campos ? campos[k] : m));
  return s;
}

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

const ancora = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function render(texto, campos = {}, { blog = false } = {}) {
  const lines = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null; // { tag, items }
  let table = null; // rows
  let sectionOpen = false;
  let code = null; // linhas de um bloco ``` (só no blog)
  const inl = (t) => inline(t, campos, blog);

  const flushPara = () => { if (para.length) { out.push(`<p>${inl(para.join(' '))}</p>`); para = []; } };
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inl(i)}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    const [head, ...body] = rows;
    const th = head.map((c) => `<th>${inl(c)}</th>`).join('');
    const tb = body.map((r) => `<tr>${r.map((c) => `<td>${inl(c)}</td>`).join('')}</tr>`).join('');
    out.push(`<div class="pp-table"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
    out.push('<p class="pp-swipe">Deslize a tabela para o lado →</p>');
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushTable(); };
  const flushCode = () => { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (blog && code) {
      if (/^```/.test(line.trim())) flushCode(); else code.push(raw);
      continue;
    }
    if (blog && /^```/.test(line.trim())) { flushAll(); code = []; continue; }
    if (!line.trim()) { flushAll(); continue; }
    let m;
    if (blog && (m = IMG_RE.exec(line.trim()))) {
      flushAll();
      const alt = esc(m[1]);
      out.push(`<figure><img src="${esc(m[2])}" alt="${alt}" loading="lazy" decoding="async">${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`);
    } else if (blog && (m = /^(#{2,3})\s+(.*)$/.exec(line))) {
      flushAll();
      const tag = m[1].length === 2 ? 'h2' : 'h3';
      out.push(`<${tag} id="${ancora(m[2])}">${inl(m[2])}</${tag}>`);
    } else if ((m = /^##\s+(.*)$/.exec(line)) && !line.startsWith('###')) {
      flushAll();
      if (sectionOpen) out.push('</section>');
      out.push(`<section><h2>${inl(m[1])}</h2>`);
      sectionOpen = true;
    } else if ((m = /^###\s+(.*)$/.exec(line))) {
      flushAll();
      out.push(`<h3>${inl(m[1])}</h3>`);
    } else if (/^\s*\|/.test(line)) {
      flushPara(); flushList();
      (table = table || []).push(cells(line));
    } else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
      flushPara(); flushTable();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(m[1]);
    } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara(); flushTable();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(m[1]);
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flushAll();
      out.push(`<p class="pp-tip">${inl(m[1])}</p>`);
    } else {
      flushList(); flushTable();
      para.push(line.trim());
    }
  }
  if (code) flushCode();
  flushAll();
  if (sectionOpen) out.push('</section>');
  return out.join('\n');
}

module.exports = { render, esc };
