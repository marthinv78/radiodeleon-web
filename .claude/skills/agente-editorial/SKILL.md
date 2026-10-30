---
name: agente-editorial
description: Agente editorial de Radio de León. Busca, investiga, escribe y sube como borrador notas para el blog sobre moda, mujer, psicología, fundaciones, historia, cine, teatro, espectáculos y cultura. Úsala cuando pidan "escribe notas", "alimenta el blog", "tanda editorial" o cuando la dispare la tarea programada.
---

# Agente editorial — Radio de León

Por cada nota que te pidan (2 o 3 si no te dicen el número), sigue estos pasos en orden.

## 1. Prepárate

1. Lee `editorial/GUIA.md` completa. Es la línea editorial y sus reglas no se rompen.
2. Revisa lo que ya existe para no repetir temas:
   ```bash
   node editorial/publicar.mjs --listar
   ```
3. Elige las secciones de esta tanda: que sean distintas entre sí y distintas de las 3 notas más recientes.

## 2. Busca el tema

Para cada sección, busca en la web qué hay de actualidad: estrenos, obras en cartelera, aniversarios y efemérides de los próximos días, estudios recientes, eventos en León y Guanajuato. Escoge un tema que:
- Sea interesante para un lector culto de León.
- Tenga ángulo local, o sea de actualidad o un clásico que valga la pena.
- No esté en la lista de notas existentes.

## 3. Investiga

- Lee **al menos 3 fuentes** sobre el tema; vas a citar mínimo 2.
- Confirma cada dato duro (fechas, cifras, nombres, sedes) en más de una fuente. Si es un evento, confírmalo en la fuente oficial.
- Si no logras verificar algo importante, cambia de tema. No inventes.

## 4. Escribe

- Copia `editorial/plantilla.md` a `editorial/notas/AAAA-MM-DD-tema-corto.md` y llénala.
- Sigue la voz y el formato de la guía: de 500 a 900 palabras y de 2 a 4 subtítulos `##`. Todo con palabras propias.
- Relee el texto como editor: corta lo que sobre, revisa ortografía y acentos, y confirma que el título y el resumen cumplen las medidas.

## 5. Foto

- Busca en Unsplash, Pexels o Wikimedia Commons una foto con licencia libre que vaya con el tema.
- En `foto` va el **enlace directo al archivo de imagen** (JPG, PNG o WEBP, menos de 5 MB). En Unsplash usa `https://images.unsplash.com/photo-…?w=1600&q=80&fm=jpg`.
- En `foto_credito` va `Autor / Unsplash`, o el banco que sea.
- Si no encuentras una foto adecuada con licencia libre, deja `foto` vacío. Nunca uses fotos de medios ni de redes.

## 6. Súbela como borrador

```bash
node editorial/publicar.mjs editorial/notas/AAAA-MM-DD-tema-corto.md
```
El servidor la guarda **como borrador** y el dueño la revisa y publica desde `/admin`. No pongas `publicar: si` a menos que el dueño lo pida.

Si el script marca un error (nota corta, sin fuentes, foto pesada), corrígelo y vuelve a correrlo.

## Modo evento

Cuando te pidan un evento ("busca el FIG 2026 y publícalo", "sube el concierto de X"), o cuando en la tanda diaria encuentres un evento próximo en León o Guanajuato que valga la pena y no esté en la lista de eventos:

1. Revisa con `--listar` que el evento no esté ya en la sección Eventos.
2. **Confirma en la fuente oficial** (sitio del organizador, de la sede o de la boletera): fechas exactas de inicio y fin, horario, sede, precios y cómo comprar. Si la fuente oficial todavía no publica las fechas, **no subas el evento** y reporta qué falta.
3. Copia `editorial/plantilla-evento.md` a `editorial/notas/AAAA-MM-DD-evento-tema.md` y llénala:
   - `fecha` es el primer día. `termina` es el último día, solo si dura varios.
   - `enlace` es el sitio oficial.
   - El texto es la descripción: corta, de 80 a 200 palabras, en 2 a 4 párrafos. Di qué es, lo destacado de este año, boletos y cómo llegar. Lo que no esté confirmado, no se escribe.
4. Súbelo con `node editorial/publicar.mjs editorial/notas/…md`. Queda como borrador en la pestaña Eventos.
5. Si es un evento grande (FIG, Feria de León, Cervantino, conciertos importantes), escribe **además una nota** en *Espectáculos* o *Cultura*: historia del evento, qué esperar y recomendaciones. Sigue los pasos normales y enlaza al sitio oficial en el texto. La nota atrae lectores desde Google y el evento queda en el calendario.

## 7. Reporta

Al terminar, deja un resumen breve con, por cada nota: título, sección, de qué trata en una línea y las fuentes principales. Si algo no se pudo hacer, dilo.
