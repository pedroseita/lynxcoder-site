/* ===== Exemplo "Hidro Ramos" (/exemplos/hidraulica) =====
   Triagem de urgência: o cliente escolhe o problema e a urgência, recebe
   orientações do que fazer enquanto espera e um valor de referência (com taxa
   de plantão à noite e ao domingo), e envia tudo pelo WhatsApp.
   Os links data-wa / data-tel e o envio (WhatsApp real ou balão de
   demonstração) ficam com assets/js/exemplo.js (window.lxDemoSend). */
(function () {
  'use strict';
  var VISIT = 80, PLANTAO = 80;
  var I = {
    drop: '<path d="M12 3c3.5 4.5 6 7.6 6 11a6 6 0 01-12 0c0-3.4 2.5-6.5 6-11z"/>',
    sink: '<path d="M4 11h16v2a6 6 0 01-6 6h-4a6 6 0 01-6-6z"/><path d="M12 11V5h4"/>',
    toilet: '<path d="M6 4h6v7H6z"/><path d="M4 11h14a4 4 0 01-4 4H8a4 4 0 01-4-4zM9 15l-1 5h7l-1-5"/>',
    tank: '<rect x="4" y="5" width="16" height="12" rx="2"/><path d="M4 11h16M8 17v3M16 17v3"/>',
    nowater: '<path d="M12 3c3.5 4.5 6 7.6 6 11a6 6 0 01-12 0c0-3.4 2.5-6.5 6-11z"/><path d="M4 4l16 16"/>',
    heater: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 15c0-2 2-2 2-4 0 2 2 2 2 4a2 2 0 01-4 0z"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    tap: '<path d="M5 9h9a3 3 0 013 3v2"/><path d="M9 9V6h3"/><path d="M17 17v.5M17 20v.5"/>',
    other: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.8.5-1.5 1-1.5 2M12 16.5v.5"/>'
  };
  var PROBLEMS = [
    { id: 'vaz', name: 'Vazamento', icon: 'drop', svc: 'Reparo de vazamento', from: 150,
      tips: ['Feche o registro geral do imóvel (geralmente perto do hidrômetro ou na área de serviço).', 'Se houver água perto de tomadas ou do quadro de luz, desligue o disjuntor.', 'Coloque panos e um balde para conter a água e fotografe o ponto do vazamento.'] },
    { id: 'pia', name: 'Pia ou ralo entupido', icon: 'sink', svc: 'Desentupimento de pia ou ralo', from: 150,
      tips: ['Pare de usar a pia ou o ralo para a água não voltar.', 'Não misture produtos químicos (soda cáustica com outros desentupidores pode reagir).', 'Se tiver, tente um desentupidor de borracha com um pouco de água parada.'] },
    { id: 'vaso', name: 'Vaso sanitário', icon: 'toilet', svc: 'Desentupimento ou reparo de vaso', from: 180,
      tips: ['Não dê descarga de novo se o vaso estiver entupido: pode transbordar.', 'Se a caixa acoplada não para de encher, feche o registro atrás do vaso.', 'Evite usar outro banheiro ligado à mesma tubulação até a visita.'] },
    { id: 'semagua', name: 'Sem água', icon: 'nowater', svc: 'Diagnóstico de falta de água', from: 0,
      tips: ['Pergunte aos vizinhos ou consulte a concessionária: pode ser falta de água na rua.', 'Confira se o registro geral está aberto.', "Se tem caixa d'água, veja se a boia está travada ou se a caixa está vazia."] },
    { id: 'caixa', name: "Caixa d'água", icon: 'tank', svc: "Limpeza ou reparo de caixa d'água", from: 250,
      tips: ['Se estiver transbordando, feche o registro de entrada da caixa.', 'Não use a água para beber se a caixa estiver aberta ou suja.', 'Anote a capacidade (litros) que aparece na caixa, se possível.'] },
    { id: 'aquec', name: 'Aquecedor ou cheiro de gás', icon: 'heater', svc: 'Reparo ou instalação de aquecedor', from: 200, gas: true,
      tips: ['Se o aquecedor não acende mas não há cheiro de gás, desligue-o da tomada e feche o registro de água quente.', 'Anote a marca e o modelo (etiqueta na lateral).'] },
    { id: 'caca', name: 'Infiltração ou conta alta', icon: 'search', svc: 'Caça-vazamento com geofone', from: 350,
      tips: ['Feche todas as torneiras e veja se o hidrômetro continua girando: é sinal de vazamento oculto.', 'Fotografe as manchas de umidade e as contas de água recentes.', 'Avise o vizinho, se a infiltração estiver no apartamento dele.'] },
    { id: 'torn', name: 'Torneira, registro ou chuveiro', icon: 'tap', svc: 'Troca ou reparo de torneira, registro ou chuveiro', from: 90,
      tips: ['Se estiver pingando sem parar, feche o registro daquele ambiente.', 'Se for chuveiro elétrico, desligue o disjuntor antes de mexer.', 'Se já comprou a peça nova, deixe-a separada para a visita.'] },
    { id: 'outro', name: 'Outro problema', icon: 'other', svc: 'A avaliar no local', from: 0, tips: [] }
  ];
  var BAIRROS = ['Tijuca', 'Vila Isabel', 'Grajaú', 'Maracanã', 'Andaraí', 'Méier', 'Botafogo', 'Flamengo', 'Laranjeiras', 'Catete', 'Copacabana', 'Outro bairro'];

  var $ = function (id) { return document.getElementById(id); };
  var brl = function (v) { return 'R$ ' + v.toLocaleString('pt-BR'); };
  var svg = function (k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[k] + '</svg>'; };

  /* plantão: noite (20h–7h) e domingo, pela hora de quem visita */
  var now = new Date(), h = now.getHours(), isPlantao = h >= 20 || h < 7 || now.getDay() === 0;
  $('liveTxt').textContent = isPlantao ? 'Plantão 24h · atendendo agora (taxa de plantão)' : 'Plantão 24h · atendendo agora';

  $('probs').innerHTML = PROBLEMS.map(function (p) { return '<button type="button" class="prob" data-p="' + p.id + '" aria-pressed="false">' + svg(p.icon) + '<b>' + p.name + '</b></button>'; }).join('');
  $('svc').innerHTML = PROBLEMS.filter(function (p) { return p.from > 0; }).map(function (p) { return '<article>' + svg(p.icon) + '<h3>' + p.svc + '</h3><p class="from">a partir de <b>' + brl(p.from) + '</b></p></article>'; }).join('');
  $('bairro').innerHTML = '<option value="">Selecione</option>' + BAIRROS.map(function (b) { return '<option>' + b + '</option>'; }).join('');
  $('chips').innerHTML = BAIRROS.slice(0, -1).map(function (b) { return '<li>' + b + '</li>'; }).join('');

  var sel = null, urg = 'hoje';
  $('probs').addEventListener('click', function (e) {
    var b = e.target.closest('.prob'); if (!b) return;
    sel = PROBLEMS.find(function (p) { return p.id === b.dataset.p; });
    document.querySelectorAll('.prob').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    render();
  });
  $('urg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    urg = b.dataset.u;
    document.querySelectorAll('#urg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    render();
  });

  function plantaoApplies() { return urg !== 'agendar' && isPlantao; }
  function render() {
    $('danger').classList.toggle('on', !!(sel && sel.gas));
    var tips = $('tips');
    if (!sel) tips.innerHTML = '<h3>Enquanto isso</h3><p class="none">Escolha o problema para ver o que fazer agora.</p>';
    else if (!sel.tips.length) tips.innerHTML = '<h3>Enquanto isso</h3><p class="none">Descreva o problema no campo ao lado e, se puder, mande uma foto no WhatsApp.</p>';
    else tips.innerHTML = '<h3>Enquanto isso, faça assim</h3><ol>' + sel.tips.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ol>';
    var pl = plantaoApplies();
    $('qPlantRow').hidden = !pl;
    $('call').classList.toggle('on', urg === 'agora');
    if (!sel) { $('qSum').textContent = 'Escolha o problema ao lado.'; $('qSvc').textContent = '—'; $('qTotal').textContent = '—'; return; }
    $('qSum').textContent = sel.name + ' · ' + ({ agora: 'urgente', hoje: 'para hoje', agendar: 'agendado' })[urg];
    $('qSvcL').textContent = sel.svc;
    if (sel.from > 0) {
      $('qSvc').textContent = 'a partir de ' + brl(sel.from);
      $('qTotal').textContent = 'a partir de ' + brl(sel.from + (pl ? PLANTAO : 0));
    } else {
      $('qSvc').textContent = 'no diagnóstico';
      $('qTotal').textContent = brl(VISIT + (pl ? PLANTAO : 0)) + ' de visita';
    }
  }

  $('send').addEventListener('click', function () {
    var miss = [], err = $('err');
    if (!sel) miss.push('escolha o problema');
    if (!$('bairro').value) miss.push('escolha o bairro');
    if (!$('nome').value.trim()) miss.push('informe seu nome');
    if (miss.length) { err.textContent = 'Para enviar, ' + miss.join(', ') + '.'; err.classList.add('on'); return; }
    err.classList.remove('on');
    var t = [(urg === 'agora' ? '🚨 *URGENTE* · ' : '') + '*' + sel.name + '*', '',
      'Nome: ' + $('nome').value.trim(),
      'Bairro: ' + $('bairro').value,
      'Urgência: ' + ({ agora: 'agora, está acontecendo', hoje: 'hoje', agendar: 'quero agendar' })[urg]];
    if ($('desc').value.trim()) t.push('Detalhes: ' + $('desc').value.trim());
    t.push('', 'Referência do site: ' + $('qTotal').textContent + (plantaoApplies() ? ' (com plantão)' : ''), '', 'Vou mandar fotos aqui na conversa.');
    window.lxDemoSend(t.join('\n'));
  });

  render();
})();
