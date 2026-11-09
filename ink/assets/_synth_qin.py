# -*- coding: utf-8 -*-
"""
合成一段古琴/水墨风环境底乐（原创，无版权）。
五声音阶散板 + 拨弦衰减 + 低音长吟 + 风声底噪。
输出 ink/assets/qin-bg.wav（22050Hz 16bit 单声道）
"""
import math, random, struct, wave, os

SR = 22050
DUR = 72.0
N = int(SR * DUR)
random.seed(20261106)

# 五声音阶（C 宫调）：宫商角徵羽，跨两个八度，单位 Hz
SCALE = [
    130.81, 146.83, 164.81, 196.00, 220.00,          # C3 D3 E3 G3 A3
    261.63, 293.66, 329.63, 392.00, 440.00,          # C4 D4 E4 G4 A4
    523.25, 587.33, 659.25, 783.99, 880.00,          # C5 D5 E5 G5 A5
]

buf = [0.0] * N


def add_pluck(t0, freq, amp, decay):
    """拨弦：基频 + 二三次谐波，指数衰减，微失谐"""
    start = int(t0 * SR)
    length = int(decay * SR)
    w0 = 2.0 * math.pi * freq / SR
    w1 = 2.0 * math.pi * freq * 2.003 / SR
    w2 = 2.0 * math.pi * freq * 3.01 / SR
    for i in range(length):
        idx = start + i
        if idx >= N:
            break
        env = math.exp(-i / (decay * SR * 0.32))
        # 起振 8ms
        att = min(1.0, i / (SR * 0.008))
        s = (math.sin(w0 * i) * 1.0
             + math.sin(w1 * i) * 0.32 * math.exp(-i / (decay * SR * 0.18))
             + math.sin(w2 * i) * 0.14 * math.exp(-i / (decay * SR * 0.10)))
        buf[idx] += s * env * att * amp


def add_drone(t0, freq, dur, amp):
    """长吟：基频 + 五度，慢速幅度呼吸"""
    start = int(t0 * SR)
    length = int(dur * SR)
    w0 = 2.0 * math.pi * freq / SR
    w1 = 2.0 * math.pi * freq * 1.5 / SR
    for i in range(length):
        idx = start + i
        if idx >= N:
            break
        breath = 0.65 + 0.35 * math.sin(2.0 * math.pi * 0.055 * i / SR)
        att = min(1.0, i / (SR * 1.6))
        rel = min(1.0, (length - i) / (SR * 2.2))
        s = math.sin(w0 * i) * 0.7 + math.sin(w1 * i) * 0.18
        buf[idx] += s * breath * att * rel * amp


# —— 低音长吟：宫、徵打底 ——
add_drone(0.0, 65.41, DUR, 0.16)      # C2
add_drone(2.0, 98.00, DUR - 4, 0.10)  # G2

# —— 散板旋律：疏落拨弦，句读留白 ——
# 每句 4-6 音，句间静默，走"起承转合"
phrases = [
    # (起始秒, [(延迟, 音索, 力度, 衰减)])
    (0.8,  [(0.0, 5, 0.34, 4.2), (1.9, 7, 0.28, 3.6), (3.4, 9, 0.30, 4.0), (5.6, 7, 0.22, 3.2)]),
    (9.5,  [(0.0, 10, 0.30, 3.8), (1.6, 12, 0.32, 4.2), (3.8, 14, 0.26, 3.4), (6.0, 12, 0.20, 3.0)]),
    (17.0, [(0.0, 9, 0.28, 4.0), (2.2, 7, 0.30, 3.8), (4.0, 5, 0.24, 3.4), (6.5, 7, 0.22, 3.2), (8.2, 9, 0.26, 3.6)]),
    (25.5, [(0.0, 12, 0.32, 4.2), (1.8, 10, 0.26, 3.6), (3.6, 8, 0.28, 3.8), (5.4, 10, 0.22, 3.2)]),
    (32.5, [(0.0, 14, 0.30, 4.4), (2.0, 12, 0.34, 4.2), (4.4, 10, 0.26, 3.6), (6.2, 12, 0.22, 3.2), (8.4, 14, 0.24, 3.4)]),
    (41.5, [(0.0, 7, 0.26, 3.8), (1.7, 9, 0.28, 3.8), (3.5, 12, 0.24, 3.4)]),
    (46.5, [(0.0, 10, 0.30, 4.0), (2.1, 12, 0.28, 3.8), (4.3, 14, 0.30, 4.2), (6.8, 12, 0.22, 3.2)]),
    (54.0, [(0.0, 5, 0.28, 4.2), (2.4, 7, 0.26, 3.8), (4.6, 9, 0.28, 4.0), (7.0, 7, 0.22, 3.4)]),
    (61.5, [(0.0, 12, 0.26, 3.6), (1.8, 9, 0.24, 3.4), (3.6, 5, 0.28, 4.2), (6.0, 3, 0.22, 3.8)]),
]

for t0, notes in phrases:
    for off, sidx, amp, dec in notes:
        add_pluck(t0 + off, SCALE[sidx], amp, dec)

# —— 风声底噪：白噪低通（简单滑动平均）+ 慢起伏 ——
noise = [random.uniform(-1.0, 1.0) for _ in range(N)]
# 一阶低通
alpha = 0.012
lp = 0.0
for i in range(N):
    lp += alpha * (noise[i] - lp)
    swell = 0.5 + 0.5 * math.sin(2.0 * math.pi * 0.03 * i / SR + 1.2)
    buf[i] += lp * swell * 0.055

# —— 简易混响：两级反馈延迟 ——
def delay_mix(src, delay_s, fb, mix):
    d = int(delay_s * SR)
    out = src[:]
    for i in range(d, N):
        out[i] += out[i - d] * fb * mix
    return out

buf = delay_mix(buf, 0.211, 0.38, 0.26)
buf = delay_mix(buf, 0.337, 0.30, 0.20)

# —— 总线：软限幅 + 首尾淡入淡出（便于无缝循环） ——
peak = max(abs(x) for x in buf) or 1.0
gain = 0.82 / peak
fade = int(SR * 2.2)
for i in range(N):
    v = buf[i] * gain
    # tanh 软膝
    v = math.tanh(v * 1.25) * 0.85
    if i < fade:
        v *= i / fade
    if i > N - fade:
        v *= (N - i) / fade
    buf[i] = v

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "qin-bg.wav")
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with wave.open(out_path, "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    frames = bytearray()
    for v in buf:
        s = max(-1.0, min(1.0, v))
        frames += struct.pack("<h", int(s * 32767))
    w.writeframes(bytes(frames))

print("OK", out_path, os.path.getsize(out_path), "bytes,", round(DUR, 1), "s")
