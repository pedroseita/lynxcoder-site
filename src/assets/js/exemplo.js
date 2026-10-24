/* ===== Páginas de exemplo do portfólio (/exemplos/*) =====
   Reutilizável: cada página define no <body>
     data-wa-phone="55DDNUMERO"  número do WhatsApp
     data-demo="1"               número fictício: em vez de abrir o WhatsApp,
                                 mostra a mensagem que o profissional receberia
   e marca os links com data-wa="texto" (WhatsApp) e data-tel (ligar).
   Formulário #quote: campos #qn (nome), #qb (bairro), #qs (serviço),
   #qm (detalhes) e #qc (consentimento). */
(function () {
  'use strict';

  var body = document.body;
  var PHONE = body.getAttribute('data-wa-phone') || '';
  var DEMO = body.getAttribute('data-demo') === '1';
  var dialog = document.getElementById('demoDialog');

  function waUrl(text) { return 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(text); }

  function showDemo(message) {
    if (!dialog) return;
    var msg = document.getElementById('ddMsg');
    var intro = document.getElementById('ddIntro');
    var title = document.getElementById('ddTitle');
    if (message) {
      title.textContent = 'Assim chegaria no WhatsApp';
      intro.textContent = 'Nesta página de exemplo o número é fictício. Num site real, a mensagem abaixo abriria já pronta no WhatsApp do profissional:';
      msg.textContent = message;
      msg.hidden = false;
    } else {
      title.textContent = 'Ligação direta';
      intro.textContent = 'Nesta página de exemplo o número é fictício. Num site real, este botão liga direto para o profissional com um toque no celular.';
      msg.hidden = true;
    }
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function send(text) {
    if (DEMO) showDemo(text);
    else window.open(waUrl(text), '_blank', 'noopener');
  }

  if (dialog) {
    document.getElementById('ddClose').addEventListener('click', function () { dialog.close(); });
    // clicar fora do cartão fecha
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-wa]'), function (a) {
    var text = a.getAttribute('data-wa');
    if (DEMO) {
      a.addEventListener('click', function (e) { e.preventDefault(); showDemo(text); });
    } else {
      a.href = waUrl(text);
      a.target = '_blank';
      a.rel = 'noopener';
    }
  });

  if (DEMO) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tel]'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); showDemo(null); });
    });
  }

  var form = document.getElementById('quote');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var $ = function (id) { return document.getElementById(id); };
      var n = $('qn').value.trim(), b = $('qb').value.trim(), s = $('qs').value, m = $('qm').value.trim();
      var c = $('qc').checked, err = $('qerr');
      if (!n || !b || !c) {
        err.classList.add('on');
        (n ? (b ? $('qc') : $('qb')) : $('qn')).focus();
        return;
      }
      err.classList.remove('on');
      send('Olá! Meu nome é ' + n + ' (' + b + ').\nServiço: ' + s + (m ? '\nDetalhes: ' + m : ''));
    });
  }
})();
