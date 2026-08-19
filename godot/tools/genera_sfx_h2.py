# Stinger H2 — i suoni di ARMI, INTERFACCIA e VIAGGIO, sintetizzati (zero licenze, come il set
# base di CombatSfx). Genera 13 WAV mono 16-bit 44100 Hz in assets/sfx:
#   armi     : spada (clangore metallico), mazza (tonfo sordo), arco (twang della corda),
#              armatura (clank del colpo sull'acciaio)
#   interfaccia: click (tick dei pulsanti), pannello (whoosh d'apertura), oro (tintinnio di
#              monete), fanfara (arpeggio del level-up), raccolto (chime del pickup)
#   viaggio  : passi (doppio passo di marcia), tuono (brontolio di pioggia), corno (corno di
#              Rohan, gonfiata con vibrato), tamburi (i tamburi di Moria)
# CombatSfx/UiSfx/TravelSfx li caricano per nome. Rigenerali con: python3 tools/genera_sfx_h2.py

import os
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sfx")
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(20260717)


def t(dur):
    return np.arange(int(dur * SR)) / SR


def env_exp(dur, k):
    return np.exp(-k * t(dur))


def salva(nome, y):
    y = y / max(1e-9, np.max(np.abs(y))) * 0.82
    dati = (y * 32000).astype(np.int16)
    with wave.open(os.path.join(OUT, nome + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(dati.tobytes())
    print(f"  {nome}.wav  {len(dati)/SR:.2f}s")


def metallo(freq, dur, k, ampiezze=(1.0, 0.6, 0.45, 0.3)):
    """Partiali INARMONICI (rapporti da campana): il suono 'di metallo'."""
    x = t(dur)
    y = np.zeros_like(x)
    for a, r in zip(ampiezze, (1.0, 2.76, 5.40, 8.93)):
        y += a * np.sin(2 * np.pi * freq * r * x) * np.exp(-k * (0.8 + 0.35 * r) * x)
    return y


def rumore_passabasso(dur, alpha):
    """Rumore bianco smussato (IIR un polo): piu' alpha e' alto, piu' e' scuro."""
    n = RNG.standard_normal(int(dur * SR))
    y = np.empty_like(n)
    acc = 0.0
    for i, v in enumerate(n):
        acc = alpha * acc + (1 - alpha) * v
        y[i] = acc
    return y


def aggiungi(y, inizio_s, segmento):
    """Somma `segmento` dentro y a partire da `inizio_s` secondi, troncando alla fine."""
    i = int(inizio_s * SR)
    n = min(len(segmento), len(y) - i)
    if n > 0:
        y[i:i + n] += segmento[:n]


def sweep(f0, f1, dur):
    x = t(dur)
    fase = 2 * np.pi * (f0 * x + (f1 - f0) * x * x / (2 * dur))
    return np.sin(fase)


# --- ARMI ---

def spada():
    y = metallo(1750, 0.4, 10)
    y[: int(0.3 * SR)] += 0.5 * metallo(2500, 0.3, 14)
    y[: int(0.012 * SR)] += RNG.standard_normal(int(0.012 * SR)) * 0.8  # transiente del colpo
    salva("spada", y)


def mazza():
    y = sweep(130, 55, 0.28) * env_exp(0.28, 14)                       # botta che scende
    y += rumore_passabasso(0.28, 0.92) * env_exp(0.28, 22) * 1.6       # impatto sordo
    salva("mazza", y)


def arco():
    y = sweep(340, 270, 0.25) * env_exp(0.25, 16)                      # corda che vibra
    y += 0.5 * sweep(680, 540, 0.25) * env_exp(0.25, 22)
    y += rumore_passabasso(0.25, 0.55) * env_exp(0.25, 40) * 0.5       # frustata dell'aria
    salva("arco", y)


def armatura():
    y = metallo(900, 0.38, 12, (1.0, 0.8, 0.5, 0.3))
    y[: int(0.3 * SR)] += 0.7 * metallo(1350, 0.3, 16)
    y += rumore_passabasso(0.38, 0.75) * env_exp(0.38, 30) * 1.1       # lamiera percossa
    salva("armatura", y)


# --- INTERFACCIA ---

def click():
    y = np.sin(2 * np.pi * 1900 * t(0.05)) * env_exp(0.05, 90)
    salva("click", y)


def pannello():
    dur = 0.26
    inviluppo = np.sin(np.pi * t(dur) / dur) ** 2                      # gonfia e sfuma
    salva("pannello", rumore_passabasso(dur, 0.6) * inviluppo)


def oro():
    dur = 0.55
    y = np.zeros(int(dur * SR))
    for inizio, f in ((0.0, 2600), (0.09, 3300), (0.19, 2900), (0.30, 3800)):
        aggiungi(y, inizio, metallo(f, 0.3, 22, (1.0, 0.5, 0.3, 0.15)) * 0.8)
    salva("oro", y)


def fanfara():
    dur = 1.25
    y = np.zeros(int(dur * SR))
    for inizio, f, lung in ((0.0, 523.25, 0.28), (0.2, 659.25, 0.28),
	                        (0.4, 783.99, 0.28), (0.6, 1046.5, 0.6)):
        x = t(lung)
        nota = (np.sin(2 * np.pi * f * x) + 0.4 * np.sin(2 * np.pi * 2 * f * x)
                + 0.2 * np.sin(2 * np.pi * 3 * f * x))
        nota *= np.minimum(1.0, x / 0.02) * np.exp(-3.2 * x)           # attacco netto, coda breve
        aggiungi(y, inizio, nota)
    salva("fanfara", y)


def raccolto():
    dur = 0.5
    y = np.zeros(int(dur * SR))
    for inizio, f in ((0.0, 880), (0.12, 1318.5)):
        x = t(0.35)
        nota = (np.sin(2 * np.pi * f * x) + 0.35 * np.sin(2 * np.pi * 2 * f * x)) * np.exp(-7 * x)
        aggiungi(y, inizio, nota)
    salva("raccolto", y)


# --- VIAGGIO ---

def passi():
    dur = 0.62
    y = np.zeros(int(dur * SR))
    for inizio in (0.0, 0.3):
        passo = rumore_passabasso(0.16, 0.94) * env_exp(0.16, 30)
        passo += sweep(95, 60, 0.16) * env_exp(0.16, 26) * 0.6
        aggiungi(y, inizio, passo)
    salva("passi", y)


def tuono():
    dur = 2.3
    y = rumore_passabasso(dur, 0.985) * 3.0
    # il brontolio ondeggia (fronti del rombo) e muore lentamente
    y *= (0.6 + 0.4 * np.sin(2 * np.pi * 1.7 * t(dur) + 1.0)) * np.exp(-1.4 * t(dur))
    y[: int(0.05 * SR)] *= np.linspace(0.2, 1.0, int(0.05 * SR))       # niente click in testa
    salva("tuono", y)


def corno():
    dur = 1.9
    x = t(dur)
    vib = 1.0 + 0.006 * np.sin(2 * np.pi * 5.2 * x)                    # vibrato da ottone
    y = np.zeros_like(x)
    for f, a in ((220.0, 1.0), (330.0, 0.5)):                          # fondamentale + quinta
        for arm in range(1, 7):                                        # spettro ricco (sega-like)
            y += (a / arm) * np.sin(2 * np.pi * f * arm * vib * x)
    gonfiata = np.minimum(1.0, x / 0.5) * np.exp(-1.1 * np.maximum(0.0, x - 1.1))
    salva("corno", y * gonfiata)


def tamburi():
    dur = 1.7
    y = np.zeros(int(dur * SR))
    for inizio, f0 in ((0.0, 85), (0.42, 85), (0.84, 110), (1.05, 85)):
        colpo = sweep(f0, f0 * 0.45, 0.33) * env_exp(0.33, 11)
        colpo += rumore_passabasso(0.33, 0.9) * env_exp(0.33, 28) * 0.8
        aggiungi(y, inizio, colpo)
    salva("tamburi", y)


if __name__ == "__main__":
    print(f"Genero gli stinger H2 in {os.path.abspath(OUT)}")
    for gen in (spada, mazza, arco, armatura, click, pannello, oro, fanfara, raccolto,
                passi, tuono, corno, tamburi):
        gen()
    print("Fatto.")
