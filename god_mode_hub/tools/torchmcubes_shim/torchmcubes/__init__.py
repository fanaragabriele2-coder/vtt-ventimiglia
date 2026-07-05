"""Shim puro-Python di torchmcubes per il God-Mode Hub.

Sostituto drop-in di https://github.com/tatsy/torchmcubes quando la build
nativa C++/CUDA non e' praticabile (Windows: mismatch Visual Studio / CUDA
Toolkit / generatore CMake). Espone la stessa API usata da TripoSR
(``marching_cubes``) delegando l'estrazione della isosuperficie a PyMCubes
(se installato) o a scikit-image come fallback. Nessuna compilazione,
nessuna dipendenza da nvcc: risultato geometricamente identico, l'estrazione
avviene su CPU (secondi, contro i minuti dell'inferenza del modello).

Convenzione coordinate: il torchmcubes nativo restituisce i vertici con le
colonne in ordine INVERSO rispetto agli indici del volume
(``vol[d0, d1, d2] -> vertice (d2, d1, d0)``); TripoSR se lo aspetta e
ri-inverte con ``v_pos[..., [2, 1, 0]]``. Lo shim replica esattamente questa
convenzione. Variabili d'ambiente di debug:

* ``TORCHMCUBES_SHIM_RAW=1``        disattiva l'inversione delle colonne;
* ``TORCHMCUBES_SHIM_FLIP_FACES=1`` inverte il winding dei triangoli
  (usala se il mesh esportato appare "rovesciato"/dentro-fuori).
"""

from __future__ import annotations

import os

import numpy as np
import torch

__version__ = "0.1.0+godmodehub.shim"
IS_SHIM = True


def _mc_numpy(volume: np.ndarray, thresh: float) -> tuple[np.ndarray, np.ndarray]:
    """Marching cubes su array numpy: PyMCubes se c'e', altrimenti scikit-image."""
    try:
        import mcubes  # PyMCubes: wheel precompilata, veloce

        return mcubes.marching_cubes(volume, thresh)
    except ImportError:
        pass
    from skimage import measure

    verts, faces, _normals, _values = measure.marching_cubes(volume, level=thresh)
    return verts, faces


def marching_cubes(vol: torch.Tensor, thresh: float = 0.0):
    """Estrae la isosuperficie ``vol == thresh``.

    Args:
        vol: volume 3D (tensor torch, qualunque device — viene portato su CPU).
        thresh: livello della isosuperficie.

    Returns:
        ``(vertices, faces)``: tensor float32 (N,3) nella convenzione
        torchmcubes (colonne invertite rispetto agli indici del volume)
        e tensor int64 (M,3).
    """
    if not isinstance(vol, torch.Tensor):
        vol = torch.as_tensor(vol)
    volume = vol.detach().cpu().numpy().astype(np.float32, copy=False)
    verts, faces = _mc_numpy(volume, float(thresh))
    verts = np.ascontiguousarray(verts, dtype=np.float32)
    faces = np.ascontiguousarray(faces, dtype=np.int64)
    if os.environ.get("TORCHMCUBES_SHIM_RAW", "") != "1":
        verts = verts[:, ::-1].copy()  # (d0,d1,d2) -> (d2,d1,d0), come il nativo
    if os.environ.get("TORCHMCUBES_SHIM_FLIP_FACES", "") == "1":
        faces = faces[:, ::-1].copy()
    return torch.from_numpy(verts), torch.from_numpy(faces)


def grid_interp(vol, points):  # pragma: no cover - non usato da TripoSR
    """Non implementato nello shim: TripoSR non lo usa."""
    raise NotImplementedError(
        "grid_interp non e' implementato nello shim torchmcubes del God-Mode "
        "Hub (TripoSR non lo usa). Se ti serve, compila il torchmcubes nativo."
    )
