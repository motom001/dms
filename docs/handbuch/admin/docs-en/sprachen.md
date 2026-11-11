# Languages {#sprachen}

**Workbench → Settings → Languages** decides in which languages Ablago talks in your Library. **German** and **English** are built in; further languages will come later as language packages from the [package catalogue](pakete.md).

## Settings {#einstellungen}

- **Allowed languages** – from these, every person chooses their own under [My account → Account → Language](https://help.ablago.app/benutzer/aktuell/en/profil/#sprache). German is the source language and always included, as is the installation's language.
- **Installation language** – applies to everyone who hasn't chosen anything, to the sign-in page (as long as the browser doesn't send an allowed language) and to emails to people without a choice of their own. The [setup assistant](installation.md#sprache) sets it with its first step.

If you take a language off the list, people who had chosen it see Ablago in the installation's language again. Their choice stays saved and applies again as soon as you allow the language again.

## What appears in which language {#was-in-welcher-sprache-erscheint}

| What | Language |
|---|---|
| Interface, messages, help texts | the person's, otherwise the installation's |
| Emails to a person (invitation, password, notices, daily summary) | the person's, otherwise the installation's |
| Emails to all administrators | for each recipient in their language |
| Emergency sheet | the language of whoever downloads it |
| Texts for third parties (access copy under Art. 15 GDPR, retrieval link, stamp) | the installation's |
| Titles and names that the server forms once for everyone (e.g. system folder types, the packages' views) | the installation's |
| Log | always German |
| Dates, numbers and amounts | according to the interface language (English: British notation, e.g. `04/03/2026` and `1,234.50`) |

Labels you give yourself – folder types, fields, tabs, views – you translate per language on the respective element (tab **Languages**).

## Translate content { #inhalte-ubersetzen }

With a package that has the permission [Translate content](pakete.md#recht-uebersetzen), everyone can read letters, notes and fields in another language in their own language **at the press of a button** – with the button **Show translation** on long text fields, on notes and on a document's full text. Without such a package there is no button. Nothing is ever translated in the background, only when someone presses the button; the target language is the person's language.

You find the section **Translate content** on this page:

- **Offer "Show translation" to everyone** – on as soon as a package is installed. If you untick it, nobody sees the button. Everyone can also switch it off for themselves under [My account → Language](https://help.ablago.app/benutzer/aktuell/en/profil/#ubersetzung-anzeigen).
- **Package** – *Automatic* takes a package that translates **on the device** (if there are several, the first by id). Ablago never takes a package with network access on its own: you choose it explicitly, and Ablago asks **"Send texts to a service?"**. Only with **Confirm and choose** does the choice apply; from then on every translation says where the text went.

**What the package gets:** only the one text the person has translated – in sections of at most 4,000 characters – the target language and, if known, the source language (for full text from text recognition). No folder, no ids, no permissions on folders or documents. Only what the person may read is translated; password fields and fields with a format (email, IBAN, phone …) never.

**What is stored:** only ever the original. The translation can't be taken over as a value. Ablago keeps it for 30 days in a cache (checksum of the text section, language, package and version) – not on the folder and not in the [backup](sicherung.md). If the original changes, the old translation no longer applies; when a note or folder is changed or deleted it is gone at once. Each person's choice is stored on their account, the setting for everyone in the setting `uebersetzen`.

## Good to know {#gut-zu-wissen}

- **PDFs Ablago creates itself** (stamp, letter, export, labels, access copy, emergency sheet) show Latin with all accents (including Turkish, Polish, Czech, Vietnamese), Greek and Cyrillic correctly. Arabic, Hebrew, Chinese, Japanese, Korean and emoji aren't known to the font there yet: in their place there is “�”, and the [log](fehlersuche.md#protokoll) names the characters (module “Documents”). Such scripts are to come later with language packs. The interface isn't affected.
- If a text is missing in a language, it appears in English, otherwise in German – a place never stays empty.
- Machine-translated language packages show the notice "Machine-translated – improvements welcome" in My account, with a link to how to take part.
- With several servers, a change applies immediately on the server where you save and on the others after a minute at the latest.
- The setting is in the database (setting `sprachen`) and thus in every [backup](sicherung.md); every person's choice is stored with their account.
