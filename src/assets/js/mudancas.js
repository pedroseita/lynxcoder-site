/* Exemplo do portfólio: fretes e mudanças (inventário por cômodo -> volume,
   veículo e preço). Os links de WhatsApp e a janela da demonstração ficam com
   assets/js/exemplo.js (window.lxDemoSend). */
(function () {
  'use strict';

  var MARGIN = 1.15;   // folga de volume para embalagens
  var BASE_KM = 20;
  var HELPER = 120;    // por ajudante
  var STAIRS = 10;     // R$ por m³ por andar sem elevador
  // volumes aproximados em m³; 4.º valor = desmontável (desmontagem e montagem)
  var ROOMS = [
    { id: 'sala', name: 'Sala', items: [
      ['sofa2', 'Sofá 2 lugares', 1.0], ['sofa3', 'Sofá 3 lugares ou retrátil', 1.5], ['poltrona', 'Poltrona', 0.5], ['rack', 'Rack ou estante', 0.7, 1],
      ['tv', 'TV (embalada)', 0.15], ['centro', 'Mesa de centro', 0.2], ['jantar', 'Mesa de jantar', 0.8, 1], ['cadeira', 'Cadeira', 0.15], ['tapete', 'Tapete enrolado', 0.1]] },
    { id: 'quartos', name: 'Quartos', items: [
      ['camaC', 'Cama de casal com colchão', 1.5, 1], ['camaS', 'Cama de solteiro com colchão', 0.9, 1], ['beliche', 'Beliche', 1.4, 1], ['gr3', 'Guarda-roupa até 3 portas', 1.3, 1],
      ['gr6', 'Guarda-roupa 4 a 6 portas', 2.2, 1], ['comoda', 'Cômoda', 0.6], ['criado', 'Criado-mudo', 0.15], ['berco', 'Berço', 0.6, 1], ['escriv', 'Escrivaninha', 0.6, 1]] },
    { id: 'cozinha', name: 'Cozinha e lavanderia', items: [
      ['geladeira', 'Geladeira', 0.9], ['freezer', 'Freezer', 0.7], ['fogao', 'Fogão', 0.4], ['micro', 'Micro-ondas', 0.06],
      ['armario', 'Armário de cozinha (módulo)', 0.5, 1], ['mesaCoz', 'Mesa pequena', 0.4], ['maquina', 'Máquina de lavar', 0.5], ['secadora', 'Secadora', 0.4]] },
    { id: 'outros', name: 'Caixas e outros', items: [
      ['caixaP', 'Caixa pequena', 0.04], ['caixaM', 'Caixa média', 0.08], ['caixaG', 'Caixa grande', 0.12], ['mala', 'Mala', 0.1],
      ['bike', 'Bicicleta', 0.4], ['cadEsc', 'Cadeira de escritório', 0.25], ['planta', 'Planta grande', 0.2], ['tvGrande', 'TV acima de 60"', 0.3]] }
  ];
  var PRESETS = {
    kit: { sofa2: 1, tv: 1, camaS: 1, gr3: 1, geladeira: 1, fogao: 1, micro: 1, maquina: 1, caixaM: 10, mala: 2 },
    ap1: { sofa2: 1, rack: 1, tv: 1, centro: 1, jantar: 1, cadeira: 4, camaC: 1, gr3: 1, criado: 2, geladeira: 1, fogao: 1, micro: 1, armario: 2, maquina: 1, caixaM: 20, mala: 3 },
    ap2: { sofa3: 1, rack: 1, tv: 1, centro: 1, jantar: 1, cadeira: 4, camaC: 1, camaS: 1, gr6: 1, gr3: 1, comoda: 1, criado: 2, escriv: 1, geladeira: 1, fogao: 1, micro: 1, armario: 3, maquina: 1, caixaM: 30, caixaG: 6, mala: 4, bike: 1 },
    ap3: { sofa3: 1, poltrona: 2, rack: 1, tv: 2, centro: 1, jantar: 1, cadeira: 6, camaC: 1, camaS: 2, gr6: 2, gr3: 1, comoda: 2, criado: 3, escriv: 1, geladeira: 1, freezer: 1, fogao: 1, micro: 1, armario: 4, mesaCoz: 1, maquina: 1, secadora: 1, caixaM: 45, caixaG: 10, mala: 6, bike: 2, planta: 3 },
    zero: {}
  };
  var VEHICLES = [
    { id: 'fiorino', name: 'Utilitário (Fiorino)', cap: 3, base: 180, km: 2.5, helpers: 1, desc: 'Fretes pequenos: um eletrodoméstico, alguns móveis, caixas.' },
    { id: 'hr', name: 'Caminhão pequeno (HR baú)', cap: 14, base: 450, km: 3.5, helpers: 2, desc: 'Kitnets e apartamentos de 1 quarto.' },
    { id: '34', name: 'Caminhão 3/4 baú', cap: 22, base: 850, km: 4.5, helpers: 3, desc: 'Apartamentos e casas de 2 ou 3 quartos.' },
    { id: 'toco', name: 'Caminhão toco baú', cap: 35, base: 1300, km: 6, helpers: 4, desc: 'Casas grandes e mudanças comerciais.' }
  ];
  var EXTRAS = [
    { id: 'mount', name: 'Desmontagem e montagem', desc: 'Camas, guarda-roupas, armários e estantes marcados na lista.', calc: 'mount', unit: 60 },
    { id: 'wrap', name: 'Embalagem completa', desc: 'Embalamos louças, roupas e objetos em caixas, um dia antes.', calc: 'vol', unit: 45 },
    { id: 'boxes', name: 'Fornecer as caixas de papelão', desc: 'Entregamos as caixas da lista alguns dias antes.', calc: 'boxes', unit: 8 },
    { id: 'ins', name: 'Seguro de carga', desc: 'Cobertura para danos durante o transporte.', calc: 'fixed', unit: 90 }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var brl = function (v) { return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); };
  var m3 = function (v) { return v.toLocaleString('pt-BR', { maximumFractionDigits: v < 1 ? 2 : 1 }) + ' m³'; };
  var find = function (list, fn) { return list.filter(fn)[0]; };

  var ITEM = {};
  ROOMS.forEach(function (r) { r.items.forEach(function (i) { ITEM[i[0]] = { id: i[0], name: i[1], vol: i[2], mount: !!i[3], room: r.id }; }); });
  var qty = {};

  /* inventário */
  $('rooms').innerHTML = ROOMS.map(function (r, ri) {
    return '<details class="room"' + (ri === 0 ? ' open' : '') + ' data-room="' + r.id + '"><summary>' + r.name + '<span class="cnt" data-cnt="' + r.id + '"></span></summary><div class="items">' +
      r.items.map(function (i) {
        return '<div class="it" data-id="' + i[0] + '"><span class="nm"><b>' + i[1] + '</b><small>' + m3(i[2]) + (i[3] ? ' · desmontável' : '') + '</small></span>' +
          '<span class="st"><button type="button" data-d="-1" aria-label="Remover: ' + i[1] + '" disabled>−</button><output aria-live="polite">0</output>' +
          '<button type="button" data-d="1" aria-label="Adicionar: ' + i[1] + '">+</button></span></div>';
      }).join('') +
      '</div></details>';
  }).join('');
  $('rooms').addEventListener('click', function (e) {
    var b = e.target.closest('.st button');
    if (!b) return;
    var id = b.closest('.it').dataset.id;
    setQty(id, (qty[id] || 0) + Number(b.dataset.d));
    calc();
  });
  function setQty(id, n) {
    n = Math.max(0, Math.min(99, n));
    if (n) qty[id] = n; else delete qty[id];
    var row = document.querySelector('.it[data-id="' + id + '"]');
    row.querySelector('output').textContent = n;
    row.querySelector('[data-d="-1"]').disabled = !n;
    row.classList.toggle('has', n > 0);
  }
  $('quick').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    Object.keys(ITEM).forEach(function (id) { setQty(id, 0); });
    var p = PRESETS[b.dataset.p];
    Object.keys(p).forEach(function (id) { setQty(id, p[id]); });
    calc();
  });

  /* andares, extras e frota */
  var floors = '<option value="0">Térreo ou casa</option>' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<option value="' + n + '">' + n + 'º andar</option>'; }).join('') + '<option value="11">Acima do 10º</option>';
  $('fFrom').innerHTML = floors;
  $('fTo').innerHTML = floors;
  $('extras').innerHTML = EXTRAS.map(function (x) {
    var l = x.calc === 'mount' ? 'R$ ' + x.unit + '/peça' : x.calc === 'vol' ? 'R$ ' + x.unit + '/m³' : x.calc === 'boxes' ? 'R$ ' + x.unit + '/caixa' : 'R$ ' + x.unit;
    return '<label class="opt"><input type="checkbox" name="extra" value="' + x.id + '"><span class="t">' + x.name + '<small>' + x.desc + '</small></span><em>' + l + '</em></label>';
  }).join('');
  $('cars').innerHTML = VEHICLES.map(function (v, i) {
    var truck = '<svg viewBox="0 0 200 70" aria-hidden="true"><rect class="kr" x="4" y="8" width="' + (60 + i * 22) + '" height="44" rx="4"/>' +
      '<rect class="cb" x="132" y="22" width="44" height="30" rx="6"/><circle class="rd" cx="40" cy="56" r="10"/><circle class="rd" cx="152" cy="56" r="10"/></svg>';
    return '<article>' + truck + '<h3>' + v.name + '</h3><p class="cap">Até ' + v.cap + ' m³ · ' + v.helpers + (v.helpers > 1 ? ' ajudantes' : ' ajudante') + '</p><p>' + v.desc + '</p>' +
      '<p class="from">a partir de <b>' + brl(v.base + v.helpers * HELPER) + '</b></p></article>';
  }).join('');

  var d = new Date();
  d.setDate(d.getDate() + 2);
  $('date').min = d.toISOString().slice(0, 10);
  var inv = document.querySelector('.inv');
  inv.addEventListener('input', function (e) { if (!e.target.closest('.room')) calc(); });
  inv.addEventListener('change', function (e) { if (!e.target.closest('.room')) calc(); });

  /* cálculo */
  function state() {
    var raw = 0, count = 0, mountN = 0, boxes = 0;
    Object.keys(qty).forEach(function (id) {
      var i = ITEM[id], n = qty[id];
      raw += i.vol * n; count += n;
      if (i.mount) mountN += n;
      if (id.indexOf('caixa') === 0) boxes += n;
    });
    var vol = raw * MARGIN;
    var v = null;
    for (var k = 0; k < VEHICLES.length; k++) { if (vol <= VEHICLES[k].cap) { v = VEHICLES[k]; break; } }
    var over = !v && vol > 0;
    if (over) v = VEHICLES[VEHICLES.length - 1];
    var trips = over ? Math.ceil(vol / v.cap) : 1;
    var km = Math.max(1, parseInt($('km').value, 10) || 1);
    var lines = [], total = 0;
    if (vol > 0) {
      lines.push([v.name + (trips > 1 ? ' × ' + trips + ' viagens' : ''), v.base * trips]);
      lines.push([v.helpers + (v.helpers > 1 ? ' ajudantes' : ' ajudante'), v.helpers * HELPER]);
      if (km > BASE_KM) lines.push(['Distância extra (' + (km - BASE_KM) + ' km)', (km - BASE_KM) * v.km * trips]);
      var fl = 0;
      [['fFrom', 'eFrom'], ['fTo', 'eTo']].forEach(function (p) { if (!$(p[1]).checked) fl += +$(p[0]).value; });
      if (fl) lines.push(['Escadas (' + fl + (fl > 1 ? ' andares' : ' andar') + ' sem elevador)', fl * vol * STAIRS]);
      Array.prototype.forEach.call(document.querySelectorAll('input[name="extra"]:checked'), function (c) {
        var x = find(EXTRAS, function (e) { return e.id === c.value; }), val = 0, l = x.name;
        if (x.calc === 'mount') { if (!mountN) return; val = mountN * x.unit; l += ' (' + mountN + (mountN > 1 ? ' peças' : ' peça') + ')'; }
        else if (x.calc === 'vol') val = vol * x.unit;
        else if (x.calc === 'boxes') { if (!boxes) return; val = boxes * x.unit; l += ' (' + boxes + ')'; }
        else val = x.unit;
        lines.push([l, val]);
      });
      total = lines.reduce(function (s, l) { return s + l[1]; }, 0);
    }
    return { raw: raw, vol: vol, v: v, over: over, trips: trips, count: count, lines: lines, total: total, km: km, mountN: mountN };
  }

  var boxesG = $('boxes');
  function drawCargo(pct) {
    var w = Math.round(190 * pct);
    $('fill').setAttribute('width', w);
    var html = '', cols = Math.floor(w / 26);
    for (var c = 0; c < cols; c++) { for (var r = 0; r < 3; r++) { html += '<rect x="' + (11 + c * 26) + '" y="' + (17 + r * 26) + '" width="24" height="24"/>'; } }
    boxesG.innerHTML = html;
  }
  function calc() {
    var s = state();
    ROOMS.forEach(function (r) {
      var n = r.items.reduce(function (a, i) { return a + (qty[i[0]] || 0); }, 0);
      document.querySelector('[data-cnt="' + r.id + '"]').textContent = n ? n + (n > 1 ? ' itens' : ' item') : '';
    });
    var al = $('alert'), warn = [];
    if (!s.vol) {
      $('vName').textContent = 'Nenhum item'; $('vCap').textContent = '0 m³'; $('vBar').style.width = '0'; drawCargo(0);
      $('vNote').textContent = 'Marque os itens para ver o veículo indicado.'; $('total').textContent = 'R$ 0'; $('tsub').textContent = 'Estimativa com motorista e ajudantes';
      $('lines').innerHTML = ''; al.classList.remove('on'); $('mbar').classList.remove('on');
      return;
    }
    var pct = Math.min(1, s.vol / (s.v.cap * s.trips));
    $('vName').textContent = s.v.name;
    $('vCap').textContent = m3(s.vol) + ' de ' + (s.v.cap * s.trips) + ' m³';
    $('vBar').style.width = Math.round(pct * 100) + '%';
    drawCargo(pct);
    $('vNote').textContent = s.count + (s.count > 1 ? ' itens' : ' item') + ' · ' + m3(s.raw) + ' de móveis + 15% de folga para embalagens';
    $('total').textContent = brl(s.total);
    $('tsub').textContent = 'Estimativa com motorista e ' + s.v.helpers + (s.v.helpers > 1 ? ' ajudantes' : ' ajudante');
    $('lines').innerHTML = s.lines.map(function (l) { return '<li><span>' + l[0] + '</span><span>' + brl(l[1]) + '</span></li>'; }).join('');
    if (s.over) warn.push('O volume passa da capacidade de um caminhão toco. Calculamos em ' + s.trips + ' viagens; podemos avaliar uma carreta.');
    if (s.km > 150) warn.push('Para distâncias acima de 150 km, a cotação é feita pelo WhatsApp.');
    al.textContent = warn.join(' ');
    al.classList.toggle('on', warn.length > 0);
    $('mVeh').textContent = s.v.name + ' · ' + m3(s.vol);
    $('mTot').textContent = brl(s.total);
    $('mbar').classList.add('on');
  }

  $('send').addEventListener('click', function () {
    var s = state(), miss = [], err = $('err');
    if (!s.vol) miss.push('marque pelo menos um item');
    if (!$('from').value.trim()) miss.push('informe a origem');
    if (!$('to').value.trim()) miss.push('informe o destino');
    if (!$('name').value.trim()) miss.push('informe seu nome');
    if (miss.length) { err.textContent = 'Para enviar, ' + miss.join(', ') + '.'; err.classList.add('on'); return; }
    err.classList.remove('on');
    var fl = function (f, e) {
      var v = +$(f).value;
      return (v ? $(f).selectedOptions[0].textContent : 'térreo') + ($(e).checked ? ' (com elevador)' : v ? ' (sem elevador)' : '');
    };
    var t = ['*Orçamento de mudança*', '',
      'Nome: ' + $('name').value.trim(),
      'De: ' + $('from').value.trim() + ' · ' + fl('fFrom', 'eFrom'),
      'Para: ' + $('to').value.trim() + ' · ' + fl('fTo', 'eTo'),
      'Distância: ~' + s.km + ' km',
      'Data: ' + ($('date').value ? $('date').value.split('-').reverse().join('/') : 'a combinar') + ' · ' + $('period').value, '',
      '*Itens (' + s.count + ')*'];
    ROOMS.forEach(function (r) {
      var its = r.items.filter(function (i) { return qty[i[0]]; }).map(function (i) { return qty[i[0]] + '× ' + i[1]; });
      if (its.length) t.push(r.name + ': ' + its.join(', '));
    });
    var ex = Array.prototype.map.call(document.querySelectorAll('input[name="extra"]:checked'), function (c) { return find(EXTRAS, function (e) { return e.id === c.value; }).name; });
    t.push('', 'Extras: ' + (ex.length ? ex.join(', ') : 'nenhum'),
      'Volume estimado: ' + m3(s.vol) + ' · ' + s.v.name + (s.trips > 1 ? ' (' + s.trips + ' viagens)' : ''),
      '*Estimativa do site: ' + brl(s.total) + '*');
    if ($('obs').value.trim()) t.push('', 'Obs.: ' + $('obs').value.trim());
    window.lxDemoSend(t.join('\n'));
  });

  calc();
})();
