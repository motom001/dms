# Permissions {#berechtigungen}

With permissions you decide per folder type **who may create, read, edit and delete which folders and see whose passwords**. You maintain them on the **folder type** itself, in the section **Permissions** after the tabs and [archive mode](archiv.md), and save them with **Save folder type**. Directly below it you check them in the [test run](#testlauf); what a user sees overall is shown by [user management](benutzer.md#was-sieht-ein-benutzer).

![Permissions on the folder type Contract](bilder/werkbank-berechtigungen.png)

!!! info "The rules don't apply to administrators"
    An administrator always sees and may do everything in the Library. That's why a red notice is shown at the top for them, and they get no API keys: for daily work and for programs you create normal users and give them, via roles and rules, exactly the permissions they need.

## The five permissions {#die-funf-rechte}

| Letter | Permission | What it allows |
|---|---|---|
| **C** | Create | creating new folders of this folder type |
| **R** | Read | seeing and opening the folder in lists, search, counters and links, viewing documents in Ablago; writing notes, assigning tasks |
| **U** | Edit | changing fields, uploading and removing documents |
| **D** | Delete | putting the folder in the bin |
| **P** | See passwords | displaying the plain text of password fields (the "eye") |

- **Taking along needs E:** downloading, sharing, sending by email, exporting and the [WebDAV drive](webdav.md) require, besides reading, the permission **E** (export), which you give on the [views](sichten.md#berechtigungen). In short: **R means viewing, E means taking along.** Saving while viewing can never be prevented entirely (browser, screenshot) – E just doesn't make it easy.
- **Without reading, nothing works except creating.** Whoever may not read a folder may not edit, delete it or see its passwords either – no matter what the rules otherwise say.
- **System rules** apply to everyone, including administrators, and can't be changed: user folders only come about and disappear via user management (no C, no D). In the default row these permissions are therefore locked. For *Post*, C governs who may create new post via **+ Post** or the interface; Ablago always creates sent e-mails.
- **System fields** of users (system role, roles, active) still only change in user management and in one's own profile.
- **Archive mode:** if it is switched on on the folder type, folders and documents can't be deleted until the end of their retention period – not even with the permission **D** and not even by administrators. See [Archive mode](archiv.md).
- Every user always sees **their own bin** and can restore from it – even if they may no longer see the folder afterwards according to the rules. They then get a notice.

## Default {#standard}

Above the rules is the row **Default** with the five permissions **C R U D P**. It applies as long as no rule says otherwise; a click switches a permission between **✓** (granted) and **✗** (withdrawn).

- **✓ C R U D P** – everyone may do everything; rules *restrict*. Every new folder type starts like this.
- **✗ C R U D P** – nobody may do anything; rules *unlock*. This suits confidential folder types such as payslips.
- Mixed too, e.g. **✓ R U P, ✗ C D**: everyone may read and edit, create and delete only whoever a rule allows.

!!! note "Previously: ticks on the folder type"
    Up to version 0.31 the folder type had the ticks *Allow new folders* and *Allow deleting*. On the update they were taken over into the permissions: if a tick was off, the default says **✗ C** or **✗ D**, and rules no longer grant this permission. Nobody gets more permissions than before as a result.

## Rules {#regeln}

A rule means: **if** all conditions apply, **then** set these permissions.

- Per permission there are three positions: **✓** grant, **✗** withdraw, **–** leave unchanged. A click on the button moves on.
- The rules are checked **from top to bottom**. Every applying rule sets its ✓ and ✗ – a later rule can therefore overwrite what an earlier one set.
- **Stop**: if the rule applies, the following rules are no longer checked. That way you put exceptions at the beginning, e.g. "Accounting may do everything" with Stop.
- Every rule can be **collapsed**; collapsed, it shows name, permissions and conditions in one line. New rules are open.
- You change the order by **dragging the handle** ⠿ or with **Alt+↑/↓**.
- A rule needs a name, at least one condition and must have an effect (a permission or Stop).

### Conditions {#bedingungen}

| Condition | applies if … |
|---|---|
| **User has role** | the signed-in user has one of the chosen roles (including the system roles *Administrator* and *Member*) |
| **User is** | the signed-in user is one of the chosen users |
| **Field of the folder** | a field of the folder meets the condition – exactly as in [views](sichten.md#bedingungen), e.g. "Responsible points to current user", "Responsible role points to roles of the current user", "Private is yes" or "Created by is current user" |
| **Open task for the user** | the folder has an open task for the signed-in user |
| **Folder is the user's own** | (only on the folder type *User*) the folder is the signed-in user's user folder |

Every condition can be reversed with **not**. Several conditions of one rule must **all** apply; for "or" you create two rules.

#### Points to a folder of type … { #zeigt-auf-mappe-vom-typ }

For a link field with [several target types](mappentypen.md#mehrere-zieltypen), **Field of the folder** also has **points to a folder of type …**, e.g. "*concerns* points to a folder of type vehicle". This condition stays **closed when in doubt**: if the field points to a folder whose type the person may not see, the rule counts as **not met if it grants permissions** and as **met if it withdraws them** – also with **not**. That way permissions give nothing away the person may not see, and open nothing up through a type they don't know. They may see a type if the rules let them read any folders of it at all (reading granted through such a condition doesn't count here). The [test run](#testlauf) works out the same.

!!! tip "Permissions that depend on the content"
    If someone changes a field that their permissions depend on (for instance "Responsible"), Ablago asks before saving if they would thereby withdraw their own reading or editing.

### Copying a rule into other folder types {#regel-in-andere-mappentypen-kopieren}

With **Copy into other folder types …** on a saved rule you take it over into further folder types (with unsaved changes, save first); it lands at the end there. Conditions on fields that don't exist in the target type are dropped – Ablago says how many.

### Saving {#speichern}

The rules are saved with **Save folder type**, together with fields, tabs and result lists. A rule may therefore also use a field you create anew in the same go. If a rule doesn't fit (e.g. on a field you are removing), Ablago saves nothing and names the rule.

On saving, Ablago also checks whether afterwards **nobody could read** folders of this folder type any more (except administrators), and asks in that case. Every change is in the [log](fehlersuche.md) with the complete list of rules.

## System accounts and packages {#systemkonten-und-pakete}

Automations run under the system account *Automation*, packages with code under their service account (see [System accounts](benutzer.md#systemkonten)). For them there are the system roles **System account** and **Package**, which you choose in the condition *User has role*.

- For these accounts **only rules that name their role** count. The default above doesn't apply to them – otherwise a strict default for members would also lock out every automation.
- Without such rules, the system account may do everything except see passwords; a package may do what was confirmed when it was installed.
- A rule for *Package* can only restrict, never grant beyond the confirmed permissions.

Example: on the folder type *Health*, a rule "If user has role *System account* → withdraw C R U D P". Afterwards no automation reads or changes health folders any more.

In the **test run**, the system accounts are a collapsed group above the selection of users, with number and composition in the header – as under [Workbench → Users](benutzer.md#systemkonten). Expanded, you choose the system account or a package there.

## Packages on the folder type {#pakete-am-mappentyp}

Below the test run is the section **Packages**. It shows every installed package with code that may read folders of this folder type according to its confirmed permissions – with the addition whether it only reads them or also changes them and whether it gets [events about them](pakete.md#ereignis-mappe). If you remove the tick **may see this folder type** for a package, it no longer sees the folder type at all: it reads and changes no such folders and gets no events about them. This takes effect **immediately**, without *Save folder type*, and is in the log. If you set the tick again, what was confirmed at installation applies again.

Example: a contract management package wants to know when something happens with a contract partner – for instance when it is blocked – and therefore also reads organisations. A package *Heating installation* needs neither contracts nor contract partners: on the folder type *Contract* and on the folder type *Organisation* you remove its tick.

Finer – only individual folders of a type – works with a rule for the role **Package** (see above). A package only gets events about a folder if it may read exactly this folder right now.

## Test run {#testlauf}

Below the rules is the **test run**: which permissions would a certain user have on a certain folder? You choose **user** and **test folder** just as in a link field of a folder: type part of the name or title and click a hit; with **Change** you choose anew. If an administrator is chosen, it says so right next to it – the rules don't apply to them. As soon as both are chosen, the result appears by itself. The table shows step by step which rule applied, what it set and what the state was afterwards.

The test run uses the rules **as they currently are in the editor** – including unsaved ones. That way you try out a change before you click *Save folder type*. The result always belongs exactly to user, test folder and rules as currently chosen: if you change user or test folder, it is checked again immediately; if you change a rule, the old result disappears, and you check again with **Check**. The test run exists as soon as the folder type is saved; you can only check once there are folders of this folder type.

**Checking accounts without a person:** below the field *User*, under **or an account without a person**, you also choose the system account **Automation** or a **package's** user (shown as "Package: name"). That way you see whether an automation or a package may do anything at all on a folder – for instance when a rule "System and package roles forbidden" applies. For these accounts the folder type's default doesn't apply, only rules that name their role **System account** or **Package**; the system account never sees passwords, and a package may never do more than what you confirmed at its installation. If a package has confirmed no access at all for this folder type, that is shown above the result. In all other selections (link fields, recipients …) these accounts don't turn up.

**Temporary read permission:** if the person has a [read permission for the duration of a task](aufgaben.md#aufgaben-bei-personen-ohne-leserecht) on this folder, it is shown below the result with its reason (the task), since when and by whom. It only allows reading.

![Test run: Jonas on "Electricity contract house"](bilder/werkbank-berechtigungen-testlauf.png)

What a user may read across all folder types is shown by [What does a user see?](benutzer.md#was-sieht-ein-benutzer) in user management.

## Permissions on views {#berechtigungen-an-ansichten}

Who sees a **view** in the tree, gets "+ New" there and may export from it, you govern on the view itself – with inheritance to its subviews. That is described under [Views → Permissions](sichten.md#berechtigungen). Whether a folder can be read is still decided solely by the folder type.

## What users notice {#was-benutzer-davon-merken}

- Folders without read permission are missing in lists, search, counters, favourites and result lists. If a visible folder links to an invisible one, it says "Folder not visible" there without a link.
- If someone has a **task** on a folder they may not read, it still appears for them under "To do" – without a title; for automatically created tasks also without text, only with a notice and due date (for deadlines without the date). They can complete it or pass it on to someone who may see the folder. Whoever assigns a task is asked beforehand if the recipient may not read the folder. Where this happens and how you give a **temporary read permission** is described under [Tasks with people without read permission](aufgaben.md#aufgaben-bei-personen-ohne-leserecht).
- Without **Edit**, the folder only displays its fields; without **Delete**, "Delete folder" is locked (padlock), the reason is shown next to it, "Why is deleting locked?" explains more; without **Create**, "+ New" is missing.
- Without **Export** (E on a view), a folder's documents can only be viewed: instead of "Download" there is a locked button with **Why not?**; sharing, copies with a stamp, "Send by email" and "Export as PDF" are missing. Via the API, Ablago answers with 403.
- When choosing users (responsible, mentions, stand-in, task recipient), only users whose user folder you may see appear.
- Under My account, **My permissions** shows per folder type what you may do: yes, no or "depends on the folder" – the rules themselves stay hidden.

## Examples {#beispiele}

### Confidential folders only for those responsible {#vertrauliche-mappen-nur-fur-verantwortliche}

Folder type *Salary*, default **✗ C R U D P**:

1. **Those responsible** – if *Responsible points to current user* → ✓ R U D P

### One role may do everything, everyone else only read {#eine-rolle-darf-alles-alle-anderen-nur-lesen}

Folder type *Invoice*, default **✓ C R U D P**:

1. **Accounting may do everything** – if *User has role Accounting* → ✓ C R U D P, **Stop**
2. **Everyone else read only** – if *User doesn't have role Accounting* → ✗ C U D P

### Interns don't see passwords {#praktikanten-sehen-keine-passworter}

On every folder type with password fields (create once, then **copy**):

1. **No passwords for interns** – if *User has role Intern* → ✗ P

### Example: a program that only sees invoices {#beispiel-ein-programm-das-nur-rechnungen-sieht}

A program (for instance an ERP system) is to create invoices via the [interface](api.md) and set the person handling them – but see nothing else.

1. Create a role **ERP** and a user **ERP interface** with this role; create an [API key](api.md#api-schlussel) for it.
2. Folder type *Invoice*: rule **ERP creates invoices** – if *User has role ERP* → ✓ C R U.
3. Folder type *User*: rule **ERP only sees accounting** – if *User has role ERP* and *not: Roles points to Accounting* (the field of the user folder) → ✗ R. That way the program can only enter members of accounting as "Responsible".
4. All other folder types: rule **ERP sees nothing** – if *User has role ERP* → ✗ C R U D P (create once, then copy into the other folder types).
5. With [What does a user see?](benutzer.md#was-sieht-ein-benutzer) on the user *ERP interface* you check the result.
