#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Runner maestro: scrape incremental + transform → CSVs del dashboard.

Uso:
    python torneos_internacionales/fiba_americas_u18/update.py          # incremental (solo nuevos partidos)
    python torneos_internacionales/fiba_americas_u18/update.py --full   # re-scrape completo
"""

import sys
import os
import argparse
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def run(script, extra_args=None):
    cmd = [sys.executable, os.path.join(HERE, script)]
    if extra_args:
        cmd.extend(extra_args)
    print(f"\n{'='*60}")
    print(f"Corriendo: {' '.join(cmd)}")
    print('='*60)
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        print(f"[ERROR] {script} terminó con código {result.returncode}")
        sys.exit(result.returncode)


def main():
    parser = argparse.ArgumentParser(description="Runner maestro FIBA U18 Americas 2026")
    parser.add_argument('--full', action='store_true', help='Re-scrape completo')
    args = parser.parse_args()

    extra = ['--full'] if args.full else []

    run('boxscore_scraper.py', extra)
    run('shots_scraper.py', extra)
    run('pbp_scraper.py', extra)
    run('transform_to_liga_format.py')

    print("\n✓ Actualización FIBA U18 Americas 2026 completada.")
    print(f"  CSVs en: docs/argentina_formativas/fiba_u18/")


if __name__ == '__main__':
    main()
