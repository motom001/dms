# Links via folder type and field values {#links-uber-mappentyp-und-feldwerte}

A link via folder type and field values finds a folder by its **folder type** and its **details** instead of its technical id. You can send the link to a colleague with their own account by email or chat, or store it in other programs. The field values (such as a contract number or a name) appear readably in the link – whoever sees it sees them; only those who may open the folder itself. For example:

```
http://<NAS>:8080/ablage/link?typ=rechnung&rechnungsnummer=A-2020-11380
```

Nothing needs to be set up for this: every link that follows the structure below works immediately. In every folder, **Folder ▾ → Copy link** creates a matching link (see [User manual](https://help.ablago.app/benutzer/aktuell/en/versenden/#link-kopieren)).

## What the link shows {#was-der-link-zeigt}

- **One hit:** the folder opens.
- **Several hits:** the result list appears as a temporary view "Link: Invoice" – with the conditions below it –, and the first folder is open. This view doesn't appear in the view tree.
- **No hit:** the empty list names the conditions searched for.
- **Error in the link** (unknown folder type, typo in a field's identifier, unsuitable operator, invalid value): Ablago shows what is wrong – never silently all folders.

![Result list of a link via folder type and field values](bilder/direktlink.png)

The address in the browser stays the link, even when a folder is open or the list is re-sorted. Whoever isn't signed in signs in and then lands directly at the link – administrators only for links into the workbench; a link into the Library leads them to the workbench overview (the Library is one click away from there). The recipient's permissions apply: they only see what they also see in the Library.

## Structure { #aufbau }

```
/ablage/link?typ=<folder type>&<field>=<value>&<field>.<operator>=<value>&sortierung=<field>
```

| Part | Meaning |
| --- | --- |
| `typ=rechnung` | **identifier** of the folder type (see [Folder types](mappentypen.md#grunddaten)). The **name** works too (upper and lower case don't matter) – but only the identifier stays valid if the folder type is renamed. "Copy link" uses the identifier. Folder types from packages: `typ=basis:person` (up to 0.226 `basis_person` – please copy such older links again, #1084). |
| `rechnungsnummer=A-2020-11380` | **identifier** of a field and the value: "is equal". |
| `betrag.groesser=100` | field with an **operator**. |
| `sortierung=-rechnungsdatum` | order of the result list; `-` = descending. Without: by title. |

Several conditions apply **together** (AND), as in a [view](sichten.md). You write special characters in the value as browsers encode them: space as `+` or `%20`, `&` as `%26`, `+` as `%2B`.

!!! warning "Renaming a folder type"
    If a link names the folder type by its **identifier** (`typ=rechnung`, as "Copy link" creates it), it stays valid even if you rename the folder type. Only links that name the folder type by its **name** (`typ=Rechnung`) no longer find it after renaming and show an error message. Fields always appear in the link with their **identifier**, which never changes (see [Folder types](mappentypen.md#die-kennung)) – you can rename labels without risk.

You see a field's identifier in the workbench on the folder type, in the field under **Identifier**. The system values work too: `_erstellt`, `_geaendert` (date) as well as `_erstelltVon`, `_geaendertVon` (only with `ich`).

### Without an operator {#ohne-operator}

| Field kind | `field=value` means | Example |
| --- | --- | --- |
| Text, number, amount, date | is equal (text regardless of case) | `rechnungsnummer=a-2020-11380` |
| Long text, formatted text | contains | `notiz=Kündigung` |
| Yes/no | yes or no | `bezahlt=nein` |
| Choice list | is one of; several values with commas | `zahlungszyklus=monatlich,jährlich` |

### Operators {#operatoren}

There are the same operators as for the conditions of a view – the same choice per field kind:

| Operator | Meaning | Example |
| --- | --- | --- |
| `gleich` | is equal | `rechnungsnummer.gleich=R-17` |
| `enthaelt` | contains (texts) | `bezeichnung.enthaelt=Strom` |
| `kleiner`, `groesser` | less/greater than | `betrag.groesser=1.000,00` |
| `zwischen`, `ausserhalb` | two values with `..` in between | `rechnungsdatum.zwischen=2026-01-01..2026-03-31` |
| `imZeitraum` | year or month | `rechnungsdatum.imZeitraum=jahr-1` |
| `einerVon` | is one of (choice list) | `zahlungszyklus.einerVon=monatlich` |
| `ja`, `nein` | yes/no, without a value | `bezahlt.nein` |
| `leer`, `nichtLeer` | is (not) empty, without a value | `vertragsnummer.nichtLeer` |
| `zeigtAuf` | only with `ich` (see below) | `verantwortlich.zeigtAuf=ich` |

Upper and lower case of the operators don't matter (`nichtleer` works too).

### Values {#werte}

- **Numbers and amounts:** with a comma or a point, also `1.234,50`.
- **Date:** `2026-03-31` or `31.03.2026`.
- **Today:** `heute`, `heute-30tage`, `heute+2wochen`, `heute+12monate`, `heute-1jahr`. Ablago recalculates on every opening – so a link to "notice within the next 12 months" is always up to date.
- **Period** (with `imZeitraum`): `jahr` (current), `jahr-1` (last), `monat`, `monat+1` (next).
- **Me:** `ich` is the signed-in user – for links to users and for `_erstelltVon`/`_geaendertVon`, e.g. `verantwortlich=ich`.

Links to other folders (such as "contract = …"), password fields as well as conditions on documents and links don't work in the link. For that, set up a [view](sichten.md).

### Fields called "typ" or "sortierung" { #felder-namens-typ-oder-sortierung }

`typ` and `sortierung` have a fixed meaning in the link. You reach a field with one of these identifiers with an operator: `typ.gleich=Laptop`.

## Examples {#beispiele}

| Link | Shows |
| --- | --- |
| `/ablage/link?typ=rechnung&rechnungsnummer=R-2026-117` | exactly this invoice |
| `/ablage/link?typ=rechnung&bezahlt=nein&sortierung=-rechnungsdatum` | open invoices, newest first |
| `/ablage/link?typ=rechnung&rechnungsdatum.groesser=heute-30tage` | invoices of the last 30 days |
| `/ablage/link?typ=vertrag&kuendigung_bis.zwischen=heute..heute+12monate` | contracts that must be cancelled within the next 12 months |
| `/ablage/link?typ=vertragspartner&name=Stadtwerke+Musterstadt` | the contract partner "Stadtwerke Musterstadt" |

A link with an error shows what is wrong:

![Error message for a typo in a field's identifier](bilder/direktlink-fehler.png)

## Via the interface {#uber-die-schnittstelle}

`GET /api/v1/mappen?sicht=link&link=<the link's parameters>` understands the same links, e.g. `link=typ%3Drechnung%26bezahlt%3Dnein` (the parameters as one encoded value). A faulty link results in `422` with the message in `fehler`. See [Interface](api.md).
