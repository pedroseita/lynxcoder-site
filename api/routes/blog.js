// Blog próprio em blog.lynxcoder.com.br (substitui o Hashnode).
//
// Os posts escrevem-se no painel (formato simples de lib/markdown.js, modo
// blog) e ficam em /data/blog/posts/<id>.json; as imagens em /data/blog/imagens.
// As páginas são geradas aqui, no servidor: sem JavaScript, sem nada de
// terceiros a carregar, com título/descrição/imagem para partilha, RSS e sitemap.
//
// O host do blog é atendido num hook onRequest registado no server.js antes de
// todas as rotas: assim "/" e "/assets/…" do blog não chocam com os do painel.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { DIRS, HttpError, str, newId, ID_RE, readJson, writeJson } = require('../lib/common');
const { render, esc } = require('../lib/markdown');

const BLOG_HOST = (process.env.BLOG_HOST || 'blog.lynxcoder.com.br').toLowerCase();
const BLOG_URL = (process.env.BLOG_URL || `https://${BLOG_HOST}`).replace(/\/$/, '');
const SITE_URL = (process.env.PUBLIC_URL || 'https://lynxcoder.com.br').replace(/\/$/, '');
const POSTS = path.join(DIRS.blog, 'posts');
const IMAGENS = path.join(DIRS.blog, 'imagens');
const STATIC = path.join(__dirname, '..', 'blog');
const FONTS = path.join(__dirname, '..', 'admin', 'fonts');

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const IMG_RE = /^[a-z0-9]{6,40}\.(png|jpg|webp)$/;
const RESERVADOS = new Set(['assets', 'imagens', 'rss', 'rss.xml', 'sitemap.xml', 'robots.txt', 'favicon.ico', 'adm', 'api', 'feed', 'pagina']);
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const MAX_IMG = 8 * 1024 * 1024;

const HEADERS = {
  // Sem scripts: o blog é só HTML e CSS. Imagens externas (https) permitidas nos posts.
  'content-security-policy': "default-src 'none'; img-src 'self' https: data:; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

// ---------- dados (em memória até à próxima escrita) ----------
let cache = null;
async function todos() {
  if (cache) return cache;
  await fsp.mkdir(POSTS, { recursive: true });
  const out = [];
  for (const f of (await fsp.readdir(POSTS)).filter((x) => x.endsWith('.json'))) {
    const p = await readJson(path.join(POSTS, f));
    if (p) out.push(p);
  }
  cache = out;
  return out;
}
const fileOf = (id) => {
  if (!ID_RE.test(id)) throw new HttpError(404, 'Post não encontrado.');
  return path.join(POSTS, `${id}.json`);
};
async function guardar(p) { await fsp.mkdir(POSTS, { recursive: true }); await writeJson(fileOf(p.id), p); cache = null; }

async function publicados() {
  return (await todos()).filter((p) => p.status === 'publicado')
    .sort((a, b) => String(b.publicadoEm).localeCompare(String(a.publicadoEm)));
}

const slugify = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
const leitura = (texto) => Math.max(1, Math.round(String(texto || '').split(/\s+/).filter(Boolean).length / 200));
const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' });

// ---------- páginas ----------
// `base` muda na pré-visualização do painel (assets e imagens noutro caminho).
const PUBLICO = { css: '/assets/blog.css', logo: '/assets/logo.png', imagens: '/imagens/', inicio: '/' };

function layout({ titulo, descricao, canonical, imagem, tipo = 'website', corpo, jsonld, base = PUBLICO, noindex = false }) {
  const t = esc(titulo);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${esc(descricao)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:type" content="${tipo}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${esc(descricao)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
${imagem ? `<meta property="og:image" content="${esc(imagem)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta property="og:site_name" content="Blog da LynxCoder">
<meta property="og:locale" content="pt_BR">
<meta name="theme-color" content="#08090b">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="alternate" type="application/rss+xml" title="Blog da LynxCoder" href="${BLOG_URL}/rss.xml">
<link rel="stylesheet" href="${base.css}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<header class="b-top">
  <div class="b-wrap b-top-in">
    <a class="b-brand" href="${base.inicio}"><img src="${base.logo}" alt="" width="26" height="31"> LynxCoder <span>blog</span></a>
    <a class="b-site" href="${SITE_URL}/">Site da LynxCoder →</a>
  </div>
</header>
<main class="b-wrap">
${corpo}
</main>
<footer class="b-foot">
  <div class="b-wrap b-foot-in">
    <span>© ${new Date().getFullYear()} LynxCoder</span>
    <span><a href="${BLOG_URL}/rss.xml">RSS</a> · <a href="${SITE_URL}/privacy.html">Privacidade</a></span>
  </div>
</footer>
</body>
</html>
`;
}

const capaUrl = (p, base = PUBLICO) => (p.capa ? base.imagens + p.capa : null);
const absoluta = (rel) => (rel && rel.startsWith('/') ? BLOG_URL + rel : rel);

function paginaInicial(posts) {
  const cards = posts.map((p) => `
  <article class="b-card">
    <a href="/${p.slug}">
      ${p.capa ? `<img class="b-card-img" src="${capaUrl(p)}" alt="" loading="lazy" decoding="async">` : ''}
      <span class="b-meta">${dataBR(p.publicadoEm)} · ${leitura(p.conteudo)} min de leitura</span>
      <h2>${esc(p.titulo)}</h2>
      ${p.resumo ? `<p>${esc(p.resumo)}</p>` : ''}
    </a>
  </article>`).join('');
  const corpo = `
<section class="b-hero">
  <h1>Artigos para quem quer vender mais com a internet</h1>
  <p>Dicas práticas sobre páginas, Google, WhatsApp e presença online para pequenos negócios e profissionais.</p>
</section>
${posts.length ? `<div class="b-grid">${cards}</div>` : '<p class="b-vazio">Os primeiros artigos estão a caminho. Volte em breve!</p>'}`;
  return layout({
    titulo: 'Blog da LynxCoder',
    descricao: 'Dicas práticas sobre páginas, Google, WhatsApp e presença online para pequenos negócios e profissionais.',
    canonical: `${BLOG_URL}/`, corpo,
  });
}

function paginaPost(p, base = PUBLICO, previa = false) {
  const html = render(p.conteudo, {}, { blog: true }).split('src="/imagens/').join(`src="${base.imagens}`);
  const capa = capaUrl(p, base);
  const url = `${BLOG_URL}/${p.slug}`;
  const quando = p.publicadoEm || new Date().toISOString();
  const corpo = `
<article class="b-post">
  <a class="b-voltar" href="${base.inicio}">← Todos os artigos</a>
  <h1>${esc(p.titulo)}</h1>
  <p class="b-meta">${previa && p.status !== 'publicado' ? 'Rascunho · ' : ''}${dataBR(quando)} · ${leitura(p.conteudo)} min de leitura · Equipe LynxCoder</p>
  ${capa ? `<img class="b-capa" src="${capa}" alt="${esc(p.capaAlt || '')}" decoding="async">` : ''}
  <div class="b-texto">
${html}
  </div>
  <aside class="b-cta">
    <h2>Quer uma página assim para o seu negócio?</h2>
    <p>A LynxCoder cria páginas rápidas, com WhatsApp e prontas para o Google.</p>
    <a class="b-btn" href="${SITE_URL}/#contato">Falar com a LynxCoder</a>
  </aside>
</article>`;
  return layout({
    titulo: `${p.titulo} · Blog da LynxCoder`,
    descricao: p.resumo || p.titulo,
    canonical: previa ? null : url,
    imagem: p.capa ? absoluta(capaUrl(p)) : null,
    tipo: 'article', corpo, base, noindex: previa,
    jsonld: previa ? null : {
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: p.titulo, description: p.resumo || undefined,
      datePublished: p.publicadoEm, dateModified: p.atualizadoEm || p.publicadoEm,
      author: { '@type': 'Organization', name: 'LynxCoder', url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'LynxCoder', logo: { '@type': 'ImageObject', url: `${BLOG_URL}/assets/logo.png` } },
      image: p.capa ? absoluta(capaUrl(p)) : undefined,
      mainEntityOfPage: url,
    },
  });
}

function pagina404() {
  return layout({
    titulo: 'Página não encontrada · Blog da LynxCoder', descricao: 'Esta página não existe.', noindex: true,
    corpo: '<section class="b-hero"><h1>Esta página não existe</h1><p>O artigo pode ter mudado de endereço. <a href="/">Ver todos os artigos →</a></p></section>',
  });
}

function rss(posts) {
  const x = (s) => esc(s);
  const itens = posts.slice(0, 30).map((p) => `
  <item>
    <title>${x(p.titulo)}</title>
    <link>${BLOG_URL}/${p.slug}</link>
    <guid isPermaLink="true">${BLOG_URL}/${p.slug}</guid>
    <pubDate>${new Date(p.publicadoEm).toUTCString()}</pubDate>
    <description>${x(p.resumo || '')}</description>
  </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Blog da LynxCoder</title>
  <link>${BLOG_URL}/</link>
  <description>Dicas práticas sobre páginas, Google, WhatsApp e presença online.</description>
  <language>pt-BR</language>${itens}
</channel>
</rss>
`;
}

function sitemap(posts) {
  const urls = [`<url><loc>${BLOG_URL}/</loc></url>`]
    .concat(posts.map((p) => `<url><loc>${BLOG_URL}/${p.slug}</loc><lastmod>${String(p.atualizadoEm || p.publicadoEm).slice(0, 10)}</lastmod></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------- host do blog (hook do server.js) ----------
const FONT_FILES = new Set(fs.readdirSync(FONTS).filter((f) => f.endsWith('.woff2')));
const css = () => fs.readFileSync(path.join(STATIC, 'blog.css'));

async function publicHook(req, reply) {
  if ((req.hostname || '').toLowerCase() !== BLOG_HOST) return;
  for (const [k, v] of Object.entries(HEADERS)) reply.header(k, v);
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply.code(405).send();
  const url = decodeURIComponent(req.url.split('?')[0]);
  const html = (code, body, maxAge = 300) => reply.code(code).header('cache-control', `public, max-age=${maxAge}`).type('text/html; charset=utf-8').send(body);
  const ficheiro = async (file, type, maxAge) => {
    const st = await fsp.stat(file).catch(() => null);
    if (!st || !st.isFile()) return html(404, pagina404());
    return reply.code(200).header('cache-control', `public, max-age=${maxAge}`).header('content-length', st.size).type(type).send(fs.createReadStream(file));
  };

  if (url === '/') return html(200, paginaInicial(await publicados()));
  if (url === '/assets/blog.css') return reply.header('cache-control', 'no-cache').type('text/css; charset=utf-8').send(css());
  if (url === '/assets/logo.png') return ficheiro(path.join(__dirname, '..', 'admin', 'logo.png'), 'image/png', 2592000);
  if (url === '/favicon.ico') return ficheiro(path.join(STATIC, 'favicon.ico'), 'image/x-icon', 2592000);
  let m;
  if ((m = /^\/assets\/fonts\/([\w.-]+)$/.exec(url)) && FONT_FILES.has(m[1])) return ficheiro(path.join(FONTS, m[1]), 'font/woff2', 2592000);
  if ((m = /^\/imagens\/([\w.-]+)$/.exec(url)) && IMG_RE.test(m[1])) return ficheiro(path.join(IMAGENS, m[1]), MIME[m[1].split('.').pop()], 2592000);
  if (url === '/rss.xml') return reply.header('cache-control', 'public, max-age=600').type('application/rss+xml; charset=utf-8').send(rss(await publicados()));
  if (url === '/sitemap.xml') return reply.header('cache-control', 'public, max-age=600').type('application/xml; charset=utf-8').send(sitemap(await publicados()));
  if (url === '/robots.txt') return reply.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${BLOG_URL}/sitemap.xml\n`);
  if ((m = /^\/([a-z0-9-]+)\/$/.exec(url))) return reply.redirect(`/${m[1]}`, 301);
  if ((m = /^\/([a-z0-9-]+)$/.exec(url))) {
    const p = (await publicados()).find((x) => x.slug === m[1] || (x.slugsAntigos || []).includes(m[1]));
    if (p && p.slug !== m[1]) return reply.redirect(`/${p.slug}`, 301);
    if (p) return html(200, paginaPost(p));
  }
  return html(404, pagina404());
}

// Os 3 posts mais recentes, para a secção "Blog" da página inicial do site.
async function publicRoutes(app) {
  app.get('/api/blog/recentes', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return {
      ok: true,
      url: BLOG_URL,
      posts: (await publicados()).slice(0, 3).map((p) => ({
        titulo: p.titulo, resumo: p.resumo, url: `${BLOG_URL}/${p.slug}`,
        data: p.publicadoEm, leitura: leitura(p.conteudo),
      })),
    };
  });
}

// ---------- painel ----------
function limpar(b, atual) {
  const out = {
    titulo: str(b.titulo, 140),
    slug: str(b.slug, 80).toLowerCase(),
    resumo: str(b.resumo, 220),
    conteudo: typeof b.conteudo === 'string' ? b.conteudo.slice(0, 100000) : (atual ? atual.conteudo : ''),
    capa: b.capa === null || b.capa === '' ? null : (IMG_RE.test(b.capa || '') ? b.capa : (atual ? atual.capa : null)),
    capaAlt: str(b.capaAlt, 160),
  };
  if (out.titulo.length < 3) throw new HttpError(400, 'Escreva um título.');
  out.slug = out.slug ? slugify(out.slug) : slugify(out.titulo);
  if (!SLUG_RE.test(out.slug) || RESERVADOS.has(out.slug)) throw new HttpError(400, 'Endereço do post inválido: use letras, números e hífen.');
  return out;
}

async function verificarSlug(slug, id) {
  const outro = (await todos()).find((p) => p.id !== id && (p.slug === slug || (p.slugsAntigos || []).includes(slug)));
  if (outro) throw new HttpError(400, `O endereço /${slug} já é usado pelo post "${outro.titulo}".`);
}

function resumoPainel(p) {
  return { id: p.id, titulo: p.titulo, slug: p.slug, status: p.status, publicadoEm: p.publicadoEm || null, atualizadoEm: p.atualizadoEm, url: p.status === 'publicado' ? `${BLOG_URL}/${p.slug}` : null };
}

async function adminRoutes(app) {
  app.get('/adm/blog', async () => {
    const posts = (await todos()).slice().sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
    return { ok: true, url: BLOG_URL, posts: posts.map(resumoPainel) };
  });

  app.get('/adm/blog/posts/:id', async (req) => {
    const p = await readJson(fileOf(req.params.id));
    if (!p) throw new HttpError(404, 'Post não encontrado.');
    return { ok: true, post: { ...p, url: p.status === 'publicado' ? `${BLOG_URL}/${p.slug}` : null } };
  });

  app.post('/adm/blog/posts', async (req) => {
    const dados = limpar(req.body || {});
    await verificarSlug(dados.slug, null);
    const agora = new Date().toISOString();
    const p = { id: newId(), ...dados, status: 'rascunho', criadoEm: agora, atualizadoEm: agora, publicadoEm: null, slugsAntigos: [] };
    await guardar(p);
    return { ok: true, id: p.id };
  });

  // Salvar; com acao "publicar" ou "despublicar" muda também a situação.
  app.put('/adm/blog/posts/:id', async (req) => {
    const p = await readJson(fileOf(req.params.id));
    if (!p) throw new HttpError(404, 'Post não encontrado.');
    const b = req.body || {};
    const dados = limpar(b, p);
    await verificarSlug(dados.slug, p.id);
    // Mudar o endereço de um post publicado: o antigo passa a redirecionar.
    if (p.status === 'publicado' && dados.slug !== p.slug) p.slugsAntigos = [...new Set([...(p.slugsAntigos || []), p.slug])].slice(-10);
    Object.assign(p, dados, { atualizadoEm: new Date().toISOString() });
    if (b.acao === 'publicar') {
      if (!p.conteudo.trim()) throw new HttpError(400, 'O post está vazio.');
      if (!p.resumo) throw new HttpError(400, 'Escreva o resumo antes de publicar: aparece no Google e na partilha.');
      p.status = 'publicado';
      p.publicadoEm = p.publicadoEm || p.atualizadoEm;
    } else if (b.acao === 'despublicar') {
      p.status = 'rascunho';
    }
    await guardar(p);
    return { ok: true, post: { ...p, url: p.status === 'publicado' ? `${BLOG_URL}/${p.slug}` : null } };
  });

  app.delete('/adm/blog/posts/:id', async (req) => {
    await fsp.rm(fileOf(req.params.id), { force: true });
    cache = null;
    req.log.info({ id: req.params.id }, 'post do blog excluído no painel');
    return { ok: true };
  });

  // Pré-visualização (rascunho ou publicado) com o visual do blog, no host do painel.
  app.get('/adm/blog/posts/:id/previa', async (req, reply) => {
    const p = await readJson(fileOf(req.params.id));
    if (!p) throw new HttpError(404, 'Post não encontrado.');
    const base = { css: '/assets/blog.css', logo: '/assets/logo.png', imagens: '/adm/blog/imagens/', inicio: '#' };
    return reply.type('text/html; charset=utf-8').send(paginaPost(p, base, true));
  });

  // Uma imagem por envio (o painel já a reduz antes de enviar).
  app.post('/adm/blog/imagens', async (req) => {
    if (!req.isMultipart()) throw new HttpError(415, 'Envie uma imagem.');
    const part = await req.file();
    if (!part) throw new HttpError(400, 'Envie uma imagem.');
    await fsp.mkdir(IMAGENS, { recursive: true });
    const tmp = path.join(DIRS.tmp, `blog-${crypto.randomBytes(6).toString('hex')}`);
    try {
      await pipeline(part.file, fs.createWriteStream(tmp, { flags: 'wx' }));
      const size = (await fsp.stat(tmp)).size;
      if (!size) throw new HttpError(400, 'Ficheiro vazio.');
      if (size > MAX_IMG || part.file.truncated) throw new HttpError(413, 'Imagem grande demais (máx. 8 MB).');
      const tipo = await require('./onboarding').sniff(tmp);
      if (!['png', 'jpg', 'webp'].includes(tipo)) throw new HttpError(400, 'Envie uma imagem JPG, PNG ou WEBP.');
      const nome = `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}.${tipo}`;
      await fsp.rename(tmp, path.join(IMAGENS, nome));
      return { ok: true, nome, url: `/imagens/${nome}` };
    } finally {
      await fsp.rm(tmp, { force: true }).catch(() => {});
    }
  });

  app.get('/adm/blog/imagens/:nome', async (req, reply) => {
    const nome = req.params.nome;
    if (!IMG_RE.test(nome)) throw new HttpError(404, 'Não encontrado.');
    const file = path.join(IMAGENS, nome);
    const st = await fsp.stat(file).catch(() => null);
    if (!st) throw new HttpError(404, 'Não encontrado.');
    reply.header('cache-control', 'private, max-age=3600');
    return reply.type(MIME[nome.split('.').pop()]).header('content-length', st.size).send(fs.createReadStream(file));
  });
}

module.exports = { publicHook, publicRoutes, adminRoutes, BLOG_URL };
