# Eigene Organisation

**Werkbank → Einstellungen → Eigene Organisation** fasst zwei Dinge zusammen, die zusammengehören: oben die [Nutzung](#nutzung) der Ablage (privat oder auch beruflich), darunter deine **eigene Organisation**. Du setzt einmal den Haken „beruflich“ und richtest dann die Organisation ein – danach ist Ruhe. Der Bereich steht in jeder Werkbank-Vorlage; die frühere Adresse */werkbank/nutzung* führt hierher.

Name, Anschrift, Kontakt und die Verantwortlichen im Sinne der DSGVO pflegst du **einmal** – an der Organisation in der Ablage, die das Merkmal **„eigene Organisation“** trägt. Alle Stellen in Ablago, die diese Angaben brauchen, holen sie von dort. Katrin legt so die Tischlerei Brandt als Organisation an, setzt den Haken „Eigene Organisation“ und trägt Anschrift und Kontakt ein – fertig. Die Werkbank-Seite ist dafür nur ein schlanker Verweis.

!!! note "Keine Rechtsberatung"
    Ob und wen du als Verantwortlichen oder Datenschutzbeauftragten nennen musst, klärst du im Zweifel fachlich.

## Nutzung: privat oder beruflich { #nutzung }

Ganz oben auf der Seite legst du einmal für die ganze Ablage fest, ob sie **auch beruflich genutzt** wird – etwa von Katrin als Selbständiger, im Verein oder in der Tischlerei. Vorgabe ist *nein*: Eine neue Ablage gilt als privat. Gespeichert wird der Haken über seine eigene Speicherleiste.

Das ist bewusst **nur dieses eine Merkmal**. Alles Weitere ergibt sich aus Feldwerten der Mappen oder aus den installierten [Paketen](pakete.md).

### Was das Merkmal bewirkt

- **Mappentypen** zeigen damit ihre beruflichen Felder und Abschnitte – über [Anzeigen, wenn …](mappentypen.md#anzeigen-wenn) mit der Bedingung *Ablage wird beruflich genutzt*. In einer rein privaten Ablage sieht Lena davon nichts; der Mappentyp ist derselbe. Das Paket Basis zeigt so auch den Haken *Eigene Organisation* an der Organisation nur bei beruflicher Nutzung.
- **Eigene Organisation:** Ohne „beruflich“ verwendet Ablago eine trotzdem gespeicherte eigene Organisation **nicht** – weder in [Auskünften](datenschutz.md) und im [Löschkonzept](loeschkonzept.md) noch im Briefkopf oder in der Erkennung. Der Teil darunter bleibt sichtbar, aber blass, mit dem Satz „Nur nötig, wenn die Ablage auch beruflich genutzt wird“. Schaltest du „beruflich“ aus, sagt die Seite: „Deine eigene Organisation … bleibt gespeichert, wird aber nicht verwendet.“ Gelöscht wird nichts; mit dem Haken gilt sie wieder.
- **Bedingungen** von [Berechtigungen](berechtigungen.md), [Ansichten](sichten.md#bedingungen) und [Automatisierungen](automatisierungen.md) können darauf schauen („Ablage wird beruflich genutzt“, umkehrbar). Es gilt für alle Mappen gleich.
- Die **Vorlage der Werkbank** (welche Bereiche links stehen) richtet sich danach: beruflich → *Betrieb*, sonst *Haushalt*. Sie folgt dem Merkmal, solange niemand die Leiste angepasst hat. Die Vorlage bleibt eine Einstellung der Werkbank, das Merkmal gilt für die Ablage.
- **Pakete** können für ihre neuen Mappentypen eine längere [Aufbewahrung bei beruflicher Nutzung](archiv.md#archivmodus-aus-einem-paket) vorschlagen; sie gilt, wenn das Merkmal beim Installieren gesetzt ist. Schaltest du es später um, bleibt der Archivmodus, wie er ist – ändern kannst du ihn am Mappentyp.

Ausblenden ist **Ordnung, kein Schutz**: Werte ausgeblendeter Felder bleiben gespeichert und stehen in [Schnittstelle](api.md), [Vollexport](export.md) und [Auskunft](datenschutz.md). Wer was sehen darf, regeln die Berechtigungen.

### Gut zu wissen zur Nutzung

- Ändern darf das Merkmal nur, wer **Gesamte Verwaltung** hat ([Wer darf Ablago verwalten?](verwalten.md)); wer nur den Bereich *Eigene Organisation* verwaltet, sieht den Haken gesperrt mit diesem Grund. Lesen dürfen es alle Angemeldeten – das Formular der Mappe braucht es.
- Schaltest du es um, prüft Ablago gleich, welche Mappen jetzt Pflichtfelder offen haben (etwa in einem Abschnitt, der nur beruflich zu sehen ist), und zeigt sie wie gewohnt als „passt nicht“.
- Der Einrichtungsassistent fragt es im Schritt [Nutzung](installation.md#nutzung) ab („Wofür nutzt du Ablago?“) und legt bei beruflicher Nutzung auf Wunsch gleich deine eigene Organisation an. Die [Einrichtungsdatei](einrichtungsdatei.md) kennt es als `nutzung: beruflich` bzw. `beides` (ältere Dateien: `optionales: beruflich: true`). Einrichtung, diese Seite und die Mappe verwenden dasselbe Merkmal.
- Das Merkmal steht in der Datenbank und damit in jeder [Sicherung](sicherung.md). Der [Vollexport](export.md) legt es als `struktur/merkmale.json` ab, die Schnittstelle liefert es lesend unter `GET /api/v1/merkmale`.

## Einrichten

1. Das Merkmal bringt das Paket **Basis ab 1.7.0** mit (Mappentyp *Organisation*, Feld *Eigene Organisation*). Fehlt es, sagt die Werkbank das und führt zu den [Paketen](pakete.md).
2. In der Ablage die eigene Organisation öffnen oder anlegen und **Eigene Organisation** anhaken. Dann erscheint im Register *Stammdaten* der Abschnitt **Datenschutz**:
    - **Verantwortlicher** – meist die Organisation selbst (leer lassen oder auf sie selbst zeigen), sonst eine Person, etwa die Inhaberin.
    - **Datenschutzbeauftragter** – nur, wenn es einen gibt.
3. Mehrere eigene Organisationen sind möglich (privat und Gewerbe, zwei Firmen) – das ist nur eine Zuordnung, kein eigener Buchungskreis. Dann wählst du in der Werkbank, **welche für Auskünfte und Unterlagen gilt**.

Gab es schon einen Verantwortlichen in den Einstellungen der [Auskunft](datenschutz.md), zeigt die Werkbank ihn unter *Bisherige Angabe der Auskunft*. **Als eigene Organisation anlegen** macht daraus eine Organisation mit dem Merkmal (Name, Straße, PLZ und Ort, E-Mail und Telefon, so weit Ablago sie im Text erkennt; der Rest steht in der Beschreibung). Bis dahin gilt die bisherige Angabe weiter.

Im **Einrichtungsassistenten** geht es noch einfacher: Wählst du bei „Wofür nutzt du Ablago?“ die Arbeit oder beides, fragt er nach **Deiner Organisation** (nur der Name ist Pflicht) und legt sie mit „Jetzt einrichten“ samt Merkmal an, verantwortlich ist sie selbst ([Nutzung](installation.md#nutzung)).

## Wer das Merkmal setzen darf

Das Merkmal entscheidet, wer auf Auskünften und im Löschkonzept als Verantwortlicher steht. Darum ist das Feld geschützt:

- Ändern darf es, wer **im Verwaltungsmodus** den Bereich *Eigene Organisation* verwalten darf (oder *Gesamte Verwaltung* hat) – siehe [Wer darf Ablago verwalten?](verwalten.md).
- Zusätzlich jede Person mit einer Rolle, die du unter **Wer „eigene Organisation“ setzen darf** freigibst – sofern sie die Organisation ohnehin bearbeiten darf.
- Alle anderen sehen das Feld nur lesbar. Über die [Schnittstelle](api.md), aus Paketen und Automatisierungen kommt **403** – Verwaltungsrechte gelten über einen API-Schlüssel nie.

Jede Änderung am Merkmal, am Verantwortlichen oder am Datenschutzbeauftragten steht im **Systemprotokoll** (Modul Datenschutz), als **Notiz** oben auf der Seite (mit „Zur Kenntnis genommen“) und – mit eingerichtetem E-Mail-Versand – als Mail an alle, die den Bereich verwalten. Auch die Wahl „gilt für Auskünfte“ und die freigegebenen Rollen stehen im Systemprotokoll.

## Was Ablago liest – und was nicht

Ablago liest die Angaben **über die Bedeutung der Felder**, nicht über feste Kennungen – so funktioniert es auch, wenn du den Mappentyp anpasst. Gelesen wird mit Systemrechten, also auch, wenn du die Mappe selbst nicht sehen darfst, aber **nur diese feste Liste**:

| Angabe | Woher |
| --- | --- |
| Name, Straße, Hausnummer, PLZ, Ort, E-Mail, Telefon | je Bedeutung das **erste** Textfeld mit „Aus Dokument füllen“ und dieser Art, in der Reihenfolge der Register (so gilt *Name* vor *Kürzel*) |
| Verantwortlicher, Datenschutzbeauftragter | die Verweisfelder des Abschnitts *Datenschutz* – bei der verwiesenen Person oder Organisation wieder nur die Liste oben |

Passwörter, Kundennummer, IBAN, Beschreibung, Dokumente und alles Weitere liest Ablago dafür nie. Die Werkbank zeigt auch nicht den Titel der Mappe (die Titel-Vorlage könnte andere Felder enthalten). Ändern geht nur in der Ablage, mit deinen normalen Rechten; über **In der Ablage bearbeiten** kommst du hin.

## Wo Ablago die Angaben verwendet

Die Werkbank listet das unter **Wo Ablago diese Angaben verwendet**:

| Stelle | Ergebnis der Bestandsaufnahme (#995) |
| --- | --- |
| [Datenschutz-Auskunft](datenschutz.md): Absender auf dem Deckblatt, E-Mail an die Person | verweist hierher |
| [Löschkonzept](loeschkonzept.md): Verantwortlicher, Ansprechpartner Datenschutz | verweist hierher |
| Erkennung: Absender eingehender Post | die eigene Organisation ist **nie** Absender – auch wenn ihr Briefkopf im Text steht |
| Mappentypen mit [Anzeigen, wenn …](mappentypen.md#anzeigen-wenn) „zeigt auf eine eigene Organisation“ (z. B. Ausgangsrechnung) | verweist hierher |
| Absendername beim E-Mail-Versand ([Betrieb](installation.md#e-mail-und-adresse)) | bleibt bewusst eigen – technischer Absender von Ablago, auch ohne Betrieb |
| Deckblätter von Exporten und Auskünften: Name der Installation | bleibt bewusst eigen (Name der Ablage); der Verantwortliche kommt von hier |
| [Brief aus Vorlage](https://help.ablago.app/benutzer/aktuell/versenden/#brief-aus-vorlage) (#1040): Briefkopf | verweist hierher – wenn der Brief nicht für eine bestimmte Person ist (Feld *Kunde* leer); nur Name, Anschrift, Telefon, E-Mail |
| [Notfallblatt](verschluesselung.md) „Wen fragen?“ (#812) | bleibt bewusst eigen – dort stehen Vertrauenspersonen, nicht der Betrieb |

## Gut zu wissen

- Die Wahl, die freigegebenen Rollen und die Notizen stehen in der Datenbank und damit in jeder [Sicherung](sicherung.md); der [Vollexport](export.md) legt sie als `struktur/organisation.json` ab. Die Angaben selbst stehen in der Mappe.
- Ist der Haken bei mehreren Organisationen gesetzt und keine gewählt, nimmt Ablago keine davon – es gilt die bisherige Angabe der Auskunft, sonst bleibt der Verantwortliche leer. Die Werkbank bittet um eine Wahl, das [Löschkonzept](loeschkonzept.md) meldet die Lücke.
