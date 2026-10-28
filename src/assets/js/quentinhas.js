/* ===== Exemplo "Sabor da Lúcia" (/exemplos/quentinhas) =====
   Cardápio da semana, prato do dia automático, carrinho com entrega por bairro
   e pedido montado para o WhatsApp. Os links data-wa e o envio (WhatsApp real
   ou balão de demonstração) ficam com assets/js/exemplo.js (window.lxDemoSend). */
(function () {
  'use strict';
  var PRICE = { P: 20, G: 25 };
  var CUTOFF = { h: 10, m: 30 };
  var FREE_FROM = 4;
  var WEEK = {
    1: { name: 'Segunda', dish: 'Frango assado com batata', desc: 'Coxa e sobrecoxa assadas com batata e alecrim.' },
    2: { name: 'Terça', dish: 'Carne de panela com legumes', desc: 'Acém cozido devagar com cenoura, chuchu e batata.' },
    3: { name: 'Quarta', dish: 'Feijoada completa', desc: 'Com arroz, couve refogada, farofa e laranja.' },
    4: { name: 'Quinta', dish: 'Strogonoff de frango', desc: 'Com arroz e batata palha.' },
    5: { name: 'Sexta', dish: 'Peixe empanado com purê', desc: 'Filé de merluza empanado e purê de batata.' }
  };
  var FIXED = [
    { id: 'bife', dish: 'Bife acebolado', desc: 'Com arroz, feijão e salada.', tag: 'Todo dia' },
    { id: 'veg', dish: 'Opção vegetariana', desc: 'Legumes refogados com grão-de-bico e arroz integral.', tag: 'Todo dia' }
  ];
  var EXTRAS = [
    { id: 'suco', name: 'Suco natural 300 ml', desc: 'Laranja ou maracujá.', price: 7 },
    { id: 'refri', name: 'Refrigerante lata', desc: '350 ml.', price: 6 },
    { id: 'pudim', name: 'Pudim de leite', desc: 'Fatia individual.', price: 6 }
  ];
  var BAIRROS = [['Centro', 4], ['Ingá', 4], ['Icaraí', 5], ['Santa Rosa', 5], ['Fonseca', 6], ['São Francisco', 7]];

  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (v) { return 'R$ ' + v.toFixed(2).replace('.', ','); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ----- dia do pedido ----- */
  var now = new Date(), dow = now.getDay();
  var beforeCut = now.getHours() < CUTOFF.h || (now.getHours() === CUTOFF.h && now.getMinutes() < CUTOFF.m);
  var isWeekday = dow >= 1 && dow <= 5;
  var orderDay, orderLabel;
  if (isWeekday && beforeCut) { orderDay = dow; orderLabel = 'Pedido para hoje, ' + WEEK[dow].name.toLowerCase(); }
  else {
    orderDay = (dow >= 5 || dow === 0) ? 1 : dow + 1;
    orderLabel = (orderDay === (dow + 1) % 7) ? 'Pedido para amanhã, ' + WEEK[orderDay].name.toLowerCase() : 'Pedido para segunda-feira';
  }
  var open = isWeekday && beforeCut;
  $('status').classList.add(open ? 'open' : 'closed');
  $('statusText').textContent = open ? 'Aceitando pedidos para hoje até 10h30' : 'Aceitando pedidos para o próximo dia útil';
  $('forDay').textContent = orderLabel;

  var showDay = isWeekday ? dow : orderDay;
  $('todayLbl').textContent = isWeekday ? 'Prato de hoje' : 'Prato de ' + WEEK[showDay].name.toLowerCase();
  $('t-today').textContent = WEEK[showDay].dish;
  $('todayDesc').textContent = WEEK[showDay].desc;

  /* ----- cardápio da semana ----- */
  var days = $('days');
  [1, 2, 3, 4, 5].forEach(function (d) {
    var li = document.createElement('li'); if (d === dow) li.className = 'is-today';
    li.innerHTML = '<div class="d">' + WEEK[d].name + (d === dow ? '<em>Hoje</em>' : '') + '</div><h3>' + esc(WEEK[d].dish) + '</h3><p>' + esc(WEEK[d].desc) + '</p>';
    days.appendChild(li);
  });

  /* ----- itens do pedido ----- */
  // Os pratos vêm com arroz, feijão e salada, salvo quando a descrição já
  // diz o acompanhamento (feijoada, strogonoff…), para não repetir "Com arroz".
  var descDia = WEEK[orderDay].desc + (/arroz/i.test(WEEK[orderDay].desc) ? '' : ' Com arroz, feijão e salada.');
  var dishes = [{ id: 'dia', dish: WEEK[orderDay].dish, desc: descDia, tag: 'Prato do dia' }].concat(FIXED);
  var qty = {};
  function stepper(key, label, price) {
    return '<div class="size" data-key="' + key + '"><span>' + label + '<b>' + fmt(price) + '</b></span><div class="step">' +
      '<button type="button" data-d="-1" aria-label="Remover uma: ' + esc(label) + '" disabled>−</button>' +
      '<output aria-live="polite">0</output>' +
      '<button type="button" data-d="1" aria-label="Adicionar uma: ' + esc(label) + '">+</button></div></div>';
  }
  $('items').innerHTML = dishes.map(function (d) {
    return '<article class="item"><div class="item-head"><h3>' + esc(d.dish) + '</h3><span class="tag">' + d.tag + '</span></div><p>' + esc(d.desc) + '</p><div class="sizes">' +
      stepper(d.id + '|P', 'Pequena', PRICE.P) + stepper(d.id + '|G', 'Grande', PRICE.G) + '</div></article>';
  }).join('');
  $('extras').innerHTML = EXTRAS.map(function (x) {
    return '<article class="item"><div class="item-head"><h3>' + esc(x.name) + '</h3></div><p>' + esc(x.desc) + '</p><div class="sizes">' + stepper('x:' + x.id, 'Unidade', x.price) + '</div></article>';
  }).join('');

  function info(key) {
    if (key.indexOf('x:') === 0) { var x = EXTRAS.find(function (e) { return 'x:' + e.id === key; }); return { name: x.name, price: x.price, meal: false }; }
    var p = key.split('|'), d = dishes.find(function (e) { return e.id === p[0]; });
    return { name: 'Quentinha ' + (p[1] === 'P' ? 'pequena' : 'grande') + ': ' + d.dish, price: PRICE[p[1]], meal: true };
  }
  document.querySelectorAll('.size').forEach(function (el) {
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = el.dataset.key, n = Math.max(0, Math.min(30, (qty[k] || 0) + Number(b.dataset.d)));
      if (n) qty[k] = n; else delete qty[k];
      el.querySelector('output').textContent = n;
      el.querySelector('[data-d="-1"]').disabled = n === 0;
      el.classList.toggle('has', n > 0);
      render();
    });
  });

  /* ----- entrega ----- */
  var sel = $('bairro');
  sel.innerHTML = '<option value="">Selecione</option>' + BAIRROS.map(function (b) { return '<option value="' + b[0] + '">' + b[0] + ' (' + fmt(b[1]) + ')</option>'; }).join('') + '<option value="outro">Outro bairro (consultar)</option>';
  document.querySelector('#fees tbody').innerHTML = BAIRROS.map(function (b) { return '<tr><td>' + b[0] + '</td><td>' + fmt(b[1]) + '</td></tr>'; }).join('') + '<tr><td>Outros bairros</td><td>Consultar</td></tr>';
  var mode = function () { return document.querySelector('input[name="mode"]:checked').value; };
  var pay = function () { return document.querySelector('input[name="pay"]:checked').value; };
  document.querySelectorAll('input[name="mode"]').forEach(function (r) { r.addEventListener('change', function () { $('deliveryFields').hidden = mode() !== 'entrega'; render(); }); });
  document.querySelectorAll('input[name="pay"]').forEach(function (r) { r.addEventListener('change', function () { $('trocoBox').hidden = pay() !== 'Dinheiro'; }); });
  sel.addEventListener('change', render);

  function calc() {
    var sub = 0, meals = 0, items = 0, lines = [];
    Object.keys(qty).forEach(function (k) { var i = info(k); sub += i.price * qty[k]; items += qty[k]; if (i.meal) meals += qty[k]; lines.push({ n: qty[k], name: i.name, total: i.price * qty[k] }); });
    var fee = 0, feeTxt = fmt(0);
    if (mode() === 'entrega') {
      if (meals >= FREE_FROM) { feeTxt = 'Grátis'; }
      else { var b = BAIRROS.find(function (x) { return x[0] === sel.value; }); if (b) { fee = b[1]; feeTxt = fmt(fee); } else if (sel.value === 'outro') { feeTxt = 'A combinar'; } else { feeTxt = 'Escolha o bairro'; } }
    } else feeTxt = 'Retirada';
    return { sub: sub, fee: fee, feeTxt: feeTxt, total: sub + fee, meals: meals, items: items, lines: lines };
  }
  function render() {
    var c = calc();
    $('lines').innerHTML = c.lines.length ? c.lines.map(function (l) { return '<li><span>' + l.n + '× ' + esc(l.name) + '</span><span>' + fmt(l.total) + '</span></li>'; }).join('') : '<li class="empty">Escolha as quentinhas ao lado.</li>';
    $('sub').textContent = fmt(c.sub); $('fee').textContent = c.feeTxt; $('total').textContent = fmt(c.total);
    $('barTotal').textContent = fmt(c.total); $('barCount').textContent = c.items + (c.items === 1 ? ' item' : ' itens');
    $('bar').classList.toggle('on', c.items > 0);
  }

  $('cart').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = calc(), err = $('err'), miss = [];
    if (!c.meals) miss.push('escolha pelo menos uma quentinha');
    if (!$('nome').value.trim()) miss.push('informe seu nome');
    if (mode() === 'entrega') { if (!sel.value) miss.push('escolha o bairro'); if (!$('endereco').value.trim()) miss.push('informe o endereço'); }
    if (miss.length) { err.textContent = 'Para enviar, ' + miss.join(', ') + '.'; err.classList.add('on'); return; }
    err.classList.remove('on');
    var t = ['*Pedido · ' + orderLabel.replace('Pedido para ', '') + '*', ''];
    c.lines.forEach(function (l) { t.push(l.n + '× ' + l.name + ' (' + fmt(l.total) + ')'); });
    t.push('', 'Subtotal: ' + fmt(c.sub), 'Entrega: ' + c.feeTxt, '*Total: ' + fmt(c.total) + '*', '');
    t.push('Nome: ' + $('nome').value.trim());
    if (mode() === 'entrega') t.push('Entrega: ' + $('endereco').value.trim() + ' – ' + (sel.value === 'outro' ? 'outro bairro' : sel.value)); else t.push('Vou retirar no local');
    t.push('Pagamento: ' + pay() + (pay() === 'Dinheiro' && $('troco').value.trim() ? ' (troco para ' + $('troco').value.trim() + ')' : ''));
    if ($('obs').value.trim()) t.push('Obs.: ' + $('obs').value.trim());
    window.lxDemoSend(t.join('\n'));
  });

  render();
})();
