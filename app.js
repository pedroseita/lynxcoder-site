/* ===== LynxCoder — interactions ===== */
(function () {
  'use strict';

  /* nav shadow on scroll */
  var nav = document.getElementById('nav');
  function onScroll() {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* scroll reveal */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- terminal typing animation — deploy workflow ---- */
  var out = document.getElementById('term-out');
  var cursor = document.getElementById('cursor');
  if (out && !reduce) {
    var L = function (cls, text) { return { cls: cls, text: text }; };
    var script = [
      L('term-prompt', '$ git add . && git commit -m "feat: nova plataforma cliente"\n'),
      L('term-dim',    '[main 3a7f2c1] feat: nova plataforma cliente\n'),
      L('term-dim',    ' 12 files changed, 847 insertions(+), 23 deletions(-)\n'),
      L('term-prompt', '\n$ git push origin main\n'),
      L('term-comment','▸ a enviar para produção…\n'),
      L('term-path',   '  ~ build concluído em 34s\n'),
      L('term-path',   '  ~ testes passados: 96/96\n'),
      L('term-add',    '  + deploy em lynxcoder.com.br\n'),
      L('term-ok',     '\n✔ em produção — https://cliente.com.br ↗\n')
    ];

    var li = 0, ci = 0;
    function type() {
      if (li >= script.length) {
        setTimeout(function () { out.innerHTML = ''; li = 0; ci = 0; type(); }, 4200);
        return;
      }
      var item = script[li];
      if (ci === 0) {
        var span = document.createElement('span');
        span.className = item.cls;
        span.dataset.li = li;
        out.appendChild(span);
      }
      var span2 = out.querySelector('span[data-li="' + li + '"]');
      span2.textContent = item.text.slice(0, ci + 1);
      ci++;
      if (ci >= item.text.length) { li++; ci = 0; }
      var ch = item.text[Math.max(0, ci - 1)];
      var delay = ch === '\n' ? 90 : (item.cls === 'term-add' || item.cls === 'term-dim' ? 8 : 16);
      setTimeout(type, delay);
    }
    var startSeen = false;
    var term = out.closest('.terminal');
    function kick() { if (!startSeen) { startSeen = true; type(); } }
    if ('IntersectionObserver' in window && term) {
      var tio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { kick(); tio.disconnect(); } });
      }, { threshold: 0.4 });
      tio.observe(term);
      setTimeout(kick, 1000);
    } else { kick(); }
  } else if (out && reduce) {
    out.textContent = '$ git push origin main\n✔ em produção — deploy concluído com sucesso';
    if (cursor) cursor.style.display = 'none';
  }

  /* scroll reveal for .reveal elements */
  if (!reduce && 'IntersectionObserver' in window) {
    var revealEls = document.querySelectorAll('.reveal');
    var rio = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          rio.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function(el) { rio.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function(el) {
      el.classList.add('visible');
    });
  }
})();

(function() {
  var burger = document.getElementById('navBurger');
  var mobile = document.getElementById('navMobile');
  burger.addEventListener('click', function() {
    var open = burger.classList.toggle('open');
    mobile.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
    mobile.setAttribute('aria-hidden', !open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  mobile.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function() {
      burger.classList.remove('open');
      mobile.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      mobile.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    });
  });
})();
