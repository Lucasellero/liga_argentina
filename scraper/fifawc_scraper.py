#!/usr/bin/env python3
"""
FIFA World Cup 2026 stats scraper
Source: FIFA Training Centre match report hub (PDF reports)

Outputs to docs/fifa-wc-2026/:
  wc_matches.csv         — one row per match (scores, date, group, stadium)
  wc_team_stats.csv      — team-level key stats per match (xG, passes, line breaks, etc.)
  wc_player_possession.csv — individual in-possession stats per match
  wc_player_defense.csv  — individual out-of-possession stats per match

Usage:
  python Scraper/fifawc_scraper.py          # only new matches
  python Scraper/fifawc_scraper.py --full   # reprocess all PDFs
"""

import os
import re
import sys
import time
import warnings
import requests
import pdfplumber
import pandas as pd
from pathlib import Path
from urllib.parse import urljoin
from bs4 import BeautifulSoup

warnings.filterwarnings('ignore')

# ── Config ──────────────────────────────────────────────────────────────────
HUB_URL  = "https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php"
BASE_URL = "https://www.fifatrainingcentre.com"
PDF_DIR  = Path("Scraper/cache/fifawc_pdfs")
OUT_DIR  = Path("docs/fifa-wc-2026")

PDF_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

SESSION = requests.Session()
SESSION.headers.update({
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/125.0.0.0 Safari/537.36'
    ),
    'Referer': 'https://www.fifatrainingcentre.com/',
    'Accept': 'application/pdf,*/*',
})

# ── Column definitions ────────────────────────────────────────────────────────
# In Possession - Distributions (14 stat columns)
DIST_COLS = [
    'passes_att', 'passes_comp', 'pass_pct',
    'switches',
    'crosses_att', 'crosses_comp',
    'lb_att', 'lb_comp', 'lb_pct',
    'ball_prog', 'take_ons', 'step_ins',
    'att_goal', 'goals',
]

# Out of Possession (15 stat columns, tackles split into made + won)
DEF_COLS = [
    'tackles_made', 'tackles_won',
    'blocks', 'interceptions', 'pressing_contests', 'clearances',
    'pushing_on_won', 'pressing_direct', 'pressing_indirect',
    'duels_aerial', 'duels_physical',
    'loose_ball', 'pushing_on_pressing',
    'poss_regains', 'poss_interrupted',
]

# In Possession - Offers & Receptions (8 stat columns)
OFFERS_COLS = [
    'total_offers',
    'offers_in_front', 'offers_in_between',
    'offers_out_to_in', 'offers_in_to_out', 'offers_in_behind',
    'no_movement', 'offers_received',
]

# ── Regexes ───────────────────────────────────────────────────────────────────
# Distribution table row — anchored by two % values at specific positions
# Format: jersey NAME passes_att passes_comp pass_pct% switches crosses_att crosses_comp
#         lb_att lb_comp lb_pct% ball_prog take_ons step_ins att_goal goals
DIST_RE = re.compile(
    r'^(\d+)\s+(.+?)\s+'
    r'(\d+)\s+(\d+)\s+(\d+)%\s+'   # passes_att, passes_comp, pass_pct
    r'(\d+)\s+'                      # switches
    r'(\d+)\s+(\d+)\s+'             # crosses_att, crosses_comp
    r'(\d+)\s+(\d+)\s+(\d+)%\s+'   # lb_att, lb_comp, lb_pct
    r'(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$',  # ball_prog, take_ons, step_ins, att_goal, goals
    re.MULTILINE,
)

# Defense table row — anchored by the "X / Y" tackles format
# Format: jersey NAME tackles_made / tackles_won blocks interceptions pressing_contests
#         clearances pushing_on_won pressing_direct pressing_indirect duels_aerial
#         duels_physical loose_ball pushing_on_pressing poss_regains poss_interrupted
DEF_RE = re.compile(
    r'^(\d+)\s+(.+?)\s+'
    r'(\d+)\s*/\s*(\d+)\s+'          # tackles_made / tackles_won
    r'(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+'  # blocks, interceptions, pressing_contests, clearances
    r'(\d+)\s+(\d+)\s+(\d+)\s+'     # pushing_on_won, pressing_direct, pressing_indirect
    r'(\d+)\s+(\d+)\s+'             # duels_aerial, duels_physical
    r'(\d+)\s+(\d+)\s+'             # loose_ball, pushing_on_pressing
    r'(\d+)\s+(\d+)\s*$',           # poss_regains, poss_interrupted
    re.MULTILINE,
)

# Offers & Receptions row — 8 plain integers
OFFERS_RE = re.compile(
    r'^(\d+)\s+(.+?)\s+'
    r'(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$',
    re.MULTILINE,
)


# ── Hub scraping ─────────────────────────────────────────────────────────────
def get_pdf_links():
    """Scrape the hub page. Returns [(match_num, group, pdf_url), ...]."""
    resp = SESSION.get(HUB_URL, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')

    results = []
    current_group = '?'

    for el in soup.find_all(True):
        text = el.get_text(strip=True)
        # Group headings: "Group A", "Group B", ...
        if el.name in ('h2', 'h3', 'h4', 'strong', 'b'):
            gm = re.match(r'^Group\s+([A-L])', text, re.IGNORECASE)
            if gm:
                current_group = gm.group(1).upper()

        href = el.get('href', '')
        if href and href.lower().endswith('.pdf') and 'pmsr' in href.lower():
            full_url = urljoin(BASE_URL, href)
            m = re.search(r'M\s*0*(\d+)', href, re.IGNORECASE)
            match_num = int(m.group(1)) if m else len(results) + 1
            results.append((match_num, current_group, full_url))

    # Deduplicate by match_num
    seen = set()
    deduped = []
    for item in results:
        if item[0] not in seen:
            seen.add(item[0])
            deduped.append(item)

    return sorted(deduped, key=lambda x: x[0])


def download_pdf(url: str, match_num: int) -> Path:
    """Download PDF (cached). Returns local path."""
    local = PDF_DIR / f"M{match_num:03d}.pdf"
    if local.exists() and local.stat().st_size > 10_000:
        return local
    print(f"    Downloading M{match_num:03d}...")
    resp = SESSION.get(url, timeout=120)
    resp.raise_for_status()
    local.write_bytes(resp.content)
    time.sleep(1.5)
    return local


# ── PDF helpers ──────────────────────────────────────────────────────────────
def page_text(page) -> str:
    return page.extract_text() or ''


def find_page_idx(pages, marker: str) -> int:
    """First page index containing marker (case-insensitive)."""
    ml = marker.lower()
    for i, p in enumerate(pages):
        if ml in page_text(p).lower():
            return i
    return -1


def find_all_page_idx(pages, marker):
    ml = marker.lower()
    return [i for i, p in enumerate(pages) if ml in page_text(p).lower()]


# ── Parsers ──────────────────────────────────────────────────────────────────
def parse_match_header(pages) -> dict:
    """Extract header info from page 0 (title page)."""
    text = page_text(pages[0])

    # Score line: "Canada 1 - 1 Bosnia and Herzegovina"
    sm = re.search(r'^(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+)$', text, re.MULTILINE)
    home = sm.group(1).strip() if sm else ''
    home_score = int(sm.group(2)) if sm else None
    away_score = int(sm.group(3)) if sm else None
    away = sm.group(4).strip() if sm else ''

    # Group: "Group B - Match 3"
    gm = re.search(r'Group\s+([A-L])\s*-\s*Match\s+(\d+)', text, re.IGNORECASE)
    group = gm.group(1).upper() if gm else ''

    # Date
    dm = re.search(r'(\d{1,2}\s+\w+\s+\d{4})', text)
    date_str = dm.group(1) if dm else ''

    # Stadium (line ending in "Stadium" or similar)
    stm = re.search(r'\n([^\n]+(?:Stadium|Arena|Field|Center|Centre|Park)[^\n]*)', text, re.IGNORECASE)
    stadium = stm.group(1).strip() if stm else ''

    return {
        'home': home, 'away': away,
        'home_score': home_score, 'away_score': away_score,
        'group': group, 'date': date_str, 'stadium': stadium,
    }


def _g(m, i):
    """Safe regex group getter."""
    if m is None:
        return None
    try:
        return m.group(i)
    except IndexError:
        return None


def parse_key_stats(pages):
    """Extract team-level key stats from the Key Statistics page."""
    idx = find_page_idx(pages, 'Key Statistics')
    if idx < 0:
        return None
    text = page_text(pages[idx])

    # xG
    xg = re.search(r'([\d.]+)\s+xG\s*\(Expected Goals\)\s+([\d.]+)', text)
    # Goals
    gls = re.search(r'(\d+)\s+Goals\s+(\d+)', text)
    # Attempts
    att = re.search(r'(\d+)\s*\((\d+)\)\s+Attempts at Goal.*?(\d+)\s*\((\d+)\)', text, re.DOTALL)
    # Passes
    pas = re.search(r'(\d+)\s*\((\d+)\)\s+Total Passes.*?(\d+)\s*\((\d+)\)', text, re.DOTALL)
    # Pass completion
    pct = re.search(r'(\d+)\s*%\s+Pass Completion\s*%\s+(\d+)\s*%', text)
    # Completed line breaks
    lb  = re.search(r'(\d+)\s+Completed Line Breaks\s+(\d+)', text)
    # Defensive line breaks
    dlb = re.search(r'(\d+)\s+Defensive Line Breaks\s+(\d+)', text)
    # Final third receptions
    ftr = re.search(r'(\d+)\s+Receptions in the Final Third\s+(\d+)', text)
    # Crosses
    crs = re.search(r'(\d+)\s+Crosses\s+(\d+)', text)
    # Ball progressions
    bp  = re.search(r'(\d+)\s+Ball Progressions\s+(\d+)', text)
    # Defensive pressures
    dpr = re.search(r'(\d+)\s*\((\d+)\)\s+Defensive Pressures Applied.*?(\d+)\s*\((\d+)\)', text, re.DOTALL)
    # Forced turnovers
    fto = re.search(r'(\d+)\s+Forced Turnovers\s+(\d+)', text)
    # Second balls
    sb  = re.search(r'(\d+)\s+Second Balls\s+(\d+)', text)
    # Total distance
    dst = re.search(r'([\d.]+)\s+km\s+Total Distance Covered\s+([\d.]+)\s+km', text)

    return {
        'xg_home':            _g(xg, 1),  'xg_away':            _g(xg, 2),
        'goals_home':         _g(gls, 1), 'goals_away':         _g(gls, 2),
        'att_home':           _g(att, 1), 'att_away':           _g(att, 3),
        'att_ot_home':        _g(att, 2), 'att_ot_away':        _g(att, 4),
        'passes_att_home':    _g(pas, 1), 'passes_att_away':    _g(pas, 3),
        'passes_comp_home':   _g(pas, 2), 'passes_comp_away':   _g(pas, 4),
        'pass_pct_home':      _g(pct, 1), 'pass_pct_away':      _g(pct, 2),
        'lb_home':            _g(lb, 1),  'lb_away':            _g(lb, 2),
        'def_lb_home':        _g(dlb, 1), 'def_lb_away':        _g(dlb, 2),
        'final_third_home':   _g(ftr, 1), 'final_third_away':   _g(ftr, 2),
        'crosses_home':       _g(crs, 1), 'crosses_away':       _g(crs, 2),
        'ball_prog_home':     _g(bp, 1),  'ball_prog_away':     _g(bp, 2),
        'pressures_home':     _g(dpr, 1), 'pressures_away':     _g(dpr, 3),
        'direct_press_home':  _g(dpr, 2), 'direct_press_away':  _g(dpr, 4),
        'forced_to_home':     _g(fto, 1), 'forced_to_away':     _g(fto, 2),
        'second_balls_home':  _g(sb, 1),  'second_balls_away':  _g(sb, 2),
        'distance_home':      _g(dst, 1), 'distance_away':      _g(dst, 2),
    }


def _team_from_text(text, home, away):
    """Guess which team a page belongs to based on text content."""
    text_l = text.lower()
    h_score = sum(1 for w in home.lower().split() if w and w in text_l)
    a_score = sum(1 for w in away.lower().split() if w and w in text_l)
    if h_score > a_score:
        return home
    if a_score > h_score:
        return away
    return None


def parse_player_distributions(pages, home, away):
    """Extract per-player in-possession distribution stats."""
    rows = []
    for idx in find_all_page_idx(pages, 'In Possession - Distributions'):
        text = page_text(pages[idx])
        team = _team_from_text(text, home, away)
        for m in DIST_RE.finditer(text):
            jersey = int(m.group(1))
            name   = m.group(2).strip()
            vals   = [m.group(i) for i in range(3, 17)]  # groups 3-16 → 14 stats
            row = {'team': team, 'jersey': jersey, 'player': name}
            for col, val in zip(DIST_COLS, vals):
                row[col] = float(val.rstrip('%')) if val is not None else None
            rows.append(row)
    return rows


def parse_player_offers(pages, home, away):
    """Extract per-player in-possession offers & receptions stats."""
    rows = []
    for idx in find_all_page_idx(pages, 'In Possession - Offers'):
        text = page_text(pages[idx])
        team = _team_from_text(text, home, away)
        for m in OFFERS_RE.finditer(text):
            jersey = int(m.group(1))
            name   = m.group(2).strip()
            vals   = [m.group(i) for i in range(3, 11)]  # 8 values
            row = {'team': team, 'jersey': jersey, 'player': name}
            for col, val in zip(OFFERS_COLS, vals):
                row[col] = int(val) if val is not None else None
            rows.append(row)
    return rows


def parse_player_defense(pages, home, away):
    """Extract per-player out-of-possession stats."""
    rows = []
    data_idxs = [
        i for i in find_all_page_idx(pages, 'Out of Possession')
        if DEF_RE.search(page_text(pages[i]))
    ]
    for idx in data_idxs:
        text = page_text(pages[idx])
        team = _team_from_text(text, home, away)
        for m in DEF_RE.finditer(text):
            jersey = int(m.group(1))
            name   = m.group(2).strip()
            vals   = [m.group(i) for i in range(3, 18)]  # groups 3-17 → 15 stats
            row = {'team': team, 'jersey': jersey, 'player': name}
            for col, val in zip(DEF_COLS, vals):
                row[col] = float(val) if val is not None else None
            rows.append(row)
    return rows


# ── Orchestration ────────────────────────────────────────────────────────────
def process_pdf(pdf_path, match_num, group):
    """Process one PDF. Returns (header, key_stats, dist_rows, offers_rows, def_rows)."""
    with pdfplumber.open(pdf_path) as pdf:
        pages = pdf.pages
        header    = parse_match_header(pages)
        key_stats = parse_key_stats(pages)
        home, away = header['home'], header['away']
        dist   = parse_player_distributions(pages, home, away)
        offers = parse_player_offers(pages, home, away)
        defs   = parse_player_defense(pages, home, away)

    header['match_num'] = match_num
    header['group']     = group or header.get('group', '?')

    def enrich(rows):
        ctx = {
            'match_num': match_num, 'group': header['group'],
            'date': header['date'],
            'home': home, 'away': away,
            'home_score': header['home_score'],
            'away_score': header['away_score'],
        }
        for r in rows:
            r.update(ctx)
        return rows

    return header, key_stats, enrich(dist), enrich(offers), enrich(defs)


def load_existing(path):
    """Return set of match_nums already in a CSV file."""
    if not path.exists():
        return set()
    try:
        df = pd.read_csv(path)
        return set(df['match_num'].dropna().astype(int).tolist())
    except Exception:
        return set()


def main():
    full = '--full' in sys.argv

    print(f"Fetching PDF links from hub...")
    pdf_links = get_pdf_links()
    print(f"Found {len(pdf_links)} match PDFs\n")

    if not pdf_links:
        print("No PDFs found. Check hub URL or network.")
        return

    # Already processed matches
    existing = load_existing(OUT_DIR / 'wc_matches.csv')
    if full:
        existing = set()
        print("--full: reprocessing all PDFs\n")

    all_matches    = []
    all_team_stats = []
    all_player_dist   = []
    all_player_offers = []
    all_player_def    = []

    for match_num, group, url in pdf_links:
        print(f"Match {match_num:3d} (Group {group})", end='')

        if match_num in existing and not full:
            print(" → already processed, skipping")
            continue

        try:
            pdf_path = download_pdf(url, match_num)
            header, key_stats, dist, offers, defs = process_pdf(pdf_path, match_num, group)

            home, away = header['home'], header['away']
            hs, as_ = header['home_score'], header['away_score']
            print(f" → {home} {hs}-{as_} {away}  |  {len(dist)} dist rows, {len(defs)} def rows")

            all_matches.append(header)

            if key_stats:
                ts = {
                    'match_num': match_num, 'group': header['group'],
                    'date': header['date'], 'stadium': header['stadium'],
                    'home': home, 'away': away,
                    'home_score': hs, 'away_score': as_,
                }
                ts.update(key_stats)
                all_team_stats.append(ts)

            all_player_dist.extend(dist)
            all_player_offers.extend(offers)
            all_player_def.extend(defs)

        except Exception as e:
            print(f" → ERROR: {e}")
            import traceback
            traceback.print_exc()

    # ── Save CSVs ────────────────────────────────────────────────────────────
    def append_csv(path: Path, new_rows: list, match_col='match_num'):
        if not new_rows:
            return
        df_new = pd.DataFrame(new_rows)
        if path.exists() and not full:
            df_old = pd.read_csv(path)
            # Remove rows for matches we're about to write (in case of re-run)
            new_nums = df_new[match_col].unique()
            df_old = df_old[~df_old[match_col].isin(new_nums)]
            df = pd.concat([df_old, df_new], ignore_index=True)
        else:
            df = df_new
        df.sort_values(match_col, inplace=True)
        df.to_csv(path, index=False)
        print(f"  Saved {path.name} ({len(df)} rows total)")

    print("\nSaving CSVs...")
    append_csv(OUT_DIR / 'wc_matches.csv',            all_matches)
    append_csv(OUT_DIR / 'wc_team_stats.csv',         all_team_stats)
    append_csv(OUT_DIR / 'wc_player_possession.csv',  all_player_dist)
    append_csv(OUT_DIR / 'wc_player_offers.csv',      all_player_offers)
    append_csv(OUT_DIR / 'wc_player_defense.csv',     all_player_def)

    print("\nDone.")


if __name__ == '__main__':
    main()
