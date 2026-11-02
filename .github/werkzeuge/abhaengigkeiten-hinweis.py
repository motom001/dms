#!/usr/bin/env python3
"""
Hinweis auf geänderte Laufzeit-Abhängigkeiten im Pull Request (#543).

    abhaengigkeiten-hinweis.py <basis> [<kopf>]      z. B. HEAD^1 HEAD im Merge-Commit eines PR

Vergleicht zwischen zwei Commits
  - `dependencies` und `optionalDependencies` aller package.json im Repository (npm, Laufzeit),
  - die Pakete hinter `apk add` in allen Dockerfiles (Alpine im Image),
  - zur Information auch `devDependencies` (Werkzeuge für Bau und Tests).

Neue Laufzeit-Abhängigkeiten erscheinen als Warnung am PR, entfernte und neue Werkzeuge als Notiz,
geänderte Versionen nur in der Zusammenfassung des Laufs. Der Hinweis sperrt nie (Exit-Code 0):
Die Begründung gehört in die PR-Beschreibung, siehe CONTRIBUTING.md. Ohne fremde Bibliotheken,
nur Python und git.
"""
import json, os, re, subprocess, sys

REGEL = 'Bitte im PR begründen (Abschnitt „Neue Abhängigkeiten“): wozu, warum nicht mit Bordmitteln, Lizenz, Pflegezustand, eigene Abhängigkeiten.'


def git(*args):
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True).stdout


def dateien(rev):
    """Getrackte package.json und Dockerfiles in einem Commit."""
    alle = git('ls-tree', '-r', '--name-only', rev).splitlines()
    pakete = [d for d in alle if d.split('/')[-1] == 'package.json' and 'node_modules/' not in d]
    docker = [d for d in alle if d.split('/')[-1].startswith('Dockerfile')]
    return pakete, docker


def inhalt(rev, pfad):
    try:
        return git('show', f'{rev}:{pfad}')
    except subprocess.CalledProcessError:
        return None


def npm(text, felder):
    if not text:
        return {}
    try:
        d = json.loads(text)
    except ValueError:
        return {}
    aus = {}
    for f in felder:
        aus.update(d.get(f) or {})
    return aus


def apk(text):
    """Pakete hinter `apk add` (Optionen wie --no-cache fallen weg, Fortsetzungszeilen werden verbunden)."""
    if not text:
        return set()
    zeilen = re.sub(r'\\\n', ' ', text).splitlines()
    pakete = set()
    for z in zeilen:
        if z.lstrip().startswith('#'):
            continue
        for teil in re.findall(r'apk add\s+([^;&|]*)', z):
            pakete.update(w for w in teil.split() if not w.startswith('-'))
    return pakete


def zeile(text, name):
    """Zeile, in der eine Abhängigkeit steht – für die Anmerkung an der Datei."""
    zeilen = (text or '').splitlines()
    wort = re.compile(rf'(?<![\w.-]){re.escape(name)}(?![\w.-])')
    for i, z in enumerate(zeilen, 1):
        if f'"{name}"' in z or ('apk add' in z and wort.search(z)):
            return i
    # Alpine-Paket in einer Fortsetzungszeile von `apk add`
    for i, z in enumerate(zeilen, 1):
        if not z.lstrip().startswith('#') and wort.search(z):
            return i
    return 1


def melde(art, datei, nr, titel, text):
    # Anmerkungen für GitHub Actions; % und Zeilenumbrüche müssen maskiert werden.
    text = text.replace('%', '%25').replace('\n', '%0A')
    print(f'::{art} file={datei},line={nr},title={titel}::{text}')


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    basis, kopf = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'HEAD')
    pa, da = dateien(basis)
    pk, dk = dateien(kopf)
    neu, weg, versionen, werkzeuge = [], [], [], []

    for pfad in sorted(set(pa) | set(pk)):
        alt_text, neu_text = inhalt(basis, pfad), inhalt(kopf, pfad)
        for felder, liste_neu in ((('dependencies', 'optionalDependencies'), neu), (('devDependencies',), werkzeuge)):
            a, n = npm(alt_text, felder), npm(neu_text, felder)
            for name in sorted(set(n) - set(a)):
                liste_neu.append((pfad, zeile(neu_text, name), f'npm {name} {n[name]}'))
            if liste_neu is neu:
                weg.extend((pfad, f'npm {name}') for name in sorted(set(a) - set(n)))
                versionen.extend((pfad, f'npm {name} {a[name]} → {n[name]}') for name in sorted(set(a) & set(n)) if a[name] != n[name])

    for pfad in sorted(set(da) | set(dk)):
        alt_text, neu_text = inhalt(basis, pfad), inhalt(kopf, pfad)
        a, n = apk(alt_text), apk(neu_text)
        neu.extend((pfad, zeile(neu_text, name), f'Alpine-Paket {name}') for name in sorted(n - a))
        weg.extend((pfad, f'Alpine-Paket {name}') for name in sorted(a - n))

    for pfad, nr, was in neu:
        melde('warning', pfad, nr, 'Neue Laufzeit-Abhängigkeit', f'{was}. {REGEL}')
    for pfad, nr, was in werkzeuge:
        melde('notice', pfad, nr, 'Neues Werkzeug für Bau oder Tests', f'{was} (devDependencies). Kurz begründen, wenn es mehr als eine Kleinigkeit ist.')
    for pfad, was in weg:
        melde('notice', pfad, 1, 'Abhängigkeit entfernt', was)

    z = ['## Abhängigkeiten in diesem PR', '']
    if not (neu or weg or versionen or werkzeuge):
        z.append('Keine Laufzeit-Abhängigkeiten geändert (npm `dependencies`, `apk add` im Dockerfile).')
    for titel, eintraege in (('Neu (Laufzeit) – Begründung im PR nötig', [(p, w) for p, _, w in neu]),
                             ('Neu (Bau und Tests)', [(p, w) for p, _, w in werkzeuge]),
                             ('Entfernt', weg), ('Version geändert', versionen)):
        if eintraege:
            z += [f'**{titel}**', ''] + [f'- {w} (`{p}`)' for p, w in eintraege] + ['']
    if neu:
        z.append(REGEL)
    bericht = '\n'.join(z) + '\n'
    ziel = os.environ.get('GITHUB_STEP_SUMMARY')
    if ziel:
        with open(ziel, 'a', encoding='utf-8') as f:
            f.write(bericht)
    else:
        print(bericht, end='')


if __name__ == '__main__':
    main()
