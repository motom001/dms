"""
mkdocs-Hook für die Offline-Fassung der Handbücher im Image (#219).

- Screenshots (bilder/…) fallen weg; an ihrer Stelle steht ein Hinweis mit Link auf dieselbe
  Seite in der Online-Hilfe der installierten Version.
- Verweise zwischen den Handbüchern (https://motom001.github.io/dms/<handbuch>/aktuell/…)
  zeigen auf die lokale Fassung unter /hilfe/<handbuch>/….
- Dateien, die es nur online gibt (Vorlagen), verweisen auf die Online-Hilfe; die
  API-Beschreibung auf die eigene Installation.
- Keine Versionsauswahl, keine Schriften aus dem Internet; im Fuß ein Link zur Online-Hilfe.

Gesteuert über Umgebungsvariablen: DMS_HILFE_HANDBUCH (admin, benutzer, …) und
DMS_HILFE_VERSION (z. B. v0.44).
"""
import os
import re

ONLINE = 'https://motom001.github.io/dms'
HANDBUCH = os.environ.get('DMS_HILFE_HANDBUCH', '')
VERSION = os.environ.get('DMS_HILFE_VERSION', 'aktuell')
HANDBUECHER = 'admin|benutzer|installieren|entwickler'

BILD = re.compile(r'!\[([^\]]*)\]\((?:\.\./)*bilder/[^)]*\)(\{[^}]*\})?')
ZWISCHEN = re.compile(rf'{re.escape(ONLINE)}/({HANDBUECHER})/aktuell/')
START = re.compile(rf'{re.escape(ONLINE)}/?(?=["\')\s#])')


def online(seite_url: str = '') -> str:
    return f'{ONLINE}/{HANDBUCH}/{VERSION}/{seite_url}'


def on_config(config, **_):
    config.extra.pop('version', None)
    config.copyright = (config.copyright or '') + (
        f' · Offline-Fassung zu Version {VERSION.lstrip("v")} · '
        f'<a href="{online()}">Online-Hilfe</a> · <a href="{ONLINE}/{HANDBUCH}/aktuell/">neueste Fassung</a>'
    )
    return config


def on_page_markdown(markdown, page, **_):
    ziel = online(page.url)

    def bild(m):
        alt = m.group(1).strip() or 'Bildschirmfoto'
        return f'*Bild: {alt} – [in der Online-Hilfe ansehen]({ziel})*'

    markdown = BILD.sub(bild, markdown)
    markdown = re.sub(r'\]\(vorlagen/([^)]+)\)', lambda m: f']({online("vorlagen/" + m.group(1))})', markdown)
    markdown = markdown.replace('](api/openapi.json)', '](/api/openapi.json)')
    return markdown


def on_post_page(output, **_):
    output = ZWISCHEN.sub(r'/hilfe/\1/', output)
    output = START.sub('/hilfe/', output)
    # Kanonischer Verweis und Sitemap-Angaben gehören zur Online-Fassung.
    output = re.sub(r'<link rel="canonical"[^>]*>', '', output)
    return output
