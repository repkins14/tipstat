"""TIPSTAT – denná aktualizácia dát. Spúšťa ju automaticky GitHub Actions.

python pipeline/update.py          … ostré dáta
python pipeline/update.py --demo   … lokálny test bez internetu na zdroje (len vývoj)
"""
import json, os, sys, datetime as dt, traceback
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(__file__))
import football, nhl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'data')
CFG = {'days_ahead': 6, 'days_back': 3, 'max_p': 0.80}
UNKNOWN = {'SC1': 'Championship (Škótsko)', 'E2': 'League One', 'E3': 'League Two', 'EC': 'National League'}


def jload(p, default):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return default


def evaluate(ev, res):
    try:
        if ev['k'] == 'btts':
            a, b = [int(x) for x in res['score'].split(':')]
            return a > 0 and b > 0
        v = res['tot'][ev['c']]
        x = v[0] + v[1] if ev['k'] == 'tot' else (v[0] if ev['k'] == 'home' else v[1])
        return x > ev['l']
    except Exception:
        return None


def main(demo=False):
    os.makedirs(OUT, exist_ok=True)
    now = dt.datetime.now(ZoneInfo('Europe/Bratislava'))
    today = now.date()
    log, matches, results = [], [], jload(os.path.join(OUT, 'results.json'), {})
    # ---------- futbal
    try:
        if demo:
            import demo as dm
            frames, fixtures = dm.football(today)
        else:
            frames = football.load_results(today, log)
            fixtures = football.load_fixtures(log)
        m, r = football.build(today, frames, fixtures, CFG, UNKNOWN)
        matches += m; results.update(r)
    except Exception:
        traceback.print_exc(); log.append('Futbal: chyba pri spracovaní')
    # ---------- hokej
    if not demo:
        try:
            m, r = nhl.run(today, CFG, log)
            matches += m; results.update(r)
        except Exception:
            traceback.print_exc(); log.append('Hokej: chyba pri spracovaní')
    # ---------- archív predpovedí a vyhodnotenie dohraných
    preds = jload(os.path.join(OUT, 'predictions.json'), {})
    for mt in matches:
        if mt['status'] == 'upc' and mt.get('top'):
            preds[mt['id']] = {'d': mt['date'], 'tips': [{'label': t['label'], 'cat': t['cat'], 'ev': t['ev'], 'hv': t['hv']} for t in mt['top']]}
    for mt in matches:
        if mt['status'] == 'fin' and mt['id'] in preds and mt['id'] in results:
            mt['topEval'] = [{**t, 'ok': evaluate(t['ev'], results[mt['id']])} for t in preds[mt['id']]['tips']]
    cutoff = str(today - dt.timedelta(days=120))
    keep = {k: v for k, v in results.items() if v.get('d', '9999') >= cutoff}
    preds = {k: v for k, v in preds.items() if v.get('d', '9999') >= cutoff}
    app = {'updated': now.strftime('%Y-%m-%d %H:%M'), 'log': log, 'matches': sorted(matches, key=lambda x: (x['date'], x['time'] or '99', x['rank']))}
    json.dump(app, open(os.path.join(OUT, 'app.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(keep, open(os.path.join(OUT, 'results.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(preds, open(os.path.join(OUT, 'predictions.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    up = sum(1 for x in matches if x['status'] == 'upc')
    print(f'Hotovo: {len(matches)} zápasov ({up} nadchádzajúcich), poznámky: {log}')


if __name__ == '__main__':
    main(demo='--demo' in sys.argv)
