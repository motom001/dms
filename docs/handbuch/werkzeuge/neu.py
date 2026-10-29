#!/usr/bin/env python3
"""
„Neu in dieser Version“ (#111) für beide Handbücher aus docs/releases/.

    python3 docs/handbuch/werkzeuge/neu.py <ziel>      # ziel: v0.22 oder entwicklung

Benutzerhandbuch: ohne die Abschnitte „Beim Aktualisieren beachten“ und „Für Administratoren“.
Administratorhandbuch: alles. Dazu ein Link zum Vergleich auf GitHub.
"""
import json, re, sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[3]
RELEASES = WURZEL / 'docs' / 'releases'
NUR_ADMIN = ('beim aktualisieren beachten', 'für administratoren')

def nummer(p: Path):
    return tuple(int(x) for x in p.stem.lstrip('v').split('.'))

def abschnitte(text: str, benutzer: bool) -> str:
    """Überschriften eine Ebene tiefer; im Benutzerhandbuch Admin-Abschnitte weglassen."""
    aus, weg = [], False
    for zeile in text.splitlines():
        m = re.match(r'^(#+)\s+(.*)$', zeile)
        if m:
            weg = benutzer and m.group(2).strip().lower() in NUR_ADMIN
            if weg:
                continue
            zeile = f"#{m.group(1)} {m.group(2)}"
        if not weg:
            aus.append(zeile)
    return '\n'.join(aus).strip()

def main():
    ziel = sys.argv[1] if len(sys.argv) > 1 else 'entwicklung'
    version = json.loads((WURZEL / 'package.json').read_text())['version']
    minor = ziel[1:] if re.match(r'^v\d+\.\d+$', ziel) else '.'.join(version.split('.')[:2])
    alle = sorted(RELEASES.glob('v*.md'), key=nummer, reverse=True)
    diese = [p for p in alle if '.'.join(p.stem.lstrip('v').split('.')[:2]) == minor]
    frueher = [p for p in alle if nummer(p)[:2] < tuple(int(x) for x in minor.split('.'))]
    bis = 'main' if ziel == 'entwicklung' else (diese[0].stem if diese else f'v{minor}.0')
    vergleich = f"https://github.com/motom001/dms/compare/{frueher[0].stem}...{bis}" if frueher else None
    for handbuch in ('benutzer', 'admin'):
        benutzer = handbuch == 'benutzer'
        teile = [f'# Neu in Version {minor}', '']
        if ziel == 'entwicklung':
            teile += ['!!! info "Entwicklungsstand"', '    Dieses Handbuch beschreibt den Stand von `main` – manches davon ist noch in keinem Release.', '']
        if not diese:
            teile += ['Für diese Version gibt es noch keine Release-Notizen.', '']
        for p in diese:
            teile += [f"## {p.stem.lstrip('v')}", '', abschnitte(p.read_text(encoding='utf-8'), benutzer), '']
        teile += ['## Ältere Versionen', '']
        if vergleich:
            teile += [f'- Alle Änderungen seit {frueher[0].stem.lstrip("v")} im Detail: [Vergleich auf GitHub]({vergleich})']
        teile += ['- Alle Versionen mit ihren Änderungen: [Releases auf GitHub](https://github.com/motom001/dms/releases)']
        if not benutzer:
            teile += ['- Was deine Installation seit ihrer Version verpasst hat, verlinkt **Werkbank → Technik**.']
        (WURZEL / 'docs' / 'handbuch' / handbuch / 'docs' / 'neu.md').write_text('\n'.join(teile) + '\n', encoding='utf-8')
    print(f'neu.md für {ziel}: {len(diese)} Release(s) {", ".join(p.stem for p in diese)}')

if __name__ == '__main__':
    main()
