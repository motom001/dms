#!/usr/bin/env python3
"""
Tabellen der Werkbank-Bereiche im Administratorhandbuch aus shared/src/werkbankansicht.ts (#296).

    python3 docs/handbuch/werkzeuge/werkbank_bereiche.py            # schreibt admin/docs/uebersicht.md
    python3 docs/handbuch/werkzeuge/werkbank_bereiche.py --pruefen  # Fehler, wenn die Seite veraltet ist

Ersetzt in uebersicht.md die Abschnitte zwischen den Markern
  <!-- bereiche:gruppen -->        … <!-- /bereiche:gruppen -->        Gruppen und ihre Bereiche
  <!-- bereiche:organisation -->   … <!-- /bereiche:organisation -->   was „Betrieb“ zusätzlich zeigt
  <!-- bereiche:wofuer -->         … <!-- /bereiche:wofuer -->         Wofür man welchen Bereich braucht
So bleibt das Handbuch beim Ändern der Bereiche oder einer späteren Neugruppierung an einer Stelle aktuell.
"""
import re, sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[3]
QUELLE = WURZEL / 'shared' / 'src' / 'werkbankansicht.ts'
ZIEL = WURZEL / 'docs' / 'handbuch' / 'admin' / 'docs' / 'uebersicht.md'

# Seite im Administratorhandbuch je Bereich (Pfad unter /werkbank).
SEITE = {
    'typen': 'mappentypen.md', 'sichten': 'sichten.md', 'nummernkreise': 'nummernkreise.md', 'stempel': 'stempel.md', 'pakete': 'pakete.md',
    'darfweg': 'archiv.md#nach-der-frist-darf-weg', 'benutzer': 'benutzer.md', 'anmeldeschutz': 'anmeldeschutz.md',
    'aufgaben': 'aufgaben.md', 'betrieb': 'installation.md#e-mail-und-adresse', 'verschluesselung': 'verschluesselung.md',
    'designs': 'designs.md', 'papierkorb': 'papierkorb.md', 'anbindung': 'installation.md#datenbank-anbindung',
    'speicherplatz': 'speicherplatz.md', 'postfaecher': 'postfaecher.md', 'eingangsordner': 'eingangsordner.md', 'webdav': 'webdav.md',
    'texterkennung': 'texterkennung.md', 'protokoll': 'fehlersuche.md#protokoll',
    'fehlermeldungen': 'fehlersuche.md#gemeldete-fehler', 'sicherung': 'sicherung.md',
    'wiederherstellung': 'wiederherstellen.md', 'vollexport': 'export.md', 'wartungsmodus': 'wartungsmodus.md',
    'wartung': 'texterkennung.md#wartungsoperationen', 'datenbank': 'fehlersuche.md#datenbank', 'technik': 'fehlersuche.md#technik',
    'demo': 'demo.md',
}
# Bereiche, die nur unter einer Bedingung in der Leiste stehen.
BEDINGT = {'darfweg': 'nur mit Archivmodus', 'eingangsordner': 'nur wenn der Ordner eingebunden ist'}


def lies():
    ts = QUELLE.read_text(encoding='utf-8')
    gruppen = dict(re.findall(r"(\w+): '([^']+)'", re.search(r'export const GRUPPEN = \{([^}]*)\}', ts).group(1)))
    bereiche = []
    for pfad, gruppe, name, inn, wann in re.findall(r"\{ pfad: '(\w+)', gruppe: '(\w+)', name: '([^']+)', in: \[([^\]]*)\], wann: '([^']+)' \}", ts):
        vorlagen = ['Haushalt', 'Betrieb'] if '...H' in inn else ['Betrieb'] if '...O' in inn else []
        bereiche.append({'pfad': pfad, 'gruppe': gruppe, 'name': name, 'vorlagen': vorlagen, 'wann': wann})
    if not bereiche or any(b['pfad'] not in SEITE for b in bereiche):
        fehlt = [b['pfad'] for b in bereiche if b['pfad'] not in SEITE]
        sys.exit(f'werkbank_bereiche.py: Bereiche nicht gelesen oder ohne Handbuchseite: {fehlt}')
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
