/* Painel LynxCoder — vanilla JS, sem dependências.
   Todo o conteúdo vindo de clientes entra no DOM por textContent (nunca innerHTML). */
(function () {
  'use strict';

  var STATUS = {
    pedido: [['novo', 'Novo'], ['producao', 'Em produção'], ['publicado', 'Publicado'], ['arquivado', 'Arquivado']],
    mensagem: [['nova', 'Nova'], ['respondida', 'Respondida'], ['arquivada', 'Arquivada']],
    proposta: [['enviada', 'Enviada'], ['aberta', 'Aberta'], ['aceita', 'Aceita'], ['formulario', 'Formulário liberado'],
      ['concluida', 'Pedido recebido'], ['expirada', 'Expirada'], ['cancelada', 'Cancelada']],
    // situação calculada pelo servidor (mensalidades) ou a escolhida no painel
    cliente: [['em_dia', 'Em dia'], ['vence', 'Vence em breve'], ['atraso', 'Em atraso'], ['pausado', 'Pausado'], ['cancelado', 'Cancelado']]
  };
  var ARCHIVED = ['arquivado', 'arquivada', 'cancelada', 'expirada', 'concluida', 'cancelado'];
  var KIND = { pedido: 'Pedido', mensagem: 'Contato', proposta: 'Proposta', cliente: 'Cliente' };
  var PLANOS = { essencial: 'Essencial', profissional: 'Profissional' };
  var EXTRAS = { manutencao: 'Manutenção' };
  var PALETAS = { confianca: 'Confiança', natureza: 'Natureza', energia: 'Energia', elegante: 'Elegante', moderno: 'Moderno', claro: 'Claro', personalizada: 'Personalizada' };

  var state = { items: [], type: 'todos', status: 'abertos', current: null };
  var $ = function (id) { return document.getElementById(id); };

  // ---------- utilidades ----------
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
      var c = arguments[i];
      if (c == null || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) {
        if (x == null || x === false) return;
        el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
      });
    }
    return el;
  }
  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtPhone(d) {
    d = String(d || '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
  }
  function statusLabel(tipo, s) {
    var found = STATUS[tipo].filter(function (x) { return x[0] === s; })[0];
    return found ? found[1] : s;
  }
  function badge(tipo, s) { return h('span', { class: 'badge st-' + s, text: statusLabel(tipo, s) }); }

  var toastTimer;
  function toast(msg, isError) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ---------- API ----------
  function api(method, url, body) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'X-LX': '1' } };
    if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && url !== '/adm/login') { showLogin(data.message); throw new Error('401'); }
        if (!res.ok || data.ok === false) throw new Error(data.message || 'Erro ' + res.status);
        return data;
      });
    });
  }

  // ---------- login ----------
  function showLogin(msg) {
    $('appView').hidden = true;
    $('loginView').hidden = false;
    $('loginError').textContent = msg && msg !== '401' ? msg : '';
    $('lCode').value = '';
    ($('lUser').value ? $('lPass') : $('lUser')).focus();
  }
  function showApp(user) {
    $('loginView').hidden = true;
    $('appView').hidden = false;
    $('topUser').textContent = user;
    loadItems().then(route);
    loadBlog();
    loadMaint();
    loadFormOptions();
  }

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('loginBtn');
    btn.disabled = true;
    $('loginError').textContent = '';
    api('POST', '/adm/login', { user: $('lUser').value.trim(), password: $('lPass').value, code: $('lCode').value })
      .then(function (r) { $('lPass').value = ''; showApp(r.user); })
      .catch(function (err) {
        $('loginError').textContent = err.message;
        $('lCode').value = '';
        $('lCode').focus();
      })
      .then(function () { btn.disabled = false; });
  });
  $('lCode').addEventListener('input', function (e) {
    var d = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = d;
    if (d.length === 6 && $('lUser').value && $('lPass').value) $('loginForm').requestSubmit();
  });

  $('logoutBtn').addEventListener('click', function () {
    api('POST', '/adm/logout').catch(function () {}).then(function () { location.hash = ''; showLogin(); });
  });

  // ---------- lista ----------
  function loadItems() {
    return api('GET', '/adm/entradas').then(function (r) {
      state.items = r.items;
      $('statPedidos').textContent = r.contagem.pedidosNovos;
      $('statMensagens').textContent = r.contagem.mensagensNovas;
      $('statPropostas').textContent = r.contagem.propostasAceitas;
      $('statAtraso').textContent = r.contagem.clientesAtraso;
      $('statAtrasoL').textContent = 'em atraso de ' + r.contagem.clientesAtivos + (r.contagem.clientesAtivos === 1 ? ' cliente' : ' clientes');
      $('statAtraso').parentNode.classList.toggle('alerta', r.contagem.clientesAtraso > 0);
      renderList();
    }).catch(function (err) { if (err.message !== '401') toast(err.message, true); });
  }

  function renderList() {
    var list = $('items');
    list.textContent = '';
    var visible = state.items.filter(function (it) {
      if (state.type !== 'todos' && it.tipo !== state.type) return false;
      var arch = ARCHIVED.indexOf(it.status) !== -1;
      if (state.status === 'testes') return !!it.teste;
      if (state.status === 'todos') return true;
      if (it.teste) return false;
      if (state.status === 'abertos') return !arch;
      if (state.status === 'arquivados') return arch;
      return true;
    });
    visible.forEach(function (it) {
      var active = state.current && state.current.tipo === it.tipo && state.current.id === it.id;
      list.appendChild(h('li', null, h('button', {
        type: 'button',
        class: 'item' + (active ? ' active' : ''),
        onclick: function () { location.hash = '#/' + it.tipo + '/' + it.id; }
      },
        h('span', { class: 'item-top' },
          h('span', { class: 'kind', text: KIND[it.tipo] }),
          h('span', { class: 'item-title', text: it.titulo }),
          it.teste ? h('span', { class: 'badge st-teste', text: 'Teste' }) : null,
          badge(it.tipo, it.status)),
        h('span', { class: 'item-sub', text: it.subtitulo }),
        h('span', { class: 'item-top' },
          h('span', { class: 'item-detail', text: it.detalhe }),
          h('span', { class: 'item-date', text: fmtDate(it.recebidoEm) }))
      )));
    });
    $('emptyList').hidden = visible.length > 0;
    $('clearTests').hidden = state.status !== 'testes' || !visible.length;
    $('newClient').hidden = state.type !== 'cliente';
  }

  $('typeTabs').addEventListener('click', function (e) {
    var t = e.target.getAttribute('data-type');
    if (!t) return;
    state.type = t;
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-selected', String(b === e.target));
    });
    renderList();
  });
  $('statusFilter').addEventListener('change', function (e) { state.status = e.target.value; renderList(); });
  $('refreshBtn').addEventListener('click', function () { loadItems().then(function () { toast('Atualizado'); }); });

  // ---------- blog ----------
  function loadBlog() {
    api('GET', '/adm/blog').then(function (r) {
      var ul = $('blogList');
      ul.textContent = '';
      if (!r.posts.length) { ul.appendChild(h('li', { class: 'muted', text: 'Ainda sem posts. Escreva o primeiro!' })); return; }
      r.posts.slice(0, 5).forEach(function (p) {
        ul.appendChild(h('li', null,
          h('a', { href: '#/blog/' + p.id, text: p.titulo }),
          h('span', { class: 'date', text: p.status === 'publicado' ? 'Publicado em ' + fmtDate(p.publicadoEm) : 'Rascunho · ' + fmtDate(p.atualizadoEm) })));
      });
    }).catch(function () {});
  }

  // ---------- detalhe ----------
  function showDetail() {
    $('detailEmpty').hidden = true;
    $('detail').hidden = false;
    window.scrollTo(0, 0);
  }

  function route() {
    var layout = document.querySelector('.layout');
    var bm = /^#\/blog(?:\/([\w-]+))?$/.exec(location.hash);
    if (bm) {
      state.current = null;
      layout.classList.add('showing-detail');
      renderList();
      (!bm[1] ? api('GET', '/adm/blog').then(renderBlogLista)
        : bm[1] === 'novo' ? Promise.resolve(renderPostEditor(null))
        : api('GET', '/adm/blog/posts/' + bm[1]).then(function (r) { renderPostEditor(r.post); }))
        .then(showDetail)
        .catch(function (err) { if (err.message !== '401') { toast(err.message, true); location.hash = '#/blog'; } });
      return;
    }
    var nc = /^#\/novo-cliente(?:\/([\w-]+))?$/.exec(location.hash);
    if (nc) {
      state.current = null;
      layout.classList.add('showing-detail');
      renderList();
      (nc[1] ? api('GET', '/adm/clientes/sugestao/' + nc[1]).then(function (r) { return r.ficha; }) : Promise.resolve(null))
        .then(function (ficha) { renderClienteForm(ficha, null); showDetail(); })
        .catch(function (err) { if (err.message !== '401') toast(err.message, true); });
      return;
    }
    if (location.hash === '#/nova-proposta' || /^#\/config(\/(texto|formulario))?$/.test(location.hash)) {
      state.current = null;
      layout.classList.add('showing-detail');
      renderList();
      var view = location.hash;
      var url = view === '#/config/texto' ? '/adm/proposta-texto' : (view === '#/config/formulario' ? '/adm/formulario' : '/adm/config');
      api('GET', url).then(function (r) {
        if (view === '#/config') renderConfig(r);
        else if (view === '#/config/texto') renderTexto(r);
        else if (view === '#/config/formulario') renderFormulario(r);
        else renderNovaProposta(r);
        showDetail();
      }).catch(function (err) { if (err.message !== '401') toast(err.message, true); });
      return;
    }
    var m = /^#\/(pedido|mensagem|proposta|cliente)\/([\w-]+)$/.exec(location.hash);
    if (!m) {
      state.current = null;
      layout.classList.remove('showing-detail');
      $('detail').hidden = true;
      $('detailEmpty').hidden = false;
      renderList();
      return;
    }
    state.current = { tipo: m[1], id: m[2] };
    layout.classList.add('showing-detail');
    renderList();
    var url = URLS[m[1]] + m[2];
    api('GET', url).then(function (r) {
      if (m[1] === 'pedido') renderPedido(m[2], r);
      else if (m[1] === 'mensagem') renderMensagem(r.mensagem);
      else if (m[1] === 'cliente') renderCliente(r.cliente, r.formas);
      else renderProposta(r.proposta);
      showDetail();
    }).catch(function (err) {
      if (err.message === '401') return;
      toast(err.message, true);
      location.hash = '';
    });
  }
  window.addEventListener('hashchange', route);

  var URLS = { pedido: '/adm/pedidos/', mensagem: '/adm/mensagens/', proposta: '/adm/propostas/', cliente: '/adm/clientes/', post: '/adm/blog/posts/' };

  function backLink() {
    return h('button', { type: 'button', class: 'btn btn-ghost btn-sm back', onclick: function () { location.hash = ''; } }, '← Voltar');
  }

  function statusSelect(tipo, id, current) {
    var sel = h('select', { 'aria-label': 'Situação' });
    STATUS[tipo].forEach(function (s) {
      var o = h('option', { value: s[0], text: s[1] });
      if (s[0] === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      var url = (tipo === 'pedido' ? '/adm/pedidos/' : '/adm/mensagens/') + id;
      api('PATCH', url, { status: sel.value }).then(function () {
        toast('Situação: ' + statusLabel(tipo, sel.value));
        loadItems();
      }).catch(function (err) { toast(err.message, true); });
    });
    return sel;
  }

  function deleteButton(tipo, id) {
    var armed = false, timer;
    var btn = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, 'Excluir');
    btn.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        btn.classList.add('confirm');
        btn.textContent = 'Confirmar exclusão';
        timer = setTimeout(function () { armed = false; btn.classList.remove('confirm'); btn.textContent = 'Excluir'; }, 5000);
        return;
      }
      clearTimeout(timer);
      api('DELETE', URLS[tipo] + id).then(function () {
        toast({ pedido: 'Pedido excluído, com todos os ficheiros', mensagem: 'Mensagem excluída', proposta: 'Proposta excluída', cliente: 'Cliente excluído, com os pagamentos registados', post: 'Post excluído' }[tipo]);
        location.hash = tipo === 'post' ? '#/blog' : '';
        if (tipo === 'post') loadBlog(); else loadItems();
      }).catch(function (err) { toast(err.message, true); });
    });
    return btn;
  }

  function notesCard(tipo, id, admin) {
    var ta = h('textarea', { 'aria-label': 'Notas internas', placeholder: 'Notas só para você: o que falta, o que combinou com o cliente…' });
    ta.value = admin.notas || '';
    var info = h('span', { class: 'muted', text: admin.atualizadoEm ? 'Atualizado em ' + fmtDate(admin.atualizadoEm) : '' });
    var save = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Salvar notas');
    save.addEventListener('click', function () {
      api('PATCH', URLS[tipo] + id, { notas: ta.value }).then(function (r) {
        info.textContent = 'Atualizado em ' + fmtDate(r.admin.atualizadoEm);
        toast('Notas salvas');
      }).catch(function (err) { toast(err.message, true); });
    });
    return h('section', { class: 'card wide' }, h('h2', { text: 'Notas internas' }), ta, h('div', { class: 'notes-row' }, info, save));
  }

  function dl(rows) {
    var el = h('dl');
    rows.forEach(function (r) {
      if (r[1] == null || r[1] === '' || r[1] === false) return;
      el.appendChild(h('dt', { text: r[0] }));
      el.appendChild(h('dd', null, r[1]));
    });
    return el;
  }

  function openLightbox(src, alt) {
    $('lightboxImg').src = src;
    $('lightboxImg').alt = alt;
    $('lightbox').hidden = false;
    $('lightboxClose').focus();
  }
  function closeLightbox() { $('lightbox').hidden = true; $('lightboxImg').src = 'data:,'; }
  $('lightboxClose').addEventListener('click', closeLightbox);
  $('lightbox').addEventListener('click', function (e) { if (e.target === this) closeLightbox(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('lightbox').hidden) closeLightbox(); });

  function renderPedido(id, r) {
    var d = r.dados, ng = d.negocio, admin = r.admin;
    var fileUrl = function (f) { return '/adm/pedidos/' + encodeURIComponent(id) + '/ficheiros/' + encodeURIComponent(f); };
    var wa = 'https://wa.me/55' + ng.whatsapp;
    var mail = 'mailto:' + ng.email + '?subject=' + encodeURIComponent('A sua página LynxCoder — ' + ng.nome);

    var redes = [];
    if (ng.redes.instagram) redes.push(h('a', { class: 'link', href: 'https://instagram.com/' + encodeURIComponent(ng.redes.instagram), target: '_blank', rel: 'noopener noreferrer', text: 'Instagram @' + ng.redes.instagram }));
    if (ng.redes.tiktok) redes.push(h('a', { class: 'link', href: 'https://www.tiktok.com/@' + encodeURIComponent(ng.redes.tiktok), target: '_blank', rel: 'noopener noreferrer', text: 'TikTok @' + ng.redes.tiktok }));
    if (/^https?:\/\//i.test(ng.redes.facebook)) redes.push(h('a', { class: 'link', href: ng.redes.facebook, target: '_blank', rel: 'noopener noreferrer', text: 'Facebook' }));
    else if (ng.redes.facebook) redes.push('Facebook: ' + ng.redes.facebook);
    if (/^https?:\/\//i.test(ng.redes.youtube)) redes.push(h('a', { class: 'link', href: ng.redes.youtube, target: '_blank', rel: 'noopener noreferrer', text: 'YouTube' }));
    else if (ng.redes.youtube) redes.push('YouTube: ' + ng.redes.youtube);
    var redesEl = redes.length ? h('span', null, redes.reduce(function (acc, x, i) { if (i) acc.push(' · '); acc.push(x); return acc; }, [])) : null;

    var swatch = function (c) { var s = h('span', { class: 'swatch' }); s.style.backgroundColor = c; return s; };

    var fotos = (d.ficheiros || []).filter(function (f) { return /^foto-/.test(f); });
    var outros = (d.ficheiros || []).filter(function (f) { return !/^foto-/.test(f); });
    var thumb = function (f, label, extraClass) {
      return h('div', null,
        h('button', { type: 'button', class: extraClass || '', 'aria-label': 'Ampliar ' + label, onclick: function () { openLightbox(fileUrl(f), label); } },
          h('img', { src: fileUrl(f), alt: label, loading: 'lazy' })),
        h('p', { class: 'photo-label', text: label }));
    };

    var el = $('detail');
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(h('div', { class: 'd-head' },
      h('div', null,
        h('h1', { text: ng.nome }),
        h('p', { class: 'd-meta', text: 'Pedido ' + id + ' · recebido em ' + fmtDate(d.recebidoEm) }),
        d.editadoEm ? h('span', { class: 'edited-note', text: 'Respostas corrigidas no painel em ' + fmtDate(d.editadoEm) + ' (o original fica em dados.original.json)' }) : null,
        d.propostaId ? h('a', { class: 'link', href: '#/proposta/' + d.propostaId }, 'Ver a proposta deste cliente →') : null,
        r.clienteId ? h('a', { class: 'link', href: '#/cliente/' + r.clienteId }, ' · Ver a ficha de cliente →') : null),
      h('div', { class: 'd-actions' },
        statusSelect('pedido', id, admin.status),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { editarPedido(id, d); } }, 'Editar respostas'),
        r.clienteId ? null : h('a', { class: 'btn btn-ghost btn-sm', href: '#/novo-cliente/' + id, title: 'Quando a página for ao ar: ficha com mensalidade e pagamentos' }, 'Tornar cliente'),
        h('a', { class: 'btn btn-primary btn-sm', href: wa, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp'),
        h('a', { class: 'btn btn-ghost btn-sm', href: mail }, 'E-mail'),
        h('a', { class: 'btn btn-ghost btn-sm', href: '/adm/pedidos/' + encodeURIComponent(id) + '/zip' }, 'Baixar tudo (ZIP)'),
        deleteButton('pedido', id))));

    el.appendChild(h('div', { class: 'd-grid' },
      h('section', { class: 'card' }, h('h2', { text: 'Negócio' }), dl([
        ['Especialidade', ng.especialidade],
        ['Cidade', ng.cidade],
        ['Atendimento', ng.area],
        ['WhatsApp', fmtPhone(ng.whatsapp)],
        ['E-mail', ng.email],
        ['Redes', redesEl]
      ])),
      h('section', { class: 'card' }, h('h2', { text: 'Plano e endereço' }), dl([
        ['Plano', d.plano.tipo === 'essencial' ? 'Essencial' : 'Profissional'],
        ['Endereço', d.plano.tipo === 'essencial' ? d.plano.subdominio + '.lynxsites.com.br' : d.plano.dominio],
        ['Domínio', d.plano.tipo === 'profissional' ? (d.plano.dominioRegistrado ? 'Já registrado' : 'Ainda vai registrar') : ''],
        ['Extras', (d.plano.extras || []).map(function (x) { return EXTRAS[x] || x; }).join(', ')],
        ['Cores', h('span', null, swatch(d.visual.corPrincipal), d.visual.corPrincipal.toUpperCase() + '  ', swatch(d.visual.corDestaque), d.visual.corDestaque.toUpperCase())],
        ['Paleta', PALETAS[d.visual.paleta] || d.visual.paleta]
      ])),
      h('section', { class: 'card' }, h('h2', { text: 'Serviços' }),
        h('ol', { class: 'services' }, d.servicos.map(function (s) {
          return h('li', null, s.nome, s.descricao ? h('span', { text: ' — ' + s.descricao }) : null);
        }))),
      d.sobre.historia ? h('section', { class: 'card' }, h('h2', { text: 'História' }), h('p', { class: 'prose', text: d.sobre.historia })) : null,
      d.depoimentos.length ? h('section', { class: 'card' }, h('h2', { text: 'Depoimentos' }), d.depoimentos.map(function (t) {
        return h('blockquote', { class: 'quote' }, h('p', { class: 'prose', text: '"' + t.texto + '"' }), h('cite', { text: t.nome || 'Cliente' }));
      })) : null,
      outros.length ? h('section', { class: 'card' }, h('h2', { text: 'Logotipo e foto pessoal' }),
        h('div', { class: 'photos' }, outros.map(function (f) {
          return /^logo/.test(f) ? thumb(f, 'Logotipo', 'logo-thumb') : thumb(f, 'Foto pessoal');
        }))) : null,
      h('section', { class: 'card wide' }, h('h2', { text: 'Fotos de trabalhos (' + fotos.length + ')' }),
        h('div', { class: 'photos' }, fotos.map(function (f, i) { return thumb(f, 'Foto ' + (i + 1)); }))),
      notesCard('pedido', id, admin)
    ));
  }

  // Corrige as respostas que o cliente enviou (fotos e logotipo não mudam aqui).
  function editarPedido(id, d) {
    var ng = d.negocio, rd = ng.redes || {};
    var form = h('form', { class: 'form-grid', novalidate: true });
    var add = function (x) { form.appendChild(x); };
    add(h('h2', { class: 'wide form-group', text: 'Negócio' }));
    add(formField('Nome do negócio', textInput('nome', ng.nome, { maxlength: '80' })));
    add(formField('Especialidade', textInput('especialidade', ng.especialidade, { maxlength: '100' })));
    add(formField('Cidade', textInput('cidade', ng.cidade, { maxlength: '80' })));
    add(formField('Área de atendimento', textInput('area', ng.area, { maxlength: '120' })));
    add(formField('WhatsApp (DDD + número)', textInput('whatsapp', ng.whatsapp, { maxlength: '20', inputmode: 'tel' })));
    add(formField('E-mail', textInput('email', ng.email, { type: 'email', maxlength: '120' })));
    add(formField('Instagram (sem @)', textInput('instagram', rd.instagram, { maxlength: '40' })));
    add(formField('TikTok (sem @)', textInput('tiktok', rd.tiktok, { maxlength: '40' })));
    add(formField('Facebook', textInput('facebook', rd.facebook, { maxlength: '200' })));
    add(formField('YouTube', textInput('youtube', rd.youtube, { maxlength: '200' })));

    add(h('h2', { class: 'wide form-group', text: 'Plano e endereço' }));
    var tipo = h('select', { name: 'tipo' }, h('option', { value: 'essencial', text: 'Essencial' }), h('option', { value: 'profissional', text: 'Profissional' }));
    tipo.value = d.plano.tipo;
    add(formField('Plano', tipo));
    add(formField('Endereço (Essencial)', textInput('subdominio', d.plano.subdominio, { maxlength: '40' }), 'Só o nome: fica nome.lynxsites.com.br'));
    add(formField('Domínio (Profissional)', textInput('dominio', d.plano.dominio, { maxlength: '100', placeholder: 'seunome.com.br' })));
    var registrado = h('input', { type: 'checkbox', name: 'dominioRegistrado' });
    registrado.checked = !!d.plano.dominioRegistrado;
    add(h('label', { class: 'f check-row' }, registrado, h('span', { text: 'Domínio já registrado' })));
    var extrasConhecidos = Object.keys(EXTRAS).map(function (k) { return { id: k, label: EXTRAS[k] }; });
    (d.plano.extras || []).forEach(function (x) { if (!EXTRAS[x]) extrasConhecidos.push({ id: x, label: x }); });
    var extras = checkList(extrasConhecidos, d.plano.extras || []);
    add(groupField('Extras', extras.el, null, true));

    add(h('h2', { class: 'wide form-group', text: 'Cores' }));
    var paleta = h('select', { name: 'paleta' }, Object.keys(PALETAS).map(function (k) { return h('option', { value: k, text: PALETAS[k] }); }));
    if (!PALETAS[d.visual.paleta]) paleta.appendChild(h('option', { value: d.visual.paleta, text: d.visual.paleta }));
    paleta.value = d.visual.paleta;
    add(formField('Paleta escolhida', paleta));
    var c1 = h('input', { type: 'color', 'aria-label': 'Cor principal' }); c1.value = d.visual.corPrincipal;
    var c2 = h('input', { type: 'color', 'aria-label': 'Cor de destaque' }); c2.value = d.visual.corDestaque;
    add(groupField('Cor principal e de destaque', h('div', { class: 'color-row' }, c1, c2)));

    add(h('h2', { class: 'wide form-group', text: 'Serviços' }));
    var servicos = rowsEditor(d.servicos, [{ key: 'nome', ph: 'Nome do serviço', max: 60 }, { key: 'descricao', ph: 'Descrição (opcional)', max: 160 }], 10, '+ Serviço');
    add(groupField('Do mais procurado para o menos', servicos.el, null, true));

    add(h('h2', { class: 'wide form-group', text: 'Sobre e depoimentos' }));
    add(wideField('História', textArea('historia', d.sobre.historia, { maxlength: '1500' })));
    var depoimentos = rowsEditor(d.depoimentos, [{ key: 'nome', ph: 'Nome do cliente', max: 60 }, { key: 'texto', ph: 'Depoimento', max: 400, area: true }], 6, '+ Depoimento');
    add(groupField('Depoimentos', depoimentos.el, null, true));

    var voltar = function () { route(); };
    add(h('div', { class: 'f wide form-actions' },
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar correções'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: voltar }, 'Cancelar'),
      h('span', { class: 'muted small', text: 'Fotos e logotipo não mudam aqui. A primeira correção guarda uma cópia do que o cliente enviou.' })));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      api('PUT', '/adm/pedidos/' + encodeURIComponent(id) + '/dados', {
        negocio: {
          nome: f.nome.value, especialidade: f.especialidade.value, cidade: f.cidade.value, area: f.area.value,
          whatsapp: f.whatsapp.value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''), email: f.email.value,
          redes: { instagram: f.instagram.value.replace(/^@+/, ''), tiktok: f.tiktok.value.replace(/^@+/, ''), facebook: f.facebook.value, youtube: f.youtube.value }
        },
        plano: { tipo: tipo.value, subdominio: f.subdominio.value, dominio: f.dominio.value, dominioRegistrado: registrado.checked, extras: extras.get() },
        visual: { paleta: paleta.value, corPrincipal: c1.value, corDestaque: c2.value },
        servicos: servicos.get(),
        sobre: { historia: f.historia.value },
        depoimentos: depoimentos.get()
      }).then(function () { toast('Respostas corrigidas'); loadItems(); route(); })
        .catch(function (err) { toast(err.message, true); });
    });

    var el = $('detail');
    el.textContent = '';
    el.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: voltar }, '← Voltar ao pedido'));
    el.appendChild(h('div', { class: 'd-head' }, h('div', null, h('h1', { text: 'Editar respostas: ' + ng.nome }),
      h('p', { class: 'd-meta', text: 'Pedido ' + id + ' · as mesmas regras do formulário (WhatsApp com DDD, e-mail válido, pelo menos um serviço).' }))));
    el.appendChild(h('section', { class: 'card wide' }, form));
    window.scrollTo(0, 0);
  }

  function renderMensagem(m) {
    var admin = m.admin || { status: 'nova', notas: '' };
    var mail = 'mailto:' + m.email + '?subject=' + encodeURIComponent('Re: o seu contato com a LynxCoder');
    var el = $('detail');
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(h('div', { class: 'd-head' },
      h('div', null,
        h('h1', { text: m.nome }),
        h('p', { class: 'd-meta', text: 'Mensagem de contato · recebida em ' + fmtDate(m.recebidoEm) })),
      h('div', { class: 'd-actions' },
        statusSelect('mensagem', m.id, admin.status),
        h('a', { class: 'btn btn-primary btn-sm', href: mail }, 'Responder por e-mail'),
        deleteButton('mensagem', m.id))));
    el.appendChild(h('div', { class: 'd-grid' },
      h('section', { class: 'card wide' }, h('h2', { text: 'Mensagem' }), dl([['De', m.nome], ['E-mail', m.email]]),
        h('p', { class: 'prose', text: m.mensagem })),
      notesCard('mensagem', m.id, admin)));
  }

  // ---------- clientes ----------
  function fmtValor(n) { return n == null ? '' : Number(n).toFixed(2).replace('.', ','); }
  function fmtMoney(n) { return n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function fmtDia(d) { return d ? d.split('-').reverse().join('/') : ''; }
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function fmtRef(ref) { var p = ref.split('-'); return MESES[Number(p[1]) - 1] + '/' + p[0]; }
  function hojeISO() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }

  function renderCliente(c, formas) {
    var el = $('detail');
    var url = c.endereco ? 'https://' + c.endereco : null;

    var sel = h('select', { 'aria-label': 'Situação do cliente' },
      [['ativo', 'Ativo'], ['pausado', 'Pausado'], ['cancelado', 'Cancelado']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    sel.value = c.status;
    sel.addEventListener('change', function () {
      api('PATCH', '/adm/clientes/' + c.id, { status: sel.value }).then(function () { toast('Cliente ' + sel.options[sel.selectedIndex].text.toLowerCase()); loadItems(); route(); })
        .catch(function (err) { toast(err.message, true); });
    });

    // --- mensalidade
    var dia = c.primeiroVencimento ? Number(c.primeiroVencimento.slice(8, 10)) : null;
    var totalAberto = c.emAberto.length * (c.mensalidade || 0);
    var aberto = c.status !== 'ativo' ? null
      : c.emAberto.length
        ? h('span', { class: c.atrasados ? 'alerta-txt' : '' }, c.emAberto.map(function (x) { return fmtRef(x.referencia) + (x.atrasado ? ' (venceu ' + fmtDia(x.vencimento) + ')' : ' (vence hoje)'); }).join(', ') +
            (c.mensalidade ? ' · ' + fmtMoney(totalAberto) : ''))
        : h('span', { class: 'ok-txt', text: 'Nada em aberto' });

    // --- site
    var site = c.site;
    var siteEstado = !c.endereco ? 'Sem endereço na ficha'
      : !site ? 'Ainda não verificado'
      : site.ok ? h('span', { class: 'ok-txt', text: 'No ar, com HTTPS' }) : h('span', { class: 'alerta-txt', text: site.erro });
    var verificar = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Verificar agora');
    verificar.addEventListener('click', function () {
      verificar.disabled = true; verificar.textContent = 'A verificar…';
      api('POST', '/adm/clientes/' + c.id + '/verificar-site').then(function (r) {
        toast(r.site.ok ? 'O site está no ar' : 'Problema: ' + r.site.erro, !r.site.ok); loadItems(); route();
      }).catch(function (err) { toast(err.message, true); verificar.disabled = false; verificar.textContent = 'Verificar agora'; });
    });

    // --- pagamentos
    var linhas = (c.pagamentos || []).slice().reverse().map(function (p) {
      var rm = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Apagar pagamento de ' + fmtRef(p.referencia) }, '×');
      rm.addEventListener('click', function () {
        if (!rm.classList.contains('confirm')) { rm.classList.add('confirm'); rm.textContent = 'Apagar?'; setTimeout(function () { rm.classList.remove('confirm'); rm.textContent = '×'; }, 4000); return; }
        api('DELETE', '/adm/clientes/' + c.id + '/pagamentos/' + p.id).then(function () { toast('Pagamento apagado'); loadItems(); route(); })
          .catch(function (err) { toast(err.message, true); });
      });
      return h('tr', null, h('td', { text: fmtRef(p.referencia) }), h('td', { text: fmtMoney(p.valor) }), h('td', { text: fmtDia(p.pagoEm) }),
        h('td', { text: p.forma }), h('td', { text: p.nota || '' }), h('td', null, rm));
    });
    var sugerido = (c.emAberto[0] || c.proximo || {}).referencia || hojeISO().slice(0, 7);
    var fRef = h('input', { type: 'month', name: 'referencia', 'aria-label': 'Mês da mensalidade' }); fRef.value = sugerido;
    var fValor = textInput('valor', fmtValor(c.mensalidade), { inputmode: 'decimal', 'aria-label': 'Valor pago' });
    var fData = h('input', { type: 'date', name: 'pagoEm', 'aria-label': 'Data do pagamento' }); fData.value = hojeISO();
    var fForma = h('select', { name: 'forma', 'aria-label': 'Forma de pagamento' }, formas.map(function (f) { return h('option', { value: f, text: f }); }));
    var fNota = textInput('nota', '', { maxlength: '300', placeholder: 'Nota (opcional)', 'aria-label': 'Nota' });
    var payForm = h('form', { class: 'pay-form', novalidate: true },
      formField('Mês', fRef), formField('Valor', fValor), formField('Pago em', fData), formField('Forma', fForma), formField('Nota', fNota),
      h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Registar pagamento'));
    payForm.addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', '/adm/clientes/' + c.id + '/pagamentos', { referencia: fRef.value, valor: fValor.value, pagoEm: fData.value, forma: fForma.value, nota: fNota.value })
        .then(function () { toast('Pagamento de ' + fmtRef(fRef.value) + ' registado'); loadItems(); route(); })
        .catch(function (err) { toast(err.message, true); });
    });

    var wa = c.whatsapp ? 'https://wa.me/' + (c.whatsapp.length <= 11 ? '55' + c.whatsapp : c.whatsapp) : null;
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(h('div', { class: 'd-head' },
      h('div', null,
        h('h1', { text: c.nome }),
        h('p', { class: 'd-meta', text: 'Cliente desde ' + fmtDia(c.clienteDesde) + ' · plano ' + PLANOS[c.plano] }),
        c.teste ? h('span', { class: 'badge st-teste', text: 'Teste' }) : null, ' ',
        badge('cliente', c.situacao)),
      h('div', { class: 'd-actions' },
        sel,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { renderClienteForm(c, c.id); } }, 'Editar ficha'),
        wa ? h('a', { class: 'btn btn-primary btn-sm', href: wa, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp') : null,
        deleteButton('cliente', c.id))));

    el.appendChild(h('div', { class: 'd-grid' },
      h('section', { class: 'card' }, h('h2', { text: 'Mensalidade' }), dl([
        ['Valor', c.mensalidade != null ? fmtMoney(c.mensalidade) + '/mês' : 'A definir (editar ficha)'],
        ['Vencimento', dia ? 'Todo dia ' + dia + ' (desde ' + fmtDia(c.primeiroVencimento) + ')' : ''],
        ['Em aberto', aberto],
        ['Próximo', c.status === 'ativo' && c.proximo ? fmtRef(c.proximo.referencia) + ', vence ' + fmtDia(c.proximo.vencimento) : ''],
        ['Situação', c.status !== 'ativo' ? 'Cliente ' + (c.status === 'pausado' ? 'pausado' : 'cancelado') + ': não conta mensalidades' : '']
      ])),
      h('section', { class: 'card' }, h('h2', { text: 'Site' }), dl([
        ['Endereço', url ? h('a', { class: 'link', href: url, target: '_blank', rel: 'noopener noreferrer', text: c.endereco }) : ''],
        ['Estado', siteEstado],
        ['Verificado', site ? fmtDate(site.em) : '']
      ]), c.endereco ? h('div', { class: 'link-row small' }, verificar) : null,
        h('p', { class: 'muted small', text: 'Verificado sozinho a cada 30 minutos enquanto o cliente estiver ativo.' })),
      h('section', { class: 'card' }, h('h2', { text: 'Contato' }), dl([
        ['Responsável', c.contato], ['WhatsApp', fmtPhone(c.whatsapp)], ['E-mail', c.email],
        ['Origem', c.pedidoId ? h('span', null, h('a', { class: 'link', href: '#/pedido/' + c.pedidoId }, 'Pedido'),
          c.propostaId ? ' · ' : null, c.propostaId ? h('a', { class: 'link', href: '#/proposta/' + c.propostaId }, 'Proposta') : null) : 'Criado à mão']
      ])),
      h('section', { class: 'card wide' }, h('h2', { text: 'Pagamentos (' + (c.pagamentos || []).length + ')' }),
        linhas.length
          ? h('div', { class: 'table-wrap' }, h('table', { class: 'pay-table' },
              h('thead', null, h('tr', null, ['Mês', 'Valor', 'Pago em', 'Forma', 'Nota', ''].map(function (t) { return h('th', { text: t }); }))),
              h('tbody', null, linhas)))
          : h('p', { class: 'muted small', text: 'Nenhum pagamento registado ainda.' }),
        payForm),
      notesCard('cliente', c.id, { notas: c.notas, atualizadoEm: c.atualizadoEm })));
  }

  // Criar (ficha sugerida a partir do pedido, ou em branco) ou editar a ficha.
  function renderClienteForm(f, id) {
    f = f || {};
    var hoje = hojeISO();
    var plano = h('select', { name: 'plano' }, h('option', { value: 'essencial', text: 'Essencial' }), h('option', { value: 'profissional', text: 'Profissional' }));
    plano.value = f.plano || 'essencial';
    var desde = h('input', { type: 'date', name: 'clienteDesde' }); desde.value = f.clienteDesde || hoje;
    var venc = h('input', { type: 'date', name: 'primeiroVencimento' }); venc.value = f.primeiroVencimento || '';
    var form = h('form', { class: 'form-grid', novalidate: true },
      formField('Nome do negócio *', textInput('nome', f.nome, { maxlength: '120' })),
      formField('Responsável', textInput('contato', f.contato, { maxlength: '120' })),
      formField('WhatsApp', textInput('whatsapp', f.whatsapp, { maxlength: '20', inputmode: 'tel' })),
      formField('E-mail', textInput('email', f.email, { type: 'email', maxlength: '160' })),
      formField('Plano', plano),
      formField('Endereço da página', textInput('endereco', f.endereco, { maxlength: '120', placeholder: 'nome.lynxsites.com.br' }), 'Só o domínio, sem https://'),
      formField('Mensalidade (R$)', textInput('mensalidade', fmtValor(f.mensalidade), { inputmode: 'decimal', placeholder: 'Ex.: 49,90' })),
      formField('Cliente desde', desde),
      formField('Primeiro vencimento *', venc, 'A mensalidade vence todos os meses neste dia.'),
      h('div', { class: 'f wide form-actions' },
        h('button', { type: 'submit', class: 'btn btn-primary' }, id ? 'Salvar ficha' : 'Criar cliente'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { if (id) route(); else history.back(); } }, 'Cancelar')));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var x = form.elements;
      var ficha = { nome: x.nome.value, contato: x.contato.value, whatsapp: x.whatsapp.value, email: x.email.value, plano: plano.value,
        endereco: x.endereco.value, mensalidade: x.mensalidade.value, clienteDesde: desde.value, primeiroVencimento: venc.value };
      var pedido = id ? null : f.pedidoId;
      (id ? api('PATCH', '/adm/clientes/' + id, { ficha: ficha }) : api('POST', '/adm/clientes', Object.assign({ pedidoId: pedido }, ficha)))
        .then(function (r) { toast(id ? 'Ficha salva' : 'Cliente criado'); loadItems(); if (id) route(); else location.hash = '#/cliente/' + r.id; })
        .catch(function (err) { toast(err.message, true); });
    });
    var el = $('detail');
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(h('div', { class: 'd-head' }, h('div', null,
      h('h1', { text: id ? 'Editar ficha: ' + f.nome : (f.pedidoId ? 'Tornar cliente: ' + f.nome : 'Novo cliente') }),
      h('p', { class: 'd-meta', text: f.pedidoId && !id ? 'Dados do pedido e da proposta: confira o valor e o primeiro vencimento antes de criar.' : 'Os pagamentos registam-se na ficha do cliente.' }))));
    el.appendChild(h('section', { class: 'card wide' }, form));
    window.scrollTo(0, 0);
    form.elements.nome.focus();
  }

  // ---------- blog ----------
  function renderBlogLista(r) {
    var el = $('detail');
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(h('div', { class: 'd-head' },
      h('div', null, h('h1', { text: 'Blog' }),
        h('p', { class: 'd-meta' }, 'Publicado em ', h('a', { class: 'link', href: r.url, target: '_blank', rel: 'noopener noreferrer', text: r.url.replace(/^https?:\/\//, '') }))),
      h('div', { class: 'd-actions' }, h('a', { class: 'btn btn-primary btn-sm', href: '#/blog/novo' }, '+ Escrever post'))));
    el.appendChild(h('section', { class: 'card wide' },
      r.posts.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'pay-table' },
        h('thead', null, h('tr', null, ['Título', 'Situação', 'Data', ''].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', null, r.posts.map(function (p) {
          return h('tr', null,
            h('td', null, h('a', { class: 'link', href: '#/blog/' + p.id, text: p.titulo })),
            h('td', null, h('span', { class: 'badge st-' + p.status, text: p.status === 'publicado' ? 'Publicado' : 'Rascunho' })),
            h('td', { text: p.status === 'publicado' ? fmtDate(p.publicadoEm) : 'editado ' + fmtDate(p.atualizadoEm) }),
            h('td', null, p.url ? h('a', { class: 'link', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, 'Ver ↗') : null));
        }))))
        : h('p', { class: 'muted', text: 'Ainda não há posts. Escreva o primeiro: um artigo útil para os seus clientes ajuda a página a aparecer no Google.' })));
  }

  // Reduz imagens grandes antes de enviar (como no /comecar): 2000 px chegam para o blog.
  function reduzirImagem(file) {
    if (!window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size <= 1.5 * 1024 * 1024) { if (bmp.close) bmp.close(); return file; }
      var cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve) {
        cv.toBlob(function (b) { resolve(b && b.size < file.size ? new File([b], 'imagem.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.85);
      });
    }).catch(function () { return file; });
  }
  function enviarImagem(file) {
    return reduzirImagem(file).then(function (f) {
      var fd = new FormData();
      fd.append('imagem', f, f.name || 'imagem.jpg');
      return fetch('/adm/blog/imagens', { method: 'POST', credentials: 'same-origin', headers: { 'X-LX': '1' }, body: fd });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (res.status === 401) { showLogin(d.message); throw new Error('401'); }
        if (!res.ok || !d.ok) throw new Error(d.message || (res.status === 413 ? 'Imagem grande demais.' : 'Erro ' + res.status));
        return d;
      });
    });
  }
  function escolherFicheiro(cb) {
    var inp = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
    inp.addEventListener('change', function () { if (inp.files[0]) cb(inp.files[0]); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  }
  function slugBlog(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  }

  function renderPostEditor(p) {
    p = p || { titulo: '', slug: '', resumo: '', conteudo: '', capa: null, capaAlt: '', status: 'rascunho' };
    var publicado = p.status === 'publicado';
    var titulo = textInput('titulo', p.titulo, { maxlength: '140', placeholder: 'Ex.: 5 motivos para o seu negócio ter uma página própria' });
    var slug = textInput('slug', p.slug, { maxlength: '80', spellcheck: 'false' });
    var slugManual = !!p.slug;
    titulo.addEventListener('input', function () { if (!slugManual) slug.value = slugBlog(titulo.value); });
    slug.addEventListener('input', function () { slugManual = true; });
    var resumo = textArea('resumo', p.resumo, { maxlength: '220', class: 'ta-sm', placeholder: 'Uma ou duas frases. Aparece no Google, na lista de artigos e quando alguém partilha o link.' });
    var conta = h('span', { class: 'f-hint' });
    var contar = function () { conta.textContent = resumo.value.length + '/220 caracteres (o ideal para o Google é até ~160)'; };
    resumo.addEventListener('input', contar); contar();

    // capa
    var capa = p.capa;
    var capaImg = h('img', { class: 'capa-thumb', alt: 'Capa do post' });
    var capaBox = h('div', { class: 'capa-box' });
    var capaAlt = textInput('capaAlt', p.capaAlt, { maxlength: '160', placeholder: 'Descrição da imagem (para quem não a vê)' });
    function desenharCapa() {
      capaBox.textContent = '';
      if (capa) { capaImg.src = '/adm/blog/imagens/' + capa; capaBox.appendChild(capaImg); }
      capaBox.appendChild(h('div', { class: 'link-row' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () {
          escolherFicheiro(function (f) {
            toast('A enviar a capa…');
            enviarImagem(f).then(function (r) { capa = r.nome; desenharCapa(); toast('Capa enviada: salve o post para a guardar'); })
              .catch(function (e) { if (e.message !== '401') toast(e.message, true); });
          });
        } }, capa ? 'Trocar capa' : 'Escolher capa'),
        capa ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { capa = null; desenharCapa(); } }, 'Remover capa') : null));
    }
    desenharCapa();

    // texto + barra de ferramentas
    var ta = h('textarea', { class: 'code-editor', spellcheck: 'true', 'aria-label': 'Texto do post' });
    ta.value = p.conteudo;
    function inserir(antes, depois, exemplo) {
      var a = ta.selectionStart, b = ta.selectionEnd, sel = ta.value.slice(a, b) || exemplo || '';
      ta.value = ta.value.slice(0, a) + antes + sel + (depois || '') + ta.value.slice(b);
      ta.focus();
      ta.selectionStart = a + antes.length; ta.selectionEnd = a + antes.length + sel.length;
    }
    var bar = h('div', { class: 'link-row editor-bar' },
      h('button', { type: 'button', class: 'chip', onclick: function () { inserir('\n## ', '\n', 'Título da secção'); } }, 'Título'),
      h('button', { type: 'button', class: 'chip', onclick: function () { inserir('**', '**', 'texto em negrito'); } }, 'Negrito'),
      h('button', { type: 'button', class: 'chip', onclick: function () { inserir('[', '](https://)', 'texto do link'); } }, 'Link'),
      h('button', { type: 'button', class: 'chip', onclick: function () { inserir('\n- ', '\n', 'item da lista'); } }, 'Lista'),
      h('button', { type: 'button', class: 'chip', onclick: function () { inserir('\n> ', '\n', 'dica em destaque'); } }, 'Destaque'),
      h('button', { type: 'button', class: 'chip', onclick: function () {
        escolherFicheiro(function (f) {
          toast('A enviar a imagem…');
          enviarImagem(f).then(function (r) { inserir('\n![', '](' + r.url + ')\n', 'descrição da imagem'); toast('Imagem inserida'); })
            .catch(function (e) { if (e.message !== '401') toast(e.message, true); });
        });
      } }, 'Imagem'));

    function dados(acao) {
      return { titulo: titulo.value, slug: slug.value, resumo: resumo.value, conteudo: ta.value, capa: capa, capaAlt: capaAlt.value, acao: acao };
    }
    // Cria (se ainda não existe) e salva; devolve o post.
    function salvar(acao) {
      var d = dados(acao);
      var criar = p.id ? Promise.resolve(p.id) : api('POST', '/adm/blog/posts', d).then(function (r) { p.id = r.id; return r.id; });
      return criar.then(function (id) { return api('PUT', '/adm/blog/posts/' + id, d); }).then(function (r) { loadBlog(); return r.post; });
    }
    // Depois de salvar: atualiza o endereço sem disparar o route() (que recarregaria o editor).
    function mostrar(post) {
      if (location.hash !== '#/blog/' + post.id) history.replaceState(null, '', '#/blog/' + post.id);
      renderPostEditor(post);
    }
    var bSalvar = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, publicado ? 'Salvar alterações' : 'Salvar rascunho');
    bSalvar.addEventListener('click', function () {
      salvar().then(function (post) { toast(publicado ? 'Alterações publicadas' : 'Rascunho salvo'); mostrar(post); })
        .catch(function (e) { toast(e.message, true); });
    });
    var bPublicar = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Publicar');
    bPublicar.addEventListener('click', function () {
      salvar('publicar').then(function (post) { toast('Post publicado'); mostrar(post); })
        .catch(function (e) { toast(e.message, true); });
    });
    var bDespublicar = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Voltar a rascunho');
    bDespublicar.addEventListener('click', function () {
      salvar('despublicar').then(function (post) { toast('O post saiu do blog e voltou a rascunho'); mostrar(post); })
        .catch(function (e) { toast(e.message, true); });
    });
    var bPrevia = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Pré-visualizar');
    bPrevia.addEventListener('click', function () {
      // abre já: uma janela aberta só depois do salvar seria bloqueada pelo navegador
      var w = window.open('about:blank', '_blank');
      salvar().then(function (post) {
        if (w) w.location = '/adm/blog/posts/' + post.id + '/previa';
        mostrar(post);
      }).catch(function (e) { if (w) w.close(); toast(e.message, true); });
    });

    var el = $('detail');
    el.textContent = '';
    el.appendChild(h('a', { class: 'btn btn-ghost btn-sm', href: '#/blog' }, '← Todos os posts'));
    el.appendChild(h('div', { class: 'd-head' },
      h('div', null,
        h('h1', { text: p.id ? (p.titulo || 'Post sem título') : 'Novo post' }),
        p.id ? h('span', { class: 'badge st-' + p.status, text: publicado ? 'Publicado em ' + fmtDate(p.publicadoEm) : 'Rascunho' }) : null),
      h('div', { class: 'd-actions' },
        bSalvar,
        bPrevia,
        publicado ? bDespublicar : bPublicar,
        publicado && p.url ? h('a', { class: 'btn btn-ghost btn-sm', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, 'Ver no blog ↗') : null,
        p.id ? deleteButton('post', p.id) : null)));
    el.appendChild(h('div', { class: 'd-grid' },
      h('section', { class: 'card wide' }, h('div', { class: 'form-grid' },
        wideField('Título', titulo),
        formField('Endereço', slug, publicado ? 'Mudar o endereço de um post publicado mantém o antigo a redirecionar.' : 'blog.lynxcoder.com.br/… (sai do título)'),
        formField('Descrição da capa', capaAlt),
        groupField('Capa (opcional)', capaBox, 'Aparece no topo do post, na lista e na partilha. Ideal: horizontal, 1600×900.', true),
        groupField('Resumo', h('div', null, resumo, conta), null, true))),
      h('section', { class: 'card wide' }, h('h2', { text: 'Texto' }), bar, ta),
      h('section', { class: 'card' }, h('h2', { text: 'Formato' }),
        h('ul', { class: 'help-list' },
          h('li', null, h('code', { text: '## Título' }), ' secção  ·  ', h('code', { text: '### Subtítulo' })),
          h('li', null, 'Linha em branco separa parágrafos'),
          h('li', null, h('code', { text: '- item' }), ' lista  ·  ', h('code', { text: '1. item' }), ' numerada'),
          h('li', null, h('code', { text: '**negrito**' }), '  ·  ', h('code', { text: '_itálico_' }), '  ·  ', h('code', { text: '`código`' })),
          h('li', null, h('code', { text: '[texto](https://…)' }), ' link  ·  ', h('code', { text: '> dica' }), ' destaque'),
          h('li', null, h('code', { text: '![descrição](/imagens/…)' }), ' imagem (use o botão Imagem)'),
          h('li', null, h('code', { text: '| a | b |' }), ' tabela'))),
      h('section', { class: 'card' }, h('h2', { text: 'Antes de publicar' }),
        h('ul', { class: 'help-list' },
          h('li', null, 'Título claro, com o que a pessoa pesquisaria no Google'),
          h('li', null, 'Resumo de 1 ou 2 frases (é obrigatório para publicar)'),
          h('li', null, 'Imagens com descrição: ajuda no Google e na acessibilidade'),
          h('li', null, 'Use "Pré-visualizar" para ver como fica no blog')))));
    window.scrollTo(0, 0);
    if (!p.id) titulo.focus();
  }

  // ---------- propostas ----------
  function copyButton(text, label) {
    var btn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, label || 'Copiar link');
    btn.addEventListener('click', function () {
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(function () { toast('Link copiado'); })
        .catch(function () { toast('Não foi possível copiar: selecione o link e copie à mão', true); });
    });
    return btn;
  }
  function waLink(phone, text) {
    var d = String(phone || '').replace(/\D/g, '');
    return 'https://wa.me/' + (d ? (d.length <= 11 ? '55' + d : d) : '') + '?text=' + encodeURIComponent(text);
  }
  function linkBox(url) {
    var input = h('input', { type: 'text', readonly: true, class: 'link-input', 'aria-label': 'Link', value: url });
    input.addEventListener('focus', function () { input.select(); });
    return input;
  }
  function fmtDay(iso) { return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }

  function cancelButton(id) {
    var armed = false, timer;
    var btn = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, 'Cancelar link');
    btn.addEventListener('click', function () {
      if (!armed) {
        armed = true; btn.classList.add('confirm'); btn.textContent = 'Confirmar cancelamento';
        timer = setTimeout(function () { armed = false; btn.classList.remove('confirm'); btn.textContent = 'Cancelar link'; }, 5000);
        return;
      }
      clearTimeout(timer);
      api('POST', '/adm/propostas/' + id + '/cancelar').then(function () { toast('Link cancelado'); route(); loadItems(); })
        .catch(function (err) { toast(err.message, true); });
    });
    return btn;
  }

  function renderProposta(p) {
    var el = $('detail');
    var c = p.cliente;
    var primeiro = c.nome.split(' ')[0];
    var msgProposta = 'Olá, ' + primeiro + '! Segue a proposta da LynxCoder para a sua página. É só abrir o link, ler com calma e, se estiver de acordo, aceitar no fim da página: ' +
      p.link + ' (válida até ' + fmtDay(p.expiraEm) + ').';
    var vistas = p.visualizacoes || [];
    var cancelada = p.status === 'cancelada';

    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(h('div', { class: 'd-head' },
      h('div', null,
        h('h1', { text: c.nome }),
        h('p', { class: 'd-meta', text: 'Proposta criada em ' + fmtDate(p.criadoEm) + ' · válida até ' + fmtDate(p.expiraEm) }),
        p.teste ? h('span', { class: 'badge st-teste', text: 'Teste' }) : null, ' ',
        badge('proposta', p.status)),
      h('div', { class: 'd-actions' },
        cancelada ? null : h('a', { class: 'btn btn-ghost btn-sm', href: p.link.replace('/proposta#', '/proposta?previa=1#'), target: '_blank', rel: 'noopener noreferrer' }, 'Ver como o cliente'),
        cancelada ? null : cancelButton(p.id),
        deleteButton('proposta', p.id))));

    var conviteCard;
    if (cancelada) {
      conviteCard = h('section', { class: 'card wide' }, h('h2', { text: 'Formulário de início' }), h('p', { class: 'muted', text: 'Proposta cancelada.' }));
    } else if (!p.convite) {
      var lib = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Liberar formulário');
      lib.addEventListener('click', function () {
        api('POST', '/adm/propostas/' + p.id + '/convite').then(function () { toast('Formulário liberado'); route(); loadItems(); })
          .catch(function (err) { toast(err.message, true); });
      });
      conviteCard = h('section', { class: 'card wide' }, h('h2', { text: 'Formulário de início' }),
        h('p', { class: 'muted', text: 'Depois do pagamento da implantação, libere o formulário: é gerado um link só deste cliente, válido 30 dias e para um único envio.' }),
        lib);
    } else {
      var cv = p.convite;
      var msgForm = 'Olá, ' + primeiro + '! Aqui está o formulário para montarmos a sua página. Leva cerca de 10 minutos e dá para enviar as fotos direto do celular: ' + p.linkFormulario;
      conviteCard = h('section', { class: 'card wide' }, h('h2', { text: 'Formulário de início' }),
        cv.usadoEm
          ? h('p', null, 'Enviado em ' + fmtDate(cv.usadoEm) + '. ', h('a', { class: 'link', href: '#/pedido/' + cv.pedidoId }, 'Abrir o pedido →'))
          : h('div', { class: 'link-row' },
              linkBox(p.linkFormulario),
              copyButton(p.linkFormulario),
              h('a', { class: 'btn btn-primary btn-sm', href: waLink(c.whatsapp, msgForm), target: '_blank', rel: 'noopener noreferrer' }, 'Enviar pelo WhatsApp')),
        cv.usadoEm ? null : h('p', { class: 'muted small', text: 'Válido até ' + fmtDate(cv.expiraEm) + '. Ainda não foi enviado.' }));
    }

    var pfCard = null;
    if (!cancelada && !(p.convite && p.convite.usadoEm)) {
      pfCard = h('section', { class: 'card wide' }, h('h2', { text: 'Formulário deste cliente' }),
        h('p', { class: 'muted small', text: resumoPersonalizacao(p) }),
        h('div', { class: 'link-row' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { personalizarFormulario(p); } }, 'Personalizar formulário'),
          p.convite ? h('a', { class: 'btn btn-ghost btn-sm', href: p.linkFormulario.replace('/comecar#', '/comecar?previa=1#'), target: '_blank', rel: 'noopener noreferrer' }, 'Ver como o cliente') : null),
        p.convite ? null : h('p', { class: 'muted small', text: '"Ver como o cliente" aparece depois de liberar o formulário.' }));
    }

    var v = p.valores || {};
    var mailHref =c.email ? 'mailto:' + c.email + '?subject=' + encodeURIComponent('Proposta LynxCoder') + '&body=' + encodeURIComponent(msgProposta) : null;
    el.appendChild(h('div', { class: 'd-grid' },
      h('section', { class: 'card wide' }, h('h2', { text: 'Link da proposta' }),
        cancelada ? h('p', { class: 'muted', text: 'Cancelado: o link já não abre.' }) :
          h('div', { class: 'link-row' },
            linkBox(p.link),
            copyButton(p.link),
            h('a', { class: 'btn btn-primary btn-sm', href: waLink(c.whatsapp, msgProposta), target: '_blank', rel: 'noopener noreferrer' }, 'Enviar pelo WhatsApp'),
            mailHref ? h('a', { class: 'btn btn-ghost btn-sm', href: mailHref }, 'Enviar por e-mail') : null)),
      h('section', { class: 'card' }, h('h2', { text: 'Cliente' }), dl([
        ['Nome', c.nome], ['Negócio', c.negocio], ['WhatsApp', fmtPhone(c.whatsapp)], ['E-mail', c.email]
      ])),
      h('section', { class: 'card' }, h('h2', { text: 'Acompanhamento' }), dl([
        ['Aberta', vistas.length ? vistas.length + (vistas.length === 1 ? ' vez' : ' vezes') : 'Ainda não'],
        ['Última vez', vistas.length ? fmtDate(vistas[vistas.length - 1]) : ''],
        ['Aceite', p.aceite ? 'Plano ' + PLANOS[p.aceite.plano] + ', por ' + p.aceite.nome : 'Ainda não'],
        ['Aceite em', p.aceite ? fmtDate(p.aceite.em) : ''],
        ['IP do aceite', p.aceite ? p.aceite.ip : '']
      ])),
      h('section', { class: 'card' }, h('h2', { text: 'Valores desta proposta' }), dl([
        ['Essencial', (v.essencial_implantacao || '—') + ' + ' + (v.essencial_mensalidade || '—') + '/mês'],
        ['Profissional', (v.profissional_implantacao || '—') + ' + ' + (v.profissional_mensalidade || '—') + '/mês']
      ])),
      p.mensagem ? h('section', { class: 'card' }, h('h2', { text: 'Mensagem no topo' }), h('p', { class: 'prose', text: p.mensagem })) : null,
      conviteCard,
      pfCard));
  }

  function resumoPersonalizacao(p) {
    var pf = p.formulario;
    if (!pf) return 'Formulário padrão: vem pré-preenchido só com o negócio, o WhatsApp e o e-mail desta proposta. Personalize para adiantar mais respostas, escolher os extras e as paletas que aparecem ou deixar um recado no topo.';
    var pre = pf.preenchido || {};
    var campos = Object.keys(pre).filter(function (k) { return k !== 'servicos' && pre[k]; }).length;
    var partes = [];
    if (campos) partes.push(campos + (campos === 1 ? ' campo pré-preenchido' : ' campos pré-preenchidos'));
    if (pre.servicos && pre.servicos.length) partes.push(pre.servicos.length + (pre.servicos.length === 1 ? ' serviço sugerido' : ' serviços sugeridos'));
    if (Array.isArray(pf.extras)) partes.push(pf.extras.length ? pf.extras.length + ' extra(s) escolhido(s)' : 'sem extras');
    if (Array.isArray(pf.paletas)) partes.push(pf.paletas.length + ' paleta(s) escolhida(s)');
    if (pf.mensagem) partes.push('recado no topo');
    return 'Personalizado em ' + fmtDate(pf.atualizadoEm) + ': ' + (partes.join(', ') || 'sem alterações') + '. Se o cliente já abriu o formulário, o rascunho guardado no aparelho dele tem prioridade sobre o pré-preenchimento.';
  }

  // Prepara o /comecar só para este cliente: respostas adiantadas, extras e
  // paletas visíveis e um recado no topo.
  function personalizarFormulario(p) {
    api('GET', '/adm/formulario').then(function (opc) {
      var pf = p.formulario || {}, pre = pf.preenchido || {}, c = p.cliente;
      var form = h('form', { class: 'form-grid', novalidate: true });
      var add = function (x) { form.appendChild(x); };

      add(wideField('Recado no topo do formulário (opcional)', textArea('mensagem', pf.mensagem, { maxlength: '600', class: 'ta-sm', placeholder: 'Ex.: Já deixei preenchido o que falamos por telefone. Falta só conferir e enviar as fotos.' })));

      add(h('h2', { class: 'wide form-group', text: 'Respostas adiantadas' }));
      add(h('p', { class: 'wide muted small', text: 'O cliente vê estes campos já preenchidos e pode alterar. Em branco fica como está.' }));
      add(formField('Nome do negócio', textInput('nome', pre.nome || c.negocio, { maxlength: '80' })));
      add(formField('Especialidade', textInput('especialidade', pre.especialidade, { maxlength: '100' })));
      add(formField('Cidade', textInput('cidade', pre.cidade, { maxlength: '80' })));
      add(formField('Área de atendimento', textInput('area', pre.area, { maxlength: '120' })));
      add(formField('WhatsApp', textInput('whatsapp', pre.whatsapp || c.whatsapp, { maxlength: '20', inputmode: 'tel' })));
      add(formField('E-mail', textInput('email', pre.email || c.email, { type: 'email', maxlength: '120' })));
      add(formField('Instagram (sem @)', textInput('instagram', pre.instagram, { maxlength: '40' })));
      add(formField('Endereço sugerido (Essencial)', textInput('subdominio', pre.subdominio, { maxlength: '40' }), 'Só o nome: fica nome.lynxsites.com.br. Em branco, sai do nome do negócio.'));
      add(formField('Domínio (Profissional)', textInput('dominio', pre.dominio, { maxlength: '100', placeholder: 'seunome.com.br' })));
      var paleta = h('select', { name: 'paleta' }, h('option', { value: '', text: 'A primeira da lista' }),
        opc.paletas.map(function (x) { return h('option', { value: x.id, text: x.label }); }));
      paleta.value = pre.paleta || '';
      add(formField('Paleta já selecionada', paleta));
      add(wideField('História', textArea('historia', pre.historia, { maxlength: '1500', class: 'ta-sm' })));
      var servicos = rowsEditor(pre.servicos, [{ key: 'nome', ph: 'Nome do serviço', max: 60 }, { key: 'descricao', ph: 'Descrição (opcional)', max: 160 }], 10, '+ Serviço');
      add(groupField('Serviços sugeridos', servicos.el, null, true));

      add(h('h2', { class: 'wide form-group', text: 'O que aparece para escolher' }));
      // null = todas (incluindo as que forem criadas depois)
      var extras = checkList(opc.extras, Array.isArray(pf.extras) ? pf.extras : opc.extras.map(function (x) { return x.id; }));
      var paletas = checkList(opc.paletas, Array.isArray(pf.paletas) ? pf.paletas : opc.paletas.map(function (x) { return x.id; }));
      add(groupField('Extras (etapa 2)', opc.extras.length ? extras.el : h('p', { class: 'muted small', text: 'Não há extras nas opções gerais.' }), 'Desmarque todos para esconder a secção.'));
      add(groupField('Paletas de cores (etapa 3)', paletas.el, 'Sem nenhuma marcada, aparecem todas.'));

      var voltar = function () { route(); };
      add(h('div', { class: 'f wide form-actions' },
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar personalização'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: voltar }, 'Cancelar')));

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var f = form.elements;
        var todas = function (lista, escolhidos) { return escolhidos.length === lista.length ? null : escolhidos; };
        api('PUT', '/adm/propostas/' + p.id + '/formulario', {
          mensagem: f.mensagem.value,
          preenchido: {
            nome: f.nome.value, especialidade: f.especialidade.value, cidade: f.cidade.value, area: f.area.value,
            whatsapp: f.whatsapp.value, email: f.email.value, instagram: f.instagram.value,
            subdominio: f.subdominio.value, dominio: f.dominio.value, paleta: paleta.value,
            historia: f.historia.value, servicos: servicos.get()
          },
          extras: todas(opc.extras, extras.get()),
          paletas: todas(opc.paletas, paletas.get())
        }).then(function () { toast('Formulário personalizado'); route(); })
          .catch(function (err) { toast(err.message, true); });
      });

      var el = $('detail');
      el.textContent = '';
      el.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: voltar }, '← Voltar à proposta'));
      el.appendChild(h('div', { class: 'd-head' }, h('div', null, h('h1', { text: 'Formulário de ' + c.nome }),
        h('p', { class: 'd-meta', text: 'Vale só para este cliente. Os textos das etapas são os de Configurações › Formulário.' }))));
      el.appendChild(h('section', { class: 'card wide' }, form));
      window.scrollTo(0, 0);
    }).catch(function (err) { if (err.message !== '401') toast(err.message, true); });
  }

  function formField(label, input, hint) {
    return h('label', { class: 'f' }, h('span', { class: 'f-label', text: label }), input, hint ? h('span', { class: 'f-hint', text: hint }) : null);
  }
  function textInput(name, value, attrs) {
    var i = h('input', Object.assign({ type: 'text', name: name }, attrs || {}));
    i.value = value || '';
    return i;
  }

  function textArea(name, value, attrs) {
    var t = h('textarea', Object.assign({ name: name }, attrs || {}));
    t.value = value || '';
    return t;
  }
  function wideField(label, input, hint) {
    var f = formField(label, input, hint);
    f.classList.add('wide');
    return f;
  }
  // Para grupos de vários controlos (listas, caixas de seleção): um <label>
  // não pode conter outros labels nem vários campos.
  function groupField(label, content, hint, wide) {
    return h('div', { class: 'f' + (wide ? ' wide' : ''), role: 'group', 'aria-label': label },
      h('span', { class: 'f-label', text: label }), content, hint ? h('span', { class: 'f-hint', text: hint }) : null);
  }

  // Lista de linhas editáveis (serviços, depoimentos): campos = [{ key, ph, max, area }].
  function rowsEditor(items, campos, max, addLabel) {
    var box = h('div', { class: 'opt-list' });
    function linha(item) {
      var inputs = campos.map(function (c) {
        var attrs = { placeholder: c.ph, maxlength: String(c.max), 'aria-label': c.ph, 'data-key': c.key };
        // sem name: senão form.elements.nome passaria a ser uma lista (o nome do negócio + as linhas)
        var el = c.area ? textArea(null, item[c.key], Object.assign({ rows: '2', class: 'ta-sm' }, attrs)) : textInput(null, item[c.key], attrs);
        return el;
      });
      var row = h('div', { class: 'opt-row rows-row' }, h('div', { class: 'rows-fields' }, inputs),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Remover linha', onclick: function () { row.remove(); sync(); } }, '×'));
      return row;
    }
    var add = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, addLabel);
    function sync() { add.hidden = box.children.length >= max; }
    add.addEventListener('click', function () { box.appendChild(linha({})); sync(); box.lastChild.querySelector('input, textarea').focus(); });
    (items || []).forEach(function (it) { box.appendChild(linha(it)); });
    sync();
    return {
      el: h('div', null, box, add),
      get: function () {
        return Array.prototype.map.call(box.children, function (row) {
          var o = {};
          Array.prototype.forEach.call(row.querySelectorAll('[data-key]'), function (i) { o[i.getAttribute('data-key')] = i.value.trim(); });
          return o;
        });
      }
    };
  }

  // Caixas de seleção a partir de [{ id, label }]; marcados = lista de ids.
  function checkList(opcoes, marcados) {
    var box = h('div', { class: 'check-list' }, opcoes.map(function (o) {
      var c = h('input', { type: 'checkbox', value: o.id });
      c.checked = marcados.indexOf(o.id) !== -1;
      return h('label', { class: 'check-row' }, c, h('span', { text: o.label }));
    }));
    return {
      el: box,
      get: function () { return Array.prototype.filter.call(box.querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return c.value; }); }
    };
  }

  function renderNovaProposta(cfg) {
    var v = cfg.valores;
    // Valores de Configurações em branco aparecem como "a combinar" no texto da proposta.
    var vazios = cfg.campos.filter(function (c) { return !String(v[c[1]] || '').trim(); });
    var semPreco = 'Em branco, a proposta mostra "a combinar".';
    var form = h('form', { class: 'form-grid', novalidate: true },
      formField('Nome do cliente *', textInput('nome', '', { required: true, maxlength: '120', autocomplete: 'off' })),
      formField('Negócio', textInput('negocio', '', { maxlength: '120', placeholder: 'Ex.: Duarte Elétrica' }), 'Pré-preenche o formulário quando for liberado.'),
      formField('WhatsApp', textInput('whatsapp', '', { inputmode: 'tel', maxlength: '20', placeholder: '(21) 98765-4321' })),
      formField('E-mail', textInput('email', '', { type: 'email', maxlength: '160' })),
      formField('Essencial: implantação', textInput('essencial_implantacao', v.essencial_implantacao, { placeholder: 'Ex.: 297' }), semPreco),
      formField('Essencial: mensalidade', textInput('essencial_mensalidade', v.essencial_mensalidade, { placeholder: 'Ex.: 49' }), semPreco),
      formField('Profissional: implantação', textInput('profissional_implantacao', v.profissional_implantacao, { placeholder: 'Ex.: 397' }), semPreco),
      formField('Profissional: mensalidade', textInput('profissional_mensalidade', v.profissional_mensalidade, { placeholder: 'Ex.: 59' }), semPreco),
      formField('Validade (dias)', textInput('validade', v.validade_dias || '15', { inputmode: 'numeric', maxlength: '2' })),
      h('label', { class: 'f wide check-row' }, h('input', { type: 'checkbox', name: 'teste' }),
        h('span', null, h('strong', { text: 'Proposta de teste' }), ' — não envia e-mails, não conta nos números e pode ser apagada com "Apagar todos os testes".')),
      h('label', { class: 'f wide' }, h('span', { class: 'f-label', text: 'Mensagem no topo da proposta (opcional)' }),
        h('textarea', { name: 'mensagem', maxlength: '1000', placeholder: 'Ex.: Como combinamos por telefone, segue a proposta com 10% de desconto na implantação.' })),
      h('div', { class: 'f wide form-actions' },
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Criar proposta'),
        h('a', { class: 'link', href: '#/config' }, 'Editar os valores padrão →')));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      if (f.nome.value.trim().length < 2) { toast('Informe o nome do cliente', true); f.nome.focus(); return; }
      api('POST', '/adm/propostas', {
        cliente: { nome: f.nome.value, negocio: f.negocio.value, whatsapp: f.whatsapp.value, email: f.email.value },
        precos: {
          essencial_implantacao: f.essencial_implantacao.value, essencial_mensalidade: f.essencial_mensalidade.value,
          profissional_implantacao: f.profissional_implantacao.value, profissional_mensalidade: f.profissional_mensalidade.value
        },
        validadeDias: f.validade.value,
        teste: f.teste.checked,
        mensagem: f.mensagem.value
      }).then(function (r) { toast('Proposta criada'); loadItems(); location.hash = '#/proposta/' + r.id; })
        .catch(function (err) { toast(err.message, true); });
    });
    var el = $('detail');
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(h('div', { class: 'd-head' }, h('div', null, h('h1', { text: 'Nova proposta' }),
      h('p', { class: 'd-meta', text: 'O texto é o da proposta padrão; aqui você define o cliente e, se quiser, preços só para ele.' }))));
    if (vazios.length) {
      el.appendChild(h('p', { class: 'aviso-config' },
        h('strong', { text: vazios.length + (vazios.length === 1 ? ' valor padrão em branco' : ' valores padrão em branco') }),
        ' (' + vazios.slice(0, 4).map(function (c) { return c[2]; }).join(', ') + (vazios.length > 4 ? '…' : '') + '). ',
        'Na proposta aparecem como "a combinar". Preencha uma vez em ',
        h('a', { class: 'link', href: '#/config' }, 'Configurações › Valores'),
        ' e todas as propostas novas já vêm com eles.'));
    }
    el.appendChild(h('section', { class: 'card wide' }, form));
    form.elements.nome.focus();
  }

  function renderConfig(cfg) {
    var form = h('form', { class: 'form-grid', novalidate: true });
    var grupo = null;
    cfg.campos.forEach(function (c) {
      if (c[0] !== grupo) { grupo = c[0]; form.appendChild(h('h2', { class: 'wide form-group', text: grupo })); }
      var ph = c[3] === 'dinheiro' ? 'Ex.: 490' : (c[3] === 'numero' ? 'Ex.: 5' : '');
      form.appendChild(formField(c[2], textInput(c[1], cfg.valores[c[1]], { maxlength: '120', placeholder: ph })));
    });
    form.appendChild(h('div', { class: 'f wide form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar valores')));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var out = {};
      cfg.campos.forEach(function (c) { out[c[1]] = form.elements[c[1]].value; });
      api('PUT', '/adm/config', out).then(function () { toast('Valores salvos'); })
        .catch(function (err) { toast(err.message, true); });
    });
    var el = $('detail');
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(configNav('#/config'));
    el.appendChild(h('div', { class: 'd-head' }, h('div', null, h('h1', { text: 'Valores da proposta' }),
      h('p', { class: 'd-meta', text: 'Valores usados nas propostas novas. Em branco aparece "a combinar". Propostas já criadas não mudam.' }))));
    el.appendChild(h('section', { class: 'card wide' }, form));
  }

  // ---------- manutenção (bandeira) ----------
  var maint = { ativo: false };
  function renderMaint() {
    var btn = $('maintBtn');
    btn.textContent = maint.ativo ? 'Manutenção: LIGADA' : 'Manutenção';
    btn.classList.toggle('maint-on', maint.ativo);
    btn.setAttribute('aria-pressed', String(maint.ativo));
    $('maintBanner').hidden = !maint.ativo;
    if (maint.ativo) $('maintSince').textContent = maint.desde ? ' desde ' + fmtDate(maint.desde) : '';
  }
  function loadMaint() {
    api('GET', '/adm/manutencao').then(function (r) { maint = r; renderMaint(); }).catch(function () {});
  }
  function setMaint(ativo) {
    api('PUT', '/adm/manutencao', { ativo: ativo }).then(function (r) {
      maint = r; renderMaint();
      toast(ativo ? 'Site em manutenção' : 'Site de volta ao ar');
    }).catch(function (err) { toast(err.message, true); });
  }
  (function () {
    var armed = false, timer;
    $('maintBtn').addEventListener('click', function () {
      var btn = $('maintBtn');
      if (!armed) {
        armed = true;
        btn.textContent = maint.ativo ? 'Confirmar: tirar de manutenção' : 'Confirmar: pôr em manutenção';
        btn.classList.add('maint-confirm');
        timer = setTimeout(function () { armed = false; btn.classList.remove('maint-confirm'); renderMaint(); }, 5000);
        return;
      }
      clearTimeout(timer); armed = false; btn.classList.remove('maint-confirm');
      setMaint(!maint.ativo);
    });
    $('maintOff').addEventListener('click', function () { setMaint(false); });
  })();

  // ---------- opções do formulário (rótulos de extras e paletas) ----------
  function loadFormOptions() {
    api('GET', '/adm/formulario').then(function (r) {
      r.extras.forEach(function (x) { EXTRAS[x.id] = x.label; });
      r.paletas.forEach(function (p) { PALETAS[p.id] = p.label; });
    }).catch(function () {});
  }

  // ---------- apagar testes ----------
  $('clearTests').addEventListener('click', function () {
    var btn = $('clearTests');
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm'); btn.textContent = 'Confirmar: apagar todos';
      setTimeout(function () { btn.classList.remove('confirm'); btn.textContent = 'Apagar todos os testes'; }, 5000);
      return;
    }
    api('DELETE', '/adm/testes').then(function (r) {
      btn.classList.remove('confirm'); btn.textContent = 'Apagar todos os testes';
      toast(r.propostasApagadas + ' propostas, ' + r.pedidosApagados + ' pedidos e ' + r.clientesApagados + ' clientes de teste apagados');
      location.hash = '';
      loadItems();
    }).catch(function (err) { toast(err.message, true); });
  });

  // ---------- configurações: sub-navegação ----------
  function configNav(atual) {
    var tabs = [['#/config', 'Valores'], ['#/config/texto', 'Texto da proposta'], ['#/config/formulario', 'Formulário']];
    return h('nav', { class: 'subnav', 'aria-label': 'Configurações' }, tabs.map(function (t) {
      return h('a', { href: t[0], class: t[0] === atual ? 'on' : '', 'aria-current': t[0] === atual ? 'page' : null }, t[1]);
    }));
  }

  function criarPropostaTeste() {
    return api('POST', '/adm/propostas', {
      teste: true,
      cliente: { nome: 'Cliente de teste', negocio: 'Negócio de teste', whatsapp: '', email: '' }
    }).then(function (r) { loadItems(); return r.id; });
  }

  function renderTexto(r) {
    var ta = h('textarea', { class: 'code-editor', spellcheck: 'false', 'aria-label': 'Texto da proposta' });
    ta.value = r.texto;
    var estado = h('span', { class: 'muted small', text: r.padrao ? 'A usar o texto padrão.' : 'Texto personalizado.' });
    function salvar() {
      return api('PUT', '/adm/proposta-texto', { texto: ta.value }).then(function (x) {
        estado.textContent = x.padrao ? 'A usar o texto padrão.' : 'Texto personalizado salvo.';
        return x;
      });
    }
    var btnSalvar = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Salvar');
    btnSalvar.addEventListener('click', function () { salvar().then(function () { toast('Texto salvo'); }).catch(function (e) { toast(e.message, true); }); });
    var btnTestar = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Salvar e testar');
    btnTestar.addEventListener('click', function () {
      salvar().then(criarPropostaTeste).then(function (id) {
        toast('Proposta de teste criada: abra "Ver como o cliente"');
        location.hash = '#/proposta/' + id;
      }).catch(function (e) { toast(e.message, true); });
    });
    var armed = false;
    var btnPadrao = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, 'Restaurar texto padrão');
    btnPadrao.addEventListener('click', function () {
      if (!armed) { armed = true; btnPadrao.classList.add('confirm'); btnPadrao.textContent = 'Confirmar: perder as edições'; setTimeout(function () { armed = false; btnPadrao.classList.remove('confirm'); btnPadrao.textContent = 'Restaurar texto padrão'; }, 5000); return; }
      api('PUT', '/adm/proposta-texto', { texto: '' }).then(function (x) { ta.value = x.texto; estado.textContent = 'A usar o texto padrão.'; toast('Texto padrão restaurado'); armed = false; btnPadrao.classList.remove('confirm'); btnPadrao.textContent = 'Restaurar texto padrão'; })
        .catch(function (e) { toast(e.message, true); });
    });

    function inserir(txt) {
      var s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + txt + ta.value.slice(e);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + txt.length;
    }
    var camposList = h('ul', { class: 'chips' }, r.campos.map(function (c) {
      return h('li', null, h('button', { type: 'button', class: 'chip', title: c[1], onclick: function () { inserir('{{' + c[0] + '}}'); } }, '{{' + c[0] + '}}'));
    }));

    var el = $('detail');
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(configNav('#/config/texto'));
    el.appendChild(h('div', { class: 'd-head' }, h('div', null, h('h1', { text: 'Texto da proposta' }),
      h('p', { class: 'd-meta', text: 'Usado nas propostas novas. Propostas já criadas guardam o texto que tinham.' }))));
    el.appendChild(h('div', { class: 'd-grid' },
      h('section', { class: 'card wide' },
        h('div', { class: 'link-row editor-actions' }, btnSalvar, btnTestar, btnPadrao, estado),
        ta),
      h('section', { class: 'card' }, h('h2', { text: 'Formato' }),
        h('ul', { class: 'help-list' },
          h('li', null, h('code', { text: '## Título' }), ' nova secção  ·  ', h('code', { text: '### Subtítulo' })),
          h('li', null, 'Linha em branco separa parágrafos'),
          h('li', null, h('code', { text: '- item' }), ' lista  ·  ', h('code', { text: '1. item' }), ' lista numerada'),
          h('li', null, h('code', { text: '**negrito**' }), '  ·  ', h('code', { text: '[texto](/exemplos/eletricista)' }), ' link'),
          h('li', null, h('code', { text: '> texto' }), ' caixa de destaque'),
          h('li', null, h('code', { text: '| a | b |' }), ' tabela: a 1.ª linha é o cabeçalho'))),
      h('section', { class: 'card' }, h('h2', { text: 'Campos (clique para inserir)' }),
        h('p', { class: 'muted small', text: 'São trocados pelos valores das Configurações. Em branco aparecem como "a combinar".' }),
        camposList)));
  }

  function renderFormulario(r) {
    var extrasBox = h('div', { class: 'opt-list' });
    var paletasBox = h('div', { class: 'opt-list' });
    function extraRow(x) {
      var inp = textInput('label', x ? x.label : '', { maxlength: '60', placeholder: 'Ex.: Criação de logotipo', 'aria-label': 'Nome do extra' });
      inp.setAttribute('data-id', x ? x.id : '');
      var row = h('div', { class: 'opt-row' }, inp,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Remover extra', onclick: function () { row.remove(); } }, '×'));
      return row;
    }
    function paletaRow(p) {
      var nome = textInput('label', p ? p.label : '', { maxlength: '30', placeholder: 'Nome', 'aria-label': 'Nome da paleta' });
      nome.setAttribute('data-id', p ? p.id : '');
      var c1 = h('input', { type: 'color', 'aria-label': 'Cor principal' }); c1.value = p ? p.c1 : '#1e3a5f';
      var c2 = h('input', { type: 'color', 'aria-label': 'Cor de destaque' }); c2.value = p ? p.c2 : '#f2b134';
      var row = h('div', { class: 'opt-row' }, nome, c1, c2,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Remover paleta', onclick: function () { row.remove(); } }, '×'));
      return row;
    }
    r.extras.forEach(function (x) { extrasBox.appendChild(extraRow(x)); });
    r.paletas.forEach(function (p) { paletasBox.appendChild(paletaRow(p)); });

    // Textos das etapas: em branco volta ao padrão (mostrado como exemplo).
    var textosBox = h('div', { class: 'form-grid' });
    var grupo = null;
    r.textosCampos.forEach(function (c) {
      if (c.grupo !== grupo) { grupo = c.grupo; textosBox.appendChild(h('h3', { class: 'wide form-group', text: grupo })); }
      var atual = r.textos[c.chave] || '';
      var longo = c.max > 160;
      var inp = longo
        ? textArea(c.chave, atual === c.padrao ? '' : atual, { maxlength: String(c.max), class: 'ta-sm', placeholder: c.padrao, 'data-txt': c.chave })
        : textInput(c.chave, atual === c.padrao ? '' : atual, { maxlength: String(c.max), placeholder: c.padrao, 'data-txt': c.chave });
      textosBox.appendChild((longo ? wideField : formField)(c.rotulo, inp, atual !== c.padrao ? 'Alterado. Padrão: ' + c.padrao : null));
    });

    function coletar() {
      var textos = {};
      Array.prototype.forEach.call(textosBox.querySelectorAll('[data-txt]'), function (i) { textos[i.getAttribute('data-txt')] = i.value; });
      return {
        textos: textos,
        extras: Array.prototype.map.call(extrasBox.querySelectorAll('.opt-row'), function (row) {
          var i = row.querySelector('input[type=text]');
          return { id: i.getAttribute('data-id'), label: i.value };
        }),
        paletas: Array.prototype.map.call(paletasBox.querySelectorAll('.opt-row'), function (row) {
          var i = row.querySelector('input[type=text]'), cs = row.querySelectorAll('input[type=color]');
          return { id: i.getAttribute('data-id'), label: i.value, c1: cs[0].value, c2: cs[1].value };
        })
      };
    }
    var salvar = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Salvar');
    salvar.addEventListener('click', function () {
      api('PUT', '/adm/formulario', coletar()).then(function (x) { toast('Opções salvas'); loadFormOptions(); renderFormulario(x); })
        .catch(function (e) { toast(e.message, true); });
    });
    var testar = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Salvar e testar');
    testar.addEventListener('click', function () {
      api('PUT', '/adm/formulario', coletar()).then(criarPropostaTeste).then(function (id) {
        return api('POST', '/adm/propostas/' + id + '/convite').then(function () { return id; });
      }).then(function (id) {
        toast('Formulário de teste liberado: abra o link na proposta de teste');
        location.hash = '#/proposta/' + id;
      }).catch(function (e) { toast(e.message, true); });
    });
    var padrao = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, 'Restaurar opções padrão');
    padrao.addEventListener('click', function () {
      if (!padrao.classList.contains('confirm')) { padrao.classList.add('confirm'); padrao.textContent = 'Confirmar'; setTimeout(function () { padrao.classList.remove('confirm'); padrao.textContent = 'Restaurar opções padrão'; }, 5000); return; }
      api('PUT', '/adm/formulario', { restaurar: true }).then(function (x) { toast('Opções padrão restauradas'); loadFormOptions(); renderFormulario(x); })
        .catch(function (e) { toast(e.message, true); });
    });
    var padraoTextos = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, 'Restaurar textos padrão');
    padraoTextos.addEventListener('click', function () {
      if (!padraoTextos.classList.contains('confirm')) { padraoTextos.classList.add('confirm'); padraoTextos.textContent = 'Confirmar: perder os textos editados'; setTimeout(function () { padraoTextos.classList.remove('confirm'); padraoTextos.textContent = 'Restaurar textos padrão'; }, 5000); return; }
      api('PUT', '/adm/formulario', { restaurarTextos: true }).then(function (x) { toast('Textos padrão restaurados'); renderFormulario(x); })
        .catch(function (e) { toast(e.message, true); });
    });

    var el = $('detail');
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(configNav('#/config/formulario'));
    el.appendChild(h('div', { class: 'd-head' }, h('div', null, h('h1', { text: 'Formulário' }),
      h('p', { class: 'd-meta', text: 'Vale para todos os clientes: extras (etapa 2), paletas (etapa 3) e os textos de cada etapa do /comecar. Para um cliente só, use "Personalizar formulário" na proposta.' }))));
    el.appendChild(h('div', { class: 'd-grid' },
      h('section', { class: 'card wide' }, h('div', { class: 'link-row' }, salvar, testar, padrao)),
      h('section', { class: 'card' }, h('h2', { text: 'Extras (etapa 2)' }),
        h('p', { class: 'muted small', text: 'Sem nenhum extra, a secção não aparece no formulário.' }),
        extrasBox,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { extrasBox.appendChild(extraRow(null)); } }, '+ Extra')),
      h('section', { class: 'card' }, h('h2', { text: 'Paletas de cores (etapa 3)' }),
        h('p', { class: 'muted small', text: 'Nome, cor principal e cor de destaque. A primeira vem selecionada.' }),
        paletasBox,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { paletasBox.appendChild(paletaRow(null)); } }, '+ Paleta')),
      h('section', { class: 'card wide' }, h('h2', { text: 'Textos das etapas' }),
        h('p', { class: 'muted small', text: 'Em branco usa o texto padrão (aparece em cinza como exemplo). Os botões Salvar acima guardam também os textos.' }),
        textosBox,
        h('div', { class: 'link-row editor-actions' }, padraoTextos))));
  }

  // ---------- arranque ----------
  fetch('/adm/session', { credentials: 'same-origin' }).then(function (res) {
    return res.json().then(function (data) { return { res: res, data: data }; });
  }).then(function (r) {
    if (r.res.ok && r.data.ok) showApp(r.data.user); else showLogin();
  }).catch(function () { showLogin('Sem ligação com o servidor.'); });
})();
