#!/usr/bin/env python3
"""
Handbuch je Version (#111): legt ein gebautes Handbuch auf dem Branch gh-pages ab.

    python3 veroeffentlichen.py <gh-pages-Ordner> <gebaut> <ziel> <startseite.html>

  <gebaut>   enthält benutzer/ und admin/ (mkdocs build)
  <ziel>     v0.22 (Release, je Minor-Version) oder entwicklung (Stand von main)

Aufbau (wie bei „mike“, damit die Versionsauswahl von Material for MkDocs funktioniert):

  /index.html                 Startseite
  /404.html                   leitet alte Adressen und unbekannte Versionen auf „aktuell“
  /benutzer/versions.json     Versionen für die Auswahl; „aktuell“ ist ein Alias der neuesten
  /benutzer/index.html        → aktuell/ (oder entwicklung/, solange es kein Release gibt)
  /benutzer/v0.22/  /benutzer/aktuell/  /benutzer/entwicklung/
  /admin/…, /installieren/…, /entwickler/…   genauso (#179, #180)
"""
import json, re, shutil, sys
from pathlib import Path

RELEASE = re.compile(r'^v(\d+)\.(\d+)$')
HANDBUECHER = ('benutzer', 'admin', 'installieren', 'entwickler')

def titel(v: str) -> str:
    return v[1:] if RELEASE.match(v) else 'Entwicklung (main)'

def schluessel(v: str):
    m = RELEASE.match(v)
    return (1, int(m.group(1)), int(m.group(2))) if m else (0, 0, 0)

def ersetze(quelle: Path, ziel: Path):
    if ziel.exists():
        shutil.rmtree(ziel)
    shutil.copytree(quelle, ziel)

UMLEITUNG = """<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Weiter …</title>
<meta http-equiv="refresh" content="0; url={ziel}">
<link rel="canonical" href="{ziel}">
<script>location.replace({ziel_js} + location.hash)</script>
</head><body><p><a href="{ziel}">Weiter zum Handbuch</a></p></body></html>
"""

NICHT_GEFUNDEN = """<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>DMS – Handbuch</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 16px;color:#1c2328}a{color:#00796b}</style>
<script>
// Alte Adressen (/dms/benutzer/mappen/) und unbekannte Versionen (/dms/admin/v0.9/…) auf die
// passende Seite der neuesten Version umleiten (#111).
(async () => {
  const m = location.pathname.match(/^(.*?\\/)(benutzer|admin|installieren|entwickler)\\/(.*)$/);
  if (!m) return;
  const [, basis, h, rest] = m;
  let versionen = [];
  try { versionen = await (await fetch(basis + h + '/versions.json')).json(); } catch { return; }
  const bekannt = new Set(versionen.flatMap((v) => [v.version, ...(v.aliases || [])]));
  const standard = bekannt.has('aktuell') ? 'aktuell' : (versionen[0] && versionen[0].version);
  if (!standard) return;
  const teile = rest.split('/');
  let ziel;
  if (bekannt.has(teile[0])) ziel = teile[0] + '/';                          // Seite fehlt in dieser Version
  else if (/^v\\d+\\.\\d+$/.test(teile[0])) ziel = standard + '/' + teile.slice(1).join('/'); // Version gibt es nicht
  else ziel = standard + '/' + rest;                                       // alte Adresse ohne Version
  if (ziel === rest) return;
  location.replace(basis + h + '/' + ziel + location.hash);
})();
</script></head>
<body><h1>Seite nicht gefunden</h1><p>Weiter zu <a href="/dms/">allen Handbüchern</a>: <a href="/dms/installieren/">Wie komme ich an ein DMS?</a>, <a href="/dms/benutzer/">Benutzerhandbuch</a>, <a href="/dms/admin/">Administratorhandbuch</a>, <a href="/dms/entwickler/">Entwicklerhandbuch</a>.</p></body></html>
"""

def main():
    pages, gebaut, ziel, start = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
    if ziel != 'entwicklung' and not RELEASE.match(ziel):
        sys.exit(f'Unbekanntes Ziel {ziel!r}: erwartet vX.Y oder entwicklung')
    for h in HANDBUECHER:
        if not (gebaut / h).is_dir():
            continue  # ältere Stände bauen nicht alle Handbücher
        basis = pages / h
        basis.mkdir(parents=True, exist_ok=True)
        datei = basis / 'versions.json'
        versionen = json.loads(datei.read_text()) if datei.exists() else []
        versionen = [v for v in versionen if v['version'] != ziel and (basis / v['version']).is_dir()]
        ersetze(gebaut / h, basis / ziel)
        versionen.append({'version': ziel, 'title': titel(ziel), 'aliases': []})
        releases = [v['version'] for v in versionen if RELEASE.match(v['version'])]
        neueste = max(releases, key=schluessel) if releases else None
        if neueste == ziel:
            ersetze(gebaut / h, basis / 'aktuell')
        for v in versionen:
            v['aliases'] = ['aktuell'] if v['version'] == neueste else []
            v['title'] = titel(v['version'])
        versionen.sort(key=lambda v: schluessel(v['version']), reverse=True)
        datei.write_text(json.dumps(versionen, ensure_ascii=False, indent=2) + '\n')
        weiter = 'aktuell/' if neueste else 'entwicklung/'
        (basis / 'index.html').write_text(UMLEITUNG.format(ziel=weiter, ziel_js=json.dumps(weiter)))
    shutil.copy(start, pages / 'index.html')
    (pages / '404.html').write_text(NICHT_GEFUNDEN)
    (pages / '.nojekyll').write_text('')
    print(f'Handbuch „{ziel}“ abgelegt in {pages}')

if __name__ == '__main__':
    main()
