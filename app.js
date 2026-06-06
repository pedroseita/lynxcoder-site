/* ===== Lynx Coder — interactions ===== */
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

  /* duplicate marquee logos for seamless loop */
  var track = document.getElementById('logos');
  if (track) {
    track.innerHTML += track.innerHTML;
  }

  /* scroll reveal is handled by an inline, fetch-independent script in the HTML
     so content is never stuck hidden if this file fails to load. */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- terminal typing animation ---- */
  var out = document.getElementById('term-out');
  var cursor = document.getElementById('cursor');
  if (out && !reduce) {
    var L = function (cls, text) { return { cls: cls, text: text }; };
    var script = [
      L('term-prompt', '$ lynx run "corrigir o teste instável de checkout"\n'),
      L('term-dim',    'Indexando repositório… '), L('term-ok', '1.2M LOC prontos\n'),
      L('term-comment','▸ reproduzindo instabilidade em 50 execuções\n'),
      L('term-del',    '  ✗ 3 / 50 falharam — gateway descartou a resposta\n'),
      L('term-comment','▸ criando plano\n'),
      L('term-dim',    '  1. adicionar retry exponencial em charge()\n'),
      L('term-dim',    '  2. cobrir caso de resposta descartada no teste\n'),
      L('term-path',   '\n  ~ src/checkout.service.ts\n'),
      L('term-add',    '  + const res = await retry(() => gateway.charge(order), {\n'),
      L('term-add',    '  +   attempts: 3, backoff: \'exponential\',\n'),
      L('term-add',    '  + });\n'),
      L('term-comment','\n▸ executando suíte de testes\n'),
      L('term-ok',     '  ✓ 142 / 142 passando · 200 execuções · 0 instáveis\n'),
      L('term-ok',     '\n✔ concluído em 41s — pronto para abrir o PR\n')
    ];

    var li = 0, ci = 0;
    function type() {
      if (li >= script.length) {
        // hold, then restart
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
      // faster on long mechanical lines, slight pause on newlines
      var ch = item.text[Math.max(0, ci - 1)];
      var delay = ch === '\n' ? 90 : (item.cls === 'term-add' || item.cls === 'term-dim' ? 8 : 16);
      setTimeout(type, delay);
    }
    // start once terminal scrolls into view (or immediately)
    var startSeen = false;
    var term = out.closest('.terminal');
    function kick() { if (!startSeen) { startSeen = true; type(); } }
    if ('IntersectionObserver' in window && term) {
      var tio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { kick(); tio.disconnect(); } });
      }, { threshold: 0.4 });
      tio.observe(term);
      setTimeout(kick, 1000); // fallback if IO is slow to fire
    } else { kick(); }
  } else if (out && reduce) {
    out.textContent = '$ lynx run "corrigir o teste instável de checkout"\n✔ concluído em 41s — 142/142 passando, pronto para abrir o PR';
    if (cursor) cursor.style.display = 'none';
  }

  /* close other FAQ items when one opens (accordion feel, optional) */
  var qs = document.querySelectorAll('.faq .q');
  qs.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) {
        qs.forEach(function (o) { if (o !== d) o.open = false; });
      }
    });
  });
})();
