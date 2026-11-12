art: minor

## Neu

- **Leerseiten erkennen, markieren und beim Übernehmen weglassen** (#997): Ein Paket mit dem neuen Recht „Leere Seiten in neuer Post markieren“ (`dms:leerseiten`) – z. B. *Leerseiten* aus dem Katalog – markiert leere Seiten in neuer Post, auch ohne Trennblatt. In der Post und auf „Dokument übernehmen“ zeigt eine Seitenleiste mit Vorschaubildern jede Seite, markierte sind blass („Leerseite – fällt beim Übernehmen weg“), darüber steht „3 leere Seiten erkannt“. Je Seite **Doch behalten** oder **Auch weglassen**. Beim Übernehmen in eine Mappe entsteht das Dokument ohne diese Seiten, das Original bleibt als frühere Version, die Historie sagt „3 leere Seiten entfernt“; Texterkennung, Archivfassung und Erkennung arbeiten mit der neuen Fassung. Ohne Übernehmen und beim automatischen Zuordnen wird nichts gelöscht. Schnittstelle: `GET`/`PUT /api/v1/dokumente/{id}/leerseiten`, `PUT …/leerseiten/{nr}`, beim Zuordnen `leerseiten: behalten`.
