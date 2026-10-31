#!/usr/bin/env python3
"""
Handbücher für die Offline-Hilfe im Image bauen (#219).

    python3 docs/handbuch/werkzeuge/offline.py <ziel>

Baut alle vier Handbücher ohne Screenshots nach <ziel>/<handbuch>/ und die Startseite nach
<ziel>/index.html – für die Auslieferung unter /hilfe/ im DMS. Arbeitet auf einer Kopie von
docs/, damit „Neu in dieser Version“ das Arbeitsverzeichnis nicht verändert. Prüft danach,
dass jeder lokale Verweis (/hilfe/…) auf eine vorhandene Seite zeigt.
"""
import json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[3]
HANDBUECHER = ['benutzer', 'admin', 'installieren', 'entwickler']


def main():
    ziel = Path(sys.argv[1] if len(sys.argv) > 1 else 'hilfe').resolve()
    version = json.loads((WURZEL / 'package.json').read_text())['version']
    m = re.match(r'^(\d+)\.(\d+)\.', version)
    ordner = f'v{m.group(1)}.{m.group(2)}' if m else 'aktuell'
    shutil.rmtree(ziel, ignore_errors=True)
    ziel.mkdir(parents=True)

    with tempfile.TemporaryDirectory() as tmp:
        kopie = Path(tmp)
        shutil.copytree(WURZEL / 'docs' / 'handbuch', kopie / 'docs' / 'handbuch', ignore=shutil.ignore_patterns('bilder', 'site', 'node_modules'))
        shutil.copytree(WURZEL / 'docs' / 'releases', kopie / 'docs' / 'releases')
        shutil.copy(WURZEL / 'package.json', kopie / 'package.json')
        subprocess.run([sys.executable, str(kopie / 'docs/handbuch/werkzeuge/neu.py'), ordner], check=True)
        for h in HANDBUECHER:
            env = {**os.environ, 'DMS_HILFE_HANDBUCH': h, 'DMS_HILFE_VERSION': ordner}
            subprocess.run(['mkdocs', 'build', '--strict', '--quiet', '-f', str(kopie / 'docs/handbuch' / h / 'mkdocs.offline.yml'), '-d', str(ziel / h)], check=True, env=env)
            (ziel / h / 'sitemap.xml').unlink(missing_ok=True)
            (ziel / h / 'sitemap.xml.gz').unlink(missing_ok=True)
            schlanker(ziel / h)

    # Startseite: „aktuell“ gibt es offline nicht – die Handbücher liegen direkt unter /hilfe/<handbuch>/.
    start = (WURZEL / 'docs/handbuch/start/index.html').read_text(encoding='utf-8')
    start = re.sub(rf'href="({"|".join(HANDBUECHER)})/aktuell/', r'href="\1/', start)
    (ziel / 'index.html').write_text(start, encoding='utf-8')

    fehler = pruefe(ziel)
    groesse = sum(p.stat().st_size for p in ziel.rglob('*') if p.is_file())
    print(f'Offline-Hilfe {ordner}: {sum(1 for _ in ziel.rglob("*.html"))} Seiten, {groesse / 1e6:.1f} MB')
    if fehler:
        print('\n'.join(f'::error title=Offline-Hilfe::{f}' for f in fehler[:50]))
        sys.exit(1)


def schlanker(ordner: Path):
    """Was offline niemand braucht: Quellkarten und Suchsprachen außer Deutsch."""
    for p in ordner.rglob('*.map'):
        p.unlink()
    lunr = ordner / 'assets' / 'javascripts' / 'lunr'
    behalten = {'lunr.de.min.js', 'lunr.stemmer.support.min.js', 'lunr.multi.min.js'}
    for p in lunr.rglob('*.js'):
        if p.name not in behalten:
            p.unlink()


def pruefe(ziel: Path) -> list[str]:
    """Jeder Verweis auf /hilfe/… zeigt auf eine vorhandene Datei oder Seite."""
    fehler = set()
    for html in ziel.rglob('*.html'):
        for pfad in re.findall(r'(?:href|src)="(/hilfe/[^"#?]*)', html.read_text(encoding='utf-8')):
            p = ziel / pfad[len('/hilfe/'):]
            if not (p.is_file() or (p / 'index.html').is_file()):
                fehler.add(f'{html.relative_to(ziel)}: {pfad} fehlt')
    return sorted(fehler)


if __name__ == '__main__':
    main()
