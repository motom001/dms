# Beitrag einreichen

## Vor dem Pull Request

- Das Issue trägt das Label **`freigegeben`**.
- **Leitplanken eingehalten** ([Was jeder Beitrag einhält](index.md#was-jeder-beitrag-einhalt)): kein neuer Weg nach draußen ohne ausdrückliche Zustimmung und ohne Zeile in [Wege nach draußen](nach-draussen.md#wege-nach-draussen), keine Telemetrie, nichts von fremden Servern, offene Formate im Export, keine heimliche Änderung bei Updates.
- Ein eigener Branch, z. B. `abwesenheit-vertreter`, von aktuellem `main`.
- **Tests** für das Neue, im Arbeitsspeicher und, wo Daten gespeichert werden, auch gegen PostgreSQL.
- `npm test` und `npm run typecheck` laufen lokal durch, `npm run lint` und `npm run lint:abh` melden keine Fehler. Bestehende Verstöße stehen in einer Liste, die nicht wachsen darf – umtragen ja, hinzufügen nein ([Stil und Abhängigkeiten](stil.md#bestand)).
- **Keine neue Abhängigkeit ohne Begründung:** Wer ein npm-Paket unter `dependencies` oder ein Alpine-Paket im `Dockerfile` ergänzt, beantwortet in der PR-Beschreibung die Fragen unter [Abhängigkeiten](abhaengigkeiten.md). Die Prüfung im PR weist darauf hin.
- **Handbuch** angepasst, wo sich etwas Sichtbares ändert: Benutzer-, Administrator- oder Installationshandbuch. Neue ?-Symbole brauchen einen Eintrag in `shared/src/hilfe.ts`.
- **Englisches Handbuch** mitgepflegt (#730): Jedes Handbuch hat neben `docs/` den Ordner `docs-en/` mit derselben Gliederung. Wer eine deutsche Seite ändert, ändert die englische mit – oder vermerkt im Pull Request, dass die Übersetzung noch fehlt. `python3 docs/handbuch/werkzeuge/anker.py en` trägt die deutschen Anker in neue englische Überschriften ein, `--pruefen` meldet Seiten, deren Gliederung abweicht.
- **Release-Notizen:** Wer das Programm ändert, legt einen Schnipsel `docs/releases/neu/<branch>.md` an – erste Zeile `art: minor`, `art: patch` oder `art: keine`, darunter die Notizen aus dem Blick der Nutzer. Die Versionsnummer entsteht erst beim Merge; die Nummern in den `package.json` fasst niemand von Hand an ([Release](release.md#versionsnummer-beim-merge)).
- **Neue Seite, neue Route:** Was dazugehört, steht unter [Neues einbauen](checklisten.md).

## Der Pull Request

- Titel kurz und deutsch, z. B. *„0.15.0: Abwesenheit mit Vertreter (#78)“*.
- Beschreibung nach der Vorlage, mit `Closes #…`.
- Klein halten: lieber zwei PRs als einer, der vieles auf einmal ändert.
- Die Prüfungen müssen grün sein. Schlägt die CI fehl, steht der Grund als Anmerkung im Lauf.

## Stil

- **Sprache:** Oberfläche, Handbuch, Release-Notizen und Commit-Nachrichten auf Deutsch. Auch Bezeichner im Code sind deutsch (`mappe`, `schreibe`, `laden`). Fachbegriffe ohne gutes deutsches Wort bleiben, wie sie sind.
- **Begriffe:** Verwende die Wörter aus dem [Glossar](https://help.ablago.app/benutzer/aktuell/begriffe/) und nicht die, die dort unter „nicht verwenden“ stehen. Ein neuer Begriff kommt mit demselben Pull Request in `docs/glossar.yml`, mit Beschreibung und der Einstufung für Einsteiger (siehe [Für wen wir bauen](personas.md)). `python3 docs/handbuch/werkzeuge/glossar.py` erzeugt daraus die Seite „Begriffe“ (de und en); sie ist eingecheckt und kommt mit in den Pull Request – die CI prüft, dass sie zum Glossar passt.
- **Der Name (#687):** Das Programm heißt **Ablago** – ein Wort, nur das A groß, nicht „Ablago DMS“ und nicht „ABLAGO“. Wo der Zusammenhang fehlt (Seitentitel, Store-Eintrag, Suche), steht die Beschreibung daneben: „Ablago – Dokumentenablage für zu Hause und kleine Betriebe“, englisch „Ablago – document filing for home and small businesses“. Meint ein Text das eigene Programm, heißt es „Ablago“ („in Ablago“); ist die Programmart gemeint („Wie komme ich an ein DMS?“), bleibt „DMS“. **Es bleiben**, damit niemand etwas umstellen muss: Repository-Namen (`dms`, `dms-registry` …), API-Pfade, Umgebungsvariablen `DMS_…`, Image-Namen (`ghcr.io/motom001/dms`, `dms-komplett`), Paket-Kennungen, Rechte (`dms:…`), Kennungen in Dateien und Barcodes (`DMS-ASN:`, `DMS-TRENNEN`, `DMS-SICHERUNG`). Seit der Umstellung (#692) heißen auch der Standard-Zielordner beim Postfach, der Anmeldebereich des Laufwerks (WebDAV) und die Unraid-Vorlagen „Ablago“; das Prüfwort des Schlüssels ist „Ablago“, alte Sicherungen mit „DMS“ bleiben lesbar. Logo und Farben kommen nur aus dem Ordner `marke/` im Repository dms-website.
- **Texte für Nutzer:** kurz, freundlich, ohne Fachjargon, aus dem Blick des Lesers („Speichere deine Arbeit“).
- **Texte gehören in die Sprachdatei:** Wer einen Text neu schreibt oder ändert, legt ihn in `shared/src/sprachen/de/<bereich>.json` ab und ruft ihn mit `t('<bereich>.<schluessel>')` ab – siehe [Texte und Sprachdateien](texte.md#texte-und-sprachdateien). Die CI prüft fehlende und ungenutzte Schlüssel.
- **Symbole:** einfarbig und aus einer Sammlung – `<Symbol name="…" />` aus `web/src/Symbol.tsx` (Formen aus Lucide, Farbe = Textfarbe, `aria-hidden`; die Beschriftung trägt die Bedeutung). Keine Emoji in der Oberfläche, die CI prüft das (`web/test/symbole.test.ts`). Farbe nur mit Bedeutung, z. B. Warnung oder Erfolg.
- **Code:** TypeScript strikt, kleine Funktionen, Bezeichner, die sagen, was sie sind.
- <span id="kommentare"></span>**Kommentare erklären das Warum** – was der Code nicht selbst sagt: einen Grund, eine Grenze, eine Falle, eine bewusst andere Lösung. Die Issue-Nummer steht **zusätzlich** dabei, damit man die Diskussion findet, nie statt der Erklärung:

    ```ts
    // Abwesenheit (#78): Die Aufgabe geht an den Vertreter, nicht an die abwesende Person – sonst bliebe sie liegen.
    ```

    Nicht: `// #78` allein, und auch nicht nacherzählen, was die Zeile darunter tut. Die Regel gilt für neuen und geänderten Code; bestehende Kommentare werden nicht nachträglich umgeschrieben.
- **Commits:** eine Zeile Zusammenfassung, darunter bei Bedarf Stichpunkte.

## Danach

Der Maintainer schaut sich den PR an, fragt nach oder ändert Kleinigkeiten selbst und mergt. Ab da läuft alles Weitere automatisch.
