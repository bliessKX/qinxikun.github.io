# -*- coding: utf-8 -*-
"""夏夜稻田氛围音：风声 + 蝉鸣 + 水波 + 五声拨弦。72 秒，首尾淡入淡出可循环。
生成 72s 夏夜稻田占位底乐（WAV 需再重采样+压码为 assets/summer-field.mp3 使用）。"""
import numpy as np
import wave

SR = 44100
DUR = 72
N = SR * DUR
t = np.arange(N) / SR
rng = np.random.default_rng(20261106)

mix = np.zeros(N, dtype=np.float64)

# ---- 1) 风声：棕噪 + 双层缓慢起伏 ----
white = rng.standard_normal(N)
brown = np.cumsum(white)
brown /= np.max(np.abs(brown))
wind_env = 0.55 + 0.45 * np.sin(2 * np.pi * 0.07 * t + 1.2) * np.sin(2 * np.pi * 0.023 * t)
mix += 0.075 * brown * wind_env

# ---- 2) 蝉鸣：稀疏高频颤音簇 ----
def cicada(t0, dur, freq, gain):
    i = int(t0 * SR)
    n = min(int(dur * SR), N - i)
    if n <= 0:
        return
    tt = np.arange(n) / SR
    trem = 0.55 + 0.45 * np.sin(2 * np.pi * (11 + rng.uniform(-2, 2)) * tt)
    buzz = (np.sin(2 * np.pi * freq * tt)
            + 0.6 * np.sin(2 * np.pi * freq * 1.37 * tt)
            + 0.35 * np.sin(2 * np.pi * freq * 2.1 * tt))
    env = np.sin(np.pi * np.clip(tt / dur, 0, 1)) ** 1.5
    mix[i:i + n] += gain * buzz * trem * env

for _ in range(14):
    cicada(rng.uniform(0, DUR - 9), rng.uniform(3.5, 7.5),
           rng.uniform(5200, 6800), rng.uniform(0.012, 0.028))

# ---- 3) 水波：短促下滑音 ----
def plop(t0, f0, gain):
    i = int(t0 * SR)
    n = min(int(1.1 * SR), N - i)
    if n <= 0:
        return
    tt = np.arange(n) / SR
    freq = f0 * np.exp(-tt * 2.2)
    ph = 2 * np.pi * np.cumsum(freq) / SR
    env = np.exp(-tt * 4.5)
    mix[i:i + n] += gain * np.sin(ph) * env

for _ in range(9):
    plop(rng.uniform(1, DUR - 2), rng.uniform(520, 900), rng.uniform(0.02, 0.045))

# ---- 4) 五声拨弦：稀疏、带泛音 ----
scale = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0]
def pluck(t0, f, gain):
    i = int(t0 * SR)
    n = min(int(2.2 * SR), N - i)
    if n <= 0:
        return
    tt = np.arange(n) / SR
    env = np.exp(-tt * 2.6) * (1 - np.exp(-tt * 120))
    tone = (np.sin(2 * np.pi * f * tt)
            + 0.38 * np.sin(2 * np.pi * 2 * f * tt)
            + 0.18 * np.sin(2 * np.pi * 3 * f * tt))
    mix[i:i + n] += gain * tone * env

for _ in range(16):
    pluck(rng.uniform(0.5, DUR - 3), float(rng.choice(scale)), rng.uniform(0.028, 0.055))

# ---- 首尾淡入淡出，便于无缝循环 ----
fade = int(1.5 * SR)
ramp = np.linspace(0, 1, fade)
mix[:fade] *= ramp
mix[-fade:] *= ramp[::-1]

# ---- 软限幅 ----
peak = np.max(np.abs(mix))
if peak > 0:
    mix = mix / peak * 0.5
mix = np.tanh(mix * 1.15) * 0.92

data = (mix * 32767).astype('<i2')
out = 'assets/_summer-field-src.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(data.tobytes())
print('OK', out, N, 'frames', round(DUR, 1), 's')
