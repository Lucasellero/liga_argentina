#!/usr/bin/env python3
"""
Orquestador de actualización — Liga Nacional.

Corre los 3 scrapers en secuencia y luego reentrana el modelo de probabilidad.
Cada scraper sigue funcionando de forma independiente exactamente igual que antes;
este script solo los encadena.

Uso:
    python3.12 liga_argentina/Scraper/update_nacional.py

Equivale a correr manualmente:
    python3.12 liga_argentina/Scraper/data_scraper_nacional.py
    python3.12 liga_argentina/Scraper/pbp_scraper_nacional.py
    python3.12 liga_argentina/Scraper/shot_map_scraper_nacional.py
    python3.12 liga_argentina/modelos/modelo_liga_nacional.py  (retrain)
"""

import logging
import subprocess
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# Paths relativos a la raíz del repo (donde se corre el script)
_ROOT = Path(__file__).resolve().parents[2]

SCRAPERS = [
    _ROOT / "liga_argentina/Scraper/data_scraper_nacional.py",
    _ROOT / "liga_argentina/Scraper/pbp_scraper_nacional.py",
    _ROOT / "liga_argentina/Scraper/shot_map_scraper_nacional.py",
]


def run_scraper(script: Path) -> bool:
    """Corre un scraper como subproceso. Retorna True si terminó sin error."""
    log.info(f"▶  {script.name}")
    result = subprocess.run([sys.executable, str(script)])
    if result.returncode != 0:
        log.warning(f"   {script.name} terminó con código {result.returncode} — continuando.")
        return False
    log.info(f"   {script.name} OK")
    return True


def retrain_model() -> None:
    """Reentrana el modelo con los CSVs actualizados."""
    log.info("▶  Reentrenando modelo de probabilidad...")
    try:
        sys.path.insert(0, str(_ROOT))
        from liga_argentina.modelos.modelo_liga_nacional import retrain
        retrain(verbose=True)
        log.info("   Modelo actualizado y predicciones guardadas.")
    except Exception as exc:
        log.error(f"   Error al reentrenar el modelo: {exc}")
        log.error(
            "   Los CSVs ya fueron actualizados. "
            "Reentrenar manualmente con: "
            "python3.12 liga_argentina/modelos/modelo_liga_nacional.py"
        )


def main() -> None:
    log.info("=== Actualización Liga Nacional ===")

    failed = [s for s in SCRAPERS if not run_scraper(s)]

    if failed:
        names = [s.name for s in failed]
        log.warning(f"Scrapers con errores: {names}")
        log.warning("El modelo se reentrana con los datos disponibles.")
    else:
        log.info("Todos los scrapers completados.")

    retrain_model()
    log.info("=== Actualización finalizada ===")


if __name__ == "__main__":
    main()
