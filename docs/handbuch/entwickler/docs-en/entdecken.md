# Tours and tips { #rundgaenge-und-tipps }

## Tours, tips and anchor points (#831, #832) { #entdecken }

Tours and tips are **data, not code**. Ablago's own live in `shared/entdecken/` – in the same format that packages will later bring as `inhalt/rundgaenge.yaml` and `inhalt/tipps.yaml` (stage 2, checks in [dms-registry #132](https://github.com/motom001/dms-registry/issues/132)). There is one mechanism for everything: a source supplies raw entries, `pruefeRundgaenge` and `pruefeTipps` (`shared/src/entdecken.ts`) check them, and the server filters them per person (`server/src/entdecken/entdecken.ts`). A package will later only add another source.

| File | Content |
| --- | --- |
| `shared/entdecken/anker.yaml` | fixed anchor points of the interface (machine-readable, also for the registry) |
| `shared/entdecken/rundgaenge.yaml` | Ablago's tour |
| `shared/entdecken/tipps.yaml` | Ablago's tips (order = order of the tip of the day) |
| `shared/src/sprachen/<language>/entdecken.json` | their texts |

The server reads the YAML files at runtime (in the image under `/app/shared/entdecken`, see the Dockerfile). Faulty entries are dropped and logged once; nothing changes for the person.

### Tour {#rundgang}

```yaml
- schluessel: ablago            # lower case, digits, _
  start: erste_anmeldung        # manuell | erste_anmeldung (Ablago itself only)
  fuer: lesen                   # lesen (everyone) | verwalten (only with the right to administer)
  oeffne: { seite: start }      # open this page before the first step
  schritte:                     # at most 8
    - schluessel: dreiteilung
      bild: dreiteilung         # built-in picture
    - schluessel: erledigen
      ziel: [navigation.zu-erledigen, startseite.zu-erledigen]   # the first visible anchor wins
      fuer: lesen               # verwalten: step only for administrators (e.g. Workbench)
```

Texts: title, description and closing sentence under `rundgang.<tour>.titel | .beschreibung | .ende`, per step `rundgang.<tour>.<step>.titel | .text | .text-handy | .text-verwalten | .ort` (underscores in the key become hyphens in the language file). `text-handy` applies on a phone, `text-verwalten` for people who may administer, `ort` tells screen readers where the highlighted element is – it is required for every `ziel`. Packages bring the same keys in their own language files ([Languages](#paket-rundgaenge-sprachen)); older ones write the texts directly into the file (`titel`, `text`, `text_handy`, `text_verwalten`, `ort`). Limits: title 60, texts 200 characters.

At runtime a step is dropped silently if none of its anchors is visible (for example on a phone) – with a note in the console (`console.debug`), without a message for the person.

#### Tours from packages { #paket-rundgaenge }

A package names `inhalt.rundgaenge: inhalt/rundgaenge.yaml` in its manifest. The texts are in the [package's language files](#paket-rundgaenge-sprachen) or (German only) directly in the file; in Ablago the tours are called `<package>:<key>`. Tours should lead through a task and carry a task-based title (“Record an incoming invoice”) – it is listed under “What comes with it”.

```yaml
# inhalt/rundgaenge.yaml
- schluessel: vertraege_kennenlernen
  titel: Verträge im Überblick
  beschreibung: Wo Fristen und Unterlagen eines Vertrags stehen.
  start: nach_installation          # manuell | nach_installation | nach_update – never starts by itself
  fuer: lesen                       # lesen = whoever may read the folder type · verwalten = with the right to administer
  oeffne:
    mappe: { typ: vertrag }         # first folder of the type the person may read; neu: { typ } = empty form
  ersatz: Sobald du einen Vertrag angelegt hast, zeigt dir Ablago hier, wie es geht.
  schritte:
    - schluessel: frist
      ziel: mappe.feld:kuendigen_bis
      ort: Rechts in der Mappe
      titel: Kündigen bis
      text: Hier steht, bis wann du kündigen musst. Ablago erinnert dich rechtzeitig.
      handbuch: admin/pakete/#so-nutzt-du-es               # page in the bundled manual (benutzer/ or admin/)
      sonst_verwalten: Frag die Person, die Ablago bei euch verwaltet.   # only for people without the right to administer
```

- **Check on installation** (like the package check, dms-registry #132): unknown fields and anchors, fields and registers the package's own folder type does not have (`mappe.feld:<key>`, `mappe.register:<key>` against `oeffne`), folder types that belong neither to the package nor to a dependency, more than 8 steps, texts over 200 (titles 60) characters, `nach_installation` more than once per package, `erste_anmeldung`. An error makes the package invalid.
- **At runtime** Ablago checks again against its own anchors and the installed folder types (a package for a newer version may name anchors that do not exist here yet): faulty tours are dropped and logged once; if a target is missing, the step is dropped silently.
- **`oeffne`:** `mappe` opens the most recently changed folder of the type that the person may read; `neu` an empty form, only if they may create the type – nothing is saved, and at the end Ablago goes back. Otherwise `ersatz` (or a general sentence) is shown instead of the steps. `GET /api/entdecken/rundgaenge/:schluessel/oeffnen` returns the path.
- **Quiet:** tours from packages never start by themselves. With `nach_installation` or `nach_update` Ablago offers them as a tip for 30 days after installing or updating (`ANGEBOT_TAGE` in `shared/src/entdecken.ts`; “Contracts at a glance – a short tour”, `angebot:<tour>`, “new”); the tip-of-the-day rule applies (at most one a day). All of them are on “Discover Ablago”.
- **Own tours** (#941) are written by administrators under Workbench → Tours in the same format (one tour per file, `start` always `manuell`, key `eigen:<key>`); together with the on/off of all tours they are stored in the setting `entdecken_werkbank` (`server/src/entdecken/entdecken-werkbank.ts`) and go into a package as `inhalt/rundgaenge.yaml` with “Create package”. The check reports the location of each error (`orte` of `pruefeRundgaenge`), which the Workbench turns into the line.

#### Languages { #paket-rundgaenge-sprachen }

The texts of a package's tours and tips (#1307) are in language files like Ablago's own: `texte/<language>/entdecken.json` in the package, flat, with the same keys as `shared/src/sprachen/<language>/entdecken.json` – without the area in front, underscores become hyphens. The YAML file then only holds the structure. Rules in `shared/src/entdecken-paket.ts`.

```text
inhalt/rundgaenge.yaml       structure: schluessel, start, oeffne, schritte with ziel …
inhalt/tipps.yaml            structure: schluessel, typ, ziel or rundgang …
texte/de/entdecken.json      German – the package's base language
texte/en/entdecken.json      further languages, e.g. English, pt-BR …
```

```json
{
  "rundgang.vertraege-kennenlernen.titel": "Contracts at a glance",
  "rundgang.vertraege-kennenlernen.beschreibung": "Where the deadlines and documents of a contract are.",
  "rundgang.vertraege-kennenlernen.frist.titel": "Cancel by",
  "rundgang.vertraege-kennenlernen.frist.text": "This is when you must cancel at the latest. Ablago reminds you in time.",
  "rundgang.vertraege-kennenlernen.frist.ort": "On the right in the folder",
  "tipp.kuendigen": "Did you know? Ablago reminds you of every notice period."
}
```

- **Shown** is the person's language (`pt-BR` otherwise takes `pt`). If a text is missing there, the text directly in the YAML file applies, then German (`texte/de/entdecken.json`) – as with labels, German is the base language. So German may also stay directly in the YAML file with only the translations in `texte/`.
- **Check on installation:** every language like German (lengths, no angle brackets, two sentences per tip). Keys that belong to no tour, step or tip are an error (so typos show up); missing translations are listed in the preview as a hint (“in en: 2 texts are missing, the German ones appear there”). At most 30 languages, 64 KB per file, texts only.
- **Backwards compatible:** packages with texts only directly in the YAML file keep working; the preview points out that they exist in one language only. Older Ablago versions do not read `texte/<language>/` – a package that has the texts only there therefore requires the version with #1307 (`dms: ">=…"`).
- The texts are stored with the installed package (`entdecken.texte`); “What comes with it” names tours in the person's language.

### Tip {#tipp}

```yaml
- schluessel: suche_in_dokumenten
  bereich: suche                # suche | post | fristen | mappen | konto | verwalten
  ziel: startseite.suche        # anchor with a fixed page …
  # rundgang: ablago            # … or a tour (exactly one of the two)
  fuer: lesen                   # lesen | verwalten
  funktion: fragen              # optional: fragen | laufwerk | mail – only if switched on
  ab_version: 0.216.0           # optional: "New since your last visit"
```

Text under `tipp.<key>`: at most 160 characters and two sentences, addressing the reader as “du”/“you”, only terms from the [glossary](https://github.com/motom001/dms/blob/main/docs/glossar.yml). **Every visible new feature brings its tip in the same PR** (with `ab_version` of the version in which it appears); the wording is checked in the ongoing quality control. At most 20 tips per package.

#### Tips from packages { #paket-tipps }

A package names `inhalt.tipps: inhalt/tipps.yaml`; the text is under `tipp.<key>` in the [package's language files](#paket-rundgaenge-sprachen) or (German only) directly in the file, and in Ablago the tips are called `<package>:<key>`.

```yaml
# inhalt/tipps.yaml
- schluessel: ausfuellen_neu
  text: Neu in Verträge 2.1 – Ablago liest Anbieter, Nummer und Laufzeit direkt aus dem Vertrag.
  ab_version: 2.1.0                   # “new” for everyone who updated the package to this version
  fuer: lesen                         # lesen | verwalten
  typ: vertrag                        # optional: only whoever may read this folder type
  rundgang: vertraege_kennenlernen    # the sentence starts this tour of the package …
- schluessel: kuendigen
  text: Wusstest du schon? Ablago erinnert dich an jede Kündigungsfrist.
  typ: vertrag
  ziel: mappe.feld:kuendigen_bis      # … or leads to this place (in the first readable folder of the type)
```

**Workbench → Tips** (#942): own tips (`eigen:tipp_<n>`) and adaptations of tips from Ablago and from packages are stored in the setting `entdecken_werkbank` – adaptations per full key with the new values and the original as it was then (this is how the Workbench sees that the original has changed since the adaptation). An adaptation that no longer passes the check (e.g. tour deleted) does not apply; the original applies again. “Create package” writes own tips to `inhalt/tipps.yaml`; adaptations of other packages' tips only come along with #654 as an addendum.

`bereich` is optional in packages (default `mappen`). A target inside a folder (`mappe.feld:`, `mappe.register:`) needs `typ`; the interface then opens the first folder of that type the person may read (`GET /api/entdecken/tipps/:schluessel/oeffnen`). Anchors on every folder such as `mappe.aktionen` (“Folder ▾”, #1307) also work without `typ` – also in Ablago's own tips (`erinnern`): then it opens the most recently changed folder of any type the person may read; if there is none, it shows a fallback sentence in the tour window instead of jumping into nothing. “New since your last visit” applies for 30 days after the package was updated to a version from `ab_version` (Ablago keeps the previous version with the installed package). The check on installation works like for tours: schema, known anchors, fields and registers, tours of the package, at most 20 tips and 160 characters, two sentences.

### Anchor points { #anker }

Targets are fixed anchor points, not HTML ids: the element carries `data-anker="<anchor>"` (on `Link` the property `anker`). The list is in `shared/entdecken/anker.yaml` with page, description, `handy` (also visible on a phone) and `clients` (also exists in clients). Patterns such as `mappe.register:<key>`, `mappe.feld:<key>` and `werkbank.bereich:<route>` match any key. Today they include:

`neu`, `benutzermenue`, `navigation.ansichten`, `navigation.ansicht-waehlen`, `navigation.erweiterte-suche`, `navigation.zu-erledigen`, `navigation.neue-post`, `navigation.favoriten`, `liste`, `mappe`, `startseite.suche`, `startseite.fragen`, `startseite.feld-art`, `startseite.tipp`, `assistent`, `startseite.zu-erledigen`, `startseite.neue-post`, `startseite.termin`, `startseite.zuletzt`, `zu-erledigen.ansicht`, `mappe.aktionen`, `mappe.stern`, `mappe.register:<key>`, `mappe.feld:<key>`, `konto.abwesenheit`, `konto.schrift`, `konto.startseite`, `konto.tipps`, `konto.zusammenfassung`, `entdecken.rundgaenge`, `werkbank.bereich:<route>`, `werkbank.typen.suche`, `werkbank.sichten.suche`, `werkbank.nummernkreise.suche`, `werkbank.auskuenfte.suche`, `werkbank.auskuenfte.nur-offene`, `werkbank.fehlermeldungen.suche`.

`server/test/entdecken.test.ts` checks during the build: every anchor appears in the interface's source, format, targets and tours exist, lengths are right, and every text is there in German and English. Whoever rebuilds an element keeps the attribute; new anchors are added, existing ones are **never renamed or removed** (#1307) – tours from packages and custom ones rely on them, and the registry compares its copy of the list. `server/test/entdecken-anker.test.ts` checks against the stored list `server/test/charakter/anker.json`: a new anchor goes to the end of that list in the same PR.

**Behind a toggle (#1002):** if an anchor is not visible yet, `warteAufAnker` (`web/src/entdecken/stand.ts`) announces it with `ankerGesucht`. A page that only shows the spot after switching listens with `beiAnkerGesucht` and switches – only for the moment, nothing is remembered. This way the assistant at the bottom right (#1219) opens at “Ask” for `startseite.fragen`, at “Tips” for `startseite.tipp` and with its toggle for `startseite.feld-art` – only because the person clicked a tip or tour. The names `startseite.*` date from before #1218/#1219; anchors are not renamed, and `startseite.suche` has since been the search box at the top, in the header.

### Interface and what is remembered {#schnittstelle-und-merker}

- `GET /api/entdecken` – tours and tips for the signed-in person in their language (filtered by the right to administer and by switched-on features), plus the tip of the day (`tipp`), whether the tip line is on (`tippsAn`) and which tour starts by itself now (`starten`). Per tip: anchor and page or tour, origin (`ablago`, later `paket:<id>`), `neu`, `ausgeblendet` and `clients` (suitable for clients: no tour, the anchor exists there too).
- `POST /api/entdecken/tipps/:schluessel` with `aktion`: `gezeigt`, `erledigt`, `ausblenden`, `einblenden`.
- `POST /api/entdecken/rundgaenge/:schluessel` with `stand`: `gesehen` or `spaeter`.
- In `/api/v1` (for clients, #831/#832): `GET /entdecken` with a key of the level “read”, `POST /entdecken/tipps/{schluessel}` and `POST /entdecken/rundgaenge/{schluessel}` also with “read” (#1307, `lesenGenuegt` in the `/api/v1` table: only sets markers of the person themself; not “counters only”) – so the interface and the app do not report twice. Clients only show tips with `clients: true`. A client's own tips use the same format; `pruefeTipps` in `shared/src/entdecken.ts` does not need a package for that.

This is stored per person in their settings (`entdecken_rundgaenge`, `entdecken_tipps`, `entdecken_version`; tip of the day off: `tipps` = false) – no telemetry. While standing in for someone, nothing starts by itself and nothing is remembered. Migration 088 sets Ablago's tour to “seen” for accounts that had signed in before the update. The manual's screenshot and timing scripts mark their accounts the same way (`aufnehmen.mjs`, `ladezeiten.mjs`).

Tours and tips from packages: see [Tours from packages](#paket-rundgaenge) and [Tips from packages](#paket-tipps).
