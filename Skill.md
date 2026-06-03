# Skill: Cruce de datos — Tiros y Asistencias

Verifica la integridad entre los tres CSVs de cualquier torneo en Scouteado: box score (`*.csv`), mapa de tiros (`*_shots.csv`) y jugada a jugada (`*_pbp.csv`).

Correr siempre desde la raíz del repo (`liga_argentina/`).

---

## Torneos disponibles

| Liga / Torneo | Stats CSV | Shots CSV | PBP CSV | Formato shots |
|---|---|---|---|---|
| Liga Argentina | `docs/liga_argentina/liga_argentina.csv` | `docs/liga_argentina/liga_argentina_shots.csv` | Supabase | `Left_pct / Top_pct` |
| Liga Nacional | `docs/liga_nacional/liga_nacional.csv` | `docs/liga_nacional/liga_nacional_shots.csv` | Supabase | `Left_pct / Top_pct` |
| Liga Femenina | `docs/liga_femenina/liga_femenina.csv` | `docs/liga_femenina/liga_femenina_shots.csv` | Supabase | `Left_pct / Top_pct` |
| Liga de Desarrollo | `docs/liga_proximo/liga_proximo.csv` | `docs/liga_proximo/liga_proximo_shots.csv` | Supabase | `Left_pct / Top_pct` |
| Formativas U17 | `docs/argentina_formativas/argentina_formativas.csv` | `docs/argentina_formativas/argentina_formativas_shots.csv` | `docs/argentina_formativas/argentina_formativas_pbp.csv` | `x / y` (FIBA) |
| Formativas U18 | `docs/argentina_formativas/fiba_u18/fiba_u18.csv` | `docs/argentina_formativas/fiba_u18/fiba_u18_shots.csv` | `docs/argentina_formativas/fiba_u18/fiba_u18_pbp.csv` | `x / y` (FIBA) |

> **PBP en Supabase**: las ligas regulares guardan sus PBPs en Supabase Storage, no en el repo. El check de asistencias solo es posible cuando el PBP está disponible localmente (formativas) o descargado manualmente.

---

## Check 1 — Tiros de campo y libres (shots vs box score)

```python
python3 -c "
import pandas as pd

def check_shots(stats_path, shots_path, label):
    print(f'\n=== {label} ===')
    stats = pd.read_csv(stats_path)
    shots = pd.read_csv(shots_path)

    totales = stats[stats['Nombre completo'] == 'TOTALES']
    bs = totales.groupby(['IdPartido', 'Equipo']).agg(
        T2I=('T2I', 'sum'), T3I=('T3I', 'sum'), T1I=('T1I', 'sum')
    ).reset_index()
    bs['TCI_bs'] = bs['T2I'] + bs['T3I']

    field = shots[shots['Tipo'].isin(['TIRO2', 'TIRO3'])]
    ft    = shots[shots['Tipo'] == 'TIRO1']

    fs_grp = field.groupby(['IdPartido', 'Equipo']).size().reset_index(name='TCI_shots')
    ft_grp = ft.groupby(['IdPartido', 'Equipo']).size().reset_index(name='T1I_shots')

    m = pd.merge(bs, fs_grp, on=['IdPartido', 'Equipo'], how='left')
    m = pd.merge(m,  ft_grp, on=['IdPartido', 'Equipo'], how='left')
    m['TCI_shots'] = m['TCI_shots'].fillna(0).astype(int)
    m['T1I_shots'] = m['T1I_shots'].fillna(0).astype(int)

    pct_c = field.shape[0] / bs['TCI_bs'].sum() * 100
    pct_t = ft.shape[0]    / bs['T1I'].sum()    * 100
    print(f'  Tiros de campo — BS: {bs[\"TCI_bs\"].sum():4d}  Shots: {field.shape[0]:4d}  ({pct_c:.1f}%)')
    print(f'  Tiros libres   — BS: {bs[\"T1I\"].sum():4d}  Shots: {ft.shape[0]:4d}  ({pct_t:.1f}%)')

    bad = m[m[['TCI_shots','T1I_shots']].sub(m[['TCI_bs','T1I']].values).abs().max(axis=1) > 3]
    if len(bad):
        print(f'\n  Equipo-partidos con diff > 3:')
        for _, r in bad.iterrows():
            print(f'    {str(r[\"Equipo\"]):20s}  campo diff={r[\"TCI_shots\"]-r[\"TCI_bs\"]:+d}  TL diff={r[\"T1I_shots\"]-r[\"T1I\"]:+d}')
    else:
        print('  Sin gaps > 3. OK.')

# Editar paths según el torneo a chequear
check_shots(
    'docs/argentina_formativas/argentina_formativas.csv',
    'docs/argentina_formativas/argentina_formativas_shots.csv',
    'U17 — Sudamericano 2025'
)
check_shots(
    'docs/argentina_formativas/fiba_u18/fiba_u18.csv',
    'docs/argentina_formativas/fiba_u18/fiba_u18_shots.csv',
    'U18 — FIBA Americas 2026'
)
"
```

---

## Check 2 — Asistencias (PBP vs box score)

Requiere PBP local. Para ligas regulares, descargar primero desde Supabase.

```python
python3 -c "
import pandas as pd

def check_ast(stats_path, pbp_path, label):
    print(f'\n=== {label} ===')
    stats = pd.read_csv(stats_path)
    pbp   = pd.read_csv(pbp_path)

    totales = stats[stats['Nombre completo'] == 'TOTALES']
    bs = totales.groupby(['IdPartido', 'Equipo'])['Asistencias'].sum().reset_index()
    bs.columns = ['IdPartido', 'Equipo', 'AST_bs']

    ast_pbp = pbp[pbp['Tipo'] == 'ASISTENCIA'].copy()
    ast_pbp['Equipo'] = ast_pbp.apply(
        lambda r: r['Equipo_local'] if r['Equipo_lado'] == 'LOCAL' else
                  r['Equipo_visitante'] if r['Equipo_lado'] == 'VISITANTE' else None,
        axis=1
    )
    pbp_grp = ast_pbp.groupby(['IdPartido', 'Equipo']).size().reset_index(name='AST_pbp')

    m = pd.merge(bs, pbp_grp, on=['IdPartido', 'Equipo'], how='left')
    m['AST_pbp'] = m['AST_pbp'].fillna(0).astype(int)
    m['diff']    = m['AST_pbp'] - m['AST_bs']

    pct = ast_pbp.shape[0] / bs['AST_bs'].sum() * 100
    cob = len(m[m['AST_pbp'] > 0])
    print(f'  Total AST — BS: {bs[\"AST_bs\"].sum()}  PBP: {ast_pbp.shape[0]}  ({pct:.1f}%)  [{cob}/{len(m)} partidos]')

    bad = m[m['diff'].abs() > 2].sort_values('diff')
    if len(bad):
        print(f'  Equipo-partidos con diff > 2:')
        for _, r in bad.iterrows():
            print(f'    {str(r[\"Equipo\"]):20s}  BS={r[\"AST_bs\"]:3d}  PBP={r[\"AST_pbp\"]:3d}  Diff={r[\"diff\"]:+d}')
    else:
        print('  Sin gaps > 2. OK.')

check_ast(
    'docs/argentina_formativas/argentina_formativas.csv',
    'docs/argentina_formativas/argentina_formativas_pbp.csv',
    'U17 — Sudamericano 2025'
)
check_ast(
    'docs/argentina_formativas/fiba_u18/fiba_u18.csv',
    'docs/argentina_formativas/fiba_u18/fiba_u18_pbp.csv',
    'U18 — FIBA Americas 2026'
)
"
```

---

## Check 3 — Todas las ligas regulares (solo tiros, PBP no local)

```python
python3 -c "
import pandas as pd

LIGAS = [
    ('Liga Argentina',    'docs/liga_argentina/liga_argentina.csv',    'docs/liga_argentina/liga_argentina_shots.csv'),
    ('Liga Nacional',     'docs/liga_nacional/liga_nacional.csv',      'docs/liga_nacional/liga_nacional_shots.csv'),
    ('Liga Femenina',     'docs/liga_femenina/liga_femenina.csv',      'docs/liga_femenina/liga_femenina_shots.csv'),
    ('Liga Desarrollo',   'docs/liga_proximo/liga_proximo.csv',        'docs/liga_proximo/liga_proximo_shots.csv'),
    ('Formativas U17',    'docs/argentina_formativas/argentina_formativas.csv', 'docs/argentina_formativas/argentina_formativas_shots.csv'),
    ('Formativas U18',    'docs/argentina_formativas/fiba_u18/fiba_u18.csv',    'docs/argentina_formativas/fiba_u18/fiba_u18_shots.csv'),
]

for label, stats_path, shots_path in LIGAS:
    stats = pd.read_csv(stats_path)
    shots = pd.read_csv(shots_path)
    tot   = stats[stats['Nombre completo'] == 'TOTALES']
    bs_c  = tot['T2I'].sum() + tot['T3I'].sum()
    bs_tl = tot['T1I'].sum()
    sh_c  = shots[shots['Tipo'].isin(['TIRO2','TIRO3'])].shape[0]
    sh_tl = shots[shots['Tipo'] == 'TIRO1'].shape[0]
    pct_c = sh_c  / bs_c  * 100 if bs_c  > 0 else 0
    pct_t = sh_tl / bs_tl * 100 if bs_tl > 0 else 0
    estado_c = '✓' if pct_c >= 99 else '~' if pct_c >= 90 else '✗'
    estado_t = '✓' if pct_t >= 99 else '~' if pct_t >= 90 else '✗'
    print(f'{label:20s}  Campo {estado_c} {pct_c:5.1f}%  TL {estado_t} {pct_t:5.1f}%')
"
```

---

## Check 4 — Jugadores>Tiros vs Equipos>Tiro (total liga)

Verifica que la suma de tiros de todos los jugadores individuales coincide con el total mostrado en Equipos>Tiro cuando se selecciona "Liga". El gap aparece cuando un tiro tiene `Dorsal` nulo o inválido — ese tiro entra en el total del equipo (`SHOTS_MAP`) pero no en ningún jugador (`SHOTS_BY_PLAYER`, indexado por `Equipo||Dorsal`).

```python
python3 -c "
import pandas as pd

LIGAS = [
    ('Liga Argentina',  'docs/liga_argentina/liga_argentina_shots.csv'),
    ('Liga Nacional',   'docs/liga_nacional/liga_nacional_shots.csv'),
    ('Liga Femenina',   'docs/liga_femenina/liga_femenina_shots.csv'),
    ('Liga Desarrollo', 'docs/liga_proximo/liga_proximo_shots.csv'),
    ('Formativas U17',  'docs/argentina_formativas/argentina_formativas_shots.csv'),
    ('Formativas U18',  'docs/argentina_formativas/fiba_u18/fiba_u18_shots.csv'),
]

for label, shots_path in LIGAS:
    shots = pd.read_csv(shots_path)
    field = shots[shots['Tipo'].isin(['TIRO2', 'TIRO3'])]
    total = len(field)

    # Tiros atribuibles a un jugador (Dorsal válido, igual que SHOTS_BY_PLAYER en el dashboard)
    with_dorsal = field.dropna(subset=['Dorsal'])
    with_dorsal = with_dorsal[with_dorsal['Dorsal'].astype(str).str.strip() != '']
    player_total = len(with_dorsal)

    gap = total - player_total
    pct = player_total / total * 100 if total > 0 else 0
    estado = '✓' if gap == 0 else '~' if pct >= 99 else '✗'
    print(f'{label:20s}  t-tiro liga: {total:5d}  j-tiro suma: {player_total:5d}  gap: {gap:3d}  {estado}')

    if gap > 0:
        # Desglose por equipo
        gap_rows = field[field['Dorsal'].isna() | (field['Dorsal'].astype(str).str.strip() == '')]
        print('    Equipos con tiros sin dorsal:')
        for eq, cnt in gap_rows.groupby('Equipo').size().items():
            print(f'      {str(eq):20s}  {cnt} tiros')
"
```

**Resultado esperado**: gap = 0 en todas las ligas. Si hay gap, el total de Equipos>Tiro "Liga" mostrará más tiros que la suma de todos los jugadores en Jugadores>Tiros. Verificar que el scraper asigne dorsal a todos los eventos de tiro.

---

## Umbrales de interpretación

| Cobertura | Estado | Acción |
|---|---|---|
| ≥ 99% | ✓ OK | Ninguna |
| 90–98% | ~ Advertencia | Revisar partidos faltantes; puede ser gap del scraper |
| < 90% | ✗ Error | Correr scraper `--full` para el torneo afectado |

El badge de cobertura PBP en el dashboard (sección Conexiones) usa los mismos umbrales: verde ≥90%, amarillo 70–89%, rojo <70%.

---

## Diferencias entre formatos de shots

| Liga | Coordenadas | Columnas extra |
|---|---|---|
| Ligas regulares (AR/N/F/D) | `Left_pct`, `Top_pct` (0–100%) | — |
| Argentina Formativas | `x`, `y` (FIBA: 0–280, 0–261) | `personId`, `firstName`, `lastName` |

Ambos formatos usan `Tipo` (`TIRO1/TIRO2/TIRO3`) y `Resultado` (`CONVERTIDO/FALLADO`) con los mismos valores.

---

## Cuándo correr estos checks

- Al agregar un nuevo torneo a Scouteado (verificar desde el primer scrape)
- Después de un `--full` rescrape (confirmar que no se perdieron registros)
- Si el dashboard muestra stats de tiro que parecen inconsistentes con el box score
- Periódicamente al cierre de cada fase del torneo (grupos → playoffs)
