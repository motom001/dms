# My account and settings {#mein-konto-und-einstellungen}

## The menu under your name {#das-menu-unter-deinem-namen}

A click on your name at the top right opens a menu:

![User menu](bilder/benutzermenue.png)

- At the top are your name, your email address and – if you may administer Ablago – "may administer Ablago" or "in administration mode".
- **My account** – your [profile](#profil) with all areas: account, security, appearance (design, font size, home page, highlighting changed folders, column widths), notifications, [absence](#abwesenheit).
- **Administer Ablago** – only if you may administer: switches into [administration mode](#ablago-verwalten). In the mode, it says **End administration** here.
- While an absence is in effect, "You are absent" appears at the top of the menu – a click on it leads straight there –, and there is a dot next to your name.
- **Help** – opens this manual.
- **Discover Ablago** – the tour and tips to browse, see [Discover Ablago](entdecken.md).
- **Report a problem** – see [Report a problem](#fehler-melden).
- **About Ablago** – see [About Ablago](#uber-das-dms).
- **Sign out**.

Every entry has a small icon in front, so you find it faster.

### About Ablago { #uber-das-dms }

The window **About Ablago** shows what Ablago is, which **version** is currently running and under which **licence** it is published: the Apache License 2.0 – Ablago is free software; you may use, change and pass it on free of charge. The link **Source code** leads to the source code of exactly this version on GitHub. There are also links to this manual, to "New in this version" and the release notes and – voluntarily – to the page "Who uses Ablago?", where you can tell how you use Ablago.

You can close the window with **Close**, with the Esc key or with a click next to it.

![About Ablago](bilder/ueber-dms.png){ loading=lazy }

## My account { #profil }

My account has five areas on the left (on a smartphone as buttons at the top):

![My account](bilder/profil.png){ loading=lazy }

### Account {#konto}

- **Name** – this is how you appear under "created by" and "last changed by" – and as the title of your user folder.
- **Email address** – you sign in with it. To change it you need your current password. If Ablago sends emails, the previous address gets a notice – so if someone else changed the address, you'll notice.
- <span id="sprache"></span>**Language** – in which language Ablago talks to you: interface, messages and emails to you. **Like the library** follows the language the administrator has set for everyone. You can choose from the languages they have allowed. The page reloads after the change. For machine-translated languages there is a notice with a link to how you can contribute improvements. Dates and numbers follow the language.
- <span id="ubersetzung-anzeigen"></span>**Offer "Show translation"** – only exists if your library has a translation package. When the switch is on, you see the button [Show translation](mappen.md#inhalte-ubersetzen) on long texts, notes and full texts; when it is off, you don't. Below it you can read what translates and whether the text leaves your library's device for this.

#### My data { #meine-daten }

Your Ablago runs at your home or in your business, not at a cloud provider, and it sends no usage data – not even anonymous data. What it stores about you is your account, the folders and documents you and others create, and who changed what when.

- **A copy of your data** you get yourself under [Export my data](#meine-daten-exportieren) – if the administrator has switched it on. Otherwise, ask them for information about your data.
- **If something should be deleted** – or you want to know what else is stored about you –, ask the administrator of your Ablago. They can delete folders that you yourself may not delete. Some things must be kept for a while (e.g. invoices); they then stay locked until the period has expired. Your account is not deleted but deactivated once you have used it – your name stays with what you created.

#### Export my data { #meine-daten-exportieren }

Under **Account → Export my data** you get a copy of everything you may see – in open formats (CSV, JSON, Excel, PDF, the documents in the original) and readable without Ablago:

- all folders you may read, with their documents and older versions,
- your own tasks, reminders, favourites and what you put in the bin,
- your own user account (without password).

What belongs to the whole household – deletion log, synonyms for the search, automations – is only in the administrator's full export. If a folder links to one you may not read, it says "Folder not visible" instead of the title.

**The export is unencrypted** – keep the file safe. Password fields are only included if you may see them and explicitly confirm it; they are then in plain text in the file `passwoerter.csv`. The export runs in the background; when it's ready, you download it as a ZIP. There is only ever your latest export – a new one replaces the old one. **After downloading it is deleted**, at the latest after 7 days; until when it is available is shown next to the button. If you need it longer, keep the ZIP file. While someone is [working in your name](#in-deinem-namen), no export can be started. **The personal export is off by default**; the administrator switches it on in the Workbench. While it is off, you see a note here instead of the button – you then get information about your data from the administrator.

### My permissions { #meine-rechte }

At the bottom of the area *Account*, below name and email address, it says what you may do per folder type: **create, read, edit, delete** and **see passwords** – each with "yes", "no" or "depends on the folder". "Depends on the folder" means: it depends on the individual folder, for example on whether you are responsible there or have a task on it. The permissions are set by an administrator; more under [What you may see and change](mappen.md#was-du-sehen-und-andern-darfst).

![My permissions](bilder/meine-rechte.png){ loading=lazy }

### Security {#sicherheit}

- **Password** – enter your current password and the new one twice (at least 10 characters). After changing it, all other sign-ins are ended.
- **Passkeys** – sign in without a password, with your fingerprint, face or device PIN; see [below](#passkeys).
- **Two-factor sign-in** – see [below](#zwei-faktor-anmeldung).
- **My signed-in devices** – everywhere you are currently signed in, with browser, device and last activity; *this device* is marked. **Sign out** ends a single sign-in, **Sign out all others** all except this one – for instance if you have lost a phone. Both ask once more first. Then it's best to change your password too.
- <span id="passwoerter-fuer-dokumente"></span>**Passwords for documents** – the passwords of protected PDFs that you stored with **Remember for further documents** when [unlocking](dokumente.md#passwortgeschuetzte-pdfs). For each password you see the name, the password hidden and when Ablago last used it. The eye shows it, **Change** lets you enter a new name or a new password, and **Delete** deletes it after a confirmation. Documents already unlocked stay unlocked.
    - **Showing and changing** the password only works after you have confirmed yourself again: with your Ablago password, with two-factor sign-in also with a code from the app, or with a [passkey](#passkeys) (**Confirm with a passkey**). The confirmation applies for five minutes to this area.
    - The passwords belong **only to you**: Ablago stores them in your account, encrypted with Ablago's key. Nobody else sees them in Ablago, not even whoever administers Ablago (not even in administration mode), and not in a stand-in arrangement either. They never come out via API keys or packages; they are missing from the full export and are only stored encrypted in the backup. To be honest: whoever has the server itself and Ablago's key in their hands could technically decrypt them – like any password field in a folder.
    - You can remember at most 20 passwords.
    - This is **not a password manager**: Ablago only uses these passwords to open protected documents that you file. For your accounts on websites and apps, please use a password manager.
- **API keys** – with them, other programs can access Ablago in your name, for example a scanner. If you don't need this, you can skip this section. A key only delivers password fields if you tick **Read passwords** when creating it. Under **Permissions** you choose one of three levels:
    - **read only** – the program reads everything you may read and changes nothing.
    - **read and write** – the program reads and changes everything you may, e.g. a scanner that files post.
    - **counters only** – for home automation and displays, e.g. a lamp for new post or the number on the wall tablet. The key only retrieves your numbers: new post, To do and overdue deadlines. If it is lost, someone learns at most how much post and how many tasks you have – no titles, senders or contents. Ablago rejects everything else.

    How to connect, for example, a Homey Pro with it is described under [Connecting Ablago to home automation](hausautomatisierung.md); the [Administrator manual](https://help.ablago.app/admin/aktuell/en/api/#zaehler) describes the technology.
- <span id="papierkorb"></span>**Bin** – **Empty when signing out** deletes your deleted folders permanently as soon as you sign out. When the switch is off, they stay in the [Bin](ablage.md#papierkorb) for as long as the administrator has set.

!!! note "Signing in with your company account"
    If the sign-in page has a button like **Sign in with company account**, you sign in through it with the account of your company or your sign-in service. You then don't need your Ablago password; the provider manages password and sign-out. It sees when you sign in – it doesn't see your paperwork.

#### Passkeys {#passkeys}

With a **passkey** you sign in without a password: your phone or computer asks for your fingerprint, face or its PIN, and you are in. A passkey belongs to exactly this address of Ablago – a fake site that merely looks like it cannot use it. That makes it better protection than any password.

**Add a passkey**

1. Under **My account → Security**, at **Passkeys**, tap **Add a passkey**.
2. Give it a name you will recognise later – Ablago suggests the kind of device, e.g. "My iPhone".
3. Tap **Continue** and confirm on the device (fingerprint, face or PIN). With a security key, plug it in and touch it.

You can have **several** passkeys, for example one on your phone, one on your laptop and a security key as a spare. Many phones and password managers also copy a passkey to your other devices; the list then says *on several devices*.

**Sign in**

On the sign-in page, tap **Sign in with a passkey** and confirm on the device – without email address and password. Password (and the code from the app, if set up) still work; they are your fallback when the device is not at hand.

If you have set up [two-factor sign-in](#zwei-faktor-anmeldung), you can also **Confirm with a passkey** after the password instead of entering the code. If a passkey is required for your role, it is always needed after the password. Anyone who administers Ablago can also use the passkey instead of password and code to sign in again when [administering](#ablago-verwalten) and before sensitive actions.

**Rename and remove**

The list shows each passkey's name, when you added it and when you last used it. **Rename** changes the name. **Remove** takes effect immediately; if you signed in more than ten minutes ago, Ablago first asks again for your password (and code) or a passkey. The passkey stays stored on the device itself – delete it there in the settings.

**Lost a device?** Sign in with your password and remove that device's passkey. If you cannot get in at all, someone who administers Ablago resets your passkeys.

!!! note "Only over HTTPS"
    Passkeys only work when Ablago can be reached over **HTTPS** (for example `https://ablago.example.org`). If you open Ablago at an address without `https://`, the button is replaced by the notice "Passkeys work as soon as Ablago can be reached over HTTPS". If Ablago gets a new address (a different name), existing passkeys no longer fit: Ablago shows this in the list, you sign in with your password and add a new one.

#### Two-factor sign-in {#zwei-faktor-anmeldung}

With two-factor sign-in, Ablago asks after the password additionally for a six-digit code that an app on your phone generates anew every 30 seconds. Anyone who only knows your password can't get in then.

1. Under **My account → Security** (click your name at the top right), click **Set up**.
2. Scan the QR code in an authenticator app (e.g. Google Authenticator, Microsoft Authenticator, Aegis, 2FAS, Bitwarden or the Passwords app on the iPhone). If that doesn't work, type in the key below it.
3. Enter the code from the app and **Confirm**.
4. You receive **ten recovery codes**. Save or print them and keep them separate from your phone – they are only shown this one time.

From now on you sign in with password **and** code – or, if you have a [passkey](#passkeys), with the passkey alone. If your phone isn't at hand, click **Use recovery code** when signing in; each code only works once. When they run low, **New recovery codes** creates fresh ones (the old ones then no longer work). **Switch off** switches two-factor sign-in off again; you confirm both with your password, and before switching off Ablago also asks once more.

A link to reset the password also asks for the code afterwards. Lost your phone and no codes left? Then an administrator resets two-factor sign-in for your user.

!!! note "Required"
    An administrator can require it for your system role (administrator or member). Then you set it up after signing in before you can continue, and you can't switch it off yourself. A [passkey](#passkeys) fulfils the requirement as well: instead of the app you can add a passkey; it is then needed as a second step when signing in with a password. With a passkey you may switch off the code app again – but you can only remove the last passkey once there is a new one or the code app is set up.

### Appearance { #darstellung }

- **Design** – how Ablago looks for you. **Default** follows the design the administrator has set. Applies to your account on all devices.
- **Font size on this device** – small, normal or large. Only applies to the device you are sitting at; on your smartphone you can choose a different size than on your PC.
- <span id="startseite"></span>**Home page** – **Start with the home page** switches the [home page](startseite.md) on or off; without it you go directly to *To do* after signing in. **Fourth tile** chooses what appears next to To do, New post and Next date: your favourites or a view. **Tip of the day** switches the dot on the [assistant](assistent.md#tipps) for the [tip of the day](entdecken.md#tipps) on or off.
- <span id="geaenderte"></span>**Changed folders** – **Highlight changed favourites and own folders in lists** (default: on) puts a dot in front of the title until you open the folder. What's behind it is described under [Favourites as a subscription](ablage.md#favoriten-als-abo).
- **Appearance on this device** – every device remembers the width of the columns and collapsed areas. If something can no longer be found, **Restore default appearance** restores the original layout.
- **Developer mode** – shows at the bottom right how long a page request took.

![My account → Appearance](bilder/profil-darstellung.png){ loading=lazy }

### Notifications { #benachrichtigungen }

<span id="benachrichtigungen-und-ablage"></span>

- **Tasks** – folders with open [tasks](eingang.md) for you appear under "To do". In addition, Ablago sends you the **Daily summary** by email as long as you have some. **Daily summary of my tasks by email** unsubscribes or subscribes again. It contains folder titles and links, no documents, and goes via your Library's mail server. Below that you choose:
    - **Time** – in 15-minute steps; *Default* is the time the administrator has set.
    - **Weekdays** – default Monday to Friday. Without a weekday, no summary comes.
    - **Not on public holidays** – on public holidays of the region the administrator has chosen, none comes (default: on). Without a region, the tick is greyed out.

- **Favourites** – **Notify me of changes to my favourites** (default: on); highlighting changed folders is under [Appearance](#geaenderte). What's behind it is described under [Favourites as a subscription](ablage.md#favoriten-als-abo). If an administrator has switched off the notification for your role, a notice appears here instead of the first switch.

![My account → Notifications](bilder/profil-benachrichtigungen.png){ loading=lazy }

### Absence { #abwesenheit }

So that nothing is left lying during your holiday, you enter a **Stand-in** under **Absence**:

- Switch **Absent** on, choose a **Stand-in** (required), optionally **from** and **until** (each inclusive). Without a date, the absence applies until you switch it off; with "until" it ends by itself afterwards.
- While it is in effect, **new** tasks for you – assigned by hand, mentions and "doesn't fit" – go to your stand-in. The folder's history says "passed on because of absence". If your stand-in is absent too, it goes on to their stand-in.
- **Give all open tasks to ‹stand-in›** also hands over the existing ones. After your return they stay with the stand-in.
- If you switch the absence on and still have open tasks, a notice reminds you: new tasks go to the stand-in, the existing ones stay with you until you pass them on.
- Your stand-in gets a notice under "To do" ("You have been entered as stand-in for …"). Absent people don't get a daily summary.
- An administrator can also enter your absence for you, for instance in case of illness. Entering, changing and ending are recorded in the history of your user folder.

#### My open tasks { #meine-offenen-aufgaben }

You pass on all tasks currently with you under **To do → Pass on several tasks …** – individually, in groups or all at once:

- **Filter** by **kind**, **Folder type**, **due date** and a search in the title.
- **Individually:** below the task, choose a person under *pass on to*.
- **Several:** tick the boxes on the left or **Select all shown** (applies to those currently filtered). In the bar **Pass selected on to**, choose a person – your entered stand-in is already preselected.

Passing on only works to people who may read the respective folder; what doesn't work is then listed with a reason and stays selected. Every passing-on is recorded in the folder's history.

![Pass on several tasks](bilder/profil-abwesenheit-aufgaben.png){ loading=lazy }

## Report a problem { #fehler-melden }

If something doesn't work, choose **Report a problem** in the menu:

![Report a problem](bilder/fehler-melden.png)

1. Briefly describe what happened and what you would have expected.
2. If needed, add up to two **screenshots** (PNG, JPEG or WebP, each at most 10 MB) – also directly with Ctrl+V into the text field.
3. Under **View technical details** it says what is sent along: Ablago's version, browser and device, screen and window size, language and time zone, the pages visited last (up to 25) and the last errors in the browser (up to 10). Passwords, contents of folders and documents are not sent.
4. **Send report** (goes to everyone who administers Ablago) – or **Copy to clipboard**, to send it e.g. by e-mail.

Whoever administers Ablago sees your report in the workbench and gets in touch if there are questions.

## Administering Ablago { #ablago-verwalten }

If you may administer Ablago, you still work like everyone else day to day – with your normal permissions. For the workbench you deliberately switch into **administration mode**:

1. Menu under your name → **Administer Ablago**.
2. **Sign in again** (password, plus the code if you have set up two-factor sign-in). If you have only just signed in, this is skipped.
3. At the top there is now a **red bar**: "You are currently administering Ablago." As long as it is there, you see all folders in the Library, including locked ones – if you open one you would otherwise not be allowed to see, that is recorded in its history.

With **End administration** (in the bar or in the menu) you are back to everyday work. After 15 minutes without input, the mode ends by itself; what you are editing is kept – Ablago only asks for the sign-in again. On the same day, you can then continue with one click (**Administer again**). For particularly sensitive actions – such as downloading the emergency sheet – Ablago always asks for the password once more.

## Notice "… has worked in your name" { #in-deinem-namen }

To reproduce a problem, someone who administers Ablago can sign in as you. They then see exactly what you see – with your permissions, not in administration mode. Afterwards, Ablago shows you a notice at the top next time saying who did this and when. **Understood** hides it. While someone is working as you, the notice **someone is working in your name** appears for that sign-in under *My signed-in devices*.
