# Icone degli OGGETTI (per "vedere la figura, non solo il nome" nell'inventario e dal mercante).
# Legge data/items.json + data/armeria.json e disegna un PNG 128x128 per OGNI id oggetto:
# la FORMA dipende dalla categoria (spada, arco, pugnale, bastone, armatura, scudo, amuleto,
# pozione, focus, corda, torcia, razioni, arnesi), il COLORE dalla rarita' (comune grigio,
# rara azzurro, epica viola, leggendaria oro) con un alone e una gemma di rarita'. Finiscono in
# assets/items/<id>.png; ItemArt li carica come file grezzi (immune al sistema d'import, stessa
# lezione dei token). Metti i tuoi PNG in user://items/<id>.png per sostituirli senza codice.
#
# Uso:  python3 tools/genera_icone_oggetti.py

import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BASE = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(BASE, "assets", "items")
L = 128
os.makedirs(OUT, exist_ok=True)

RARITA = {  # (metallo, gemma, alone)
	"comune": ((176, 176, 184), (150, 150, 158), (90, 90, 96)),
	"rara": ((150, 196, 236), (70, 150, 230), (40, 110, 200)),
	"epica": ((196, 150, 226), (150, 70, 210), (120, 40, 190)),
	"leggendaria": ((238, 206, 120), (236, 176, 40), (210, 150, 20)),
}


RNG_ICONE = np.random.default_rng(20260717)


def base(rarita):
	"""v2 (H5): CARD di pergamena scura con grana, smusso interno e alone di rarita' — la
	forma dell'oggetto ci si appoggia sopra come su una pagina d'inventario dipinta."""
	img = Image.new("RGBA", (L, L), (0, 0, 0, 0))
	d = ImageDraw.Draw(img)
	# pergamena scura con GRANA (rumore caldo) e vignetta ai bordi
	card = np.zeros((L, L, 4), dtype=np.float32)
	y, x = np.mgrid[0:L, 0:L].astype(np.float32)
	bordo = np.minimum.reduce([x, y, L - 1 - x, L - 1 - y]) / (L * 0.5)
	tinta = np.clip(0.72 + 0.28 * np.clip(bordo * 2.2, 0, 1), 0, 1)
	rumore = RNG_ICONE.normal(0, 6, size=(L, L))
	for i, v in enumerate((66, 56, 42)):
		card[..., i] = np.clip(v * tinta + rumore, 0, 255)
	card[..., 3] = 255
	pil_card = Image.fromarray(card.astype(np.uint8), "RGBA")
	# angoli arrotondati via maschera
	mask = Image.new("L", (L, L), 0)
	ImageDraw.Draw(mask).rounded_rectangle([2, 2, L - 2, L - 2], radius=18, fill=255)
	pil_card.putalpha(mask)
	img.alpha_composite(pil_card)
	# alone radiale del colore di rarita' dietro la forma
	alone = RARITA.get(rarita, RARITA["comune"])[2]
	glow = Image.new("RGBA", (L, L), (0, 0, 0, 0))
	dg = ImageDraw.Draw(glow)
	dg.ellipse([20, 20, L - 20, L - 20], fill=alone + (90,))
	img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(16)))
	# smusso: luce in alto-sx, ombra in basso-dx, cornice fine
	d = ImageDraw.Draw(img)
	d.rounded_rectangle([2, 2, L - 2, L - 2], radius=18, outline=(18, 15, 12, 235), width=3)
	d.rounded_rectangle([5, 5, L - 5, L - 5], radius=15,
		outline=RARITA.get(rarita, RARITA["comune"])[2] + (120,), width=2)
	d.arc([5, 5, L - 5, L - 5], 200, 320, fill=(255, 240, 210, 60), width=2)
	return img, d


def rifinisci(img, forma):
	"""Ombra portata + gradiente di luce sulla FORMA, poi composito sulla card."""
	alpha = forma.split()[3]
	ombra = Image.new("RGBA", (L, L), (0, 0, 0, 0))
	ombra.putalpha(alpha.point(lambda a: int(a * 0.55)))
	img.alpha_composite(ombra.filter(ImageFilter.GaussianBlur(5)), (5, 7))
	# luce verticale sul metallo/corpo della forma (piu' chiara in alto)
	arr = np.array(forma).astype(np.float32)
	y = np.mgrid[0:L, 0:L][0].astype(np.float32) / L
	fattore = (1.14 - 0.3 * y)[..., None]
	arr[..., :3] = np.clip(arr[..., :3] * fattore, 0, 255)
	img.alpha_composite(Image.fromarray(arr.astype(np.uint8), "RGBA"))
	return img


def gemma(d, rarita):
	c = RARITA.get(rarita, RARITA["comune"])[1]
	d.ellipse([L - 30, 14, L - 14, 30], fill=c + (255,), outline=(15, 15, 15, 255))
	d.ellipse([L - 27, 17, L - 22, 22], fill=(255, 255, 255, 180))


def lama_verticale(d, met, larg, punta_y=20, base_y=96, guardia=True):
	cx = L // 2
	d.polygon([(cx, punta_y), (cx - larg, punta_y + 18), (cx - larg, base_y),
	           (cx + larg, base_y), (cx + larg, punta_y + 18)], fill=met + (255,))
	d.line([(cx, punta_y + 6), (cx, base_y - 4)], fill=(255, 255, 255, 120), width=2)  # riflesso
	if guardia:
		d.rectangle([cx - larg - 12, base_y, cx + larg + 12, base_y + 8], fill=(70, 54, 38, 255))
	d.rectangle([cx - 5, base_y + 8, cx + 5, base_y + 30], fill=(96, 70, 44, 255))  # elsa
	d.ellipse([cx - 7, base_y + 28, cx + 7, base_y + 40], fill=met + (255,))  # pomo


def disegna(shape, met, d):
	cx = L // 2
	if shape == "sword":
		lama_verticale(d, met, 8)
	elif shape == "dagger":
		lama_verticale(d, met, 6, punta_y=34, base_y=84)
	elif shape == "staff":
		d.rectangle([cx - 4, 18, cx + 4, 110], fill=(120, 86, 52, 255))
		d.ellipse([cx - 5, 108, cx + 5, 118], fill=(90, 64, 40, 255))
	elif shape == "focus":
		d.rectangle([cx - 4, 40, cx + 4, 112], fill=(120, 86, 52, 255))
		d.ellipse([cx - 18, 16, cx + 18, 52], fill=met + (230,), outline=(20, 20, 20, 255))
		d.ellipse([cx - 8, 22, cx - 1, 30], fill=(255, 255, 255, 170))
	elif shape == "bow":
		d.arc([cx - 6, 16, cx + 46, 112], 100, 260, fill=met + (255,), width=7)
		d.line([(cx + 6, 22), (cx + 6, 106)], fill=(230, 226, 210, 220), width=2)  # corda
	elif shape == "armor":
		d.polygon([(cx, 22), (cx - 34, 40), (cx - 30, 96), (cx, 112), (cx + 30, 96),
		           (cx + 34, 40)], fill=met + (255,), outline=(30, 28, 26, 255))
		for yy in range(44, 100, 12):
			d.line([(cx - 28, yy), (cx + 28, yy)], fill=(30, 30, 34, 90), width=2)
		d.line([(cx, 26), (cx, 108)], fill=(255, 255, 255, 70), width=2)
	elif shape == "shield":
		d.polygon([(cx, 18), (cx - 36, 34), (cx - 36, 78), (cx, 114), (cx + 36, 78),
		           (cx + 36, 34)], fill=met + (255,), outline=(30, 28, 26, 255))
		d.polygon([(cx, 30), (cx - 22, 42), (cx - 22, 74), (cx, 100), (cx + 22, 74),
		           (cx + 22, 42)], outline=(40, 40, 44, 160), width=3)
	elif shape == "amulet":
		d.arc([cx - 26, 24, cx + 26, 76], 20, 160, fill=(150, 130, 90, 230), width=4)  # catena
		d.ellipse([cx - 16, 66, cx + 16, 104], fill=met + (255,), outline=(20, 20, 20, 255))
		d.ellipse([cx - 8, 74, cx + 8, 94], fill=RARITA_G)
	elif shape == "potion":
		d.rectangle([cx - 6, 30, cx + 6, 44], fill=(120, 110, 96, 255))  # collo
		d.ellipse([cx - 22, 44, cx + 22, 104], fill=(210, 226, 236, 90), outline=(200, 210, 220, 200))
		d.pieslice([cx - 20, 60, cx + 20, 102], 0, 360, fill=LIQUIDO)  # liquido
		d.ellipse([cx - 8, 26, cx + 8, 34], fill=(90, 64, 40, 255))  # tappo
		d.ellipse([cx - 14, 66, cx - 6, 74], fill=(255, 255, 255, 120))  # riflesso
	elif shape == "torch":
		d.rectangle([cx - 4, 54, cx + 4, 112], fill=(110, 78, 46, 255))
		d.polygon([(cx, 20), (cx - 12, 52), (cx + 12, 52)], fill=(240, 150, 40, 240))
		d.polygon([(cx, 32), (cx - 6, 52), (cx + 6, 52)], fill=(250, 220, 120, 255))
	elif shape == "rope":
		d.arc([30, 40, 98, 100], 0, 360, fill=(150, 120, 78, 255), width=10)
		d.arc([44, 54, 84, 92], 0, 360, fill=(120, 92, 56, 255), width=6)
	elif shape == "rations":
		d.polygon([(44, 96), (52, 44), (76, 44), (84, 96)], fill=(150, 116, 72, 255),
		          outline=(90, 66, 40, 255))  # sacco
		d.line([(52, 52), (76, 52)], fill=(90, 66, 40, 200), width=3)
	elif shape == "tools":
		d.line([(40, 96), (78, 40)], fill=met + (255,), width=6)  # grimaldello
		d.ellipse([34, 90, 50, 106], outline=met + (255,), width=5)
		d.line([(58, 92), (86, 56)], fill=(180, 180, 186, 220), width=4)
	elif shape == "scroll":
		d.rectangle([cx - 26, 30, cx + 26, 98], fill=(226, 210, 170, 255),
		            outline=(120, 96, 60, 255))  # foglio
		d.rectangle([cx - 30, 24, cx + 30, 36], fill=(150, 116, 72, 255))  # rullo in alto
		d.rectangle([cx - 30, 92, cx + 30, 104], fill=(150, 116, 72, 255))  # rullo in basso
		for yy in range(46, 88, 10):  # righe di scrittura arcana
			d.line([(cx - 18, yy), (cx + 18, yy)], fill=(90, 70, 120, 200), width=2)


def shape_di(o):
	t = o.get("type", "")
	i = (o.get("id", "") + " " + o.get("name", "")).lower()
	if t == "scroll":
		return "scroll"
	if t == "shield":
		return "shield"
	if t == "armor":
		return "armor"
	if t == "neck":
		return "amulet"
	if t == "consumable":
		return "potion"
	if t == "focus":
		return "focus"
	if t == "tools":
		return "tools"
	if t == "gear":
		if "corda" in i or "rope" in i:
			return "rope"
		if "torcia" in i or "torch" in i:
			return "torch"
		return "rations"
	# armi
	if "arco" in i or "bow" in i:
		return "bow"
	if "pugnale" in i or "dagger" in i or "zanna" in i:
		return "dagger"
	if "bastone" in i or "quarterstaff" in i or "staff" in i:
		return "staff"
	return "sword"


def main():
	oggetti = json.load(open(os.path.join(BASE, "data", "items.json")))["items"]
	oggetti += json.load(open(os.path.join(BASE, "data", "armeria.json")))["oggetti"]
	global RARITA_G, LIQUIDO
	print(f"Genero {len(oggetti)} icone oggetto in {os.path.abspath(OUT)}")
	for o in oggetti:
		rarita = o.get("rarity", "comune")
		met, gem, _ = RARITA.get(rarita, RARITA["comune"])
		RARITA_G = gem + (255,)
		# liquido pozione: rosso cura, ambra olio, verde acido, verde-oro elisir
		nome_l = o.get("name", "").lower()
		if "cura" in nome_l or o.get("id") == "healingPotion":
			LIQUIDO = (200, 60, 60, 220)
		elif "olio" in nome_l:
			LIQUIDO = (235, 175, 60, 230)
		elif "acido" in nome_l:
			LIQUIDO = (150, 225, 60, 230)
		else:
			LIQUIDO = (120, 200, 150, 220)
		card, _ = base(rarita)
		# la FORMA vive su uno strato suo: cosi' le si da' ombra portata e luce (rifinisci)
		forma = Image.new("RGBA", (L, L), (0, 0, 0, 0))
		df = ImageDraw.Draw(forma)
		disegna(shape_di(o), met, df)
		gemma(df, rarita)
		rifinisci(card, forma).save(os.path.join(OUT, o["id"] + ".png"), optimize=True)
	print("Fatto.")


if __name__ == "__main__":
	main()
