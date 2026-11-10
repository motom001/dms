# Setup as a file {#einrichtung-als-datei}

What you put together in the [setup wizard](installation.md#der-einrichtungsassistent) can be saved as a **configuration file**. From such a file you set up a new Ablago in a few seconds, for instance a second one for your parents or a new one after a move without a backup. IT service providers use it to hand over their own defaults.

## Saving {#speichern}

In the wizard's [summary](installation.md#zusammenfassung), **Save as file** saves the file `ablago-einrichtung.yaml` to your download folder. It contains the database (host, port, name, user), the name of the Library, your account (name, email address), the packages including automations switched on and off, and the optional things (address, state, examples, email sending). Short comments explain every section.

!!! info "Not in the file: passwords and key"
    The file contains **no passwords** and **no key**. The wizard asks for passwords when loading. Ablago creates the key anew with every setup, and the [emergency sheet](verschluesselung.md#notfallblatt) remains mandatory. If a file contains a password in plain text anyway, Ablago rejects it.

## Loading {#laden}

In the wizard, at the top right, small next to the help, there is **Load from configuration file**. This only works with a valid [setup code](installation.md#einrichtungscode) and only as long as Ablago isn't set up yet. If you choose the file already on the step "Setup code", Ablago checks it as soon as the code is correct. Nothing is created when loading.

Ablago checks the file step by step:

- **Structure:** against the [schema](#schema). Errors are shown with line and field, for example "Line 5, konto.passwort: passwords don't belong in the file". Then nothing changes.
- **Database:** without a database, the file prefills the step "Database"; you enter the password there. If Ablago is already connected, it stays with this connection, and a notice names the difference.
- **Content:** email address of your account, address of Ablago.
- **Packages:** do they exist in the catalogue? You always confirm permissions, origin, name conflicts and required settings yourself, even with a file.

If everything fits, it goes straight to the **summary**, which you confirm as usual with **Set up now**. If a step doesn't fit, the wizard shows exactly this step with the reason; the rest stays prefilled. Because passwords are never in the file, you usually land on the step "Your account" first.

JSON works too: valid JSON is valid YAML.

## Example {#beispiel}

The keys of the file are German; they stay the same in every language.

```yaml
# Setup of Ablago – for loading in the setup wizard ("Load from configuration file").
# Without passwords and without a key: the wizard asks for passwords, Ablago always creates the key anew.
# Structure: https://help.ablago.app/admin/aktuell/en/einrichtungsdatei/ablago-einrichtung-1.schema.json

ablago-einrichtung: 1
# Connection to PostgreSQL (only applies as long as Ablago has no database yet).
datenbank:
  rechner: db
  port: 5432
  name: dms
  benutzer: dms
  passwort: ${DMS_DB_PASSWORT}
# Name of the Library – lettering in the header and browser tab.
ablage: Familie Beispiel
# Your account: sets up Ablago, may administer it and also works in the Library.
konto:
  name: Lena Beispiel
  email: lena@example.org
  passwort: ${DMS_KONTO_PASSWORT}
# From the official catalogue, each in the newest matching version; automations: true = switched on.
pakete:
  - id: texterkennung
  - id: benachrichtigungen
# Address for links, state for public holidays, examples, email sending (without password).
optionales:
  adresse: https://ablago.example.org
  bundesland: SN
  beispiele: false
  Email:
    aktiv: true
    server: smtp.example.org
    port: 587
    verbindung: starttls
    benutzer: ablago@example.org
    absender: Ablago <ablago@example.org>
    selbstsigniert: false
    passwort: ${DMS_MAIL_PASSWORT}
```

[Download the example file](einrichtungsdatei/beispiel.yaml)

- `konto` is the person who sets up: they get "Full administration" and also work in the Library. You invite further people after the setup under Workbench → Users.
- Without a list `pakete` you choose the packages in the wizard; `pakete: []` means "none".
- **Files from version 0.191 and 0.192** are still loaded: the section `administrator` counts as `konto`. Ablago skips a section `erster-benutzer` with a notice – the first user no longer exists in the wizard. When saving, only `konto` is in the file.
- `optionales: beruflich: true` means the Library is also used for work ([Use](nutzung.md)); without it, no. The wizard shows it in the summary and saves it with "Set up now".
- A package's automations are keys with `true` (switched on) or `false` (off); if one is missing, it is switched on as in the wizard.

## References instead of passwords {#verweise-statt-passworter}

Instead of a password, a **reference to an environment variable** may be given, such as `passwort: ${DMS_KONTO_PASSWORT}`. It is intended for a later setup entirely without an interface. The wizard in the browser doesn't evaluate it and asks for the password anyway; when saving, the reference is kept.

## Schema { #schema }

The file follows a published JSON Schema, versioned via the header line `ablago-einrichtung: 1`:

[ablago-einrichtung-1.schema.json](einrichtungsdatei/ablago-einrichtung-1.schema.json)

A new format version gets its own schema. Ablago rejects files with an unknown version instead of reading them halfway.
