"""Hokej – oficiálne bezplatné API NHL (api-web.nhle.com)."""
import json, os, time, datetime as dt
import requests
from zoneinfo import ZoneInfo
from common import slug
import generic

API = 'https://api-web.nhle.com/v1'
CACHE = os.path.join(os.path.dirname(__file__), 'cache', 'nhl.json')
CATS = {  # kategória: (čiary zápas, čiary tím, jednotka)
    'Góly': ([4.5, 5.5, 6.5], [2.5, 3.5], 'gólu'),
    'Góly v 1. tretine': ([0.5, 1.5], [0.5], 'gólu v 1. tretine'),
    'Strely na bránu': ([57.5, 60.5, 63.5], [29.5, 32.5], 'strely na bránu'),
    'Trestné minúty': ([12.5, 16.5], [], 'trestnej minúty'),
}
TZ = ZoneInfo('Europe/Bratislava')


def get(path):
    for _ in range(3):
        try:
            r = requests.get(API + path, timeout=30, headers={'User-Agent': 'Mozilla/5.0 (TIPSTAT)'})
            if r.status_code == 200:
                return r.json()
        except Exception as e:
            print('  chyba', path, e)
        time.sleep(2)
    return None


def name(t):
    pl = (t.get('placeName') or {}).get('default', '')
    cn = (t.get('commonName') or {}).get('default', '')
    return (pl + ' ' + cn).strip() or t.get('abbrev', '?')


def local(utc):
    t = dt.datetime.fromisoformat(utc.replace('Z', '+00:00')).astimezone(TZ)
    return str(t.date()), t.strftime('%H:%M')


def game_stats(gid, cache):
    key = str(gid)
    if key in cache:
        return cache[key]
    box = get(f'/gamecenter/{gid}/boxscore')
    land = get(f'/gamecenter/{gid}/landing')
    if not box:
        return None
    s = {}
    try:
        s['sog'] = [int(box['homeTeam']['sog']), int(box['awayTeam']['sog'])]
    except Exception:
        pass
    try:
        pim = []
        for side in ('homeTeam', 'awayTeam'):
            p = box['playerByGameStats'][side]
            pim.append(sum(int(x.get('pim', 0) or 0) for grp in ('forwards', 'defense', 'goalies') for x in p.get(grp, [])))
        s['pim'] = pim
    except Exception:
        pass
    try:
        ha = box['homeTeam']['abbrev']
        p1 = [0, 0]
        for per in land['summary']['scoring']:
            if per['periodDescriptor']['number'] == 1:
                for g in per.get('goals', []):
                    ab = (g.get('teamAbbrev') or {}).get('default') if isinstance(g.get('teamAbbrev'), dict) else g.get('teamAbbrev')
                    p1[0 if ab == ha else 1] += 1
        s['p1'] = p1
    except Exception:
        pass
    cache[key] = s
    time.sleep(0.25)
    return s


def run(today, cfg, log):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    sched = []
    for off in (0, 7):
        d = get(f'/schedule/{today + dt.timedelta(days=off)}')
        if d:
            for w in d.get('gameWeek', []):
                sched += w.get('games', [])
    prev = get(f'/schedule/{today - dt.timedelta(days=cfg["days_back"] + 1)}')
    if prev:
        for w in prev.get('gameWeek', []):
            sched += w.get('games', [])
    if not sched:
        log.append('Hokej NHL: program zápasov sa nepodarilo stiahnuť')
        return [], {}
    teams = {}
    for g in sched:
        for side in ('homeTeam', 'awayTeam'):
            teams[g[side]['abbrev']] = name(g[side])
    games, seen = [], set()
    for ab in teams:
        d = get(f'/club-schedule-season/{ab}/now')
        if not d:
            continue
        for g in d.get('games', []):
            if g.get('gameType') != 2 or g.get('gameState') not in ('OFF', 'FINAL') or g['id'] in seen:
                continue
            seen.add(g['id'])
            st = game_stats(g['id'], cache) or {}
            hs, as_ = g['homeTeam'].get('score'), g['awayTeam'].get('score')
            if hs is None:
                continue
            v = {'Góly': [hs, as_]}
            if 'p1' in st: v['Góly v 1. tretine'] = st['p1']
            if 'sog' in st: v['Strely na bránu'] = st['sog']
            if 'pim' in st: v['Trestné minúty'] = st['pim']
            date, _ = local(g['startTimeUTC'])
            games.append({'id': g['id'], 'date': date, 'home': name(g['homeTeam']), 'away': name(g['awayTeam']),
                          'score': f'{hs}:{as_}', 'ot': (g.get('gameOutcome') or {}).get('lastPeriodType') in ('OT', 'SO'), 'v': v})
        time.sleep(0.2)
    json.dump(cache, open(CACHE, 'w'))
    games.sort(key=lambda g: g['date'])
    disp, lg = generic.league_params(games, CATS)
    out, results = [], {}
    for g in games:
        if g['date'] >= str(today - dt.timedelta(days=40)):
            mid = slug(f'nhl-{g["id"]}')
            results[mid] = {'d': g['date'], 'score': g['score'], 'tot': g['v']}
    horizon = str(today + dt.timedelta(days=cfg['days_ahead']))
    done = set()
    for g in sched:
        if g.get('gameType') != 2 or g['id'] in done:
            continue
        done.add(g['id'])
        date, tm = local(g['startTimeUTC'])
        mid = slug(f'nhl-{g["id"]}')
        base = {'id': mid, 'sport': 'Hokej', 'league': 'NHL', 'country': 'USA', 'rank': 1, 'date': date, 'time': tm,
                'home': name(g['homeTeam']), 'away': name(g['awayTeam'])}
        if g.get('gameState') in ('OFF', 'FINAL'):
            if date >= str(today - dt.timedelta(days=cfg['days_back'])) and mid in results:
                out.append({**base, 'status': 'fin', 'score': results[mid]['score']})
        elif str(today) <= date <= horizon:
            m = generic.analyse(games, base['home'], base['away'], CATS, disp, lg, cfg, 'Góly')
            out.append({**m, **base, 'status': 'upc'})
    print(f'  NHL: {len(games)} odohraných zápasov, {len(out)} v appke')
    return out, results
