"""
mkdocs-Hook für die Offline-Fassung der Handbücher im Image (#219).

- Screenshots (bilder/…) fallen weg; an ihrer Stelle steht ein Hinweis mit Link auf dieselbe
  Seite in der Online-Hilfe der installierten Version.
- Verweise zwischen den Handbüchern (https://help.ablago.app/<handbuch>/aktuell/…)
  zeigen auf die lokale Fassung unter /hilfe/<handbuch>/….
- Dateien, die es nur online gibt (Vorlagen), verweisen auf die Online-Hilfe; die
  API-Beschreibung auf die eigene Installation.
- Keine Versionsauswahl, keine Schriften aus dem Internet; im Fuß ein Link zur Online-Hilfe.

Gesteuert über Umgebungsvariablen: DMS_HILFE_HANDBUCH (admin, benutzer, …) und
DMS_HILFE_VERSION (z. B. v0.44). Die Sprache (#730) kommt aus theme.language: Englisch liegt unter
/hilfe/<handbuch>/en/ und online unter …/<handbuch>/<version>/en/.
"""
import os
import re

ONLINE = 'https://help.ablago.app'
HANDBUCH = os.environ.get('DMS_HILFE_HANDBUCH', '')
VERSION = os.environ.get('DMS_HILFE_VERSION', 'aktuell')
HANDBUECHER = 'admin|benutzer|installieren|entwickler'

BILD = re.compile(r'!\[([^\]]*)\]\((?:\.\./)*bilder/[^)]*\)(\{[^}]*\})?')
ZWISCHEN = re.compile(rf'{re.escape(ONLINE)}/({HANDBUECHER})/aktuell/')
START = re.compile(rf'{re.escape(ONLINE)}/?(?=["\')\s#])')
START_EN = re.compile(rf'{re.escape(ONLINE)}/en/')


# Texte je Sprache (#730).
TEXTE = {
    'de': {'fuss': 'Offline-Fassung zu Version {v}', 'online': 'Online-Hilfe', 'neu': 'neueste Fassung',
           'bild': 'Bild: {alt} – [in der Online-Hilfe ansehen]({ziel})', 'ohne': 'Bildschirmfoto'},
    'en': {'fuss': 'Offline edition for version {v}', 'online': 'online help', 'neu': 'latest edition',
           'bild': 'Image: {alt} – [view in the online help]({ziel})', 'ohne': 'Screenshot'},
}
_sprache = 'de'


def unterordner() -> str:
    return '' if _sprache == 'de' else f'{_sprache}/'


def online(seite_url: str = '') -> str:
    return f'{ONLINE}/{HANDBUCH}/{VERSION}/{unterordner()}{seite_url}'


def on_config(config, **_):
    global _sprache
    _sprache = config.theme.get('language') if config.theme.get('language') in TEXTE else 'de'
    text = TEXTE[_sprache]
    config.extra.pop('version', None)
    config.copyright = (config.copyright or '') + (
        f' · {text["fuss"].format(v=VERSION.lstrip("v"))} · '
        f'<a href="{online()}">{text["online"]}</a> · <a href="{ONLINE}/{HANDBUCH}/aktuell/{unterordner()}">{text["neu"]}</a>'
    )
    return config


def on_page_markdown(markdown, page, **_):
    ziel = online(page.url)

    def bild(m):
        alt = m.group(1).strip() or TEXTE[_sprache]['ohne']
        return '*' + TEXTE[_sprache]['bild'].format(alt=alt, ziel=ziel) + '*'

    # Bilder in zwei Fassungen (#only-light / #only-dark, #1524): offline nur ein Hinweis je Bild.
    markdown = re.sub(r'\n?!\[[^\]]*\]\((?:\.\./)*bilder/[^)]*#only-dark\)(\{[^}]*\})?', '', markdown)
    markdown = BILD.sub(bild, markdown)
    markdown = re.sub(r'\]\(vorlagen/([^)]+)\)', lambda m: f']({online("vorlagen/" + m.group(1))})', markdown)
    markdown = markdown.replace('](api/openapi.json)', '](/api/openapi.json)')
    return markdown


def on_post_page(output, **_):
    output = ZWISCHEN.sub(r'/hilfe/\1/', output)
    output = START.sub('/hilfe/', output)
    output = START_EN.sub('/hilfe/en/', output)
    # Kanonischer Verweis und Sitemap-Angaben gehören zur Online-Fassung.
    output = re.sub(r'<link rel="canonical"[^>]*>', '', output)
    return output
