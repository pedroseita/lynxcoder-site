/* Exemplo do portfólio: dog walker (montador de plano semanal).
   Os links de WhatsApp e a janela da demonstração ficam com
   assets/js/exemplo.js (window.lxDemoSend). */
(function () {
  'use strict';

  var DURATIONS = [{ min: 30, price: 35 }, { min: 45, price: 45 }, { min: 60, price: 55 }];
  var BIG_EXTRA = 10, EXTRA_DOG = 0.6, GROUP_OFF = 0.2, WEEKS = 4, MAX_DOGS = 4;
  var FREQ_OFF = { 1: 0, 2: 0.05, 3: 0.10, 4: 0.12, 5: 0.15, 6: 0.18 }; // desconto por dias na semana
  var DAYS = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb'], ['dom', 'Dom']];
  var CLOSED = ['dom'];
  var BAIRROS = ['Pinheiros', 'Vila Madalena', 'Perdizes', 'Alto de Pinheiros', 'Sumaré', 'Jardim Paulista', 'Itaim Bibi', 'Outro bairro'];

  var $ = function (id) { return document.getElementById(id); };
  var brl = function (v) { return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); };
  var paw = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="12" cy="15" rx="4.5" ry="3.8"/><circle cx="6.5" cy="10" r="2"/><circle cx="10" cy="6.5" r="2"/><circle cx="14" cy="6.5" r="2"/><circle cx="17.5" cy="10" r="2"/></svg>';

  $('dur').innerHTML = DURATIONS.map(function (d, i) {
    return '<label><input type="radio" name="dur" value="' + d.min + '"' + (i === 1 ? ' checked' : '') + '>' + d.min + ' min<small>R$ ' + d.price + '</small></label>';
  }).join('');
  $('days').innerHTML = DAYS.map(function (d) {
    var c = CLOSED.indexOf(d[0]) > -1;
    return '<button type="button" class="day" data-d="' + d[0] + '" aria-pressed="false"' + (c ? ' disabled aria-label="' + d[1] + ', sem passeios"' : '') + '>' + d[1] + paw + '</button>';
  }).join('');
  $('bairro').innerHTML = '<option value="">Selecione</option>' + BAIRROS.map(function (b) { return '<option>' + b + '</option>'; }).join('');
  $('areas').innerHTML = BAIRROS.slice(0, -1).map(function (b) { return '<li>' + b + '</li>'; }).join('');

  // começa com 3 dias marcados para a demonstração
  ['seg', 'qua', 'sex'].forEach(function (d) { document.querySelector('.day[data-d="' + d + '"]').setAttribute('aria-pressed', 'true'); });

  var dogs = 1;
  function setDogs(n) {
    dogs = Math.max(1, Math.min(MAX_DOGS, n));
    $('dogs').textContent = dogs;
    $('dMinus').disabled = dogs === 1;
    $('dPlus').disabled = dogs === MAX_DOGS;
    calc();
  }
  $('dMinus').addEventListener('click', function () { setDogs(dogs - 1); });
  $('dPlus').addEventListener('click', function () { setDogs(dogs + 1); });
  $('days').addEventListener('click', function (e) {
    var b = e.target.closest('.day');
    if (!b || b.disabled) return;
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    calc();
  });
  document.querySelector('.plan').addEventListener('change', calc);

  var radio = function (n) { return document.querySelector('input[name="' + n + '"]:checked').value; };
  function state() {
    var d = DURATIONS.filter(function (x) { return x.min === +radio('dur'); })[0];
    var base = d.price + (radio('size') === 'G' ? BIG_EXTRA : 0);
    var perDog = base * (1 + EXTRA_DOG * (dogs - 1));
    var grp = radio('kind') === 'grp';
    if (grp) perDog *= 1 - GROUP_OFF;
    var days = Array.prototype.map.call(document.querySelectorAll('.day[aria-pressed="true"]'), function (b) { return b.dataset.d; });
    var off = FREQ_OFF[days.length] || 0;
    var per = perDog * (1 - off);
    var avulso = perDog * days.length * WEEKS;
    return { d: d, per: per, days: days, off: off, month: per * days.length * WEEKS, saved: avulso - per * days.length * WEEKS, grp: grp };
  }
  function dayNames(list) {
    return list.map(function (k) { return DAYS.filter(function (d) { return d[0] === k; })[0][1]; }).join(', ');
  }
  function calc() {
    var s = state();
    $('grpWarn').classList.toggle('on', s.grp);
    $('per').textContent = brl(s.per);
    $('wk').textContent = s.days.length;
    $('mo').textContent = s.days.length * WEEKS;
    $('month').innerHTML = brl(s.month) + '<small> /mês</small>';
    $('daysHint').textContent = s.days.length
      ? s.days.length + (s.days.length > 1 ? ' dias' : ' dia') + ' por semana' + (s.off ? ': ' + Math.round(s.off * 100) + '% de desconto em cada passeio.' : '. A partir de 2 dias, cada passeio fica mais barato.')
      : 'Escolha pelo menos um dia.';
    $('sumTxt').textContent = s.days.length
      ? dogs + (dogs > 1 ? ' cães' : ' cão') + ' · ' + s.d.min + ' min · ' + dayNames(s.days) + ' · ' + radio('period').split(' (')[0].toLowerCase()
      : 'Escolha os dias da semana.';
    var sv = $('save');
    if (s.saved >= 1) { sv.hidden = false; sv.textContent = 'Economia de ' + brl(s.saved) + ' por mês'; } else sv.hidden = true;
  }

  $('send').addEventListener('click', function () {
    var s = state(), miss = [], err = $('err');
    if (!s.days.length) miss.push('escolha os dias');
    if (!$('pet').value.trim()) miss.push('informe o nome do cão');
    if (!$('owner').value.trim()) miss.push('informe seu nome');
    if (!$('bairro').value) miss.push('escolha o bairro');
    if (miss.length) { err.textContent = 'Para enviar, ' + miss.join(', ') + '.'; err.classList.add('on'); return; }
    err.classList.remove('on');
    var sz = { P: 'pequeno', M: 'médio', G: 'grande' }[radio('size')];
    var extra = [$('breed').value.trim(), $('age').value.trim()].filter(Boolean).join(', ');
    var t = ['*Passeio de teste · ' + $('pet').value.trim() + '* 🐾', '',
      'Tutor(a): ' + $('owner').value.trim() + ' · ' + $('bairro').value,
      'Cão: ' + $('pet').value.trim() + (extra ? ' (' + extra + ')' : '') + ' · porte ' + sz,
      'Cães na casa: ' + dogs,
      'Sociável: ' + ($('social').value || 'não informado'), '',
      '*Plano desejado*',
      'Dias: ' + dayNames(s.days),
      'Período: ' + radio('period'),
      'Duração: ' + s.d.min + ' min · ' + (s.grp ? 'grupo pequeno' : 'individual'),
      'Valor: ' + brl(s.per) + ' por passeio · *' + brl(s.month) + '/mês*'];
    if ($('obs').value.trim()) t.push('', 'Obs.: ' + $('obs').value.trim());
    window.lxDemoSend(t.join('\n'));
  });

  setDogs(1);
})();
