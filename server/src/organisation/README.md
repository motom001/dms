# Eigene Organisation (#995)

**Zweck:** Name, Anschrift, Kontakt und die Verantwortlichen im Sinne der DSGVO werden einmal gepflegt – an einer
Mappe vom Typ Organisation (Paket Basis), deren Ja/Nein-Feld das Merkmal „eigene Organisation“ trägt. Dieser
Fachordner liest diese Angaben für alle Stellen, die sie brauchen (Datenschutz-Auskunft, Löschkonzept), und bedient
Werkbank → Benutzer und Sicherheit → Eigene Organisation. Schicht 3 (nicht in `SCHICHTEN` genannt).

- `organisation.dienst.ts` – `OrganisationDienst`: `liste` (eigene Organisationen mit der festen Liste), `geltende`
  (für Auskünfte und Unterlagen), `verantwortlicherText` (Deckblatt, Löschkonzept), `stand` (Werkbank), `setze`
  (Wahl und freigegebene Rollen), `geaendert` (Notiz an die Verwaltung, Systemprotokoll, Mail) und `uebernehmen`
  (bisherige Angabe „Verantwortlicher“ der Auskunft als Organisation anlegen).
- `organisation.routen.ts` – Werkbank-Routen unter `/api/werkbank/organisation` (Bereich `organisation`).
- `index.ts` – die einzige Tür.

**Abhängigkeiten**

- Kern (Einstellungen, `eigeneOrganisationen()`), `shared/src/organisation.ts` (feste Liste, Bedeutungen, Texte) und
  über den Anschluss die Mappen (Übernehmen) und die Mail an die Verwaltenden.
- Den Schreibschutz am Feld prüfen die Mappen (`mappen/schreibschutz.ts`, Schicht 2) – nicht dieser Ordner.

**Regeln (Ergänzung Sicherheit)**

- Mit Systemrechten nur die feste Liste: Name, Anschrift, E-Mail, Telefon, Verantwortlicher, Datenschutzbeauftragter.
  Je Bedeutung genau ein Feld (das erste in Registerreihenfolge), nur Feldart Text, gekürzt. Beim Verweis auf eine
  Person oder Organisation dieselbe Liste dort. Keine Titel (die Titel-Vorlage könnte andere Felder enthalten).
- Geschrieben wird nur in der Ablage mit normalen Rechten. Hier liegen nur Verweis, Rollen und Notizen
  (Einstellung `eigene_organisation`).
- Jede Änderung am Merkmal, an den Verantwortlichen, an der Wahl und an den Rollen steht im Systemprotokoll
  (Modul datenschutz).
