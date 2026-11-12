# Automations {#automatisierungen}

With an **automation**, Ablago does something by itself: **if** something happens (an event or a date) **and** the conditions are right, **then** it sets fields or gives someone a task – **otherwise**, if you like, something else. You find them under **Workbench → Build the Library → Automations**. In a household the area appears in **expert mode** (Workbench → Customise workbench), in businesses always.

![Workbench → Automations: list and editor](bilder/werkbank-automatisierungen.png)

On the left are all automations with name, short form ("If Contract: Cancel by in 30 days → task to Responsible"), on/off, number in the order and the last run. On the right, an automation is organised like a [folder type](mappentypen.md#aufbau-des-editors): the **jump bar** with **Expand all / Collapse all** at the top, below it the areas **Basic details** (name, order, description) **→ When** (with the And conditions) **→ Then** (with Otherwise) **→ Try out → History → Versions**; the last three only exist after creating. Collapsed, each area shows a summary, such as the trigger or the Then and Otherwise cards; your device remembers what you expand per automation. **Save automation** at the bottom saves basic details, When, Then and Otherwise at once. Whatever does not fit is shown in the area it belongs to; for a saved automation the area is also marked red, and an error on saving expands it. **On/off**, **Copy**, **Try out** and **Restore** take effect immediately.

In *When* and *Then* you build the automation from cards – four boxes one below the other, connected with arrows:

| Area | What goes in |
|---|---|
| **If** | exactly one card: an event (folder created, saved – optionally only for certain fields and **also when created** –, note, document uploaded, favourite changed, account block …), **Date reached**, **Schedule** or a [Workbench card](#werkbank-karten) (**Error reported**, **Log message**, **New version available**) |
| **And** | none, one or several conditions: field values as in [views](sichten.md), "Folder is in view …", "Folder is a favourite of …", groups with "all" or "one is enough"; every condition can be reversed with **not** |
| **Then** | one or more cards, in order: **Change field**, **Task / notification**, **Send daily summary**, **Report favourite changes**, **Report sign-in protection**, **Run package on schedule**, **Start a backup**, **No further automations afterwards** |
| **Otherwise** | none or several cards as under Then – they run if the And conditions are **not** met (see [Otherwise](#sonst)) |

What you trigger by hand on **one** folder – “Assign task”, “Remind”, follow-up – are [automation templates](automatisierungsvorlagen.md). They run on the same engine, with the rights of the person who applies them.

## Example: reminding of the notice period {#beispiel-an-die-kundigungsfrist-erinnern}

Petra is to get a task 30 days before the notice period of a contract runs out – but only if someone is entered as responsible in the contract.

1. **+ New**, name "Check cancellation".
2. **If:** **Date reached**, folder type *Contract*, date field *Cancel by*, **advance notice** 30 *days*, time 07:00.
3. **And:** **+ Card → Field condition**, field *Responsible* "is not empty".
4. **Then:** **+ Card → Task / notification**, as *Task*, recipient *Person in the field "Responsible"*, text `Please check {titel} – can be cancelled until {kuendigung_bis}.`
5. **Save**. For a new automation, the switch at the top next to the name is set to **on** – with saving it is switched on. If it shouldn't work yet, set it to **off** beforehand.

![Expanded Then card with recipient and placeholders](bilder/werkbank-automatisierung-karte.png)

You **expand** a card with a click on its name (settings) and **collapse** it again (short line like "Task → Person in the field "Responsible""). Below the text are the **placeholders** that match the If card: the fields of the folder type as well as `{titel}`, `{mappentyp}`, `{heute}`, `{automatisierung}` and with a date `{datum}` and `{tage}`. A click inserts the placeholder.

## Example: reporting new documents to the administration {#beispiel-neue-dokumente-an-die-verwaltung-melden}

The administration is to learn when a document is added anywhere – bundled, not for every single file.

1. **+ New**, name "Report new documents".
2. **If:** **Document uploaded**. Without a folder type it applies to all; with a folder type (e.g. *Invoice*) or a field condition under **And** you narrow it down.
3. **Then:** **+ Card → Task / notification**, as *Notification*, recipient the role *Administrator* (or a role of your own such as *Office*), text `New document on {titel}.`
4. **Save**.

Ablago itself no longer brings ready-made automations (since 0.212): subject-specific automations come from [packages](#aus-paketen), everything else you build as in these examples.

## Date reached {#datum-erreicht}

The card **Date reached** checks once a day at the chosen time for which folders a date field is reached after the **advance notice**.

- **Advance notice** in **days, weeks or months**. 3 months are three calendar months, not 90 days: for an end on 31 May the card applies on the last day of February. 0 means "on the day itself", a negative number "that long afterwards".
- **Recurring** (monthly, quarterly, half-yearly, yearly): whoever completes the task gets the next date suggested.
- A **task** from it is a **deadline** for the folder's date. It completes itself if the date is changed or cleared. The same person only gets one deadline per folder, field and date.
- If, when a folder is **saved**, a date is already within the advance notice, the automation runs immediately – a date entered late still reminds.
- For a date field to appear under *To do* and in the calendar, it needs the tick [Is a deadline](mappentypen.md#fristen-erinnerungen-an-datumsfeldern) on the folder type.
- If Ablago was off at the time, it catches up missed days (up to 31 days back). A newly switched-on automation starts today.

The earlier cards "Date in N days" and "Deadline reached" have merged into **Date reached**. "Date in N days" becomes the same card with advance notice in days the next time it is opened. With "Deadline reached" the date field is missing: the automation is shown in red until you choose it.

## On, off and paused {#an-aus-und-angehalten}

Whether an automation works you see and change in **one** place: at the switch at the top next to the name; the list shows the same state (**on**, **off**, **paused**).

- For a saved automation the switch takes effect immediately; in its place it briefly says "Switched on." or "Switched off.".
- If it is **paused** (red, see below), the reason is shown there and the button **Switch on again**.
- Next to it is the button **Copy**: it creates a copy of your own and opens it.

## Schedule {#zeitplan}

The card **Schedule** triggers on the chosen **weekdays** at the chosen **time** (in the time zone of the [region](region.md)), if you like **not on public holidays** – you set the state for this under [Region](region.md).

- **For every user:** the automation runs exactly once a day per active user – if you like only for the members of a **role**. The cards then see the person's user folder; the placeholder `{benutzer}` stands for their name.
- **Time from My account:** with this tick, the time, weekdays and public holidays apply that someone has chosen under My account for the daily summary; whoever has chosen nothing gets the card's time and Monday to Friday.
- If Ablago was off at the time, the automation still runs later the same day – not on following days. Even with several servers, every day (per person) runs exactly once.

## Adding, re-ordering, removing cards {#karten-hinzufugen-umsortieren-entfernen}

- **With the mouse or on the phone:** expand the **card stock** (at the top of the area *When*), search for a card and **drag** it into its area (long-press on the phone) – or simply click it.
- **With the keyboard:** in every area **+ Card** – open the selection, choose a card. You re-order Then cards by their handle `⠿` with **Alt+↑/↓**, with the mouse by dragging.
- **Remove** is on every card.

The stock only shows what matches the If card: **Change field**, for instance, only if the If card has a folder type.

## What the Then cards do {#was-die-dann-karten-tun}

- **Change field** only sets the chosen fields and leaves all others unchanged. Text with placeholders; for date fields `heute`, `heute+7` or `heute-3`. Ablago checks the value as in the form (required fields, choice lists, archive mode). The folder's history says "by automation '…'".
- **Task / notification** goes to people, to **all active members of a role**, to the **person in a field** of the folder (optionally "otherwise whoever created the folder"), to **whoever created the folder** or to a **person from the event** (e.g. the stand-in for *Absence set*). A *task* can have a due date; Ablago bundles *notifications* so that nobody is flooded by many runs in a row.
- **Placeholders with the recipient's permissions:** Ablago fills in the text for every recipient individually – for a role per person, for a stand-in with the stand-in's permissions. What the person may not see appears as "(not visible)", for instance the title of a linked contact. That way the daily summary doesn't give anything away either. The **test run** in the editor says who may not see something ("Jonas may not see everything …").
- **Without read permission on the folder**, the task still arrives. But the person only sees "Task on a folder you may not see – ask …" and the due date (for tasks on a date field not even that). You find the case under [Tasks with people without read permission](aufgaben.md#aufgaben-bei-personen-ohne-leserecht).
- Tasks from automations behave like the built-in ones: if someone is **absent or deactivated**, the task goes to their **Stand-in** (the history says "passed on because of absence …"). If there is none, the administrators get it – the run doesn't stop.
- A task **completes itself** when its reason goes away: with **Date reached** when the date is changed or cleared; with **New post** and with *post created or saved* when the post is assigned or completed; with **Absence set** when the absence ends.
- If a task on a post goes to the **person under “To”**, it is a **Post for you** task: only one per post and person, and it also completes itself as soon as the post goes to someone else (see [Post for you](#post-fur-dich)).
- **Send daily summary** (only with *Schedule for every user*) sends the person their open tasks by email – the same content as before. Whoever has unsubscribed under My account, is absent or has nothing open gets none; the run history names the reason.
- **Report favourite changes** (only with *Favourite changed*) gives everyone who has the folder as a favourite the bundled notification "Changed" – as before. **Only to members of these roles** narrows it down (no role = everyone), **New users get the notification** sets the default – both were under Workbench → Tasks up to 0.256 ([Notify about favourites](aufgaben.md#favoriten-benachrichtigen)). The switch under My account still applies; one's own changes are never reported.
- **Report sign-in protection** sends everyone who manages sign-in protection either the **summary** of the blocks (with *Schedule*, not per user) or immediately an email when a **user account was blocked** (with *User account blocked*, at most once a day per account). See [Sign-in protection](anmeldeschutz.md#mail-an-die-administratoren).
- **Run package on schedule** (only with *Schedule*, not per user) tells a package that its time has been reached – see [below](#paket-nach-zeitplan).
- **Start a backup** starts a new backup – see [Workbench cards](#sicherung-anstossen).
- **No further automations afterwards** ends the sequence: automations with a higher number no longer run for this event (in the run history "Skipped by …").

Automations work with the **system account "Automation"** (Workbench → Users). What this account may not read, the automation skips; placeholders then show "(not visible)". For tasks, the recipient's permissions apply additionally (see above).

If the account "Automation" may **not see** folders of the If card's type **at all** – for example because a rule "System and package roles forbidden" applies on the folder type –, the automation can never run. The editor and the list then show a notice "This automation can't run …". Via **View permissions on the folder type** you get to the [test run](berechtigungen.md#testlauf) of this folder type, with the account "Automation" already chosen; there you see which rule decided. Saving still remains possible.

## Run package on schedule { #paket-nach-zeitplan }

Some packages have to calculate regularly because their result changes only with the date – for example *Contracts* ("cancellable until …") or *Invoices* ("overdue since …"). Instead of a hidden run they bring an **automation** for this, for example **Check contracts daily**: If *Schedule* daily at 05:00 → Then **Run package on schedule**.

- You set **time and days** in the If card; switch it off with the switch. Switched off, the package only calculates when someone changes one of its folders.
- The card names the **package** and optionally a **task** (a key such as `taeglich` or `monatlich`) so that a package can tell several runs apart. The package receives the event *Run on schedule* with date, planned time and task – exactly once per day, even with several servers.
- **No additional rights:** the package works with the rights you confirmed when installing it. The rights preview names the schedule ("Runs on schedule: Check contracts daily (daily at 05:00)").
- **Only its own package:** an automation supplied with a package only ever calls the package that brings it – the field *Package* is fixed there. In an automation you create yourself, only packages that accept schedules can be chosen.
- **Package removed:** the card then has nothing to run. The automation stays on and shows "Package … is not installed"; the run history lists the run as *skipped* – no error, no notice about failed runs.
- You see every run in the automation's **run history**; the package receives it like any other event (with retries if it is not reachable at the moment).

## Otherwise { #sonst }

Under **Then** is what happens if the And conditions are met. Under **Otherwise** you can put cards for the other case – the same cards as under Then, dragged from the stock or with **+ Card**. Without And conditions everything always applies; Otherwise then never runs.

*Example:* If a contract is saved **and** *Responsible* is set, **then** set the field *Status* to “checked” – **otherwise** a task to the role *Administration*: “Please give {titel} a responsible person.”

- Per run exactly one of the two branches runs; the other appears in the run history as *skipped*. If an automation has no Otherwise cards and the conditions are not met, the run is called *doesn't apply* as before.
- **No further automations afterwards** also works in the Otherwise branch.
- Every automation needs at least one Then card; Otherwise is optional.

## Workbench cards { #werkbank-karten }

Some things do not concern a folder but the **operation** of Ablago. For these there are three If cards (in the stock under *Operations*) and one Then card. These cards have **no folder**: the only possible condition is a feature of the Library, and a **Task / notification** goes to people or roles – it is attached to the recipient's user folder.

Only someone who may manage the matching area themselves may set up a Workbench card: *Error reported* needs *Reported errors*, *Log message* the *Log*, *New version available* the *System health* and *Start a backup* the *Backup*. This also applies when editing: someone who does not manage the area can change the name, on/off and the Then and Otherwise cards of an existing automation with a Workbench card, but not its If card (neither the kind nor level, module or text) – nor restore a [version](fassungen.md) that changes it. Packages do not bring these cards.

### Error reported { #fehler-gemeldet }

Runs as soon as someone reports an error via **Report an error**. Placeholders: `{zeitpunkt}`, `{meldung}` (text of the report) and `{gemeldet_von}`. A recipient only sees the text and sender if they may manage [Reported errors](fehlersuche.md#gemeldete-fehler) – everyone else sees “(not visible)”. Images and technical details of the report never go into a task. The **run history** also leaves out the text and the account of the reporting person as long as you do not manage Reported errors.

*Example:* If **Error reported** → Then task to Markus, due in 1 day: `New error report from {gemeldet_von}: {meldung}`.

### Log message { #protokollmeldung }

Runs when the [log](fehlersuche.md#protokoll) writes a warning or an error. You choose the **level** (*from warning* or *from error*), optionally a **module** (e.g. *E-mail*, *Backup*) and a **text** the message has to contain. Placeholders: `{zeitpunkt}`, `{stufe}`, `{modul}` and `{meldung}` – without secrets (encrypted values and password hashes in the text become “•••”); only someone who may manage the log sees the text, as a recipient and in the **run history**.

- **At most one run in 15 minutes** per automation – a disruption does not cause a flood.
- Messages caused by an automation itself (e.g. because its task can't be delivered) do not trigger any automation.
- **E-mail disrupted:** for errors in the *E-mail* module, a notification by e-mail usually doesn't arrive. The editor points this out – use a **task** or **notification**: it appears in Ablago under *To do* even when sending is disrupted.

### New version available { #neue-version }

Runs when there is a new **stable version** of Ablago. For this, Ablago asks GitHub once a day (from 06:00) – only while such an automation is switched on; nothing from your Library leaves the house. It runs exactly once per version. Placeholders: `{version}` and `{installiert}`. What's new is shown under [Technology and versions](technik.md).

### Start a backup { #sicherung-anstossen }

The Then card starts a new [backup](sicherung.md) – encrypted like *Back up now* and kept like the automatic backups, so the disk doesn't fill up. The automation only learns **started** or **already running** (then no second one). Whether the backup succeeds, how large it is and where it is stored is only shown under Workbench → Backup; if it can't be started at all (no key, too little space, restore running), the run fails without details.

### Workbench permissions of the system account { #werkbank-rechte }

Automations run under the system account **“Automation”**. It may never enter the Workbench. For the Workbench cards it has **exactly these permissions** – none at all for all other areas:

| Area | may | may not |
|---|---|---|
| Backup | **start** a new backup | see success, number, schedule, storage space, storage location; emergency sheet |
| Restore | – | anything |
| Full text | – | regenerate and the like |
| Bin | – | empty, delete permanently |
| Technology and versions | check whether there is a new version | – |
| Reported errors | see | – |
| Log | find messages from a level | – |
| Users | nothing in the Workbench (users are folders, permissions on them via the role *System account*) | manage users and permissions |

## Order {#reihenfolge}

If there are several automations for the same trigger, they run by their **order** (1–99, smaller first; your own start at 50). The editor then says "runs as 2nd of 3 for the same trigger". In the list, **By trigger** shows all automations of an event together; there you re-order them by dragging or with **Alt+↑/↓** on the handle, and the numbers adjust.

## Trying out, run history and change history {#ausprobieren-verlauf-und-anderungsverlauf}

![Run history with the steps of a run](bilder/werkbank-automatisierung-verlauf.png)

- **Try out:** choose a folder and **Run** – as if the event had happened. You choose the folder as in a link field: type part of the title and click a hit. Only folders of the If card's folder type that the account "Automation" may see are offered – with all others the automation couldn't run anyway. With **Dry run**, Ablago only shows what would happen ("Would send task to 1 person: …") and changes nothing. With [Workbench cards](#werkbank-karten) there is no folder to choose – Ablago tries it with a sample message.
- **Run history:** looks like a folder's history: per run one line with date and time, the trigger (e.g. "Folder created", "Dry run", "Repetition"), a summary, the result (*completed*, *doesn't apply*, *skipped*, *failed*) and the number of cards. Expanded, a table **Card · Result · Details** shows what every card did; if something went wrong, the reason is at the card that failed. With **Expand all entries** / **Collapse all entries** you see everything at once. If the automation is running right now while the editor is open, this run is expanded and the cards are ticked off **live**; cards not yet reached show "waiting".
- **Failed runs** remain. Above the list of automations it then says, for example, "1 run has failed: Report new users, 04.11.26, 04:48"; with several runs, **Show** only shows the affected automations. **Repeat all** runs them again, **Don't repeat** removes them from the notice – in the run history they remain as "failed – not repeated (who, when)"; nothing is deleted. You have the same choice per run in the expanded run history. **Dry runs** don't count; their result is only in the run history. The [Workbench overview](uebersicht.md) also reports failed runs.
- **Versions** (until 0.254 "Change history"): every saved version with time, who and what changed ("Then: 'Task to Markus' added"); the newest is marked **Current**. Two versions can be compared and an earlier one **restored** – after a confirmation that says what changes, it becomes a new version; the current state is kept. If the earlier version no longer fits (e.g. a field is missing), Ablago says so as when saving and does not restore it. How this works for all Workbench settings: [Versions](fassungen.md).

## When something no longer fits {#wenn-etwas-nicht-mehr-passt}

Ablago doesn't block your work: folder types, fields and views can still be changed and deleted. If an automation is then missing something (field deleted, view gone), it is **marked red and paused** – with the reason in the list and a notice in the overview. Correct, save, switch on again.

Ablago also pauses an automation if it runs **more than 30 times in one minute**, and after a [restore](wiederherstellen.md) all switched-on ones – so that imported data doesn't immediately trigger a wave of tasks. Automations that trigger each other run at most three levels deep.

## From packages {#aus-paketen}

Packages bring **ready-made automations**, for example "MOT due soon" (package Vehicles) or "Cancellation due soon" (package Household). When installing – in the setup assistant as in the workbench – Ablago lists them by name: **"Should they be switched on straight away?"** Preselected are the ones the package marks as *switched on straight away* (e.g. *Check contracts daily*, with the time behind it); if a package marks none, all are preselected as before. What stays ticked is switched on after installation, the rest off – you can untick any of them.

- In the list you recognise them by the origin **from package …**. You can switch them on, adjust and copy them.
- On an **update** of the package, the new version replaces the old as long as you haven't changed it; on/off always stays as you set it. A changed one stays as it is. New automations from the update are offered again when updating.
- If you remove the package, its automations go with it if they are off and unchanged.
- Packages do not bring [Workbench cards](#werkbank-karten) – they only exist in automations you create yourself.

### Stand-in {#vertretung}

If an **absence with a stand-in** is entered for someone, the stand-in gets a task – that is done by the automation **Stand-in entered** (If *Absence set*, recipient *Stand-in from the event*, placeholders `{benutzer}`, `{vertreter}`, `{von}`, `{bis}`, `{zeitraum}`). It completes itself as soon as the absence ends or period or stand-in change. For the previous stand-in there is the If card **Stand-in withdrawn** (absence ended, another or no stand-in any more). The package **Notifications** brings both; in existing libraries the update took over *Stand-in entered* switched on. If the event names no person (absence without a stand-in), nothing happens – that is not an error.

### Notifications {#benachrichtigungen}

The **daily summary**, reporting changed **favourites**, the task **Post for you** and the emails of **sign-in protection** are automations – they are set only here, no longer under [Workbench → Tasks](aufgaben.md#werkbank-aufgaben). The package **Notifications** brings them; in the setup assistant it is preselected. Without an automation with *Send daily summary*, the Workbench overview points this out: "No automatic notifications" with **Install package**; if only *Post for you* is missing (or switched off), the notice reads “No ‘Post for you’ task”.

On the update to this version, Ablago created four automations **once** in existing libraries with the previous values: *Daily summary* (time from My account, on or off as before), *Report favourite changes*, *Sign-in protection summary* and *Report account block immediately* (on if the ticks in sign-in protection were set). Nothing changes for users. If you install the package, they merge into its automations as long as you haven't changed them.

### Post for you {#post-fur-dich}

If someone is under **To** on new [post](https://help.ablago.app/benutzer/aktuell/en/post/), they get the task **Post for you – please assign**. Up to version 0.256 this was built in; since 0.257 the automation **Post for you** from the package **Notifications** (1.3.0 or later) does it:

| Card | Content |
| --- | --- |
| If | *Folder saved*, folder type **Post**, only when **To** or **Status** changes, **also when created** |
| And | *To* is not empty, *Status* is *New* |
| Then | *Task* to the person in **To**, text “Post for you – please assign” |

The behaviour is the same as before: if the person is away, the task goes to their **stand-in**. It **completes itself** as soon as the post is assigned or completed or someone else is under *To* – who then gets their own. There is **only one** per post and person, even if the post is saved several times. The number **New post** on the start page still counts the post, not the tasks – it does not change.

**When updating to 0.257:** if the Notifications package is installed, Ablago creates a switched-on automation *Post for you* with these cards **once**; updating the package to 1.3.0 replaces it as long as you haven't changed it (on or off stays). Open “Post for you” tasks from before stay and complete themselves as before. **If the package is not installed, nobody gets this task on new post any more** – the workbench overview points this out; if you install the package, it is back.

### Reminders from earlier versions {#erinnerungen-aus-fruheren-versionen}

Up to version 0.176, advance notice, recipient and text of a reminder were set directly on the date field, and the stand-in task was built in. On the update, Ablago took over each of these reminders **once** as a switched-on automation *Reminder: field (folder type)* – with the same behaviour. The Workbench overview points this out once (*Got it* hides the notice). If a package later brings its own automation for the same field, it replaces the taken-over one as long as you haven't changed it. That way nothing ever reminds twice.

## Examples {#beispiele}

Up to version 0.211, Ablago created three **switched-off examples** (origin "from Ablago"): *Remind of the notice period*, *Report account block* and *Report new documents*. Since 0.212 there are no automations from the core any more (issue #883):

- An example you have **never switched on and never changed** is removed silently by the update.
- An example that is **switched on or changed** stays and becomes a normal automation of **your own** – you can now delete it as well.
- On the first start, the [log](fehlersuche.md#protokoll) names what was removed and what was taken over.

The reminder of the notice period comes with the **Household** package ("Cancellation due soon"); reporting new documents is shown above as an [example](#beispiel-neue-dokumente-an-die-verwaltung-melden). For locked accounts there is [sign-in protection](anmeldeschutz.md) and the **Notifications** package.

![Editor in dark appearance](bilder/werkbank-automatisierung-dunkel.png)

On the phone, the list comes first, the editor after tapping – the jump bar at the top, the areas below collapsed as with the folder type; there you add cards most easily with **+ Card**.

![Automation on the phone](bilder/werkbank-automatisierung-handy.png){ width="320" }
