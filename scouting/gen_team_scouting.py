#!/usr/bin/env python3
"""
gen_team_scouting.py — genera un scouting report (.docx) de un equipo de Liga Argentina / Liga Nacional
(también soporta Liga Femenina / Liga de Desarrollo, mismo esquema de CSVs).

Script fijo — no reescribir su lógica ad-hoc en cada invocación. Ver .claude/commands/scouting-liga.md.

Uso:
    python3 scouting/gen_team_scouting.py --team "OBRAS" --liga liga_nacional
    python3 scouting/gen_team_scouting.py --team "QUILMES (MDP)"          # auto-detecta liga
    python3 scouting/gen_team_scouting.py --team "OBRAS" --out scouting/mi_reporte.docx
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scouting_common as sc

from docx import Document
from docx.shared import Cm


def slugify(name):
    return (name.lower()
            .replace(' ', '_')
            .replace('(', '')
            .replace(')', '')
            .replace('.', ''))


def build_report(team, liga, out_path):
    cfg = sc.LIGAS[liga]
    print(f"Cargando datos de {cfg['label']}...")
    df = sc.load_stats(liga)
    shots_df = sc.load_shots(liga)

    if team not in df['Equipo'].values:
        print(f"\nERROR: '{team}' no existe en {cfg['label']}.")
        return False

    cutoff = cfg['playoff_cutoff']
    df_reg = df[df['Fecha'] < cutoff] if cutoff is not None else df
    shots_reg = shots_df[shots_df['Fecha'] < cutoff] if cutoff is not None else shots_df

    team_tots = df_reg[(df_reg['Equipo'] == team) & (df_reg['Apellido'] == 'TOTALES')].copy()
    team_play = df_reg[(df_reg['Equipo'] == team) & (df_reg['Apellido'] != 'TOTALES')].copy()
    team_shots = shots_reg[shots_reg['Equipo'] == team].copy()

    if team_tots.empty:
        print(f"\nERROR: '{team}' no tiene partidos en {cfg['label']} antes del corte de playoffs.")
        return False

    n = len(team_tots)
    t2a, t2i = team_tots['T2A'].sum(), team_tots['T2I'].sum()
    t3a, t3i = team_tots['T3A'].sum(), team_tots['T3I'].sum()
    t1a, t1i = team_tots['T1A'].sum(), team_tots['T1I'].sum()
    pts = team_tots['Puntos'].sum()
    oreb, dreb, treb = team_tots['OReb'].sum(), team_tots['DReb'].sum(), team_tots['TReb'].sum()
    ast, tov = team_tots['Asistencias'].sum(), team_tots['Perdidas'].sum()
    stl, blk = team_tots['Recuperos'].sum(), team_tots['Tapones cometidos'].sum()
    wins = int(team_tots['Ganado'].sum())
    losses = n - wins

    efg = sc.calc_efg(t2a, t3a, t2i, t3i)
    ts = sc.calc_ts(pts, t2i, t3i, t1i)
    poss_total = sc.calc_poss(t2i, t3i, t1i, oreb, tov)
    poss_pg = poss_total / n if n else 0

    # Puntos del rival, buscando el otro TOTALES de cada partido
    opp_pts_list = []
    for gid, grp in team_tots.groupby('IdPartido'):
        rival_rows = df_reg[(df_reg['IdPartido'] == gid) & (df_reg['Apellido'] == 'TOTALES')
                             & (df_reg['Equipo'] != team)]
        if not rival_rows.empty:
            opp_pts_list.append(rival_rows['Puntos'].iloc[0])
    opp_pts_pg = (sum(opp_pts_list) / len(opp_pts_list)) if opp_pts_list else None

    print(f"  {team}: {wins}-{losses} | {pts/n:.1f} PPG | EFG% {efg*100:.1f}%")

    # ── PBP (opcional, degrada con gracia) ────────────────────────────────────
    pbp_df = sc.load_pbp(liga)
    pbp_team = None
    pbp_available = False
    if pbp_df is not None:
        pbp_reg = pbp_df[pbp_df['Fecha'] < cutoff] if cutoff is not None else pbp_df
        pbp_team = pbp_reg[(pbp_reg['Equipo_local'] == team) | (pbp_reg['Equipo_visitante'] == team)].copy()
        pbp_available = not pbp_team.empty
        if pbp_available:
            print(f"  PBP: {pbp_team['IdPartido'].nunique()} partidos disponibles")

    # ── Documento ──────────────────────────────────────────────────────────────
    doc = Document()
    for section in doc.sections:
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)

    title = doc.add_heading(f"Scouting Report — {team}", level=0)
    doc.add_paragraph(f"{cfg['label']} — Temporada Regular 2025/26")

    # I. Resumen Ejecutivo
    sc.add_section_header(doc, "I. RESUMEN EJECUTIVO")
    exec_rows = [
        ['Récord', f"{wins}-{losses}"],
        ['PPG / Opp PPG', f"{pts/n:.1f} / {opp_pts_pg:.1f}" if opp_pts_pg else f"{pts/n:.1f} / —"],
        ['EFG%', f"{efg*100:.1f}%"],
        ['TS%', f"{ts*100:.1f}%"],
        ['T2 (M/I/%)', f"{int(t2a)}/{int(t2i)}/{t2a/t2i*100:.1f}%" if t2i else "—"],
        ['T3 (M/I/%)', f"{int(t3a)}/{int(t3i)}/{t3a/t3i*100:.1f}%" if t3i else "—"],
        ['T1 (M/I/%)', f"{int(t1a)}/{int(t1i)}/{t1a/t1i*100:.1f}%" if t1i else "—"],
        ['Rebotes (O/D/T por partido)', f"{oreb/n:.1f} / {dreb/n:.1f} / {treb/n:.1f}"],
        ['AST/TOV', f"{ast/tov:.2f}" if tov else "—"],
        ['STL/g / BLK/g', f"{stl/n:.1f} / {blk/n:.1f}"],
        ['Posesiones/partido (Pace aprox.)', f"{poss_pg:.1f}"],
    ]
    sc.add_table(doc, ['Métrica', 'Valor'], exec_rows, header_color="3730A3")

    # II. Shot Chart
    sc.add_section_header(doc, "II. MAPA DE TIROS")
    if len(team_shots) > 0:
        fig = sc.plot_team_shot_chart(team_shots, team)
        sc.fig_to_docx(doc, fig, width_inches=5.5, caption="Verde = convertido · Rojo = fallado")
    else:
        doc.add_paragraph("(Sin datos de tiros disponibles para este equipo)")

    # III. Scoring por cuarto (requiere PBP)
    sc.add_section_header(doc, "III. SCORING POR CUARTO")
    if pbp_available:
        q_my = {1: 0, 2: 0, 3: 0, 4: 0}
        q_opp = {1: 0, 2: 0, 3: 0, 4: 0}
        for gid, g in pbp_team.groupby('IdPartido'):
            is_local = (g['Equipo_local'].iloc[0] == team)
            my_col = 'Marcador_local' if is_local else 'Marcador_visitante'
            opp_col = 'Marcador_visitante' if is_local else 'Marcador_local'
            prev_my, prev_opp = 0, 0
            for q in [1, 2, 3, 4]:
                q_rows = g[g['Periodo'] == q]
                if q_rows.empty:
                    continue
                last = q_rows.iloc[-1]
                try:
                    my_now, opp_now = int(last[my_col]), int(last[opp_col])
                except (ValueError, TypeError):
                    continue
                q_my[q] += my_now - prev_my
                q_opp[q] += opp_now - prev_opp
                prev_my, prev_opp = my_now, opp_now
        n_pbp = pbp_team['IdPartido'].nunique()
        q_rows_data = []
        for q in [1, 2, 3, 4]:
            diff = (q_my[q] - q_opp[q]) / n_pbp if n_pbp else 0
            q_rows_data.append([f"Q{q}", f"{q_my[q]/n_pbp:.1f}", f"{q_opp[q]/n_pbp:.1f}", f"{diff:+.1f}"])
        sc.add_colored_net_table(doc, ['Cuarto', 'Pts propios/p', 'Pts rival/p', 'Diferencial'],
                                  q_rows_data, net_col_idx=3, header_color="3730A3")
    else:
        doc.add_paragraph("(PBP no disponible — sección omitida)")

    # IV. Origen de puntos
    sc.add_section_header(doc, "IV. ORIGEN DE PUNTOS")
    paint_pts = 0
    mr_pts = 0
    t3_pts = 2  # placeholder avoided below
    if len(team_shots) > 0 and 'Zona' in team_shots.columns:
        made = team_shots[team_shots['Resultado'] == 'CONVERTIDO']
        paint_mask = made['Zona'].str.match(r'Z[1-5]-', na=False)
        mr_mask = made['Zona'].str.match(r'Z([6-9]|10)-', na=False)
        t3_mask = made['Zona'].str.match(r'Z1[1-4]-', na=False)
        paint_pts = paint_mask.sum() * 2
        mr_pts = mr_mask.sum() * 2
        t3_pts = t3_mask.sum() * 3
        ft_pts = t1a
        origin_rows = [
            ['Pintura', f"{paint_pts/n:.1f} /p"],
            ['Medio Rango', f"{mr_pts/n:.1f} /p"],
            ['Triples', f"{t3_pts/n:.1f} /p"],
            ['Tiros Libres', f"{ft_pts/n:.1f} /p"],
        ]
        sc.add_table(doc, ['Zona', 'Puntos por partido'], origin_rows, header_color="3730A3")
    else:
        doc.add_paragraph("(Sin datos de zonas de tiro disponibles)")

    # V. Tendencias Ganado/Perdido
    sc.add_section_header(doc, "V. TENDENCIAS — GANADOS VS PERDIDOS")
    won = team_tots[team_tots['Ganado'] == True]
    lost = team_tots[team_tots['Ganado'] == False]
    gp_rows = []
    for label, sub in [('Ganados', won), ('Perdidos', lost)]:
        if sub.empty:
            continue
        sub_t2a, sub_t2i = sub['T2A'].sum(), sub['T2I'].sum()
        sub_t3a, sub_t3i = sub['T3A'].sum(), sub['T3I'].sum()
        sub_efg = sc.calc_efg(sub_t2a, sub_t3a, sub_t2i, sub_t3i)
        gp_rows.append([label, len(sub), f"{sub['Puntos'].sum()/len(sub):.1f}",
                        f"{sub_efg*100:.1f}%", f"{sub['Perdidas'].sum()/len(sub):.1f}",
                        f"{sub['TReb'].sum()/len(sub):.1f}"])
    sc.add_table(doc, ['', 'PJ', 'PPG', 'EFG%', 'TOV/g', 'REB/g'], gp_rows, header_color="3730A3")

    # VI. Splits Local / Visitante
    sc.add_section_header(doc, "VI. SPLITS LOCAL / VISITANTE")
    split_rows = []
    for label, cond in [('Local', 'LOCAL'), ('Visitante', 'VISITANTE')]:
        sub = team_tots[team_tots['Condicion equipos'] == cond]
        if sub.empty:
            continue
        w = int(sub['Ganado'].sum())
        split_rows.append([label, f"{w}-{len(sub)-w}", f"{sub['Puntos'].sum()/len(sub):.1f}"])
    sc.add_table(doc, ['Condición', 'Récord', 'PPG'], split_rows, header_color="3730A3")

    # VII. Forma reciente (últimos 10)
    sc.add_section_header(doc, "VII. FORMA RECIENTE (ÚLTIMOS 10)")
    recent = team_tots.sort_values('Fecha').tail(10)
    recent_rows = []
    for _, r in recent.iterrows():
        result = 'G' if r['Ganado'] else 'P'
        rival_row = df_reg[(df_reg['IdPartido'] == r['IdPartido']) & (df_reg['Apellido'] == 'TOTALES')
                            & (df_reg['Equipo'] != team)]
        opp_pts = rival_row['Puntos'].iloc[0] if not rival_row.empty else '—'
        recent_rows.append([r['Fecha'].strftime('%d/%m/%Y'), r['Rival'], result,
                            int(r['Puntos']), opp_pts])
    sc.add_table(doc, ['Fecha', 'Rival', 'Res.', 'Pts', 'Pts Rival'], recent_rows, header_color="3730A3")

    # VIII. Clutch (requiere PBP)
    sc.add_section_header(doc, "VIII. CLUTCH (Q4/OT, ≤5min, dif. ≤5pts)")
    if pbp_available:
        clutch = sc.compute_clutch(pbp_team, team)
        if clutch:
            clutch_rows = [
                [team, f"{clutch['my_made']}/{clutch['my_att']}", f"{clutch['my_pct']:.1f}%"],
                ['Rivales', f"{clutch['opp_made']}/{clutch['opp_att']}", f"{clutch['opp_pct']:.1f}%"],
            ]
            sc.add_table(doc, ['', 'M/I', '%'], clutch_rows, header_color="3730A3")
        else:
            doc.add_paragraph("(Sin situaciones clutch registradas en el PBP)")
    else:
        doc.add_paragraph("(PBP no disponible — sección omitida)")

    # IX. Jugadores
    sc.add_section_header(doc, "IX. ANÁLISIS DE JUGADORES")
    players = []
    for (ape, nom), grp in team_play.groupby(['Apellido', 'Nombre']):
        played = grp[grp['Segundos jugados'] > 0]
        pj = len(played)
        if pj == 0:
            continue
        mins = played['Segundos jugados'].sum() / 60
        mpg = mins / pj
        if mpg < 5:
            continue
        p_t2a, p_t2i = played['T2A'].sum(), played['T2I'].sum()
        p_t3a, p_t3i = played['T3A'].sum(), played['T3I'].sum()
        p_t1a, p_t1i = played['T1A'].sum(), played['T1I'].sum()
        p_pts = played['Puntos'].sum()
        p_efg = sc.calc_efg(p_t2a, p_t3a, p_t2i, p_t3i)
        p_ts = sc.calc_ts(p_pts, p_t2i, p_t3i, p_t1i)
        players.append({
            'name': f"{ape}, {nom[0]}." if nom else ape,
            'pj': pj, 'mpg': mpg, 'ppg': p_pts / pj,
            'rpg': played['TReb'].sum() / pj, 'apg': played['Asistencias'].sum() / pj,
            't2pct': f"{p_t2a/p_t2i*100:.1f}%" if p_t2i else "—",
            't3pct': f"{p_t3a/p_t3i*100:.1f}%" if p_t3i else "—",
            'efg': p_efg * 100, 'ts': p_ts * 100,
        })
    players.sort(key=lambda x: x['ppg'], reverse=True)
    p_rows = [[p['name'], p['pj'], f"{p['mpg']:.1f}", f"{p['ppg']:.1f}", f"{p['rpg']:.1f}",
              f"{p['apg']:.1f}", p['t2pct'], p['t3pct'], f"{p['efg']:.1f}%", f"{p['ts']:.1f}%"]
              for p in players]
    sc.add_table(doc, ['Jugador', 'PJ', 'MIN', 'PPG', 'RPG', 'APG', 'T2%', 'T3%', 'EFG%', 'TS%'],
                 p_rows, header_color="3730A3")

    # X. Quintetos (requiere PBP)
    sc.add_section_header(doc, "X. QUINTETOS (por tiempo juntos)")
    if pbp_available:
        lineups = sc.compute_lineups(pbp_team, None, team)
        top5 = sc.secs_to_min(lineups['lineup'])[:8]
        if top5:
            lup_rows = [[' / '.join(l['players']), f"{l['min']:.0f}"] for l in top5 if l['min'] > 1]
            if lup_rows:
                sc.add_table(doc, ['Quinteto', 'Min'], lup_rows, header_color="3730A3")
            else:
                doc.add_paragraph("(No se detectaron quintetos con minutos suficientes)")
        else:
            doc.add_paragraph("(No se pudieron reconstruir quintetos desde el PBP)")
    else:
        doc.add_paragraph("(PBP no disponible — sección omitida)")

    # XI. Fortalezas y Debilidades
    sc.add_section_header(doc, "XI. FORTALEZAS Y DEBILIDADES")
    if t3i > 0:
        t3pct = t3a / t3i * 100
        if t3pct >= 36:
            sc.add_swot_item(doc, f"Buen tiro exterior: {t3pct:.1f}% en triples.", 'FORTALEZA')
        elif t3pct < 30:
            sc.add_swot_item(doc, f"Tiro exterior débil: {t3pct:.1f}% en triples.", 'DEBILIDAD')
    if ast / tov >= 1.5 if tov else False:
        sc.add_swot_item(doc, f"Buen manejo de balón: AST/TOV {ast/tov:.2f}.", 'FORTALEZA')
    elif tov and ast / tov < 1.0:
        sc.add_swot_item(doc, f"Propenso a pérdidas: AST/TOV {ast/tov:.2f}.", 'DEBILIDAD')
    if oreb / n >= 10:
        sc.add_swot_item(doc, f"Fuerte en rebote ofensivo: {oreb/n:.1f}/partido.", 'FORTALEZA')
    if t1i > 0 and t1a / t1i * 100 < 65:
        sc.add_swot_item(doc, f"Débil en la línea: {t1a/t1i*100:.1f}% en libres — estrategia de faltas viable.", 'OPORTUNIDAD')
    if players:
        best = max(players, key=lambda x: x['ts'])
        sc.add_swot_item(doc, f"Jugador más eficiente: {best['name']} (TS% {best['ts']:.1f}%). Priorizar su defensa.", 'AMENAZA')

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    doc.save(out_path)
    print(f"\n✓ Reporte generado: {out_path}")
    if not pbp_available:
        print("  Aviso: PBP no disponible — se omitieron Scoring por cuarto, Clutch y Quintetos.")
    return True


def main():
    parser = argparse.ArgumentParser(description="Genera un scouting report .docx de un equipo.")
    parser.add_argument('--team', required=True, help="Nombre exacto del equipo (ver CSV de stats)")
    parser.add_argument('--liga', choices=list(sc.LIGAS.keys()), default=None,
                        help="Liga (si se omite, se auto-detecta)")
    parser.add_argument('--out', default=None, help="Ruta de salida del .docx")
    args = parser.parse_args()

    liga = args.liga
    if liga is None:
        liga = sc.detect_liga(args.team)
        if liga is None:
            print(f"ERROR: '{args.team}' no se encontró en ninguna liga soportada.\n")
            print("Equipos disponibles:")
            for lg, teams in sc.list_teams().items():
                print(f"\n{sc.LIGAS[lg]['label']}:")
                for t in teams:
                    print(f"  - {t}")
            sys.exit(1)
        print(f"Liga auto-detectada: {liga}")

    out_path = args.out or f"scouting/scouting_{slugify(args.team)}.docx"
    ok = build_report(args.team, liga, out_path)
    if not ok:
        print("\nEquipos disponibles en esta liga:")
        for t in sc.list_teams((liga,))[liga]:
            print(f"  - {t}")
        sys.exit(1)


if __name__ == '__main__':
    main()
