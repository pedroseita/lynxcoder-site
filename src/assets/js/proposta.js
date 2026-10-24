/* ===== /proposta#<token> — proposta individual =====
   O token vem no fragmento (#), que o browser não envia em Referer nem fica
   nos logs de acesso. O texto da proposta só existe na resposta da API. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var token = (location.hash || '').replace(/^#/, '');
  var previa = /[?&]previa=1/.test(location.search);
  var PLANOS = { essencial: 'Essencial', profissional: 'Profissional' };
  // Mudar só o # (ex.: colar outro link no mesmo separador) não recarrega a página.
  window.addEventListener('hashchange', function () { location.reload(); });

  function fmt(iso) {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fail(title, text) {
    $('loading').hidden = true;
    $('errorTitle').textContent = title;
    $('errorText').textContent = text;
    $('errorBox').hidden = false;
  }

  function showAccepted(a) {
    $('acceptBox').hidden = true;
    $('acceptedText').textContent = 'Aceita por ' + a.nome + ' em ' + fmt(a.em) + ', no plano ' + PLANOS[a.plano] +
      '. Em breve você recebe pelo WhatsApp o link de pagamento da implantação e o link do formulário digital.';
    $('acceptedBox').hidden = false;
  }

  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) {
    fail('Esta proposta não está disponível.', 'O link está incompleto. Abra o link exatamente como o recebeu, ou fale com a LynxCoder.');
    return;
  }

  fetch('/api/proposta/' + token + (previa ? '?previa=1' : ''), { credentials: 'omit', cache: 'no-store' })
    .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { res: res, d: d }; }); })
    .then(function (r) {
      if (!r.res.ok || !r.d.ok) {
        fail(r.res.status === 410 ? 'Esta proposta expirou.' : 'Esta proposta não está disponível.',
          r.d.message || 'Fale com a LynxCoder para receber uma proposta atualizada.');
        return;
      }
      // HTML gerado e escapado no servidor a partir do nosso modelo.
      $('doc').innerHTML = r.d.html;
      document.title = 'Proposta para ' + r.d.cliente.nome + ' — LynxCoder';
      $('loading').hidden = true;
      $('doc').hidden = false;
      $('printBtn').hidden = false;
      if (r.d.aceite) showAccepted(r.d.aceite); else $('acceptBox').hidden = false;
    })
    .catch(function () { fail('Sem ligação com o servidor.', 'Verifique a internet e recarregue a página.'); });

  $('printBtn').addEventListener('click', function () { window.print(); });

  $('acceptForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var plano = (document.querySelector('input[name=plano]:checked') || {}).value;
    var nome = $('aNome').value.trim();
    var concordo = $('aConcordo').checked;
    var err = $('acceptError');
    if (!plano) { err.textContent = 'Escolha um dos planos.'; return; }
    if (nome.length < 3) { err.textContent = 'Escreva o seu nome completo.'; $('aNome').focus(); return; }
    if (!concordo) { err.textContent = 'Marque que leu e aceita os termos desta proposta.'; return; }
    err.textContent = '';
    var btn = $('acceptBtn');
    btn.disabled = true;
    fetch('/api/proposta/' + token + '/aceitar', {
      method: 'POST', credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plano: plano, nome: nome, concordo: true })
    }).then(function (res) { return res.json().then(function (d) { return { res: res, d: d }; }); })
      .then(function (r) {
        if (!r.res.ok || !r.d.ok) throw new Error(r.d.message || 'Não foi possível registrar o aceite.');
        showAccepted(r.d.aceite);
        $('acceptedBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .catch(function (ex) { err.textContent = ex.message; btn.disabled = false; });
  });
})();
