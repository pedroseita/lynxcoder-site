// Pesquisa da Ajuda: filtra os artigos do índice pelo texto em data-k
// (título, resumo e palavras-chave). Sem acentos, para "dominio" achar "domínio".
(function () {
  'use strict';
  var q = document.getElementById('q');
  if (!q) return;
  var norm = function (s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var itens = Array.prototype.map.call(document.querySelectorAll('.lista li'), function (li) {
    return { li: li, k: norm(li.getAttribute('data-k') || '') };
  });
  var secs = document.querySelectorAll('.sec');
  var vazio = document.getElementById('vazio');

  function filtrar() {
    var termos = norm(q.value).split(/\s+/).filter(Boolean);
    var total = 0;
    itens.forEach(function (it) {
      var ok = termos.every(function (t) { return it.k.indexOf(t) !== -1; });
      it.li.hidden = !ok;
      if (ok) total++;
    });
    Array.prototype.forEach.call(secs, function (s) {
      s.hidden = !s.querySelector('.lista li:not([hidden])');
    });
    vazio.hidden = total > 0;
  }
  q.addEventListener('input', filtrar);
  // ?q=fotos abre já filtrado.
  var inicial = new URLSearchParams(location.search).get('q');
  if (inicial) { q.value = inicial.slice(0, 80); filtrar(); }
})();
