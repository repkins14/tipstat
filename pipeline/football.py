"""Futbal – bezplatné dáta z football-data.co.uk (výsledky, štatistiky zápasov a program)."""
import io, time, datetime as dt
import pandas as pd, requests
from common import nb_over, poisson_matrix, slug, fmt, tip, pick_top

LEAGUES = {  # kód: (názov, krajina, poradie)
    'E0': ('Premier League', 'Anglicko', 1), 'SP1': ('LaLiga', 'Španielsko', 2), 'I1': ('Serie A', 'Taliansko', 3),
    'D1': ('Bundesliga', 'Nemecko', 4), 'F1': ('Ligue 1', 'Francúzsko', 5), 'N1': ('Eredivisie', 'Holandsko', 6),
    'P1': ('Liga Portugal', 'Portugalsko', 7), 'B1': ('Jupiler Pro League', 'Belgicko', 8), 'T1': ('Süper Lig', 'Turecko', 9),
    'E1': ('Championship', 'Anglicko', 10), 'SC0': ('Premiership', 'Škótsko', 11), 'G1': ('Super League', 'Grécko', 12),
    'D2': ('2. Bundesliga', 'Nemecko', 13), 'SP2': ('LaLiga 2', 'Španielsko', 14), 'I2': ('Serie B', 'Taliansko', 15),
    'F2': ('Ligue 2', 'Francúzsko', 16),
}
# kategória: (stĺpec domáci, stĺpec hostia, čiary zápas, čiary tím, jednotka)
CATS = {
    'Góly': ('FTHG', 'FTAG', [1.5, 2.5, 3.5], [0.5, 1.5], 'gólu'),
    'Góly v 1. polčase': ('HTHG', 'HTAG', [0.5, 1.5], [0.5], 'gólu v 1. polčase'),
    'Rohy': ('HC', 'AC', [8.5, 9.5, 10.5], [3.5, 4.5, 5.5], 'rohu'),
    'Strely na bránu': ('HST', 'AST', [7.5, 8.5, 9.5], [3.5, 4.5], 'strely na bránu'),
    'Žlté karty': ('HY', 'AY', [2.5, 3.5, 4.5], [1.5], 'žltej karty'),
    'Fauly': ('HF', 'AF', [20.5, 22.5, 24.5], [], 'faulu'),
}
BASE = 'https://www.football-data.co.uk/mmz4281/{s}/{c}.csv'
FIXTURES = 'https://www.football-data.co.uk/fixtures.csv'
UA = {'User-Agent': 'Mozilla/5.0 (TIPSTAT personal stats app)'}


def season_codes(today):
    y = today.year % 100
    cur = f'{y:02d}{(y + 1) % 100:02d}' if today.month >= 7 else f'{(y - 1) % 100:02d}{y:02d}'
    a = int(cur[:2])
    return [f'{(a - 1) % 100:02d}{a:02d}', cur]


def get_csv(url):
    for _ in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=40)
            if r.status_code == 200 and len(r.content) > 200:
                return pd.read_csv(io.StringIO(r.content.decode('latin-1')), on_bad_lines='skip')
        except Exception as e:
            print('  chyba', url, e)
        time.sleep(2)
    return None


def parse_date(s):
    for f in ('%d/%m/%Y', '%d/%m/%y', '%Y-%m-%d'):
        try:
            return dt.datetime.strptime(str(s).strip(), f).date()
        except Exception:
            pass
    return None


def clean_cols(d):
    d.columns = [str(c).replace('\ufeff', '').replace('ï»¿', '').strip() for c in d.columns]
    return d


def load_results(today, log):
    frames = {}
    for code in LEAGUES:
        parts = []
        for s in season_codes(today):
            d = get_csv(BASE.format(s=s, c=code))
            if d is not None:
                d = clean_cols(d)
                if 'HomeTeam' in d.columns:
                    parts.append(d)
            time.sleep(0.5)
        if not parts:
            log.append(f'Futbal {LEAGUES[code][0]}: dáta sa nepodarilo stiahnuť')
            continue
        d = pd.concat(parts, ignore_index=True)
        d['d'] = d['Date'].map(parse_date)
        d = d.dropna(subset=['d', 'FTHG', 'FTAG'])
        frames[code] = d.sort_values('d').reset_index(drop=True)
        print(f'  futbal {code}: {len(d)} zápasov')
    return frames


def load_fixtures(log):
    f = get_csv(FIXTURES)
    if f is None:
        log.append('Futbal: program zápasov sa nepodarilo stiahnuť')
        return pd.DataFrame(columns=['Div', 'd', 'HomeTeam', 'AwayTeam', 'Time'])
    f = clean_cols(f)
    f['d'] = f['Date'].map(parse_date)
    return f.dropna(subset=['d'])


def have(df, c):
    return CATS[c][0] in df.columns and CATS[c][1] in df.columns and df[CATS[c][0]].notna().sum() > 30


def to_local(date, tm):
    """football-data uvádza čas v UK – prevod na stredoeurópsky čas."""
    try:
        from zoneinfo import ZoneInfo
        h, m = str(tm).split(':')[:2]
        t = dt.datetime(date.year, date.month, date.day, int(h), int(m), tzinfo=ZoneInfo('Europe/London'))
        t = t.astimezone(ZoneInfo('Europe/Bratislava'))
        return str(t.date()), t.strftime('%H:%M')
    except Exception:
        return str(date), ''


def build(today, frames, fixtures, cfg, unknown):
    out, results = [], {}
    horizon = today + dt.timedelta(days=cfg['days_ahead'])
    for code, df in frames.items():
        lname, country, rank = LEAGUES[code]
        cats = [c for c in CATS if have(df, c)]
        disp, lg = {}, {}
        for c in cats:
            t = (df[CATS[c][0]] + df[CATS[c][1]]).dropna().astype(float)
            m, v = t.mean(), t.var()
            disp[c] = max(0.0, (v - m) / (m * m)) if m > 0 else 0.0
            lg[c] = float(t.mean())
        for _, r in df[df.d >= today - dt.timedelta(days=40)].iterrows():
            mid = slug(f'{code}-{r.d}-{r.HomeTeam}-{r.AwayTeam}')
            results[mid] = {'d': str(r.d), 'score': f'{int(r.FTHG)}:{int(r.FTAG)}',
                            'tot': {c: [float(r[CATS[c][0]]), float(r[CATS[c][1]])] for c in cats if pd.notna(r[CATS[c][0]])}}
            if r.d >= today - dt.timedelta(days=cfg['days_back']):
                d2, t2 = to_local(r.d, r.get('Time', ''))
                out.append({'id': mid, 'sport': 'Futbal', 'league': lname, 'country': country, 'rank': rank, 'date': d2, 'time': t2,
                            'home': r.HomeTeam, 'away': r.AwayTeam, 'status': 'fin', 'score': results[mid]['score']})
        fx = fixtures[fixtures['Div'] == code] if 'Div' in fixtures.columns else fixtures.iloc[0:0]
        for _, f in fx.iterrows():
            if not (today <= f.d <= horizon):
                continue
            m = analyse(df, f.HomeTeam, f.AwayTeam, cats, disp, lg, cfg)
            d2, t2 = to_local(f.d, f.get('Time', ''))
            m.update({'id': slug(f'{code}-{f.d}-{f.HomeTeam}-{f.AwayTeam}'), 'sport': 'Futbal', 'league': lname, 'country': country,
                      'rank': rank, 'date': d2, 'time': t2, 'home': f.HomeTeam, 'away': f.AwayTeam, 'status': 'upc'})
            out.append(m)
    # zápasy z programu v ligách, ktoré nevieme analyzovať
    if 'Div' in fixtures.columns:
        for _, f in fixtures[~fixtures['Div'].isin(list(frames.keys()))].iterrows():
            if today <= f.d <= horizon:
                d2, t2 = to_local(f.d, f.get('Time', ''))
                out.append({'id': slug(f'{f.Div}-{f.d}-{f.HomeTeam}-{f.AwayTeam}'), 'sport': 'Futbal', 'league': unknown.get(f.Div, f.Div),
                            'country': '', 'rank': 90, 'date': d2, 'time': t2, 'home': f.HomeTeam, 'away': f.AwayTeam,
                            'status': 'upc', 'hasData': False})
    return out, results


def analyse(df, home, away, cats, disp, lg, cfg):
    hh = df[df.HomeTeam == home].tail(10).iloc[::-1]
    aa = df[df.AwayTeam == away].tail(10).iloc[::-1]
    hall = df[(df.HomeTeam == home) | (df.AwayTeam == home)].tail(10).iloc[::-1]
    aall = df[(df.HomeTeam == away) | (df.AwayTeam == away)].tail(10).iloc[::-1]
    h2h = df[((df.HomeTeam == home) & (df.AwayTeam == away)) | ((df.HomeTeam == away) & (df.AwayTeam == home))].tail(5).iloc[::-1]
    if len(hh) < 6 or len(aa) < 6 or not cats:
        return {'hasData': False}
    tips, data, gmean = [], {}, {}
    for c in cats:
        hc, ac, lines, tlines, unit = CATS[c]
        h = hh.dropna(subset=[hc, ac]); a = aa.dropna(subset=[hc, ac])
        if len(h) < 5 or len(a) < 5:
            continue
        hv = (h[hc] + h[ac]).tolist(); av = (a[hc] + a[ac]).tolist()
        mh = (h[hc].mean() + a[hc].mean()) / 2   # domáci: ich útok doma + čo hostia dostávajú vonku
        ma = (a[ac].mean() + h[ac].mean()) / 2
        gmean[c] = (mh, ma)
        h2v = [float(r[hc] + r[ac]) for _, r in h2h.iterrows() if pd.notna(r[hc])]
        data[c] = {'unit': unit, 'hv': hv, 'av': av, 'hOwn': h[hc].tolist(), 'aOwn': a[ac].tolist(), 'hAg': h[ac].tolist(),
                   'aAg': a[hc].tolist(), 'h2h': h2v, 'mh': round(mh, 3), 'ma': round(ma, 3), 'disp': round(disp[c], 4),
                   'lg': round(lg[c], 2), 'line': lines[len(lines) // 2]}
        for L in lines:
            k = sum(v > L for v in hv) + sum(v > L for v in av)
            tips.append(tip(c, f'{fmt(L)}+ {unit}', k, len(hv) + len(av), nb_over(mh + ma, disp[c], L),
                            {'k': 'tot', 'c': c, 'l': L}, sum(v > L for v in h2v), len(h2v)))
        for L in tlines:
            tips.append(tip(c, f'{home} {fmt(L)}+ {unit}', sum(v > L for v in h[hc]), len(h), nb_over(mh, disp[c] * 1.3, L), {'k': 'home', 'c': c, 'l': L}))
            tips.append(tip(c, f'{away} {fmt(L)}+ {unit}', sum(v > L for v in a[ac]), len(a), nb_over(ma, disp[c] * 1.3, L), {'k': 'away', 'c': c, 'l': L}))
    probs = None
    if 'Góly' in gmean:
        mh, ma = gmean['Góly']
        ph, pdr, pa, btts = poisson_matrix(mh, ma)
        probs = {'h': round(ph * 100), 'd': round(pdr * 100), 'a': round(pa * 100)}
        both = lambda rows: sum(1 for _, r in rows.iterrows() if r.FTHG > 0 and r.FTAG > 0)
        tips.append(tip('Góly', 'Obaja dajú gól', both(hh) + both(aa), len(hh) + len(aa), btts, {'k': 'btts'}, both(h2h), len(h2h)))
    top, allt = pick_top(tips, cfg['max_p'])

    def form(rows, team):
        f = []
        for _, r in rows.iterrows():
            gh, ga = int(r.FTHG), int(r.FTAG)
            home_ = r.HomeTeam == team
            own, opp = (gh, ga) if home_ else (ga, gh)
            f.append(['V' if own > opp else ('R' if own == opp else 'P'), f'{own}:{opp}', r.AwayTeam if home_ else r.HomeTeam, str(r.d), 'D' if home_ else 'V'])
        return f
    return {'hasData': True, 'probs': probs, 'top': top, 'tips': allt, 'data': data,
            'form': {'h': form(hall, home), 'a': form(aall, away)},
            'h2h': [[str(r.d), r.HomeTeam, r.AwayTeam, f'{int(r.FTHG)}:{int(r.FTAG)}'] for _, r in h2h.iterrows()]}
