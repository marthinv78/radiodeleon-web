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
    fields: ["slug", "title", "excerpt", "body", "category", "image", "published", "published_at"],
    order: "COALESCE(published_at, created_at) DESC",
  },
  shows: {
    fields: ["name", "host", "image", "days", "start_time", "end_time", "description", "sort"],
    order: "sort, start_time",
  },
  events: {
    fields: ["title", "date", "time", "place", "image", "description", "link"],
    order: "date DESC, time",
  },
  sponsors: {
    fields: ["name", "logo", "url", "active", "sort"],
    order: "sort, id",
  },
};
const SETTINGS_KEYS = ["whatsapp", "email", "facebook", "instagram", "tiktok", "youtube", "about"];
const SESSION_DAYS = 30;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
const bad = (msg, status = 400) => json({ error: msg }, status);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p.startsWith("/api/admin/")) return await adminApi(req, env, url);
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
async function servePage(req, env, url) {
  const res = await env.ASSETS.fetch(req);
  if (res.status !== 404) return res;

  // Rutas de la página (/noticias, /nota/x, /programas…) → misma página
  const shell = await env.ASSETS.fetch(new Request(new URL("/", url), req));
  const m = url.pathname.match(/^\/nota\/([a-z0-9-]+)\/?$/);
  if (!m) return new Response(shell.body, { status: 200, headers: shell.headers });

  const post = await env.DB.prepare(
    "SELECT title, excerpt, image FROM posts WHERE slug = ? AND published = 1"
  ).bind(m[1]).first();
  if (!post) return new Response(shell.body, { status: 404, headers: shell.headers });

  // Datos para la vista previa al compartir en WhatsApp/Facebook
  const title = `${post.title} · Radio de León`;
  const desc = post.excerpt || "Noticias de Radio de León";
  const img = post.image ? new URL(post.image, url).href : null;
  const set = (attr) => ({ element(el) { el.setAttribute("content", attr); } });
  let rw = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:type"]', set("article"))
    .on('meta[property="og:url"]', set(url.href));
  if (img) rw = rw.on('meta[property="og:image"]', set(img));
  return rw.transform(new Response(shell.body, { status: 200, headers: shell.headers }));
}

// ---------------------------------------------------------------
// API pública
// ---------------------------------------------------------------
async function publicApi(req, env, url) {
  if (req.method !== "GET") return bad("Método no permitido", 405);
  const p = url.pathname;
  const cache = { "cache-control": "public, max-age=30" };
  const today = mexicoToday();

  if (p === "/api/home") {
    const [posts, shows, events, sponsors, settings] = await Promise.all([
      listPosts(env, 7, 0),
      env.DB.prepare(`SELECT * FROM shows ORDER BY ${TABLES.shows.order}`).all(),
      env.DB.prepare("SELECT * FROM events WHERE date >= ? ORDER BY date, time LIMIT 4").bind(today).all(),
      env.DB.prepare("SELECT * FROM sponsors WHERE active = 1 ORDER BY sort, id").all(),
      getSettings(env),
    ]);
    return json({ posts, shows: shows.results, events: events.results, sponsors: sponsors.results, settings }, 200, cache);
  }
  if (p === "/api/posts") {
    const limit = clampInt(url.searchParams.get("limit"), 1, 50, 12);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);
    return json(await listPosts(env, limit, offset), 200, cache);
  }
  let m = p.match(/^\/api\/posts\/([a-z0-9-]+)$/);
  if (m) {
    const post = await env.DB.prepare("SELECT * FROM posts WHERE slug = ? AND published = 1").bind(m[1]).first();
    return post ? json(post, 200, cache) : bad("Esa nota no existe o ya no está publicada.", 404);
  }
  if (p === "/api/shows") {
    const r = await env.DB.prepare(`SELECT * FROM shows ORDER BY ${TABLES.shows.order}`).all();
    return json(r.results, 200, cache);
  }
  if (p === "/api/events") {
    const [up, past] = await Promise.all([
      env.DB.prepare("SELECT * FROM events WHERE date >= ? ORDER BY date, time").bind(today).all(),
      env.DB.prepare("SELECT * FROM events WHERE date < ? ORDER BY date DESC LIMIT 12").bind(today).all(),
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

async function listPosts(env, limit, offset) {
  const r = await env.DB.prepare(
    `SELECT id, slug, title, excerpt, category, image, published_at, created_at
     FROM posts WHERE published = 1 ORDER BY ${TABLES.posts.order} LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  return r.results;
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
  if (editor && !(p === "/upload" || (p === "/posts" && ["GET", "POST"].includes(req.method)))) {
    return bad("El agente editorial solo puede crear borradores y subir fotos.", 403);
  }
  if (p === "/me") return json({ ok: true }, 200, headers);

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

  const m = p.match(/^\/(posts|shows|events|sponsors)(?:\/(\d+))?$/);
  if (!m) return bad("No encontrado", 404);
  const [, table, idStr] = m;
  const def = TABLES[table];
  const id = idStr ? Number(idStr) : null;

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

    if (table === "posts") {
      data.published = data.published && !(editor && env.EDITOR_AUTOPUBLISH !== "1") ? 1 : 0;
      if (!data.slug) data.slug = slugify(data.title);
      data.slug = await uniqueSlug(env, slugify(data.slug), id);
      if (data.published && !data.published_at) {
        const prev = id ? await env.DB.prepare("SELECT published_at FROM posts WHERE id = ?").bind(id).first() : null;
        data.published_at = (prev && prev.published_at) || new Date().toISOString();
      }
    }
    if (table === "sponsors") data.active = data.active ? 1 : 0;

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
  }
  if (table === "sponsors" && "name" in d && !d.name) return "El patrocinador necesita un nombre.";
  for (const f of ["link", "url"]) if (d[f] && !/^https?:\/\//.test(d[f])) return "Los enlaces deben empezar con https://";
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
