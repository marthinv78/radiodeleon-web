// =============================================================
// Radio de León — servidor (Cloudflare Worker)
// - Sirve la página pública y el panel /admin (carpeta public/)
// - API pública:   /api/home, /api/posts, /api/posts/:slug, /api/shows,
//                  /api/events, /api/sponsors, /api/settings
// - API de admin:  /api/admin/...  (requiere iniciar sesión)
//                  El agente editorial entra con EDITOR_TOKEN: solo puede
//                  ver notas, crear borradores y subir fotos.
// - Imágenes:      /img/:clave     (guardadas en KV)
// =============================================================

const TABLES = {
  posts: {
    fields: ["slug", "title", "excerpt", "body", "category", "extra_categories", "image", "published", "published_at"],
    order: "COALESCE(published_at, created_at) DESC",
  },
  shows: {
    fields: ["name", "host", "image", "days", "start_time", "end_time", "description", "sort"],
    order: "sort, start_time",
  },
  events: {
    fields: ["title", "date", "end_date", "time", "place", "image", "description", "link", "published"],
    order: "date DESC, time",
  },
  sponsors: {
    fields: ["name", "logo", "url", "active", "sort"],
    order: "sort, id",
  },
  banners: {
    fields: ["name", "image", "url", "slot", "section", "starts_on", "ends_on", "active"],
    order: "active DESC, COALESCE(ends_on, '9999') DESC, id DESC",
  },
};
// Espacios para banners: portada (Inicio), noticias (tarjeta entre notas),
// nota (a mitad del texto) y radio (junto al reproductor)
const BANNER_SLOTS = ["portada", "noticias", "nota", "lateral", "radio"];
const BANNERS_SQL = `CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image TEXT,
  url TEXT,
  slot TEXT NOT NULL,
  section TEXT,
  starts_on TEXT,
  ends_on TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
// Columnas nuevas de eventos (borrador y fecha de fin); se agregan solas la primera vez
let eventsReady = false;
async function ensureEvents(env) {
  if (eventsReady) return;
  for (const sql of [
    "ALTER TABLE events ADD COLUMN published INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE events ADD COLUMN end_date TEXT",
  ]) {
    try { await env.DB.prepare(sql).run(); }
    catch (e) { if (!/duplicate column/i.test(String(e.message || e))) throw e; }
  }
  eventsReady = true;
}
// Columnas nuevas de notas: si ya se publicaron en Facebook e Instagram,
// y otras secciones donde también aparece ("|La radio|Música|")
let postsReady = false;
async function ensurePosts(env) {
  if (postsReady) return;
  for (const sql of [
    "ALTER TABLE posts ADD COLUMN social_fb TEXT",
    "ALTER TABLE posts ADD COLUMN social_ig TEXT",
    "ALTER TABLE posts ADD COLUMN social_error TEXT",
    "ALTER TABLE posts ADD COLUMN extra_categories TEXT",
  ]) {
    try { await env.DB.prepare(sql).run(); }
    catch (e) { if (!/duplicate column/i.test(String(e.message || e))) throw e; }
  }
  postsReady = true;
}
// Un evento sigue "próximo" hasta su último día
const EVENT_END = "COALESCE(NULLIF(end_date, ''), date)";

// La tabla de banners se crea sola la primera vez que se usa
let bannersReady = false;
async function ensureBanners(env) {
  if (bannersReady) return;
  await env.DB.prepare(BANNERS_SQL).run();
  bannersReady = true;
}
// Secciones del portal. La categoría de cada nota debe ser uno de estos nombres.
const SECTIONS = [
  { name: "Cine", group: "Cultura y espectáculos", desc: "Estrenos con criterio, clásicos, cine mexicano y festivales, contados desde León." },
  { name: "Teatro", group: "Cultura y espectáculos", desc: "Cartelera, obras, compañías y la historia de los teatros de León y Guanajuato." },
  { name: "Espectáculos", group: "Cultura y espectáculos", desc: "Conciertos, danza, ópera, la Feria de León, el Festival del Globo y el Cervantino." },
  { name: "Música", group: "Cultura y espectáculos", desc: "Géneros, discos, artistas, historias detrás de las canciones y la música de León." },
  { name: "Cultura", group: "Cultura y espectáculos", desc: "Libros, arte, museos y gastronomía con historia en León y el Bajío." },
  { name: "Moda", group: "Estilo y bienestar", desc: "Tendencias explicadas, diseñadores mexicanos y la industria del calzado y la piel de León." },
  { name: "Mujer", group: "Estilo y bienestar", desc: "Mujeres que hacen historia, salud, liderazgo y emprendimiento en Guanajuato." },
  { name: "Psicología", group: "Estilo y bienestar", desc: "Bienestar emocional, relaciones, crianza y hábitos, con base en la ciencia." },
  { name: "Historia", group: "León y su gente", desc: "Historia de México, del Bajío y de León, con efemérides e historias poco conocidas." },
  { name: "León", group: "León y su gente", desc: "La ciudad: sus personajes, barrios, tradiciones, economía y gastronomía." },
  { name: "Fundaciones", group: "León y su gente", desc: "Asociaciones civiles y causas de León y Guanajuato: qué hacen y cómo ayudar." },
  { name: "Comunidad", group: "León y su gente", desc: "Iniciativas ciudadanas, colectivos y talento local de León." },
  { name: "La radio", group: "Radio de León", desc: "Noticias y avisos de Radio de León, la radio por internet de León, Guanajuato." },
  { name: "Programación", group: "Radio de León", desc: "Lo que suena en Radio de León: programas, horarios y especiales de temporada." },
].map((s) => ({ ...s, slug: slugify(s.name) }));
// Secciones extra de una nota, sin repetir la principal
const extraCats = (p) => String(p.extra_categories || "").split("|").filter((c) => c && c !== p.category);
const allCats = (p) => [p.category || "Noticias", ...extraCats(p)];
// Guarda las secciones extra como "|La radio|Música|" para poder buscarlas con LIKE
function packExtraCats(v, main) {
  const names = [...new Set(String(v || "").split(/[|,]/).map((x) => x.trim()))]
    .filter((x) => x && x !== main && SECTIONS.some((s) => s.name === x));
  return names.length ? `|${names.join("|")}|` : null;
}
const SETTINGS_KEYS = ["whatsapp", "email", "facebook", "instagram", "tiktok", "youtube", "about"];
const SESSION_DAYS = 30;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
const bad = (msg, status = 400) => json({ error: msg }, status);

// Dirección principal. Las otras redirigen aquí (las llamadas a /api/ y /b/ siguen funcionando en todas).
const MAIN_HOST = "radiodeleon.com";
const OLD_HOSTS = ["radiodeleon.nanostudio.com.mx", "www.radiodeleon.com"];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (OLD_HOSTS.includes(url.hostname) && ["GET", "HEAD"].includes(req.method) && !p.startsWith("/api/") && !p.startsWith("/b/")) {
      return Response.redirect(`https://${MAIN_HOST}${p}${url.search}`, 301);
    }
    try {
      if (p.startsWith("/api/admin/")) return await adminApi(req, env, url);
      if (p.startsWith("/b/")) return await bannerClick(env, url);
      if (p === "/api/banners/view" && req.method === "POST") return await bannerViews(req, env);
      if (p.startsWith("/api/")) return await publicApi(req, env, url);
      if (p.startsWith("/img/")) return await serveImage(req, env, url, ctx);
      return await servePage(req, env, url);
    } catch (e) {
      console.error(e);
      return bad("Error en el servidor. Intenta de nuevo en un momento.", 500);
    }
  },
};

// ---------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------
const SITE_NAME = "Radio de León";
const PAGE_TITLES = { "/noticias": "Noticias", "/programas": "Programas", "/eventos": "Eventos", "/contacto": "Contacto", "/privacidad": "Aviso de privacidad" };
const PAGE_DESCS = {
  "/noticias": "Noticias de cultura, espectáculos, música, cine, historia y comunidad de León, Guanajuato, en Radio de León.",
  "/programas": "La programación de Radio de León: programas, locutores y horarios. Música las 24 horas desde León, Guanajuato.",
  "/eventos": "Conciertos, teatro, festivales y exposiciones en León y Guanajuato: la agenda de Radio de León.",
  "/contacto": "Escríbenos por WhatsApp o correo: saludos, complacencias, publicidad y músicos que quieren sonar en Radio de León.",
  "/privacidad": "Aviso de privacidad de Radio de León: qué datos usamos y cómo ejercer tus derechos.",
};
// Ficha para Google: qué es Radio de León, su logo y sus redes
function stationLd(url, st) {
  const sameAs = ["facebook", "instagram", "tiktok", "youtube"].map((k) => {
    const v = String(st[k] || "").trim();
    if (!v) return null;
    if (/^https?:\/\//.test(v)) return v;
    const h = v.replace(/^@/, "");
    return { facebook: `https://www.facebook.com/${h}`, instagram: `https://www.instagram.com/${h}`, tiktok: `https://www.tiktok.com/@${h}`, youtube: `https://www.youtube.com/@${h}` }[k];
  }).filter(Boolean);
  // El WhatsApp de los ajustes, con lada de México si viene a 10 dígitos
  const digits = String(st.whatsapp || "").replace(/\D/g, "");
  const phone = digits ? `+${digits.length === 10 ? "52" + digits : digits}` : "";
  return [
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: `${url.origin}/`, inLanguage: "es-MX" },
    {
      "@context": "https://schema.org", "@type": "RadioStation", "@id": `${url.origin}/#radio`,
      name: SITE_NAME, slogan: "Tu música, tus recuerdos", url: `${url.origin}/`,
      logo: `${url.origin}/apple-touch-icon.png`, image: `${url.origin}/og.jpg`,
      description: "La radio por internet de León, Guanajuato, con música las 24 horas, noticias, programas y eventos.",
      address: { "@type": "PostalAddress", addressLocality: "León", addressRegion: "Guanajuato", addressCountry: "MX" },
      areaServed: "León, Guanajuato",
      // La radio transmite todo el día, todos los días
      openingHoursSpecification: {
        "@type": "OpeningHoursSpecification", opens: "00:00", closes: "23:59",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      },
      ...(phone ? { telephone: phone } : {}),
      ...(st.email ? { email: st.email } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    },
  ];
}

async function servePage(req, env, url) {
  if (url.pathname === "/robots.txt") return robots(url);
  if (url.pathname === "/sitemap.xml") return sitemap(env, url);
  if (url.pathname === "/rss.xml") return rss(env, url);

  // La portada también pasa por aquí para llevar la ficha de Google
  if (url.pathname !== "/") {
    const res = await env.ASSETS.fetch(req);
    if (res.status !== 404) return res;
  }

  // Rutas de la página (/noticias, /nota/x, /programas…) → misma página
  const shell = await env.ASSETS.fetch(new Request(new URL("/", url), req));
  const canonical = url.origin + (url.pathname.replace(/\/+$/, "") || "/");
  const set = (attr) => ({ element(el) { el.setAttribute("content", attr); } });
  const link = { element(el) { el.setAttribute("href", canonical); } };
  const m = url.pathname.match(/^\/nota\/([a-z0-9-]+)\/?$/) || url.pathname.match(/^\/evento\/(\d+)\/?$/);
  if (!m) {
    let rw = new HTMLRewriter()
      .on('link[rel="canonical"]', link)
      .on('meta[property="og:url"]', set(canonical));
    const sm = url.pathname.match(/^\/seccion\/([a-z0-9-]+)\/?$/);
    const sec = sm && SECTIONS.find((s) => s.slug === sm[1]);
    if (sm && !sec) return new Response(shell.body, { status: 404, headers: shell.headers });
    const path = url.pathname.replace(/\/+$/, "");
    const name = sec ? sec.name : PAGE_TITLES[path];
    const desc = sec ? `${sec.desc} En Radio de León.` : PAGE_DESCS[path];
    if (name) rw = rw.on("title", { element(el) { el.setInnerContent(`${name} · ${SITE_NAME}`); } })
      .on('meta[property="og:title"]', set(`${name} · ${SITE_NAME}`));
    if (desc) rw = rw.on('meta[name="description"]', set(desc)).on('meta[property="og:description"]', set(desc));
    if (!path) {
      const ld = stationLd(url, await getSettings(env).catch(() => ({})));
      rw = rw.on("head", { element(el) { el.append(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`, { html: true }); } });
    }
    return rw.transform(new Response(shell.body, { status: 200, headers: shell.headers }));
  }

  if (m[0].startsWith("/evento/")) return eventPage(env, url, shell, Number(m[1]), canonical, set, link);
  const post = await env.DB.prepare(
    "SELECT * FROM posts WHERE slug = ? AND published = 1"
  ).bind(m[1]).first();
  if (!post) return new Response(shell.body, { status: 404, headers: shell.headers });

  // Vista previa al compartir (WhatsApp, Facebook, X) y datos para Google
  const title = `${post.title} · ${SITE_NAME}`;
  const desc = post.excerpt || `Noticias de ${SITE_NAME}`;
  const img = post.image ? new URL(post.image, url).href : null;
  const published = post.published_at || post.created_at;
  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: desc,
    image: img ? [img] : undefined,
    datePublished: published,
    dateModified: post.updated_at || published,
    articleSection: post.category || "Noticias",
    inLanguage: "es-MX",
    mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: SITE_NAME, url: url.origin },
    publisher: {
      "@type": "Organization", name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${url.origin}/apple-touch-icon.png` },
    },
  };
  let rw = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:type"]', set("article"))
    .on('meta[property="og:url"]', set(canonical))
    .on('link[rel="canonical"]', link)
    .on("head", { element(el) {
      el.append(`<meta property="article:published_time" content="${escHtml(published)}">`, { html: true });
      el.append(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`, { html: true });
    } })
    // El texto de la nota va ya escrito en la página para que Google lo lea sin esperar al JavaScript
    .on("#view", { element(el) { el.setInnerContent(articleHtml(post), { html: true }); } });
  if (img) rw = rw.on('meta[property="og:image"]', set(img)).on('meta[property^="og:image:"]', { element(el) { el.remove(); } });
  return rw.transform(new Response(shell.body, { status: 200, headers: shell.headers }));
}

async function eventPage(env, url, shell, id, canonical, set, link) {
  await ensureEvents(env);
  const e = await env.DB.prepare("SELECT * FROM events WHERE id = ? AND published = 1").bind(id).first();
  if (!e) return new Response(shell.body, { status: 404, headers: shell.headers });
  const title = `${e.title} · ${SITE_NAME}`;
  const desc = String(e.description || "").split(/\n{2,}/)[0].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_#]/g, "").trim().slice(0, 200)
    || `${e.title} en ${e.place || "León"}`;
  const img = e.image ? new URL(e.image, url).href : null;
  const ld = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: e.date,
    endDate: e.end_date || e.date,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: e.place || "León, Guanajuato", address: e.place || "León, Guanajuato, México" },
    image: img ? [img] : undefined,
    description: desc,
    url: e.link || canonical,
  };
  let rw = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:url"]', set(canonical))
    .on('link[rel="canonical"]', link)
    .on("head", { element(el) {
      el.append(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`, { html: true });
    } })
    .on("#view", { element(el) { el.setInnerContent(`<article class="sec article"><h1>${escHtml(e.title)}</h1><div class="prose">${md(e.description)}</div></article>`, { html: true }); } });
  if (img) rw = rw.on('meta[property="og:image"]', set(img)).on('meta[property^="og:image:"]', { element(el) { el.remove(); } });
  return rw.transform(new Response(shell.body, { status: 200, headers: shell.headers }));
}

function articleHtml(p) {
  const catLink = (c) => { const sec = SECTIONS.find((s) => s.name === c); return sec ? `<a href="/seccion/${sec.slug}" data-link>${escHtml(sec.name)}</a>` : escHtml(c); };
  const fecha = new Date(p.published_at || p.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });
  return `<article class="sec article">
      <a class="back" href="/noticias" data-link>← Todas las noticias</a>
      ${p.image ? `<div class="article-hero"><img src="${escHtml(p.image)}" alt=""></div>` : ""}
      <div class="eyebrow" style="margin-top:22px">${allCats(p).map(catLink).join(" · ")} · ${fecha}</div>
      <h1>${escHtml(p.title)}</h1>
      ${p.excerpt ? `<p class="lead">${escHtml(p.excerpt)}</p>` : ""}
      <div class="prose">${md(p.body)}</div>
    </article>`;
}

// ---------------------------------------------------------------
// Google y lectores de noticias: robots.txt, sitemap.xml, rss.xml
// ---------------------------------------------------------------
function robots(url) {
  const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin/\n\nSitemap: ${url.origin}/sitemap.xml\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

async function sitemap(env, url) {
  const r = await env.DB.prepare(
    `SELECT slug, updated_at, published_at, created_at FROM posts WHERE published = 1 ORDER BY ${TABLES.posts.order} LIMIT 5000`
  ).all();
  const secs = (await sectionsWithCount(env)).filter((s) => s.count).map((s) => `/seccion/${s.slug}`);
  const pages = ["/", ...Object.keys(PAGE_TITLES), ...secs].map((p) => `<url><loc>${url.origin}${p}</loc></url>`);
  const posts = r.results.map((p) =>
    `<url><loc>${url.origin}/nota/${p.slug}</loc><lastmod>${escHtml(p.updated_at || p.published_at || p.created_at)}</lastmod></url>`);
  await ensureEvents(env);
  const ev = await env.DB.prepare(`SELECT id, updated_at FROM events WHERE published = 1 AND ${EVENT_END} >= ?`).bind(mexicoToday()).all();
  posts.push(...ev.results.map((e) => `<url><loc>${url.origin}/evento/${e.id}</loc><lastmod>${escHtml(e.updated_at)}</lastmod></url>`));
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages, ...posts].join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=600" } });
}

async function rss(env, url) {
  const r = await env.DB.prepare(
    `SELECT * FROM posts WHERE published = 1 ORDER BY ${TABLES.posts.order} LIMIT 30`
  ).all();
  const items = r.results.map((p) => {
    const link = `${url.origin}/nota/${p.slug}`;
    const img = p.image ? new URL(p.image, url).href : null;
    return `<item>
  <title>${escHtml(p.title)}</title>
  <link>${link}</link>
  <guid isPermaLink="true">${link}</guid>
  <pubDate>${new Date(p.published_at || p.created_at).toUTCString()}</pubDate>
  ${allCats(p).map((c) => `<category>${escHtml(c)}</category>`).join("\n  ")}
  <description>${escHtml(p.excerpt || "")}</description>
  <content:encoded><![CDATA[${md(p.body).replace(/]]>/g, "]]]]><![CDATA[>")}]]></content:encoded>${img ? `\n  <media:content url="${escHtml(img)}" medium="image"/>` : ""}
</item>`;
  }).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${SITE_NAME}</title>
  <link>${url.origin}/</link>
  <description>Noticias, cultura y espectáculos desde León, Guanajuato.</description>
  <language>es-MX</language>
  <atom:link href="${url.origin}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`;
  return new Response(body, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=600" } });
}

// ---------------------------------------------------------------
// API pública
// ---------------------------------------------------------------
async function publicApi(req, env, url) {
  if (req.method !== "GET") return bad("Método no permitido", 405);
  const p = url.pathname;
  const cache = { "cache-control": "public, max-age=30" };
  const today = mexicoToday();

  if (p === "/api/home" || p.startsWith("/api/events")) await ensureEvents(env);
  const em = p.match(/^\/api\/events\/(\d+)$/);
  if (em) {
    const ev = await env.DB.prepare("SELECT * FROM events WHERE id = ? AND published = 1").bind(Number(em[1])).first();
    return ev ? json(ev, 200, cache) : bad("Ese evento no existe o ya no está publicado.", 404);
  }
  if (p === "/api/home") {
    const [posts, shows, events, sponsors, settings] = await Promise.all([
      listPosts(env, 7, 0),
      env.DB.prepare(`SELECT * FROM shows ORDER BY ${TABLES.shows.order}`).all(),
      env.DB.prepare(`SELECT * FROM events WHERE published = 1 AND ${EVENT_END} >= ? ORDER BY date, time LIMIT 4`).bind(today).all(),
      env.DB.prepare("SELECT * FROM sponsors WHERE active = 1 ORDER BY sort, id").all(),
      getSettings(env),
    ]);
    return json({ posts, shows: shows.results, events: events.results, sponsors: sponsors.results, settings }, 200, cache);
  }
  if (p === "/api/posts") {
    const limit = clampInt(url.searchParams.get("limit"), 1, 50, 12);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);
    const sec = SECTIONS.find((s) => s.slug === url.searchParams.get("seccion"));
    return json(await listPosts(env, limit, offset, sec && sec.name), 200, cache);
  }
  if (p === "/api/sections") return json(await sectionsWithCount(env), 200, cache);
  if (p === "/api/banners") {
    await ensureBanners(env);
    const r = await env.DB.prepare(
      `SELECT id, name, image, slot, section FROM banners
       WHERE active = 1 AND image IS NOT NULL AND image != ''
         AND (starts_on IS NULL OR starts_on = '' OR starts_on <= ?)
         AND (ends_on IS NULL OR ends_on = '' OR ends_on >= ?)`
    ).bind(today, today).all();
    return json(r.results, 200, { "cache-control": "public, max-age=60" });
  }
  let m = p.match(/^\/api\/posts\/([a-z0-9-]+)$/);
  if (m) {
    const post = await env.DB.prepare("SELECT * FROM posts WHERE slug = ? AND published = 1").bind(m[1]).first();
    if (post) for (const k of ["social_fb", "social_ig", "social_error"]) delete post[k];
    return post ? json(post, 200, cache) : bad("Esa nota no existe o ya no está publicada.", 404);
  }
  if (p === "/api/shows") {
    const r = await env.DB.prepare(`SELECT * FROM shows ORDER BY ${TABLES.shows.order}`).all();
    return json(r.results, 200, cache);
  }
  if (p === "/api/events") {
    const [up, past] = await Promise.all([
      env.DB.prepare(`SELECT * FROM events WHERE published = 1 AND ${EVENT_END} >= ? ORDER BY date, time`).bind(today).all(),
      env.DB.prepare(`SELECT * FROM events WHERE published = 1 AND ${EVENT_END} < ? ORDER BY date DESC LIMIT 12`).bind(today).all(),
    ]);
    return json({ upcoming: up.results, past: past.results }, 200, cache);
  }
  if (p === "/api/sponsors") {
    const r = await env.DB.prepare("SELECT * FROM sponsors WHERE active = 1 ORDER BY sort, id").all();
    return json(r.results, 200, cache);
  }
  if (p === "/api/settings") return json(await getSettings(env), 200, cache);
  return bad("No encontrado", 404);
}

async function listPosts(env, limit, offset, category = null) {
  await ensurePosts(env);
  const where = category ? "published = 1 AND (category = ? OR extra_categories LIKE ?)" : "published = 1";
  const r = await env.DB.prepare(
    `SELECT id, slug, title, excerpt, category, extra_categories, image, published_at, created_at
     FROM posts WHERE ${where} ORDER BY ${TABLES.posts.order} LIMIT ? OFFSET ?`
  ).bind(...(category ? [category, `%|${category}|%`] : []), limit, offset).all();
  return r.results;
}

// Clic en un banner: se cuenta y se manda a la página del anunciante
async function bannerClick(env, url) {
  const id = Number(url.pathname.slice(3));
  await ensureBanners(env);
  const b = Number.isInteger(id) && id > 0 ? await env.DB.prepare("SELECT url FROM banners WHERE id = ?").bind(id).first() : null;
  if (!b || !b.url) return Response.redirect(url.origin + "/", 302);
  await env.DB.prepare("UPDATE banners SET clicks = clicks + 1 WHERE id = ?").bind(id).run();
  return new Response(null, { status: 302, headers: { location: b.url, "cache-control": "no-store" } });
}

// Vistas: la página manda los banners que mostró (sin cookies ni datos personales)
async function bannerViews(req, env) {
  const body = await req.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);
  if (ids.length) {
    await ensureBanners(env);
    await env.DB.batch(ids.map((id) => env.DB.prepare("UPDATE banners SET views = views + 1 WHERE id = ?").bind(id)));
  }
  return new Response(null, { status: 204 });
}

async function sectionsWithCount(env) {
  await ensurePosts(env);
  const r = await env.DB.prepare("SELECT category, extra_categories FROM posts WHERE published = 1").all();
  const counts = {};
  for (const p of r.results) for (const c of allCats(p)) counts[c] = (counts[c] || 0) + 1;
  return SECTIONS.map((s) => ({ ...s, count: counts[s.name] || 0 }));
}

async function getSettings(env) {
  const r = await env.DB.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const k of SETTINGS_KEYS) out[k] = "";
  for (const row of r.results) if (SETTINGS_KEYS.includes(row.key)) out[row.key] = row.value || "";
  return out;
}

// ---------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------
async function serveImage(req, env, url, ctx) {
  const key = url.pathname.slice(5);
  if (!/^[a-z0-9-]+\.(webp|jpg|png)$/.test(key)) return bad("No encontrado", 404);
  const cache = caches.default;
  const hit = await cache.match(req);
  if (hit) return hit;
  const { value, metadata } = await env.IMAGES.getWithMetadata(key, { type: "arrayBuffer" });
  if (!value) return bad("No encontrado", 404);
  const res = new Response(value, {
    headers: {
      "content-type": (metadata && metadata.type) || "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
  ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}

// ---------------------------------------------------------------
// API de administración
// ---------------------------------------------------------------
async function adminApi(req, env, url) {
  const p = url.pathname.replace(/^\/api\/admin/, "");
  const headers = { "cache-control": "no-store" };

  if (p === "/login" && req.method === "POST") {
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      return bad("Falta configurar ADMIN_PASSWORD y SESSION_SECRET en Cloudflare.", 500);
    }
    const body = await req.json().catch(() => ({}));
    const ok = await safeEqual(String(body.password || ""), env.ADMIN_PASSWORD);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 800));
      return bad("Contraseña incorrecta.", 401);
    }
    const exp = Date.now() + SESSION_DAYS * 864e5;
    const token = `${exp}.${await sign(String(exp), env.SESSION_SECRET)}`;
    return json({ ok: true }, 200, {
      ...headers,
      "set-cookie": `rdl_s=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`,
    });
  }
  if (p === "/logout" && req.method === "POST") {
    return json({ ok: true }, 200, { ...headers, "set-cookie": "rdl_s=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
  }

  const admin = await isLoggedIn(req, env);
  const editor = !admin && (await isEditor(req, env));
  if (!admin && !editor) return bad("Tu sesión terminó. Vuelve a entrar.", 401);
  if (editor && !(p === "/upload" || (["/posts", "/events"].includes(p) && ["GET", "POST"].includes(req.method)))) {
    return bad("El agente editorial solo puede crear borradores de notas y eventos, y subir fotos.", 403);
  }
  if (p === "/me") return json({ ok: true }, 200, headers);

  // Trae una foto de otro sitio para armar las imágenes de redes en el panel
  // (el navegador no deja dibujar fotos de otros sitios si no pasan por aquí)
  if (p === "/proxy" && req.method === "GET") {
    const src = url.searchParams.get("url") || "";
    if (!/^https:\/\/\S+$/.test(src)) return bad("Enlace de foto no válido.");
    const r = await fetch(src, { headers: { "user-agent": "RadioDeLeon/1.0" } }).catch(() => null);
    const type = (r && r.headers.get("content-type")) || "";
    if (!r || !r.ok || !type.startsWith("image/")) return bad("No se pudo traer esa foto.", 502);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 2 * MAX_IMAGE_BYTES) return bad("La foto pesa demasiado.");
    return new Response(buf, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  }

  if (p === "/upload" && req.method === "POST") {
    const type = (req.headers.get("content-type") || "").split(";")[0];
    const ext = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }[type];
    if (!ext) return bad("Solo se aceptan imágenes JPG, PNG o WEBP.");
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) return bad("La imagen pesa más de 5 MB.");
    const key = `${crypto.randomUUID()}.${ext}`;
    await env.IMAGES.put(key, buf, { metadata: { type } });
    return json({ url: `/img/${key}` }, 200, headers);
  }

  if (p === "/settings") {
    if (req.method === "GET") return json(await getSettings(env), 200, headers);
    if (req.method === "PUT") {
      const body = await req.json().catch(() => ({}));
      const stmts = SETTINGS_KEYS.filter((k) => k in body).map((k) =>
        env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .bind(k, String(body[k] ?? "").trim())
      );
      if (stmts.length) await env.DB.batch(stmts);
      return json(await getSettings(env), 200, headers);
    }
  }

  // Facebook e Instagram: qué está conectado, y publicar una nota ya aprobada
  if (p === "/social" && req.method === "GET") {
    return json({ facebook: !!(env.META_PAGE_ID && env.META_PAGE_TOKEN), instagram: !!(env.META_PAGE_TOKEN && env.META_IG_ID) }, 200, headers);
  }
  const sm = p.match(/^\/posts\/(\d+)\/social$/);
  if (sm && req.method === "POST") return await shareToSocial(env, Number(sm[1]), await req.json().catch(() => ({})), headers);

  const m = p.match(/^\/(posts|shows|events|sponsors|banners)(?:\/(\d+))?$/);
  if (!m) return bad("No encontrado", 404);
  const [, table, idStr] = m;
  const def = TABLES[table];
  const id = idStr ? Number(idStr) : null;
  if (table === "banners") await ensureBanners(env);
  if (table === "events") await ensureEvents(env);
  if (table === "posts") await ensurePosts(env);

  if (req.method === "GET" && !id) {
    const r = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${def.order}`).all();
    return json(r.results, 200, headers);
  }
  if (req.method === "GET" && id) {
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
    return row ? json(row, 200, headers) : bad("No encontrado", 404);
  }
  if (req.method === "DELETE" && id) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    return json({ ok: true }, 200, headers);
  }
  if (req.method === "POST" || req.method === "PUT") {
    const body = await req.json().catch(() => null);
    if (!body) return bad("Datos inválidos.");
    const data = {};
    for (const f of def.fields) if (f in body) data[f] = clean(body[f]);
    const err = validate(table, data);
    if (err) return bad(err);

    if ((table === "posts" || table === "events") && ("published" in data || req.method === "POST")) {
      data.published = data.published && !(editor && env.EDITOR_AUTOPUBLISH !== "1") ? 1 : 0;
    }
    if (table === "posts") {
      if ("extra_categories" in data) {
        const prev = !("category" in data) && id ? await env.DB.prepare("SELECT category FROM posts WHERE id = ?").bind(id).first() : null;
        data.extra_categories = packExtraCats(data.extra_categories, "category" in data ? data.category : prev && prev.category);
      }
      if (!data.slug) data.slug = slugify(data.title);
      data.slug = await uniqueSlug(env, slugify(data.slug), id);
      if (data.published && !data.published_at) {
        const prev = id ? await env.DB.prepare("SELECT published_at FROM posts WHERE id = ?").bind(id).first() : null;
        data.published_at = (prev && prev.published_at) || new Date().toISOString();
      }
    }
    if (table === "sponsors" || table === "banners") data.active = data.active ? 1 : 0;

    const cols = Object.keys(data);
    const now = new Date().toISOString();
    if (req.method === "POST") {
      const r = await env.DB.prepare(
        `INSERT INTO ${table} (${cols.join(", ")}, created_at, updated_at) VALUES (${cols.map(() => "?").join(", ")}, ?, ?) RETURNING *`
      ).bind(...cols.map((c) => data[c]), now, now).first();
      return json(r, 201, headers);
    }
    if (!id) return bad("Falta el número de registro.");
    const r = await env.DB.prepare(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ? RETURNING *`
    ).bind(...cols.map((c) => data[c]), now, id).first();
    return r ? json(r, 200, headers) : bad("No encontrado", 404);
  }
  return bad("Método no permitido", 405);
}

// ---------------------------------------------------------------
// Publicar en Facebook e Instagram (API de Meta)
//   META_PAGE_ID     número de la página de Facebook
//   META_PAGE_TOKEN  llave de la página (permanente), con permiso para publicar
//   META_IG_ID       número de la cuenta de Instagram profesional ligada a la página (opcional)
// ---------------------------------------------------------------
const GRAPH = "https://graph.facebook.com/v23.0";
async function graph(env, path, params) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: params ? "POST" : "GET",
    headers: { authorization: `Bearer ${env.META_PAGE_TOKEN}`, ...(params ? { "content-type": "application/json" } : {}) },
    body: params ? JSON.stringify(params) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error((data.error && data.error.message) || `Meta respondió ${res.status}`);
  return data;
}
const tag = (s) => "#" + String(s || "").replace(/[^\p{L}\p{N}]+/gu, "");
function socialCaption(post, forInstagram) {
  const tags = [...new Set(["#RadioDeLeón", ...(post.category ? [tag(post.category)] : []), ...extraCats(post).map(tag), "#León", "#Guanajuato"])].join(" ");
  const more = forInstagram ? "Lee la nota completa en radiodeleon.com (enlace en nuestro perfil)." : "";
  return [post.title, post.excerpt, more, tags].filter(Boolean).join("\n\n");
}
// Publica la nota en la página de Facebook (con enlace) y en Instagram (con la imagen que arma el panel).
// Lo que ya se publicó no se repite.
async function shareToSocial(env, id, body, headers) {
  if (!env.META_PAGE_ID || !env.META_PAGE_TOKEN) return bad("Falta conectar Facebook e Instagram (ver LEEME, sección Redes sociales).");
  await ensurePosts(env);
  const post = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!post) return bad("No encontrado", 404);
  if (!post.published) return bad("Publica la nota en el portal antes de mandarla a redes.");
  const link = `https://${MAIN_HOST}/nota/${post.slug}`;
  const errors = [];

  if (!post.social_fb) {
    try { post.social_fb = (await graph(env, `${env.META_PAGE_ID}/feed`, { message: socialCaption(post, false), link })).id; }
    catch (e) { errors.push(`Facebook: ${e.message}`); }
  }
  const image = String(body.image || "");
  if (env.META_IG_ID && !post.social_ig) {
    if (!/^\/img\/[a-z0-9-]+\.jpg$/.test(image)) errors.push("Instagram: falta la imagen de la nota.");
    else {
      try {
        const box = await graph(env, `${env.META_IG_ID}/media`, { image_url: `https://${MAIN_HOST}${image}`, caption: socialCaption(post, true) });
        // Instagram tarda unos segundos en procesar la imagen
        for (let i = 0; i < 10; i++) {
          const st = await graph(env, `${box.id}?fields=status_code`);
          if (st.status_code === "FINISHED") break;
          if (st.status_code === "ERROR") throw new Error("no pudo procesar la imagen");
          await new Promise((r) => setTimeout(r, 1500));
        }
        post.social_ig = (await graph(env, `${env.META_IG_ID}/media_publish`, { creation_id: box.id })).id;
      } catch (e) { errors.push(`Instagram: ${e.message}`); }
    }
  }
  await env.DB.prepare("UPDATE posts SET social_fb = ?, social_ig = ?, social_error = ? WHERE id = ?")
    .bind(post.social_fb || null, post.social_ig || null, errors.join(" · ") || null, id).run();
  return json({ facebook: !!post.social_fb, instagram: !!post.social_ig, errors }, errors.length && !post.social_fb && !post.social_ig ? 502 : 200, headers);
}

function validate(table, d) {
  if (table === "posts" && "title" in d && !d.title) return "La nota necesita un título.";
  if (table === "shows") {
    if ("name" in d && !d.name) return "El programa necesita un nombre.";
    for (const f of ["start_time", "end_time"]) if (d[f] && !/^\d{2}:\d{2}$/.test(d[f])) return "Las horas van en formato HH:MM, por ejemplo 18:00.";
    if (d.days && !/^[1-7](,[1-7])*$/.test(d.days)) return "Elige al menos un día para el programa.";
  }
  if (table === "events") {
    if ("title" in d && !d.title) return "El evento necesita un título.";
    if ("date" in d && !/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) return "El evento necesita una fecha.";
    if (d.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(d.end_date)) return "La fecha de fin va en formato AAAA-MM-DD.";
    if (d.end_date && d.date && d.end_date < d.date) return "La fecha de fin es antes de la de inicio.";
  }
  if (table === "sponsors" && "name" in d && !d.name) return "El patrocinador necesita un nombre.";
  if (table === "banners") {
    if ("name" in d && !d.name) return "El banner necesita un nombre (por ejemplo, el del anunciante).";
    if ("slot" in d && !BANNER_SLOTS.includes(d.slot)) return "Elige dónde se muestra el banner.";
    for (const f of ["starts_on", "ends_on"]) if (d[f] && !/^\d{4}-\d{2}-\d{2}$/.test(d[f])) return "Las fechas van en formato AAAA-MM-DD.";
    if (d.starts_on && d.ends_on && d.ends_on < d.starts_on) return "La fecha de fin es antes de la de inicio.";
  }
  for (const f of ["link", "url"]) if (d[f] && !/^https?:\/\//.test(d[f])) return "Los enlaces deben empezar con https://";
  for (const f of ["image", "logo"]) if (d[f] && !/^(\/img\/|https:\/\/)\S+$/.test(d[f])) return "El enlace de la foto debe empezar con https://";
  return null;
}

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
function clean(v) {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return null;
  return String(v).trim();
}
function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Mismo formato sencillo que md() en public/index.html: párrafos, ## subtítulos,
// **negritas**, *cursivas*, listas con "- " y enlaces
function md(text) {
  const inline = (s) => escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return String(text || "").replace(/\r/g, "").split(/\n{2,}/).map((b) => {
    b = b.trim();
    if (!b) return "";
    if (b.startsWith("## ")) return `<h3>${inline(b.slice(3))}</h3>`;
    if (b.split("\n").every((l) => /^[-*] /.test(l))) return `<ul>${b.split("\n").map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`;
    return `<p>${b.split("\n").map(inline).join("<br>")}</p>`;
  }).join("");
}
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}
function slugify(s) {
  return String(s || "nota")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80) || "nota";
}
async function uniqueSlug(env, base, id) {
  let slug = base, n = 2;
  while (true) {
    const row = await env.DB.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first();
    if (!row || row.id === id) return slug;
    slug = `${base}-${n++}`;
  }
}
function mexicoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}
async function sign(msg, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]));
}
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function isEditor(req, env) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer (.+)$/);
  return !!(env.EDITOR_TOKEN && m && (await safeEqual(m[1], env.EDITOR_TOKEN)));
}
async function isLoggedIn(req, env) {
  if (!env.SESSION_SECRET) return false;
  const c = (req.headers.get("cookie") || "").match(/(?:^|;\s*)rdl_s=([^;]+)/);
  if (!c) return false;
  const [exp, sig] = c[1].split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await sign(exp, env.SESSION_SECRET));
}
