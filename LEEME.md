# Radio de León — página web con panel de administración

- **Página pública:** https://radiodeleon.nanostudio.com.mx
- **Panel para publicar:** https://radiodeleon.nanostudio.com.mx/admin

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
Esto también crea la dirección `radiodeleon.nanostudio.com.mx` en tu Cloudflare.

**7. Poner la contraseña del panel**
```
npx wrangler secret put ADMIN_PASSWORD
```
Escribe la contraseña que usarás para entrar a `/admin`. Que sea larga; guárdala en Vaultwarden.

```
npx wrangler secret put SESSION_SECRET
```
Aquí escribe cualquier texto largo y al azar (40 letras y números o más). No tienes que recordarlo; sirve para firmar la sesión.

Listo: entra a https://radiodeleon.nanostudio.com.mx/admin

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
