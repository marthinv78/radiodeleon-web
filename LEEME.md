# Radio de León — página web con panel de administración

- **Página pública:** https://radiodeleon.com
- **Panel para publicar:** https://radiodeleon.com/admin

Todo corre en Cloudflare con el plan gratuito:

| Pieza | Para qué | Límite gratis |
|---|---|---|
| Worker | Sirve la página, el panel y la API | 100,000 visitas al día |
| D1 (base de datos) | Notas, programas, eventos, patrocinadores, ajustes | 5 millones de lecturas al día |
| KV | Fotos | 1 GB y 1,000 fotos nuevas al día |

La música no pasa por aquí: el reproductor toma la señal de `radio.nanostudio.com.mx` (AzuraCast en tu Proxmox).

---

## Publicarla por primera vez (una sola vez, unos 15 minutos)

Abre **PowerShell** dentro de esta carpeta (en el Explorador: clic derecho en un espacio vacío → *Abrir en Terminal*) y corre estos comandos **uno por uno**.

**1. Instalar las herramientas**
```
npm install
```

**2. Conectar con tu cuenta de Cloudflare** (se abre el navegador; dale *Allow*)
```
npx wrangler login
```

**3. Crear la base de datos**
```
npx wrangler d1 create radiodeleon-db
```
Te muestra un `database_id`. Ábrelo en `wrangler.toml` y pégalo donde dice `PEGA-AQUI-EL-ID-DE-D1`.

**4. Crear el almacén de fotos**
```
npx wrangler kv namespace create IMAGES
```
Te muestra un `id`. Pégalo en `wrangler.toml` donde dice `PEGA-AQUI-EL-ID-DE-KV`.

**5. Crear las tablas y las primeras notas**
```
npm run db:init
```

**6. Publicar**
```
npm run deploy
```
Esto también crea la dirección `radiodeleon.com` en tu Cloudflare. La dirección vieja `radiodeleon.nanostudio.com.mx` y `www.radiodeleon.com` redirigen solas a `radiodeleon.com`.

**7. Poner la contraseña del panel**
```
npx wrangler secret put ADMIN_PASSWORD
```
Escribe la contraseña que usarás para entrar a `/admin`. Que sea larga; guárdala en Vaultwarden.

```
npx wrangler secret put SESSION_SECRET
```
Aquí escribe cualquier texto largo y al azar (40 letras y números o más). No tienes que recordarlo; sirve para firmar la sesión.

Listo: entra a https://radiodeleon.com/admin

---

## Uso diario (desde el celular o la compu)

En `/admin`:

- **Noticias:** *+ Nueva nota* → título, categoría, foto, resumen y texto → **Publicar**. *Guardar borrador* la guarda sin que se vea en la página.
- **Programas:** nombre, locutor, foto, días y horario. La página marca solo el programa que está **al aire** según la hora de León.
- **Eventos:** se muestran solos como "próximos" hasta su fecha y después pasan a "pasados".
- **Patrocinadores:** logo y enlace; con *Mostrar en la página* los ocultas sin borrarlos.
- **Ajustes:** WhatsApp, correo, redes y el texto "Sobre la radio".

Las fotos se reducen solas antes de subirse, así que puedes usar las del celular tal cual.

**Formato del texto de las notas:**

```
Deja una línea en blanco entre párrafos.

## Esto es un subtítulo

**negritas** y *cursiva*

- Lista
- de cosas

[texto del enlace](https://ejemplo.com)
```

---

## Banners de anunciantes y eventos

En `/admin` → **Banners** → *+ Nuevo banner*. Hay 4 espacios; usa la medida de cada uno:

| Espacio | Dónde sale | Medida |
|---|---|---|
| Portada | Inicio, debajo de "Lo último" | 1200×300 |
| Entre noticias | Tarjeta en la 4.ª posición de Noticias y de cada sección | 600×600 |
| En la nota | A mitad del texto de cada nota | 1200×300 |
| Patrocinador de la radio | Junto al reproductor, siempre visible (en celular, dentro del menú) | 600×200 |

- **Sección (opcional):** muéstralo solo en una sección, por ejemplo una boutique en *Moda*. En esa sección tiene prioridad sobre los banners generales.
- **Desde / Hasta:** el banner aparece y desaparece solo. Déjalos vacíos para que salga siempre.
- Si hay varios banners en el mismo espacio, **se turnan** al azar en cada visita.
- En la lista ves **vistas, clics y porcentaje** de cada banner, para mostrárselos al anunciante. No usa cookies ni datos personales.
- Si la portada o el espacio de la radio no tienen banner, se muestra **"Anúnciate aquí"** con tu WhatsApp de *Ajustes*.
- Cada banner lleva la etiqueta **Publicidad**.

## Agente editorial

Un agente de Claude investiga, escribe y sube notas sobre moda, mujer, psicología, fundaciones, historia, cine, teatro, espectáculos y cultura. Las deja **como borrador**: tú las lees en `/admin` y les das **Publicar**.

- La línea editorial (voz, secciones y reglas) está en `editorial/GUIA.md`. Si la cambias, el agente la sigue desde la siguiente nota.
- Los pasos que sigue el agente están en `.claude/skills/agente-editorial/SKILL.md`.
- El agente usa su propia llave, que solo sirve para crear borradores y subir fotos: no puede borrar, publicar ni tocar ajustes.

**Darle su llave (una sola vez):**
```
npx wrangler secret put EDITOR_TOKEN
```
Escribe un texto largo y al azar y guárdalo en Vaultwarden. Ese mismo valor va en la variable `RDL_EDITOR_TOKEN` del entorno donde corre el agente.

**Cuando confíes en el agente** y quieras que publique sin tu revisión:
```
npx wrangler secret put EDITOR_AUTOPUBLISH
```
y escribe `1`. Para volver a revisarlas tú, bórralo con `npx wrangler secret delete EDITOR_AUTOPUBLISH`.

## Publicar en Facebook e Instagram

Cuando le das **Publicar** a una nota en `/admin`, la casilla **"Al publicar, mandarla también a Facebook e Instagram"** la manda sola:

- **Facebook:** en tu página, con el título, el resumen y el enlace a la nota (la vista previa toma la foto de la nota).
- **Instagram:** la imagen vertical de la marca (1080×1350) con el texto y los hashtags. Instagram no deja enlaces en las publicaciones, así que el texto invita a ir al enlace del perfil.

Cada nota se manda una sola vez. En la lista de Noticias verás las etiquetas **Facebook** e **Instagram** cuando ya salió. Si algo falla, dentro de la nota aparece el motivo y un botón **Mandar a redes ahora** para reintentar.
Las notas que el agente publique solo (con `EDITOR_AUTOPUBLISH`) **no** se mandan a redes: solo las que apruebas tú en el panel.

**Conectarlo (una sola vez, desde la compu):**

1. Tu Instagram debe ser **cuenta profesional** (de empresa o de creador) y estar **ligada a tu página de Facebook**. Se hace en Instagram: *Configuración → Tipo de cuenta y herramientas*, y en Facebook: *Configuración de la página → Cuentas vinculadas*.
2. Entra a **developers.facebook.com**, crea una app de tipo **Empresa** (*Business*) y ponle de nombre "Radio de León".
3. Abre el **Explorador de la API Graph** (*Herramientas → Graph API Explorer*), elige tu app y en **Permisos** agrega:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`.
   Dale **Generar token** y acepta con tu cuenta.
4. Copia ese token y ábrelo en el **Depurador de tokens** (*Herramientas → Access Token Debugger*). Abajo, dale **Extender el token de acceso**: te da uno que dura 60 días.
5. De regreso en el Explorador, pega el token largo y consulta `me/accounts`. Ahí aparece tu página con su `id` y su `access_token`. **Ese `access_token` de la página no caduca.**
6. Consulta `ID-DE-TU-PAGINA?fields=instagram_business_account` para sacar el número de tu Instagram.
7. En la app, cambia el modo de **Desarrollo** a **Publicado** (*Live*), para que todos vean las publicaciones. Meta te pide el enlace a una política de privacidad.
8. Guarda los tres datos en Cloudflare:
```
npx wrangler secret put META_PAGE_ID
npx wrangler secret put META_PAGE_TOKEN
npx wrangler secret put META_IG_ID
```
Guarda también el token en Vaultwarden. Si un día cambias la contraseña de Facebook, el token deja de servir y hay que repetir los pasos 3 a 5.

## Google y redes sociales

Cada nota sale lista para buscadores y para compartir: título, resumen y foto en la vista previa de WhatsApp, Facebook y X; el texto ya escrito en la página; y los datos de artículo que lee Google (fecha, sección, foto y quién publica).

- `/sitemap.xml`: la lista de todas las notas para Google. Se actualiza sola.
- `/rss.xml`: las últimas 30 notas, para lectores de noticias y herramientas que publican en redes.
- `/robots.txt`: le dice a Google que no entre al panel.

**Para que Google empiece a leer la página (una sola vez):** entra a https://search.google.com/search-console, agrega `radiodeleon.com` y, en *Sitemaps*, escribe `sitemap.xml` y dale *Enviar*.

## Hacer cambios al diseño

Edita los archivos de `public/` (`index.html` es la página y `admin.html` el panel) y vuelve a correr:
```
npm run deploy
```
Tus notas y fotos no se tocan: viven en la base de datos.

## Probar en tu compu antes de publicar

Crea un archivo `.dev.vars` con:
```
ADMIN_PASSWORD=una-de-prueba
SESSION_SECRET=otra-de-prueba
```
y corre:
```
npx wrangler d1 execute radiodeleon-db --local --file=schema.sql
npm run dev
```
Abre http://localhost:8787 (los datos de prueba no afectan la página real).

## Archivos

```
public/index.html   página pública (reproductor, noticias, programas, eventos, contacto)
public/admin.html   panel de administración
public/og.jpg       imagen al compartir la página
src/worker.js       servidor: API, sesión del panel, fotos y vista previa para WhatsApp
editorial/          guía editorial, plantilla de nota y script con que el agente sube borradores
schema.sql          estructura de la base de datos y notas iniciales
wrangler.toml       configuración de Cloudflare
```
