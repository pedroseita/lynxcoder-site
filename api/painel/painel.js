/* Painel do cliente (painel.lynxsites.com.br) — vanilla JS, sem dependências.
   Tudo o que vem do servidor entra no DOM por textContent (nunca innerHTML). */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var email = '';

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(function (x) {
        if (x != null && x !== false) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
      });
    }
    return el;
  }
  var money = function (n) { return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var dia = function (d) { return d ? d.split('-').reverse().join('/') : ''; };
  var ref = function (r) { var p = r.split('-'); return MESES[Number(p[1]) - 1] + '/' + p[0].slice(2); };
  var quando = function (iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
  function fone(d) { d = String(d || ''); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d; }

  var toastTimer;
  function toast(msg, isError) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function api(method, url, body, isForm) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'X-LX': '1' } };
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) { showLogin(); throw new Error(data.message || 'Entre de novo.'); }
        if (!res.ok || data.ok === false) throw new Error(data.message || 'Não foi possível concluir. Tente de novo.');
        return data;
      });
    }, function () { throw new Error('Sem ligação à internet. Tente de novo.'); });
  }

  // ---------- entrar ----------
  function showLogin() {
    $('appView').hidden = true;
    $('loginView').hidden = false;
    $('emailForm').hidden = false;
    $('codeForm').hidden = true;
    $('fEmail').focus();
  }

  $('emailForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('emailBtn');
    email = $('fEmail').value.trim().toLowerCase();
    $('loginError').textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { $('loginError').textContent = 'Escreva um e-mail válido.'; return; }
    btn.disabled = true;
    api('POST', '/api/painel/codigo', { email: email }).then(function (r) {
      $('codeHint').textContent = r.message + ' Veja a caixa de entrada (e o spam) de ' + email + '.';
      $('emailForm').hidden = true;
      $('codeForm').hidden = false;
      $('fCode').value = '';
      $('fCode').focus();
    }).catch(function (err) { $('loginError').textContent = err.message; })
      .then(function () { btn.disabled = false; });
  });

  $('codeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('codeBtn');
    $('loginError').textContent = '';
    btn.disabled = true;
    api('POST', '/api/painel/entrar', { email: email, codigo: $('fCode').value }).then(load)
      .catch(function (err) { $('loginError').textContent = err.message; $('fCode').value = ''; $('fCode').focus(); })
      .then(function () { btn.disabled = false; });
  });
  $('fCode').addEventListener('input', function (e) {
    var d = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = d;
    if (d.length === 6) $('codeForm').requestSubmit();
  });
  $('otherEmail').addEventListener('click', function () { $('loginError').textContent = ''; showLogin(); });

  $('logoutBtn').addEventListener('click', function () {
    api('POST', '/api/painel/sair').catch(function () {}).then(showLogin);
  });

  // ---------- painel ----------
  function load() {
    return api('GET', '/api/painel/eu').then(function (r) {
      $('loginView').hidden = true;
      $('appView').hidden = false;
      render(r);
    }).catch(function () { /* 401 já mostrou o login */ });
  }

  function render(r) {
    $('negocio').textContent = r.negocio;
    document.title = r.negocio + ' · Painel LynxSites';

    // a página
    var sb = $('siteBox');
    sb.textContent = '';
    if (!r.endereco) sb.appendChild(h('p', { class: 'hint', text: 'A sua página ainda está a ser preparada. Avisamos quando estiver no ar.' }));
    else {
      var st = r.status === 'pausado' ? ['warn', 'Pausada'] : !r.site ? ['', 'A verificar…'] : r.site.ok ? ['ok', 'No ar'] : ['bad', 'Com problema: ' + (r.site.erro || 'não abriu')];
      sb.appendChild(h('div', { class: 'site-row' },
        h('div', null,
          h('span', { class: 'status ' + st[0], text: st[1] }),
          h('div', { class: 'site-addr', text: r.endereco }),
          r.site && r.site.em ? h('span', { class: 'muted small', text: 'Verificada em ' + quando(r.site.em) }) : null),
        h('a', { class: 'btn btn-ghost btn-sm', href: 'https://' + r.endereco, target: '_blank', rel: 'noopener' }, 'Abrir a página ↗')));
      if (r.site && !r.site.ok) sb.appendChild(h('p', { class: 'hint small', text: 'Já fomos avisados e estamos a verificar.' }));
    }

    // mensalidade
    var mb = $('mensBox');
    mb.textContent = '';
    if (r.mensalidade == null) mb.appendChild(h('p', { class: 'hint', text: 'Ainda sem mensalidade definida.' }));
    else {
      var sit = { em_dia: ['ok', 'Em dia'], vence: ['warn', 'Vence em breve'], atraso: ['bad', 'Em atraso'], pausado: ['warn', 'Pausada'] }[r.situacao] || ['', ''];
      mb.appendChild(h('div', { class: 'mens-top' },
        h('span', null, h('span', { class: 'mens-valor', text: money(r.mensalidade) }), h('span', { class: 'muted', text: ' /mês' })),
        sit[1] ? h('span', { class: 'status ' + sit[0], text: sit[1] }) : null));
      if (r.emAberto.length) {
        mb.appendChild(h('p', { class: 'hint', text: 'Em aberto: ' + r.emAberto.map(function (x) { return ref(x.referencia) + ' (venceu ' + dia(x.vencimento) + ')'; }).join(', ') + '.' }));
      } else if (r.proximo) {
        mb.appendChild(h('p', { class: 'hint', text: 'Próximo vencimento: ' + dia(r.proximo.vencimento) + '.' }));
      }
      if (r.cobranca && r.cobranca.pix) {
        var ta = h('textarea', { rows: '4', readonly: true, 'aria-label': 'Código PIX copia e cola' });
        ta.value = r.cobranca.pix.payload;
        var copy = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Copiar código PIX' });
        copy.addEventListener('click', function () {
          var ok = function () { copy.textContent = 'Copiado ✓'; setTimeout(function () { copy.textContent = 'Copiar código PIX'; }, 2500); };
          if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(ok, function () { ta.select(); });
          else { ta.select(); document.execCommand('copy'); ok(); }
        });
        mb.appendChild(h('div', { class: 'pix' },
          h('strong', { text: 'Pagar ' + ref(r.cobranca.referencia) + ' por PIX: ' + money(r.cobranca.valor) }),
          h('img', { src: r.cobranca.pix.qr, alt: 'QR Code do PIX', width: '200', height: '200' }),
          ta, copy,
          h('span', { class: 'muted small', text: 'Depois de pagar, a confirmação aparece aqui em até 1 dia útil.' })));
      }
      if (r.pagamentos.length) {
        mb.appendChild(h('ul', { class: 'meses', 'aria-label': 'Pagamentos' },
          r.emAberto.map(function (x) { return h('li', { class: 'aberto', text: ref(x.referencia) + ' em aberto' }); })
            .concat(r.pagamentos.map(function (p) { return h('li', { class: 'pago', title: 'Pago em ' + dia(p.pagoEm), text: '✓ ' + ref(p.referencia) }); }))));
      }
    }

    // alterações
    var ul = $('altList');
    ul.textContent = '';
    r.alteracoes.forEach(function (a) {
      ul.appendChild(h('li', null,
        h('div', { class: 'alt-top' },
          h('span', { text: quando(a.criadoEm) + (a.anexo ? ' · com foto' : '') }),
          h('span', { class: 'badge b-' + a.estado, text: a.estado === 'feita' ? 'Feito' + (a.feitaEm ? ' em ' + quando(a.feitaEm).slice(0, 10) : '') : 'A tratar' })),
        h('p', { class: 'alt-txt', text: a.texto }),
        a.resposta ? h('p', { class: 'alt-resp', text: a.resposta }) : null));
    });

    // dados
    var dl = $('dadosBox');
    dl.textContent = '';
    [['Negócio', r.negocio], ['Contacto', r.contato], ['E-mail', r.email], ['WhatsApp', fone(r.whatsapp)], ['Plano', r.plano === 'profissional' ? 'Profissional' : 'Essencial']]
      .forEach(function (x) { if (x[1]) { dl.appendChild(h('dt', { text: x[0] })); dl.appendChild(h('dd', { text: x[1] })); } });
  }

  // ---------- pedido de alteração ----------
  $('fFoto').addEventListener('change', function () { $('fotoNome').textContent = this.files[0] ? this.files[0].name : ''; });
  $('altForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var texto = $('fTexto').value.trim();
    if (texto.length < 5) { toast('Descreva a alteração que quer fazer.', true); $('fTexto').focus(); return; }
    var foto = $('fFoto').files[0];
    if (foto && foto.size > 8 * 1024 * 1024) { toast('Foto grande demais (máximo 8 MB).', true); return; }
    var fd = new FormData();
    fd.append('texto', texto);
    if (foto) fd.append('foto', foto);
    var btn = $('altBtn');
    btn.disabled = true;
    api('POST', '/api/painel/alteracoes', fd, true).then(function () {
      $('fTexto').value = ''; $('fFoto').value = ''; $('fotoNome').textContent = '';
      toast('Pedido enviado. Avisamos quando estiver feito.');
      return load();
    }).catch(function (err) { toast(err.message, true); })
      .then(function () { btn.disabled = false; });
  });

  load();
})();
