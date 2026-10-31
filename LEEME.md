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

**Cómo está conectado** (ya quedó hecho el 30 de octubre de 2026):

- **Instagram** `radiodeleon` es cuenta profesional de empresa, ligada a la página **Radio de León** dentro del portfolio comercial **Radio de León**.
- **App de Meta:** "Radio de León" (ID `1449993797089805`), publicada, con los casos de uso *Administrar todos los aspectos de tu página* y *Administrar mensajes y contenido en Instagram*. Política de privacidad: `https://radiodeleon.com/privacidad`.
- **Usuario del sistema** `PublicadorRDL` en el portfolio (business.facebook.com/settings → Usuarios del sistema), con acceso total a la página, al Instagram y a la app. Su token **nunca caduca**.
- **En Cloudflare** (radiodeleon-web → Configuración → Variables y secretos): `META_PAGE_ID` y `META_PAGE_TOKEN` como **Secreto**. `META_IG_ID` está en `wrangler.toml`.

**Si hay que cambiar la llave** (porque se filtró o dejó de funcionar):

1. En business.facebook.com/settings → **Usuarios del sistema** → `PublicadorRDL` → **Revocar tokens**.
2. **Generar token** → app *Radio de León* → caducidad **Nunca** → permisos `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`.
3. En developers.facebook.com → **Herramientas → Explorador de la API Graph**, pega ese token en *Token de acceso* y consulta:
```
1339591792579773?fields=name,access_token,instagram_business_account
```
4. Copia solo el texto de `access_token` (empieza con `EAA`, sin comillas) y ponlo en Cloudflare en `META_PAGE_TOKEN` con el lápiz, como **Secreto**.
5. Guarda las dos llaves en Vaultwarden. Nunca las pegues en un chat ni en GitHub.

## Alexa: "Alexa, abre Radio de León"

> **Versión que se usa: la alojada por Amazon** (`alexa/alojada/index.js`). Amazon no lograba conectarse a `radiodeleon.com/alexa` (la petición nunca llegaba a Cloudflare, probablemente por el certificado), así que la skill corre en los servidores de Amazon (*Alexa-hosted, Node.js*). El código se pega en la pestaña **Code** de la consola, en `lambda/index.js`, y se publica con **Deploy**. La versión en Cloudflare (`src/alexa.js`) queda como respaldo.

La radio tiene su propia skill de Alexa, así que no depende de que TuneIn la encuentre. La parte que responde a Alexa ya vive en esta página (`src/alexa.js`, en `radiodeleon.com/alexa`): revisa que cada petición venga de Amazon y pone la señal en vivo.

Lo que la gente puede decir:
- *"Alexa, abre Radio de León"*: empieza a sonar.
- *"Alexa, pregúntale a Radio de León qué canción es"*: dice la canción y el artista.
- *"Alexa, pausa"*, *"Alexa, continúa"*, *"Alexa, detente"*.

**Darla de alta (una sola vez):**

1. Entra a **developer.amazon.com/alexa/console/ask** con **la misma cuenta de Amazon de tu Alexa**, así la pruebas en tu bocina desde el primer día.
2. **Create Skill**: nombre `Radio de León`, idioma **Spanish (MX)**, tipo **Other → Custom**, alojamiento **Provision your own**, y **Start from scratch**.
3. En **Build → Interaction Model → JSON Editor**, borra lo que hay, pega el contenido de `alexa/modelo-de-voz.json`, y dale **Save** y luego **Build skill**.
4. En **Build → Interfaces**, prende **Audio Player** y dale **Save**.
5. En **Build → Endpoint**, elige **HTTPS**. En *Default Region* escribe `https://radiodeleon.com/alexa` y elige *"My development endpoint has a certificate from a trusted certificate authority"*. Dale **Save**.
6. El **Skill ID** (en la lista de skills, enlace *Copy Skill ID*) ya está en `wrangler.toml` como `ALEXA_SKILL_ID`: solo esa skill puede usar la dirección. Si algún día creas otra skill, cámbialo ahí y vuelve a publicar.
7. En la pestaña **Test**, cambia *Off* a **Development**. Ya puedes decirle a tu bocina *"Alexa, abre Radio de León"*.
8. Para que la use todo el mundo: en **Distribution** llena los textos que están en `alexa/skill.json` (nombre, resumen, descripción, frases de ejemplo y palabras clave), sube los íconos `public/brand/alexa-108.png` y `public/brand/alexa-512.png` y pon como política de privacidad `https://radiodeleon.com/privacidad`. Después, en **Certification**, dale **Submit for review**. Amazon tarda unos días en aprobarla.

Si cambia la dirección de la señal, cámbiala arriba de `src/alexa.js` (y en `public/index.html`) y vuelve a publicar.

**Estado:** la skill alojada por Amazon (ID `amzn1.ask.skill.fd9b7a25-480b-4786-8b9b-df0336280be7`, español de México, España y EE. UU.) pasó la validación y se mandó a certificación el 31 de octubre de 2026. Los textos de la ficha están en `alexa/skill.json`.

**Pendiente cuando la aprueben:** agregar en *Build → Skill Launch Phrases* frases sin nombre como "pon radio de león" y "quiero escuchar radio de león", para que Alexa abra la skill sin decir "skill" y no ponga otra emisora con nombre parecido.

## Google y redes sociales

Cada nota sale lista para buscadores y para compartir: título, resumen y foto en la vista previa de WhatsApp, Facebook y X; el texto ya escrito en la página; y los datos de artículo que lee Google (fecha, sección, foto y quién publica).

- `/sitemap.xml`: la lista de todas las notas para Google. Se actualiza sola.
- `/rss.xml`: las últimas 30 notas, para lectores de noticias y herramientas que publican en redes.
- `/robots.txt`: le dice a Google que no entre al panel.

**Para que Google empiece a leer la página (una sola vez):** entra a https://search.google.com/search-console, agrega `radiodeleon.com` y, en *Sitemaps*, escribe `sitemap.xml` y dale *Enviar*.

## Kit para anunciantes

- **Página:** https://radiodeleon.com/anunciate (enlace "Anúnciate" abajo en todo el sitio). Los paquetes y precios están en `ADV_PACKS`, en `public/index.html`.
- **PDF de una hoja** para mandar por WhatsApp: `kit-anunciantes/Radio-de-Leon-anunciantes.pdf`. Se genera desde `kit-anunciantes/kit.html` con `node kit-anunciantes/generar-pdf.mjs` (necesita `npm i playwright`).
- Si cambias un precio, cámbialo en los dos lugares y vuelve a generar el PDF.

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
