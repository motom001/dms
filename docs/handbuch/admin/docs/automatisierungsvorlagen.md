# Automatisierungsvorlagen

Eine **Automatisierungsvorlage** ist eine Automatisierung mit Lücken, die man an **einer** Mappe anwendet. „Aufgabe vergeben“ und „Erinnern“ im Menü **Mappe ▾** sind solche Vorlagen – dahinter läuft derselbe Motor wie bei den [Automatisierungen](automatisierungen.md). Eine angewendete Vorlage heißt **Mappen-Ablauf**: Sie steht an der Mappe unter **Geplant**, bis sie läuft, und verschwindet dann. Was passiert ist, steht in der Historie der Mappe und im Verlauf der Vorlage.

Du findest sie unter **Werkbank → Ablage aufbauen → Automatisierungsvorlagen**, gleich unter den Automatisierungen. Im Haushalt erscheint der Bereich im **Expertenmodus** (Werkbank → Werkbank anpassen), in Betrieben immer.

![Werkbank → Automatisierungsvorlagen: Liste und Editor](bilder/werkbank-automatisierungsvorlagen.png)

## Was mitkommt

| Vorlage | Woher | Wann | Fragt beim Anwenden | Dann |
|---|---|---|---|---|
| **Aufgabe vergeben** | Ablago (immer da) | sofort | Empfänger, Text | Aufgabe an die gewählte Person |
| **Erinnern** | Ablago (immer da) | am gewählten Datum | Datum, Empfänger, Text | Aufgabe „Erinnerung“ an die gewählte Person |
| **Wiedervorlage** | Paket Benachrichtigungen | in 6 Monaten | – | Aufgabe „Erinnerung“ an dich: „Wiedervorlage: {titel}“ |

„Aufgabe vergeben“ und „Erinnern“ gehören zu Ablago – sie funktionieren auch **ohne Paket**. Das Paket **Benachrichtigungen** bringt sie noch einmal mit und **ersetzt** damit die von Ablago (in der Liste „aus Paket“). Entfernst du das Paket, gilt wieder die Vorlage von Ablago; geplante Abläufe laufen weiter, denn sie nennen die Vorlage über ihre Kennung. Hast du eine Vorlage von Ablago selbst geändert, ersetzt das Paket sie nicht.

## Liste und Editor

In der Mitte stehen alle Vorlagen mit **an/aus**, Herkunft als Chip (**Ablago** oder der Name des Pakets; eigene ohne Chip), Kurzform („Am gewählten Datum → Aufgabe an die gewählte Person“) und der Zahl der **offenen Abläufe**. Rechts stellst du ein:

| Feld | Bedeutung |
|---|---|
| **Name**, **Reihenfolge**, **Beschreibung** | so steht sie im Menü „Mappe“; kleinere Zahl weiter oben (1–99) |
| **Im Menü „Mappe“ bei** | Mappentypen, an denen sie angeboten wird – keiner gewählt: bei allen |
| **Wann** | **Sofort**, **Am gewählten Datum** oder **In …** Tagen, Wochen bzw. Monaten |
| **Fragt beim Anwenden** | **Empfänger**, **Datum** und **Text** – genau das steht im kleinen Dialog an der Mappe. **Datum** ist bei „Am gewählten Datum“ immer an, bei „Sofort“ aus und bei „In …“ frei wählbar (siehe [Datum vorschlagen](#datum-vorschlagen)) |
| **Dann** | eine oder mehrere Karten **Aufgabe / Benachrichtigung**: an die gewählte Person, wer die Vorlage anwendet, wer die Mappe angelegt hat oder die Person in einem Feld der Mappe (nur mit festen Mappentypen) |

### Datum vorschlagen: „Erinnere mich in 14 Tagen“ { #datum-vorschlagen }

Bei **In …** entscheidest du, ob das Datum fest ist oder nur ein **Vorschlag**:

| Wann | Haken „Datum“ | Was an der Mappe passiert |
|---|---|---|
| Sofort | – | läuft sofort |
| In 14 Tagen | aus | läuft fest in 14 Tagen, ohne Datumsfeld |
| In 14 Tagen | **an** | Datumsfeld, **vorbelegt mit heute + 14 Tage**, änderbar |
| Am gewählten Datum | immer an | Datumsfeld, vorbelegt mit heute + 7 Tage |

Beispiel: Lena möchte, dass sich jeder im Haushalt mit einem Klick an eine Mappe erinnern lassen kann – meistens in zwei Wochen, manchmal früher oder später. Sie legt eine Vorlage **Erinnere mich in 14 Tagen** an: Wann **In 14 Tagen**, unter „Fragt beim Anwenden“ **Datum** und **Text**, eine Karte **Aufgabe** an „wer sie anwendet“ mit dem Text `{eingabe}`. In der Liste steht sie als „In 14 Tagen (änderbar) → Aufgabe an wer sie anwendet“. Wendet Jonas sie an einer Mappe an, steht im Datumsfeld schon das Datum in 14 Tagen; er schreibt, woran er denken will, und ändert das Datum nur, wenn es nicht passt. **Ausprobieren** im Editor belegt das Datum genauso vor.

![Vorlage „Erinnere mich in 14 Tagen“: Wann „In 14 Tagen“, unter „Fragt beim Anwenden“ ist „Datum“ angehakt](bilder/werkbank-automatisierungsvorlage-vorschlag.png)

Vorlagen ohne den Haken verhalten sich wie bisher: „In 6 Monaten“ bleibt fest.

Im Text einer Karte gibt es die Platzhalter wie bei den [Automatisierungen](automatisierungen.md) (`{titel}`, `{mappentyp}`, `{heute}`, `{datum}`, die Felder des Mappentyps), dazu `{eingabe}` (der Text, den man beim Anwenden schreibt), `{person}` (wer anwendet) und `{empfaenger}`. Eine Vorlage, die nach dem Text fragt, braucht `{eingabe}` in einer Karte.

Der **Schalter** oben im Editor (aus) nimmt die Vorlage aus dem Menü „Mappe“ – schon geplante Abläufe laufen trotzdem. Eigene Vorlagen löschst du, sobald keine offenen Abläufe mehr an ihr hängen; Vorlagen von Ablago setzt du mit **Auf Auslieferung zurücksetzen** zurück.

Darunter:

- **Ausprobieren:** wähle eine Mappe und die Antworten – Ablago zeigt, was passieren würde (mit deinen Rechten als Person), und wer etwas nicht sehen dürfte. Es entsteht nichts.
- **Gerade benutzt bei:** alle offenen Abläufe der Vorlage mit Link zur Mappe, Datum und Person. Titel stehen nur bei Mappen, die du lesen darfst.
- **Verlauf:** angewendet, geplant, gelaufen, angehalten, gelöscht, fortgesetzt – mit Zeit und Person. Er bleibt 30 Tage bzw. 200 Einträge je Vorlage.
- **Fassungen:** wer wann was geändert hat, zwei Fassungen vergleichen und eine frühere wiederherstellen – wie bei allen Einstellungen der Werkbank, siehe [Fassungen](fassungen.md). **Auf Auslieferung zurücksetzen** ist selbst eine Fassung; gelöschte eigene Vorlagen stehen mit Löschvermerk unter der Liste.

## Sicherheit

- **Nur Aufgaben und Benachrichtigungen.** Eine Vorlage hat keine Karte, die Daten nach außen schickt – keine E-Mail an eine frei eingegebene Adresse, keinen Adressaufruf. Das gilt auch für Vorlagen aus Paketen und für deren Updates; die Vorschau beim Installieren nennt jede Vorlage mit ihren Karten.
- **Mit den Rechten der Person, die den Ablauf angelegt hat – zur Laufzeit.** Ein Ablauf, der in sechs Monaten läuft, prüft dann die Rechte von **dann**. Ist die Person deaktiviert, kein Benutzer mehr oder darf sie die Mappe nicht mehr lesen, läuft er nicht, sondern steht als **angehalten** da: an der Mappe unter „Geplant“, in der Übersicht der Werkbank und in der Mail an die Verwaltung. Unter **Gerade benutzt bei** setzt du ihn mit **Fortsetzen** fort – Ablago prüft die Rechte dabei erneut. Abläufe laufen nie unter einem Systemkonto.
- **Empfänger** sind aktive Benutzer. Darf jemand die Mappe nicht lesen, bekommt er die Aufgabe trotzdem, sieht aber nur einen Hinweis (wie bei [Aufgaben bei Personen ohne Leserecht](aufgaben.md)); der von Hand geschriebene Text bleibt sichtbar. Platzhalter füllt Ablago mit den Rechten des Empfängers – was er nicht sehen darf, steht als „(nicht sichtbar)“ da.
- **Bremse:** Je Person und Mappe höchstens 20 offene Abläufe, je Person höchstens 30 angewendete Vorlagen in der Minute. So kann niemand über die Schnittstelle tausende Aufgaben an andere planen.

## Umstellung beim Update

Bestehende **Erinnerungen** wurden beim Update zu Abläufen der Vorlage **Erinnern** – mit Datum, Text und Empfänger wie vorher und mit ihrem bisherigen Ersteller als Person. War der Ersteller unbekannt oder ein Systemkonto, läuft der Ablauf als der Empfänger selbst. Am Datum entsteht dieselbe Aufgabe „Erinnerung“ wie bisher, mit Vertretung, Erledigen und Täglicher Zusammenfassung. Von Hand vergebene Aufgaben sind schon gelaufene Abläufe von „Aufgabe vergeben“ und bleiben, wie sie sind.

## Über die Schnittstelle

Mit einem API-Schlüssel wendest du eine Vorlage über `POST /api/v1/mappen/{id}/ablaeufe` an (`vorlage` und die Antworten `empfaengerId`, `datum`, `text`); `GET /api/v1/mappen/{id}/ablaeufe` nennt die geplanten Abläufe und die Vorlagen der Mappe. Die bisherigen Adressen für Aufgaben und Erinnerungen bleiben und gehen über dieselben Vorlagen. Siehe [Schnittstelle](api.md).
