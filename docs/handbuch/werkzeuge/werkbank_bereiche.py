#!/usr/bin/env python3
"""
Tabellen der Werkbank-Bereiche im Administratorhandbuch aus shared/src/werkbankansicht.ts (#296)
und den Namen in der Sprachdatei shared/src/sprachen/de/werkbank.json (#473, #354).

    python3 docs/handbuch/werkzeuge/werkbank_bereiche.py            # schreibt admin/docs/uebersicht.md
    python3 docs/handbuch/werkzeuge/werkbank_bereiche.py --pruefen  # Fehler, wenn die Seite veraltet ist

Englisch (#730): admin/docs-en/uebersicht.md trägt dieselben Marker. Gibt es die Sprachdatei
shared/src/sprachen/en/werkbank.json (kommt mit #729), schreibt und prüft das Werkzeug auch sie;
bis dahin sind die englischen Tabellen von Hand übersetzt.

Ersetzt in uebersicht.md die Abschnitte zwischen den Markern
  <!-- bereiche:gruppen -->        … <!-- /bereiche:gruppen -->        Gruppen und ihre Bereiche
  <!-- bereiche:organisation -->   … <!-- /bereiche:organisation -->   was „Betrieb“ zusätzlich zeigt
  <!-- bereiche:wofuer -->         … <!-- /bereiche:wofuer -->         Wofür man welchen Bereich braucht
So bleibt das Handbuch beim Ändern der Bereiche oder einer späteren Neugruppierung an einer Stelle aktuell.
"""
import json, re, sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[3]
QUELLE = WURZEL / 'shared' / 'src' / 'werkbankansicht.ts'
TEXTE = WURZEL / 'shared' / 'src' / 'sprachen' / 'de' / 'werkbank.json'
ZIEL = WURZEL / 'docs' / 'handbuch' / 'admin' / 'docs' / 'uebersicht.md'
# Je Sprache: Sprachdatei, Seite und die festen Wörter der Tabellen.
# „bedingt“: Bereiche, die nur unter einer Bedingung in der Leiste stehen.
SPRACHEN = {
    'de': {'texte': TEXTE, 'ziel': ZIEL,
           'vorlagen': {'haushalt': 'Haushalt', 'organisation': 'Betrieb'}, 'alles': 'nur Alles',
           'experte': '{v} im Expertenmodus', 'zusaetzlich': '- **{o}**: zusätzlich {liste}.',
           'kopf_gruppen': '| Gruppe | Bereiche |', 'kopf_wofuer': '| Bereich | Wofür | In der Vorlage |',
           'bedingt': {'aufbewahrung': 'nur mit Archivmodus', 'eingangsordner': 'nur wenn der Ordner eingebunden ist'}},
    'en': {'texte': WURZEL / 'shared' / 'src' / 'sprachen' / 'en' / 'werkbank.json',
           'ziel': WURZEL / 'docs' / 'handbuch' / 'admin' / 'docs-en' / 'uebersicht.md',
           'vorlagen': {'haushalt': 'Household', 'organisation': 'Business'}, 'alles': 'Everything only',
           'experte': '{v} in expert mode', 'zusaetzlich': '- **{o}**: additionally {liste}.',
           'kopf_gruppen': '| Group | Areas |', 'kopf_wofuer': '| Area | What for | In the preset |',
           'bedingt': {'aufbewahrung': 'only with archive mode', 'eingangsordner': 'only if the folder is mounted'}},
}

# Seite im Administratorhandbuch je Bereich (Pfad unter /werkbank).
SEITE = {
    'pakete': 'pakete.md', 'typen': 'mappentypen.md', 'sichten': 'sichten.md', 'nummernkreise': 'nummernkreise.md', 'automatisierungen': 'automatisierungen.md', 'ablaufvorlagen': 'automatisierungsvorlagen.md',
    'benutzer': 'benutzer.md', 'verschluesselung': 'verschluesselung.md', 'auskuenfte': 'datenschutz.md#auskunft-erteilen', 'loeschkonzept': 'loeschkonzept.md#aus-dem-dms-erzeugen',
    'aufbewahrung': 'archiv.md#nach-der-frist-aufbewahrung-abgelaufen', 'stempel': 'stempel.md',
    'postfaecher': 'postfaecher.md', 'eingangsordner': 'eingangsordner.md', 'webdav': 'webdav.md', 'webhooks': 'webhooks.md',
    'texterkennung': 'texterkennung.md', 'woerter': 'suche.md#gleichbedeutende-worter', 'sicherung': 'sicherung.md', 'vollexport': 'export.md', 'papierkorb': 'papierkorb.md',
    'nutzung': 'nutzung.md', 'organisation': 'organisation.md', 'betrieb': 'installation.md#e-mail-und-adresse', 'region': 'region.md', 'sprachen': 'sprachen.md', 'aufgaben': 'aufgaben.md', 'anmeldeschutz': 'anmeldeschutz.md',
    'designs': 'designs.md', 'anbindung': 'installation.md#datenbank-anbindung',
    'systemzustand': 'speicherplatz.md', 'protokoll': 'fehlersuche.md#protokoll', 'fehlermeldungen': 'fehlersuche.md#gemeldete-fehler',
    'wartung': 'wartungsmodus.md', 'demo': 'demo.md',
}


def lies(sp=SPRACHEN['de']):
    ts = QUELLE.read_text(encoding='utf-8')
    texte = json.loads(sp['texte'].read_text(encoding='utf-8'))
    folge = re.findall(r"'(\w+)'", re.search(r'const GRUPPENFOLGE = \[([^\]]*)\]', ts).group(1))
    gruppen = {g: texte[f'gruppe.{g}'] for g in folge}
    bereiche = []
    namen = sp['vorlagen']
    for pfad, gruppe, inn, experte in re.findall(r"\{ pfad: '(\w+)', gruppe: '(\w+)', in: (H|O|\[\])(?:, experte: \[([^\]]*)\])? \}", ts):
        h, o = namen['haushalt'], namen['organisation']
        vorlagen = [h, o] if inn == 'H' else [o] if inn == 'O' else []
        # Expertenmodus (#356): in diesen Vorlagen nur, wenn ein Administrator ihn eingeschaltet hat.
        nur_experte = [namen[v] for v in re.findall(r"'(\w+)'", experte)]
        bereiche.append({'pfad': pfad, 'gruppe': gruppe, 'name': texte[f'bereich.{pfad}.name'], 'vorlagen': vorlagen, 'experte': nur_experte, 'wann': texte[f'bereich.{pfad}.wann']})
    if not bereiche or any(b['pfad'] not in SEITE for b in bereiche) or any(b['gruppe'] not in gruppen for b in bereiche):
        fehlt = [b['pfad'] for b in bereiche if b['pfad'] not in SEITE or b['gruppe'] not in gruppen]
        sys.exit(f'werkbank_bereiche.py: Bereiche nicht gelesen, ohne Handbuchseite oder ohne Gruppe: {fehlt}')
    return gruppen, bereiche


def verweis(b, sp=SPRACHEN['de']):
    zusatz = f' ({sp["bedingt"][b["pfad"]]})' if b['pfad'] in sp['bedingt'] else ''
    return f'[{b["name"]}]({SEITE[b["pfad"]]}){zusatz}'


def bloecke(gruppen, bereiche, sp=SPRACHEN['de']):
    z = [sp['kopf_gruppen'], '| --- | --- |']
    for g, titel in gruppen.items():
        z.append(f'| **{titel}** | ' + ', '.join(verweis(b, sp) for b in bereiche if b['gruppe'] == g) + ' |')
    gr = '\n'.join(z)
    o = sp['vorlagen']['organisation']
    org = ', '.join(b['name'] for b in bereiche if b['vorlagen'] == [o])
    org = sp['zusaetzlich'].format(o=o, liste=org)
    z = [sp['kopf_wofuer'], '| --- | --- | --- |']
    for b in bereiche:
        wann = b['wann'][0].upper() + b['wann'][1:]
        vorlagen = b['vorlagen'] + [sp['experte'].format(v=v) for v in b['experte']]
        z.append(f'| [{b["name"]}]({SEITE[b["pfad"]]}) | {wann} | {", ".join(vorlagen) or sp["alles"]} |')
    return {'gruppen': gr, 'organisation': org, 'wofuer': '\n'.join(z)}


def ersetze(text, inhalt):
    for name, block in inhalt.items():
        muster = re.compile(rf'(<!-- bereiche:{name} -->\n).*?(\n<!-- /bereiche:{name} -->)', re.S)
        if not muster.search(text):
            sys.exit(f'werkbank_bereiche.py: Marker <!-- bereiche:{name} --> fehlt in uebersicht.md')
        text = muster.sub(lambda m: m.group(1) + block + m.group(2), text)
    return text


def main():
    for code, sp in SPRACHEN.items():
        if not sp['texte'].exists() or not sp['ziel'].exists():
            continue  # z. B. Englisch, solange es die Sprachdatei noch nicht gibt
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
