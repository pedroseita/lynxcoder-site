/* Painel LynxCoder — vanilla JS, sem dependências.
   Todo o conteúdo vindo de clientes entra no DOM por textContent (nunca innerHTML). */
(function () {
  'use strict';

  var STATUS = {
    pedido: [['novo', 'Novo'], ['producao', 'Em produção'], ['publicado', 'Publicado'], ['arquivado', 'Arquivado']],
    mensagem: [['nova', 'Nova'], ['respondida', 'Respondida'], ['arquivada', 'Arquivada']]
  };
  var ARCHIVED = ['arquivado', 'arquivada'];
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
      renderList();
    }).catch(function (err) { if (err.message !== '401') toast(err.message, true); });
  }

  function renderList() {
    var list = $('items');
    list.textContent = '';
    var visible = state.items.filter(function (it) {
      if (state.type !== 'todos' && it.tipo !== state.type) return false;
      var arch = ARCHIVED.indexOf(it.status) !== -1;
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
          h('span', { class: 'kind', text: it.tipo === 'pedido' ? 'Pedido' : 'Contato' }),
          h('span', { class: 'item-title', text: it.titulo }),
          badge(it.tipo, it.status)),
        h('span', { class: 'item-sub', text: it.subtitulo }),
        h('span', { class: 'item-top' },
          h('span', { class: 'item-detail', text: it.detalhe }),
          h('span', { class: 'item-date', text: fmtDate(it.recebidoEm) }))
      )));
    });
    $('emptyList').hidden = visible.length > 0;
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
      if (!r.posts.length) { ul.appendChild(h('li', { class: 'muted', text: r.erro || 'Ainda sem posts publicados.' })); return; }
      r.posts.forEach(function (p) {
        ul.appendChild(h('li', null,
          h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', text: p.title }),
          h('span', { class: 'date', text: fmtDate(p.publishedAt) })));
      });
    }).catch(function () {});
  }

  // ---------- detalhe ----------
  function route() {
    var m = /^#\/(pedido|mensagem)\/([\w-]+)$/.exec(location.hash);
    var layout = document.querySelector('.layout');
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
    var url = m[1] === 'pedido' ? '/adm/pedidos/' + m[2] : '/adm/mensagens/' + m[2];
    api('GET', url).then(function (r) {
      if (m[1] === 'pedido') renderPedido(m[2], r); else renderMensagem(r.mensagem);
      $('detailEmpty').hidden = true;
      $('detail').hidden = false;
      window.scrollTo(0, 0);
    }).catch(function (err) {
      if (err.message === '401') return;
      toast(err.message, true);
      location.hash = '';
    });
  }
  window.addEventListener('hashchange', route);

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
      api('DELETE', (tipo === 'pedido' ? '/adm/pedidos/' : '/adm/mensagens/') + id).then(function () {
        toast(tipo === 'pedido' ? 'Pedido excluído, com todos os ficheiros' : 'Mensagem excluída');
        location.hash = '';
        loadItems();
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
      api('PATCH', (tipo === 'pedido' ? '/adm/pedidos/' : '/adm/mensagens/') + id, { notas: ta.value }).then(function (r) {
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
        h('p', { class: 'd-meta', text: 'Pedido ' + id + ' · recebido em ' + fmtDate(d.recebidoEm) })),
      h('div', { class: 'd-actions' },
        statusSelect('pedido', id, admin.status),
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
        ['Endereço', d.plano.tipo === 'essencial' ? d.plano.subdominio + '.lynxcoder.com.br' : d.plano.dominio],
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

  // ---------- arranque ----------
  fetch('/adm/session', { credentials: 'same-origin' }).then(function (res) {
    return res.json().then(function (data) { return { res: res, data: data }; });
  }).then(function (r) {
    if (r.res.ok && r.data.ok) showApp(r.data.user); else showLogin();
  }).catch(function () { showLogin('Sem ligação com o servidor.'); });
})();
