/* Painel LynxCoder — vanilla JS, sem dependências.
   Todo o conteúdo vindo de clientes entra no DOM por textContent (nunca innerHTML). */
(function () {
  'use strict';

  var STATUS = {
    pedido: [['novo', 'Novo'], ['producao', 'Em produção'], ['publicado', 'Publicado'], ['arquivado', 'Arquivado']],
    mensagem: [['nova', 'Nova'], ['respondida', 'Respondida'], ['arquivada', 'Arquivada']],
    proposta: [['enviada', 'Enviada'], ['aberta', 'Aberta'], ['aceita', 'Aceita'], ['formulario', 'Formulário liberado'],
      ['concluida', 'Pedido recebido'], ['expirada', 'Expirada'], ['cancelada', 'Cancelada']]
  };
  var ARCHIVED = ['arquivado', 'arquivada', 'cancelada', 'expirada', 'concluida'];
  var KIND = { pedido: 'Pedido', mensagem: 'Contato', proposta: 'Proposta' };
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
  function showDetail() {
    $('detailEmpty').hidden = true;
    $('detail').hidden = false;
    window.scrollTo(0, 0);
  }

  function route() {
    var layout = document.querySelector('.layout');
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
    var m = /^#\/(pedido|mensagem|proposta)\/([\w-]+)$/.exec(location.hash);
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
    var url = { pedido: '/adm/pedidos/', mensagem: '/adm/mensagens/', proposta: '/adm/propostas/' }[m[1]] + m[2];
    api('GET', url).then(function (r) {
      if (m[1] === 'pedido') renderPedido(m[2], r);
      else if (m[1] === 'mensagem') renderMensagem(r.mensagem);
      else renderProposta(r.proposta);
      showDetail();
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
      api('DELETE', { pedido: '/adm/pedidos/', mensagem: '/adm/mensagens/', proposta: '/adm/propostas/' }[tipo] + id).then(function () {
        toast({ pedido: 'Pedido excluído, com todos os ficheiros', mensagem: 'Mensagem excluída', proposta: 'Proposta excluída' }[tipo]);
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
        h('p', { class: 'd-meta', text: 'Pedido ' + id + ' · recebido em ' + fmtDate(d.recebidoEm) }),
        d.propostaId ? h('a', { class: 'link', href: '#/proposta/' + d.propostaId }, 'Ver a proposta deste cliente →') : null),
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

    var v = p.valores || {};
    var mailHref = c.email ? 'mailto:' + c.email + '?subject=' + encodeURIComponent('Proposta LynxCoder') + '&body=' + encodeURIComponent(msgProposta) : null;
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
      conviteCard));
  }

  function formField(label, input, hint) {
    return h('label', { class: 'f' }, h('span', { class: 'f-label', text: label }), input, hint ? h('span', { class: 'f-hint', text: hint }) : null);
  }
  function textInput(name, value, attrs) {
    var i = h('input', Object.assign({ type: 'text', name: name }, attrs || {}));
    i.value = value || '';
    return i;
  }

  function renderNovaProposta(cfg) {
    var v = cfg.valores;
    var form = h('form', { class: 'form-grid', novalidate: true },
      formField('Nome do cliente *', textInput('nome', '', { required: true, maxlength: '120', autocomplete: 'off' })),
      formField('Negócio', textInput('negocio', '', { maxlength: '120', placeholder: 'Ex.: Duarte Elétrica' }), 'Pré-preenche o formulário quando for liberado.'),
      formField('WhatsApp', textInput('whatsapp', '', { inputmode: 'tel', maxlength: '20', placeholder: '(21) 98765-4321' })),
      formField('E-mail', textInput('email', '', { type: 'email', maxlength: '160' })),
      formField('Essencial: implantação', textInput('essencial_implantacao', v.essencial_implantacao)),
      formField('Essencial: mensalidade', textInput('essencial_mensalidade', v.essencial_mensalidade)),
      formField('Profissional: implantação', textInput('profissional_implantacao', v.profissional_implantacao)),
      formField('Profissional: mensalidade', textInput('profissional_mensalidade', v.profissional_mensalidade)),
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
      toast(r.propostasApagadas + ' propostas e ' + r.pedidosApagados + ' pedidos de teste apagados');
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

    function coletar() {
      return {
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
    var padrao = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, 'Restaurar padrão');
    padrao.addEventListener('click', function () {
      if (!padrao.classList.contains('confirm')) { padrao.classList.add('confirm'); padrao.textContent = 'Confirmar'; setTimeout(function () { padrao.classList.remove('confirm'); padrao.textContent = 'Restaurar padrão'; }, 5000); return; }
      api('PUT', '/adm/formulario', { restaurar: true }).then(function (x) { toast('Opções padrão restauradas'); loadFormOptions(); renderFormulario(x); })
        .catch(function (e) { toast(e.message, true); });
    });

    var el = $('detail');
    el.textContent = '';
    el.appendChild(backLink());
    el.appendChild(configNav('#/config/formulario'));
    el.appendChild(h('div', { class: 'd-head' }, h('div', null, h('h1', { text: 'Opções do formulário' }),
      h('p', { class: 'd-meta', text: 'O que o cliente vê nas etapas 2 (extras) e 3 (paletas de cores) do /comecar.' }))));
    el.appendChild(h('div', { class: 'd-grid' },
      h('section', { class: 'card wide' }, h('div', { class: 'link-row' }, salvar, testar, padrao)),
      h('section', { class: 'card' }, h('h2', { text: 'Extras (etapa 2)' }),
        h('p', { class: 'muted small', text: 'Sem nenhum extra, a secção não aparece no formulário.' }),
        extrasBox,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { extrasBox.appendChild(extraRow(null)); } }, '+ Extra')),
      h('section', { class: 'card' }, h('h2', { text: 'Paletas de cores (etapa 3)' }),
        h('p', { class: 'muted small', text: 'Nome, cor principal e cor de destaque. A primeira vem selecionada.' }),
        paletasBox,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { paletasBox.appendChild(paletaRow(null)); } }, '+ Paleta'))));
  }

  // ---------- arranque ----------
  fetch('/adm/session', { credentials: 'same-origin' }).then(function (res) {
    return res.json().then(function (data) { return { res: res, data: data }; });
  }).then(function (r) {
    if (r.res.ok && r.data.ok) showApp(r.data.user); else showLogin();
  }).catch(function () { showLogin('Sem ligação com o servidor.'); });
})();
