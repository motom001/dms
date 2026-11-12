# Tasks {#aufgaben}

A **task** says that someone should do something on a folder. Every folder with an open task appears for its recipient under **To do** – "To do" is thus the list of one's own tasks. How users work with it is described in the [User manual](https://help.ablago.app/benutzer/aktuell/en/zusammenarbeit/).

Tasks arise in these ways:

| Kind | Arises | Recipient | Completed |
| --- | --- | --- | --- |
| **Doesn't fit** | when a folder no longer fits after a change to the [Folder type](mappentypen.md#wenn-sich-ein-mappentyp-andert) | whoever created the folder (otherwise the administrators) | by itself, as soon as the folder fits again |
| **Mention** | when someone mentions a user with **@** in a formatted text | the person mentioned | with the button *Done* |
| **Assigned** | by hand via *Folder ▾ →* **Assign task** on the folder | a chosen user | with the button *Done* |
| **Deadline** | before the date of a date field that is a [deadline](mappentypen.md#fristen-erinnerungen-an-datumsfeldern) – created by an automation *Date reached* | as set in the automation, e.g. the user in a field, otherwise whoever created the folder | with the button *Done*, or by itself if the date changes |
| **Reminder** | on the chosen day after *Folder ▾ →* **Remind** on the folder | the chosen user | with the button *Done* |
| **Stand-in** | when an [absence](benutzer.md#abwesenheit) with a stand-in is entered for a user – since version 0.177 via the [automation](automatisierungen.md) *Stand-in entered* (package Notifications or taken over on the update) | the stand-in (*Stand-in from the event*); the task is attached to the absent person's user folder | by itself as soon as the absence ends or the period or stand-in changes; or with the button *Done* |
| **Post for you** | when a user is under *To* on new [post](https://help.ablago.app/benutzer/aktuell/en/post/) or *To* changes – since version 0.257 via the [automation](automatisierungen.md#post-fur-dich) *Post for you* (package Notifications) | the user under *To*, their stand-in when they are away | by itself as soon as the post is assigned, completed or given to someone else |
| **Access request** | when a person has downloaded their [access copy](datenschutz.md#auskunft-zustellen) via the retrieval link or the link was blocked after failed attempts | whoever created the link or the access copy, and whoever has the person's folder as a favourite (if the notification for the favourite is on) | with the button *Done*; as long as it is open, no second one comes for the same link |
| **Changed** | when someone changes a folder that others have as a favourite ([favourite = subscription](https://help.ablago.app/benutzer/aktuell/en/ablage/#favoriten-als-abo)) | whoever has the folder as a favourite, may read it and hasn't switched off the notification – never whoever made the change | by itself on opening the folder, or with the button *Done*; until then it only counts up |

- Recipients are always **users**, not roles – a task for everyone otherwise tends to be left lying.
- Whoever mentions themselves gets no task; saving again creates no second one. If a mention is removed again, the task stays open; the folder's history records that it was removed.
- The recipient themselves and administrators may **pass on**; this is recorded in the folder's history. Several at once work in [Workbench → Tasks](#mehrere-aufgaben-auf-einmal-weitergeben) and for one's own under My account → [Absence](https://help.ablago.app/benutzer/aktuell/en/profil/#abwesenheit).

## Workbench → Tasks { #werkbank-aufgaben }

All open tasks of all users are under **Workbench → Settings → Tasks**. Who is notified when – [Daily summary](#tagliche-zusammenfassung), [favourites](#favoriten-benachrichtigen), *Post for you*, *Stand-in* – you don't set here but under [Automations](automatisierungen.md#benachrichtigungen); a sentence with a link above the list takes you there.

![Workbench → Tasks](bilder/werkbank-aufgaben.png)

In the middle is the list of all open tasks of all users with folder, kind, date and recipient. With the selection below a task you pass it on to someone else. If you choose a task, its folder appears on the right with the most important fields, **Open in the Library** and next to it **Pass on to** – like the selection in the list. Afterwards, the recipients on the right and in the list are correct immediately.

At the top is the **search field** – it searches the folder's title and the task's text; **Esc** or **×** clear it. Below it the **filters** narrow down by:

- **Recipient** – a user, *Administrators* or *absent, without a stand-in* (tasks of users who are absent or deactivated and for whom nobody is entered – otherwise they are left lying),
- **Kind** (Doesn't fit, Mention, Assigned, Deadline …), **Folder type**,
- **Due date** by the date of the deadline or reminder: *overdue*, *this week* (until Sunday), *later*, *without a date*.

The tick **Show completed** switches to the most recently completed tasks. Search and filters are in the address – so a filtered view can be bookmarked or passed on as a link. Below them, it says how many tasks match (“12 matches”); if none matches, **Reset search and filters** resets everything.

### Passing on several tasks at once { #mehrere-aufgaben-auf-einmal-weitergeben }

On holiday, illness or when responsibility changes, you redistribute many tasks in one step:

1. Narrow down the list with search and filters, e.g. *Recipient: Jonas*.
2. Tick the tasks on the left – or **Select all shown** (this only applies to those currently filtered). Next to it, it says how many are selected.
3. In the bar above, choose a user in **Pass selected on to** and **Pass on**. A confirmation names number and target.

Afterwards it says how many were passed on – and which weren't and why, such as "Carl may not read the folder" or "already with Carl". What didn't work stays selected; you can give it to someone else straight away. Every passing-on is recorded in the history of its folder. The new recipient gets **one** collective notification under "To do" (kind *Assigned*, on your user folder: "Lena passed 12 tasks on to you") instead of many individual ones; if you pass more on to them before they have completed them, it only counts up.

As a target, only users who may read the respective folder are possible – as with passing on individually; packages' service accounts can't be chosen. **Mark as done** completes the selection at once; *Doesn't fit* tasks stay open until the folder fits again. For other programs the same exists via the [interface](api.md) (`POST /api/v1/aufgaben/weitergeben` and `…/erledigt`).

![Several tasks selected](bilder/werkbank-aufgaben-auswahl.png){ loading=lazy }

If a task is with someone who may not read the folder according to the [permissions](berechtigungen.md), there is a notice at the top and on the task "Recipient may not read the folder".

## Tasks with people without read permission { #aufgaben-bei-personen-ohne-leserecht }

Principle: **whoever gets a task may read the folder.** Ablago still doesn't hold up the work but shows where that isn't the case. It happens when someone stands in who may not see certain folders, when a task goes by hand to such a person, when permissions change or when an automation goes to a role or a field.

- **Assigned by hand:** whoever assigns or passes on a task gets the notice "Jonas may not see this folder …" beforehand with **Assign anyway** and **Cancel**. Nobody can give permissions in the process – only you do that in the workbench. The text remains visible to the recipient.
- **Arisen automatically** (deadlines, automations, stand-in): the task arrives, but the recipient only sees "Task on a folder you may not see – ask Lena" (whoever created the folder) and the due date – under "To do" as in the Daily summary. For deadlines and tasks on a date field the date is left out too: it is a value of the folder.

**Workbench → Tasks → Tasks with people without read permission** shows the open cases at the top ("3 tasks are with people without read permission") and below them the **earlier cases** with period, person, folder and whether a temporary read permission was given. That way you see where this has happened more often. For each case you jump **to the folder** or with **Check permissions** into the folder type's [test run](berechtigungen.md#testlauf), with person and folder already chosen. You learn about new cases as about the other [technical tasks](benutzer.md#aufgaben-ohne-empfanger): notice in the workbench and the bundled email to the administrators.

**Give read permission for the duration of the task:** the button is on every open case. The permission only applies to **reading**, only for **this folder**, and ends by itself when the task is completed, deleted or given to someone else. The folder's history records both steps, such as "Read permission given to Jonas because of task "Please sign" (by Markus)" and "Read permission withdrawn from Jonas again after completing the task". The permissions' test run shows the temporary permission with its reason. You set it up permanently via the folder type's permissions; if they allow reading, the case ends by itself.

Ablago reconciles the cases after every assigning, passing on and completing, and otherwise every five minutes (for instance after changed permissions). Tasks without a single recipient (for the administrators) don't count as a case.

## Daily summary { #tagliche-zusammenfassung }

Instead of sending an email with every new task, Ablago sends an overview **once a day** to everyone who has open tasks – with links to the folders. It contains the folders' titles (no documents) and goes out via the set-up [mail server](installation.md#e-mail-und-adresse); everyone unsubscribes themselves in My account.

Since version 0.257 there is **no section of its own under Workbench → Tasks** any more – everything is in the automation **Daily summary** (Workbench → [Automations](automatisierungen.md#benachrichtigungen), package **Notifications**):

| Previously under Workbench → Tasks | Now |
| --- | --- |
| Whether it is sent | switch the automation on or off |
| Default time for everyone without their own | time of the When card *Schedule for every user* (default 7:00, in the time zone of the [region](region.md)) |
| Notice “state for public holidays” | unchanged under [Workbench → Region](region.md) |
| **Send now** (to everyone) | **Trying out** in the automation: choose a person's user folder, **Run** – the summary goes to this person straight away (see [Trying out](automatisierungen.md#ausprobieren-verlauf-und-anderungsverlauf)) |
| Warning “email sending is off” | notice in the [workbench overview](uebersicht.md) and under My account |

- **Every user** chooses their own time (in 15-minute steps) and the **weekdays** under **My account**; without their own choice, the automation's time and **Monday to Friday** apply. They can also unsubscribe there.
- The email comes at most once a day, at the earliest at the chosen time. If Ablago was off at that time, it comes after the start on the same day; nothing is caught up on the next day. Whoever is absent or has nothing open gets none.
- **Public holidays** – on statutory public holidays no summary comes (everyone can deselect this in My account). Which ones these are depends on the state under [Workbench → Settings → Region](region.md); without a state there are no public holidays.
- The prerequisite is set-up [Email sending](installation.md#e-mail-und-adresse).

## Notify about favourites { #favoriten-benachrichtigen }

Whoever marks a folder as a **favourite** gets a notification “Changed” under *To do* when someone else changes it (see user manual, [favourites as a subscription](https://help.ablago.app/benutzer/aktuell/en/ablage/#favoriten-als-abo)). Since version 0.257 you set who gets this in the automation **Report favourite changes** (Workbench → [Automations](automatisierungen.md#benachrichtigungen), Then card *Report favourite changes*):

| Previously under Workbench → Tasks | Now in the automation |
| --- | --- |
| Allowed *for everyone* | no role chosen |
| Allowed *only for certain roles* | **Only to members of these roles** – system role **Member** and the other roles from [user management](benutzer.md) |
| Allowed *for nobody* | switch the automation off |
| Switched on for new users | **New users get the notification** |
| Apply default to everyone | dropped – everyone sets it themselves under My account |

- When updating to 0.257, Ablago takes over your previous setting into this card once: *for nobody* switches the automation off; the chosen roles and the default are in the card afterwards.
- Whoever doesn't belong – or when no automation that is switched on reaches them – doesn't see the switch **Notify about changes** in their favourites list and under My account; under My account there is a notice instead. What they set themselves stays saved. The star itself and highlighting changed folders remain.
- The same applies to favourites on [access requests](datenschutz.md#auskunft-zustellen): a favourite only gets the task *Access request* when the notification is on for them.
