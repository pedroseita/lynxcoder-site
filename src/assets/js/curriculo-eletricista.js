/* Currículo online de exemplo (src/exemplos/curriculo-eletricista.html).
   Separadores, competências, certificações com validade, trabalhos com detalhe,
   PDF e partilha. O WhatsApp e o telefone ficam com o exemplo.js (modo demonstração).
   Os dados são fictícios; num currículo real, editar o CONFIG. */
(function () {
  'use strict';

  var CONFIG = {
    skills: [
      ['Instalações prediais (NBR 5410)', 5], ['Quadros de distribuição', 5],
      ['Comandos elétricos e partida de motores', 4], ['Leitura de diagramas e projetos', 4],
      ['SPDA e aterramento', 4], ['CLP e inversores de frequência', 3],
      ['Automação residencial', 3], ['Sistemas fotovoltaicos', 3]
    ],
    certs: [
      { t: 'NR-10 Básico', d: 'Segurança em eletricidade', exp: '2027-03-15' },
      { t: 'NR-10 SEP', d: 'Sistema elétrico de potência', exp: '2027-03-15' },
      { t: 'NR-35', d: 'Trabalho em altura', exp: '2026-12-10' },
      { t: 'NR-12', d: 'Segurança em máquinas', exp: null }
    ],
    works: [
      { t: 'Retrofit de quadro geral', where: 'Condomínio residencial, 48 apartamentos', c: '--t1', icon: 'board',
        items: ['Troca de quadro com 42 circuitos', 'Instalação de DR e DPS', 'Balanceamento das três fases', 'Etiquetagem completa'] },
      { t: 'Painel de comando de bombas', where: 'Edifício comercial, Cambuí', c: '--t3', icon: 'motor',
        items: ['Partida estrela-triângulo', 'Alternância automática das bombas', 'Boias e proteção contra falta de fase'] },
      { t: 'Carregador veicular', where: 'Garagem de condomínio', c: '--t4', icon: 'car',
        items: ['Wallbox de 7,4 kW', 'Circuito dedicado desde o quadro', 'Medição individual'] },
      { t: 'Iluminação LED de garagem', where: 'Subsolo com 120 vagas', c: '--t2', icon: 'bulb',
        items: ['Troca de 90 luminárias', 'Sensores de presença por setor', 'Redução de 60% no consumo'] },
      { t: 'Inspeção de SPDA', where: '3 torres residenciais', c: '--t5', icon: 'bolt',
        items: ['Medição de aterramento', 'Correção de descidas soltas', 'Relatório com fotos para o AVCB'] },
      { t: 'Padrão de entrada trifásico', where: 'Comércio, Barão Geraldo', c: '--t1', icon: 'meter',
        items: ['Aumento de carga junto à CPFL', 'Montagem do padrão', 'Aprovação na primeira vistoria'] }
    ]
  };

  var ICONS = {
    board: 'M3 3h18v18H3V3Zm3 3v4h3V6H6Zm5 0v4h3V6h-3Zm5 0v4h2V6h-2ZM6 13v5h12v-5H6Z',
    motor: 'M4 7h11v10H4V7Zm11 3h3l2-2v8l-2-2h-3v-4ZM7 4h5v3H7V4Z',
    car: 'M5 11 7 6h10l2 5h1v6h-2a2 2 0 0 1-4 0h-4a2 2 0 0 1-4 0H4v-6h1Zm2.2 0h9.6l-1.2-3H8.4l-1.2 3Z',
    bulb: 'M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2ZM9 19h6v2H9v-2Z',
    bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
    meter: 'M4 3h16v18H4V3Zm3 3v5h10V6H7Zm2 8v4h6v-4H9Z'
  };
  var NS = 'http://www.w3.org/2000/svg';

  // Construção por DOM (sem innerHTML): o texto do CONFIG nunca é lido como HTML.
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function icon(k) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'currentColor');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICONS[k]);
    s.appendChild(p);
    return s;
  }

  /* ===== Separadores ===== */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var VALID = tabs.map(function (t) { return t.getAttribute('data-key'); });

  function show(key, focus) {
    if (VALID.indexOf(key) === -1) key = 'sobre';
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-key') === key;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var p = document.getElementById(t.getAttribute('aria-controls'));
      p.hidden = !on;
      if (on) { p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); }
      if (on && focus) t.focus();
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      show(t.getAttribute('data-key'));
      history.replaceState(null, '', '#' + t.getAttribute('data-key'));
    });
    t.addEventListener('keydown', function (e) {
      var n = tabs.length, m = { ArrowRight: 1, ArrowLeft: -1 }, j = null;
      if (m[e.key]) j = (i + m[e.key] + n) % n;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = n - 1;
      if (j !== null) { e.preventDefault(); show(tabs[j].getAttribute('data-key'), true); }
    });
  });
  show(location.hash.slice(1));
  window.addEventListener('hashchange', function () { show(location.hash.slice(1)); });

  /* ===== Competências ===== */
  var skills = document.getElementById('skills');
  CONFIG.skills.forEach(function (s) {
    var li = el('li', 'skill');
    li.appendChild(el('span', null, s[0]));
    var dots = el('span', 'dots');
    dots.setAttribute('role', 'img');
    dots.setAttribute('aria-label', 'Nível ' + s[1] + ' de 5');
    for (var n = 1; n <= 5; n++) dots.appendChild(el('i', n <= s[1] ? 'on' : null));
    li.appendChild(dots);
    skills.appendChild(li);
  });

  /* ===== Certificações: a etiqueta muda sozinha com a data de validade ===== */
  var today = new Date();
  var fmt = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });
  var certs = document.getElementById('certs');
  CONFIG.certs.forEach(function (c) {
    var badge = el('span', 'badge na', 'Concluído');
    if (c.exp) {
      var d = new Date(c.exp + 'T23:59:59'), days = (d - today) / 864e5, w = fmt.format(d).replace('.', '');
      if (days < 0) badge = el('span', 'badge warn', 'Vencida');
      else if (days <= 60) badge = el('span', 'badge warn', 'Renova ' + w);
      else badge = el('span', 'badge', 'Válida até ' + w);
    }
    var li = el('li', 'cert'), txt = el('span');
    txt.appendChild(el('strong', null, c.t));
    txt.appendChild(el('small', null, c.d));
    li.appendChild(txt);
    li.appendChild(badge);
    certs.appendChild(li);
  });

  /* ===== Trabalhos + detalhe ===== */
  var dlg = document.getElementById('dlg');
  var works = document.getElementById('works');
  CONFIG.works.forEach(function (w, i) {
    var b = el('button', 'work');
    b.type = 'button';
    b.setAttribute('data-i', String(i));
    b.style.background = 'var(' + w.c + ')';
    var art = el('span', 'art');
    art.appendChild(icon(w.icon));
    b.appendChild(art);
    b.appendChild(el('span', 'cap', w.t));
    var li = el('li');
    li.appendChild(b);
    works.appendChild(li);
  });
  works.addEventListener('click', function (e) {
    var b = e.target.closest('.work');
    if (!b) return;
    var w = CONFIG.works[Number(b.getAttribute('data-i'))];
    var art = document.getElementById('dlg-art');
    art.style.background = 'var(' + w.c + ')';
    art.textContent = '';
    art.appendChild(icon(w.icon));
    document.getElementById('dlg-title').textContent = w.t;
    document.getElementById('dlg-meta').textContent = w.where;
    var list = document.getElementById('dlg-list');
    list.textContent = '';
    w.items.forEach(function (x) { list.appendChild(el('li', null, x)); });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  });
  document.getElementById('dlg-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  /* ===== Ações ===== */
  var note = document.getElementById('note');
  document.getElementById('print').addEventListener('click', function () { window.print(); });
  document.getElementById('share').addEventListener('click', function () {
    var url = location.href.split('#')[0];
    var falhou = function () { note.textContent = 'Não foi possível copiar automaticamente. Copie o endereço na barra do navegador.'; };
    if (navigator.share) {
      navigator.share({ title: document.title, url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        note.textContent = 'Link copiado. Cole na candidatura ou no e-mail.';
      }, falhou);
    } else falhou();
  });
  document.getElementById('year').textContent = String(today.getFullYear());
})();
