#!/usr/bin/env python3
"""
Zeichnet die Grafiken zu „Für wen wir bauen“ (#279): je Persona eine Szene mit den Funktionen,
die sie braucht, und eine Übersicht der Skala vom Haushalt bis zum Konzern.

    python3 docs/handbuch/werkzeuge/personas_grafiken.py

Schreibt nach docs/handbuch/entwickler/docs/grafiken/ (alle) und die Übersicht zusätzlich nach
docs/handbuch/benutzer/docs/grafiken/ – dort auch auf Englisch für README.en.md (personas-skala.en.svg, #574).
Die Karten gibt es seit #730 auch auf Englisch (persona-*.en.svg) für das englische Entwicklerhandbuch. Stil wie die übrigen Grafiken der Handbücher: helle Karte mit
Rand, gut lesbar im hellen und im dunklen Design. Gezeichnete Figuren, keine Fotos echter Menschen.
"""
from pathlib import Path
from xml.sax.saxutils import escape

WURZEL = Path(__file__).resolve().parents[1]
ZIEL = WURZEL / 'entwickler' / 'docs' / 'grafiken'
ZIEL_BENUTZER = WURZEL / 'benutzer' / 'docs' / 'grafiken'

TINTE, LEISE, LINIE, KARTE = '#1c2328', '#5b6670', '#dde2e6', '#ffffff'
HAUT, HAUT2 = '#f1c9a5', '#c99a72'
FOKUS = {
    'kern': ('#2e7d32', '#e8f5e9', 'Kernfokus'),
    'fokus': ('#00897b', '#e0f2f1', 'Fokus'),
    'unterstuetzt': ('#546e7a', '#eceff1', 'unterstützt'),
    'nicht': ('#90a4ae', '#f5f7f8', 'nicht im Fokus'),
}
SCHRIFT = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def t(x, y, s, size=14, fill=TINTE, weight=400, anchor='start'):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{escape(s)}</text>'


def svg(w, h, titel, inhalt):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{escape(titel)}" style="{SCHRIFT}">\n'
            f'<title>{escape(titel)}</title>\n<rect x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="14" fill="{KARTE}" stroke="{LINIE}"/>\n{inhalt}\n</svg>\n')


# ---------- Figuren und Dinge (einfache, freundliche Formen) ----------

def person(x, y, s=1.0, kleid='#5c6bc0', haar='#5d4037', haut=HAUT, alt=False, kind=False):
    """Stehende Figur, Füße bei (x, y); Höhe etwa 120·s."""
    k = 0.62 if kind else 1.0
    s *= k
    kopf = f'<circle cx="{x}" cy="{y - 104 * s}" r="{14 * s}" fill="{haut}"/>'
    haare = f'<path d="M{x - 14 * s} {y - 106 * s} a{14 * s} {14 * s} 0 0 1 {28 * s} 0 q{-4 * s} {-8 * s} {-14 * s} {-8 * s} q{-10 * s} 0 {-14 * s} {8 * s}z" fill="{"#cfd8dc" if alt else haar}"/>'
    koerper = f'<path d="M{x - 18 * s} {y - 44 * s} q0 {-42 * s} {18 * s} {-44 * s} q{18 * s} {2 * s} {18 * s} {44 * s}z" fill="{kleid}"/>'
    beine = (f'<rect x="{x - 12 * s}" y="{y - 46 * s}" width="{10 * s}" height="{46 * s}" rx="{4 * s}" fill="#455a64"/>'
             f'<rect x="{x + 2 * s}" y="{y - 46 * s}" width="{10 * s}" height="{46 * s}" rx="{4 * s}" fill="#455a64"/>')
    stock = f'<path d="M{x + 26 * s} {y - 62 * s} v{62 * s}" stroke="#795548" stroke-width="{3 * s}" stroke-linecap="round"/><path d="M{x + 16 * s} {y - 70 * s} l{10 * s} {8 * s}" stroke="{haut}" stroke-width="{6 * s}" stroke-linecap="round"/>' if alt else ''
    return beine + koerper + kopf + haare + stock


def kind_auf_arm(x, y, s=1.0):
    """Kleines Kind auf dem linken Arm einer Figur mit Füßen bei (x, y)."""
    return (f'<circle cx="{x - 22 * s}" cy="{y - 92 * s}" r="{9 * s}" fill="{HAUT}"/>'
            f'<path d="M{x - 30 * s} {y - 60 * s} q0 {-24 * s} {8 * s} {-24 * s} q{8 * s} 0 {8 * s} {24 * s}z" fill="#ffb74d"/>'
            f'<path d="M{x - 18 * s} {y - 68 * s} q{-10 * s} {4 * s} {-16 * s} {-2 * s}" stroke="{HAUT}" stroke-width="{6 * s}" stroke-linecap="round" fill="none"/>')


def handy(x, y, s=1.0):
    return f'<rect x="{x}" y="{y}" width="{14 * s}" height="{24 * s}" rx="{3 * s}" fill="#263238"/><rect x="{x + 2 * s}" y="{y + 3 * s}" width="{10 * s}" height="{16 * s}" rx="1" fill="#80deea"/>'


def nas(x, y, s=1.0):
    schaechte = ''.join(f'<rect x="{x + (8 + i * 14) * s}" y="{y + 10 * s}" width="{10 * s}" height="{34 * s}" rx="2" fill="#90a4ae"/>' for i in range(4))
    return (f'<rect x="{x}" y="{y}" width="{72 * s}" height="{56 * s}" rx="{6 * s}" fill="#37474f"/>{schaechte}'
            f'<circle cx="{x + 64 * s}" cy="{y + 48 * s}" r="{2.5 * s}" fill="#69f0ae"/>')


def haus(x, y, w=110, h=80, farbe='#ffe0b2', dach='#8d6e63', pv=False):
    """Haus mit Boden bei y."""
    d = f'<rect x="{x}" y="{y - h}" width="{w}" height="{h}" fill="{farbe}" stroke="#bcaaa4"/>'
    d += f'<path d="M{x - 8} {y - h} L{x + w / 2} {y - h - 46} L{x + w + 8} {y - h}z" fill="{dach}"/>'
    if pv:
        for i in range(3):
            d += f'<path d="M{x + 14 + i * 18} {y - h - 10 - i * 10} l16 -12 l8 8 l-16 12z" fill="#1e3a5f" stroke="#90caf9" stroke-width="0.8"/>'
        d += f'<circle cx="{x + w + 26}" cy="{y - h - 58}" r="12" fill="#ffca28"/>'
    for i in range(2):
        for j in range(2 if h > 70 else 1):
            d += f'<rect x="{x + 14 + i * (w - 46)}" y="{y - h + 12 + j * 34}" width="18" height="18" fill="#bbdefb" stroke="#90a4ae"/>'
    d += f'<rect x="{x + w / 2 - 10}" y="{y - 30}" width="20" height="30" fill="#6d4c41"/>'
    return d


def mietshaus(x, y, w=120, h=120):
    d = f'<rect x="{x}" y="{y - h}" width="{w}" height="{h}" fill="#ffccbc" stroke="#bcaaa4"/>'
    d += f'<path d="M{x - 6} {y - h} L{x + w / 2} {y - h - 34} L{x + w + 6} {y - h}z" fill="#795548"/>'
    for i in range(4):
        d += f'<path d="M{x + 8 + i * 26} {y - h - 4 - (i if i < 2 else 3 - i) * 12} l20 -10 l6 6 l-20 10z" fill="#1e3a5f" stroke="#90caf9" stroke-width="0.8"/>'
    for r in range(3):
        for c in range(3):
            d += f'<rect x="{x + 12 + c * 36}" y="{y - h + 12 + r * 34}" width="22" height="20" fill="#bbdefb" stroke="#90a4ae"/>'
    d += f'<circle cx="{x + w + 20}" cy="{y - h - 50}" r="12" fill="#ffca28"/>'
    return d


def buero(x, y, w=150, h=130, stockwerke=4, farbe='#cfd8dc'):
    d = f'<rect x="{x}" y="{y - h}" width="{w}" height="{h}" fill="{farbe}" stroke="#90a4ae"/>'
    for r in range(stockwerke):
        for c in range(int(w // 26)):
            d += f'<rect x="{x + 8 + c * 26}" y="{y - h + 10 + r * (h - 20) / stockwerke}" width="16" height="{(h - 20) / stockwerke - 8}" fill="#e3f2fd" stroke="#b0bec5"/>'
    return d


def tisch(x, y, w=150):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="8" rx="2" fill="#a1887f"/><rect x="{x + 8}" y="{y + 8}" width="6" height="44" fill="#8d6e63"/>'
            f'<rect x="{x + w - 14}" y="{y + 8}" width="6" height="44" fill="#8d6e63"/>')


def laptop(x, y, s=1.0):
    return (f'<rect x="{x}" y="{y - 30 * s}" width="{46 * s}" height="{30 * s}" rx="3" fill="#455a64"/><rect x="{x + 3 * s}" y="{y - 27 * s}" width="{40 * s}" height="{24 * s}" fill="#b2ebf2"/>'
            f'<rect x="{x - 6 * s}" y="{y}" width="{58 * s}" height="{4 * s}" rx="2" fill="#78909c"/>')


def papiere(x, y, n=3):
    return ''.join(f'<rect x="{x + i * 8}" y="{y - i * 5}" width="34" height="42" rx="2" fill="#fff" stroke="#b0bec5" transform="rotate({-8 + i * 7} {x + i * 8 + 17} {y - i * 5 + 21})"/>'
                   f'<path d="M{x + i * 8 + 6} {y - i * 5 + 12}h20M{x + i * 8 + 6} {y - i * 5 + 20}h16" stroke="#b0bec5" transform="rotate({-8 + i * 7} {x + i * 8 + 17} {y - i * 5 + 21})"/>' for i in range(n))


def stecknadel(x, y, farbe='#e53935'):
    return f'<path d="M{x} {y} c-10 -14 -12 -20 -12 -26 a12 12 0 1 1 24 0 c0 6 -2 12 -12 26z" fill="{farbe}"/><circle cx="{x}" cy="{y - 26}" r="5" fill="#fff"/>'


def schild(x, y, s=1.0, farbe='#3949ab'):
    return f'<path d="M{x} {y} l{18 * s} {6 * s} v{14 * s} c0 {12 * s} {-8 * s} {20 * s} {-18 * s} {26 * s} c{-10 * s} {-6 * s} {-18 * s} {-14 * s} {-18 * s} {-26 * s} v{-14 * s}z" fill="{farbe}"/><path d="M{x - 7 * s} {y + 22 * s} l{5 * s} {5 * s} l{10 * s} {-11 * s}" stroke="#fff" stroke-width="{3 * s}" fill="none" stroke-linecap="round"/>'


def boden(x1, x2, y):
    return f'<path d="M{x1} {y}H{x2}" stroke="{LINIE}" stroke-width="2"/>'


def sprechblase(x, y, text, w=None):
    w = w or 12 + len(text) * 7.2
    return (f'<rect x="{x}" y="{y}" width="{w}" height="26" rx="13" fill="#fff8e1" stroke="#ffcc80"/>'
            + t(x + w / 2, y + 17.5, text, 12.5, '#6d4c41', 600, 'middle'))


# ---------- Karte je Persona ----------

def chips(x, y, liste, farbe, breite=430):
    erg, cx, cy = '', x, y
    for c in liste:
        w = 26 + len(c) * 7.3
        if cx + w > x + breite:
            cx, cy = x, cy + 34
        erg += f'<rect x="{cx}" y="{cy}" width="{w}" height="26" rx="13" fill="#fff" stroke="{farbe}"/><circle cx="{cx + 12}" cy="{cy + 13}" r="4" fill="{farbe}"/>' + t(cx + 22, cy + 17.5, c, 12.5, TINTE)
        cx += w + 8
    return erg, cy + 26


# Feste Wörter der Karten je Sprache (#730)
KARTE_TEXT = {
    'de': {'stufe': 'Stufe', 'braucht': 'Braucht von Ablago', 'titel_braucht': 'Braucht'},
    'en': {'stufe': 'Level', 'braucht': 'What they need from Ablago', 'titel_braucht': 'Needs'},
}


def karte(datei, stufe, name, wer, fokus, szene, braucht, satz, sprache='de'):
    farbe, hell, fokustext = FOKUS[fokus]
    kt = KARTE_TEXT[sprache]
    if sprache != 'de':
        fokustext = TEXTE[sprache]['baender'][fokus]
        fokustext = fokustext[0].upper() + fokustext[1:]
        datei = datei.replace('.svg', f'.{sprache}.svg')
    rechts = 360
    inhalt = f'<rect x="12" y="12" width="330" height="296" rx="10" fill="{hell}"/>' + szene
    inhalt += f'<rect x="{rechts}" y="26" width="96" height="24" rx="12" fill="{farbe}"/>' + t(rechts + 48, 43, f'{kt["stufe"]} {stufe}', 12.5, '#fff', 700, 'middle')
    inhalt += t(rechts + 106, 43, fokustext, 13, farbe, 700)
    inhalt += t(rechts, 80, name, 21, TINTE, 700)
    inhalt += t(rechts, 104, wer, 13.5, LEISE)
    inhalt += t(rechts, 140, kt['braucht'], 12, LEISE, 700)
    c, ende = chips(rechts, 150, braucht, farbe)
    inhalt += c
    for i, zeile in enumerate(satz):
        inhalt += t(rechts, max(ende + 30, 262) + i * 18, zeile, 13, LEISE)
    titel = f'{kt["stufe"]} {stufe}, {fokustext}: {name} – {wer}. {kt["titel_braucht"]}: {", ".join(braucht)}.'
    (ZIEL / datei).write_text(svg(800, 320, titel, inhalt), encoding='utf-8')


# Englische Texte der Karten (#730): je Datei Name, Wer, Sprechblase, Braucht, Satz.
KARTEN_EN = {
    'persona-1-lena.svg': ('Beginner family · Lena', 'Lena (38), Tom, two children · rented flat · no IT background', 'Where is the receipt?',
                           ['ready-made packages', 'deadline reminders', 'effortless backup', 'app store install', 'help with pictures'],
                           ['Success: after an hour the first folder with a', 'document is in Ablago – without opening the manual.']),
    'persona-2-jonas.svg': ('Family member · Jonas', 'Jonas (16) or Tom, who "just has a look" · mostly on the phone', 'Found my report!',
                            ['Library on the phone', 'plain language', 'only own folders', 'completing tasks', 'filing a photo'],
                            ['Success: finds what he needs on his own', 'and doesn\'t have to ask.']),
    'persona-3-markus.svg': ('Household admin · Markus', 'Markus (45) · own home, family, vehicles · NAS with Docker', 'House › Heating › Service',
                             ['own folder types', 'permissions', 'mailbox and scanner', 'backup 3-2-1', 'Workbench level Household', 'API and console', 'full export'],
                             ['Important: Markus sets up Ablago for Lena and Jonas –', 'the two must understand what he builds.']),
    'persona-4-petra.svg': ('Looking after parents · Petra', 'Petra (52), two brothers · mother (81) lives alone · three cities', None,
                            ['views for a role', 'access on the go', 'two-factor sign-in', 'tasks for people', 'absence and stand-in'],
                            ['Powers of attorney, doctors\' letters, care insurance in', 'one place – and all siblings see the same.']),
    'persona-5-oezdemir.svg': ('Landlord · Mr Özdemir', 'employed · 2 apartment buildings, 6 flats · solar panels', 'Receipts for the tax year',
                               ['package Letting', 'export for the tax adviser', 'deadlines (statement)', 'meter readings', 'templates'],
                               ['Service charges, tenant changes, tradespeople and tax –', 'findable per property and tax year.']),
    'persona-6-katrin.svg': ('Self-employed · Katrin', 'graphic designer · sole trader · one part-time employee', 'E-invoice in the original',
                             ['archive mode (GoBD)', 'versions', 'number sequences', 'procedure documentation', 'private and business apart'],
                             ['We don\'t promise a certificate – we provide tools', 'and honest documentation.']),
    'persona-7-brandt.svg': ('Small business · Brandt joinery', '12 employees · office manager · external IT service provider', 'Sign in with Microsoft 365',
                             ['sign-in via a provider', 'two-factor', 'archive mode', 'permissions per role', 'mailboxes', 'stand-ins'],
                             ['Gap today: graded administrator permissions –', 'an open point since small businesses joined the focus.']),
    'persona-8-mittelstand.svg': ('Mid-sized company · tax firm group', '120 employees · 3 locations · own IT · data protection', 'Data protection officer',
                                  ['single sign-on with groups', 'graded admin permissions', 'four-eyes principle', 'log export (SIEM)', 'multilingual', 'support'],
                                  ['Supported: what doesn\'t burden families may go in –', 'but much would make setup harder.']),
    'persona-9-konzern.svg': ('Large enterprise · corporation', '2,000+ employees · IT department · compliance', None,
                              ['high availability', 'several tenants', 'directory service', 'legal hold', 'certifications', 'ERP/CRM'],
                              ['Open source (Apache-2.0): may use and extend Ablago.', 'But we don\'t design for it.']),
}


def alle_karten(sprache='de'):
    if sprache != 'de':
        # Dieselben Szenen, die Texte aus KARTEN_EN; Sprechblasen werden mit dem englischen Text neu gezeichnet.
        global karte, sprechblase
        de_karte, de_blase = karte, sprechblase
        aktuell = {}

        def sprechblase(x, y, text, w=None):  # noqa: F811 – nur für diesen Lauf
            neu = aktuell.get('blase') or text
            return de_blase(x, y, neu, None if aktuell.get('blase') else w)

        def karte(datei, stufe, name, wer, fokus, szene, braucht, satz):  # noqa: F811
            n, w, _, b, sz = KARTEN_EN[datei]
            return de_karte(datei, stufe, n, w, fokus, szene, b, sz, sprache)

        try:
            for datei, (_, _, blase, _, _) in KARTEN_EN.items():
                aktuell['blase'] = blase
                _zeichne(datei)
        finally:
            karte, sprechblase = de_karte, de_blase
        return
    for datei in KARTEN_EN:
        _zeichne(datei)


def _zeichne(nur):
    karte_ = karte
    def karte_wenn(datei, *a):
        if datei == nur:
            karte_(datei, *a)
    _alle_karten(karte_wenn)


def _alle_karten(karte):
    B = 290  # Boden der Szene
    karte('persona-1-lena.svg', 1, 'Einsteiger-Familie · Lena', 'Lena (38), Tom, zwei Kinder · Mietwohnung · kein IT-Hintergrund', 'kern',
          boden(24, 330, B) + haus(190, B, 120, 86) + person(110, B, 1.45, '#ec407a') + kind_auf_arm(110, B, 1.45)
          + papiere(42, 80) + sprechblase(150, 36, 'Wo ist der Kaufbeleg?'),
          ['fertige Pakete', 'Fristen-Erinnerung', 'Sicherung ohne Mühe', 'App-Store-Installation', 'Hilfe mit Bildern'],
          ['Erfolg: Nach einer Stunde liegt die erste Mappe mit', 'Dokument in Ablago – ohne ins Handbuch zu schauen.'])
    karte('persona-2-jonas.svg', 2, 'Familienmitglied · Jonas', 'Jonas (16) oder Tom, der „nur mal nachschaut“ · fast nur am Handy', 'kern',
          boden(24, 330, B) + person(140, B, 1.5, '#26a69a', '#3e2723') + handy(160, B - 120, 1.6)
          + sprechblase(196, 70, 'Zeugnis gefunden!', 128) + schild(270, 150, 1.4, '#43a047'),
          ['Ablage am Handy', 'einfache Sprache', 'nur eigene Mappen', 'Aufgaben erledigen', 'Foto ablegen'],
          ['Erfolg: findet allein, was er braucht,', 'und muss nicht fragen.'])
    karte('persona-3-markus.svg', 3, 'Haushalts-Admin · Markus', 'Markus (45) · Eigenheim, Familie, Fahrzeuge · NAS mit Docker', 'kern',
          boden(24, 330, B) + haus(196, B, 110, 80) + person(110, B, 1.45, '#5c6bc0') + tisch(30, B - 70, 150)
          + nas(42, B - 126, 1.0) + laptop(120, B - 70, 1.0) + sprechblase(150, 32, 'Haus › Heizung › Wartung', 172),
          ['eigene Mappentypen', 'Berechtigungen', 'Postfach und Scanner', 'Sicherung 3-2-1', 'Werkbank-Stufe Haushalt', 'API und Konsole', 'Vollexport'],
          ['Wichtig: Markus richtet Ablago für Lena und Jonas ein –', 'die beiden müssen verstehen, was er baut.'])
    karte('persona-4-petra.svg', 4, 'Für die Eltern sorgen · Petra', 'Petra (52) und zwei Brüder · Mutter (81) lebt allein · drei Städte', 'fokus',
          boden(24, 330, B) + person(80, B, 1.25, '#8e24aa') + person(160, B, 1.2, '#78909c', alt=True)
          + stecknadel(240, 120, '#e53935') + stecknadel(286, 160, '#1e88e5') + stecknadel(258, 214, '#43a047')
          + '<path d="M240 120 Q 262 140 286 160 Q 270 190 258 214" stroke="#90a4ae" stroke-dasharray="4 4" fill="none"/>'
          + handy(276, 236, 1.2) + schild(52, 40, 1.2, '#3949ab'),
          ['Sichten für eine Rolle', 'Zugriff von unterwegs', 'Zwei-Faktor-Anmeldung', 'Aufgaben an Personen', 'Abwesenheit und Vertretung'],
          ['Vollmachten, Arztbriefe, Pflegekasse an einem Ort –', 'und alle Geschwister sehen dasselbe.'])
    karte('persona-5-oezdemir.svg', 5, 'Vermieter · Herr Özdemir', 'angestellt · 2 Mehrfamilienhäuser, 6 Wohnungen · Photovoltaik', 'fokus',
          boden(24, 330, B) + mietshaus(164, B, 130, 126) + person(100, B, 1.45, '#6d4c41', '#212121') + papiere(30, 70, 2)
          + sprechblase(30, 30, 'Belege fürs Steuerjahr', 160),
          ['Paket Vermietung', 'Export für den Steuerberater', 'Fristen (Abrechnung)', 'Zählerstände', 'Vorlagen'],
          ['Nebenkosten, Mieterwechsel, Handwerker und Anlage V –', 'je Objekt und Steuerjahr wiederzufinden.'])
    karte('persona-6-katrin.svg', 6, 'Selbständige · Katrin', 'Grafikdesignerin · Einzelunternehmerin · eine Teilzeitkraft', 'fokus',
          boden(24, 330, B) + tisch(120, B - 70, 190) + laptop(150, B - 70, 1.1) + papiere(236, B - 112, 3)
          + person(80, B, 1.45, '#00838f', '#4e342e') + sprechblase(150, 40, 'E-Rechnung im Original', 168),
          ['Archivmodus (GoBD)', 'Versionen', 'Nummernkreise', 'Verfahrensdokumentation', 'Privat und Geschäft getrennt'],
          ['Wir versprechen kein Zertifikat – wir liefern Werkzeuge', 'und ehrliche Doku.'])
    karte('persona-7-brandt.svg', 7, 'Kleinbetrieb · Tischlerei Brandt', '12 Mitarbeitende · Büroleiterin · externer IT-Dienstleister', 'fokus',
          boden(24, 330, B) + buero(180, B, 140, 110, 3, '#d7ccc8') + person(70, B, 1.35, '#ef6c00') + person(130, B, 1.35, '#546e7a', '#263238')
          + laptop(150, B - 62, 0.8) + sprechblase(30, 34, 'Anmeldung mit Microsoft 365', 196),
          ['Anmeldung über einen Anbieter', 'Zwei-Faktor', 'Archivmodus', 'Rechte je Rolle', 'Postfächer', 'Vertretung'],
          ['Lücke heute: abgestufte Administratorrechte –', 'seit Kleinbetriebe zum Fokus gehören, ein offener Punkt.'])
    karte('persona-8-mittelstand.svg', 8, 'Mittelstand · Steuerkanzlei-Verbund', '120 Mitarbeitende · 3 Standorte · eigene IT · Datenschutz', 'unterstuetzt',
          boden(24, 330, B) + buero(160, B, 160, 150, 5) + person(60, B, 1.25, '#3949ab') + person(112, B, 1.25, '#5d4037', '#212121')
          + schild(86, 74, 1.1, '#3949ab') + sprechblase(30, 26, 'Datenschutzbeauftragter', 176),
          ['Single Sign-on mit Gruppen', 'abgestufte Admin-Rechte', 'Vier-Augen-Prinzip', 'Protokoll-Export (SIEM)', 'Mehrsprachigkeit', 'Support'],
          ['Unterstützt: Was ohne Nachteil für Familien geht, darf rein –', 'vieles würde die Einrichtung aber schwerer machen.'])
    karte('persona-9-konzern.svg', 9, 'Großunternehmen · Konzernbereich', '2.000+ Mitarbeitende · IT-Abteilung · Compliance', 'nicht',
          boden(24, 330, B) + buero(40, B, 120, 240, 9, '#b0bec5') + buero(180, B, 140, 190, 7)
          + ''.join(person(200 + i * 28, B, 0.55, ['#3949ab', '#00897b', '#6d4c41', '#8e24aa', '#546e7a'][i]) for i in range(5)),
          ['Hochverfügbarkeit', 'mehrere Mandanten', 'Verzeichnisdienst', 'Legal Hold', 'Zertifizierungen', 'ERP/CRM'],
          ['Open Source (Apache-2.0): darf Ablago einsetzen und erweitern.', 'Wir gestalten aber nicht dafür.'])


# ---------- Übersicht der Skala ----------

# Je Sprache eine Datei (#574): personas-skala.svg (Deutsch, Handbücher und README.md) und personas-skala.en.svg
# (Englisch, README.en.md). Grafiken mit Text gibt es je Sprache – siehe CONTRIBUTING.
TEXTE = {
    'de': {
        'datei': 'personas-skala.svg',
        'ueberschrift': 'Für wen wir Ablago bauen – Stand 03.11.2026',
        'links': 'privat', 'rechts': 'Unternehmen',
        'stufen': [('Einsteiger-', 'Familie'), ('Familien-', 'mitglied'), ('Haushalts-', 'Admin'), ('Für die', 'Eltern sorgen'),
                   ('Vermieter', ''), ('Selbständige', ''), ('Kleinbetrieb', ''), ('Mittelstand', ''), ('Groß-', 'unternehmen')],
        'baender': {'kern': 'Kernfokus', 'fokus': 'Fokus', 'unterstuetzt': 'unterstützt', 'nicht': 'nicht im Fokus'},
        'fuss': 'Im Zweifel gewinnt die Einfachheit für Stufe 1–3. Den Fokus verschieben wir nur bewusst.',
        'titel': ('Skala vom Haushalt bis zum Konzern: Kernfokus Stufe 1–3 (Einsteiger-Familie, Familienmitglied, Haushalts-Admin), '
                  'Fokus 4–7 (Für die Eltern sorgen, Vermieter, Selbständige, Kleinbetrieb), unterstützt 8 (Mittelstand), nicht im Fokus 9 (Großunternehmen).'),
        'ziele': [ZIEL, ZIEL_BENUTZER],
    },
    'en': {
        'datei': 'personas-skala.en.svg',
        'ueberschrift': 'Who we build Ablago for – as of 3 Nov 2026',
        'links': 'private', 'rechts': 'business',
        'stufen': [('Beginner', 'family'), ('Family', 'member'), ('Household', 'admin'), ('Looking after', 'parents'),
                   ('Landlord', ''), ('Self-', 'employed'), ('Small', 'business'), ('Mid-sized', 'company'), ('Large', 'enterprise')],
        'baender': {'kern': 'core focus', 'fokus': 'focus', 'unterstuetzt': 'supported', 'nicht': 'not in focus'},
        'fuss': 'When in doubt, simplicity for levels 1–3 wins. We only shift the focus deliberately.',
        'titel': ('Scale from household to large enterprise: core focus levels 1–3 (beginner family, family member, household admin), '
                  'focus 4–7 (looking after parents, landlord, self-employed, small business), supported 8 (mid-sized company), not in focus 9 (large enterprise).'),
        'ziele': [ZIEL, ZIEL_BENUTZER],
    },
}
FOKUS_JE_STUFE = ['kern', 'kern', 'kern', 'fokus', 'fokus', 'fokus', 'fokus', 'unterstuetzt', 'nicht']


def uebersicht(sprache='de'):
    tx = TEXTE[sprache]
    w, h = 860, 300
    x0, dx = 60, 92
    inhalt = t(w / 2, 40, tx['ueberschrift'], 17, TINTE, 700, 'middle')
    inhalt += t(40, 74, tx['links'], 13, LEISE, 600) + t(w - 40, 74, tx['rechts'], 13, LEISE, 600, 'end')
    inhalt += f'<path d="M40 84H{w - 40}" stroke="{LINIE}" stroke-width="2"/><path d="M{w - 48} 79l8 5-8 5" fill="none" stroke="{LINIE}" stroke-width="2"/>'
    for nr, ((a, b), f) in enumerate(zip(tx['stufen'], FOKUS_JE_STUFE), start=1):
        cx = x0 + (nr - 1) * dx + 6
        farbe, hell, _ = FOKUS[f]
        inhalt += f'<circle cx="{cx}" cy="136" r="30" fill="{hell}" stroke="{farbe}" stroke-width="3"/>'
        # kleine Figuren: Zahl der Köpfe wächst mit der Größe
        koepfe = [1, 1, 1, 3, 1, 1, 4, 6, 9][nr - 1]
        for i in range(min(koepfe, 9)):
            px = cx - 16 + (i % 3) * 16 if koepfe > 1 else cx
            py = 128 + (i // 3) * 10 if koepfe > 1 else 136
            r = 5 if koepfe > 1 else 9
            inhalt += f'<circle cx="{px}" cy="{py - (6 if koepfe > 3 else 0)}" r="{r}" fill="{farbe}"/>'
        inhalt += t(cx, 186, f'{nr}', 13, farbe, 700, 'middle') + t(cx, 204, a, 12.5, TINTE, 600, 'middle') + t(cx, 220, b, 12.5, TINTE, 600, 'middle')
    for von, bis, f in [(1, 3, 'kern'), (4, 7, 'fokus'), (8, 8, 'unterstuetzt'), (9, 9, 'nicht')]:
        farbe, hell, _ = FOKUS[f]
        xa, xb = x0 + (von - 1) * dx - 34, x0 + (bis - 1) * dx + 46
        inhalt += f'<rect x="{xa}" y="236" width="{xb - xa}" height="34" rx="14" fill="{hell}" stroke="{farbe}"/>'
        text = tx['baender'][f]
        if von == bis and ' ' in text and len(text) > 11:
            # Band über nur eine Stufe (#700): zweizeilig und kleiner, damit nichts über den Rand läuft
            a, b = text.rsplit(' ', 1)
            inhalt += t((xa + xb) / 2, 250, a, 11, farbe, 700, 'middle') + t((xa + xb) / 2, 264, b, 11, farbe, 700, 'middle')
        else:
            inhalt += t((xa + xb) / 2, 258, text, 13 if von != bis else 11.5, farbe, 700, 'middle')
    inhalt += t(w / 2, 290, tx['fuss'], 12.5, LEISE, 400, 'middle')
    inhalt_svg = svg(w, h + 10, tx['titel'], inhalt)
    for ziel in tx['ziele']:
        (ziel / tx['datei']).write_text(inhalt_svg, encoding='utf-8')


if __name__ == '__main__':
    ZIEL.mkdir(parents=True, exist_ok=True)
    for sprache in TEXTE:
        alle_karten(sprache)
        uebersicht(sprache)
    print(f'Grafiken geschrieben nach {ZIEL}')
