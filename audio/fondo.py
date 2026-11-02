# Cortinilla con fondo musical original (sintetizado desde cero, sin derechos de terceros)
# Uso: python3 fondo.py voz.wav salida.wav
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
rng = np.random.default_rng(7)

def note(n):  # número MIDI -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)

def env(length, a, r):
    t = np.arange(length) / SR
    e = np.minimum(1, t / a) if a > 0 else np.ones(length)
    tail = np.clip((length / SR - t) / r, 0, 1)
    return e * tail

def lowpass(x, f, order=4):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)

def pad(freqs, dur, detune=0.006):
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for d in (-detune, 0, detune):
            ph = rng.random() * 2 * np.pi
            # diente de sierra suave (suma de armónicos)
            for k in range(1, 7):
                out += np.sin(2 * np.pi * f * (1 + d) * k * t + ph * k) / (k * 1.6)
    out = lowpass(out, 1800)
    return out / np.max(np.abs(out)) * env(n, 0.35, 0.5)

def pluck(f, dur=0.6):
    n = int(dur * SR); t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t))
    return x * np.exp(-t * 6) * env(n, 0.004, 0.05)

def bell(f, dur=2.5):
    n = int(dur * SR); t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * dcy) for m, a, dcy in
            [(1, 1, 1.6), (2.0, .45, 2.4), (3.01, .22, 3.5), (4.2, .12, 5)])
    return x * env(n, 0.003, 0.3)

def kick(dur=0.45):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 45 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)

def whoosh(dur, up=True):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    # barrido de filtro por bloques
    out = np.zeros(n); blk = 1024
    for i in range(0, n, blk):
        p = i / n if up else 1 - i / n
        f = 300 + 7000 * p ** 2
        seg = x[max(0, i - 4096):i + blk]
        out[i:i + blk] = lowpass(seg, f, 2)[-len(x[i:i + blk]):]
    return out * (np.linspace(0, 1, n) ** 2 if up else np.linspace(1, 0, n) ** 2)

def put(buf, x, at, gain=1.0):
    i = int(at * SR); j = min(len(buf), i + len(x))
    buf[i:j] += x[:j - i] * gain

def reverb(x, secs=2.2, mix=0.25):
    n = int(secs * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.2)
    ir = lowpass(ir, 6000, 2); ir /= np.sqrt(np.sum(ir ** 2))
    wet = fftconvolve(x, ir)[:len(x)]
    return x * (1 - mix) + wet * mix * 1.4

sr, voz = wavfile.read(sys.argv[1])
voz = voz.astype(np.float64) / 32768.0
if voz.ndim == 1:
    voz = np.stack([voz, voz], 1)
V0 = 0.85                                   # la voz entra a los 0.85 s
vdur = len(voz) / SR
total = V0 + vdur + 2.4                     # remate final y cola
N = int(total * SR)
L = np.zeros(N); R = np.zeros(N)

# Acordes nostálgicos: Am9 - Fmaj7 - C - G (y remate en C add9)
chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 60, 64, 67], [55, 59, 62, 67, 71]]
step = (V0 + vdur) / 4
for i, ch in enumerate(chords):
    p = pad([note(n) for n in ch], step + 0.6)
    put(L, p, i * step, 0.30); put(R, np.roll(p, 220), i * step, 0.30)
    # arpegio suave
    arp = [ch[0] + 12, ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 12, ch[2] + 12]
    for k in range(int(step / 0.3)):
        nn = arp[k % len(arp)]
        side = 0.6 if k % 2 else 0.4
        x = pluck(note(nn))
        put(L, x, i * step + k * 0.3, 0.12 * (1 - side) * 2); put(R, x, i * step + k * 0.3, 0.12 * side * 2)
    for b in range(int(step / 0.6)):
        put(L, kick(), i * step + b * 0.6, 0.35); put(R, kick(), i * step + b * 0.6, 0.35)

# Arranque: barrido + golpe
w = whoosh(0.8)
put(L, w, 0.0, 0.18); put(R, w, 0.02, 0.18)
put(L, kick(0.8), 0.78, 0.9); put(R, kick(0.8), 0.78, 0.9)

# Remate final: acorde de campanas + golpe
END = V0 + vdur + 0.1
for n in [60, 64, 67, 72, 74, 79]:
    b = bell(note(n))
    put(L, b, END + (n % 3) * 0.015, 0.14); put(R, b, END + (n % 2) * 0.02, 0.14)
put(L, kick(0.9), END, 0.9); put(R, kick(0.9), END, 0.9)
pf = pad([note(n) for n in [48, 55, 60, 64, 67, 74]], 2.3)
put(L, pf, END, 0.32); put(R, np.roll(pf, 180), END, 0.32)

L = reverb(L); R = reverb(R)

# La música baja cuando habla la voz (con transiciones suaves)
duck = np.ones(N)
a, b = int((V0 - 0.1) * SR), int((V0 + vdur) * SR)
duck[a:b] = 0.28
k = int(0.15 * SR)
duck = np.convolve(duck, np.ones(k) / k, mode="same")
L *= duck; R *= duck

put(L, voz[:, 0], V0, 1.0); put(R, voz[:, 1], V0, 1.0)

# Desvanecer el final y evitar saturación
fade = int(0.4 * SR)
L[-fade:] *= np.linspace(1, 0, fade); R[-fade:] *= np.linspace(1, 0, fade)
mix = np.stack([L, R], 1)
mix /= max(1.0, np.max(np.abs(mix)) / 0.95)
wavfile.write(sys.argv[2], SR, (mix * 32767).astype(np.int16))
print(f"listo: {total:.1f} s")
