# Audio de la radio: cortinillas y promos

## Lo que hay

| Archivo | Duración | Lista en AzuraCast |
|---|---|---|
| `cortinillas/cortinilla-01-con-fondo.mp3` | 6.8 s | Cortinillas |
| `cortinillas/cortinilla-02-con-fondo.mp3` | 8.2 s | Cortinillas |
| `cortinillas/cortinilla-03-con-fondo.mp3` | 17.5 s | promos |

Cada una está también **sin fondo** (`cortinilla-0X.mp3`), solo con la voz.
Todas quedaron a **-14 LUFS** con pico de -1 dB (el volumen de la música en radio), sin silencios al inicio ni al final, con las pausas recortadas y la voz 12 % más ágil sin cambiar su tono.

El **fondo musical** lo genera `fondo.py` desde cero (sintetizado aquí, sin muestras ni canciones de nadie), así que es propio y no paga derechos: barrido y golpe de entrada, acordes La menor – Fa – Do – Sol con arpegio y bombo suave, la música baja unos 13 dB cuando entra la voz y cierra con un acorde de campanas.

## Hacer una nueva

Con la grabación (sirve el audio tal cual llega por WhatsApp):

```
bash audio/procesar.sh grabacion.mpeg 04
```

Deja `cortinillas/cortinilla-04.mp3` y `cortinillas/cortinilla-04-con-fondo.mp3`. Necesita `ffmpeg` y Python con `numpy` y `scipy` (`pip install numpy scipy`).
Si la voz queda acelerada, usa menos velocidad: `VEL=1.08 bash audio/procesar.sh grabacion.mpeg 04`.

## Programarlas en AzuraCast

Panel: https://radio.nanostudio.com.mx → estación **Radio de León**.

1. **Medios → Archivos de música → carpeta `Cortinillas`** → subir los archivos *con fondo*.
2. **Listas de reproducción** (ya están creadas):
   - **Cortinillas**: *Una vez cada 3 canciones*, con **Modo Jingle** (oculta el nombre del archivo en la página y en TuneIn).
   - **promos**: *Una vez cada 30 minutos*, con **Modo Jingle**.
3. En **Medios**, marcar cada archivo → **Listas de reproducción** → elegir su lista → Guardar.
4. Si aparece **"Recargar para aplicar cambios"**, darle clic. Se puede revisar qué viene en **Emitiendo → Lista de Canciones en Cola**.

Al activar listas nuevas, la primera vuelta puede juntar una cortinilla y la promo; después se separan solas.
