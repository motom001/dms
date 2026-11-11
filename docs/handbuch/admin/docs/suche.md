# Suche

Die Suche der Ablage verzeiht Tippfehler und andere Schreibweisen. Was sie dabei tut, stellst du unter **Werkbank → Suche und Volltext → Suche** ein, die gleichbedeutenden Wörter unter **Werkbank → Gleichbedeutende Wörter** (beide in der Gruppe *Post und Eingänge*; in der Vorlage *Haushalt* nur im [Expertenmodus](uebersicht.md#werkbank-anpassen), in *Betrieb* und *Alles* immer). Wie Benutzer suchen, steht im [Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/ablage/#suchen).

## Was immer gilt

Ohne Einstellung gleicht die Suche aus:

- **Umlaute, Akzente und ß:** „Gebuhr“ findet „Gebühr“, „Strasse“ findet „Straße“, „Ozdemir“ findet „Özdemir“ – in Titeln, Angaben, Notizen und im Volltext.
- **Bindestriche:** „Kfzversicherung“ findet „Kfz-Versicherung“ und umgekehrt.
- **Wortformen** im Volltext: „Rechnungen“ findet „Rechnung“ – in der Sprache des Dokuments (Deutsch, wenn keine erkannt ist). Bei Dokumenten in mehreren Sprachen (seit 0.139.0) je Seite in ihrer Sprache; gesucht wird über alle Sprachen des Dokuments (siehe [Texterkennung → Dokumente in mehreren Sprachen](texterkennung.md#mehrere-sprachen)).

## Tippfehler und „Meintest du …?“

Findet die Suche **nichts**, sucht sie mit ähnlichen Wörtern aus deiner Ablage weiter (Ähnlichkeit über Buchstabengruppen, pg_trgm) und sagt das über den Treffern: „Keine genauen Treffer für ‚Waschmaschiene‘. Gezeigt werden ähnliche Schreibweisen.“ Dazu schlägt sie **„Meintest du ‚waschmaschine‘?“** vor; ein Klick sucht genau dieses Wort. Gibt es genaue Treffer, bleibt es bei ihnen – genaue Treffer gehen immer vor.

Die ähnlichen Wörter kommen aus dem **Wörterverzeichnis**: allen Wörtern ab vier Buchstaben aus Titeln, Angaben und Volltexten. Es wächst von selbst mit – neue Wörter kommen im Hintergrund alle paar Sekunden dazu, damit gleichzeitiges Speichern sich nicht gegenseitig blockiert; Wörter gelöschter Mappen bleiben stehen, bis du es mit **Neu aufbauen** frisch zählst (das dauert bei großen Ablagen einige Sekunden). Mit dem Haken **Bei keinem Treffer ähnliche Schreibweisen zeigen …** schaltest du die Tippfehler-Suche ab.

Ähnlich klingende Namen (Meier, Mayer, Maier) findet die Suche nur, wenn sie sich auch ähnlich schreiben.

## Gleichbedeutende Wörter

Eine **Gruppe** gleichbedeutender Wörter, z. B. *Kfz, Auto, PKW* oder *Nebenkosten, Betriebskosten*, sorgt dafür, dass die Suche nach einem der Wörter auch die anderen findet. Die Gruppen haben einen eigenen Bereich: **Werkbank → Post und Eingänge → Gleichbedeutende Wörter**, direkt unter *Suche und Volltext* (seit #992; vorher standen sie unten auf der Seite *Suche und Volltext*, dort steht jetzt ein Link). Aufgebaut ist er wie die anderen Sammlungen der Werkbank:

![Werkbank → Gleichbedeutende Wörter](bilder/werkbank-woerter.png)

- **In der Mitte** steht je Gruppe eine Zeile: das erste Wort fett, dahinter die übrigen leise (**Rechnung** · Beleg · Faktura), darunter die Herkunft – *Eigene* oder der Name des Pakets. Das **Suchfeld** darüber findet jedes Wort einer Gruppe, nicht nur das erste, und markiert es; mit **Herkunft** zeigst du nur eigene Gruppen oder die eines Pakets. Mit **+ Neu** legst du eine Gruppe an.
- **Rechts** stehen die Wörter der gewählten Gruppe einzeln untereinander. Du kannst Wörter ändern, mit **+ Wort** dazunehmen, mit **×** entfernen und mit **↑**/**↓** die Reihenfolge ändern – unter dem ersten Wort steht die Gruppe in der Liste. Steht ein Wort schon in einer anderen Gruppe, siehst du das darunter mit einem Link dorthin; das ist erlaubt, die Suche nimmt dann die Wörter beider Gruppen.
- **Speichern** prüft: mindestens zwei und höchstens 20 Wörter, je 2 bis 60 Zeichen, kein Wort doppelt (Groß- und Kleinschreibung und Umlaute zählen dabei nicht: *Kfz* und *KFZ* sind dasselbe Wort).
- **Entfernen** fragt vorher nach.
- **Gleichzeitig bearbeitet:** Hat jemand anderes die Gruppe inzwischen gespeichert, überschreibt Ablago das nicht still, sondern meldet es – wie bei [Mappentypen](mappentypen.md). Mit **Änderungen verwerfen** siehst du den neuen Stand und übernimmst deine Änderung noch einmal.

Am Handy stehen Liste und Gruppe nacheinander; **← Zur Liste** führt zurück.

Gruppen gelten für einfache Suchen. Wer Anführungszeichen oder ein Minus benutzt (siehe [Suchsyntax](https://help.ablago.app/benutzer/aktuell/ablage/#im-text-der-dokumente-suchen)), sucht genau das Eingegebene.

**Gruppen aus Paketen:** [Pakete](pakete.md) können fertige Gruppen mitbringen (Wortlisten), z. B. für Fahrzeuge oder Vermietung. Sie stehen mit dem Namen des Pakets in derselben Liste, lassen sich aber nur ansehen: Sie ändern sich mit einem Update des Pakets und verschwinden, wenn du das Paket entfernst. Mit **Als eigene Gruppe übernehmen** legst du eine Kopie an, die du ändern kannst; die Gruppe des Pakets bleibt daneben bestehen.

**Wer darf:** Der Bereich lässt sich wie jeder andere einzeln als [Verwaltungsrecht](benutzer.md) vergeben. Wer vor dem Update *Suche und Volltext* verwalten durfte, darf auch *Gleichbedeutende Wörter*; wer *Suche und Volltext* in der Leiste ein- oder ausgeblendet hatte, für den gilt das auch für den neuen Bereich.

## Technik

- **PostgreSQL:** Umlaute faltet die Erweiterung `unaccent`, Tippfehler und Wortteile findet `pg_trgm` – mehr dazu unter [Erweiterungen der Datenbank](#erweiterungen-der-datenbank).
- **Suchindex:** Das Update auf 0.127.0 baut den Suchindex der Dokumente einmal neu auf (Sprache des Dokuments, Umlaute, Bindestriche) und füllt das Wörterverzeichnis. Das dauert je nach Ablage einige Sekunden bis Minuten; in der Zeit startet Ablago noch nicht. Messwerte stehen in den Release-Notizen.
- **Sicherung:** Das Wörterverzeichnis gehört nicht in die Sicherung; beim Wiederherstellen entsteht es aus Mappen und Dokumenten neu. Die gleichbedeutenden Wörter sind in Sicherung und [Vollexport](export.md) (`struktur/synonyme.json`).

## Erweiterungen der Datenbank

Die Suche nutzt zwei Erweiterungen von PostgreSQL:

| Erweiterung | wofür | fehlt sie |
| --- | --- | --- |
| `pg_trgm` | Tippfehler und „Meintest du …?“, schnelle Suche nach Wortteilen („Ofen“ findet „Backofen“) | keine ähnlichen Schreibweisen, Wortteile ohne Index (langsamer) |
| `unaccent` | Umlaute, Akzente und ß („Muller“ findet „Müller“) | Ablago faltet selbst, nur die häufigen Buchstaben |

Beide sind ab PostgreSQL 13 „vertrauenswürdig“: Der Eigentümer der Datenbank legt sie ohne Superuser-Rechte an – auch bei einer [eigenen Datenbank](installation.md#datenbank-anbindung). `postgres:17` und `dms-komplett` bringen sie mit. Ablago legt sie im eigenen Schema **`erweiterungen_dms`** an. Das ist wichtig fürs [Wiederherstellen](wiederherstellen.md): Es tauscht das Schema `public` aus und löscht das alte samt Inhalt – eine Erweiterung dort verschwände mit. Bis 0.131.0 lag `pg_trgm` noch in `public`; nach einer Wiederherstellung war die Tippfehler-Suche dann still aus. Das Update auf 0.131.1 zieht sie um und legt sie neu an, wenn sie schon fehlt.

**Prüfung:** Bei jedem Start legt Ablago eine fehlende `pg_trgm` neu an und zieht Erweiterungen aus `public` nach `erweiterungen_dms` um (die Indizes dazu entstehen danach im Hintergrund). Klappt das nicht, steht unter **Werkbank → Systemzustand** ein Hinweis mit Abhilfe, dazu ein Hinweis in der Übersicht und im [Protokoll](fehlersuche.md#protokoll) (Modul *datenbank*). Auch die [Probe-Wiederherstellung](wiederherstellen.md#probe-wiederherstellung) meldet fehlende Erweiterungen.

**Abhilfe**, wenn der Hinweis bleibt:

- **Recht fehlt:** Der Datenbank-Benutzer von Ablago braucht das Recht `CREATE` auf seiner Datenbank (als Eigentümer der Datenbank hat er es). Danach Ablago neu starten.
- **Erweiterung nicht installiert:** Bei einer eigenen PostgreSQL-Installation gehören beide zum Paket `postgresql-contrib` (bei Debian/Ubuntu im Server-Paket enthalten).
- **Gehört einem anderen Benutzer:** Hat die Verwaltung der Datenbank die Erweiterung selbst in `public` angelegt, kann Ablago sie nicht umziehen. Dann zieht sie die Verwaltung um: `ALTER EXTENSION pg_trgm SET SCHEMA erweiterungen_dms;` – bei `unaccent` danach Ablago neu starten, es passt seine Suchfunktion beim Start an.
- Fehlt `unaccent` von Anfang an, funktioniert die Suche trotzdem; Ablago nimmt die Erweiterung nicht nachträglich auf.
