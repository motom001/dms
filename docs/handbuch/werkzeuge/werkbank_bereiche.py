#!/usr/bin/env python3
"""
Tabellen der Werkbank-Bereiche im Administratorhandbuch aus der Liste der Werkbank-Seiten in
shared/src/werkbankansicht.ts (#296, #1281) und den Namen in den Sprachdateien shared/src/sprachen/de/werkbank/*.json
(#473, #354; seit #1279 je Bereich geteilt). Die Handbuchseite je Bereich kommt aus seiner Hilfestelle (`hilfe` in der
Liste, Seite und Anker in shared/src/hilfe.ts).

    python3 docs/handbuch/werkzeuge/werkbank_bereiche.py            # schreibt admin/docs/uebersicht.md
    python3 docs/handbuch/werkzeuge/werkbank_bereiche.py --pruefen  # Fehler, wenn die Seite veraltet ist

Englisch (#730): admin/docs-en/uebersicht.md trägt dieselben Marker; die Texte stehen in
shared/src/sprachen/en/werkbank/*.json (#729), das Werkzeug schreibt und prüft auch sie.

Ersetzt in uebersicht.md die Abschnitte zwischen den Markern
  <!-- bereiche:gruppen -->        … <!-- /bereiche:gruppen -->        Gruppen und ihre Bereiche
  <!-- bereiche:stufen -->         … <!-- /bereiche:stufen -->         welche Stufe welchen Bereich zeigt (#987)
  <!-- bereiche:wofuer -->         … <!-- /bereiche:wofuer -->         Wofür man welchen Bereich braucht
So bleibt das Handbuch beim Ändern der Bereiche oder einer späteren Neugruppierung an einer Stelle aktuell.
"""
import json, re, sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[3]
QUELLE = WURZEL / 'shared' / 'src' / 'werkbankansicht.ts'
# Bereich „werkbank“ der Sprachdateien: ein Ordner mit Teildateien (#1279), zusammen ein Bereich.
TEXTE = WURZEL / 'shared' / 'src' / 'sprachen' / 'de' / 'werkbank'
ZIEL = WURZEL / 'docs' / 'handbuch' / 'admin' / 'docs' / 'uebersicht.md'
# Je Sprache: Sprachdatei, Seite und die festen Wörter der Tabellen.
# „bedingt“: Bereiche, die nur unter einer Bedingung in der Leiste stehen.
SPRACHEN = {
    'de': {'texte': TEXTE, 'ziel': ZIEL,
           'bereich': 'Bereich', 'anzahl': 'Anzahl', 'ab': 'ab {v}', 'nur': 'nur {v}',
           'kopf_gruppen': '| Gruppe | Bereiche |', 'kopf_wofuer': '| Bereich | Wofür | Stufe |',
           'bedingt': {'aufbewahrung': 'nur mit Archivmodus', 'eingangsordner': 'nur wenn der Ordner eingebunden ist'}},
    'en': {'texte': WURZEL / 'shared' / 'src' / 'sprachen' / 'en' / 'werkbank',
           'ziel': WURZEL / 'docs' / 'handbuch' / 'admin' / 'docs-en' / 'uebersicht.md',
           'bereich': 'Area', 'anzahl': 'Number', 'ab': 'from {v}', 'nur': '{v} only',
           'kopf_gruppen': '| Group | Areas |', 'kopf_wofuer': '| Area | What for | Level |',
           'bedingt': {'aufbewahrung': 'only with archive mode', 'eingangsordner': 'only if the folder is mounted'}},
}

HILFE = WURZEL / 'shared' / 'src' / 'hilfe.ts'
# Stufen der Werkbank (#987), aufsteigend; Kürzel wie in werkbankansicht.ts.
STUFEN = ['einsteiger', 'haushalt', 'selbstaendig', 'organisation', 'alles']
KUERZEL = {'E': 'einsteiger', 'H': 'haushalt', 'S': 'selbstaendig', 'B': 'organisation', 'A': 'alles'}


def lies_texte(ordner):
    """Alle Teildateien des Bereichs zusammen; ein Schlüssel in zwei Dateien ist ein Fehler."""
    texte = {}
    for datei in sorted(ordner.glob('*.json')):
        for k, v in json.loads(datei.read_text(encoding='utf-8')).items():
            if k in texte:
                sys.exit(f'werkbank_bereiche.py: Schlüssel {k} doppelt in {ordner.relative_to(WURZEL)}')
            texte[k] = v
    if not texte:
        sys.exit(f'werkbank_bereiche.py: keine Texte in {ordner.relative_to(WURZEL)}')
    return texte


def hilfeseiten():
    """Hilfestellen des Administratorhandbuchs aus hilfe.ts: Schlüssel → Seite mit Anker (z. B. „suche.md#gleichbedeutende-worter“)."""
    seiten = {}
    for k, seite, anker in re.findall(r"^  '([\w.]+)': admin\('([\w-]+)/', '[^']*'(?:, '([\w-]+)')?\),?$", HILFE.read_text(encoding='utf-8'), re.M):
        seiten[k] = f'{seite}.md' + (f'#{anker}' if anker else '')
    return seiten


def lies(sp=SPRACHEN['de']):
    ts = QUELLE.read_text(encoding='utf-8')
    hilfe = hilfeseiten()
    texte = lies_texte(sp['texte'])
    folge = re.findall(r"'(\w+)'", re.search(r'const GRUPPENFOLGE = \[([^\]]*)\]', ts).group(1))
    gruppen = {g: texte[f'gruppe.{g}'] for g in folge}
    bereiche = []
    # Namen der Stufen und der Übersicht aus der Sprachdatei (für die Matrix).
    sp['texte_stufen'] = {**{v: texte[f'vorlage.{v}.name'] for v in STUFEN}, 'uebersicht': texte['bereich.uebersicht.name']}
    liste = re.search(r'const EINTRAEGE = \[(.*?)\] as const', ts, re.S).group(1)
    for pfad, felder in re.findall(r"\{\s*pfad: '(\w+)',([^}]*)\}", liste):
        f = dict(re.findall(r"(\w+): '?([\w.]+)'?", felder))
        # Umgezogen auf die Seite eines mitgelieferten Anbieters (#1570): kein Eintrag der Leiste mehr.
        if 'anbieter' in f:
            continue
        bereiche.append({'pfad': pfad, 'gruppe': f.get('gruppe'), 'name': texte[f'bereich.{pfad}.name'], 'ab': KUERZEL[f['ab']],
                         'wann': texte[f'bereich.{pfad}.wann'], 'seite': hilfe.get(f.get('hilfe'))})
    if not bereiche or any(not b['seite'] for b in bereiche) or any(b['gruppe'] not in gruppen for b in bereiche):
        fehlt = [b['pfad'] for b in bereiche if not b['seite'] or b['gruppe'] not in gruppen]
        sys.exit(f'werkbank_bereiche.py: Bereiche nicht gelesen, ohne Handbuchseite (hilfe) oder ohne Gruppe: {fehlt}')
    return gruppen, bereiche


def verweis(b, sp=SPRACHEN['de']):
    zusatz = f' ({sp["bedingt"][b["pfad"]]})' if b['pfad'] in sp['bedingt'] else ''
    return f'[{b["name"]}]({b["seite"]}){zusatz}'


def bloecke(gruppen, bereiche, sp=SPRACHEN['de']):
    z = [sp['kopf_gruppen'], '| --- | --- |']
    for g, titel in gruppen.items():
        z.append(f'| **{titel}** | ' + ', '.join(verweis(b, sp) for b in bereiche if b['gruppe'] == g) + ' |')
    gr = '\n'.join(z)
    namen = {v: sp['texte_stufen'][v] for v in STUFEN}
    z = ['| ' + sp['bereich'] + ' | ' + ' | '.join(namen[v] for v in STUFEN) + ' |', '| --- |' + ' :-: |' * len(STUFEN)]
    z.append(f'| {sp["texte_stufen"]["uebersicht"]} |' + ' ● |' * len(STUFEN))
    for b in bereiche:
        z.append(f'| [{b["name"]}]({b["seite"]}) |' + ''.join(' ● |' if STUFEN.index(v) >= STUFEN.index(b['ab']) else '   |' for v in STUFEN))
    z.append(f'| **{sp["anzahl"]}** |' + ''.join(f' **{1 + sum(STUFEN.index(v) >= STUFEN.index(b["ab"]) for b in bereiche)}** |' for v in STUFEN))
    stufen = '\n'.join(z)
    z = [sp['kopf_wofuer'], '| --- | --- | --- |']
    for b in bereiche:
        wann = b['wann'][0].upper() + b['wann'][1:]
        stufe = (sp['nur'] if b['ab'] == 'alles' else sp['ab']).format(v=namen[b['ab']])
        z.append(f'| [{b["name"]}]({b["seite"]}) | {wann} | {stufe} |')
    return {'gruppen': gr, 'stufen': stufen, 'wofuer': '\n'.join(z)}


def ersetze(text, inhalt):
    for name, block in inhalt.items():
        muster = re.compile(rf'(<!-- bereiche:{name} -->\n).*?(\n<!-- /bereiche:{name} -->)', re.S)
        if not muster.search(text):
            sys.exit(f'werkbank_bereiche.py: Marker <!-- bereiche:{name} --> fehlt in uebersicht.md')
        text = muster.sub(lambda m: m.group(1) + block + m.group(2), text)
    return text


def main():
    for code, sp in SPRACHEN.items():
        if not sp['texte'].is_dir() or not sp['ziel'].exists():
            sys.exit(f'werkbank_bereiche.py: {sp["texte"].relative_to(WURZEL)} oder {sp["ziel"].relative_to(WURZEL)} fehlt')
        alt = sp['ziel'].read_text(encoding='utf-8')
        neu = ersetze(alt, bloecke(*lies(sp), sp))
        if '--pruefen' in sys.argv:
            if neu != alt:
                sys.exit(f'{sp["ziel"].relative_to(WURZEL)} ist nicht auf dem Stand von werkbankansicht.ts – bitte werkbank_bereiche.py ausführen.')
            print(f'Werkbank-Bereiche im Handbuch aktuell ({code}).')
            continue
        sp['ziel'].write_text(neu, encoding='utf-8')
        print(f'Geschrieben: {sp["ziel"].relative_to(WURZEL)}')


if __name__ == '__main__':
    main()
