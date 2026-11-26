# Region

**Workbench → Settings → Region** sets in one place where your Library is at home. The following depend on it:

- the **public holidays** in the calendar and for the [Daily summary](aufgaben.md#tagliche-zusammenfassung),
- "**today**" – for deadlines, lead times, filters like "created today", number sequences with a year and retention periods,
- all **times**: Daily summary, automations with "date reached" and schedules, backups, dates in emails, access copies, stamps and exports.

## Settings {#einstellungen}

- **Country** – for now only Germany; further countries with their public holidays will follow later.
- **State** – for the statutory public holidays. Ablago calculates them itself: the nationwide ones and those of the chosen state, Easter and the days depending on it using Gauss's Easter formula. Public holidays that only apply in individual municipalities – such as the Assumption in parts of Bavaria or the Augsburg Peace Festival – and one-off public holidays are missing. *None – without public holidays* switches them off.
- **Time zone** – default *Europe/Berlin*. The usual time zones of Europe and a few more are available.

Below the settings you see the **public holidays of the current year** as they are stored.

**Public holidays from a package** (#1696): if a region package for the country is installed (such as “Region Deutschland”), Ablago takes its public holidays and its list of states; below the preview it then says *The public holidays come from the package “…”*. Otherwise it says that Ablago calculates them itself. The chosen state is kept on installation – you don’t need to set anything again.

## Formats {#formate}

Under **Formats** you set how Ablago shows data (from the version the changelog names under #1610). *Like the language* follows the language of the interface; your own choice applies to everyone. **Stored values do not change** – only how they appear.

- **Date** – for dates in digits: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY. Dates written out ("24 November 2026") stay in the language.
- **Time** – 24 or 12 hours.
- **Numbers** – thousands and decimal separators (1.234,56 · 1,234.56 · 1 234,56 · 1’234.56); **currency** before or after the amount.
- **Default currency** – for new amount fields without their own currency (default EUR).
- **Phone numbers** – *canonical* "+49 (351) 1234567", *DIN 5008 international* "+49 351 1234567" or *DIN 5008 national* "0351 1234567" (default). Numbers from another country always appear internationally. An extension after a hyphen stays an extension: "0351 12345-67". Input Ablago does not recognise as a number appears as entered, with the note *not recognised as a phone number*. Applies to text fields with the format *Phone*; the link for calling dials the number with the country code.
- **Default country code** – for numbers without a country code, e.g. 49.
- **First day of the week** – Monday, Sunday or Saturday: weeks in the date picker and in *To do → Month and Year* start with it. The calendar week still counts according to ISO (from Monday).
- **Working days** – freely selectable (Mon–Fri, Mon–Sat, Mon–Sun or single days). The other days are grey in the calendar.

The **preview** shows sample values before you save.

**Searching for phone numbers:** you find a number in any notation – "0351 1234567" also finds "(0351) 123 45 67" and "+49 351 1234567", a number without area code ("1234567") every number containing it.

## Good to know {#gut-zu-wissen}

- A new installation is set to *Germany · without state · Europe/Berlin*. The setup wizard doesn't ask about it – if you don't need public holidays, you don't have to do anything.
- Up to version 0.159, the state was under *Notifications and tasks*. An update takes it over from there; the time zone stays *Europe/Berlin*.
- With several servers, a change applies immediately on the server where you save, and on the others after a minute at the latest.
- The setting is in the database and therefore in every [backup](sicherung.md). The [full export](export.md) stores it as `struktur/region.json`, the [interface](api.md) delivers it read-only at `GET /api/v1/region`.
- Dates, numbers and amounts follow the formats in fields, titles, lists, e-mails and times of the interface. Some places (such as day headings in the calendar) keep showing written-out dates in the language.
- If you change the time zone, Ablago calculates in the new one from then on. Deadlines already created keep their date; Ablago doesn't catch up on times that have already passed.
