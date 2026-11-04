/* Modelos da prévia do /criar (lynxsites.com.br/criar/modelos/*.html).
   A página de compra manda os dados do cliente por postMessage (mesma origem)
   e este script troca o conteúdo dos elementos marcados:

     data-pv="nome"            nome do negócio (vários sítios)
     data-pv="cidade"          cidade
     data-pv="tag"             "<profissão> em <cidade> e região"
     data-pv="fone"            WhatsApp formatado
     data-pv="servicos"        lista de serviços (reaproveita os ícones do modelo)
     data-pv="servicos-opcoes" <select> com os serviços
     data-pv="trabalhos"       galeria com as fotos do trabalho
     data-pv="retrato"         foto de rosto
     data-pv="cidades"         área de atendimento
     data-pv="horario"         dias e horário
     data-pv="pagamentos"      formas de pagamento
     data-pv="contato-titulo"  título da secção de contato (muda com o tipo)
     data-pv-tipo="orcamento"  só aparece se o tipo de página for esse
     data-pv-extra="avaliacoes" só aparece com esse extra
     data-pv-sec="servicos"     secção para onde a prévia rola quando o cliente
                               mexe nessa parte (topo, servicos, trabalhos,
                               sobre, avaliacoes, contato, faq)
   Sem um dado, o elemento fica como no exemplo. Tudo por textContent.
   É a base do futuro gerador de páginas: os mesmos marcadores. */
(function () {
  'use strict';

  var original = {};   // conteúdo do exemplo, para repor quando o dado é apagado
  var icones = [];     // ícones dos serviços do exemplo, reutilizados em ciclo
  var DIAS = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };
  var ORDEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
  var PAG = { pix: 'PIX', cartao: 'cartão', dinheiro: 'dinheiro' };

  var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  all('[data-pv]').forEach(function (el, i) { el.setAttribute('data-pv-i', i); original[i] = el.cloneNode(true); });
  all('[data-pv="servicos"] article svg').forEach(function (s) { icones.push(s.cloneNode(true)); });

  function repor(el) { var o = original[el.getAttribute('data-pv-i')]; if (o) el.replaceWith(o.cloneNode(true)); }
  function texto(sel, valor) {
    all('[data-pv="' + sel + '"]').forEach(function (el) {
      if (valor) el.textContent = valor; else repor(el);
    });
  }
  function hh(v) { var p = String(v || '').split(':'); return p[0] ? Number(p[0]) + 'h' + (p[1] && p[1] !== '00' ? p[1] : '') : ''; }
  function dias(lista) {
    var idx = ORDEM.filter(function (d) { return lista.indexOf(d) > -1; }).map(function (d) { return ORDEM.indexOf(d); });
    if (!idx.length) return '';
    var seguidos = idx.every(function (v, i) { return i === 0 || v === idx[i - 1] + 1; });
    if (seguidos && idx.length > 1) return DIAS[ORDEM[idx[0]]] + ' a ' + DIAS[ORDEM[idx[idx.length - 1]]].toLowerCase();
    return idx.map(function (i) { return DIAS[ORDEM[i]]; }).join(', ');
  }
  function fone(d) {
    d = String(d || '').replace(/\D/g, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '';
  }
  function preco(s) {
    if (s.preco === 'sob_orcamento') return 'Sob orçamento';
    var v = Number(String(s.valor).replace(',', '.'));
    if (!(v > 0)) return '';
    return (s.preco === 'a_partir_de' ? 'A partir de ' : '') + v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: v % 1 ? 2 : 0 });
  }
  // texto escuro ou claro conforme a cor de fundo
  function tinta(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#15202B' : '#FFFFFF';
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function aplicar(d) {
    var n = d.negocio || {};
    var root = document.documentElement.style;
    if (d.cor) { root.setProperty('--yellow', d.cor); root.setProperty('--yellow-ink', tinta(d.cor)); }
    else { root.removeProperty('--yellow'); root.removeProperty('--yellow-ink'); }

    texto('nome', n.nome);
    texto('cidade', n.cidade);
    texto('tag', d.profNome && n.cidade ? d.profNome + ' em ' + n.cidade + ' e região' : '');
    texto('fone', fone(n.whatsapp));
    if (n.nome) document.title = n.nome;

    // serviços
    var servicos = (d.servicos || []).filter(function (s) { return s.nome; });
    all('[data-pv="servicos"]').forEach(function (box) {
      if (!servicos.length) { repor(box); return; }
      box.textContent = '';
      servicos.forEach(function (s, i) {
        var p = preco(s);
        box.appendChild(el('article', null, [
          icones.length ? icones[i % icones.length].cloneNode(true) : null,
          el('h3', { text: s.nome }),
          p ? el('p', { class: 'preco', text: p }) : null
        ]));
      });
    });
    all('[data-pv="servicos-opcoes"]').forEach(function (sel) {
      if (!servicos.length) { repor(sel); return; }
      sel.textContent = '';
      servicos.concat([{ nome: 'Outro' }]).forEach(function (s) { sel.appendChild(el('option', { text: s.nome })); });
    });

    // fotos
    var fotos = d.fotos || {};
    all('[data-pv="retrato"]').forEach(function (p) {
      p.classList.toggle('foto', !!fotos.retrato);
      p.style.backgroundImage = fotos.retrato ? 'url("' + fotos.retrato + '")' : '';
    });
    all('[data-pv="trabalhos"]').forEach(function (g) {
      var lista = (fotos.trabalho || []).filter(Boolean);
      if (!lista.length) { repor(g); return; }
      g.textContent = '';
      lista.forEach(function (url) {
        var ph = el('div', { class: 'ph foto' });
        ph.style.backgroundImage = 'url("' + url + '")';
        g.appendChild(el('figure', null, [ph]));
      });
    });

    // contato
    all('[data-pv="cidades"]').forEach(function (u) {
      if (!n.cidade) { repor(u); return; }
      u.textContent = '';
      u.appendChild(el('li', { text: n.cidade }));
    });
    all('[data-pv="horario"]').forEach(function (p) {
      var dd = dias(n.dias || []);
      if (!dd) { repor(p); return; }
      p.textContent = '';
      p.appendChild(el('b', { text: dd + ':' }));
      p.appendChild(document.createTextNode(' ' + hh(n.inicio) + ' às ' + hh(n.fim)));
    });
    texto('pagamentos', (d.pagamentos || []).length
      ? 'Aceitamos ' + d.pagamentos.map(function (x) { return PAG[x] || x; }).join(', ').replace(/, ([^,]*)$/, ' e $1') + '.'
      : '');
    var comOrcamento = !d.tipo || d.tipo === 'orcamento';
    texto('contato-titulo', d.tipo && !comOrcamento ? 'Fale comigo' : '');

    // blocos que dependem do tipo de página e dos extras
    all('[data-pv-tipo]').forEach(function (b) { b.hidden = !!d.tipo && b.getAttribute('data-pv-tipo') !== d.tipo; });
    all('[data-pv-extra]').forEach(function (b) { b.hidden = (d.extras || []).indexOf(b.getAttribute('data-pv-extra')) < 0; });
  }

  // Rola até à parte da página que o cliente está a preencher (só quando muda).
  var focoAtual = null;
  function irPara(foco) {
    if (!foco || foco === focoAtual) return;
    focoAtual = foco;
    var alvo = foco === 'topo' ? null : document.querySelector('[data-pv-sec="' + foco + '"]');
    if (foco !== 'topo' && (!alvo || alvo.hidden)) return;
    var topo = document.querySelector('header');
    var y = alvo ? alvo.getBoundingClientRect().top + window.scrollY - (topo ? topo.offsetHeight : 0) : 0;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.tipo !== 'lx-previa') return;
    var d = e.data.dados || {};
    aplicar(d);
    irPara(d.foco);
  });

  // Arrastar com o rato rola a página (no telemóvel já é o dedo).
  var arrasto = null;
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    arrasto = { y: e.clientY, top: window.scrollY, moveu: false };
  });
  document.addEventListener('pointermove', function (e) {
    if (!arrasto) return;
    var dy = e.clientY - arrasto.y;
    if (!arrasto.moveu && Math.abs(dy) < 4) return;
    arrasto.moveu = true;
    document.documentElement.classList.add('arrasta');
    window.scrollTo(0, arrasto.top - dy);
  });
  function largar() { arrasto = null; document.documentElement.classList.remove('arrasta'); }
  document.addEventListener('pointerup', largar);
  document.addEventListener('pointercancel', largar);
  document.addEventListener('dragstart', function (e) { e.preventDefault(); });

  // A prévia não navega: links e formulários ficam parados.
  document.addEventListener('click', function (e) { if (e.target.closest('a, button')) e.preventDefault(); }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);

  // Avisa a página de compra de que está pronto para receber os dados.
  if (window.parent !== window) window.parent.postMessage({ tipo: 'lx-previa-pronta' }, location.origin);
})();
