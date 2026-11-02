#!/usr/bin/env bash
# =============================================================
# Radio de León: deja una grabación de voz lista para el aire
#
#   bash audio/procesar.sh grabacion.mpeg 04
#
# Crea en audio/cortinillas/:
#   cortinilla-04.mp3            solo voz
#   cortinilla-04-con-fondo.mp3  voz con el fondo musical de la radio
#
# Qué hace: quita silencios al inicio y al final, acorta las pausas
# entre frases, acelera la voz 12 % sin cambiar su tono, la deja al
# volumen de radio (-14 LUFS, pico -1 dB) y le pone el fondo de audio/fondo.py.
#
# Necesita ffmpeg (con rubberband) y Python con numpy y scipy:
#   pip install numpy scipy
# =============================================================
set -euo pipefail

IN="$1"; ID="$2"
VEL="${VEL:-1.12}"                    # velocidad de la voz (1.08 si suena acelerada)
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/cortinillas"; TMP="$(mktemp -d)"; mkdir -p "$OUT"
trap 'rm -rf "$TMP"' EXIT

# Silencio del inicio y del final, y pausas internas de máximo 0.12 s
ORILLAS="silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse"
PAUSAS="silenceremove=stop_periods=-1:stop_threshold=-42dB:stop_duration=0.12:stop_silence=0.12:detection=rms"

lufs() { ffmpeg -hide_banner -nostats -i "$1" -af ebur128 -f null - 2>&1 | grep -A3 Summary | grep " I:" | awk '{print $2}'; }

# Sube el volumen hasta -14 LUFS con un limitador para que no sature
volumen() { # entrada salida título
  local g=0 l
  for _ in 1 2 3; do
    ffmpeg -hide_banner -loglevel error -y -i "$1" \
      -af "volume=${g}dB,alimiter=limit=0.84:attack=2:release=60:level=false" \
      -ar 44100 -c:a libmp3lame -b:a 320k -id3v2_version 3 \
      -metadata title="$3" -metadata artist="Radio de León" "$2"
    l=$(lufs "$2"); g=$(python3 -c "print(round($g + (-14 - $l), 2))")
  done
}

ffmpeg -hide_banner -loglevel error -y -i "$IN" \
  -af "$ORILLAS,$PAUSAS,rubberband=tempo=$VEL:pitchq=quality:formant=preserved,aresample=44100" \
  -ar 44100 -c:a pcm_s16le "$TMP/voz.wav"
volumen "$TMP/voz.wav" "$OUT/cortinilla-$ID.mp3" "Cortinilla $ID"

ffmpeg -hide_banner -loglevel error -y -i "$OUT/cortinilla-$ID.mp3" -c:a pcm_s16le "$TMP/voz-lista.wav"
python3 "$DIR/fondo.py" "$TMP/voz-lista.wav" "$TMP/mezcla.wav" >/dev/null
volumen "$TMP/mezcla.wav" "$OUT/cortinilla-$ID-con-fondo.mp3" "Cortinilla $ID (con fondo)"

echo "Listo: $OUT/cortinilla-$ID.mp3 y $OUT/cortinilla-$ID-con-fondo.mp3"
