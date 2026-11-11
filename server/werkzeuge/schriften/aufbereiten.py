#!/usr/bin/env python3
"""
Schriften für Ablagos eigene PDFs aufbereiten (#826).

Ablago bettet in die PDFs, die es selbst erzeugt (Stempel, Brief, Export, Aufkleber, Textdokumente, Notfallblatt,
Demo-Dokumente, Textebene beim Schwärzen), Noto Sans als Teilmenge ein. Die fertigen Dateien liegen in
`server/schriften/` und sind Teil des Repositorys: Der Docker-Bau braucht so kein Python. Dieses Skript braucht es
nur, wenn eine neue Fassung von Noto Sans übernommen oder der Zeichenumfang geändert wird.

Was es tut, je Schnitt (Normal, Fett, Kursiv, FettKursiv, Mono):

1. **Kürzen** auf Lateinisch (mit Erweiterungen und Vietnamesisch), Griechisch und Kyrillisch samt Satzzeichen,
   Währungs- und einigen Sonderzeichen (BEREICHE unten). Das spart gut ein Drittel der Größe; Devanagari und die
   seltenen Zusatzblöcke der Quelle fallen weg.
2. **Ohne Hinting** (fpgm, prep, cvt und die Anweisungen in den Zeichen): Für PDFs ohne Nutzen, nur Größe.
3. **Neu schreiben mit `glyf.padding = 4`**: Jedes Zeichen beginnt an einer durch 4 teilbaren Stelle. Ohne diesen
   Schritt beschädigt `@pdf-lib/fontkit` 1.1.1 beim Bilden der Teilmenge viele Zeichen (im Probelauf etwa 60 %
   unsichtbar), obwohl `pdftotext` den Text richtig ausliest. Der Test `schriften.test.ts` prüft darum die Anzeige.

Aufruf (fontTools 4.x, z. B. `pip install fonttools`):

    python3 server/werkzeuge/schriften/aufbereiten.py <quellordner> server/schriften

Der Quellordner enthält die Schnitte in einer der beiden üblichen Benennungen, z. B. `NotoSans-Regular.ttf`
(github.com/notofonts/latin-greek-cyrillic) oder `NotoSans_400Regular.ttf` (npm-Paket `@expo-google-fonts/noto-sans`).
Übernommen ist Noto Sans 2.015 und Noto Sans Mono 2.014 aus `@expo-google-fonts/noto-sans` bzw. `…/noto-sans-mono`
0.4.2 (SHA-256 der Quellen unten). Die Lizenz (SIL Open Font License 1.1, ohne „Reserved Font Name“) liegt als
`OFL.txt` neben den Schriften; die Namen der Schrift bleiben darum unverändert.
"""
import hashlib
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# Zielname → mögliche Namen der Quelle.
SCHNITTE = {
    'NotoSans-Regular.ttf': ['NotoSans-Regular.ttf', 'NotoSans_400Regular.ttf'],
    'NotoSans-Bold.ttf': ['NotoSans-Bold.ttf', 'NotoSans_700Bold.ttf'],
    'NotoSans-Italic.ttf': ['NotoSans-Italic.ttf', 'NotoSans_400Regular_Italic.ttf'],
    'NotoSans-BoldItalic.ttf': ['NotoSans-BoldItalic.ttf', 'NotoSans_700Bold_Italic.ttf'],
    'NotoSansMono-Regular.ttf': ['NotoSansMono-Regular.ttf', 'NotoSansMono_400Regular.ttf'],
}

# Geprüfte Quellen (nur ein Hinweis, falls eine andere Datei kommt).
BEKANNT = {
    'fe8c022f48d8dd29f17b744d16f9346f4357e16f7d4f7be58b000ae7c291b614': 'NotoSans_400Regular.ttf 2.015',
    '13a813c49624ae3ba3c5c6e72c5ebffc4b9e1e6ea32f421c04069b037c6ad431': 'NotoSans_700Bold.ttf 2.015',
    'feb3e57888ce3acb604f270c278cfb304c674306518771619ddbdefca42a066b': 'NotoSans_400Regular_Italic.ttf 2.015',
    '7e34616e092593c340449baf9a259075a054c6419511ccf21ff0d83a1c9dd0d0': 'NotoSans_700Bold_Italic.ttf 2.015',
    '11b5d661e57865bce89d3f103a654cfa4faf9347abebac252e30742be1e657b2': 'NotoSansMono_400Regular.ttf 2.014',
}

# Unicode-Bereiche, die bleiben.
BEREICHE = [
    (0x0000, 0x007F),  # Basis-Lateinisch
    (0x00A0, 0x024F),  # Latin-1, Lateinisch erweitert A und B (Türkisch, Polnisch, Tschechisch, Rumänisch …)
    (0x02B0, 0x02FF),  # Modifikationszeichen (ʼ ˆ ˇ ˘ ˙ ˚ ˛ ˜ ˝)
    (0x0300, 0x036F),  # kombinierende diakritische Zeichen
    (0x0370, 0x03FF),  # Griechisch
    (0x0400, 0x052F),  # Kyrillisch und Ergänzung
    (0x1C80, 0x1C8F),  # Kyrillisch erweitert C
    (0x1E00, 0x1EFF),  # Lateinisch erweitert, zusätzlich (Vietnamesisch)
    (0x1F00, 0x1FFF),  # Griechisch erweitert
    (0x2000, 0x206F),  # allgemeine Satzzeichen („ “ – … • ‰)
    (0x2070, 0x209F),  # Hoch- und Tiefstellungen
    (0x20A0, 0x20CF),  # Währungszeichen (€ ₺ ₽ ₴ ₫ …)
    (0x2100, 0x215F),  # buchstabenartige Symbole, Brüche (№ ™ ℃ ⅓)
    (0x2212, 0x2212),  # Minus
    (0x25CC, 0x25CC),  # gepunkteter Kreis (Träger für kombinierende Zeichen)
    (0x2C60, 0x2C7F),  # Lateinisch erweitert C
    (0x2DE0, 0x2DFF),  # Kyrillisch erweitert A
    (0xA640, 0xA69F),  # Kyrillisch erweitert B
    (0xFB00, 0xFB06),  # Ligaturen (ff, fi, fl …)
    (0xFFFD, 0xFFFD),  # Ersatzzeichen – zeigt Ablago für Zeichen, die die Schrift nicht hat
]


def quelle(ordner: Path, namen: list[str]) -> Path:
    for n in namen:
        if (ordner / n).is_file():
            return ordner / n
    sys.exit(f'Fehlt im Quellordner: {" oder ".join(namen)}')


def aufbereiten(ein: Path, aus: Path) -> None:
    roh = ein.read_bytes()
    pruef = hashlib.sha256(roh).hexdigest()
    if pruef not in BEKANNT:
        print(f'Hinweis: {ein.name} ist nicht die geprüfte Quelle (SHA-256 {pruef}); bitte Test und Anzeige prüfen.')
    font = TTFont(ein)
    opt = subset.Options()
    opt.hinting = False  # ohne fpgm/prep/cvt und Anweisungen
    opt.desubroutinize = True
    opt.notdef_outline = True
    opt.name_IDs = ['*']  # Copyright, Lizenz und Namen behalten (OFL)
    opt.name_languages = ['*']
    opt.layout_features = ['*']
    opt.drop_tables += ['STAT', 'DSIG']
    teil = subset.Subsetter(opt)
    teil.populate(unicodes=[c for a, b in BEREICHE for c in range(a, b + 1)])
    teil.subset(font)
    # Ohne diese Ausrichtung beschädigt @pdf-lib/fontkit 1.1.1 die Teilmenge (siehe oben).
    font['glyf'].padding = 4
    font.save(aus)
    cmap = font.getBestCmap()
    print(f'{aus.name}: {aus.stat().st_size} Bytes, {len(cmap)} Zeichen, {len(font.getGlyphOrder())} Glyphen')


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    ein, aus = Path(sys.argv[1]), Path(sys.argv[2])
    aus.mkdir(parents=True, exist_ok=True)
    for ziel, namen in SCHNITTE.items():
        aufbereiten(quelle(ein, namen), aus / ziel)


if __name__ == '__main__':
    main()
