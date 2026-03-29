# CLAUDE_stories.md — Instagram Stories para Scouteado

Guía para generar stories de Instagram (1080×1920px) con análisis de equipos.
Archivo de referencia para stories: `docs/story_<equipo>.html`

---

## Dimensiones y estructura base

```
1080 × 1920 px (9:16)
<meta name="viewport" content="width=1080">   ← fuerza render a escala correcta
html, body { width:1080px; height:1920px; overflow:hidden; }
```

Para capturar: Chrome DevTools → `Cmd+Option+I` → `Cmd+Shift+P` → "Capture full size screenshot"
Resultado: PNG exacto de 1080×1920.

---

## Paleta de colores (idéntica a Scouteado)

```css
--bg:          #0b0b16;       /* fondo oscuro principal */
--bg2:         #111127;
--surface:     #18182e;       /* cards, tablas */
--surface2:    #1f1f3a;
--border:      rgba(139,92,246,.22);   /* borde estándar violeta */
--border2:     rgba(255,255,255,.07);  /* borde sutil blanco */
--purple:      #8b5cf6;
--purple-d:    #6d28d9;
--purple-l:    #a78bfa;       /* valor de equipo analizado */
--purple-soft: rgba(139,92,246,.13);
--teal:        #2dd4bf;
--teal-l:      #5eead4;       /* valor comparativo/rival */
--teal-soft:   rgba(45,212,191,.11);
--text:        #e2e8f0;
--text-bright: #f8fafc;
--muted:       #64748b;       /* labels, títulos de sección */
--muted2:      #475569;
--green:       #34d399;       /* positivo, victorias */
--red:         #f87171;       /* negativo, derrotas */
--orange:      #fb923c;
```

**Fuente:** Inter (Google Fonts), pesos 300/400/500/600/700/800/900.

---

## Background de la story

```css
background: var(--bg);
background-image:
  radial-gradient(ellipse 110% 40% at 50% -2%, rgba(139,92,246,.38) 0%, transparent 55%),
  radial-gradient(ellipse 60% 35% at 88% 92%, rgba(45,212,191,.1) 0%, transparent 55%),
  radial-gradient(ellipse 40% 20% at 10% 70%, rgba(139,92,246,.06) 0%, transparent 55%);
```
- Gradiente violeta arriba al centro (glow de entrada)
- Gradiente teal abajo a la derecha (acento de profundidad)
- Gradiente violeta suave izquierda media (textura)

---

## Secciones disponibles (clases CSS)

### Header (`s-header`)
- Logo Scouteado con glow violeta + texto gradiente violeta→teal
- Badge de liga en teal (`s-badge-liga`)
- `padding: 54px 64px 40px`

### Hero del equipo (`s-hero`)
- Logo del equipo: `width:130px; border-radius:50%; border: 3px solid rgba(139,92,246,.5)`
- Logo path: `logos/<nombre>.jpeg` (relativo a `docs/`)
- Conferencia + posición en teal-l
- Nombre en blanco brillante, `font-size:3.2rem; font-weight:900`
- Badge de rank: gradiente violeta, `padding:10px 24px`

### Stats principales — 4 cards (`s-main-stats`)
- Grid 4 columnas, `gap:16px`, `padding: 32px 64px 20px`
- Cada card: `background:var(--surface); border-radius:20px; padding:28px 20px`
- Accent en top: `height:2px; background: linear-gradient(90deg, var(--purple-d), var(--purple))`
  - `.teal::before` → gradiente `#0d9488 → var(--teal)`
  - `.green::before` → gradiente `#059669 → var(--green)`
- Valor: `font-size:2.6rem; font-weight:900`
  - `.purple` → color `var(--purple-l)`
  - `.teal`   → color `var(--teal-l)`
  - `.green`  → color `var(--green)`

### Fila de récord secundario (`s-record-row`)
- 2 cards lado a lado con 2 stats cada una
- `s-record-value`: `font-size:1.6rem; font-weight:800`

### Comparativa vs Liga (`s-compare-grid`)
- Grid 2×2, cada ítem con label izquierda + valor equipo + valor liga
- Valor equipo: `var(--purple-l)`, `font-size:1.15rem; font-weight:800`
- Valor liga: `var(--muted2)`, `font-size:0.85rem`
- Flecha: `▲` verde si mejor, `▼` roja (clase `.down`) si peor

### Tabla de jugadores (`s-roster-table`)
- `border-radius:18px; overflow:hidden` (requiere contenedor `overflow:hidden`)
- Header: fondo `rgba(139,92,246,.08)`, texto uppercase muted
- Columna nombre: alineada izquierda, `font-weight:700; color:var(--text-bright)`
- Clases de colores de celda: `val-purple`, `val-teal`, `val-green`, `val-muted`

### Local / Visitante (`s-split-row`)
- Grid 2 columnas, `gap:16px`
- Badge local: `var(--purple-l)` con fondo `rgba(139,92,246,.15)`
- Badge visit: `var(--teal-l)` con fondo `rgba(45,212,191,.1)`
- Récord: `font-size:2rem; font-weight:900`

### Márgenes (`s-margins-row`)
- Grid 3 columnas
- Avg victoria → `var(--green)`, Avg derrota → `var(--red)`
- `font-size:1.7rem; font-weight:900`

### Títulos de sección (`s-section-title`)
- `font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--purple-l)`
- `::after` → línea separadora `background:var(--border)`

### Footer (`s-footer`)
- `margin-top:auto` (empuja al fondo del flex container)
- Brand "análisis por **Scouteado**" (Scouteado en gradiente violeta→teal)
- Fecha formato `DD · MM · YYYY`

---

## Parámetros computados del CSV

Todos los datos se extraen de `docs/liga_argentina.csv`.

**Nota:** primera columna tiene BOM → key es `'\ufeffFecha'` no `'Fecha'`.
**Nota:** filas de totales de equipo: `Nombre completo == "TOTALES"`.

### Datos de equipo (filas TOTALES)
| Stat | Fórmula |
|---|---|
| Récord (W-L) | Contar `Ganado==1` y `Ganado==0` por equipo en filas TOTALES |
| Win% | `W / (W+L)` |
| PTS/p | `sum(Puntos) / PJ` |
| REB/p | `sum(TReb) / PJ` |
| AST/p | `sum(Asistencias) / PJ` |
| Dif/p | `(PTS_propia - PTS_rival) / PJ` |
| PTS_rival | Cruzar `IdPartido` → la otra fila TOTALES del mismo partido |
| OffRtg | `sum(Puntos) / sum(posesiones) * 100` donde `pos = T2I + T3I + 0.44*T1I - OReb + Perdidas` |
| DefRtg | `sum(PTS_rival) / sum(posesiones_rival) * 100` |
| NetRtg | `OffRtg - DefRtg` |
| EFG% | `(T2A + 1.5*T3A) / (T2I + T3I)` |
| TS% | `PTS / (2 * (T2I+T3I + 0.44*T1I))` |
| T3% | `T3A / T3I` |

### Datos de jugadores (filas no-TOTALES)
| Stat | Fórmula |
|---|---|
| PTS/p | `sum(Puntos) / PJ` donde PJ = partidos con `Segundos jugados > 0` |
| REB/p | `sum(TReb) / PJ` |
| AST/p | `sum(Asistencias) / PJ` |
| EFG% | `(T2A + 1.5*T3A) / (T2I + T3I)` |
| TS% | `Puntos / (2 * (T2I+T3I + 0.44*T1I))` |

### Splits Local/Visitante
Filtrar por `Condicion equipos == 'LOCAL'` o `'VISITANTE'` en filas TOTALES del equipo.

---

## Logos de equipos

Path: `docs/logos/<nombre>.jpeg`

Nombres de archivo de los 34 equipos de Liga Argentina:
`amancay_lr`, `barrio_parque`, `bochas_cc`, `centenario_vt`, `central_entrerriano`,
`ciclista_j`, `colon_sf`, `comunicaciones`, `dep_norte`, `dep_viedma`,
`el_talar`, `estudiantes_t`, `fusion_riojana`, `gimnasia_lp`, `hindu_c`,
`huracan_lh`, `independiente_sde`, `jujuy_basquet`, `la_union_c`, `lanus`,
`pergamino_basquet`, `pico_fc`, `provincial_r`, `quilmes_mdp`, `racing_a`,
`rivadavia_mza`, `rocamora`, `salta_basket`, `san_isidro`, `santa_paula_g`,
`sp_suardi`, `union_mdp`, `villa_mitre_bb`, `villa_san_martin`

> Si no existe el logo del equipo, usar `background: var(--surface2)` en el `<img>` como fallback.

---

## Flujo para crear una story nueva

1. **Extraer stats del equipo** con Python desde `docs/liga_argentina.csv`
   ```bash
   python3 << 'EOF'
   import csv, sys
   EQUIPO = "NOMBRE_EQUIPO"   # ← cambiar
   bom = '\ufeff'
   totales = []
   jugadores = {}
   with open('docs/liga_argentina.csv', newline='', encoding='utf-8-sig') as f:
       reader = csv.DictReader(f)
       for row in reader:
           eq = row.get('Equipo','')
           nc = row.get('Nombre completo','')
           if eq == EQUIPO and nc == 'TOTALES':
               totales.append(row)
           elif eq == EQUIPO and nc != 'TOTALES':
               key = nc
               if key not in jugadores: jugadores[key] = []
               jugadores[key].append(row)
   # ... calcular stats
   EOF
   ```

2. **Copiar `story_equipos.html`** como base, renombrar a `story_<equipo>.html`

3. **Editar los valores** en el HTML:
   - Nombre del equipo, conferencia, posición
   - `src="logos/<archivo>.jpeg"` del logo
   - Win%, Récord (W-L), OffRtg, NetRtg, DefRtg
   - PTS/p, AST/p, Dif/p
   - EFG%, TS%, T3%, AST/p vs promedios de liga
   - Tabla de jugadores (top 6 por PTS/p, incluir REB, AST, EFG%, TS%)
   - Splits local/visitante (récord, PTS, PTC, Dif)
   - Márgenes (avg victoria, avg derrota, PJ totales)
   - Fecha en el footer

4. **Capturar** con Chrome DevTools → full size screenshot

---

## Convenciones visuales de color

| Contexto | Color |
|---|---|
| Valor destacado del equipo | `var(--purple-l)` (`#a78bfa`) |
| Valor de referencia / liga / rival | `var(--teal-l)` (`#5eead4`) |
| Diferencial positivo, victorias | `var(--green)` (`#34d399`) |
| Diferencial negativo, derrotas | `var(--red)` (`#f87171`) |
| Eficiencia baja / neutral | `var(--muted)` (`#64748b`) |
| Stat principal de un jugador | `val-purple` |
| Stat de rebotes / asistencias del equipo | `val-teal` |

---

## Header — logo Scouteado (versión jugador)

En `story_jugador.html` el logo **no tiene fondo violeta** — se muestra la imagen directamente:

```html
<div class="s-logo-icon">
  <img src="logos/scouteado_logo.png" style="width:52px;height:52px;object-fit:contain;">
</div>
```

```css
.s-logo-icon { display:flex; align-items:center; justify-content:center; }
.s-logo-text { font-size:1.5rem; font-weight:800; color:var(--text-bright); }
```

> En `story_equipos.html` el header usa gradiente violeta + texto multicolor. En `story_jugador.html` el texto es blanco plano y no hay fondo en el ícono.

---

## Hero del jugador (`s-hero` — story jugador)

- Avatar vacío (círculo transparente) para superponer foto del jugador: `background: transparent`
- Borde violeta: `border: 3px solid rgba(139,92,246,.5)`
- Dorsal como badge violeta (`s-dorsal-badge`): `padding:10px 26px; font-size:1.1rem; font-weight:900`
- Equipo + posición en teal-l, nombre en blanco (`font-size:2.8rem; font-weight:900`)

```css
.s-player-avatar {
  width: 120px; height: 120px;
  border-radius: 50%;
  border: 3px solid rgba(139,92,246,.5);
  background: transparent;
  flex-shrink: 0;
}
```

---

## Splits de tiro (`s-shoots-row`)

Grid 3 columnas: Dobles (T2%), Triples (T3%), Tiros Libres (TL%).

```css
.s-shoots-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  padding: 0 64px 16px;
}
.s-shoot-card {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 18px;
  padding: 20px 14px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.s-shoot-card::before {
  /* accent top igual que s-stat-card */
  content:''; position:absolute; top:0; left:0; right:0;
  height:2px;
  background: linear-gradient(90deg, var(--purple-d), var(--purple));
  opacity: 0.4;
}
.s-shoot-pct  { font-size:2rem; font-weight:900; letter-spacing:-0.03em; }
.s-shoot-label { font-size:0.72rem; font-weight:700; color:var(--muted); text-transform:uppercase; }
.s-shoot-made  { font-size:0.78rem; font-weight:500; color:var(--muted2); }
```

Convención de color del porcentaje:
- T2% bueno → `var(--teal-l)`, malo → `var(--orange)`
- T3% bueno → `var(--teal-l)`, malo → `var(--red)`
- TL% bueno → `var(--green)`, malo → `var(--orange)`

---

## Placeholders de contenido externo (`s-placeholder`)

Para zonas donde se insertará manualmente un SVG/canvas (mapa de tiros, conexiones):

```css
.s-placeholder {
  margin: 0 64px;
  border-radius: 20px;
  background: var(--bg);   /* mismo color que el fondo — invisible */
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
}
```

```html
<div class="s-placeholder" style="height:510px;">
  <div class="s-placeholder-icon">🎯</div>
  <div>Mapa de zonas</div>
</div>
```

> El fondo `var(--bg)` hace que el placeholder sea invisible sobre el fondo de la story — útil para alinear el contenido externo sin ver el contenedor.

---

## Archivos de referencia

| Archivo | Descripción |
|---|---|
| `docs/story_equipos.html` | Story de Provincial (R) — template equipos completo |
| `docs/liga_nacional/story_jugador.html` | Story de Franco Balbi — template jugadores completo |
| `docs/liga_argentina.csv` | Stats fuente (columna 1 con BOM `\ufeff`) |
| `docs/logos/` | Logos JPEG de los 34 equipos + `scouteado_logo.png` |
| `docs/index.html` | Sistema de diseño completo de Scouteado (variables CSS, fuentes) |
