# Schnittstelle (API)

Andere Programme – ein Scanner, ein Skript, eine Haushalts-App – greifen über die Schnittstelle unter `/api/v1` auf das DMS zu. Sie können Mappen anlegen, lesen, ändern und löschen und Dokumente hoch- und herunterladen.

## API-Beschreibung

Die vollständige Beschreibung im **OpenAPI-Format** (Version 3.1):

- **Lesbar** in jeder Installation unter **Profil → API-Dokumentation** – passend zur installierten Version.
- **Maschinenlesbar** unter `/api/openapi.json` der eigenen Installation, z. B. `http://<NAS>:8080/api/openapi.json`. Das lässt sich in Werkzeuge wie Swagger UI, Postman oder einen Code-Generator laden.
- Die Beschreibung der aktuellen Version liegt auch hier: [openapi.json](api/openapi.json).

![API-Dokumentation im DMS](bilder/api-doku.png)

## API-Schlüssel

Jeder Benutzer erzeugt seine Schlüssel selbst im **Profil** unter *API-Schlüssel* – **außer Administratoren** (ab 0.26): Über die Schnittstelle arbeitet immer ein normaler Benutzer. Lege für ein Programm am besten einen eigenen Benutzer an (z. B. „Scanner“), melde dich als dieser an und erzeuge den Schlüssel dort. Schlüssel, die Administratoren schon vorher hatten, funktionieren weiter; die Werkbank-Übersicht erinnert daran, sie so zu ersetzen.

- **Name** – wofür der Schlüssel ist, z. B. „Scanner Arbeitszimmer“.
- **Recht** – *nur lesen* oder *lesen und schreiben*.
- **Ablaufdatum** – optional.
- **Passwörter lesen** – eigenes Recht für [Passwortfelder](mappentypen.md#passwortfelder): Nur damit liefert `GET /api/v1/mappen…?passwoerter=anzeigen` sie im Klartext; jeder Abruf steht im Protokoll. Ohne den Parameter steht dort immer nur `{"gesetzt": true, "lesbar": true}`.

Der Schlüssel ist **nur einmal vollständig sichtbar**, direkt nach dem Erzeugen; danach zeigt das DMS nur noch seinen Anfang. Gespeichert wird nur ein Prüfwert. Wer ihn verliert, erzeugt einen neuen und löscht den alten.

Ein Schlüssel hat höchstens die Rechte seines Benutzers und kommt damit nicht an die Werkbank-Funktionen. Ist der Benutzer deaktiviert, gilt auch sein Schlüssel nicht mehr.

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

Die Ids der Mappentypen und die Schlüssel ihrer Felder liefert `GET /api/v1/typen`.

Die Mappen einer Sicht liefert `GET /api/v1/mappen?sicht=<Id der Sicht>` – mit allen Bedingungen der Sicht. Alle Mappen eines Typs, ohne Bedingungen, gibt es mit `sicht=typ:<Id des Mappentyps>`. Mit `sicht=link&link=…` geht es über einen [sprechenden Link](direktlinks.md). Die Sichten selbst (Baum, Mappentypen, Bedingungen, gewählte Trefferliste) liefert `GET /api/v1/sichten/definitionen`. Die eigene Abwesenheit liest und setzt `GET`/`PUT /api/v1/konto/abwesenheit`, die eigene tägliche Zusammenfassung (Uhrzeit, Wochentage, Feiertage) `GET`/`PUT /api/v1/konto/zusammenfassung`. Die eigenen Favoriten gibt es mit `sicht=favoriten`; markieren und entfernen mit `PUT` bzw. `DELETE /api/v1/mappen/{id}/favorit`.

Mappentypen haben seit 0.14 **mehrere Trefferlisten** (`trefferlisten`, eine mit `standard: true`). Das Feld `trefferliste` gibt es weiter: Es enthält die Spalten der Standardliste, und wer es beim Ändern angibt, ersetzt damit deren Spalten.

Mit `suche=…&volltext=true` sucht `GET /api/v1/mappen` auch im Volltext der Dokumente; die Fundstellen stehen in `ausschnitte` (Treffer zwischen den Steuerzeichen U+0002 und U+0003). Den ganzen Text eines Dokuments liefert `GET /api/v1/dokumente/<Id>/volltext`.

Gelöschte Mappen liegen im [Papierkorb](papierkorb.md): `GET /api/v1/papierkorb` (eigener), `POST /api/v1/papierkorb/<Id>/wiederherstellen`, `DELETE /api/v1/papierkorb/<Id>` und `DELETE /api/v1/papierkorb` (leeren).

## Regeln

- Schlüssel gelten nur unter `/api/v1`, nicht an den internen Adressen der Oberfläche.
- Es gelten dieselben Prüfungen wie in der Oberfläche: Pflichtfelder, eindeutige Werte, geschützte Felder der Benutzer-Mappen – und die [Berechtigungen](berechtigungen.md) des Benutzers, dem der Schlüssel gehört. Mappen, die er nicht lesen darf, liefert die Schnittstelle nicht; Passwörter nur mit dem Recht „Passwörter sehen“.
- Benutzer wählt man auch über die Schnittstelle nur aus denen, deren Benutzer-Mappe man sehen darf (Verantwortlich, Aufgaben, Vertreter). Wie man so ein Programm sauber abgrenzt, zeigt das Beispiel [Ein Programm, das nur Rechnungen sieht](berechtigungen.md#beispiel-ein-programm-das-nur-rechnungen-sieht).
- Im aktiven [Wartungsmodus](wartungsmodus.md) antwortet die Schnittstelle mit `503` und `Retry-After` (Sekunden bis zum erwarteten Ende).
- Fehler kommen als JSON mit einer deutschen Meldung in `fehler`; bei ungültigen Eingaben (422) steht in `details` das Prüfergebnis je Feld.
- Passwortfelder setzt man mit einem Text oder `{"neu": "…"}`, entfernt sie mit `null` und lässt sie unverändert, indem man sie weglässt.
- Feldschlüssel ändern sich nie (siehe [Mappentypen](mappentypen.md#der-schlussel)) – Skripte, die mit ihnen arbeiten, bleiben gültig, auch wenn Bezeichnungen umbenannt werden.
