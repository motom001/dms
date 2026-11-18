# Events and automations { #ereignisse-und-automatisierungen }

## Event catalogue (#670) { #ereigniskatalog }

What happens in Ablago is defined in **one** place: `shared/src/ereignisse.ts` (`EREIGNISKATALOG`), the texts in `shared/src/sprachen/de/ereignisse.json` (`name.<art>`, `text.<art>` – underscore as hyphen –, `gruppe.<gruppe>`). Packages (`code.ereignisse`, exactly the entries with `paket: true` plus the outdated names in `VERALTETE_EREIGNISSE`) and automations (#674) take their events from this catalogue. **The core reports every occurrence exactly once** (#724) – with `kern.ereignis(…)` (in the service `dienst.kern.ereignis(…)`) into the one outbox; there is no longer a second route for packages. The list for reference is in the Workbench with the package under **Which events exist**.

**Rules**

- **Only ids, kind, field keys and date** in `daten` – never values, titles or names. Anyone who wants to know more reads up with their own rights. Only exception: `protokoll.meldung` (#677) carries the text of the message (without secrets, at most 500 characters), because the log only lives in the memory of the process that wrote it – the event never goes to packages or outside.
- **At least once, in the same transaction:** `dienst.kern.ereignis(art, daten, von)` writes to the outbox (table `ereignisse`, migration 060). If a transaction is running (`inTransaktion`), the event belongs to the change – if one fails, neither is saved. Every event has a fixed id; a consumer recognises a repetition by it.
- **Several servers:** the `Ereignisverteiler` (`server/src/ereignisse/ereignisse.ts`) fetches open events with `FOR UPDATE SKIP LOCKED` and a lock (`gesperrt_bis`, 120 s). Only when **all** consumers have accepted it does an event count as dispatched; otherwise it is retried after 1, 5, 30, 120 and 360 minutes, then given up (log). Dispatched events are kept for 7 days.
- **One rule for retries:** `wiederholungNach(versuche)` in `shared/src/ereignisse.ts` (1, 5, 30, 120, 360 minutes) applies to the outbox and delivery to packages.
- **Consumers in the core:** `automatisierungen`, `pakete` (every subscribed event; ends up with a fixed id per package in the package runner's delivery, `paket_ereignisse`). **Jobs** for exactly one package (`datei.umwandeln`, `datei.volltext`, `datei.archivfassung`, `paket.einstellungen_geaendert`, group `auftrag`) are not an occurrence for others: `dienst.ereignisseDienst.auftrag(paket, art, daten)` puts them straight into delivery.
- **Outdated names:** the core no longer reports `texterkennung.fertig`. A package that subscribed to it gets `volltext.fertig` with `quelle: kern` under the old name (transition, `VERALTETE_EREIGNISSE`, dropped with 1.0.0). **All transitional exceptions** are listed with the version that drops them in `server/src/grundlagen/uebergaenge.ts` (#902); `uebergaenge.test.ts` fails as soon as Ablago reaches that version. New special paths for old packages or files only with an entry there.
- **Bundling:** entries with `buendelS` (today `mappe.geaendert`, 5 s) combine quick successions for the same folder as long as the event hasn't been dispatched yet; the field keys are merged (`mischeFelder`).
- **Deadline reached** exactly once: `frist_meldungen` (folder, field, date, time) as the primary key; remembering and event in one transaction.
- **Silent:** `dienst.kern.ohneEreignisse(f)` – examples, load test data (creating and removing). Only events in which packages process files (full text, vectors, post) go into the outbox with `ausloeser.still` – automations skip them, folder events aren't created at all. A restore marks all open events as dispatched; during maintenance and a restore the dispatcher rests.

**Consumers**

```ts
dienst.ereignisse.abonniere('mein-abnehmer', async (e: KatalogEreignis) => {
  // e.id, e.art, e.daten, e.ausloeser, e.erstellt – throwing an error means: try again later
});
```

The `pakete` consumer passes folder events and `frist.erreicht` on to packages that have subscribed to them, name the type under `code.mappentypen` (their own, others', `*`) and are currently allowed to read the folder with their service account's rights (#686: confirmed rights, setting `paket_verwehrt` per folder type, rules for the role *Package*; otherwise a log entry instead of delivery) – with an id computed from event and package id so that a retry doesn't arrive twice at the package.

**Trigger** (`e.ausloeser`): `{ art: 'benutzer' | 'paket' | 'automatisierung' | 'system', id, konto, kette }`. `dienst.kern.ereignis` takes the trigger from the account (`von`: user or a package's service account) or from `dienst.kern.mitAusloeser(a, f)`. An automation (#674) runs its actions like this:

```ts
await dienst.kern.mitAusloeser({ art: 'automatisierung', id: regel.id, konto: systemkonto.id, kette: e.ausloeser.kette ? e.ausloeser.kette + 1 : 1 }, () => aktion());
```

That way it recognises its own changes and can limit chains. A package isn't notified of its own changes.

**New event:** an entry in `EREIGNISKATALOG` (group, fields, if needed `paket`, `mappentyp`, `buendelS`), texts in `ereignisse.json`, and `await this.ereignis(...)` where the change happens – inside the transaction if possible. If packages should be able to subscribe to it, also in `EREIGNISSE` (`shared/src/pakete.ts`) and in the registry (`schema`, `pruefen.py`).

## Automations (#674) { #automatisierungen }

Small routines without code: **When · And · Then · Otherwise** (Otherwise since #677). Model and checks in `shared/src/automatisierung.ts`, engine and storage in `server/src/automatisierung/motor/` (tables `automatisierungen` and `automatisierung_laeufe`, migration 061; versions since #1006 in `fassungen`, migration 108), texts in `shared/src/sprachen/de/automatisierung.json`.

**Model**

- **Exactly one When card:** an event from the catalogue (all groups except `zaehler`, optionally only one folder type, for `mappe.geaendert` optionally only certain fields and with `angelegt` also on creation – the engine then also listens to `mappe.angelegt`, #1001) or `datum` – "date field reached in N days" (negative: N days ago), daily from a time of day in the household's time zone. The When card sets the **context**: the event's folder (`daten.mappe`, for user events the user folder) and its folder type.
- **And:** conditions from the views' toolkit (`Bedingung` from `shared/src/sichten/bedingungen.ts`), plus "folder is in view …" and "folder is in the favourites of …" (person, role, field). Each can be inverted (`nicht`), groups `alle`/`eine` one level deep. Evaluated in the database (`Automatisierungshilfen.trifftTeile` → `repo.inKlauseln`); "me" is the system account.
- **Otherwise** (#677): the same cards as Then, if the And conditions are not met. The run has steps for both branches (`teil: 'dann' | 'sonst'`); the one not taken is `uebersprungen`. Without Otherwise cards it stays `unzutreffend`; `stopp` works in both branches.
- **Workbench cards** (#677): When `fehler.gemeldet`, `protokoll.meldung` (`stufe` warn/error, `modul`, `enthaelt`), `version.neu` (group `betrieb`, `BETRIEB_WENN` in `shared/src/ereignisse.ts`, only for automations) and Then `sicherung`. They have no folder (`istBetrieb`): And only with a feature, tasks to people/roles on their user folder. In the `KartenKontext` the cards get the **Workbench permissions of the system account** (`werkbank`, `server/src/automatisierung/automatisierung-werkbank.ts`): a frozen object with exactly the actions from `SYSTEMKONTO_WERKBANK` (start a backup – only `angestossen`/`laeuft`, new version, see a reported error, log from warning) – new ones only after consultation, a test compares the list. Whoever saves such a card needs the permission for the area (`werkbankBereiche`, checked in `lege`/`aendere`/`kopiere`/`stelleWieder` with `darf`); packages may not bring them. A recipient only gets the text of messages with the permission for the area (`betriebWerte`). The `Betriebsmelder` listens in every process for warnings and errors (`protokoll.beobachte`), puts `protokoll.meldung` into the outbox only for matching switched-on automations (never from the modules `automatisierung`/`ereignisse` or during an automation run) and at most once in 15 minutes per automation (`PROTOKOLL_ABSTAND_MIN`; the engine checks the same via the runs). `version.neu` is checked by the schedule once a day (`neueStabileVersion`, markers `automatisierung_version_geprueft` and `automatisierung_version`), only while such an automation is on.
- **Then:** cards in their order; they are carried out by the entries in `DANN_AUSFUEHRER` (`(karte, kontext) => Promise<string>` – the line for the log; in a dry run (`trocken`) they only describe). "Don't run any further automations afterwards" (`stopp`) is handled by the engine itself.
- **Placeholders** as for the folder title (`{feld}`, `{feld|filter}`), plus `{titel}`, `{mappentyp}`, `{heute}`, `{automatisierung}`, for `datum` also `{datum}` and `{tage}`. Values with the system account's rights; titles of linked folders it may not read appear as "(not visible)"; passwords never.

**Sequence**

1. The event catalogue's `automatisierungen` consumer looks for switched-on, non-paused automations with a matching When card and runs them **one after another** by `reihenfolge` (1–99, then name). Each reads the current state.
2. Per automation and event there is **exactly one run** (`UNIQUE (automatisierung_id, ereignis_id)`) – if an event comes again or two servers check the same day, nothing runs twice. For the schedule, the event id is computed from the automation trigger, folder and date; `letzter_tag` is the schedule building block's marker (missed days up to 31 back are caught up).
3. It runs under the system account "Automatisierung" (`dienst.postSystemmappen.systemZugriff('automatisierung')`) and with `dienst.kern.mitAusloeser({ art: 'automatisierung', id, konto, kette })` – history and events show who acted. If the system account may not read the folder, the run is skipped.
4. Every step (When, And, each Then card) is recorded with its state in the run (`schritte`) – the interface shows progress live. A card error ends the run as `fehlgeschlagen` (can be retried); the following automations still run.

**Schedule building block** (`server/src/zeitplan/zeitplan.ts`, #724): `faelligeTage(zuletzt, jetzt, takt)` is the one rule – due is every day after the last one run on which the rhythm applies (`an(tag)`, e.g. weekday, public holiday), as soon as its time of day is reached, at most `nachholenTage` back (0 = only today); a new one begins today. `laufeFaellige(merker, jetzt, takt, lauf)` first records the day (compare and swap, `Einstellungen.tausche`) and then runs – with several servers exactly one does it. Backup, test restore, daily summary (per user) and "date reached" (catch up 31 days) use it; the marker keys in the settings are the same as before.

**Date reached** (`art: 'datum'`): `vorlauf` with `einheit` (`tage`, `wochen`, `monate`), `uhrzeit`, `wiederholung` (months). `erreichteDaten(tag, vorlauf, einheit)` returns the field dates reached on `tag` – for months all D with D − lead time = tag (end of month capped). Old cards (`tage`, `frist.erreicht`) are translated by `bereinigeWenn`.

**One route for to-dos** (`AufgabenDienst.aufgabeAusAutomatisierung`, #724): `aufgabenEmpfaenger` resolves absence and deactivation via `empfaengerAufloesen`; if no active person can be reached, they go to the administrators (`null`). `aufgaben.anlass` (migration 062, `AufgabenAnlass`): `datum` (resolves itself in `fristenAbgleichen` when the date no longer matches; `wiederholung` → next date), `post` (in `postAufgaben` when the post is no longer new), `abwesenheit` (when the absence ends). From "date reached" the to-do becomes a **deadline** (`art: 'frist'`, field, date); the unique index `aufgaben_frist_idx` applies per folder, field, date and recipient – the same person never gets two.

**Then cards** (`server/src/automatisierung/automatisierung-karten.ts`, #676)

- **Change field** (`feld`): `werte` per field key – fixed, text with placeholders (text, long text, formatted text), for date fields also `heute`, `heute+7`, `heute-3`. Writing goes through `MappenDienst.aendereMappe` with the system account's access and only the chosen fields (#609): field formats, required fields, choice lists and link targets are checked as in the form; archive mode and deadline lock are never bypassed. The history carries `automatisierung: { id, name, eingerichtetVon }`.
- **To do / notification** (`aufgabe`): recipient a person, role (all active members), field of the folder (link to a user) or `ersteller` (whoever created the folder); `als: 'aufgabe'` creates a to-do every time (due `faellig` days from today → appears under "Upcoming"), `als: 'benachrichtigung'` bundles per automation, folder and recipient (one open, the text is updated). Anyone who may not read the folder gets it on their own user folder – without a link. Stage 1 fills placeholders with the system account's rights (recipient rights: #683).

**Interface** (`web/src/werkbank/Automatisierungen.tsx`, #675): Workbench → Build the Library → Automations, in three parts. Cards from the supply come in via `useZiehen` (drop zones `wenn`/`und`/`dann`) or via "+ Card" (choice field, keyboard); Then cards and the list "by trigger" are sorted by dragging or Alt+↑/↓ (order is reassigned in steps of ten). **Live progress by polling:** as long as the editor is open, it fetches `GET …/:id/laeufe` every 2 s – the steps are in the database, so this works with several servers, without SSE and without session affinity. The list asks every 15 s. At start-up, `legeBeispiele()` creates three switched-off examples (origin `dms`, fixed ids from `uuidAus`) if they don't exist yet.

**Protection and limits** (`AUTOMATISIERUNG_GRENZEN`)

- No self-triggering (own changes don't trigger the same automation), chains at most 3 deep, brake at 30 runs per minute (then paused), run time 60 s, 200 automations, 20 cards per area, history of 200 runs or 30 days.
- **Working comes before automating:** if something is missing (folder type, field, view), that never blocks work – the automation turns red and is paused (`angehalten.grund = 'fehlerhaft'`), at the latest on the next run or schedule pass. Saving only works with a valid state.
- Load test data and examples trigger nothing (`ohneEreignisse`); during maintenance and restore the dispatcher rests. After a restore all switched-on automations are paused until an admin switches them on again.
- Saving with `version` (outdated state → 409). Versions as for all Workbench settings (#1006, `server/src/fassungen/`, table `fassungen`): restoring goes through the normal save. In the full export: `struktur/automatisierungen.json` (each automation with its versions, `version` = number of the version) and `struktur/fassungen.json`; all tables in the backup.

## Automation templates and folder runs (#1044) { #ablaufvorlagen }

An **automation template** is an automation with gaps that you apply to one folder; an applied one is a **folder run**. “Assign task” and “Remind” are such templates – there is no separate path for reminders and tasks assigned by hand any more. Model and checks in `shared/src/ablaufvorlagen.ts`, the flow in `server/src/aufgaben/ablaeufe.ts` (`MappenAblaeufe`, `dienst.ablaeufe`), routes in `aufgaben.routen.ts`, UI in `web/src/werkbank/Ablaufvorlagen.tsx` and `web/src/ablage/Aufgaben.tsx` (`Geplant`, `NeueAufgabe`, `ErinnerungFormular`, `AblaufFormular`). Migration 105.

**Model**

- **Template** (`Ablaufvorlage`): `wann` (`sofort`, `datum` – asked when applying –, `in` with `anzahl` and `einheit`), `fragen` (`empfaenger`, `datum`, `text`; `datum` with `in` turns the date into a suggestion that can be changed, #1180 – `fragtDatum()`, `vorschlagDatum()`), `karten` – only `aufgabe` (`VORLAGEN_KARTEN`, task or notification) with recipients `frage` (the answer), `selbst` (who applies), `ersteller` (who created the folder) or `feld` (reference to users; only with fixed `typen`). `vorlagenEingabeFehler` rejects anything else (no silent clean-up), `vorlagenProbleme` checks the structure.
- **Key** instead of id: core defaults `aufgabe_vergeben`, `erinnern` (`KERN_VORLAGEN`, `kernVorlage()`), from packages `paket:schluessel`, own ones `eigen:<uuid>`. A core default is only stored (`ablaufvorlagen`; versions like all Workbench settings in `fassungen`, kind `ablaufvorlage`, since migration 107) once an admin changes it or a package **overlays** it with `ersetzt` – then under its key; without a row the core default applies. Runs name the key (`mappen_ablaeufe.vorlage`) and stay valid whoever delivers the template.
- **Folder run** (`MappenAblauf`, table `mappen_ablaeufe`, formerly `erinnerungen`): template, folder, answers (`empfaengerId`, `text`), `datum` (when it runs), `erstelltVon` (the person) and `angehalten`. “Straight away” creates none.

**Flow**

1. `anwenden(folder, key, answers, person)` – the route has checked read access and recipient (`darf`, `empfaengerSichtbar`). Answers as the dialogs did before (same messages), **brake** `ABLAEUFE_JE_PERSON_UND_MAPPE` (open per person and folder) and `ABLAEUFE_JE_MINUTE` (applied per person and minute, via `ablauf_verlauf`) from `grenzen.ts` – otherwise 429.
2. **Straight away** runs in the same request: as fast as before (without further placeholders no engine, no recipient access). Otherwise the run is created; if its date is today or earlier it runs at once.
3. The daily run (`Fristen.fristenLauf` → `ablaeufe.faellige`) takes each due run out of the table in **one transaction** (`loescheAblauf` returns true to exactly one caller – several servers) and executes its cards.
4. **Rights at run time** (`pruefePerson`): the person is an active user (no package or system account) and may read the folder **now**. Otherwise `angehalten` (`person`, `deaktiviert`, `leserecht`, `vorlage`) – note in the workbench overview and in the email to the administrators; `fortsetzen` checks again.
5. **Cards** go the to-do way: straight away `manuell`, otherwise `erinnerung` with date, creator = person, the same history entries (for `erinnern` word for word as before), deputy (`leiteUm`), case without read access (`faelleNach`, #798); notifications bundled (`benachrichtigeGebuendelt`, key `ablauf:<key>`). The **engine** fills placeholders (`dienst.ablaufPlatzhalter` → `Automatisierungen.fuelleMit`) with the rights of the person and the recipient (#795); `MappenAblaeufe` inserts `{eingabe}`, `{person}`, `{empfaenger}` afterwards so an input never becomes a placeholder itself. Hand-written text stays visible to recipients without read access (no `anlass`).
6. **History** per template in `ablauf_verlauf` (applied, planned, ran, paused, deleted, resumed), cleaned up like the runs of automations.

**Templates from packages** (`inhalt.ablaufvorlagen`, from `DMS_ABLAUFVORLAGEN_AB` = 0.256.0): `liesPaket` (`pakete/verwaltung/lesen.ts`) reads and checks them (only allowed cards, `ersetzt` only for core defaults, types of the package or its dependencies); the permissions preview lists each with its cards (on an update “new” or “different cards”). `MappenAblaeufe.ausPaket` creates or replaces unchanged ones; on removal overlays return the core default, templates with open runs stay as own ones.

**Conversion** (migration 105): `erinnerungen` → `mappen_ablaeufe` with `vorlage = 'erinnern'`; `erstellt_von` stays; if it is empty or not a human, it becomes the recipient. The bin reads older entries as runs of “Remind”. `AufgabenVertretung.legeAufgabeAn` is now just the template “Assign task”.

**API:** `GET`/`POST /api/v1/mappen/{id}/ablaeufe`, `PUT`/`DELETE /api/v1/ablaeufe/{id}`; the endpoints for tasks and reminders stay and go through the same templates. In the full export `struktur/ablaufvorlagen.json` and `daten/ablaeufe.jsonl`.
