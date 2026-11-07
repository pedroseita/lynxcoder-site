/* Currículo online de exemplo, estilo "Circuito" (src/exemplos/curriculo-circuito.html).
   Cargo "digitado", fio que acende as secções com o scroll, medidores de
   competências, certificações com validade, carrossel de trabalhos, PDF e partilha.
   O WhatsApp e o telefone ficam com o exemplo.js (modo demonstração).
   Os dados são fictícios; num currículo real, editar o CONFIG. */
(function () {
  'use strict';

  var CONFIG = {
    roles: ['Eletricista predial e industrial', 'Técnico em Eletrotécnica', 'Manutenção de quadros e comandos'],
    skills: [
      ['Instalações prediais', 95], ['Quadros de distribuição', 92], ['Comandos e motores', 80],
      ['Leitura de projetos', 82], ['SPDA e aterramento', 78], ['CLP e inversores', 60]
    ],
    certs: [
      { t: 'NR-10 Básico', d: 'Segurança em eletricidade', exp: '2027-03-15' },
      { t: 'NR-10 SEP', d: 'Sistema elétrico de potência', exp: '2027-03-15' },
      { t: 'NR-35', d: 'Trabalho em altura', exp: '2026-12-10' },
      { t: 'Sistemas fotovoltaicos', d: 'SENAI, 40 horas, 2023', exp: null }
    ],
    works: [
      { t: 'Retrofit de quadro geral', w: 'Condomínio, 48 apartamentos', c: '#05916B', icon: 'board', items: ['42 circuitos com DR e DPS', 'Balanceamento de fases', 'Etiquetagem completa'] },
      { t: 'Painel de bombas', w: 'Edifício comercial, Cambuí', c: '#0E7490', icon: 'motor', items: ['Partida estrela-triângulo', 'Alternância automática', 'Proteção contra falta de fase'] },
      { t: 'Carregador veicular', w: 'Garagem de condomínio', c: '#1A5FD6', icon: 'car', items: ['Wallbox de 7,4 kW', 'Circuito dedicado', 'Medição individual'] },
      { t: 'LED na garagem', w: 'Subsolo com 120 vagas', c: '#0F766E', icon: 'bulb', items: ['90 luminárias trocadas', 'Sensores por setor', '60% menos consumo'] },
      { t: 'Inspeção de SPDA', w: '3 torres residenciais', c: '#3730A3', icon: 'bolt', items: ['Medição de aterramento', 'Correção de descidas', 'Relatório para o AVCB'] }
    ]
  };

  var ICONS = {
    board: 'M3 3h18v18H3V3Zm3 3v4h3V6H6Zm5 0v4h3V6h-3Zm5 0v4h2V6h-2ZM6 13v5h12v-5H6Z',
    motor: 'M4 7h11v10H4V7Zm11 3h3l2-2v8l-2-2h-3v-4ZM7 4h5v3H7V4Z',
    car: 'M5 11 7 6h10l2 5h1v6h-2a2 2 0 0 1-4 0h-4a2 2 0 0 1-4 0H4v-6h1Zm2.2 0h9.6l-1.2-3H8.4l-1.2 3Z',
    bulb: 'M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2ZM9 19h6v2H9v-2Z',
    bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z'
  };
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Construção por DOM (sem innerHTML): o texto do CONFIG nunca é lido como HTML.
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function iconFill(d) {
    var s = svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' });
    s.appendChild(svgEl('path', { d: d }));
    return s;
  }
  function iconStroke(d) {
    var s = svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '3', 'aria-hidden': 'true' });
    s.appendChild(svgEl('path', { d: d }));
    return s;
  }

  /* ===== Cargo a ser "digitado" ===== */
  var typed = document.getElementById('typed');
  if (!reduce) {
    var r = 0, i = 0, del = false;
    typed.textContent = '';
    var tick = function () {
      var word = CONFIG.roles[r];
      typed.textContent = word.slice(0, i);
      if (!del && i < word.length) { i++; return setTimeout(tick, 55); }
      if (!del) { del = true; return setTimeout(tick, 2200); }
      if (i > 0) { i--; return setTimeout(tick, 25); }
      del = false; r = (r + 1) % CONFIG.roles.length; setTimeout(tick, 300);
    };
    setTimeout(tick, 1300);
  }

  /* ===== Medidores ===== */
  var ARC = 157.08;
  var gauges = document.getElementById('gauges');
  CONFIG.skills.forEach(function (s) {
    var name = s[0], v = s[1];
    var li = el('li', 'gauge');
    li.setAttribute('data-off', (ARC * (1 - v / 100)).toFixed(2));
    li.setAttribute('data-rot', (-90 + 180 * v / 100).toFixed(1));
    // Para a impressão (Ctrl+P sem ter descido a página): os medidores já cheios.
    li.style.setProperty('--off', li.getAttribute('data-off'));
    li.style.setProperty('--rot', 'rotate(' + li.getAttribute('data-rot') + 'deg)');
    var svg = svgEl('svg', { viewBox: '0 0 120 72', role: 'img', 'aria-label': name + ': ' + v + ' por cento' });
    [0, 25, 50, 75, 100].forEach(function (p) {
      var a = Math.PI * (1 - p / 100);
      svg.appendChild(svgEl('line', {
        'class': 'g-tick',
        x1: (60 + 58 * Math.cos(a)).toFixed(1), y1: (60 - 58 * Math.sin(a)).toFixed(1),
        x2: (60 + 64 * Math.cos(a)).toFixed(1), y2: (60 - 64 * Math.sin(a)).toFixed(1)
      }));
    });
    svg.appendChild(svgEl('path', { 'class': 'g-track', d: 'M10 60 A50 50 0 0 1 110 60' }));
    svg.appendChild(svgEl('path', { 'class': 'g-val', d: 'M10 60 A50 50 0 0 1 110 60' }));
    svg.appendChild(svgEl('line', { 'class': 'g-needle', x1: '60', y1: '60', x2: '60', y2: '18' }));
    svg.appendChild(svgEl('circle', { 'class': 'g-hub', cx: '60', cy: '60', r: '5' }));
    li.appendChild(svg);
    var num = el('div', 'g-num', '0%');
    num.setAttribute('data-v', String(v));
    li.appendChild(num);
    li.appendChild(el('div', 'g-name', name));
    gauges.appendChild(li);
  });

  function setGauge(g) {
    g.querySelector('.g-val').style.strokeDashoffset = g.getAttribute('data-off');
    g.querySelector('.g-needle').style.transform = 'rotate(' + g.getAttribute('data-rot') + 'deg)';
  }
  function runGauges() {
    Array.prototype.forEach.call(document.querySelectorAll('.gauge'), function (g, k) {
      setTimeout(function () {
        setGauge(g);
        var num = g.querySelector('.g-num'), target = Number(num.getAttribute('data-v'));
        if (reduce) { num.textContent = target + '%'; return; }
        var t0 = performance.now();
        var step = function (now) {
          var p = Math.min(1, (now - t0) / 1400), e = 1 - Math.pow(1 - p, 3);
          num.textContent = Math.round(target * e) + '%';
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, reduce ? 0 : k * 120);
    });
  }
  function gaugesNow() {
    Array.prototype.forEach.call(document.querySelectorAll('.gauge'), function (g) {
      setGauge(g);
      var n = g.querySelector('.g-num');
      n.textContent = n.getAttribute('data-v') + '%';
    });
  }

  /* ===== Certificações: o selo muda sozinho com a data de validade ===== */
  var today = new Date();
  var fmt = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });
  var CHECK = 'm5 12 5 5 9-10', ALERT = 'M12 7v6M12 17h.01';
  var certs = document.getElementById('certs');
  CONFIG.certs.forEach(function (c) {
    var cls = 'na', ic = CHECK, txt = c.d;
    if (c.exp) {
      var d = new Date(c.exp + 'T23:59:59'), days = (d - today) / 864e5, w = fmt.format(d).replace('.', '');
      if (days < 0) { cls = 'warn'; ic = ALERT; txt = 'Vencida'; }
      else if (days <= 60) { cls = 'warn'; ic = ALERT; txt = c.d + ', renova em ' + w; }
      else { cls = ''; txt = c.d + ', válida até ' + w; }
    }
    var li = el('li', 'cert');
    var seal = el('span', 'seal' + (cls ? ' ' + cls : ''));
    seal.appendChild(iconStroke(ic));
    var body = el('span');
    body.appendChild(el('strong', null, c.t));
    body.appendChild(el('small', null, txt));
    li.appendChild(seal);
    li.appendChild(body);
    certs.appendChild(li);
  });

  /* ===== Carrossel de trabalhos ===== */
  var track = document.getElementById('track');
  CONFIG.works.forEach(function (w) {
    var art = el('div', 'work-art');
    art.style.background = w.c;
    art.appendChild(iconFill(ICONS[w.icon]));
    var body = el('div', 'work-body');
    body.appendChild(el('h3', null, w.t));
    body.appendChild(el('p', null, w.w));
    var ul = el('ul');
    w.items.forEach(function (x) { ul.appendChild(el('li', null, x)); });
    body.appendChild(ul);
    var art2 = el('article', 'work');
    art2.appendChild(art);
    art2.appendChild(body);
    var li = el('li');
    li.appendChild(art2);
    track.appendChild(li);
  });
  var prev = document.getElementById('prev'), next = document.getElementById('next');
  var stepW = function () { return track.querySelector('li').offsetWidth + 16; };
  prev.addEventListener('click', function () { track.scrollBy({ left: -stepW(), behavior: reduce ? 'auto' : 'smooth' }); });
  next.addEventListener('click', function () { track.scrollBy({ left: stepW(), behavior: reduce ? 'auto' : 'smooth' }); });
  var navState = function () {
    prev.disabled = track.scrollLeft < 4;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  };
  track.addEventListener('scroll', navState, { passive: true });
  window.addEventListener('resize', navState);
  navState();

  /* ===== Fio do circuito + secções que acendem ===== */
  var circuit = document.getElementById('circuit');
  var fill = document.getElementById('railFill');
  var topbar = document.getElementById('topbar');
  var blocks = Array.prototype.slice.call(document.querySelectorAll('.block'));
  var gaugesDone = false, ticking = false;

  function update() {
    ticking = false;
    var rect = circuit.getBoundingClientRect();
    var probe = window.innerHeight * 0.6;
    var h = Math.max(0, Math.min(rect.height, probe - rect.top));
    fill.style.height = h + 'px';
    var doc = document.documentElement;
    topbar.style.transform = 'scaleX(' + (window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)) + ')';
    blocks.forEach(function (b) {
      var node = b.querySelector('.node');
      var y = b.offsetTop + node.offsetTop + 11;
      var on = h >= y || (window.scrollY + window.innerHeight >= doc.scrollHeight - 2);
      if (on && !b.classList.contains('lit')) {
        b.classList.add('lit');
        if (b.id === 'competencias' && !gaugesDone) { gaugesDone = true; setTimeout(runGauges, reduce ? 0 : 250); }
      }
    });
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();

  /* ===== Ações ===== */
  Array.prototype.forEach.call(document.querySelectorAll('.js-print'), function (b) {
    b.addEventListener('click', function () {
      blocks.forEach(function (x) { x.classList.add('lit'); });
      if (!gaugesDone) { gaugesDone = true; gaugesNow(); }
      setTimeout(function () { window.print(); }, 50);
    });
  });

  var note = document.getElementById('note');
  document.getElementById('share').addEventListener('click', function () {
    var url = location.href.split('#')[0];
    var falhou = function () { note.textContent = 'Não foi possível copiar. Copie o endereço na barra do navegador.'; };
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
