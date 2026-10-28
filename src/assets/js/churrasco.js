/* ===== Exemplo "Brasa do Tião" (/exemplos/churrasco) =====
   Pacotes por adulto, calculadora com crianças, adicionais e deslocamento,
   estimativa de carne e pedido de orçamento montado para o WhatsApp.
   Os links data-wa e o envio (WhatsApp real ou balão de demonstração) ficam
   com assets/js/exemplo.js (window.lxDemoSend). */
(function () {
  'use strict';
  var MIN_ADULTS = 15, LEAD_DAYS = 5;
  var PKGS = [
    { id: 'tradicional', name: 'Tradicional', price: 79, grams: 450 },
    { id: 'premium', name: 'Premium', price: 99, grams: 500 },
    { id: 'gaucho', name: 'Gaúcho Completo', price: 129, grams: 550 }
  ];
  var ADDONS = [
    { id: 'churrasqueira', name: 'Churrasqueira portátil', desc: 'Para locais sem churrasqueira.', type: 'fixed', price: 250 },
    { id: 'garcom', name: 'Garçom', desc: '1 garçom a cada 25 convidados.', type: 'per25', price: 220 },
    { id: 'bar', name: 'Serviço de bar com bartender', desc: 'Caipirinhas e drinks. Bebidas alcoólicas à parte.', type: 'perHead', price: 18 },
    { id: 'pao', name: 'Mesa de pães e frios na chegada', desc: 'Tábua de frios, pães e antepastos.', type: 'perHead', price: 15 },
    { id: 'loucas', name: 'Louças, talheres e copos', desc: 'Entregamos e recolhemos.', type: 'perHead', price: 6 }
  ];
  var CITIES = [['Porto Alegre', 0], ['Canoas', 80], ['Cachoeirinha', 80], ['Gravataí', 100], ['Viamão', 100], ['São Leopoldo', 140], ['Novo Hamburgo', 160], ['Outra cidade', null]];

  var $ = function (id) { return document.getElementById(id); };
  var brl = function (v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); };

  $('pkgSeg').innerHTML = PKGS.map(function (p, i) {
    return '<label><input type="radio" name="pkg" value="' + p.id + '"' + (i === 1 ? ' checked' : '') + '><b>' + p.name.replace(' Completo', '') + '</b><small>R$ ' + p.price + '/adulto</small></label>';
  }).join('');
  $('addons').innerHTML = ADDONS.map(function (a) {
    var lbl = a.type === 'fixed' ? 'R$ ' + a.price : a.type === 'per25' ? 'R$ ' + a.price + ' cada' : '+ R$ ' + a.price + '/pessoa';
    return '<label class="chk"><input type="checkbox" name="addon" value="' + a.id + '"><span>' + a.name + '<small>' + a.desc + '</small></span><em>' + lbl + '</em></label>';
  }).join('');
  $('city').innerHTML = CITIES.map(function (c) { return '<option value="' + c[0] + '">' + c[0] + (c[1] === null ? ' (consultar)' : c[1] ? ' (+ R$ ' + c[1] + ' deslocamento)' : ' (sem taxa)') + '</option>'; }).join('');

  // data mínima em hora local (toISOString daria o dia em UTC, que à noite já é amanhã)
  var d = new Date(); d.setDate(d.getDate() + LEAD_DAYS);
  var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  $('date').min = iso;

  function num(id, max) { var v = parseInt($(id).value, 10); if (isNaN(v) || v < 0) v = 0; if (v > max) v = max; return v; }
  document.querySelectorAll('.step button').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.dataset.t, el = $(id), max = +el.max;
      el.value = Math.max(0, Math.min(max, num(id, max) + Number(b.dataset.d))); calc();
    });
  });
  $('calc').addEventListener('input', calc);
  $('calc').addEventListener('change', calc);

  function state() {
    var pkg = PKGS.find(function (p) { return p.id === document.querySelector('input[name="pkg"]:checked').value; });
    var ad = num('ad', 300), kd = num('kd', 150);
    var heads = ad + kd * 0.5;
    var lines = [{ l: pkg.name + ': ' + ad + ' adultos × R$ ' + pkg.price, v: ad * pkg.price }];
    if (kd) lines.push({ l: kd + ' crianças (meia)', v: kd * pkg.price / 2 });
    var addons = [];
    document.querySelectorAll('input[name="addon"]:checked').forEach(function (c) {
      var a = ADDONS.find(function (x) { return x.id === c.value; }), v = 0, l = a.name;
      if (a.type === 'fixed') v = a.price;
      else if (a.type === 'per25') { var n = Math.max(1, Math.ceil((ad + kd) / 25)); v = n * a.price; l = n + ' ' + (n > 1 ? 'garçons' : 'garçom'); }
      else { v = Math.ceil(heads) * a.price; }
      lines.push({ l: l, v: v }); addons.push(l);
    });
    var city = CITIES.find(function (c) { return c[0] === $('city').value; });
    if (city[1]) lines.push({ l: 'Deslocamento (' + city[0] + ')', v: city[1] });
    var total = lines.reduce(function (s, x) { return s + x.v; }, 0);
    var kg = (ad * pkg.grams + kd * pkg.grams * 0.5) / 1000;
    return { pkg: pkg, ad: ad, kd: kd, lines: lines, total: total, kg: kg, addons: addons, city: city };
  }

  function calc() {
    var s = state();
    $('resSummary').textContent = s.pkg.name + ' · ' + s.ad + ' adultos' + (s.kd ? ' e ' + s.kd + ' crianças' : '');
    $('total').textContent = brl(s.total);
    $('perHead').textContent = s.ad ? brl(s.total / s.ad) + ' por adulto, com tudo incluído' : 'Informe o número de adultos';
    $('kg').textContent = s.kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kg';
    $('kgBar').style.width = Math.min(100, s.kg / 120 * 100) + '%';
    $('break').innerHTML = s.lines.map(function (x) { return '<li><span>' + x.l + '</span><span>' + brl(x.v) + '</span></li>'; }).join('');
    var w = [];
    if (s.ad && s.ad < MIN_ADULTS) w.push('O mínimo é de ' + MIN_ADULTS + ' adultos. Para grupos menores, consulte pelo WhatsApp.');
    if (s.city[1] === null) w.push('Para outras cidades, a taxa de deslocamento é combinada no WhatsApp.');
    $('warn').textContent = w.join(' '); $('warn').classList.toggle('on', w.length > 0);
  }

  $('calc').addEventListener('submit', function (e) {
    e.preventDefault();
    var s = state(), miss = [], err = $('err');
    if (!s.ad) miss.push('informe o número de adultos');
    if (!$('name').value.trim()) miss.push('informe seu nome');
    if (!$('date').value) miss.push('escolha a data');
    else if ($('date').value < iso) miss.push('escolha uma data a partir de ' + iso.split('-').reverse().join('/'));
    if (miss.length) { err.textContent = 'Para enviar, ' + miss.join(', ') + '.'; err.classList.add('on'); return; }
    err.classList.remove('on');
    var t = ['*Pedido de orçamento · churrasco*', '',
      'Nome: ' + $('name').value.trim(),
      'Evento: ' + $('kind').value,
      'Data: ' + $('date').value.split('-').reverse().join('/'),
      'Cidade: ' + s.city[0],
      'Pacote: ' + s.pkg.name,
      'Convidados: ' + s.ad + ' adultos' + (s.kd ? ' e ' + s.kd + ' crianças (6 a 12)' : ''),
      'Adicionais: ' + (s.addons.length ? s.addons.join(', ') : 'nenhum'),
      '', '*Estimativa do site: ' + brl(s.total) + '*', 'Carne prevista: ' + s.kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kg'];
    if ($('obs').value.trim()) t.push('', 'Obs.: ' + $('obs').value.trim());
    window.lxDemoSend(t.join('\n'));
  });

  calc();
})();
