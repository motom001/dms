# Prüfstand Erkennung (#1679)

Misst, wie gut Ablago Post einordnet und ausfüllt – gegen einen **Prüfsatz mit richtiger Antwort** je Dokument. Jede
Änderung an Erkennung, Paketen oder Modellen zeigt so, ob sie besser oder schlechter wird.

Das Werkzeug enthält **keine Dokumente**. Der Satz „Lebensläufe“ liegt in einem privaten Repository, das den Prüfstand
wöchentlich laufen lässt; die Tests hier nutzen einen winzigen, erfundenen Mini-Satz
(`server/test/pruefstand-hilfen.ts`).

## Ablauf eines Laufs

1. Eine **frische Ablago** einrichten (Konto, Mandant) oder sich anmelden, Verwaltungsmodus.
2. **Pakete** installieren: die Pakete der Mappentypen des Satzes, dazu Texterkennung und `--zusatz` (z. B.
   `ki_aehnlich`), aus dem Katalog oder mit `--pakete-dateien` als `.zip` aus einem Ordner.
3. **Grundmappen** anlegen: alle Mappen aus `lebenslauf.yaml`, die kein Dokument als `mappe` oder `weitere_mappen` nennt
   (Organisationen, Haus, Personen …). Verweise (`{ beispiel }`) und Vorgaben (`{ vorgabe }`) wie bei den
   Beispiel-Mappen der Pakete. Lehnt Ablago einen Wert ab, fällt das Feld weg; das steht unter „Hinweise beim Aufbau“.
4. Je Dokument **in der Reihenfolge des Datums**: als Neue Post hochladen, auf den Text warten, dann messen:
   - „Wohin gehört das?“ (`POST /api/klassifizieren`): Mappentyp auf Platz 1, unter den ersten drei, Vorschlag über der
     Schwelle, „sicher“ (ab 0,75) bei falschem Typ, je Weg (Kern, Abgleich, Ähnlichkeit, KI-Assistent);
   - Erkennung beim Zuordnen (`POST /api/mappen/:id/erkennung`): Absender auf Platz 1, Zielmappe auf Platz 1 und unter
     den ersten drei;
   - „Aus Dokument ausfüllen“ (`POST /api/typen/:id/vorschlaege`): je erwartetem Feld richtig, falsch oder fehlt.
5. Danach entstehen die Mappen, die dieses Dokument zuerst nennt. Im **Lernlauf** (`--lernen`) ordnet das Werkzeug die
   Post außerdem der richtigen Mappe zu – wie ein Mensch, der den Vorschlag korrigiert.

Gezählt wird nur Messbares: Absender nur, wenn es eine Mappe für ihn gibt; Zielmappe nur, wenn die Mappe vor dem
Dokument schon da war; Mappentyp nur, wenn der Typ installiert ist.

### Szenario „Ungleichgewicht“ (#1672)

`--auffuellen <n>` füllt vor dem Lauf einen häufigen Typ auf (Vorgabe `finanzen:kontoauszug`, sonst
`--auffuell-typ` oder `ungleichgewicht.typ` in `pruefstand.yaml`): `n` Abwandlungen der Dokumente dieses Typs aus dem
Satz – andere Daten, Beträge, Nummern und Buchungszeilen, gleicher Absender – gleich in Mappen ihres Typs, wie in einer
gewachsenen Ablage; Mappen, auf die sie verweisen (etwa das Konto), entstehen dafür schon vorher. Gemessen werden danach die seltenen Stücke und die Dokumente anderer Typen. Der Bericht zeigt je
Stufe Platz 1, Top 3, wie oft der aufgefüllte Typ fälschlich vorn steht und wie oft „sicher“ bei falschem Typ.

## Aufruf

```sh
# Ein Lauf gegen eine laufende, frische Ablago; Ergebnis als JSON
node server/werkzeuge/pruefstand/pruefstand.mjs lauf --satz ../demo_lebenslaeufe --url http://localhost:3000 \
  --email pruefstand@example.org --passwort … --geheim /data/geheim --aus messen.json [--lernen] [--zusatz ki_aehnlich]
node server/werkzeuge/pruefstand/pruefstand.mjs lauf … --auffuellen 200 --aus ungleichgewicht-200.json

# Bericht aus mehreren Läufen, Vergleich mit dem letzten Bericht im Ordner
node server/werkzeuge/pruefstand/pruefstand.mjs bericht --ordner berichte messen.json lernen.json ungleichgewicht-200.json
```

Weitere Schalter: `--code` (Einrichtungscode, sonst `DMS_EINRICHTUNGSCODE` oder `--geheim`/`EINRICHTUNGSCODE`),
`--quelle` (anderer Katalog), `--ohne-texterkennung`, `--hoechstens <n>` und `--nur <id,id>` (zum Ausprobieren),
`--text-sekunden` (Wartezeit auf den Text je Dokument, Vorgabe 180), `--name`, `--image` (steht im Bericht).

Das Werkzeug braucht nur Node und das Paket `yaml` (wie der Server). Außerhalb des Repositorys: den Ordner kopieren und
`npm install yaml` daneben.

## Der Satz

Aufbau wie `FORMAT.md` des Satzes: `gemeinsam/organisationen.yaml`, `<persona>/<lebenslauf>/lebenslauf.yaml` und
`NN-<name>.md` (YAML-Kopf = richtige Antwort), die Dateien unter `ausgabe/<persona>/<lebenslauf>/`. Die Zahl der
Dokumente steht nirgends fest. Freiwillig `pruefstand.yaml` im Satz:

```yaml
paketAlias: { rechnungen: rechnung_bestellung }   # Paket umbenannt
typAlias: { "haushalt:ausweis": "aemter:ausweis" } # Typ umgezogen
pakete: [ki_aehnlich]                              # zusätzlich installieren
ungleichgewicht: { typ: finanzen:kontoauszug }
```

## Bericht

JSON (alles, auch je Dokument) und Markdown: Kennzahlen je Lauf, nach Seltenheit, Form und Absender (erstes Dokument
oder bekannt), je Weg, „Bei Ungleichgewicht“ und „Hinweise beim Aufbau“. Der Bericht nennt Commit und Zahl der Dokumente
des Satzes. Verglichen wird mit dem letzten Bericht im Ordner, je Lauf nur über die Dokument-Ids, die beide haben;
schlechtere Zahlen (mehr als 0,5 Prozentpunkte) stehen als Hinweis da, im Workflow auch als Warnung.
