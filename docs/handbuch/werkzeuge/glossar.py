#!/usr/bin/env python3
"""
Seite „Begriffe“ im Benutzerhandbuch (#276) aus docs/glossar.yml.

    python3 docs/handbuch/werkzeuge/glossar.py            # schreibt benutzer/docs/begriffe.md
    python3 docs/handbuch/werkzeuge/glossar.py --pruefen  # meldet Fehler im Glossar, schreibt nichts

Die Seite ist eingecheckt, damit das Handbuch auch lokal vollständig ist; die CI erzeugt sie vor dem Bauen neu.
"""
import re, sys, unicodedata
from pathlib import Path

import yaml

WURZEL = Path(__file__).resolve().parents[3]
QUELLE = WURZEL / 'docs' / 'glossar.yml'
ZIEL = WURZEL / 'docs' / 'handbuch' / 'benutzer' / 'docs' / 'begriffe.md'

BEREICHE = {
    'grundbegriffe': 'Grundbegriffe',
    'ablage': 'Arbeiten in der Ablage',
    'werkbank': 'Verwaltung (Werkbank)',
    'betrieb': 'Betrieb und Sicherheit',
}
EINSTEIGER = {
    'alltag': ('✓', 'Alltagswort'),
    'erklaeren': ('~', 'mit Erklärung'),
    'fachwort': ('✗', 'Fachwort'),
}
BEGEGNET = {'alle': 'alle', 'admin': 'Administratoren', 'fortgeschritten': 'Fortgeschrittene'}


def datum(iso) -> str:
    j, m, t = str(iso).split('-')
    return f'{int(t)}.{int(m)}.{j}'


def anker(text: str) -> str:
    """Wie mkdocs: Kleinbuchstaben, Umlaute ohne Punkte (ü → u), Rest zu Bindestrichen."""
    t = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def lies() -> dict:
    return yaml.safe_load(QUELLE.read_text(encoding='utf-8'))


def offen(g: dict) -> list[dict]:
    return [k for k in g.get('konflikte', []) if not k.get('entschieden')]


def entschieden(g: dict) -> list[dict]:
    return [k for k in g.get('konflikte', []) if k.get('entschieden')]


def pruefe(g: dict) -> list[str]:
    fehler, namen = [], set()
    nummern = {k['nr'] for k in offen(g)}
    for b in g['begriffe']:
        n = b.get('begriff', '?')
        if n in namen:
            fehler.append(f'{n}: doppelt')
        namen.add(n)
        for feld in ('bereich', 'beschreibung', 'einsteiger', 'begegnet'):
            if not b.get(feld):
                fehler.append(f'{n}: „{feld}“ fehlt')
        if b.get('bereich') not in BEREICHE:
            fehler.append(f'{n}: unbekannter Bereich {b.get("bereich")}')
        if b.get('einsteiger') not in EINSTEIGER:
            fehler.append(f'{n}: unbekannte Einstufung {b.get("einsteiger")}')
        if b.get('begegnet') not in BEGEGNET:
            fehler.append(f'{n}: unbekanntes „begegnet“ {b.get("begegnet")}')
        for k in b.get('konflikt', []):
            if k not in nummern:
                fehler.append(f'{n}: offene Frage {k} gibt es nicht (oder sie ist schon entschieden)')
    for b in g['begriffe']:
        for v in b.get('verwandt', []):
            if v not in namen:
                fehler.append(f'{b["begriff"]}: verwandter Begriff „{v}“ steht nicht im Glossar')
    return fehler


def seite(g: dict) -> str:
    namen = {b['begriff'] for b in g['begriffe']}
    z = [
        '# Begriffe',
        '',
        '<!-- Erzeugt aus docs/glossar.yml mit docs/handbuch/werkzeuge/glossar.py – bitte dort ändern. -->',
        '',
        'Hier steht, was die Wörter im DMS bedeuten. Oberfläche, Handbücher und Meldungen verwenden sie genau so.',
        '',
        'Hinter jedem Begriff steht, wie gut ihn jemand versteht, der zum ersten Mal mit einem DMS arbeitet:',
        '',
        '- **✓ Alltagswort**: versteht man sofort.',
        '- **~ mit Erklärung**: Die Oberfläche erklärt es kurz, zum Beispiel mit **?**.',
        '- **✗ Fachwort**: Dafür gibt es kein besseres Wort, oder es betrifft nur Fortgeschrittene.',
        '',
        'Außerdem steht dort, wer dem Begriff begegnet: alle, nur Administratoren oder nur Fortgeschrittene (Expertenmodus, Technik).',
        '',
    ]
    for schluessel, titel in BEREICHE.items():
        z += [f'## {titel}', '']
        for b in sorted((b for b in g['begriffe'] if b['bereich'] == schluessel), key=lambda b: b['begriff'].lower()):
            zeichen, wort = EINSTEIGER[b['einsteiger']]
            kopf = f'<a id="{anker(b["begriff"])}"></a>**{b["begriff"]}**'
            z.append(f'{kopf} · {zeichen} {wort} · {BEGEGNET[b["begegnet"]]}  ')
            text = b['beschreibung'].strip()
            if b.get('profile'):
                text += ' Je nach Einrichtung heißt es „' + '“ oder „'.join(b['profile'].values()) + '“.'
            z.append(text + ('  ' if b.get('verwandt') or b.get('konflikt') else ''))
            extra = []
            if b.get('verwandt'):
                extra.append('Siehe auch: ' + ', '.join(f'[{v}](#{anker(v)})' for v in b['verwandt'] if v in namen) + '.')
            if b.get('konflikt'):
                extra.append('Noch offen: ' + ', '.join(f'[Frage {k}](#offen-{k})' for k in b['konflikt']) + '.')
            if extra:
                z.append(' '.join(extra))
            z.append('')
    z += [
        '## Noch offen',
        '',
        'Manche Wörter stehen für mehr als eine Sache oder klingen zu ähnlich. Das wollen wir nach und nach klären. Bis dahin gelten die Begriffe oben.',
        '',
    ]
    for k in offen(g):
        z.append(f'<a id="offen-{k["nr"]}"></a>**{k["nr"]}. {k["titel"]}**  ')
        z.append(f'Vorschlag: {k["vorschlag"]}')
        z.append('')
    if entschieden(g):
        z += [
            '## Entschieden',
            '',
            'Diese Fragen sind geklärt. Die alten Wörter stehen unten unter „nicht verwenden“.',
            '',
        ]
        for k in entschieden(g):
            z.append(f'<a id="offen-{k["nr"]}"></a>**{k["nr"]}. {k["titel"]}** ({datum(k["entschieden"])})  ')
            z.append(k['entscheidung'])
            z.append('')
    z += [
        '## Für alle, die Texte schreiben',
        '',
        'Wer Oberfläche, Handbuch, Hilfetexte oder Release-Notizen schreibt, verwendet die Begriffe oben und nicht die Wörter in der Spalte „nicht verwenden“. Neue Begriffe kommen mit dem Release ins Glossar: [`docs/glossar.yml`](https://github.com/motom001/dms/blob/main/docs/glossar.yml).',
        '',
        '| Begriff | nicht verwenden | im Code |',
        '|---|---|---|',
    ]
    for b in sorted(g['begriffe'], key=lambda b: b['begriff'].lower()):
        if b.get('nicht_verwenden') or b.get('code'):
            nv = ', '.join(b.get('nicht_verwenden', [])) or '–'
            code = f'`{b["code"]}`' if b.get('code') else '–'
            z.append(f'| {b["begriff"]} | {nv} | {code} |')
    z += ['', f'*Stand: {g["stand"]}*' if isinstance(g.get('stand'), str) else '', '']
    return '\n'.join(z)


def main():
    g = lies()
    fehler = pruefe(g)
    if fehler:
        print('Fehler im Glossar:', *fehler, sep='\n  ')
        sys.exit(1)
    if '--pruefen' in sys.argv:
        print(f'Glossar in Ordnung: {len(g["begriffe"])} Begriffe, {len(offen(g))} offene Fragen, {len(entschieden(g))} entschieden')
        return
    ZIEL.write_text(seite(g), encoding='utf-8')
    print(f'Geschrieben: {ZIEL.relative_to(WURZEL)}')


if __name__ == '__main__':
    main()
