# Users and roles {#benutzer-und-rollen}

Under **Workbench → Users** you decide who may sign in, with which roles – and who may manage Ablago (see [Who may manage Ablago?](verwalten.md)). There is no separate "Administrator" account. The list shows the users with their status (*active*, *invited*), who is active right now and who is absent. It hides deactivated ones; **Show deactivated** adds them (grey, at the end) – the workbench remembers the choice.

![A user in the workbench](bilder/werkbank-benutzer.png)

## How the editor is built { #aufbau-des-editors }

On the right, a user is organised like a [folder type](mappentypen.md#aufbau-des-editors): the **jump bar** with **Expand all / Collapse all** at the top, below it the areas **Basic details → Roles and rights → Stand-in → Sign-in and security → Access**. Collapsed, each area shows a summary, such as "2 roles", "Full administration" or "stand-in: Jonas". Your device remembers what you expand, per user. For yourself, *Access* is missing as long as you are active – you can neither lock nor reproduce yourself.

- **One save for everything:** **Save user** in the bar at the bottom saves name, roles, administration permission and stand-in at once; **Discard** (or Esc) takes back all changes. If one part fails – for instance because the fresh sign-in for the administration permission was cancelled – what came before is saved, and the area with the error is marked red and expanded. The message appears once, at the bar, and says what is saved and what is not – for instance “Saved: name, roles. Not saved: administration right – …”.
- **Takes effect immediately** whatever is an action of its own: create password link, reset two-factor and passkeys, sign out devices, give tasks to the stand-in, reproduce an error, deactivate and activate.

![A user on the phone: jump bar at the top, areas collapsed](bilder/werkbank-benutzer-handy.png){ width="320" }

## Inviting users {#benutzer-einladen}

1. **+ New**
2. Under *Basic details* enter email address and name, under *Roles and rights* tick **Roles** if needed. You give a management permission afterwards on the person (only with "Full administration").
3. **Create and invite user** – without email sending the button is called **Create user**. **Discard draft** cancels.

![Creating a new user](bilder/werkbank-benutzer-neu.png)

If email sending is set up, the user gets an invitation. Otherwise Ablago shows the invitation link to copy – pass it on in a safe way. The link is valid for 7 days and works once. **Send invitation again** makes the old link invalid.

## Tasks without a recipient {#aufgaben-ohne-empfanger}

Some tasks have no single recipient: tasks without a recipient, post without **To** and deadlines without anyone responsible. In [Administration mode](verwalten.md#der-verwaltungsmodus) everyone who manages sees them. Because you don't work in administration mode in everyday life, **one person** gets them in addition – it may well be you.

- Open **Workbench → Users** without selecting a user. On the right it says **Tasks without a recipient go to**.
- Choose a person as in a link field: type the name and choose it. All active users can be chosen. **Remove** and **Save** means: they are only seen in administration mode.
- The default is the **first person** – in a new installation the one who sets up Ablago ("Your account" in the setup assistant). Nobody gets management permissions through this. Once you have saved – even "nobody" –, Ablago no longer changes anything by itself.
- The chosen person sees the tasks under **To do** and in the numbers (also in the [counter endpoint](api.md)), can complete and pass them on. In administration mode they are still seen.
- If the person is absent or deactivated, their [Stand-in](#andern-deaktivieren-loschen) takes over as with every task. If they are deactivated, best choose someone else – the workbench points this out.

**Technical matters stay in the workbench:** backup failed, a package needs settings, an automation is paused, a mailbox needs a new sign-in, a task is with someone [without read permission](aufgaben.md#aufgaben-bei-personen-ohne-leserecht) and the like are in the [overview](uebersicht.md). So that nobody overlooks it:

- Ablago writes to the people who manage the matching area (with "Full administration": everything) an email **at most once a day** (from 7 a.m.) when something new has come up. What sends its own email immediately anyway – backup failed or too old, storage space, emergency access – doesn't come again as new in it. Without set-up [Email sending](installation.md#e-mail-und-adresse) there is no e-mail.
- Whoever manages the area sees, outside administration mode, the notice **"Something needs attention for administration."** at the top with the button **Administer Ablago**. The notice never says what it is and disappears as soon as nothing is open any more.

## Forgotten password {#passwort-vergessen}

With email sending, users request the link themselves. Without email sending, you create it on the user with **Create password link** and pass it on. A password link is valid for one hour; the previous password applies until a new one is set.

## Changing, deactivating, deleting {#andern-deaktivieren-loschen}

- You change the **name** directly on the user. Every user changes their email address themselves under My account (with their password).
    - If a **group for "Full administration"** is set under [Sign-in via a provider](anmeldeschutz.md#anmeldung-uber-einen-anbieter-openid-connect), this permission follows the group at every sign-in via the provider: whoever is in the group gets it, whoever no longer belongs loses it (the last person keeps it). A selection of individual areas stays untouched.
- You can only get at accounts of people who **may manage** with **"Full administration"**: password link, resetting two-factor, deactivating, deleting and "Sign in as …".
- <span id="abwesenheit"></span>**Absence** – as under the user's "My account" (see [User manual](https://help.ablago.app/benutzer/aktuell/en/profil/#abwesenheit)): on/off, from, until, stand-in. It is in the area *Stand-in*. You can enter it for others, for instance in case of illness, and save it with **Save user**. **Give all open tasks to ‹stand-in›** hands over their tasks immediately – only after a changed absence has been saved. That is recorded in the history of their user folder. If you want to distribute them among several people, use [passing on several at once](aufgaben.md#mehrere-aufgaben-auf-einmal-weitergeben) under Workbench → Tasks (filter *Recipient*).
- <span id="zugang-sperren"></span>**Block access** (area *Access*, at the very bottom) – **Deactivate user** blocks access immediately and ends all sessions, after a confirmation. The folder stays and keeps the name; it appears everywhere *in italics and struck through* (with the notice "deactivated since …" on hovering, for screen readers "(deactivated)"). All links to them (e.g. as the person responsible) stay valid.
    - This only works if a **Stand-in** is entered and the user has **no open tasks** any more. If something is missing, the section names the reason; choosing a stand-in and handing over tasks works in the area *Stand-in*.
    - The stand-in stays entered and acts **permanently**: whatever still arises for the deactivated person (e.g. "doesn't fit" on folders they created, or a mention in an old text) goes to the stand-in.
    - **Activate user** undoes it; the section then shows since when they were deactivated.
- **Delete invitation** only works as long as the invitation was never accepted – for instance with a mistyped address. Whoever has already signed in is deactivated instead of deleted, so that "created by" and links remain.
    - If the [Bin](papierkorb.md) is switched on, the user folder moves to the bin, and the user is deactivated until then. Only on final deletion from the bin does the account disappear. If you bring the folder back, the user is active again.

At least one active person who can sign in always keeps **"Full administration"** – the last one can't have the permission taken away, be deactivated or deleted. You also can't deactivate yourself.

!!! warning "Emergency access"
    A person with "Full administration" created via [emergency access](notfall.md) is in the list as **"Emergency admin ‹date›"**. The Workbench overview shows a red notice until you have renamed or deactivated them. If that wasn't you, deactivate them immediately.

!!! warning "You don't work in administration mode every day"
    Whoever manages works in everyday life with the same account – without management permissions. Only "Administer Ablago" in the user menu unlocks them; then there is a red bar at the top, and you see all folders, including locked ones. More under [Who may manage Ablago?](verwalten.md)

## Sessions {#sitzungen}

The area *Sign-in and security* shows on which devices the user is signed in – with device, browser and last activity. You end individual sessions with **Sign out**, for instance when a device got lost. If they are signed in on several devices, **Sign out everywhere** ends all sessions at once. Both buttons ask first.

Above it, it says whether they have set up [two-factor sign-in](anmeldeschutz.md#zwei-faktor-anmeldung). **Reset** removes it, e.g. after a lost phone. Below it, it says how many [passkeys](anmeldeschutz.md#passkeys) they have; **Reset** in the block **Passkeys** removes all of them.

## What does a user see? {#was-sieht-ein-benutzer}

With **Show** under *What does this user see?* (area *Roles and rights*) you see per folder type how many folders the user may read according to the saved [permissions](berechtigungen.md), with a few examples. The person's everyday permissions always apply – in administration mode they would see everything. If you want to know *why* they see a certain folder or not, use the [test run](berechtigungen.md#testlauf) on the folder type.

## Reproducing errors {#fehler-nachstellen}

If a user reports an error, you can sign in as this user with **Sign in as …** and see Ablago exactly as they do – with their permissions. A yellow warning with **Back to your own account** is at the top all the time – on every page, also on the phone. That is the only way back; the menu under the name has no entry for it, so that you don't end the impersonation by mistake. During this time the menu entry for the account is called **Account of …** and shows the user's account, not yours.

![Signed in as Jonas: yellow warning at the top, in the menu "Account of Jonas Beispiel"](bilder/vertretung.png)

At their next sign-in, the user sees who worked in their name and when. Everything you do during this time happens under their account.

## Users as folders {#benutzer-als-mappen}

Every user has a folder of the [system folder type](mappentypen.md#systemmappentypen-benutzer-rolle-und-post) *User*, with the same id as their account. That way a folder type can get a field like "Responsible" that links to a user.

![User folder in the Library](bilder/benutzer-mappe.png)

- **The account leads.** Name, email address, roles and "active" are taken over by the folder automatically from the account – on creation, with every change and at every start of Ablago.
- **Absence** is in the system fields *Absent* (in effect right now), *Absent from*, *Absent until* and *Stand-in*. With these, views like "Absent users" can be built, and a Links tab with the source *User › stand-in* shows whom someone stands in for. If you already had your own fields with these identifiers, they were renamed on the update (e.g. `vertreter_alt`) – including values.
- **These system fields are read-only in the Library.** The server rejects changes to them, including via the interface. Otherwise a member could change the email address of a person who manages and take over their account via "Forgotten password".
- **Your own fields** (e.g. telephone) you can add on the folder type; they are editable normally in the Library.
- User folders can neither be created nor deleted in the Library.

## Roles {#rollen}

Besides the **system role** *Member*, which everyone has, a user can have any number of **roles** – areas of responsibility such as "Tax and finance".

- **Creating, renaming, deleting roles** happens in the Library in the view *Role* – who may do this is governed by the [permissions](berechtigungen.md) on the folder type *Role* (without rules: every user). Role names are unique.
- **Assigning** only works here in user management (ticks under *Roles* in the area *Roles and rights*, saved with **Save user**). A role's folder shows in the tab *Users* who has it.
- **Member** is a **system role**: it appears as a role folder, every user has it, and it can neither be renamed nor deleted. The former system role *Administrator* has been an ordinary role without members since this version – rules that name it stay valid; if you don't need it, delete it.
- **Deleting a role** that users have: allowed – the assignment goes. If a field still links to the role (e.g. "responsible role"), this link must go first.
- Roles can't be nested.

![A role with its users](bilder/rolle.png)

!!! info "Roles and permissions"
    Roles don't give any permissions by themselves; the workbench only opens the [management permission](verwalten.md) on the person. What a role may do in the Library you set in the [permissions](berechtigungen.md), for instance "Role *Accounting* may read and edit all invoices".

## System accounts {#systemkonten}

Above the list of users are the **system accounts**: accounts under which Ablago itself and packages with code work. They are visible so that it is clear who is in the log and the history – nobody can use them.

The group is **collapsed** so that it doesn't clutter the list of people. Its header names number and composition, e.g. **System accounts (5)** · 4 packages · 1 automation. A click expands it; the workbench remembers for you whether it is open. You see anything unusual even when collapsed in the header:

- **… with errors** (red): an account is deactivated although it is needed, or one of its automations is paused. The account of a removed package doesn't count – it only stays for the history.
- **… with far-reaching permissions** (yellow): a package may change all folder types, or it may read all and also go to the internet. Check at the [package](pakete.md) whether you want this.

When expanded, every affected account bears the same mark; its details on the right say what is going on. The same group is in the [test run on the folder type](berechtigungen.md#systemkonten-und-pakete) when you want to check a system account there.

- **Automation** (system role *System account*): automations run under this account. The history then says "Automation" instead of the person who set it up – and they keep running when this person leaves or is deactivated. System accounts never get a management permission.
- **Package …** (system role *Package*): one service account per package with code. It may only do what you confirmed when installing the package. If the package is removed, the account stays for the history.
- **Not usable:** no password, no sign-in, no session, no API key, no "Sign in as user". System accounts are in no selection (For, stand-in, recipient, links to users), don't count as users and can neither be deactivated nor deleted.
- **Without a user folder:** they don't appear in the Library under *User*.

### System roles *System account* and *Package* {#systemrollen-systemkonto-und-paket}

Besides *Member* there are two more system roles as role folders: **System account** and **Package**. You never give them to people; they can only be chosen in the [rules on the folder type](berechtigungen.md#systemkonten-und-pakete).

- **Without rules of your own** everything stays as before: the system account may do everything on folders except see passwords, a package exactly what was confirmed when it was installed.
- **With rules** you restrict this, e.g. "If user has role *System account* → withdraw all permissions" on the folder type *Health*: no automation then reads or changes health folders.
- For these two roles, only what a rule with their role says applies – the folder type's **default** (which applies to members) doesn't act for them. A rule can never give a package more than was confirmed at installation.
- **Workbench:** the system account may not manage Ablago. Managing users and permissions, restoring, emptying the bin, the emergency sheet and backup details stay closed to it.

## People responsible: fields on users and roles {#verantwortliche-felder-auf-benutzer-und-rollen}

For "who takes care of it?" you create a field of the field kind **Link** on a folder type:

- "Responsible user" → target folder type *User*
- "Responsible role" → target folder type *Role*

User and role are separate fields here. See [Links](mappentypen.md#verweise-mappen-verbinden).
