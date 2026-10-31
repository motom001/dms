#!/usr/bin/env python3
"""
Weiche Zeitangaben auflisten (#303) – für die Qualitätskontrolle.

    python3 docs/handbuch/werkzeuge/zeitangaben.py              # Liste auf der Konsole
    python3 docs/handbuch/werkzeuge/zeitangaben.py --markdown   # als Markdown (Job Summary)

Sucht in den Handbüchern, im Glossar, in den Vorlagen und in den Texten der Oberfläche nach
Wörtern wie „im Moment“, „noch nicht“, „kommt später“ oder „geplant“. Solche Ankündigungen bleiben
gern stehen, wenn die Funktion längst gebaut ist. Eine automatische Prüfung, ob der Satz noch
stimmt, gibt es nicht – die Liste ist zum bewussten Durchsehen gedacht und bricht nichts ab.

Bewusst gewollte Stellen markiert man in derselben Zeile (oder der Zeile davor) mit
    <!-- zeitangabe: geprüft 0.75 -->       (Markdown)
    # zeitangabe: geprüft 0.75              (YAML)
    // zeitangabe: geprüft 0.75             (TypeScript)
Sie erscheinen dann gesondert unter „Geprüft“, mit der Version – bei der nächsten Runde wieder ansehen.
"""
import re
import sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[3]

QUELLEN = [
    ('docs/handbuch', '**/docs/**/*.md'),
    ('docs/handbuch/snippets', '*.md'),
    ('docs/handbuch/vorlagen', '*.md'),
    ('docs', 'glossar.yml'),
    ('web/src', '**/*.tsx'),
    ('web/src', '**/*.ts'),
    ('shared/src', 'hilfe.ts'),
    ('.', 'README.md'),
]
# Erzeugte Seiten und Release-Notizen sind Geschichte, keine Ankündigung.
AUSLASSEN = ('/neu.md', '/begriffe.md')

WOERTER = [
    r'im Moment', r'momentan', r'derzeit', r'zurzeit', r'vorerst', r'vorläufig', r'noch nicht',
    r'folg(?:t|en)(?= (?:mit|in|bald|später|demnächst)\b|[.;:)]|$)', r'kommt(?: \w+)? (?:später|bald)', r'später', r'künftig', r'demnächst', r'\bbald\b',
    r'geplant', r'in einer späteren Version',
]
MUSTER = re.compile(r'(?<![\w-])(' + '|'.join(WOERTER) + r')(?![\w-])', re.IGNORECASE)
MARKE = re.compile(r'zeitangabe:\s*geprüft\s+([\w.]+)', re.IGNORECASE)
# „folgt“ als Wegweiser („wie folgt“, „Es folgt …“, „im Folgenden“) ist keine Ankündigung.
HARMLOS = re.compile(r'wie folgt|folgende|im folgenden|darauf folg|nachfolg|befolg|verfolg|erfolg', re.IGNORECASE)


def dateien():
    gesehen = set()
    for basis, muster in QUELLEN:
        for p in sorted((WURZEL / basis).glob(muster)):
            r = p.relative_to(WURZEL).as_posix()
            if r in gesehen or any(r.endswith(a) for a in AUSLASSEN) or 'node_modules' in r:
                continue
            gesehen.add(r)
            yield p, r


def satz(zeile: str, start: int, ende: int) -> str:
    """Den Satz um den Fund herum, gekürzt auf etwa 160 Zeichen."""
    links = max(zeile.rfind('. ', 0, start), zeile.rfind('| ', 0, start))
    rechts = zeile.find('. ', ende)
    t = zeile[links + 2 if links >= 0 else 0:rechts + 1 if rechts >= 0 else len(zeile)].strip()
    t = re.sub(r'<!--.*?-->', '', t).strip()
    return t if len(t) <= 160 else t[:157] + '…'


def funde():
    offen, geprueft = [], []
    for p, r in dateien():
        zeilen = p.read_text(encoding='utf-8', errors='replace').splitlines()
        code = r.endswith(('.ts', '.tsx'))
        for i, zeile in enumerate(zeilen):
            # In Code-Dateien zählen nur Texte, keine Kommentare.
            if code and zeile.lstrip().startswith(('//', '*', '/*')):
                continue
            for m in MUSTER.finditer(zeile):
                if HARMLOS.search(zeile[max(0, m.start() - 12):m.end() + 12]):
                    continue
                marke = MARKE.search(zeile) or (MARKE.search(zeilen[i - 1]) if i else None)
                eintrag = (r, i + 1, m.group(1), satz(zeile, m.start(), m.end()))
                (geprueft if marke else offen).append(eintrag + ((marke.group(1),) if marke else ()))
                break
    return offen, geprueft


def zelle(t: str) -> str:
    return t.replace('|', '\\|')


def main():
    offen, geprueft = funde()
    md = '--markdown' in sys.argv
    if md:
        print('## Weiche Zeitangaben (#303)\n')
        print(f'{len(offen)} Stellen zum Durchsehen, {len(geprueft)} als geprüft markiert. '
              'Stimmt der Satz noch? Sonst korrigieren oder mit `zeitangabe: geprüft <Version>` markieren.\n')
        if offen:
            print('| Datei | Zeile | Wort | Satz |\n|---|---|---|---|')
            for r, z, w, s in offen:
                print(f'| `{r}` | {z} | {w} | {zelle(s)} |')
        if geprueft:
            print('\n### Geprüft\n\n| Datei | Zeile | geprüft in | Satz |\n|---|---|---|---|')
            for r, z, w, s, v in geprueft:
                print(f'| `{r}` | {z} | {v} | {zelle(s)} |')
        return
    for r, z, w, s in offen:
        print(f'{r}:{z}: [{w}] {s}')
    if geprueft:
        print('\nGeprüft:')
        for r, z, w, s, v in geprueft:
            print(f'{r}:{z}: [geprüft {v}] {s}')
    print(f'\n{len(offen)} Stellen zum Durchsehen, {len(geprueft)} als geprüft markiert.', file=sys.stderr)


if __name__ == '__main__':
    main()
