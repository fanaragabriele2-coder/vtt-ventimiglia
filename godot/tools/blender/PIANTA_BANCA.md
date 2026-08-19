# PIANTA ESECUTIVA — Banca del Drago d'Oro (montaggio col kit asset via Blender MCP)

Blueprint per assemblare la banca usando il KIT MODULARE già presente nella scena
(moduli marmo, bancone con vetri, sedute, porta caveau circolare, cassette di sicurezza,
pallet valori, telecamere, cordoni). Scala VTT: **1 cella = 1,5 m**; ogni livello sta in un
quadrato di **96×96 m** centrato sul proprio offset X. Camere top-down ortho (scala 96,
z=80): CAM_Esterno, CAM_Atrio, CAM_Uffici, CAM_Caveau.

Offset livelli: **Esterno X=0 · Atrio X=300 · Uffici X=600 · Caveau X=900** (Y invariata).
Collezioni: 01_Esterno, 02_Atrio, 03_Uffici, 04_Caveau, 05_Props, 06_Luci,
07_SicurezzaFantasy. Usa **duplicati collegati** (Alt+D / `obj.copy()` con stessa mesh).

## Livello 1 — ESTERNO (X=0)
| Elemento | Posizione (x,y) | Note |
|---|---|---|
| Piazza | (0,-30) 60×26 | pavimento chiaro; statua drago a (0,-34) |
| Scalinata | (0,-17.5) largh. 20 | 6 gradini verso nord |
| Facciata + colonne | y=-13.5, x da -12 a 12 passo 4 | moduli colonna del kit, h≈8 |
| Portone_Principale | (±1.6,-12.6) | doppio, metallo dorato |
| Torrette guardia | (±17,-16) r=2.2 h=7 | |
| Corpo banca (tetto) | (0,8) 46×40 h=12 | lucernari a (±14,0), (±14,18), (0,22); cupola (0,12) |
| Vicolo + Grata_Fogne | x=-34; grata (−34,−4) | accesso scenico |
| Zona_Carico | (0,34) 26×10 | carro (−6,34), casse (2..4,32..34), Porta_Servizio (10,28.4) |

## Livello 2 — ATRIO (X=300, coordinate relative al centro livello)
| Elemento | Posizione | Note |
|---|---|---|
| Vestibolo | (0,-26) 18×10 | varchi n/s; cordoni rossi del kit in fila |
| Atrio_Centrale | (0,2) 44×46 h=9 | pavimento MARMO del kit |
| Colonnati | x=±12, y da -16 a 20 passo 6 | copertura tattica |
| Globo_Del_Mondo | (0,2) | su base marmo verde |
| Sportelli (bancone kit) | (-8,10) e (-8,14), lunghi 14 | il bancone con vetri del kit |
| Sala d'attesa | sedute kit a (-16,-12/-8/-4) | |
| Archivio_Pubblico | (-30,2) 12×14, porta e | scaffali |
| Deposito | (30,-6) 12×10, porta o | casse |
| Ufficio_Direttore_Vista | (30,12) 12×12, porta o | scrivania kit |
| Scalone_Monumentale | (0,22) largh. 12 | verso Uffici |
| Scala_Servizio_Caveau | (19,-20) | verso Caveau |
| Sicurezza | golem (±6,-22), campane (±20,-22), telecamere kit come "Occhio_Arcano" agli angoli | statua parlante (-17,20) |

## Livello 3 — UFFICI (X=600)
| Elemento | Posizione | Note |
|---|---|---|
| Piano_Uffici | (0,0) 44×46 | vuoto centrale 20×22 = Apertura_Su_Atrio con ringhiere ottone |
| Uffici 01–03 | (-28, 14/4/-6) 11×9, porta e | scrivania kit ciascuno |
| Sala_Riunioni | (28,12) 12×10 | tavolo lungo |
| Stanza_Impiegati | (28,-2) 12×10 | 3 scrivanie |
| Sala_Consiglio | (15,20) 16×9 | tavolo 10 m + vetrata (kit vetro) lato n |
| Stanza_Direttore | (-15,20) 16×9 | scrivania, Cassaforte_Secondaria (-21.5,20), caminetto, libreria, Registro_Segreto |
| Archivio_Segreto | (-15,30.5) 12×7 | dietro la libreria, varco s stretto (Passaggio_Occulto); Contratto_Maledetto (-15,29.2) |
| Biblioteca_Contratti | (15,-18) 16×12 | 4 file di scaffali |
| Archivio_Conti | (-15,-18) 16×12 | scaffali trasversali |

## Livello 4 — CAVEAU (X=900)
| Elemento | Posizione | Note |
|---|---|---|
| Arrivo_Scala | (-26,-24) 8×8 | collegata alla Scala_Servizio dell'atrio |
| Anticamera_Sicurezza | (-8,-24) 26×10 | saracinesche (barre), golem, Sigillo_Anticamera |
| **Porta_Caveau** | (-2,-16.5) | LA porta circolare del kit, r≈3.6, con ingranaggi |
| **Sala_Tesoro** (arena) | (0,2) 34×30 h=5 | cassette di sicurezza kit alle pareti (±15.6, y −6..10); casseforti (−10/−5/10, 12–13) |
| Tesoro | monete (−6,2)(5,6)(1,−4), lingotti/pallet kit (0..3,9.5), gemme (−9,8)(8,−2)(−3,12), Reliquia_Sigillata (±11,−8) | pallet valori del kit = punti focali |
| Colonne runiche | (±8,±... −6 e 10) | coperture arena |
| Stanza_Custodia | (-26,4) 12×10 | Chiave_Runica su piedistallo + golem |
| Stanza_Prove | (26,6) 12×10 | Tesoro_Falso (mucchio monete) |
| Camere_Contenimento 1–3 | (-8/0/8, 24) 7×7 | rune al posto delle sbarre |
| Tunnel_Antico | (26,-14) largo 3, verso sud | fino a Cripta_Dimenticata (26,-26) con sarcofagi |

## Procedura per Claude Desktop (Blender MCP)
1. **Inventario**: elenca gli oggetti del kit con nomi e dimensioni
   (`[o.name, tuple(round(d,2) for d in o.dimensions)] for o in bpy.data.objects`).
2. Crea le 7 collezioni e le 4 camere top-down (ortho 96, z=80, agli offset dei livelli).
3. Monta i livelli con **duplicati collegati** del kit secondo le tabelle; dove un pezzo
   manca, costruiscilo semplice (box/cilindro) coi materiali del kit.
4. Rinomina gli oggetti CHIAVE come nelle tabelle (Porta_Caveau, Archivio_Segreto...).
5. Verifica dall'alto ogni livello (screenshot da ciascuna CAM_) e correggi porte cieche,
   sovrapposizioni, scale scollegate PRIMA di rifinire.
6. Render 3072×3072 per livello (view_transform "Standard", non AgX) in Desktop/vtt_banca.

In alternativa (nessun kit / da zero): `genera_banca.py` in questa cartella costruisce
TUTTO proceduralmente con lo stesso layout — le tabelle sopra valgono per entrambi.
