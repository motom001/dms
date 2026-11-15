# Who we build for {#fur-wen-wir-bauen}

Ablago is meant to help people organise the information of their lives. So that terms, defaults and new functions fit together, we orient ourselves by **nine personas**: invented but typical people, from the small household to the large corporation. The names are only memory aids.

**As of:** 3 November 2026 (Ablago 0.158). The focus is a deliberate decision by the maintainer. Since 3 November 2026 the self-employed and small businesses have been part of it; the focus is reviewed regularly. Changes are below under [Focus decisions](#fokus-entscheidungen).

## The scale { #die-skala }

![Scale from level 1 (beginner family) to level 9 (large enterprise) with focus marking](grafiken/personas-skala.en.svg)

| Level | Persona | Size | Who administers | Focus as of today |
|---|---|---|---|---|
| 1 | Beginner family (Lena) | 2–4 people | the beginner herself | **Core focus** |
| 2 | Family member (Jonas) | – | is administered | **Core focus** |
| 3 | Household admin (Markus) | 2–5 people | he himself, gladly | **Core focus** |
| 4 | Looking after parents (Petra) | 3–6 people in several households | one person from the family | **Focus** |
| 5 | Landlord (Mr Özdemir) | 1–2 people, 2–6 flats | he himself | **Focus** |
| 6 | Self-employed (Katrin) | 1–3 people | she herself or an acquaintance | **Focus** |
| 7 | Small business (Brandt joinery) | 5–50 people | external IT service provider or office management | **Focus** |
| 8 | Mid-sized company (tax firm group) | 50–250 people | own IT | supported |
| 9 | Large enterprise (corporate division) | 250+ people | IT department | not in focus |

**This is how it's meant:**

- **Core focus:** we align terms, defaults and processes with these.
- **Focus:** these people should find their way around well without detours.
- **Supported:** functions for this exist or are planned, but only if they don't make levels 1–3 more complicated.
- **Not in focus:** we don't prevent it, but we don't design for it.

**Why this cut?**

- Ablago started as a **household DMS**: folders that know what's in them, backup with an emergency sheet, installation via home servers' app stores.
- For the self-employed and small businesses a lot is already there (archive mode, procedure documentation, permissions per role, mailboxes, stand-ins, two-factor, sign-in via a provider, automations). That's why they have been part of the **focus** since 3 November 2026 – but they don't set the direction for levels 1–3.
- We **support** mid-sized companies: what works without drawbacks for levels 1–3 may go in. Corporations assume things that Ablago doesn't have today and that would make setup harder for level 1.

## The decision rule { #die-entscheidungsregel }

!!! tip "When in doubt, levels 1–3 win"
    If a function for larger organisations conflicts with simplicity for Lena, Jonas and Markus, levels 1–3 win. Advanced things go into a higher **Workbench level** (Beginner, Household, Self-employed, Business, Everything) or stay off until someone switches them on.

    One example is **Customise workbench**: for private use new installations start with the level "Beginner" and only show the areas needed for setting up and backing up. Further areas are shown with a higher level – for everyone or only for yourself under "My sidebar".

With every new idea, every issue and every bigger change we ask:

1. **Who** is this for (level 1–9)?
2. **Does it go too far** for our focus? Does it make levels 1–3 more complicated?
3. **Do we have to roll back** something already built?
4. **Does it fit the focus**, or do we want to shift the focus deliberately?

It also follows that:

- **Defaults** are geared to Lena. Markus may change everything.
- **Terms** we check through the eyes of Lena and Jonas.
- **Risks** we weigh per persona. What is rare and expensive in a corporation can be frequent and harmless in a household, and vice versa.

## Target groups on issues { #zielgruppen-an-issues }

Every issue gets one or more **labels with the target group's name** (the labels are German): `Einsteiger-Familie` (beginner family), `Familienmitglied` (family member), `Haushalts-Admin` (household admin), `Für die Eltern sorgen` (looking after parents), `Vermieter` (landlord), `Selbständige` (self-employed), `Kleinbetrieb` (small business), `Mittelstand` (mid-sized company), `Großunternehmen` (large enterprise). When you submit a request, state who it is for. The maintainer sets the labels.

## The personas { #die-personas }

### 1 · Beginner family – Lena (core focus) { #1-einsteiger-familie-lena-kernfokus }

![Lena with a child on her arm in front of her house](grafiken/persona-1-lena.en.svg)

- **Who:** Lena (38) and Tom (40), two children, rented flat. Lena takes care of the paperwork. No IT background.
- **Goals:** find receipts again quickly, miss no deadlines, Tom should be able to look things up himself.
- **Typical tasks:** photograph and assign post, create a folder for a contract, search for "washing machine", be reminded of a notice period, switch on the backup.
- **Stumbling blocks:** jargon, too many settings, the question "What do I actually have to set up?", fear of losing data.
- **Needs:** ready-made packages instead of an empty Workbench, good defaults, setup in a few steps, help with pictures, a backup that simply runs.
- **Success:** after an hour, the first folder with a document is in Ablago, the backup is running, and Lena didn't have to look anything up.

Lena **administers herself**: she is a beginner and administrator at the same time.

### 2 · Family member – Jonas (core focus) { #2-familienmitglied-jonas-kernfokus }

![Jonas with a phone](grafiken/persona-2-jonas.en.svg)

- **Who:** Jonas (16), Lena's son, or Tom, who "just has a look". Uses almost only the phone.
- **Goals:** find something quickly, file a photo, complete a task such as "Please sign".
- **Stumbling blocks:** jargon such as folder type or result list, empty lists without explanation, error messages in technical language.
- **Needs:** a Library that works well on the phone, plain language, only his own folders, "You may not see this – ask Lena" instead of an error code.
- **Success:** finds what he needs on his own.

### 3 · Household admin – Markus (core focus) { #3-haushalts-admin-markus-kernfokus }

![Markus at his desk with a NAS](grafiken/persona-3-markus.en.svg)

- **Who:** Markus (45), into IT, runs a NAS with Docker. Own home, family, a few vehicles.
- **Goals:** build his own folder types (house → heating → maintenance contract → invoice), permissions for the family, access on the go, connect mailbox and scanner, backup following 3-2-1.
- **Typical tasks:** design folder types and views, test permissions, install packages, apply updates, read the log.
- **Stumbling blocks:** hidden settings, missing technical documentation, updates that change something without saying so.
- **Needs:** Workbench level Household, Administrator manual, API and console, release notes, full export.

Markus sets up Ablago **for Lena and Jonas**. The two must understand what he builds.

### 4 · Looking after parents – Petra and siblings (focus) { #4-fur-die-eltern-sorgen-petra-und-geschwister-fokus }

![Petra with her mother, siblings in different places](grafiken/persona-4-petra.en.svg)

- **Who:** Petra (52) and her two brothers look after their mother (81), who lives alone. Three households in different cities.
- **Goals:** powers of attorney, doctors' letters, care insurance and the mother's contracts in one place. All siblings see the same. No deadline (care level, objection) gets lost.
- **Stumbling blocks:** setting up access from outside securely, sensitive health data, who may change what.
- **Needs:** views for a role ("Mother"), tasks for people, two-factor sign-in, access on the go, absence and stand-ins.

### 5 · Landlord – Mr Özdemir (focus) { #5-vermieter-herr-ozdemir-fokus }

![Mr Özdemir in front of his apartment building with solar panels](grafiken/persona-5-oezdemir.en.svg)

- **Who:** employed, owns two small apartment buildings with six flats and a solar installation. A tax adviser does the rental income return.
- **Goals:** service charge statements, tenant changes, tradespeople's invoices per property, receipts per tax year, meter readings.
- **Stumbling blocks:** the structure of the folder types (property → flat → tenancy agreement → tenant), the export in the right format.
- **Needs:** a package "Letting", export for the tax adviser, deadlines, templates.

### 6 · Self-employed – Katrin (focus) { #6-selbstandige-katrin-fokus }

![Katrin at her desk with invoices](grafiken/persona-6-katrin.en.svg)

- **Who:** graphic designer, sole trader, one part-time employee.
- **Goals:** incoming and outgoing invoices, customer contracts, keeping e-invoices in the original, receipts for the tax adviser.
- **Special point:** the GoBD (German rules for keeping records) applies to her. Private and business matters are often in the same Ablago.
- **Needs:** archive mode, versions, number sequences, template procedure documentation, separating private and business via views and permissions.
- **Stumbling block:** "Is this GoBD-compliant?" We don't promise a certificate, but provide tools and honest documentation.

### 7 · Small business – Brandt joinery (focus) { #7-kleinbetrieb-tischlerei-brandt-fokus }

![Office manager and IT service provider in front of the joinery](grafiken/persona-7-brandt.en.svg)

- **Who:** 12 employees, office manager Ms Brandt, an external IT service provider looks after Microsoft 365 and a small server.
- **Goals:** orders, invoices, suppliers, personnel files (strictly separated), holiday cover, post by email and scanner.
- **Administration:** the IT service provider installs and updates, the office manager maintains users and folder types.
- **Needs:** sign-in via Microsoft 365, two-factor, archive mode, permissions per role, mailboxes, stand-ins.
- **Gap today:** graded administrator permissions ([#282](https://github.com/motom001/dms/issues/282)) – an open point since small businesses became part of the focus.

### 8 · Mid-sized company – tax firm group (supported) { #8-mittelstand-steuerkanzlei-verbund-unterstutzt }

![Two employees with a data protection shield in front of a large office building](grafiken/persona-8-mittelstand.en.svg)

- **Who:** 120 employees, three locations, own IT, a data protection officer.
- **Expects:** single sign-on with groups, graded administrator permissions, four-eyes principle, log export (SIEM), test and production system, multilingual support, support with response times.
- **Why only supported:** what works without drawbacks for levels 1–3 may go in – but much would make interface and setup harder. Support with response times doesn't fit a small open-source project.

### 9 · Large enterprise – corporate division (not in focus) { #9-grounternehmen-konzernbereich-nicht-im-fokus }

![Several office buildings with IT department](grafiken/persona-9-konzern.en.svg)

- **Who:** 2,000+ employees, IT department, many administrators with separate responsibilities, compliance.
- **Additionally expects:** high availability, several tenants in one installation, permissions from the directory service, retention policies, certifications, connection to ERP and CRM.
- **Stance:** Ablago is under the Apache-2.0. A corporation may use and extend it. But we don't design for it.

## Focus decisions { #fokus-entscheidungen }

| Date | Decision | Reason |
|---|---|---|
| 31/10/2026 | Core focus levels 1–3, focus 4–5, supported 6–7, not in focus 8–9 | Started as a household DMS. Functions for companies only if they don't make levels 1–3 more complicated. |
| 31/10/2026 | Graded administrator permissions postponed ([#282](https://github.com/motom001/dms/issues/282)) | concerns levels 7–9, only once small businesses move into the focus |
| 31/10/2026 | Target groups as labels on the issues | everyone who develops along works with the same focus |
| 31/10/2026 | Customise workbench: new installations start with the template "Household" ([#281](https://github.com/motom001/dms/issues/281)) | levels 1–3 only see what they need; existing installations still show everything |
| 03/11/2026 | Core focus levels 1–3, **focus 4–7** (self-employed and small business new), **supported 8**, not in focus 9 | (1) The functions are already there: archive mode, procedure documentation, permissions per role, mailboxes, stand-ins, sign-in via a provider and automations help exactly the self-employed and small businesses. (2) The load tests have shown it: after optimisation Ablago copes with clearly larger installations ([What Ablago copes with](https://help.ablago.app/admin/aktuell/en/verkraftet/), [#576](https://github.com/motom001/dms/issues/576)). (3) That's why we deliberately open up this area and keep pushing performance. When in doubt, simplicity for levels 1–3 still wins. |
| 04/11/2026 | The installation is neutrally called "Library" instead of "household" ([#700](https://github.com/motom001/dms/issues/700)) | fits at home as well as for businesses; "Household" and "Business" remain the names of the Workbench templates |

The graphics are created with `docs/handbuch/werkzeuge/personas_grafiken.py` (German and English cards). Whoever changes a persona changes the card there too.
