art: keine

- Der Server-Test `wiederherstellung.test.ts` gibt seine Datenbankverbindungen je Test frei und hält höchstens 7 gleichzeitig statt bis zu 38 (#1462).
- Der Server-Test „besteht pruefen.py der Registry“ kopiert die ganzen Ordner `werkzeuge` und `schema` der Registry und trägt die Paket-Id des Testpakets in die Kopie von `werkzeuge/ids.txt` ein; mit einem aktuellen Stand von dms-registry ist er wieder grün (#1386).
