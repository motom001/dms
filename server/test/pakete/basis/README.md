# Basis

Das Basis-Paket bringt den Mappentyp **Organisation**: für Firmen, Behörden, Ärzte und Praxen, Versicherungen, Banken, Vereine, Vermieter und alle anderen Stellen, mit denen ein Haushalt zu tun hat. Statt den Typ Feld für Feld in der Werkbank zu bauen, installierst du ihn mit einem Klick unter **Werkbank → Pakete**.

## Inhalt

| Mappentyp | wofür | wichtige Felder |
| --- | --- | --- |
| Organisation | jede Stelle, mit der du zu tun hast | Name, Art, Kundennummer, Telefon, E-Mail, Anschrift |

**Register:** Stammdaten, Kontakt, Anschrift, Dokumente, Protokoll.

| Register | Felder |
| --- | --- |
| Stammdaten | **Name** (Pflicht, eindeutig), Kürzel, **Art** (Mehrfachauswahl: Lieferant, Kunde, Bank, Versicherung, Behörde, Arbeitgeber, Arzt/Praxis, Handwerker, Vermieter, Verein, Versorger, Sonstige), **Kundennummer**, Beschreibung |
| Kontakt | Telefon, Fax, E-Mail (wird auf die Form geprüft), Internetseite |
| Anschrift | Straße, Hausnummer, PLZ, Ort, Land (Vorgabe: Deutschland) |

Die **Kundennummer** ist *deine* Nummer bei der Organisation – Kunden-, Mitglieds-, Versicherten- oder Patientennummer. Sie steht so auf Briefen und Rechnungen und hilft beim Zuordnen.

**Trefferliste:** Name, Art, Ort, Telefon.

**Sichten:** *Organisationen* (alle) und darunter *Versicherungen*, *Banken*, *Behörden* sowie *Ärzte und Praxen* – jeweils die Organisationen mit dieser Art. Eine Organisation mit mehreren Arten erscheint in mehreren Sichten.

**Beispiele (optional):** „Stadtwerke Musterstadt“ und „Praxis Dr. Beispiel“ mit erfundenen Daten.

## Voraussetzungen

- DMS ab Version 0.63 (Paketverwaltung)
- keine weiteren Pakete

## Rechte und Netz

Dieses Paket enthält keinen Code. Es legt nur einen Mappentyp und Sichten an.

## Nach der Installation

1. Unter **Ablage → Organisationen** neue Organisationen anlegen.
2. Bei bestehenden Typen (z. B. „Vertragspartner“) ändert das Paket nichts. Wer umsteigen will, verweist in seinen Typen künftig auf „Organisation“.

## Pflege

Fehler und Wünsche bitte als [Issue in dms-registry](https://github.com/motom001/dms-registry/issues) mit „Basis“ im Titel.
