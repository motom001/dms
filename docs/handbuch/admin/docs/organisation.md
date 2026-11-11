# Eigene Organisation

Name, Anschrift, Kontakt und die Verantwortlichen im Sinne der DSGVO pflegst du **einmal** – an der Organisation in der Ablage, die das Merkmal **„eigene Organisation“** trägt. Alle Stellen in Ablago, die diese Angaben brauchen, holen sie von dort. Katrin legt so die Tischlerei Brandt als Organisation an, setzt den Haken „Eigene Organisation“ und trägt Anschrift und Kontakt ein – fertig.

**Werkbank → Benutzer und Sicherheit → Eigene Organisation** ist nur ein schlanker Verweis darauf. Der Bereich gehört zur Werkbank-Vorlage *Betrieb* (also mit [Nutzung](nutzung.md) „beruflich“); im Haushalt blendest du ihn bei Bedarf über die Ansicht der Werkbank ein.

!!! note "Keine Rechtsberatung"
    Ob und wen du als Verantwortlichen oder Datenschutzbeauftragten nennen musst, klärst du im Zweifel fachlich.

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
