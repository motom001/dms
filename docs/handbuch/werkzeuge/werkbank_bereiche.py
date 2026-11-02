#!/usr/bin/env python3
"""
Tabellen der Werkbank-Bereiche im Administratorhandbuch aus shared/src/werkbankansicht.ts (#296)
und den Namen in der Sprachdatei shared/src/sprachen/de/werkbank.json (#473, #354).

    python3 docs/handbuch/werkzeuge/werkbank_bereiche.py            # schreibt admin/docs/uebersicht.md
    python3 docs/handbuch/werkzeuge/werkbank_bereiche.py --pruefen  # Fehler, wenn die Seite veraltet ist

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

# Seite im Administratorhandbuch je Bereich (Pfad unter /werkbank).
SEITE = {
    'typen': 'mappentypen.md', 'sichten': 'sichten.md', 'nummernkreise': 'nummernkreise.md', 'stempel': 'stempel.md', 'pakete': 'pakete.md',
    'darfweg': 'archiv.md#nach-der-frist-darf-weg', 'datenschutz': 'datenschutz.md', 'benutzer': 'benutzer.md', 'anmeldeschutz': 'anmeldeschutz.md',
    'aufgaben': 'aufgaben.md', 'betrieb': 'installation.md#e-mail-und-adresse', 'verschluesselung': 'verschluesselung.md',
    'designs': 'designs.md', 'papierkorb': 'papierkorb.md', 'anbindung': 'installation.md#datenbank-anbindung',
    'systemzustand': 'speicherplatz.md', 'postfaecher': 'postfaecher.md', 'eingangsordner': 'eingangsordner.md', 'webdav': 'webdav.md',
    'texterkennung': 'texterkennung.md', 'protokoll': 'fehlersuche.md#protokoll',
    'fehlermeldungen': 'fehlersuche.md#gemeldete-fehler', 'sicherung': 'sicherung.md',
    'wiederherstellung': 'wiederherstellen.md', 'vollexport': 'export.md', 'wartungsmodus': 'wartungsmodus.md',
    'wartung': 'texterkennung.md#wartungsoperationen', 'technik': 'fehlersuche.md#technik',
    'demo': 'demo.md',
}
# Bereiche, die nur unter einer Bedingung in der Leiste stehen.
BEDINGT = {'darfweg': 'nur mit Archivmodus', 'eingangsordner': 'nur wenn der Ordner eingebunden ist'}


def lies():
    ts = QUELLE.read_text(encoding='utf-8')
    texte = json.loads(TEXTE.read_text(encoding='utf-8'))
    folge = re.findall(r"'(\w+)'", re.search(r'const GRUPPENFOLGE = \[([^\]]*)\]', ts).group(1))
    gruppen = {g: texte[f'gruppe.{g}'] for g in folge}
    bereiche = []
    for pfad, gruppe, inn in re.findall(r"\{ pfad: '(\w+)', gruppe: '(\w+)', in: (H|O|\[\]) \}", ts):
        vorlagen = ['Haushalt', 'Betrieb'] if inn == 'H' else ['Betrieb'] if inn == 'O' else []
        bereiche.append({'pfad': pfad, 'gruppe': gruppe, 'name': texte[f'bereich.{pfad}.name'], 'vorlagen': vorlagen, 'wann': texte[f'bereich.{pfad}.wann']})
    if not bereiche or any(b['pfad'] not in SEITE for b in bereiche) or any(b['gruppe'] not in gruppen for b in bereiche):
        fehlt = [b['pfad'] for b in bereiche if b['pfad'] not in SEITE or b['gruppe'] not in gruppen]
        sys.exit(f'werkbank_bereiche.py: Bereiche nicht gelesen, ohne Handbuchseite oder ohne Gruppe: {fehlt}')
    return gruppen, bereiche


def verweis(b):
    zusatz = f' ({BEDINGT[b["pfad"]]})' if b['pfad'] in BEDINGT else ''
    return f'[{b["name"]}]({SEITE[b["pfad"]]}){zusatz}'


def bloecke(gruppen, bereiche):
    z = ['| Gruppe | Bereiche |', '| --- | --- |']
    for g, titel in gruppen.items():
        z.append(f'| **{titel}** | ' + ', '.join(verweis(b) for b in bereiche if b['gruppe'] == g) + ' |')
    gr = '\n'.join(z)
    org = ', '.join(b['name'] for b in bereiche if b['vorlagen'] == ['Betrieb'])
    org = f'- **Betrieb**: zusätzlich {org}.'
    z = ['| Bereich | Wofür | In der Vorlage |', '| --- | --- | --- |']
    for b in bereiche:
        wann = b['wann'][0].upper() + b['wann'][1:]
        z.append(f'| [{b["name"]}]({SEITE[b["pfad"]]}) | {wann} | {", ".join(b["vorlagen"]) or "nur Alles"} |')
    return {'gruppen': gr, 'organisation': org, 'wofuer': '\n'.join(z)}


def ersetze(text, inhalt):
    for name, block in inhalt.items():
        muster = re.compile(rf'(<!-- bereiche:{name} -->\n).*?(\n<!-- /bereiche:{name} -->)', re.S)
        if not muster.search(text):
            sys.exit(f'werkbank_bereiche.py: Marker <!-- bereiche:{name} --> fehlt in {ZIEL.name}')
        text = muster.sub(lambda m: m.group(1) + block + m.group(2), text)
    return text


def main():
    alt = ZIEL.read_text(encoding='utf-8')
    neu = ersetze(alt, bloecke(*lies()))
    if '--pruefen' in sys.argv:
        if neu != alt:
            sys.exit('uebersicht.md ist nicht auf dem Stand von werkbankansicht.ts – bitte werkbank_bereiche.py ausführen.')
        print('Werkbank-Bereiche im Handbuch aktuell.')
        return
    ZIEL.write_text(neu, encoding='utf-8')
    print(f'Geschrieben: {ZIEL.relative_to(WURZEL)}')


if __name__ == '__main__':
    main()
