# Appunti — Regole token per il VTT

Nota grezza di esempio: usala per provare la compilazione `raw/ → wiki/`
dalla pagina 🧠 Secondo Cervello (tab Wiki).

- I token 2D del VTT sono visti dall'alto (top-down) su griglia quadrata.
- Dimensioni standard D&D 5e: Medium = 1 cella, Large = 2x2, Huge = 3x3.
- I token 3D esportati in .glb devono stare sotto i 5 MB per il rendering web.
- La pipeline è: prompt → Stable Diffusion (2D) → TripoSR (3D .glb).
- Il Master IA del VTT legge i token dalla cartella asset del progetto Flutter.
