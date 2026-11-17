"""Spoločná analýza pre športy, kde máme zoznam zápasov s hodnotami (NHL, NBA)."""
from statistics import mean, pvariance
from common import nb_over, poisson_matrix, fmt, tip, pick_top


def league_params(games, cats):
    disp, lg = {}, {}
    for c in cats:
        t = [g['v'][c][0] + g['v'][c][1] for g in games if c in g['v']]
        if len(t) < 20:
            continue
        m, v = mean(t), pvariance(t)
        disp[c] = max(0.0, (v - m) / (m * m)) if m > 0 else 0.0
        lg[c] = m
    return disp, lg


def analyse(games, home, away, cats, disp, lg, cfg, score_cat):
    """games: [{'date','home','away','score':'3:2','v':{cat:[h,a]}}], zoradené od najstaršieho."""
    hh = [g for g in games if g['home'] == home][-10:][::-1]
    aa = [g for g in games if g['away'] == away][-10:][::-1]
    hall = [g for g in games if home in (g['home'], g['away'])][-10:][::-1]
    aall = [g for g in games if away in (g['home'], g['away'])][-10:][::-1]
    h2h = [g for g in games if {g['home'], g['away']} == {home, away}][-5:][::-1]
    if len(hh) < 6 or len(aa) < 6:
        return {'hasData': False}
    tips, data, gmean = [], {}, {}
    for c, (lines, tlines, unit) in cats.items():
        if c not in disp:
            continue
        h = [g for g in hh if c in g['v']]
        a = [g for g in aa if c in g['v']]
        if len(h) < 5 or len(a) < 5:
            continue
        hv = [g['v'][c][0] + g['v'][c][1] for g in h]
        av = [g['v'][c][0] + g['v'][c][1] for g in a]
        hOwn = [g['v'][c][0] for g in h]; hAg = [g['v'][c][1] for g in h]
        aOwn = [g['v'][c][1] for g in a]; aAg = [g['v'][c][0] for g in a]
        mh = (mean(hOwn) + mean(aAg)) / 2
        ma = (mean(aOwn) + mean(hAg)) / 2
        gmean[c] = (mh, ma)
        h2v = [g['v'][c][0] + g['v'][c][1] for g in h2h if c in g['v']]
        data[c] = {'unit': unit, 'hv': hv, 'av': av, 'hOwn': hOwn, 'aOwn': aOwn, 'hAg': hAg, 'aAg': aAg, 'h2h': h2v,
                   'mh': round(mh, 3), 'ma': round(ma, 3), 'disp': round(disp[c], 4), 'lg': round(lg[c], 2), 'line': lines[len(lines) // 2]}
        for L in lines:
            k = sum(v > L for v in hv) + sum(v > L for v in av)
            tips.append(tip(c, f'{fmt(L)}+ {unit}', k, len(hv) + len(av), nb_over(mh + ma, disp[c], L),
                            {'k': 'tot', 'c': c, 'l': L}, sum(v > L for v in h2v), len(h2v)))
        for L in tlines:
            tips.append(tip(c, f'{home} {fmt(L)}+ {unit}', sum(v > L for v in hOwn), len(hOwn), nb_over(mh, disp[c] * 1.3, L), {'k': 'home', 'c': c, 'l': L}))
            tips.append(tip(c, f'{away} {fmt(L)}+ {unit}', sum(v > L for v in aOwn), len(aOwn), nb_over(ma, disp[c] * 1.3, L), {'k': 'away', 'c': c, 'l': L}))
    probs = None
    if score_cat in gmean:
        mh, ma = gmean[score_cat]
        ph, pd, pa, _ = poisson_matrix(mh, ma, 15)
        probs = {'h': round(ph * 100), 'd': round(pd * 100), 'a': round(pa * 100)}
    top, allt = pick_top(tips, cfg['max_p'])

    def form(rows, team):
        f = []
        for g in rows:
            x, y = [int(s) for s in g['score'].split(':')]
            home_ = g['home'] == team
            own, opp = (x, y) if home_ else (y, x)
            res = 'V' if own > opp else ('R' if own == opp else 'P')
            if g.get('ot') and res == 'P':
                res = 'R'   # prehra po predĺžení
            f.append([res, f'{own}:{opp}', g['away'] if home_ else g['home'], g['date'], 'D' if home_ else 'V'])
        return f
    return {'hasData': True, 'probs': probs, 'top': top, 'tips': allt, 'data': data,
            'form': {'h': form(hall, home), 'a': form(aall, away)},
            'h2h': [[g['date'], g['home'], g['away'], g['score']] for g in h2h]}
