# Schnittstelle (API)

Andere Programme – ein Scanner, ein Skript, eine Haushalts-App – greifen über die Schnittstelle unter `/api/v1` auf das DMS zu. Sie können Mappen anlegen, lesen, ändern und löschen und Dokumente hoch- und herunterladen; mit dem Schlüssel eines Administrators auch Mappentypen, Benutzer und Rollen verwalten.

## API-Beschreibung

Die vollständige Beschreibung im **OpenAPI-Format** (Version 3.1):

- **Lesbar** in jeder Installation unter **Profil → API-Dokumentation** – passend zur installierten Version.
- **Maschinenlesbar** unter `/api/openapi.json` der eigenen Installation, z. B. `http://<NAS>:8080/api/openapi.json`. Das lässt sich in Werkzeuge wie Swagger UI, Postman oder einen Code-Generator laden.
- Die Beschreibung der aktuellen Version liegt auch hier: [openapi.json](api/openapi.json).

![API-Dokumentation im DMS](bilder/api-doku.png)

## API-Schlüssel

Jeder Benutzer erzeugt seine Schlüssel selbst im **Profil** unter *API-Schlüssel*:

- **Name** – wofür der Schlüssel ist, z. B. „Scanner Arbeitszimmer“.
- **Recht** – *nur lesen* oder *lesen und schreiben*.
- **Ablaufdatum** – optional.

Der Schlüssel ist **nur einmal vollständig sichtbar**, direkt nach dem Erzeugen; danach zeigt das DMS nur noch seinen Anfang. Gespeichert wird nur ein Prüfwert. Wer ihn verliert, erzeugt einen neuen und löscht den alten.

Ein Schlüssel hat höchstens die Rechte seines Benutzers: Der Schlüssel eines Mitglieds kommt nicht an die Werkbank-Funktionen. Ist der Benutzer deaktiviert, gilt auch sein Schlüssel nicht mehr.

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

## Regeln

- Schlüssel gelten nur unter `/api/v1`, nicht an den internen Adressen der Oberfläche.
- Es gelten dieselben Prüfungen wie in der Oberfläche: Pflichtfelder, eindeutige Werte, geschützte Felder der Benutzer-Mappen, „Neue Mappen erlauben“ und „Löschen erlauben“.
- Fehler kommen als JSON mit einer deutschen Meldung in `fehler`; bei ungültigen Eingaben (422) steht in `details` das Prüfergebnis je Feld.
- Feldschlüssel ändern sich nie (siehe [Mappentypen](mappentypen.md#der-schlussel)) – Skripte, die mit ihnen arbeiten, bleiben gültig, auch wenn Bezeichnungen umbenannt werden.
