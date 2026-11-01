// lynxsites.com.br/criar — compra de página em 6 passos (API em /api/criar).
// O rascunho é criado no passo 2; o id e o token ficam no localStorage para
// continuar mais tarde. Os preços mostrados aqui são só uma prévia: o servidor
// recalcula tudo no checkout.
(function () {
  'use strict';

  var API = '/api/criar';
  var KEY = 'lxCriar';
  var TOTAL = 6;
  var ATENDE = [['local', 'Local fixo'], ['domicilio', 'Vou até o cliente'], ['online', 'Online']];
  var DIAS = [['seg', 'S', 'Segunda'], ['ter', 'T', 'Terça'], ['qua', 'Q', 'Quarta'], ['qui', 'Q', 'Quinta'], ['sex', 'S', 'Sexta'], ['sab', 'S', 'Sábado'], ['dom', 'D', 'Domingo']];
  var PAGS = [['pix', 'PIX'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']];
  var PRECOS = [['fixo', 'Preço fixo'], ['a_partir_de', 'A partir de'], ['sob_orcamento', 'Sob orçamento']];
  var MAX_SERV = 8, MIN_FOTOS = 3, MAX_FOTOS = 5;

  var $ = function (id) { return document.getElementById(id); };
  var cfg = null;          // resposta de /catalogo
  var thumbs = {};         // nome da foto -> URL local (blob:) para a prévia
  var turnstileToken = '';
  var subOk = false, subTimer = null, subSeq = 0;
  var busy = false;

  var S = {
    step: 1, id: null, token: null, estado: 'rascunho',
    prof: '', tipo: '',
    negocio: { nome: '', whatsapp: '', cidade: '', email: '', atende: [], dias: ['seg', 'ter', 'qua', 'qui', 'sex'], inicio: '08:00', fim: '18:00' },
    servicos: [{ nome: '', preco: 'fixo', valor: '' }],
    pagamentos: [], extras: [], cor: '', subdominio: '',
    fotos: { retrato: null, trabalho: [] },
    plano: 'mensal', forma: 'pix', cobranca: null, totais: null, emiteNota: false,
  };

  // ---------- utilidades ----------

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  var cents = function (v) { return Math.round(Number(v || 0) * 100); };
  function money(v, noCents) {
    var n = Number(v || 0);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: noCents && n % 1 === 0 ? 0 : 2 });
  }
  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32);
  }
  function maskPhone(v) {
    var d = String(v).replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function maskDoc(v) {
    var d = String(v).replace(/\D/g, '').slice(0, 14);
    if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  }

  function save() {
    try {
      var copy = JSON.parse(JSON.stringify(S));
      delete copy.cobranca;
      localStorage.setItem(KEY, JSON.stringify(copy));
    } catch (e) { /* sem localStorage: continua a funcionar, só não retoma */ }
  }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) { /* ignora */ } }

  function api(method, url, body, isForm) {
    var headers = {};
    if (S.token) headers['x-token'] = S.token;
    if (body && !isForm) headers['content-type'] = 'application/json';
    return fetch(API + url, { method: method, headers: headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || data.ok === false) {
            var err = new Error(data.message || 'Não foi possível concluir. Verifique a ligação e tente de novo.');
            err.status = res.status; err.data = data;
            throw err;
          }
          return data;
        });
      }, function () { throw new Error('Sem ligação à internet. Tente de novo.'); });
  }

  function showError(msg) {
    var e = $('error');
    e.textContent = msg || '';
    e.hidden = !msg;
    if (msg) e.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- catálogo e preços (prévia; o servidor confirma) ----------

  function prof() { return cfg.catalogo.profissoes.filter(function (p) { return p.id === S.prof; })[0] || null; }
  function tipo() { return S.tipo ? cfg.catalogo.tipos[S.tipo] : null; }
  function extrasValidos() {
    var p = prof();
    return S.extras.filter(function (e) { return p && p.extras.indexOf(e) > -1 && cfg.catalogo.extras[e]; });
  }
  function calc() {
    var t = tipo();
    if (!t) return null;
    var ex = extrasValidos().map(function (e) { return cfg.catalogo.extras[e]; });
    var mensal = cents(t.mensal) + ex.reduce(function (s, e) { return s + cents(e.mensal); }, 0);
    var unicos = ex.reduce(function (s, e) { return s + cents(e.unico); }, 0);
    var anual = S.plano === 'anual' && cfg.catalogo.plano_anual.ativo;
    var meses = cfg.catalogo.plano_anual.meses_pagos;
    var rec = anual ? mensal * meses : mensal;
    var linhas = [{ descricao: 'Criação da página', valor: cents(t.implantacao) / 100 }];
    extrasValidos().forEach(function (id) {
      var e = cfg.catalogo.extras[id];
      if (cents(e.unico) > 0) linhas.push({ descricao: e.nome, valor: e.unico });
    });
    linhas.push({ descricao: anual ? 'Plano anual (12 meses, paga ' + meses + ')' : 'Primeira mensalidade', valor: rec / 100 });
    return { linhas: linhas, mensal: mensal / 100, unicos: unicos / 100, total: (cents(t.implantacao) + unicos + rec) / 100 };
  }

  // ---------- navegação ----------

  function go(step) {
    S.step = step;
    showError('');
    Array.prototype.forEach.call(document.querySelectorAll('.step'), function (s) { s.hidden = Number(s.getAttribute('data-step')) !== step; });
    $('loading').hidden = true;
    $('backBtn').hidden = step === 1 || step === 7;
    $('stepCount').textContent = step <= TOTAL ? 'Passo ' + step + ' de ' + TOTAL : '';
    $('progressBar').style.width = (Math.min(step, TOTAL) / TOTAL * 100) + '%';
    $('bar').hidden = step === 7;
    ({ 1: render1, 2: render2, 3: render3, 4: render4, 5: render5, 6: render6, 7: render7 })[step]();
    updateBar();
    save();
    window.scrollTo(0, 0);
    $('main').focus({ preventScroll: true });
  }

  function updateBar() {
    var sum = clear($('barSum'));
    var btn = $('nextBtn');
    var c = calc();
    btn.className = 'btn';
    btn.textContent = 'Continuar';
    if (S.step === 1) {
      var p = prof(), t = tipo();
      if (p && t) {
        sum.appendChild(h('span', null, p.nome + ' · ' + t.nome));
        sum.appendChild(h('b', { text: money(t.implantacao, true) + ' + ' + money(t.mensal) + '/mês' }));
      }
    } else if (S.step === 4 && c) {
      var n = extrasValidos().length;
      sum.appendChild(h('span', { text: n ? n + (n === 1 ? ' extra' : ' extras') : 'Nenhum extra' }));
      if (n) sum.appendChild(h('b', { text: money(c.unicos, true) + (c.mensal > tipo().mensal ? ' + ' + money(c.mensal - tipo().mensal) + '/mês' : '') }));
      btn.textContent = n ? 'Continuar com ' + n + (n === 1 ? ' extra' : ' extras') : 'Continuar sem extras';
    } else if (S.step === 6 && c) {
      btn.className = 'btn pay';
      btn.textContent = cfg.catalogo.pagamentos_ativos
        ? 'Pagar ' + money(c.total) + (S.forma === 'cartao' ? ' com cartão' : ' com PIX')
        : 'Pagamentos em breve';
    }
    btn.disabled = busy || (S.step === 6 && !cfg.catalogo.pagamentos_ativos);
  }

  function setBusy(v) {
    busy = v;
    updateBar();
  }

  // ---------- passo 1 ----------

  function render1() {
    var q = slug($('profSearch').value);
    var list = clear($('profList'));
    var shown = cfg.catalogo.profissoes.filter(function (p) { return !q || slug(p.nome).indexOf(q) > -1 || p.id === S.prof; });
    shown.forEach(function (p) {
      list.appendChild(h('button', {
        type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(p.id === S.prof), text: p.nome,
        onclick: function () {
          if (S.prof !== p.id) { S.prof = p.id; S.tipo = p.tipos.length === 1 ? p.tipos[0] : ''; }
          render1(); updateBar(); save();
        },
      }));
    });
    $('profEmpty').hidden = shown.length > 0;
    var p = prof();
    $('tipoBox').hidden = !p;
    if (!p) return;
    $('tipoTitle').textContent = p.tipos.length + (p.tipos.length === 1 ? ' tipo disponível' : ' tipos disponíveis') + ' para ' + p.nome;
    var tl = clear($('tipoList'));
    p.tipos.forEach(function (id) {
      var t = cfg.catalogo.tipos[id];
      tl.appendChild(h('button', {
        type: 'button', class: 'opt', role: 'radio', 'aria-checked': String(S.tipo === id),
        onclick: function () { S.tipo = id; render1(); updateBar(); save(); },
      }, [
        h('span', { class: 'box', 'aria-hidden': 'true' }),
        h('span', { class: 'body' }, [h('strong', { text: t.nome }), h('small', { text: t.descricao })]),
        h('span', { class: 'price' }, [money(t.implantacao, true), h('small', { text: '+ ' + money(t.mensal) + '/mês' })]),
      ]));
    });
  }

  // ---------- passo 2 ----------

  function toggleChips(container, items, selected, onChange, cls) {
    clear(container);
    items.forEach(function (it) {
      container.appendChild(h('button', {
        type: 'button', class: cls || 'chip', 'aria-pressed': String(selected.indexOf(it[0]) > -1), 'aria-label': it[2] || null, text: it[1],
        onclick: function () {
          var i = selected.indexOf(it[0]);
          if (i > -1) selected.splice(i, 1); else selected.push(it[0]);
          onChange();
        },
      }));
    });
  }

  function render2() {
    var f = $('form2'), n = S.negocio;
    f.nome.value = n.nome; f.whatsapp.value = maskPhone(n.whatsapp); f.cidade.value = n.cidade;
    f.email.value = n.email; f.inicio.value = n.inicio; f.fim.value = n.fim;
    toggleChips($('atendeList'), ATENDE, n.atende, function () { render2(); save(); });
    toggleChips($('diasList'), DIAS, n.dias, function () { render2(); save(); }, 'chip');
    if (cfg.turnstile && !S.id) loadTurnstile();
  }

  function read2() {
    var f = $('form2'), n = S.negocio;
    n.nome = f.nome.value.trim(); n.whatsapp = f.whatsapp.value.replace(/\D/g, ''); n.cidade = f.cidade.value.trim();
    n.email = f.email.value.trim().toLowerCase(); n.inicio = f.inicio.value; n.fim = f.fim.value;
  }

  function check2() {
    var f = $('form2'), n = S.negocio;
    var bad = function (el, msg) { el.setAttribute('aria-invalid', 'true'); el.focus(); return msg; };
    Array.prototype.forEach.call(f.querySelectorAll('input'), function (i) { i.removeAttribute('aria-invalid'); });
    if (n.nome.length < 2) return bad(f.nome, 'Informe o nome do negócio.');
    if (!/^[1-9][1-9](?:[2-5]\d{7}|9\d{8})$/.test(n.whatsapp)) return bad(f.whatsapp, 'Informe um WhatsApp com DDD.');
    if (n.cidade.length < 2) return bad(f.cidade, 'Informe a cidade.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(n.email)) return bad(f.email, 'Informe um e-mail válido.');
    if (!n.atende.length) return 'Escolha como atende.';
    if (!n.dias.length) return 'Escolha pelo menos um dia de atendimento.';
    if (!n.inicio || !n.fim || n.inicio >= n.fim) return bad(f.fim, 'O horário de início tem de ser antes do fim.');
    if (cfg.turnstile && !S.id && !turnstileToken) return 'Aguarde a verificação anti-robô terminar.';
    return '';
  }

  function loadTurnstile() {
    if (window.turnstile) { renderTurnstile(); return; }
    if (document.getElementById('tsScript')) return;
    window.lxTurnstileReady = renderTurnstile;
    document.head.appendChild(h('script', { id: 'tsScript', src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=lxTurnstileReady', async: true, defer: true }));
  }
  function renderTurnstile() {
    var box = $('turnstile');
    if (box.childNodes.length) return;
    window.turnstile.render(box, { sitekey: cfg.turnstile, callback: function (t) { turnstileToken = t; }, 'expired-callback': function () { turnstileToken = ''; } });
  }

  // ---------- passo 3 ----------

  function render3() {
    var list = clear($('servList'));
    S.servicos.forEach(function (s, i) {
      var nome = h('input', { class: 'nome', maxlength: '60', placeholder: 'Nome do serviço (ex.: Troca de tomada)', 'aria-label': 'Serviço ' + (i + 1) });
      nome.value = s.nome;
      nome.addEventListener('input', function () { s.nome = nome.value; save(); });
      var sel = h('select', { 'aria-label': 'Tipo de preço do serviço ' + (i + 1) }, PRECOS.map(function (p) { return h('option', { value: p[0], text: p[1] }); }));
      sel.value = s.preco;
      var val = h('input', { class: 'valor', inputmode: 'decimal', placeholder: 'R$', 'aria-label': 'Valor do serviço ' + (i + 1) });
      val.value = s.preco === 'sob_orcamento' ? '' : String(s.valor || '');
      val.disabled = s.preco === 'sob_orcamento';
      sel.addEventListener('change', function () { s.preco = sel.value; if (s.preco === 'sob_orcamento') s.valor = ''; render3(); save(); });
      val.addEventListener('input', function () { val.value = val.value.replace(/[^\d,.]/g, ''); s.valor = val.value; save(); });
      list.appendChild(h('div', { class: 'serv' }, [
        nome, sel, val,
        S.servicos.length > 1 ? h('button', { type: 'button', class: 'rm', 'aria-label': 'Remover serviço ' + (i + 1), text: '×', onclick: function () { S.servicos.splice(i, 1); render3(); save(); } }) : h('span'),
      ]));
    });
    var add = $('addServ');
    add.disabled = S.servicos.length >= MAX_SERV;
    add.textContent = '+ Adicionar serviço (' + S.servicos.length + ' de ' + MAX_SERV + ')';
    toggleChips($('pagList'), PAGS, S.pagamentos, function () { render3(); save(); });
  }

  function check3() {
    var filled = S.servicos.filter(function (s) { return s.nome.trim(); });
    if (!filled.length) return 'Adicione pelo menos um serviço.';
    for (var i = 0; i < filled.length; i++) {
      var s = filled[i];
      var v = Number(String(s.valor).replace(',', '.'));
      if (s.preco !== 'sob_orcamento' && !(v > 0)) return 'Informe o valor de "' + s.nome.trim() + '" ou escolha "Sob orçamento".';
    }
    return '';
  }

  // ---------- passo 4 ----------

  function render4() {
    var list = clear($('extraList'));
    var p = prof();
    p.extras.forEach(function (id) {
      var e = cfg.catalogo.extras[id];
      var on = S.extras.indexOf(id) > -1;
      var preco = [];
      if (cents(e.unico)) preco.push(money(e.unico, true));
      if (cents(e.mensal)) preco.push((preco.length ? '+ ' : '') + money(e.mensal) + '/mês');
      list.appendChild(h('button', {
        type: 'button', class: 'opt', role: 'checkbox', 'aria-checked': String(on),
        onclick: function () { if (on) S.extras.splice(S.extras.indexOf(id), 1); else S.extras.push(id); render4(); updateBar(); save(); },
      }, [
        h('span', { class: 'box', 'aria-hidden': 'true', text: on ? '✓' : '' }),
        h('span', { class: 'body' }, h('strong', { text: e.nome })),
        h('span', { class: 'price', text: preco.join(' ') || 'Incluído' }),
      ]));
    });
  }

  // ---------- passo 5 ----------

  function reduzir(file) {
    // Redesenha num canvas: reduz para 1600 px e remove os metadados (EXIF/GPS).
    if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) return Promise.reject(new Error('Escolha uma imagem (JPG, PNG, WebP ou HEIC).'));
    if (file.size > 25 * 1024 * 1024) return Promise.reject(new Error('Foto grande demais.'));
    var load = window.createImageBitmap
      ? createImageBitmap(file, { imageOrientation: 'from-image' })
      : new Promise(function (ok, ko) { var img = new Image(); img.onload = function () { ok(img); }; img.onerror = ko; img.src = URL.createObjectURL(file); });
    return load.then(function (img) {
      var max = 1600, w = img.width, hh = img.height, k = Math.min(1, max / Math.max(w, hh));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(hh * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (ok, ko) {
        c.toBlob(function (b) { if (b && b.size <= 8 * 1024 * 1024) ok(b); else ko(new Error('Não foi possível preparar a foto.')); }, 'image/jpeg', 0.85);
      });
    }, function () { throw new Error('Este formato de foto não abre neste navegador. Tente uma foto em JPG.'); });
  }

  function enviarFoto(file, tipoFoto, tile) {
    showError('');
    if (tile) tile.classList.add('busy');
    return reduzir(file).then(function (blob) {
      var fd = new FormData();
      fd.append('foto', blob, 'foto.jpg');
      return api('POST', '/rascunho/' + S.id + '/fotos?tipo=' + tipoFoto, fd, true).then(function (r) {
        thumbs[r.foto] = URL.createObjectURL(blob);
        S.fotos = r.fotos;
        save();
      });
    }).catch(function (err) { showError(err.message); }).then(function () { render5(); });
  }

  function apagarFoto(nome) {
    api('DELETE', '/rascunho/' + S.id + '/fotos/' + encodeURIComponent(nome)).then(function (r) {
      S.fotos = r.fotos; delete thumbs[nome]; save(); render5();
    }).catch(function (err) { showError(err.message); });
  }

  // Ao retomar: as fotos já enviadas vêm do servidor (com o token).
  function carregarThumb(nome) {
    if (thumbs[nome] !== undefined) return;
    thumbs[nome] = '';
    fetch(API + '/rascunho/' + S.id + '/fotos/' + encodeURIComponent(nome), { headers: { 'x-token': S.token } })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { if (b) { thumbs[nome] = URL.createObjectURL(b); if (S.step === 5) render5(); if (S.step === 6) render6(); } });
  }
  function bg(el, nome) {
    if (!nome) return el;
    carregarThumb(nome);
    if (thumbs[nome]) el.style.backgroundImage = 'url("' + thumbs[nome] + '")';
    return el;
  }

  function render5() {
    var av = $('retratoPrev');
    av.className = 'avatar' + (S.fotos.retrato ? ' has' : '');
    av.style.backgroundImage = '';
    bg(av, S.fotos.retrato);

    var grid = clear($('fotosGrid'));
    S.fotos.trabalho.forEach(function (nome, i) {
      grid.appendChild(bg(h('div', { class: 'tile' }, h('button', { type: 'button', class: 'rm', 'aria-label': 'Remover foto ' + (i + 1), text: '×', onclick: function () { apagarFoto(nome); } })), nome));
    });
    if (S.fotos.trabalho.length < MAX_FOTOS) {
      var input = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', 'aria-label': 'Adicionar fotos do trabalho' });
      var addTile = h('label', { class: 'tile-add' }, ['+', input]);
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files, 0, MAX_FOTOS - S.fotos.trabalho.length);
        var placeholder = h('div', { class: 'tile busy' });
        grid.insertBefore(placeholder, addTile);
        files.reduce(function (p, f) { return p.then(function () { return enviarFoto(f, 'trabalho'); }); }, Promise.resolve());
      });
      grid.appendChild(addTile);
    }
    $('fotosCount').textContent = S.fotos.trabalho.length + ' de ' + MAX_FOTOS;

    var cores = clear($('corList'));
    Object.keys(cfg.cores).forEach(function (id) {
      var sw = h('button', { type: 'button', class: 'sw', role: 'radio', 'aria-checked': String(S.cor === id), 'aria-label': 'Cor ' + id, onclick: function () { S.cor = id; render5(); save(); } });
      sw.style.backgroundColor = cfg.cores[id];
      cores.appendChild(sw);
    });
    cores.setAttribute('role', 'radiogroup');

    var si = $('subInput');
    if (!S.subdominio) S.subdominio = slug(S.negocio.nome);
    if (document.activeElement !== si) si.value = S.subdominio;
    if (!subTimer && !subOk) checkSub();
  }

  function checkSub() {
    var msg = $('subMsg');
    var nome = S.subdominio;
    subOk = false;
    clearTimeout(subTimer);
    if (!nome) { msg.textContent = ''; msg.className = ''; return; }
    msg.textContent = 'A verificar…'; msg.className = '';
    var seq = ++subSeq;
    subTimer = setTimeout(function () {
      subTimer = null;
      api('GET', '/subdominio?nome=' + encodeURIComponent(nome) + '&cidade=' + encodeURIComponent(S.negocio.cidade) + '&id=' + encodeURIComponent(S.id || '')).then(function (r) {
        if (seq !== subSeq) return;
        clear(msg);
        subOk = r.disponivel;
        msg.className = r.disponivel ? 'ok' : 'bad';
        if (r.disponivel) { msg.textContent = '✓ ' + nome + '.lynxsites.com.br está livre'; return; }
        msg.appendChild(document.createTextNode(r.motivo + ' '));
        if (r.sugestao) {
          msg.appendChild(h('button', { type: 'button', class: 'sug', text: 'Usar ' + r.sugestao, onclick: function () { S.subdominio = r.sugestao; $('subInput').value = r.sugestao; save(); checkSub(); } }));
        }
      }).catch(function (err) { if (seq === subSeq) { msg.textContent = err.message; msg.className = 'bad'; } });
    }, 350);
  }

  function check5() {
    if (!S.fotos.retrato) return 'Envie a sua foto (de rosto).';
    if (S.fotos.trabalho.length < MIN_FOTOS) return 'Envie pelo menos ' + MIN_FOTOS + ' fotos do seu trabalho.';
    if (!S.cor) return 'Escolha a cor principal da página.';
    if (!S.subdominio) return 'Escolha o endereço da sua página.';
    if (subTimer) return 'Aguarde a verificação do endereço.';
    if (!subOk) return 'Escolha um endereço livre para a sua página.';
    return '';
  }

  // ---------- passo 6 ----------

  function toggleGroup(el, items, current, onPick) {
    clear(el);
    items.forEach(function (it) {
      el.appendChild(h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(current === it.id), disabled: it.disabled || null,
        onclick: function () { onPick(it.id); },
      }, [it.label, it.note ? h('small', { text: it.note }) : null]));
    });
  }

  function render6() {
    var p = prof(), t = tipo(), c = calc();
    var rc = clear($('resumoCard'));
    rc.appendChild(bg(h('div', { class: 'mini' }), S.fotos.retrato));
    rc.appendChild(h('div', null, [
      h('strong', { text: S.negocio.nome }),
      h('small', { text: p.nome + ' · ' + t.nome }),
      h('small', { text: S.subdominio + '.lynxsites.com.br' }),
    ]));

    var pa = cfg.catalogo.plano_anual;
    var planos = [{ id: 'mensal', label: 'Mensal' }];
    if (pa.ativo) planos.push({ id: 'anual', label: 'Anual', note: pa.meses_pagos < 12 ? (12 - pa.meses_pagos) + (12 - pa.meses_pagos === 1 ? ' mês grátis' : ' meses grátis') : null });
    if (S.plano === 'anual' && !pa.ativo) S.plano = 'mensal';
    toggleGroup($('planoToggle'), planos, S.plano, function (id) { S.plano = id; render6(); updateBar(); save(); });

    var linhas = clear($('linhas'));
    c.linhas.forEach(function (l) { linhas.appendChild(h('div', { class: 'line' }, [h('span', { text: l.descricao }), h('span', { text: money(l.valor) })])); });
    linhas.appendChild(h('div', { class: 'line total' }, [h('span', { text: 'Total hoje' }), h('span', { text: money(c.total) })]));
    linhas.appendChild(h('p', { class: 'hint', text: 'Depois: ' + (S.plano === 'anual' ? money(c.mensal * pa.meses_pagos) + ' por ano' : money(c.mensal) + ' por mês') + '. Cancela quando quiser.' }));

    var formas = cfg.pagamento.formas;
    if (formas.indexOf(S.forma) < 0) S.forma = 'pix';
    toggleGroup($('formaToggle'), [
      { id: 'pix', label: 'PIX' },
      { id: 'cartao', label: 'Cartão', note: formas.indexOf('cartao') < 0 ? 'em breve' : null, disabled: formas.indexOf('cartao') < 0 },
    ], S.forma, function (id) { S.forma = id; render6(); updateBar(); save(); });

    $('payNotice').hidden = !!cfg.catalogo.pagamentos_ativos;
    $('comprovante').textContent = cfg.catalogo.emite_nota_fiscal ? 'Nota fiscal enviada por e-mail.' : 'Recibo de pagamento enviado por e-mail.';
  }

  function checkout() {
    var f = $('form6');
    var nome = f.nome.value.trim().replace(/\s+/g, ' ');
    var doc = f.documento.value.replace(/\D/g, '');
    Array.prototype.forEach.call(f.querySelectorAll('input'), function (i) { i.removeAttribute('aria-invalid'); });
    var bad = function (el, msg) { el.setAttribute('aria-invalid', 'true'); el.focus(); showError(msg); };
    if (nome.length < 5 || nome.indexOf(' ') < 0) return bad(f.nome, 'Informe o nome completo.');
    if (doc.length !== 11 && doc.length !== 14) return bad(f.documento, 'Informe um CPF ou CNPJ válido.');
    if (!f.termos.checked) return bad(f.termos, 'É preciso aceitar os termos e a política de privacidade.');
    var c = calc();
    setBusy(true);
    api('POST', '/rascunho/' + S.id + '/checkout', {
      plano: S.plano, forma: S.forma, nome: nome, documento: doc, termos: true, lembrete: f.lembrete.checked, totalEsperado: c.total,
    }).then(function (r) {
      S.estado = r.estado; S.cobranca = r.cobranca; S.totais = r.totais; S.emiteNota = r.emiteNota;
      save();
      if (r.cobranca && r.cobranca.url && S.forma === 'cartao') { location.href = r.cobranca.url; return; }
      try { sessionStorage.setItem(KEY + ':cobranca', JSON.stringify(r.cobranca)); } catch (e) { /* ignora */ }
      go(7);
    }).catch(function (err) {
      if (err.status === 409 && err.data && err.data.totais) {
        // Preços mudaram no painel: recarrega o catálogo e mostra o novo total.
        return loadCatalog().then(function () { render6(); updateBar(); showError(err.message); });
      }
      showError(err.message);
    }).then(function () { setBusy(false); });
  }

  // ---------- confirmação ----------

  function render7() {
    var body = clear($('doneBody'));
    var tl = clear($('timeline'));
    var pago = ['pago', 'em_revisao', 'publicado'].indexOf(S.estado) > -1;
    var cob = S.cobranca;
    if (!cob) { try { cob = JSON.parse(sessionStorage.getItem(KEY + ':cobranca') || 'null'); } catch (e) { cob = null; } }
    $('h7').textContent = pago ? 'Pagamento confirmado' : 'Pedido recebido';

    if (pago) {
      body.appendChild(h('p', { text: 'Obrigado! A sua página fica no ar em até 24 horas. Avisamos por WhatsApp e e-mail.' }));
    } else if (cob && cob.pix && cob.pix.payload) {
      var total = S.totais ? money(S.totais.total) : '';
      body.appendChild(h('p', { text: 'Falta só o pagamento' + (total ? ' de ' + total : '') + '. Pague por PIX com o QR Code ou o código abaixo.' }));
      var ta = h('textarea', { rows: '5', readonly: true, 'aria-label': 'Código PIX copia e cola' });
      ta.value = cob.pix.payload;
      var copy = h('button', { type: 'button', class: 'btn btn-ghost btn-copy', text: 'Copiar código PIX' });
      copy.addEventListener('click', function () {
        var done = function () { copy.textContent = 'Copiado ✓'; setTimeout(function () { copy.textContent = 'Copiar código PIX'; }, 2500); };
        if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); });
        else { ta.select(); document.execCommand('copy'); done(); }
      });
      body.appendChild(h('div', { class: 'pix' }, [
        cob.pix.qr ? h('img', { src: cob.pix.qr, alt: 'QR Code do PIX', width: '220', height: '220' }) : null,
        ta, copy,
      ]));
      body.appendChild(h('p', { class: 'hint', text: cfg.pagamento.gateway === 'manual'
        ? 'Assim que o pagamento cair, confirmamos e começamos a sua página. Pode fechar esta janela.'
        : 'A confirmação é automática, em poucos minutos. Pode fechar esta janela.' }));
    } else {
      body.appendChild(h('p', { text: 'Recebemos os seus dados. Vamos enviar as instruções de pagamento para o seu WhatsApp e e-mail em breve.' }));
    }

    [
      ['Dados recebidos', 'Agora', true],
      ['Pagamento', pago ? 'Confirmado' : 'A aguardar', pago],
      ['Revisão da sua página', 'Conferimos tudo antes de publicar', S.estado === 'em_revisao' || S.estado === 'publicado'],
      ['Página no ar', 'Em até 24 horas depois do pagamento', S.estado === 'publicado'],
    ].forEach(function (x) { tl.appendChild(h('li', { class: x[2] ? 'on' : '' }, [h('strong', { text: x[0] }), h('small', { text: x[1] })])); });

    if (pago) forget();
    if (!document.querySelector('.again')) {
      tl.parentNode.insertBefore(h('button', { type: 'button', class: 'btn btn-ghost again', text: 'Criar outra página', onclick: function () { forget(); location.href = '/criar'; } }), tl.nextSibling);
    }
  }

  // ---------- botão principal ----------

  function payload() {
    return {
      prof: S.prof, tipo: S.tipo, negocio: S.negocio,
      servicos: S.servicos.filter(function (s) { return s.nome.trim(); }),
      pagamentos: S.pagamentos, extras: extrasValidos(), cor: S.cor, subdominio: S.subdominio,
    };
  }

  function saveDraft(etapa) {
    var body = { etapa: etapa, dados: payload() };
    if (S.id) body.id = S.id; else body.turnstile = turnstileToken;
    return api('POST', '/rascunho', body).then(function (r) {
      if (r.token) { S.id = r.id; S.token = r.token; }
      S.estado = 'rascunho';
      save();
    });
  }

  function next() {
    if (busy) return;
    showError('');
    var step = S.step, err = '';
    if (step === 1) {
      if (!S.prof) err = 'Escolha a sua profissão.';
      else if (!S.tipo) err = 'Escolha o tipo de página.';
      if (err) return showError(err);
      return go(2);
    }
    if (step === 6) return cfg.catalogo.pagamentos_ativos ? checkout() : showError('Os pagamentos estão em breve.');
    if (step === 2) { read2(); err = check2(); }
    if (step === 3) err = check3();
    if (step === 5) err = check5();
    if (err) return showError(err);
    setBusy(true);
    saveDraft(step).then(function () { go(step + 1); }).catch(function (e) {
      if (e.status === 404 && S.id) { S.id = null; S.token = null; save(); }
      if (step === 2 && window.turnstile && cfg.turnstile) { turnstileToken = ''; window.turnstile.reset(); }
      showError(e.message);
    }).then(function () { setBusy(false); });
  }

  // ---------- arranque ----------

  function bind() {
    $('nextBtn').addEventListener('click', next);
    $('backBtn').addEventListener('click', function () { if (S.step > 1 && S.step < 7) go(S.step - 1); });
    $('profSearch').addEventListener('input', render1);
    $('addServ').addEventListener('click', function () { if (S.servicos.length < MAX_SERV) { S.servicos.push({ nome: '', preco: 'fixo', valor: '' }); render3(); save(); } });
    var f2 = $('form2');
    f2.addEventListener('input', function (e) {
      if (e.target.name === 'whatsapp') e.target.value = maskPhone(e.target.value);
      read2(); save();
    });
    f2.addEventListener('submit', function (e) { e.preventDefault(); next(); });
    var f6 = $('form6');
    f6.documento.addEventListener('input', function () { f6.documento.value = maskDoc(f6.documento.value); });
    f6.addEventListener('submit', function (e) { e.preventDefault(); next(); });
    $('retratoInput').addEventListener('change', function () {
      var file = this.files[0];
      this.value = '';
      if (file) enviarFoto(file, 'retrato');
    });
    $('subInput').addEventListener('input', function () {
      var v = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
      if (v !== this.value) this.value = v;
      S.subdominio = v; save(); checkSub();
    });
  }

  function loadCatalog() {
    return api('GET', '/catalogo').then(function (r) { cfg = r; });
  }

  function seller() {
    var v = cfg.vendedor || {};
    var parts = [v.nome, v.documento ? 'CPF/CNPJ ' + v.documento : '', v.endereco].filter(Boolean);
    $('seller').textContent = parts.join(' · ');
  }

  function restore() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    var q = new URLSearchParams(location.search);
    var qp = q.get('prof'), qt = q.get('tipo');
    if (saved && saved.id && saved.token) {
      Object.keys(S).forEach(function (k) { if (saved[k] !== undefined) S[k] = saved[k]; });
      return api('GET', '/rascunho/' + S.id).then(function (r) {
        S.fotos = r.fotos;
        S.estado = r.compra.estado;
        S.cobranca = r.compra.cobranca || null;
        S.totais = r.compra.totais || S.totais;
        if (S.estado !== 'rascunho') return go(7);
        if (!prof() || !tipo()) S.step = 1;
        go(Math.min(S.step || 1, 6));
      }).catch(function () { forget(); S.id = null; S.token = null; go(1); });
    }
    if (saved && !saved.id) Object.keys(S).forEach(function (k) { if (saved[k] !== undefined) S[k] = saved[k]; });
    var p = cfg.catalogo.profissoes.filter(function (x) { return x.id === qp; })[0];
    if (p) { S.prof = p.id; S.tipo = p.tipos.indexOf(qt) > -1 ? qt : (p.tipos.length === 1 ? p.tipos[0] : ''); }
    if (S.prof && !prof()) { S.prof = ''; S.tipo = ''; }
    go(1);
  }

  bind();
  loadCatalog().then(function () { seller(); restore(); }).catch(function (err) {
    $('loading').textContent = err.message + ' Recarregue a página para tentar de novo.';
  });
})();
