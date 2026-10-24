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
'use strict';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(text, campos) {
  let s = esc(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // só https:// ou caminhos do próprio site ("/x", nunca "//outro-site")
  s = s.replace(/\[([^\]]+)\]\(((?:https:\/\/|\/(?!\/))[^\s)"']*)\)/g, (m, t, url) => {
    const ext = url.startsWith('https://');
    return `<a href="${url}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ' target="_blank" rel="noopener"'}>${t}</a>`;
  });
  s = s.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (m, k) => (k in campos ? campos[k] : m));
  return s;
}

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function render(texto, campos = {}) {
  const lines = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null; // { tag, items }
  let table = null; // rows
  let sectionOpen = false;

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), campos)}</p>`); para = []; } };
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i, campos)}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    const [head, ...body] = rows;
    const th = head.map((c) => `<th>${inline(c, campos)}</th>`).join('');
    const tb = body.map((r) => `<tr>${r.map((c) => `<td>${inline(c, campos)}</td>`).join('')}</tr>`).join('');
    out.push(`<div class="pp-table"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
    out.push('<p class="pp-swipe">Deslize a tabela para o lado →</p>');
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushTable(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushAll(); continue; }
    let m;
    if ((m = /^##\s+(.*)$/.exec(line)) && !line.startsWith('###')) {
      flushAll();
      if (sectionOpen) out.push('</section>');
      out.push(`<section><h2>${inline(m[1], campos)}</h2>`);
      sectionOpen = true;
    } else if ((m = /^###\s+(.*)$/.exec(line))) {
      flushAll();
      out.push(`<h3>${inline(m[1], campos)}</h3>`);
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
      out.push(`<p class="pp-tip">${inline(m[1], campos)}</p>`);
    } else {
      flushList(); flushTable();
      para.push(line.trim());
    }
  }
  flushAll();
  if (sectionOpen) out.push('</section>');
  return out.join('\n');
}

module.exports = { render, esc };
