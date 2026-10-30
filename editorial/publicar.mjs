// =============================================================
// Radio de León — sube una nota del agente editorial como borrador
//
//   node editorial/publicar.mjs notas/mi-nota.md   sube la nota
//   node editorial/publicar.mjs --listar           últimas 80 notas (para no repetir temas)
//
// Necesita las variables:
//   RDL_EDITOR_TOKEN   la llave del agente (el mismo valor que EDITOR_TOKEN en Cloudflare)
//   RDL_URL            opcional; por defecto https://radiodeleon.nanostudio.com.mx
//
// Formato de la nota (ver editorial/plantilla.md):
//   ---
//   titulo: ...
//   categoria: Cine
//   resumen: ...
//   foto: https://images.unsplash.com/...?w=1600   (enlace directo a la imagen)
//   foto_credito: Nombre del autor / Unsplash
//   fuentes:
//   - Nombre del medio | https://...
//   ---
//   Texto de la nota en el formato de la página (## subtítulos, **negritas**, listas con "- ").
// =============================================================

import { readFile } from "node:fs/promises";

const BASE = (process.env.RDL_URL || "https://radiodeleon.nanostudio.com.mx").replace(/\/+$/, "");
const TOKEN = process.env.RDL_EDITOR_TOKEN;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
if (!TOKEN) die("Falta la variable RDL_EDITOR_TOKEN.");

async function api(path, init = {}) {
  const res = await fetch(`${BASE}/api/admin${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(`${path}: ${data.error || res.status}`);
  return data;
}

function parse(text) {
  const m = text.replace(/\r/g, "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) die("La nota debe empezar con el bloque --- de datos (ver editorial/plantilla.md).");
  const meta = { fuentes: [] };
  let list = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && list) { meta[list].push(item[1].trim()); continue; }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    list = kv[2] ? null : kv[1];
    if (list) meta[list] = meta[list] || [];
    else meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2].trim() };
}

async function uploadPhoto(url) {
  const res = await fetch(url, { headers: { "user-agent": "RadioDeLeon-Editorial/1.0" } });
  if (!res.ok) die(`No se pudo bajar la foto (${res.status}): ${url}`);
  const type = (res.headers.get("content-type") || "").split(";")[0];
  if (!TYPES[type]) die(`La foto debe ser JPG, PNG o WEBP (llegó ${type || "sin tipo"}).`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) die("La foto pesa más de 5 MB; usa una versión más chica (por ejemplo ?w=1600).");
  return (await api("/upload", { method: "POST", headers: { "content-type": type }, body: buf })).url;
}

if (process.argv[2] === "--listar") {
  const posts = await api("/posts");
  for (const p of posts.slice(0, 80)) {
    const fecha = (p.published_at || p.created_at || "").slice(0, 10);
    console.log(`${fecha}  ${p.published ? "publicada" : "borrador "}  [${p.category || "-"}] ${p.title}`);
  }
  process.exit(0);
}

const file = process.argv[2];
if (!file) die("Uso: node editorial/publicar.mjs <nota.md>  |  --listar");
const { meta, body } = parse(await readFile(file, "utf8"));
for (const k of ["titulo", "categoria", "resumen"]) if (!meta[k]) die(`Falta "${k}" en el bloque de datos.`);
if (meta.fuentes.length === 0) die("Toda nota necesita al menos una fuente.");
if (body.split(/\s+/).length < 300) die("La nota es muy corta (mínimo 300 palabras).");

let text = body;
if (meta.foto && meta.foto_credito) text += `\n\n*Foto: ${meta.foto_credito}*`;
text += "\n\n## Fuentes\n\n" + meta.fuentes.map((f) => {
  const [name, link] = f.split("|").map((s) => s.trim());
  return link ? `- [${name}](${link})` : `- ${name}`;
}).join("\n");

const image = meta.foto ? await uploadPhoto(meta.foto) : null;
const post = await api("/posts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: meta.titulo,
    category: meta.categoria,
    excerpt: meta.resumen,
    body: text,
    image,
    published: meta.publicar === "si",
  }),
});
console.log(`✓ ${post.published ? "Publicada" : "Borrador guardado"}: ${post.title}`);
console.log(`  Revisar en ${BASE}/admin`);
