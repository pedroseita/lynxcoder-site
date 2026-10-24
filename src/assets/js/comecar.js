/* ===== LynxCoder — /comecar: onboarding de clientes =====
   Vanilla JS, sem dependências (a CSP só permite scripts de 'self').
   Os dados vão em multipart para POST /api/onboarding (serviço em api/). */
(function () {
  'use strict';

  var API_URL = '/api/onboarding';
  var DRAFT_KEY = 'lynx-onboarding-draft-v1';
  var TOTAL_STEPS = 6;
  var MAX_PHOTOS = 12;
  var MIN_PHOTOS = 3;
  var MAX_LOGO_BYTES = 5 * 1024 * 1024;
  var MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  var RESERVED_SUBDOMAINS = ['www', 'api', 'blog', 'mail', 'email', 'admin', 'app', 'ftp', 'smtp', 'cdn', 'static', 'dev', 'staging', 'teste', 'test', 'lynx', 'lynxcoder', 'comecar'];

  // Extras oferecidos na etapa 2. Para acrescentar um, basta uma linha aqui.
  var EXTRAS = [
    { id: 'manutencao', label: 'Manutenção' }
  ];

  var PALETTES = [
    { id: 'confianca', label: 'Confiança', c1: '#1e3a5f', c2: '#f2b134' },
    { id: 'natureza', label: 'Natureza', c1: '#2f5d3a', c2: '#e9c46a' },
    { id: 'energia', label: 'Energia', c1: '#9e2a2b', c2: '#ffd166' },
    { id: 'elegante', label: 'Elegante', c1: '#1c1c1e', c2: '#c9a227' },
    { id: 'moderno', label: 'Moderno', c1: '#33296b', c2: '#2dd4bf' },
    { id: 'claro', label: 'Claro', c1: '#eef3f7', c2: '#1f6f9f' }
  ];

  var STEP_TITLES = ['Seu negócio', 'Plano e endereço', 'Logotipo e cores', 'Seus serviços', 'Fotos e depoimentos', 'Confira e envie'];

  // ---------- estado ----------
  var state = {
    step: 1,
    subdominioManual: false,
    servicos: [{ nome: '', descricao: '' }, { nome: '', descricao: '' }, { nome: '', descricao: '' }],
    depoimentos: [],
    files: { logo: null, fotos: [], retrato: null },  // { file, url }
    submitted: false,
    sending: false
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var form = $('#obForm');
  var field = function (name) { return form.elements[name]; };
  var val = function (name) {
    var el = field(name);
    if (!el) return '';
    if (el instanceof RadioNodeList) return el.value;
    if (el.type === 'checkbox') return el.checked;
    return (el.value || '').trim();
  };

  // ---------- utilidades ----------
  function slugify(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  }
  function digits(s) { return (s || '').replace(/\D/g, ''); }
  // O preenchimento automático do browser entrega "+55 21 9…" e há quem
  // escreva o 55 ou o 0 da operadora à mão: tirar esse prefixo antes de
  // contar os 11 dígitos, senão o 55 virava DDD e o número ficava cortado.
  function nationalDigits(s) {
    var d = digits(s);
    if (d.length >= 12 && d.slice(0, 2) === '55') d = d.slice(2);
    if (d.length >= 11 && d.charAt(0) === '0') d = d.slice(1);
    return d.slice(0, 11);
  }
  function maskPhone(s) {
    var d = nationalDigits(s);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function validPhone(s) {
    var d = nationalDigits(s);
    if (d.length !== 10 && d.length !== 11) return false;
    var ddd = parseInt(d.slice(0, 2), 10);
    if (ddd < 11 || ddd > 99) return false;
    // fixo: 10 dígitos começando por 2–5; celular: 11 dígitos começando por 9
    return d.length === 10 ? /[2-5]/.test(d.charAt(2)) : d.charAt(2) === '9';
  }
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }
  function cleanHandle(s) {
    return (s || '').trim().replace(/^https?:\/\/(www\.)?[^/]+\//i, '').replace(/^@+/, '').replace(/[/?#].*$/, '');
  }
  function normalizeDomain(s) {
    return (s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }
  function validDomain(s) {
    // sem lookbehind: Safari < 16.4 não o suporta e o script inteiro deixaria de carregar
    return s.length <= 100 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(s);
  }
  function subdomainProblem(s) {
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s)) return 'format';
    if (/--/.test(s)) return 'format';
    if (RESERVED_SUBDOMAINS.indexOf(s) !== -1) return 'reserved';
    return '';
  }
  function luminance(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0;
    var n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255].map(function (c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce(function (acc, c, i) { return acc + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function inkFor(hex) { return luminance(hex) > 0.42 ? '#14171c' : '#ffffff'; }
  function formatBytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(n / 1024) + ' KB'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  // ---------- montagem dinâmica (extras, paletas, listas) ----------
  $('#extrasList').innerHTML = EXTRAS.map(function (x) {
    return '<label class="ob-check"><input type="checkbox" name="extras" value="' + esc(x.id) + '"><span><strong>' + esc(x.label) + '</strong></span></label>';
  }).join('');

  $('#paletteList').innerHTML = PALETTES.map(function (p, i) {
    return '<label class="ob-palette"><input type="radio" name="paleta" value="' + p.id + '"' + (i === 0 ? ' checked' : '') + '>' +
      '<span class="ob-palette-body"><span class="ob-palette-swatch"><i style="background:' + p.c1 + '"></i><i style="background:' + p.c2 + '"></i></span>' +
      '<span>' + esc(p.label) + '</span></span></label>';
  }).join('');

  function renderList(kind) {
    var isService = kind === 'servicos';
    var list = state[kind];
    var box = isService ? $('#servicesList') : $('#testimonialsList');
    box.innerHTML = list.map(function (item, i) {
      var a = isService ? item.nome : item.nome;
      var b = isService ? item.descricao : item.texto;
      return '<div class="ob-item" data-kind="' + kind + '" data-index="' + i + '">' +
        '<span class="ob-item-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="ob-item-fields">' +
        '<input type="text" data-key="nome" maxlength="' + (isService ? 60 : 60) + '" aria-label="' + (isService ? 'Nome do serviço ' : 'Nome do cliente ') + (i + 1) + '" placeholder="' + (isService ? 'Nome do serviço, ex.: Instalação de chuveiro' : 'Nome do cliente, ex.: Maria S.') + '" value="' + esc(a) + '">' +
        (isService
          ? '<input type="text" data-key="descricao" maxlength="160" aria-label="Descrição do serviço ' + (i + 1) + ' (opcional)" placeholder="Descrição curta (opcional)" value="' + esc(b) + '">'
          : '<textarea data-key="texto" maxlength="400" rows="2" aria-label="Depoimento ' + (i + 1) + '" placeholder="O que o cliente disse sobre o seu trabalho">' + esc(b) + '</textarea>') +
        '</div>' +
        '<button type="button" class="ob-item-remove" aria-label="Remover ' + (isService ? 'serviço ' : 'depoimento ') + (i + 1) + '">×</button>' +
        '</div>';
    }).join('');
    $('#addService').hidden = state.servicos.length >= 10;
    $('#addTestimonial').hidden = state.depoimentos.length >= 6;
  }

  function onListEvent(e) {
    var item = e.target.closest('.ob-item');
    if (!item) return;
    var kind = item.getAttribute('data-kind');
    var i = parseInt(item.getAttribute('data-index'), 10);
    if (e.type === 'click' && e.target.classList.contains('ob-item-remove')) {
      state[kind].splice(i, 1);
      if (kind === 'servicos' && !state.servicos.length) state.servicos.push({ nome: '', descricao: '' });
      renderList(kind);
      changed();
      return;
    }
    if (e.type === 'input' && e.target.getAttribute('data-key')) {
      state[kind][i][e.target.getAttribute('data-key')] = e.target.value;
      if (kind === 'servicos') clearError('servicos');
      changed();
    }
  }
  ['#servicesList', '#testimonialsList'].forEach(function (sel) {
    $(sel).addEventListener('input', onListEvent);
    $(sel).addEventListener('click', onListEvent);
  });
  $('#addService').addEventListener('click', function () {
    state.servicos.push({ nome: '', descricao: '' });
    renderList('servicos');
    $('#servicesList .ob-item:last-child input').focus();
  });
  $('#addTestimonial').addEventListener('click', function () {
    state.depoimentos.push({ nome: '', texto: '' });
    renderList('depoimentos');
    $('#testimonialsList .ob-item:last-child input').focus();
  });

  // ---------- erros ----------
  function errorBox(key) { return $('[data-error-for="' + key + '"]'); }
  function showError(key, msg) {
    var box = errorBox(key);
    if (!box) return;
    if (msg) box.textContent = msg;
    var wrap = box.closest('.ob-field');
    if (wrap) wrap.classList.add('invalid'); else box.classList.add('show');
  }
  function clearError(key) {
    var box = errorBox(key);
    if (!box) return;
    var wrap = box.closest('.ob-field');
    if (wrap) wrap.classList.remove('invalid');
    box.classList.remove('show');
  }

  // ---------- validação por etapa ----------
  function validateStep(step) {
    var errors = [];
    function check(ok, key, msg) { if (ok) clearError(key); else { showError(key, msg); errors.push(key); } }

    if (step === 1) {
      check(val('nome').length >= 2, 'nome');
      check(val('especialidade').length >= 2, 'especialidade');
      check(val('cidade').length >= 2, 'cidade');
      check(validPhone(val('whatsapp')), 'whatsapp', nationalDigits(val('whatsapp')).slice(0, 2) === '55'
        ? 'Parece que incluiu o código do país (55). Informe só o DDD e o número, ex.: (21) 97598-4112.'
        : 'Informe um WhatsApp com DDD.');
      check(validEmail(val('email')), 'email');
    }
    if (step === 2) {
      if (val('plano') === 'essencial') {
        var p = subdomainProblem(val('subdominio'));
        check(!p, 'subdominio', p === 'reserved'
          ? 'Esse endereço é reservado. Escolha outro.'
          : 'Use de 3 a 40 caracteres: letras minúsculas, números e hífen, sem hífen no começo ou no fim.');
      } else {
        check(validDomain(normalizeDomain(val('dominio'))), 'dominio');
      }
    }
    if (step === 4) {
      check(state.servicos.some(function (s) { return s.nome.trim().length >= 2; }), 'servicos');
    }
    if (step === 5) {
      check(state.files.fotos.length >= MIN_PHOTOS, 'fotos', 'Envie pelo menos ' + MIN_PHOTOS + ' fotos de trabalhos.');
    }
    if (step === 6) {
      check(val('consentUso') && val('consentTermos'), 'consent');
    }
    return errors;
  }

  // ---------- navegação ----------
  function goTo(step, opts) {
    state.step = step;
    $$('.ob-step').forEach(function (s) {
      s.hidden = s.getAttribute('data-step') !== String(step);
    });
    var done = step === 'done';
    $$('#progress span').forEach(function (bar, i) { bar.classList.toggle('on', done || i < step); });
    $('#stepLabel').textContent = done ? 'Enviado' : 'Etapa ' + step + ' de ' + TOTAL_STEPS + ': ' + STEP_TITLES[step - 1];
    $('#stepNav').hidden = done;
    $('#prevBtn').hidden = done || step === 1;
    $('#nextBtn').textContent = step === TOTAL_STEPS ? 'Enviar informações' : 'Continuar →';
    if (step === TOTAL_STEPS) renderReview();
    if (!opts || !opts.silent) {
      var target = $('.ob-step:not([hidden]) .ob-title');
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    saveDraft();
  }

  // "Continuar" é o botão submit do formulário: Enter num campo também avança.
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.sending || state.step === 'done') return;
    var errs = validateStep(state.step);
    if (errs.length) {
      var first = errorBox(errs[0]);
      var wrap = first && (first.closest('.ob-field') || first);
      var input = wrap && wrap.querySelector('input, textarea');
      if (input) input.focus(); else if (wrap) wrap.scrollIntoView({ block: 'center' });
      return;
    }
    if (state.step < TOTAL_STEPS) goTo(state.step + 1);
    else submit();
  });
  $('#prevBtn').addEventListener('click', function () { if (!state.sending && state.step > 1) goTo(state.step - 1); });

  // ---------- comportamento dos campos ----------
  field('whatsapp').addEventListener('input', function (e) {
    e.target.value = maskPhone(e.target.value);
  });
  field('nome').addEventListener('input', function () {
    if (!state.subdominioManual) field('subdominio').value = slugify(val('nome'));
  });
  field('subdominio').addEventListener('input', function (e) {
    var clean = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    if (clean !== e.target.value) e.target.value = clean;
    state.subdominioManual = clean.length > 0;
  });
  ['instagram', 'tiktok'].forEach(function (n) {
    field(n).addEventListener('change', function (e) { e.target.value = cleanHandle(e.target.value); changed(); });
  });
  field('dominio').addEventListener('change', function (e) { e.target.value = normalizeDomain(e.target.value); changed(); });

  function syncPlan() {
    var plan = val('plano');
    $$('[data-show-plan]').forEach(function (el) { el.hidden = el.getAttribute('data-show-plan') !== plan; });
    $('#dominioHint').textContent = val('dominioRegistrado') === 'nao'
      ? 'Indique o domínio que pretende registrar. Ajudamos no registro no Registro.br.'
      : 'Depois do envio, mandamos os dois apontamentos para você criar no Registro.br.';
  }

  function syncColors(fromPalette) {
    if (fromPalette) {
      var p = PALETTES.filter(function (x) { return x.id === val('paleta'); })[0];
      if (p) { field('corPrincipal').value = p.c1; field('corDestaque').value = p.c2; }
    }
    $('#cor1Code').textContent = field('corPrincipal').value.toUpperCase();
    $('#cor2Code').textContent = field('corDestaque').value.toUpperCase();
  }
  // O "input" do formulário (que redesenha a prévia) dispara antes deste
  // "change", por isso a prévia tem de ser redesenhada aqui com as cores novas.
  $('#paletteList').addEventListener('change', function () { syncColors(true); changed(); });
  ['corPrincipal', 'corDestaque'].forEach(function (n) {
    field(n).addEventListener('input', function () {
      $$('input[name=paleta]').forEach(function (r) { r.checked = false; });
      syncColors(false);
    });
  });

  // limpa o erro de um campo assim que o utilizador o corrige
  form.addEventListener('input', function (e) {
    var name = e.target.name;
    if (name && errorBox(name)) clearError(name);
    if (name === 'consentUso' || name === 'consentTermos') clearError('consent');
    if (name === 'plano' || name === 'dominioRegistrado') syncPlan();
    changed();
  });

  // ---------- ficheiros ----------
  var IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  // Reduz fotos grandes no próprio aparelho antes do envio: 12 fotos de 8 MB
  // por dados móveis demorariam minutos. Resolve com null se o ficheiro não
  // abrir como imagem (ex.: extensão .jpg num ficheiro que não é imagem) — o
  // servidor recusá-lo-ia no fim, sem dizer qual era.
  function prepareImage(file) {
    if (file.type === 'image/svg+xml' || !window.createImageBitmap) return Promise.resolve(file);
    var MAX_DIM = 2400;
    return createImageBitmap(file).then(function (bmp) {
      var scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size <= 1.5 * 1024 * 1024) { bmp.close && bmp.close(); return file; }
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close && bmp.close();
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob || blob.size >= file.size) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      });
    }).catch(function () { return null; });
  }

  function makeThumb(entry, onRemove, label) {
    var div = document.createElement('div');
    div.className = 'ob-thumb';
    var img = document.createElement('img');
    img.src = entry.url;
    img.alt = label;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.setAttribute('aria-label', 'Remover ' + label);
    btn.addEventListener('click', onRemove);
    div.appendChild(img);
    div.appendChild(btn);
    return div;
  }

  function renderFiles() {
    var thumbs = $('#photoThumbs');
    thumbs.innerHTML = '';
    state.files.fotos.forEach(function (entry, i) {
      thumbs.appendChild(makeThumb(entry, function () {
        URL.revokeObjectURL(entry.url);
        state.files.fotos.splice(i, 1);
        renderFiles();
        changed();
      }, 'foto ' + (i + 1)));
    });
    var pt = $('#portraitThumb');
    pt.innerHTML = '';
    if (state.files.retrato) {
      pt.appendChild(makeThumb(state.files.retrato, function () {
        URL.revokeObjectURL(state.files.retrato.url);
        state.files.retrato = null;
        renderFiles();
        changed();
      }, 'foto sua'));
    }
    var lp = $('#logoPreview');
    lp.hidden = !state.files.logo;
    if (state.files.logo) $('img', lp).src = state.files.logo.url;
    $('#f-fotos').closest('.ob-drop').hidden = state.files.fotos.length >= MAX_PHOTOS;
  }

  $('#f-logo').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (IMAGE_TYPES.concat('image/svg+xml').indexOf(file.type) === -1 || file.size > MAX_LOGO_BYTES) {
      showError('logo');
      return;
    }
    clearError('logo');
    if (state.files.logo) URL.revokeObjectURL(state.files.logo.url);
    state.files.logo = { file: file, url: URL.createObjectURL(file) };
    renderFiles();
    changed();
  });
  $('#logoRemove').addEventListener('click', function () {
    URL.revokeObjectURL(state.files.logo.url);
    state.files.logo = null;
    renderFiles();
    changed();
  });

  $('#f-fotos').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files);
    e.target.value = '';
    var rejected = 0;
    var room = MAX_PHOTOS - state.files.fotos.length;
    var accepted = files.filter(function (f) {
      var ok = IMAGE_TYPES.indexOf(f.type) !== -1 && f.size <= MAX_PHOTO_BYTES;
      if (!ok) rejected++;
      return ok;
    });
    var extra = Math.max(0, accepted.length - room);
    accepted = accepted.slice(0, room);
    Promise.all(accepted.map(prepareImage)).then(function (prepared) {
      prepared.forEach(function (f) {
        if (f) state.files.fotos.push({ file: f, url: URL.createObjectURL(f) });
        else rejected++;
      });
      renderFiles();
      changed();
      var msgs = [];
      if (rejected) msgs.push(rejected + (rejected > 1 ? ' fotos não foram aceitas' : ' foto não foi aceita') + ' (use JPG, PNG ou WEBP de até 8 MB).');
      if (extra) msgs.push('O limite é de ' + MAX_PHOTOS + ' fotos; ' + extra + ' ficaram de fora.');
      if (msgs.length) showError('fotos', msgs.join(' '));
      else if (state.files.fotos.length >= MIN_PHOTOS) clearError('fotos');
    });
  });

  $('#f-retrato').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file || IMAGE_TYPES.indexOf(file.type) === -1 || file.size > MAX_PHOTO_BYTES) return;
    prepareImage(file).then(function (f) {
      if (!f) return;
      if (state.files.retrato) URL.revokeObjectURL(state.files.retrato.url);
      state.files.retrato = { file: f, url: URL.createObjectURL(f) };
      renderFiles();
      changed();
    });
  });

  // arrastar e largar nas áreas de upload (desktop)
  $$('.ob-drop').forEach(function (drop) {
    ['dragenter', 'dragover'].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      drop.addEventListener(t, function () { drop.classList.remove('drag'); });
    });
  });

  // ---------- prévia ao vivo ----------
  function renderPreview() {
    var pv = $('#preview');
    var c1 = field('corPrincipal').value;
    var c2 = field('corDestaque').value;
    pv.style.setProperty('--pv-1', c1);
    pv.style.setProperty('--pv-2', c2);
    $('#pvHero').style.color = inkFor(c1);
    $('#pvCta').style.color = inkFor(c2);

    var nome = val('nome');
    var esp = val('especialidade');
    var cid = val('cidade');
    $('#pvName').textContent = nome || 'Seu negócio';
    $('#pvTag').textContent = (esp || 'Sua especialidade') + ' em ' + (cid || 'sua cidade');

    var url = val('plano') === 'profissional'
      ? 'www.' + (normalizeDomain(val('dominio')) || 'seunome.com.br')
      : (val('subdominio') || 'seunome') + '.lynxcoder.com.br';
    $('#pvUrl').textContent = url;

    var logo = $('#pvLogo');
    logo.hidden = !state.files.logo;
    if (state.files.logo) logo.src = state.files.logo.url;
    $('#pvName').hidden = !!state.files.logo && !nome;

    var names = state.servicos.map(function (s) { return s.nome.trim(); }).filter(Boolean);
    $('#pvServices').innerHTML = names.length
      ? names.slice(0, 6).map(function (n) { return '<span class="pv-chip">' + esc(n) + '</span>'; }).join('')
      : '<span class="pv-chip muted">Seus serviços aparecem aqui</span>';

    var photos = $('#pvPhotos');
    photos.innerHTML = '';
    var shown = state.files.fotos.slice(0, 6);
    shown.forEach(function (p) {
      var img = document.createElement('img');
      img.src = p.url;
      img.alt = '';
      photos.appendChild(img);
    });
    for (var i = shown.length; i < 3; i++) photos.appendChild(document.createElement('span'));

    var story = val('historia');
    $('#pvAbout').hidden = !story && !state.files.retrato;
    $('#pvStory').textContent = story;
    var portrait = $('#pvPortrait');
    portrait.hidden = !state.files.retrato;
    if (state.files.retrato) portrait.src = state.files.retrato.url;

    var social = [];
    if (val('instagram')) social.push('Instagram');
    if (val('facebook')) social.push('Facebook');
    if (val('tiktok')) social.push('TikTok');
    if (val('youtube')) social.push('YouTube');
    $('#pvSocial').hidden = !social.length;
    $('#pvSocial').innerHTML = social.map(function (s) { return '<span>' + s + '</span>'; }).join('');
  }

  $('#previewOpen').addEventListener('click', function () {
    $('#previewPanel').classList.add('open');
    $('#previewOpen').hidden = true;
    $('#previewClose').focus();
  });
  $('#previewClose').addEventListener('click', function () {
    $('#previewPanel').classList.remove('open');
    $('#previewOpen').hidden = false;
    $('#previewOpen').focus();
  });

  // ---------- revisão ----------
  function row(label, value) {
    return value ? '<dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd>' : '';
  }
  function block(step, title, rows) {
    return '<div class="ob-review-block"><div class="ob-review-head"><h3>' + esc(title) + '</h3>' +
      '<button type="button" class="ob-link" data-edit="' + step + '">Editar</button></div><dl>' + rows + '</dl></div>';
  }
  function renderReview() {
    var d = collect();
    var redes = ['instagram', 'facebook', 'tiktok', 'youtube'].filter(function (k) { return d.negocio.redes[k]; })
      .map(function (k) { return k === 'instagram' || k === 'tiktok' ? k + ': @' + d.negocio.redes[k] : k; }).join(', ');
    var extras = d.plano.extras.map(function (id) {
      var x = EXTRAS.filter(function (e) { return e.id === id; })[0];
      return x ? x.label : id;
    }).join(', ');
    var paleta = PALETTES.filter(function (p) { return p.id === d.visual.paleta; })[0];
    $('#review').innerHTML =
      block(1, 'Seu negócio',
        row('Nome', d.negocio.nome) + row('Especialidade', d.negocio.especialidade) + row('Cidade', d.negocio.cidade) +
        row('Atendimento', d.negocio.area) + row('WhatsApp', maskPhone(d.negocio.whatsapp)) + row('E-mail', d.negocio.email) + row('Redes', redes)) +
      block(2, 'Plano e endereço',
        row('Plano', d.plano.tipo === 'essencial' ? 'Essencial' : 'Profissional') +
        row('Endereço', d.plano.tipo === 'essencial' ? d.plano.subdominio + '.lynxcoder.com.br' : d.plano.dominio +
          (d.plano.dominioRegistrado ? ' (já registrado)' : ' (ainda vai registrar)')) +
        row('Extras', extras)) +
      block(3, 'Logotipo e cores',
        row('Logotipo', state.files.logo ? state.files.logo.file.name : 'Sem logotipo') +
        row('Cores', (paleta ? paleta.label + ' — ' : '') + d.visual.corPrincipal.toUpperCase() + ' / ' + d.visual.corDestaque.toUpperCase())) +
      block(4, 'Serviços', d.servicos.map(function (s, i) { return row(String(i + 1), s.nome + (s.descricao ? ' — ' + s.descricao : '')); }).join('')) +
      block(5, 'Fotos e depoimentos',
        row('Fotos', state.files.fotos.length + ' fotos (' + formatBytes(state.files.fotos.reduce(function (a, p) { return a + p.file.size; }, 0)) + ')') +
        row('Foto sua', state.files.retrato ? 'Sim' : '') +
        row('História', d.sobre.historia ? d.sobre.historia.slice(0, 140) + (d.sobre.historia.length > 140 ? '…' : '') : '') +
        row('Depoimentos', d.depoimentos.length ? String(d.depoimentos.length) : ''));
  }
  $('#review').addEventListener('click', function (e) {
    var step = e.target.getAttribute('data-edit');
    if (step) goTo(parseInt(step, 10));
  });

  // ---------- dados ----------
  function collect() {
    var plano = val('plano');
    return {
      versao: 1,
      negocio: {
        nome: val('nome'),
        especialidade: val('especialidade'),
        cidade: val('cidade'),
        area: val('area'),
        whatsapp: nationalDigits(val('whatsapp')),
        email: val('email').toLowerCase(),
        redes: {
          instagram: cleanHandle(val('instagram')),
          facebook: val('facebook'),
          tiktok: cleanHandle(val('tiktok')),
          youtube: val('youtube')
        }
      },
      plano: {
        tipo: plano,
        subdominio: plano === 'essencial' ? val('subdominio') : '',
        dominio: plano === 'profissional' ? normalizeDomain(val('dominio')) : '',
        dominioRegistrado: plano === 'profissional' ? val('dominioRegistrado') === 'sim' : null,
        extras: $$('input[name=extras]:checked').map(function (c) { return c.value; })
      },
      visual: {
        paleta: val('paleta') || 'personalizada',
        corPrincipal: field('corPrincipal').value,
        corDestaque: field('corDestaque').value
      },
      servicos: state.servicos
        .map(function (s) { return { nome: s.nome.trim(), descricao: s.descricao.trim() }; })
        .filter(function (s) { return s.nome; }),
      sobre: { historia: val('historia') },
      depoimentos: state.depoimentos
        .map(function (t) { return { nome: t.nome.trim(), texto: t.texto.trim() }; })
        .filter(function (t) { return t.texto; }),
      consentimentos: { uso: !!val('consentUso'), termos: !!val('consentTermos') }
    };
  }

  // ---------- rascunho local (sem ficheiros) ----------
  var SIMPLE_FIELDS = ['nome', 'especialidade', 'cidade', 'area', 'whatsapp', 'email', 'instagram', 'facebook', 'tiktok', 'youtube',
    'subdominio', 'dominio', 'corPrincipal', 'corDestaque', 'historia'];

  function saveDraft() {
    if (state.submitted) return;
    var draft = {
      step: typeof state.step === 'number' ? Math.min(state.step, 5) : 1,
      subdominioManual: state.subdominioManual,
      servicos: state.servicos,
      depoimentos: state.depoimentos,
      plano: val('plano'),
      dominioRegistrado: val('dominioRegistrado'),
      paleta: val('paleta'),
      extras: $$('input[name=extras]:checked').map(function (c) { return c.value; }),
      fields: {}
    };
    SIMPLE_FIELDS.forEach(function (n) { draft.fields[n] = field(n).value; });
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      $('#draftStatus').textContent = 'Rascunho salvo neste aparelho';
    } catch (e) { /* modo privado ou armazenamento cheio: segue sem rascunho */ }
  }
  var saveDraftSoon = debounce(saveDraft, 400);

  function loadDraft() {
    var draft;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; }
    if (!draft || typeof draft !== 'object') return false;
    Object.keys(draft.fields || {}).forEach(function (n) {
      if (SIMPLE_FIELDS.indexOf(n) !== -1 && typeof draft.fields[n] === 'string') field(n).value = draft.fields[n];
    });
    function setRadio(name, v) { $$('input[name=' + name + ']').forEach(function (r) { r.checked = r.value === v; }); }
    if (draft.plano) setRadio('plano', draft.plano);
    if (draft.dominioRegistrado) setRadio('dominioRegistrado', draft.dominioRegistrado);
    setRadio('paleta', draft.paleta || '');
    (draft.extras || []).forEach(function (id) {
      var c = $('input[name=extras][value="' + id + '"]');
      if (c) c.checked = true;
    });
    if (Array.isArray(draft.servicos) && draft.servicos.length) state.servicos = draft.servicos.slice(0, 10).map(function (s) {
      return { nome: String(s.nome || ''), descricao: String(s.descricao || '') };
    });
    if (Array.isArray(draft.depoimentos)) state.depoimentos = draft.depoimentos.slice(0, 6).map(function (t) {
      return { nome: String(t.nome || ''), texto: String(t.texto || '') };
    });
    state.subdominioManual = !!draft.subdominioManual;
    var step = parseInt(draft.step, 10);
    state.step = step >= 1 && step <= 5 ? step : 1;
    return true;
  }

  function changed() {
    renderPreview();
    saveDraftSoon();
  }

  // Fotos não vão para o rascunho: avisar antes de as perder ao sair.
  window.addEventListener('beforeunload', function (e) {
    var f = state.files;
    if (!state.submitted && (f.fotos.length || f.logo || f.retrato)) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- envio ----------
  function submit() {
    var data = collect();
    var fd = new FormData();
    fd.append('data', JSON.stringify(data));
    fd.append('website', val('website'));
    if (state.files.logo) fd.append('logo', state.files.logo.file, state.files.logo.file.name);
    state.files.fotos.forEach(function (p) { fd.append('fotos', p.file, p.file.name); });
    if (state.files.retrato) fd.append('retrato', state.files.retrato.file, state.files.retrato.file.name);

    var total = state.files.fotos.reduce(function (a, p) { return a + p.file.size; }, 0) +
      (state.files.logo ? state.files.logo.file.size : 0) + (state.files.retrato ? state.files.retrato.file.size : 0);

    state.sending = true;
    $('#nextBtn').disabled = true;
    $('#prevBtn').disabled = true;
    $('#nextBtn').textContent = 'A enviar…';
    $('#uploadBox').hidden = false;
    $('#submitError').textContent = '';
    $('#submitError').classList.remove('show');

    var xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL);
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.addEventListener('progress', function (e) {
      if (!e.lengthComputable) return;
      var pct = Math.round(e.loaded / e.total * 100);
      $('#uploadBar').style.width = pct + '%';
      $('#uploadText').textContent = pct < 100
        ? 'A enviar ' + pct + '% de ' + formatBytes(total) + '…'
        : 'A finalizar…';
    });
    xhr.addEventListener('load', function () {
      var res = null;
      try { res = JSON.parse(xhr.responseText); } catch (e) { /* resposta não-JSON (ex.: proxy) */ }
      if (xhr.status >= 200 && xhr.status < 300 && res && res.ok) return succeed(res.id);
      var msg = res && res.message;
      if (xhr.status === 413) msg = 'As fotos ficaram grandes demais para um único envio. Remova algumas e tente de novo.';
      else if (xhr.status === 429) msg = 'Recebemos muitos envios deste aparelho. Aguarde alguns minutos e tente de novo.';
      else if (xhr.status === 503) msg = 'O site está em manutenção neste momento. As suas respostas estão guardadas; tente de novo daqui a pouco.';
      fail(msg || 'Não foi possível enviar agora (erro ' + xhr.status + '). Tente de novo ou fale com a gente pelo e-mail devlynxcoder@gmail.com.');
    });
    xhr.addEventListener('error', function () { fail('Sem ligação com o servidor. Verifique a internet e tente de novo.'); });
    xhr.addEventListener('timeout', function () { fail('O envio demorou demais. Tente de novo numa rede mais rápida.'); });
    xhr.send(fd);
  }

  function fail(msg) {
    state.sending = false;
    $('#nextBtn').disabled = false;
    $('#prevBtn').disabled = false;
    $('#nextBtn').textContent = 'Tentar de novo';
    $('#uploadBox').hidden = true;
    $('#uploadBar').style.width = '0';
    var box = $('#submitError');
    box.textContent = msg;
    box.classList.add('show');
  }

  function succeed(id) {
    state.sending = false;
    state.submitted = true;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignorar */ }
    $('#draftStatus').textContent = '';
    $('#protocol').textContent = id;
    goTo('done');
  }

  // ---------- arranque ----------
  var restored = loadDraft();
  renderList('servicos');
  renderList('depoimentos');
  syncPlan();
  syncColors(!!val('paleta') && !restored);
  renderFiles();
  renderPreview();
  goTo(state.step, { silent: true });
  if (restored) $('#draftStatus').textContent = 'Rascunho recuperado deste aparelho';
})();
