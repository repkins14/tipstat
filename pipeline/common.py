import math, re, unicodedata
from scipy.stats import nbinom, poisson


def nb_over(mean, disp, line):
    """P(X > line) – negatívne binomické rozdelenie (pri disp ~ 0 Poisson)."""
    if mean <= 0:
        return 0.0
    k = int(math.floor(line))
    if disp < 1e-4:
        return float(1 - poisson.cdf(k, mean))
    n = 1 / disp
    p = n / (n + mean)
    return float(1 - nbinom.cdf(k, n, p))


def poisson_matrix(mh, ma, maxg=10):
    ph = pd = pa = btts = 0.0
    for i in range(maxg + 1):
        for j in range(maxg + 1):
            pr = poisson.pmf(i, mh) * poisson.pmf(j, ma)
            if i > j:
                ph += pr
            elif i == j:
                pd += pr
            else:
                pa += pr
            if i > 0 and j > 0:
                btts += pr
    return ph, pd, pa, btts


def slug(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()


def fmt(x):
    return str(x).replace('.', ',')


def tip(cat, label, k, n, p, ev, h2hk=None, h2hn=None):
    t = {'cat': cat, 'label': label, 'hk': int(k), 'hn': int(n), 'p': round(float(p), 3), 'ev': ev}
    if h2hn:
        t['h2h'] = [int(h2hk), int(h2hn)]
    return t


def pick_top(tips, max_p):
    for t in tips:
        t['hv'] = round(t['hk'] / t['hn'] * 100) if t['hn'] else 0
    pool = sorted([t for t in tips if t['p'] <= max_p], key=lambda t: (-t['hv'], -t['p']))
    top, per = [], {}
    for t in pool:
        if per.get(t['cat'], 0) >= 2:
            continue
        per[t['cat']] = per.get(t['cat'], 0) + 1
        top.append(t)
        if len(top) == 5:
            break
    return top, sorted(tips, key=lambda t: (-t['hv'], -t['p']))
