# Schnittstelle (API)

Andere Programme – ein Scanner, ein Skript, eine Haushalts-App – greifen über die Schnittstelle unter `/api/v1` auf Ablago zu. Sie können Mappen anlegen, lesen, ändern und löschen und Dokumente hoch- und herunterladen.

## API-Beschreibung

Die vollständige Beschreibung im **OpenAPI-Format** (Version 3.1):

- **Lesbar** in jeder Installation unter **Mein Konto → Sicherheit → API-Schlüssel** (oben rechts auf deinen Namen klicken) über den Link **API-Dokumentation** – passend zur installierten Version.
- **Maschinenlesbar** unter `/api/openapi.json` oder `/api/v1/openapi.json` der eigenen Installation, z. B. `http://<NAS>:8080/api/openapi.json`. Das lässt sich in Werkzeuge wie Swagger UI, Postman oder einen Code-Generator laden.
- Die Beschreibung der aktuellen Version liegt auch hier: [openapi.json](api/openapi.json).

![API-Dokumentation in Ablago](bilder/api-doku.png)

## API-Schlüssel

Jeder Benutzer erzeugt seine Schlüssel selbst unter **Mein Konto → Sicherheit → API-Schlüssel**, höchstens 50 je Benutzer – **außer Administratoren** (ab 0.26): Über die Schnittstelle arbeitet immer ein normaler Benutzer. Lege für ein Programm am besten einen eigenen Benutzer an (z. B. „Scanner“), melde dich als dieser an und erzeuge den Schlüssel dort. Schlüssel, die Administratoren schon vorher hatten, funktionieren weiter; die Werkbank-Übersicht erinnert daran, sie so zu ersetzen.

- **Name** – wofür der Schlüssel ist, z. B. „Scanner Arbeitszimmer“.
- **Recht** (Stufe) – eine von dreien:
    - *nur lesen* – liest alles, was der Benutzer lesen darf (nur `GET`).
    - *lesen und schreiben* – liest und ändert alles, was der Benutzer darf.
    - *nur Zähler* (ab #625) – ruft **nur** die [Zahlen](#zaehler) ab (`GET /api/v1/ich/zaehler`): neue Post, Zu erledigen und Überfälliges. Jeder andere Aufruf, auch das [Laufwerk](webdav.md), bekommt `403`. Gedacht für Hausautomatisierung, Wand-Tablets und Anzeigen: Geht der Schlüssel verloren, erfährt jemand höchstens, wie viel Post und Aufgaben der Benutzer hat – keine Titel, Namen oder Inhalte. „Passwörter lesen“ gibt es für diese Stufe nicht.
- **Ablaufdatum** – optional.
- **Passwörter lesen** – eigenes Recht für [Passwortfelder](mappentypen.md#passwortfelder): Nur damit liefert `GET /api/v1/mappen…?passwoerter=anzeigen` sie im Klartext; jeder Abruf steht im Protokoll. Ohne den Parameter steht dort immer nur `{"gesetzt": true, "lesbar": true}`.

Der Schlüssel ist **nur einmal vollständig sichtbar**, direkt nach dem Erzeugen; danach zeigt Ablago nur noch seinen Anfang. Gespeichert wird nur ein Prüfwert. Wer ihn verliert, erzeugt einen neuen und löscht den alten.

Ein Schlüssel hat höchstens die Rechte seines Benutzers. Ist der Benutzer deaktiviert, gilt auch sein Schlüssel nicht mehr.

Die Endpunkte der Gruppe *Werkbank* (Mappentypen anlegen, ändern und löschen; Benutzer und Rollen) brauchen **Administratorrechte**. Mit dem Schlüssel eines Mitglieds antworten sie mit `403`. Da Administratoren keine neuen Schlüssel bekommen, gehen sie nur mit einem Schlüssel, der einem Administrator schon vor 0.26 gehörte.

## Erster Aufruf

```sh
curl -H "Authorization: Bearer dms_…" http://<NAS>:8080/api/v1/ich
```

Antwortet mit dem Benutzer und dem Recht des Schlüssels.

Eine Mappe anlegen:

```sh
curl -X POST -H "Authorization: Bearer dms_…" -H "Content-Type: application/json" \
  -d '{"typId": "<Id des Mappentyps>", "werte": {"rechnungsnummer": "R-17", "rechnungsdatum": "2026-10-01", "betrag": {"betrag": 49.9, "waehrung": "EUR"}}}' \
  http://<NAS>:8080/api/v1/mappen
```

Die Ids der Mappentypen und die Kennungen ihrer Felder (`key`) liefert `GET /api/v1/typen`.

## Zähler: nur Zahlen, für Hausautomatisierung und Anzeigen { #zaehler }

`GET /api/v1/ich/zaehler` liefert **nur Zahlen** für den Benutzer des Schlüssels, in dessen [Berechtigungen](berechtigungen.md) – ohne Titel, Namen, Absender oder Inhalte. Dafür genügt ein Schlüssel der Stufe *nur Zähler*; *nur lesen* und *lesen und schreiben* dürfen ihn ebenfalls. Ein Administrator ruft ihn mit seiner Anmeldung im Browser ab (Administratoren bekommen keine Schlüssel).

```sh
curl -i -H "Authorization: Bearer dms_…" https://dms.example.org/api/v1/ich/zaehler
```

```http
HTTP/1.1 200 OK
ETag: "z42-mJ3x0Qe7Kq9VZ1aB2cD3eF"
Cache-Control: private, no-cache
Content-Type: application/json; charset=utf-8

{"neuePost":2,"zuErledigen":5,"ueberfaellig":1,"stand":42,"geaendert":"2026-11-03T07:15:00.000Z"}
```

| Feld | Bedeutung |
| --- | --- |
| `neuePost` | [Post](https://help.ablago.app/benutzer/post/) im Stand *Neu*, deren *Für* der Benutzer ist oder leer ist – nur Post, die er lesen darf |
| `zuErledigen` | wie **Zu erledigen** in der Ablage: Mappen mit offenen Aufgaben für ihn |
| `ueberfaellig` | eigene offene Fristen, Erinnerungen und Aufgaben mit Datum vor heute |
| `stand` | zählt um eins hoch, sobald sich eine der Zahlen gegenüber dem letzten Abruf geändert hat |
| `geaendert` | wann Ablago diese Änderung bemerkt hat (beim Abruf) |

**Nichts Neues kostet nichts:** Schicke das `ETag` des letzten Abrufs als `If-None-Match` mit. Hat sich nichts geändert, antwortet Ablago mit `304 Not Modified` ohne Inhalt:

```sh
curl -i -H "Authorization: Bearer dms_…" -H 'If-None-Match: "z42-mJ3x0Qe7Kq9VZ1aB2cD3eF"' \
  https://dms.example.org/api/v1/ich/zaehler
# HTTP/1.1 304 Not Modified
```

- Die Zahlen kommen aus demselben Zwischenspeicher wie die Zahlen der Ablage: Auch bei 50.000 Mappen ist ein Abruf meist in wenigen Millisekunden beantwortet. Alle paar Minuten abzufragen (z. B. alle 5 Minuten) ist unbedenklich.
- Der Stand liegt in der Datenbank: Er übersteht einen Neustart. Nach einer [Wiederherstellung](wiederherstellen.md) kann er auf den Stand der Sicherung zurückgehen – vergleiche ihn deshalb nur auf „anders“, nicht auf „größer“.
- Andere Aufrufe mit einem Schlüssel *nur Zähler* bekommen `403` mit dem Hinweis, dass dieser Schlüssel nur die Zahlen abruft.

### Sofort statt abfragen: Webhooks { #webhooks }

Statt den Zähler regelmäßig abzufragen, kann sich Ablago auch selbst melden: Ein **Webhook** schickt dieselben Zahlen per `POST` an eine Adresse, wenige Sekunden nachdem sie sich geändert haben – signiert mit HMAC-SHA256, ohne Inhalte, mit Ereignis-Id gegen Doppeltes. Benutzer legen Webhooks unter Mein Konto an, nur an Ziele, die ein Administrator freigegeben hat. Einrichten, Zustellung und Köpfe: [Webhooks](webhooks.md); Prüfen der Signatur mit Beispielcode im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/aufbau/#webhooks). Den Zähler-Endpunkt braucht es weiterhin: zum Start, nach längerer Pause und als Rückfall, falls eine Meldung verloren ging.

### Mappe ändern, auch gleichzeitig mit anderen { #mappe-aendern }

`PUT /api/v1/mappen/{id}` ändert nur die Felder, die in `werte` stehen; alle anderen bleiben, wie sie gerade gespeichert sind. Schicke deshalb **nur, was du ändern willst** – nicht die ganze Mappe, die du vorher gelesen hast. Sonst setzt du Felder zurück, die inzwischen jemand anderes geändert hat.

Mit `stand` prüft Ablago zusätzlich, ob seit deinem Lesen jemand **dasselbe Feld** geändert hat (#609). `stand` ist der Wert `geaendert` der Mappe aus `GET /api/v1/mappen/{id}`:

```sh
curl -X PUT -H "Authorization: Bearer dms_…" -H "Content-Type: application/json" \
  -d '{"werte": {"betrag": {"betrag": 398, "waehrung": "EUR"}}, "stand": "2026-11-02T16:58:12.345Z"}' \
  http://<NAS>:8080/api/v1/mappen/<Id>
```

- Hat seitdem niemand eines der übergebenen Felder anders geändert, speichert Ablago – auch wenn andere Felder inzwischen geändert wurden; die bleiben.
- Sonst kommt **409** und nichts wird gespeichert. In `details` stehen `stand` (der aktuelle) und `konflikte`: je Feld `feld`, `label`, `deins`, `aktuell` (lesbar), `wert` (der jetzige Wert wie in `werte`; nicht bei Passwörtern), `von`, `name` und `zeit` der letzten Änderung.
- Deinen Wert trotzdem übernehmen: dieselbe Anfrage mit `stand` aus der 409-Antwort. Den anderen Wert behalten: das Feld weglassen.

Ohne `stand` prüft Ablago nichts – wie bis 0.143.0 gilt, was du schickst. Bestehende Skripte laufen unverändert weiter; nicht übergebene Felder setzt Ablago nie zurück. „Zuletzt geändert“ (`geaendert`) ist auf die Millisekunde genau und wird bei jedem Speichern größer – vergleiche es als Text, rechne nicht damit.

**Mappentypen** (`PUT /api/v1/typen/{id}`, Werkbank) nehmen ebenfalls `stand` an – den Wert `geaendert` des Mappentyps, so wie du ihn gelesen hast. Hat ihn seitdem jemand anderes gespeichert, kommt **409**, nichts wird überschrieben; dann neu lesen und die eigenen Änderungen noch einmal anwenden. Ohne `stand` gilt wie bisher, was zuletzt gespeichert wird.

!!! note "Namen in der API"
    Die Schnittstelle behält ihre Namen, auch wo die Oberfläche seit 0.73 andere Wörter verwendet: `sicht` ist die **Ansicht**, `sicht=eingang` die Liste **Zu erledigen**, `key` die **Kennung** eines Felds, Registers oder Mappentyps, die Feldart `referenz` der **Verweis**, das Register der Art `protokoll` die **Historie** und `mandant` bzw. `haushalt_id` der **Haushalt**.

Die Mappen einer Ansicht liefert `GET /api/v1/mappen?sicht=<Id der Ansicht>` – mit allen Bedingungen der Ansicht. Alle Mappen eines Mappentyps, ohne Bedingungen, gibt es mit `sicht=typ:<Id des Mappentyps>`. Mit `sicht=link&link=…` geht es über einen [Link über Mappentyp und Feldwerte](direktlinks.md). Die Ansichten selbst (Baum, Mappentypen, Bedingungen, gewählte Trefferliste) liefert `GET /api/v1/sichten/definitionen`. Die eigene Abwesenheit liest und setzt `GET`/`PUT /api/v1/konto/abwesenheit`, die eigene tägliche Zusammenfassung (Uhrzeit, Wochentage, Feiertage) `GET`/`PUT /api/v1/konto/zusammenfassung`. Die eigenen Favoriten gibt es mit `sicht=favoriten`; markieren und entfernen mit `PUT` bzw. `DELETE /api/v1/mappen/{id}/favorit`.

Mappentypen haben seit 0.14 **mehrere Trefferlisten** (`trefferlisten`, eine mit `standard: true`). Das Feld `trefferliste` gibt es weiter: Es enthält die Spalten der Standardliste, und wer es beim Ändern angibt, ersetzt damit deren Spalten.

Mit `suche=…&volltext=true` sucht `GET /api/v1/mappen` auch im Volltext der Dokumente; die Fundstellen stehen in `ausschnitte` (Treffer zwischen den Steuerzeichen U+0002 und U+0003). Den ganzen Text eines Dokuments liefert `GET /api/v1/dokumente/<Id>/volltext`.

### Weitere Endpunkte

Die API-Dokumentation beschreibt alle Endpunkte mit ihren Parametern. Ein Überblick:

| Wofür | Endpunkte |
| --- | --- |
| **Erweiterte Suche** | `GET /api/v1/mappen?sicht=suche&link=…` mit den Parametern der erweiterten Suche als ein kodierter Wert, z. B. `typ%3Drechnung%26volltext%3DBackofen` |
| **Aufgaben** | `GET /api/v1/aufgaben` (eigene offene), `POST /api/v1/mappen/{id}/aufgaben` (vergeben), `POST /api/v1/aufgaben/{id}/erledigt` und `…/delegieren`, mehrere auf einmal mit `POST /api/v1/aufgaben/weitergeben` bzw. `…/aufgaben/erledigt` (#415); Erinnerungen über `…/erinnerungen` |
| **Notizen** | `GET`/`POST /api/v1/mappen/{id}/notizen`, `PUT`/`DELETE /api/v1/notizen/{id}` |
| **Hinweise von Paketen** | `PUT`/`DELETE /api/v1/mappen/{id}/hinweise/{schluessel}` mit `{ "text": "…" }` – nur für Pakete mit dem Recht [Hinweise an Mappen setzen](pakete.md#recht-hinweise); gelesen werden sie mit der Mappe (`hinweise` in `GET /api/v1/mappen/{id}`, mit `paketName`) |
| **Historie** einer Mappe | `GET /api/v1/mappen/{id}/historie` |
| **E-Mail** | `POST /api/v1/mappen/{id}/email` versendet eine Mappe mit Dokumenten (zusammen höchstens 50 MB) über deinen Mailserver nach draußen. Das kann jeder Schlüssel mit Schreibrecht – vergib „lesen und schreiben“ deshalb nur an Programme, denen du das zutraust. |
| **Dokumente und Versionen** | `POST /api/v1/mappen/{id}/dokumente` (hochladen), `POST /api/v1/dokumente/{id}/ersetzen` (neue Version), `GET /api/v1/dokumente/{id}/versionen`, ältere Version herunterladen und `…/zurueckholen` |
| **Texterkennung** | `POST /api/v1/dokumente/{id}/texterkennung` stößt sie für ein Dokument (erneut) an; `GET /api/v1/dokumente/{id}/volltext` liefert den Text |
| **Volltext setzen** | `PUT /api/v1/dokumente/{id}/volltext` mit `{ "text": "…" }` (Recht U auf die Mappe) ersetzt den Volltext, z. B. aus einer eigenen Texterkennung; `GET /api/v1/dokumente/{id}/seiten/{nr}/scan?dpi=300` liefert eine Seite als Graustufenbild (PGM) |
| **Umgewandelte Fassung** | `GET /api/v1/dokumente/{id}/fassung` liefert die Fassung (PDF, PNG oder JPEG), die ein Paket aus einer Datei gemacht hat, die Ablago nicht selbst liest (z. B. TIFF); setzen dürfen sie nur Pakete mit dem Recht [Dateien umwandeln](pakete.md#recht-umwandeln) |

### Post anlegen und zuordnen

Ein Skript, ein Scanner oder Home Assistant legt neue [Post](https://help.ablago.app/benutzer/post/) an und lädt die Datei dazu hoch:

```sh
curl -X POST -H "Authorization: Bearer dms_…" -H "Content-Type: application/json" \
  -d '{"betreff": "Scan vom Drucker", "fuer": "<Id eines Benutzers>"}' \
  http://<NAS>:8080/api/v1/post
curl -X POST -H "Authorization: Bearer dms_…" -H "Content-Type: application/octet-stream" \
  --data-binary @scan.pdf "http://<NAS>:8080/api/v1/mappen/<Id der Post>/dokumente?register=dokumente&name=scan.pdf"
```

Die Post steht dann mit Kanal *API* und Stand *Neu* in **Neue Post**. `POST /api/v1/post/<Id>/zuordnen` mit `{"ziel": "<Id einer Mappe>"}` ordnet sie zu; die Dokumente wandern ins erste Dokumentenregister der Mappe (oder in `register`, mit `kopieren: true` bleiben sie auch in der Post). Bei Post, die vor 0.41 als E-Mail angelegt wurde, heißt das Dokumentenregister `anhaenge`.

Gelöschte Mappen liegen im [Papierkorb](papierkorb.md): `GET /api/v1/papierkorb` (eigener), `POST /api/v1/papierkorb/<Id>/wiederherstellen`, `DELETE /api/v1/papierkorb/<Id>` und `DELETE /api/v1/papierkorb` (leeren).

## Änderungen der API { #aenderungen }

Hier steht, was sich an der API v1 so geändert hat, dass bestehende Programme es merken. Neue Felder und neue Aufrufe stehen nur in der [API-Beschreibung](#api-beschreibung).

| Seit | Änderung | Was tun? |
| --- | --- | --- |
| #1050 (zusammengesetzte Felder) | **Neue Feldart `zusammengesetzt`, nur zum Lesen.** Am Feld steht `vorlage` (Platzhalter wie `titelVorlage`); in `werte` steht ein Schlüssel ohne Sprache, Verweise darin als Mappen-Id (den Text baut man aus `vorlage`, den Werten und `bezuege`). Gesendete Werte für dieses Feld übergeht Ablago und setzt es aus seinen Teilen. Ist es eindeutig, kommt bei Doppelung **422**, die Meldung steht in `details.felder` am ersten beteiligten Feld. Ändert man die Vorlage über `PUT /api/v1/typen/{id}` und hätten danach mehrere Mappen dieselbe Kombination, kommt **409** mit `details.zusammengesetzt` – mit `doppelteBestaetigt: true` speichert Ablago trotzdem. | Wer Feldarten fest aufzählt (z. B. in einem JSON-Schema), nimmt `zusammengesetzt` dazu; Skripte schicken das Feld nicht mit. |
| #1034 (berechnete Felder) | **Berechnete Felder schreibt nur ihr Paket.** Felder mit `berechnetVon` (am Feld in `GET /api/v1/typen`) ändert über `POST`/`PUT /api/v1/mappen` nur das Paket, das sie berechnet; jeder andere Schlüssel bekommt **400** mit dem Namen des Pakets und in `details.berechnet` je Feld `feld`, `label`, `paket` und `paketName`. Unverändert mitgeschickte Werte stören nicht. Neu an der Mappe: `hinweise` (Hinweise von Paketen); am Mappentyp beim Lesen `berechnung` (je Paket Name und ob es noch rechnet). `berechnetVon: null` beim Ändern eines Mappentyps gibt ein Feld wieder frei. | Skripte schicken nur, was sie ändern wollen (siehe [Mappe ändern](#mappe-aendern)) und lassen berechnete Felder weg. |
| #1084 (Kennungen) | **Mappentypen aus Paketen heißen `paket:schluessel`** statt `<paket>_<schluessel>`, z. B. `basis:person` statt `basis_person` – in `schluessel` der Mappentypen (`GET /api/v1/typen`), in Links (`/ablage/link?typ=…`), in der erweiterten Suche (`typ=`) und im Vollexport (Datei `daten/basis.person.csv`). Neu am Mappentyp: `paket` (Id des Pakets, fehlt bei eigenen Typen). Bestehende Kennungen hat Ablago beim Update umgestellt; eigene Mappentypen behalten ihre Kennung. Paket-Ids dürfen jetzt bis 40 Zeichen und einen Punkt haben (`texterkennung.fra`), Kennungen bis 60 Zeichen; Pakete nennen ihren `herausgeber`. | Wer Mappentypen über die Kennung sucht, nimmt die neue Form (oder die Id). Gespeicherte Links und Lesezeichen mit `typ=basis_…` neu anlegen bzw. auf `basis:…` ändern – sie finden den Mappentyp sonst nur noch über seinen Namen. |
| #902 (Ankündigung) | **Mit Ablago 1.0.0 entfallen drei Übergänge für alte Pakete:** `PUT /api/v1/sicherungen/{name}/extern` (veraltet seit 0.158.1, #636), das Ereignis `texterkennung.fertig` (heißt seit 0.133.0 `volltext.fertig`, #724) und der Verweis `dms:ablageort` (seit 0.212 `basis:ablageort`, #883). | Pakete melden die Kopie außer Haus als `extern` in der Antwort auf `sicherung.fertig`, abonnieren `volltext.fertig` und verweisen auf `basis:ablageort`. |
| #939 (Fundstellen) | **Fundstellen aus Paketen nur noch aus dem Dokument.** In `POST /api/v1/typen/{id}/vorschlaege` ist `fundstelle` eines Werts, den ein Paket geliefert hat, jetzt leer, wenn der Ausschnitt nicht wörtlich im Dokument steht. Neu daneben `stelle` (Dokument, Seite, Rahmen). Neuer Aufruf `POST /api/v1/klassifizieren` für „Wohin gehört das?“. | Nichts, wenn eine leere `fundstelle` erlaubt ist. Wer Rahmen zeichnet, kann `stelle` nehmen, statt selbst zu suchen. |
| #725 (Navigation verschlankt) | **„Anstehend“ gibt es nicht mehr.** `GET /api/v1/anstehend` ist entfallen; der [Zähler](#zaehler) und die [Webhooks](webhooks.md) liefern kein Feld `anstehend` mehr. Erinnerungen an Fristen kommen über Automatisierungen zum richtigen Zeitpunkt als Aufgabe – sie stehen dann in `zuErledigen` bzw. `GET /api/v1/aufgaben`. | Statt `anstehend` `zuErledigen` oder `ueberfaellig` anzeigen. Wer die Zahlen streng prüft (z. B. ein JSON-Schema mit `required`), entfernt `anstehend`. |

## Regeln

- Schlüssel gelten nur unter `/api/v1`, nicht an den internen Adressen der Oberfläche. Ein Schlüssel *nur Zähler* gilt nur für `GET /api/v1/ich/zaehler`.
- Es gelten dieselben Prüfungen wie in der Oberfläche: Pflichtfelder, eindeutige Werte, geschützte Felder der Benutzer-Mappen – und die [Berechtigungen](berechtigungen.md) des Benutzers, dem der Schlüssel gehört. Mappen, die er nicht lesen darf, liefert die Schnittstelle nicht; Passwörter nur mit dem Recht „Passwörter sehen“.
- Benutzer wählt man auch über die Schnittstelle nur aus denen, deren Benutzer-Mappe man sehen darf (Verantwortlich, Aufgaben, Vertreter). Wie man so ein Programm sauber abgrenzt, zeigt das Beispiel [Ein Programm, das nur Rechnungen sieht](berechtigungen.md#beispiel-ein-programm-das-nur-rechnungen-sieht).
- Im aktiven [Wartungsmodus](wartungsmodus.md) antwortet die Schnittstelle mit `503` und `Retry-After` (Sekunden bis zum erwarteten Ende).
- Fehler kommen als JSON mit einer deutschen Meldung in `fehler`; bei ungültigen Eingaben (422) steht in `details` das Prüfergebnis je Feld.
- Passwortfelder setzt man mit einem Text oder `{"neu": "…"}`, entfernt sie mit `null` und lässt sie unverändert, indem man sie weglässt.
- Die Kennungen der Felder ändern sich nie (siehe [Mappentypen](mappentypen.md#die-kennung)) – Skripte, die mit ihnen arbeiten, bleiben gültig, auch wenn Bezeichnungen umbenannt werden.
