/* ===== Exemplo "Bia Nogueira" (/exemplos/manicure) =====
   Serviços com duração e preço, escolha de dia e horário livre (considerando
   a duração total), taxa por bairro e pedido de horário montado para o WhatsApp.
   Os links data-wa e o envio (WhatsApp real ou balão de demonstração) ficam
   com assets/js/exemplo.js (window.lxDemoSend). */
(function () {
  'use strict';
  var OPEN_DAYS = [2, 3, 4, 5, 6];          // terça a sábado
  var START = 9 * 60, END = 19 * 60, STEP = 30; // minutos
  var FREE_FROM = 150;
  var SERVICES = [
    { id: 'mao', name: 'Manicure', desc: 'Cutilagem e esmaltação', min: 45, price: 35 },
    { id: 'pe', name: 'Pedicure', desc: 'Cutilagem e esmaltação', min: 50, price: 40 },
    { id: 'pemao', name: 'Pé e mão', desc: 'Os dois juntos, com desconto', min: 90, price: 70 },
    { id: 'gel', name: 'Esmaltação em gel', desc: 'Dura até 3 semanas', min: 60, price: 80 },
    { id: 'along', name: 'Alongamento em gel', desc: 'Aplicação completa', min: 150, price: 180 },
    { id: 'manut', name: 'Manutenção do alongamento', desc: 'A cada 3 ou 4 semanas', min: 105, price: 110 },
    { id: 'blind', name: 'Blindagem', desc: 'Fortalece as unhas naturais', min: 60, price: 60 },
    { id: 'spa', name: 'Spa dos pés', desc: 'Esfoliação, hidratação e massagem', min: 40, price: 60 },
    { id: 'art', name: 'Nail art', desc: 'Decoração em até 4 unhas', min: 20, price: 20 }
  ];
  var BAIRROS = [['Savassi', 15], ['Funcionários', 15], ['Lourdes', 15], ['Sion', 15], ['Anchieta', 15], ['Cruzeiro', 15], ['Buritis', 20], ['Pampulha', 25], ['Outro bairro', null]];
  var WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var WDL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  var $ = function (id) { return document.getElementById(id); };
  var brl = function (v) { return 'R$ ' + v.toLocaleString('pt-BR'); };
  var hm = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  var dur = function (m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + 'h' : '') + (r ? (h ? ' ' : '') + r + ' min' : '') || '0 min'; };

  /* lista de preços */
  $('svcList').innerHTML = SERVICES.map(function (s) {
    return '<div><span><b>' + s.name + '</b><span>' + s.desc + ' · ' + dur(s.min) + '</span></span><strong>' + brl(s.price) + '</strong></div>';
  }).join('');

  /* seleção de serviços */
  $('pick').innerHTML = SERVICES.map(function (s) {
    return '<label class="opt"><input type="checkbox" name="svc" value="' + s.id + '"><span class="t"><b>' + s.name + '</b><small>' + dur(s.min) + '</small></span><em>' + brl(s.price) + '</em></label>';
  }).join('');
  var pemao = document.querySelector('input[value="pemao"]');
  // "Pé e mão" substitui manicure e pedicure avulsas
  $('pick').addEventListener('change', function (e) {
    var v = e.target.value;
    if (v === 'pemao' && e.target.checked) ['mao', 'pe'].forEach(function (id) { document.querySelector('input[value="' + id + '"]').checked = false; });
    if ((v === 'mao' || v === 'pe') && e.target.checked) pemao.checked = false;
    renderSlots(); update();
  });

  $('bairro').innerHTML = '<option value="">Selecione</option>' + BAIRROS.map(function (b) {
    return '<option value="' + b[0] + '">' + b[0] + (b[1] === null ? ' (consultar)' : ' (+ ' + brl(b[1]) + ')') + '</option>';
  }).join('');
  $('bairro').addEventListener('change', update);

  function chosen() {
    return Array.prototype.map.call(document.querySelectorAll('input[name="svc"]:checked'), function (i) {
      return SERVICES.find(function (s) { return s.id === i.value; });
    });
  }
  function totalMin() { return chosen().reduce(function (a, s) { return a + s.min; }, 0); }

  /* dias: os próximos 10, a partir de amanhã */
  var selDay = null, selSlot = null;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var dayList = [];
  for (var i = 1; dayList.length < 10 && i < 21; i++) { var d = new Date(today); d.setDate(d.getDate() + i); dayList.push(d); }
  // ocupação fictícia e estável por data (na versão real vem da agenda)
  function busy(d, m) { var k = d.getDate() * 31 + d.getMonth() * 7 + m / 30; return ((k * 2654435761) >>> 0) % 7 < 2; }
  $('days').innerHTML = dayList.map(function (d, i) {
    var open = OPEN_DAYS.indexOf(d.getDay()) > -1;
    return '<button type="button" class="day" data-i="' + i + '" aria-pressed="false"' + (open ? '' : ' disabled') + ' aria-label="' + WDL[d.getDay()] + ', ' + d.getDate() + ' de ' + MON[d.getMonth()] + (open ? '' : ', fechado') + '"><small>' + WD[d.getDay()] + '</small><b>' + d.getDate() + '</b><span>' + (open ? MON[d.getMonth()] : 'fechado') + '</span></button>';
  }).join('');
  $('days').addEventListener('click', function (e) {
    var b = e.target.closest('.day'); if (!b || b.disabled) return;
    selDay = dayList[+b.dataset.i]; selSlot = null;
    document.querySelectorAll('.day').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    renderSlots(); update();
  });

  function renderSlots() {
    var box = $('slots');
    if (!selDay) { box.innerHTML = ''; return; }
    var need = Math.max(totalMin(), STEP), html = '', free = 0;
    for (var m = START; m + need <= END; m += STEP) {
      var ok = true;
      for (var t = m; t < m + need; t += STEP) { if (busy(selDay, t)) { ok = false; break; } }
      if (ok) free++;
      html += '<button type="button" class="slot" data-m="' + m + '" aria-pressed="' + (selSlot === m) + '"' + (ok ? '' : ' disabled') + '>' + hm(m) + '</button>';
    }
    box.innerHTML = html;
    if (selSlot !== null && !box.querySelector('[data-m="' + selSlot + '"]:not(:disabled)')) selSlot = null;
    $('slotHint').textContent = free
      ? 'Horários riscados já estão ocupados. Os livres consideram a duração dos serviços escolhidos.'
      : 'Sem horários livres neste dia para a duração escolhida. Tente outro dia.';
  }
  $('slots').addEventListener('click', function (e) {
    var b = e.target.closest('.slot'); if (!b || b.disabled) return;
    selSlot = +b.dataset.m;
    document.querySelectorAll('.slot').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    update();
  });

  function calc() {
    var list = chosen(), sub = list.reduce(function (a, s) { return a + s.price; }, 0), mins = totalMin();
    var b = BAIRROS.find(function (x) { return x[0] === $('bairro').value; }), fee = 0, feeTxt = 'Escolha o bairro';
    if (b) { if (b[1] === null) feeTxt = 'A combinar'; else if (sub >= FREE_FROM) feeTxt = 'Grátis'; else { fee = b[1]; feeTxt = brl(fee); } }
    return { list: list, sub: sub, mins: mins, fee: fee, feeTxt: feeTxt, total: sub + fee };
  }
  function whenTxt() {
    if (!selDay) return null;
    var s = WDL[selDay.getDay()] + ', ' + selDay.getDate() + ' de ' + MON[selDay.getMonth()];
    return selSlot === null ? s + ' · escolha o horário' : s + ', às ' + hm(selSlot);
  }
  function update() {
    var c = calc();
    $('sumList').innerHTML = c.list.length
      ? c.list.map(function (s) { return '<li><span>' + s.name + '</span><span>' + brl(s.price) + '</span></li>'; }).join('')
      : '<li class="empty">Nenhum serviço escolhido.</li>';
    $('dur').textContent = dur(c.mins); $('fee').textContent = c.feeTxt; $('total').textContent = brl(c.total);
    $('when').textContent = whenTxt() || 'Escolha o dia e o horário';
  }

  $('send').addEventListener('click', function () {
    var c = calc(), miss = [], err = $('err');
    if (!c.list.length) miss.push('escolha um serviço');
    if (!selDay || selSlot === null) miss.push('escolha o dia e o horário');
    if (!$('nome').value.trim()) miss.push('informe seu nome');
    if (!$('bairro').value) miss.push('escolha o bairro');
    if (!$('end').value.trim()) miss.push('informe o endereço');
    if (miss.length) { err.textContent = 'Para enviar, ' + miss.join(', ') + '.'; err.classList.add('on'); return; }
    err.classList.remove('on');
    var t = ['*Pedido de horário*', '',
      'Nome: ' + $('nome').value.trim(),
      'Quando: ' + whenTxt() + ' (cerca de ' + dur(c.mins) + ')',
      'Endereço: ' + $('end').value.trim() + ' – ' + $('bairro').value, '',
      'Serviços:'].concat(c.list.map(function (s) { return '• ' + s.name + ' (' + brl(s.price) + ')'; }))
      .concat(['', 'Deslocamento: ' + c.feeTxt, '*Total: ' + brl(c.total) + '*']);
    if ($('obs').value.trim()) t.push('', 'Obs.: ' + $('obs').value.trim());
    window.lxDemoSend(t.join('\n'));
  });

  update();
})();
