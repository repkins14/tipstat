"""Len pre lokálny vývoj: Premier League z verejného zrkadla a vymyslený program na najbližšie dni."""
import io, datetime as dt, urllib.request
import pandas as pd
URL = 'https://raw.githubusercontent.com/datasets/football-datasets/master/datasets/premier-league/season-{s}.csv'

def football(today):
    parts = [pd.read_csv(io.StringIO(urllib.request.urlopen(URL.format(s=s)).read().decode('utf-8', 'ignore'))) for s in ('2425', '2526')]
    d = pd.concat(parts, ignore_index=True)
    d['d'] = pd.to_datetime(d['Date']).dt.date
    shift = today - d['d'].max() - dt.timedelta(days=2)
    d['d'] = d['d'] + shift      # posunieme históriu tak, aby končila predvčerom
    d = d.sort_values('d').reset_index(drop=True)
    teams = sorted(set(d.HomeTeam.tail(40)))
    fx = []
    for i in range(0, 16, 2):
        fx.append({'Div': 'E0', 'd': today + dt.timedelta(days=i // 6), 'Time': ['15:00', '17:30', '20:00'][i % 3], 'HomeTeam': teams[i], 'AwayTeam': teams[i + 1]})
    fx.append({'Div': 'SC1', 'd': today, 'Time': '19:45', 'HomeTeam': 'Ayr', 'AwayTeam': 'Partick'})
    return {'E0': d}, pd.DataFrame(fx)
