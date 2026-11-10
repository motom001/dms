# Who may administer Ablago? {#wer-darf-ablago-verwalten}

Ablago has **no separate "Administrator" account**. Administering is a permission of a **person**: Lena works with *one* account, *one* email address and *one* password – day to day in the Library, and when something needs setting up, deliberately in **administration mode**. That way there is a person behind every administrative action; a shared account "admin" doesn't exist.

## The administration permission { #das-verwaltungsrecht }

Under **Workbench → Users → person** there is the section **Administration**:

- **May administer Ablago** – without this tick, the person has neither the workbench nor the entry "Administer Ablago".
- Below it a tree with the workbench's areas, structured by the groups of the sidebar. At the very top is **Full administration**: all areas, including those added in later versions. [Use](nutzung.md) is not in the tree – it always belongs to Full administration.
- Whoever may use an area may do everything in it. Every person who administers sees the workbench **overview** – with the notices of their own areas.
- The server checks the same as the interface: an area without the permission can't be reached via a link or the interface either.

Only someone who has **Full administration** themselves may **grant or withdraw administration permissions** – and each time with a fresh sign-in. Every change is recorded in the [log](fehlersuche.md) with the person, before and after; everyone with "Full administration" gets an email about it.

Whoever only has the area **Users** creates people, resets passwords and maintains roles and absences – but not on the accounts of people who administer themselves, and they don't grant administration permissions.

!!! warning "The division creates order – it doesn't protect against intent"
    Areas with the sign **"Gives access to all data"** lead by detours to all folders: folder types (permissions), packages, automations, email and address, sign-in protection (sign-in via a provider), backup (with restore), full export, encryption and database connection. In addition, every person sees all folders in administration mode. Partial permissions thus prevent mistakes ("whoever looks after the mailboxes doesn't change the folder types by accident"), but not misuse. Only give administration permissions to people you trust.

### At least one person keeps "Full administration" { #mindestens-eine-person-behalt-gesamte-verwaltung }

At least one active person who can sign in (password set or signed in before) always keeps **Full administration**. The last one can't take the permission away from themselves, and they can neither be deactivated nor deleted. Give it to a second person first – ideally a second person always has "Full administration" anyway, for instance for holidays or illness.

That's why, after the setup, Ablago recommends in the [overview](uebersicht.md#bewusst-akzeptieren) a **second person with the administration permission** as long as only one person may administer: "Good if someone else can administer in case you're not around." You invite the second person under *Users* – they get an invitation link –, then you set **May administer Ablago** for them. With **No, thanks** the recommendation is gone for good.

If nobody can get in any more after all, the [emergency code from the emergency sheet](was-ist-passiert.md#notfallcode) and the [RESCUE file](notfall.md) lead to a person with the administration permission. The emergency code only sets a new password for an existing person; nobody loses a permission in the process.

### What never gets an administration permission {#was-nie-ein-verwaltungsrecht-bekommt}

- **API keys** – not even those of people with "Full administration". Via the interface and the [WebDAV drive](webdav.md), every person works with their everyday permissions. Administration only happens in the interface or with the command [`dms`](konsole.md) in the container.
- **System accounts** ("Automation") and the **packages' service accounts**.

## Administration mode { #der-verwaltungsmodus }

Day to day, even a person with the administration permission works without these permissions – they only see what the [permissions](berechtigungen.md) allow them. They switch into administration deliberately:

1. User menu (top right) → directly below **My account**: **Administer Ablago**.
2. **Sign in again** – with password and, if set up, the two-factor code. If the sign-in was at most 10 minutes ago, the question is skipped. Whoever only signs in via a provider signs in there again.
3. Ablago opens the workbench. At the top there is a **red bar**: "You are currently administering Ablago. You shouldn't work like this every day. You see all folders, including locked ones." with the button **End administration**.

The mode **ends** with **End administration** (bar or user menu) or after **15 minutes without activity**. If it expires during editing, nothing is lost: Ablago only asks for the sign-in again and then saves. On the same day in the same browser, **getting back in takes one click** ("Administer again") – but it still has to be chosen.

This day marker is tied to the session on the server, not to a cookie. It ends at midnight, on signing out, when the session is ended from another device, on a password change, when two-factor sign-in changes and when the administration permission is withdrawn. In a stand-in arrangement ("Sign in as …") there is no administration mode.

**Who else is administering right now?** If other people are in administration mode at the same time, the workbench shows below the red bar, for example, "Also in administration mode right now: Markus (since 10:42)" – all of them if there are several, never yourself. This lets you agree with each other before two people change the same configuration. The note is **not a safeguard**: what protects you is that Ablago detects an intermediate change when saving and never silently overwrites it. It only appears in the workbench and only in the mode, updates itself every 10–15 seconds (this does not extend your own mode) and disappears after a minute at the latest when the other person ends the mode or it expires. Service and system accounts never appear. Nothing is recorded – the start and end of the mode are in the log as before.

In the mode, the **Library** can be used as usual – for looking things up and for troubleshooting –, with all folders. The home page is then the workbench, without the mode the Library.

### Fresh sign-in for sensitive actions { #frische-anmeldung }

For the most sensitive actions, Ablago **always** asks for the password (and the code), even in the middle of administration mode. Afterwards the confirmation applies for 10 minutes:

- granting or withdrawing administration permissions
- creating or changing the key, downloading the emergency sheet
- full export with passwords in plain text
- restoring a backup
- changing the database connection
- changing sign-in via a provider
- changing email sending
- allowing emergency access from the internet ([sign-in protection](anmeldeschutz.md#notfallzugang))

Failed attempts count towards [sign-in protection](anmeldeschutz.md) as with signing in itself. Two-factor sign-in remains voluntary; it can still be required under *Sign-in protection* "for everyone who may administer".

## Trail in administration mode { #spur }

If someone in administration mode opens a folder they wouldn't be allowed to read without the mode, the **folder's history** says "in administration mode: viewed" with their name – likewise on downloading, changing, exporting and sending by e-mail. On the first opening, Ablago points this out. Repeated opening in quick succession is only recorded once.

These entries **can't be deleted** or hidden; they also remain when the folder has been deleted permanently. All of them together are listed under **Workbench → Log → Viewed in administration mode** (time, person, folder) – visible to people with "Full administration". For IT service providers and helpers this is a deliberate threshold: they know it is documented.

## Log { #protokoll }

Start, end, expiry and getting back into the mode are recorded in the log, as are failed renewed sign-ins. Every request in administration mode carries the person in the log with the addition **"(im Verwaltungsmodus)"**.

## Notices to the administration { #hinweise-an-die-verwaltung }

Technical notices – backup, storage space, mailboxes, webhooks, sign-in protection, packages, automations … – go by email to the people who administer the matching area and to everyone with "Full administration". In a household that is usually everyone who administers. Outside administration mode, the person only sees the notice at the top "Something needs attention for administration." with the button **Administer Ablago**.

## After the update to this version { #umstellung }

Previous accounts with the role **Administrator** are now normal users with **Full administration**. They sign in as before, but land in the **Library** and only see there what the permissions allow them – the workbench is reached via **Administer Ablago**. The system role "Administrator" has been dropped; its role folder remains as an ordinary role without members. If you had a separate admin account *and* an everyday account, give the everyday account "Full administration" and then deactivate the admin account.
