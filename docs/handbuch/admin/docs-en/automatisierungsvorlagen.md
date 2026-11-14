# Automation templates {#automatisierungsvorlagen}

An **automation template** is an automation with gaps that you apply to **one** folder. “Assign task” and “Remind” in the **Folder ▾** menu are such templates – behind them runs the same engine as for [automations](automatisierungen.md). An applied template is a **folder run**: it is listed on the folder under **Planned** until it runs, and then it disappears. What happened is kept in the folder history and in the template’s history.

You find them under **Workbench → Build the library → Automation templates**, right below the automations. In a household the area appears in **expert mode** (Workbench → Customise workbench); in a business it is always there.

![Workbench → Automation templates: list and editor](bilder/werkbank-automatisierungsvorlagen.png)

## What comes with Ablago {#was-mitkommt}

| Template | From | When | Asks when applied | Then |
|---|---|---|---|---|
| **Assign task** | Ablago (always there) | straight away | recipient, text | task for the chosen person |
| **Remind** | Ablago (always there) | on the chosen date | date, recipient, text | “Reminder” task for the chosen person |
| **Follow-up** | package Notifications | in 6 months | – | “Reminder” task for you: “Follow-up: {titel}” |

“Assign task” and “Remind” belong to Ablago – they work **without any package**. The **Notifications** package brings them again and thereby **replaces** Ablago’s (in the list: “from package”). If you remove the package, Ablago’s template applies again; planned runs keep going, because they name their template by its key. If you changed one of Ablago’s templates yourself, the package does not replace it.

## List and editor {#liste-und-editor}

The middle lists all templates with **on/off**, origin as a chip (**Ablago** or the package's name; your own without a chip), a short form (“On the chosen date → To do for the chosen person”) and the number of **open runs**. On the right you set:

| Field | Meaning |
|---|---|
| **Name**, **Order**, **Description** | how it appears in the “Folder” menu; a lower number is higher up (1–99) |
| **In the “Folder” menu for** | folder types where it is offered – chosen as in a link field: type, click a hit, take it out again with **Remove**. None chosen: all |
| **When** | **Straight away**, **On the chosen date** or **In** – number and unit (days, weeks, months) always follow directly. While “In” isn’t chosen they are pale; clicking into them chooses “In” |
| **Asks when applied** | **Recipient**, **Date** and **Text** – exactly what the small dialog on the folder shows. **Date** is always on with “On the chosen date”, off with “Straight away” and your choice with “In” (see [Suggest a date](#datum-vorschlagen)); the reason is shown below the ticks |
| **Then** | one or more **Task / notification** cards: for the chosen person, whoever applies the template, whoever created the folder or the person in a field of the folder (only with fixed folder types) |

### Suggest a date: “Remind me in 14 days” { #datum-vorschlagen }

With **In** you decide whether the date is fixed or only a **suggestion**:

| When | “Date” tick | What happens on the folder |
|---|---|---|
| Straight away | – | runs straight away |
| In 14 days | off | runs in 14 days, fixed, without a date field |
| In 14 days | **on** | date field, **filled in with today + 14 days**, can be changed |
| On the chosen date | always on | date field, filled in with today + 7 days |

Example: Lena wants everyone in the household to be able to set a reminder on a folder with one click – usually in two weeks, sometimes earlier or later. She creates a template **Remind me in 14 days**: When **In 14 days**, under “Asks when applied” **Date** and **Text**, one **Task** card for “whoever applies it” with the text `{eingabe}`. The list shows it as “In 14 days (can be changed) → Task for whoever applies it”. When Jonas applies it on a folder, the date field already shows the date in 14 days; he writes what he wants to remember and only changes the date if it does not suit him. **Try it out** in the editor fills in the date the same way.

![Template “Remind me in 14 days”: When “In 14 days”, “Date” ticked under “Asks when applied”](bilder/werkbank-automatisierungsvorlage-vorschlag.png)

Templates without the tick behave as before: “In 6 months” stays fixed.

A card’s text knows the placeholders of [automations](automatisierungen.md) (`{titel}`, `{mappentyp}`, `{heute}`, `{datum}`, the fields of the folder type), plus `{eingabe}` (the text typed when applying), `{person}` (who applies it) and `{empfaenger}`. A template that asks for the text needs `{eingabe}` in a card.

The **switch** at the top of the editor (off) takes the template out of the “Folder” menu – runs already planned still happen. You can delete your own templates once no open runs depend on them; reset Ablago’s with **Reset to delivered version**.

Below:

- **Try it out:** choose a folder and the answers – Ablago shows what would happen (with your rights as the person) and who would not be allowed to see something. Nothing is created.
- **In use on:** all open runs of the template with a link to the folder, date and person. Titles appear only for folders you may read.
- **History:** applied, planned, ran, paused, deleted, resumed – with time and person. It is kept for 30 days or 200 entries per template.
- **Versions:** who changed what and when, compare two versions and restore an earlier one – as for all settings in the Workbench, see [Versions](fassungen.md). **Reset to delivery** is itself a version; deleted own templates are listed with a deletion note below the list.

## Security {#sicherheit}

- **Only tasks and notifications.** A template has no card that sends data outside – no email to a freely typed address, no web call. This also applies to templates from packages and to their updates; the preview when installing lists every template with its cards.
- **With the rights of the person who set up the run – at run time.** A run due in six months checks the rights of **then**. If the person is deactivated, no longer a user or may no longer read the folder, it does not run but is shown as **paused**: on the folder under “Planned”, in the workbench overview and in the email to the administrators. Under **In use on** you continue it with **Resume** – Ablago checks the rights again. Runs never use a system account.
- **Recipients** are active users. If someone may not read the folder, they still get the task but only see a note (as with [tasks for people without read access](aufgaben.md)); hand-written text stays visible. Ablago fills placeholders with the recipient’s rights – whatever they may not see appears as “(not visible)”.
- **Brake:** at most 20 open runs per person and folder, at most 30 applied templates per person per minute. So nobody can plan thousands of tasks for others through the API.

## Conversion on update {#umstellung-beim-update}

Existing **reminders** became runs of the **Remind** template on update – with date, text and recipient as before and their previous creator as the person. If the creator was unknown or a system account, the run uses the recipient. On the date the same “Reminder” task appears as before, with deputy, completing and daily summary. To dos assigned by hand are runs of “Assign task” that already happened and stay as they are.

## Through the API {#uber-die-schnittstelle}

With an API key you apply a template with `POST /api/v1/mappen/{id}/ablaeufe` (`vorlage` and the answers `empfaengerId`, `datum`, `text`); `GET /api/v1/mappen/{id}/ablaeufe` lists the planned runs and the templates of the folder. The previous endpoints for tasks and reminders stay and go through the same templates. See [API](api.md).
