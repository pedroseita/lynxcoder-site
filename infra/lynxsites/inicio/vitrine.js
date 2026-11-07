// Vitrine de lynxsites.com.br: mostra o preço "a partir de" lido do catálogo
// (o mesmo que o /criar usa), para nunca ficar desatualizado. Se a API não
// responder (ex.: manutenção), a linha do preço fica escondida.
(function () {
  'use strict';
  var el = document.getElementById('preco');
  if (!el || !window.fetch) return;
  var brl = function (v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: v % 1 ? 2 : 0 }); };
  fetch('/api/criar/catalogo', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var tipos = d && d.catalogo && d.catalogo.tipos;
      if (!tipos) return;
      var lista = Object.keys(tipos).map(function (k) { return tipos[k]; })
        .filter(function (t) { return typeof t.implantacao === 'number' && typeof t.mensal === 'number'; });
      if (!lista.length) return;
      var imp = Math.min.apply(null, lista.map(function (t) { return t.implantacao; }));
      var men = Math.min.apply(null, lista.map(function (t) { return t.mensal; }));
      el.textContent = '';
      el.appendChild(document.createTextNode('A partir de '));
      var a = document.createElement('strong'); a.textContent = brl(imp); el.appendChild(a);
      el.appendChild(document.createTextNode(' + '));
      var b = document.createElement('strong'); b.textContent = brl(men) + '/mês'; el.appendChild(b);
      el.appendChild(document.createTextNode('. Cancela quando quiser.'));
      el.hidden = false;
    })
    .catch(function () {});
})();
