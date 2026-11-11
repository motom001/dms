# Deletion concept (template) {#loschkonzept-vorlage}

Anyone who manages data of tenants, customers or employees should record **how long which data stays, why, how it is locked until then and in which way it is deleted** – a deletion concept. It shows you yourself when what may go, and proves on enquiry that you take storage limitation (Art. 5(1)(e) GDPR) and the right to erasure (Art. 17) seriously.

Ablago **supports** this: folder types as data categories, the [archive mode](archiv.md) with a deletion lock until the end of the period and the list **Retention expired**, the [Bin](papierkorb.md) with retention, the retention of [backups](sicherung.md#zeitplan-und-aufbewahrung). How to set it up step by step is described under [Setting up a locking and deletion concept](datenschutz.md#sperr-und-loschkonzept-aufsetzen).

## Generating it from Ablago { #aus-dem-dms-erzeugen }

Instead of filling in the template by hand, you let Ablago generate a deletion concept: **Workbench → Users and security → Deletion concept → Generate as PDF** or **As Word file (.docx)** (administrators only). The structure is the same as in the template (sections 1–9), prefilled with what Ablago knows. The generated document is in German.

- **Section 2 "Data categories and periods"** from your folder types. The table lists every folder type that **concerns a person** (Workbench → Deletion concept → Personal data in folder types), that **links to one** (e.g. invoice → customer) or for which a **purpose** is stored. Per row: data subjects, purpose, period and reference date from the [archive mode](archiv.md), lock in Ablago (archive mode or none) and the deletion route ("Retention expired" → bin → permanently after … days). Folder types without personal reference are listed below in one line, so you can see whether one is missing.
- **Further sections** with your settings: controller, Ablago version, retention in the [Bin](papierkorb.md) and the history of deleted folders, retention of the automatic [backups](sicherung.md#zeitplan-und-aufbewahrung), access copies ready for retrieval, users are deactivated instead of deleted.
- **What Ablago can't know** – legal basis and reason for the period, those responsible, your own views for shorter periods – stays as a **[square bracket]**; highlighted yellow in the Word file.
- Ablago reports **gaps** in the workbench (the entry **Deletion concept** then carries a "!") under **Please complete** – **one** row per folder type with the reason and what is missing, e.g. "**Account** – contains personal data because it links to Person via "Holder". Missing: purpose · retention period." Next to it, **Enter purpose** (jumps to the purpose field under **Personal data in folder types**) and **Set period** (opens this folder type's [archive mode](archiv.md)) lead directly to the right place. Ablago takes the controller from the [own organisation](organisation.md).
- **Why a folder type is included** although you didn't tick it: it links via a link field to a folder type that concerns a person (Account → "Holder" → Person). Under **Personal data in folder types** it then says "contains personal data via "Holder" to Person · automatic". Folder types entirely without personal data are collapsed under **Further folder types (without personal data)**.
- **The deletion concept is complete** when all gaps are filled. But it doesn't have to be complete for you to generate it: if something is missing, the document contains a [placeholder] – without archive mode e.g. "[period]" –, which you can also fill in there by hand.
- The header contains **status and Ablago version**; the note "no legal advice" as in the template.
- **Section 8 "Proof"** refers to the [deletion log](datenschutz.md#loschprotokoll) with its retention.

![Workbench → Deletion concept with the gaps "Please complete" and the buttons for PDF and Word](bilder/werkbank-loeschkonzept.png)

Nothing from the folders themselves goes into the document – no titles, no field values, no documents. Generate the deletion concept anew when you change folder types or periods, and enter the change in section 9.

## The template {#die-vorlage}

If you'd rather fill it in by hand (or start without Ablago): the template describes in ready-made wording what Ablago does, and marks everything you add yourself with **[square brackets]**. It is written in German:

- [Word (.docx)](vorlagen/loeschkonzept.docx)
- [LibreOffice (.odt)](vorlagen/loeschkonzept.odt)
- [Markdown on GitHub](https://github.com/motom001/dms/blob/main/docs/handbuch/vorlagen/loeschkonzept.md)

It is structured into:

1. **General** – controller, who deletes, which version of Ablago
2. **Data categories and periods** – per folder type: data subjects, purpose, period, reason, reference date, lock in Ablago, deletion route
3. **Regular deletion** – "Retention expired", views for shorter periods, bin, history of deleted folders
4. **Locking on request** – archive mode, access via permissions, note on the folder
5. **Who may delete** – permissions, bin, administrators
6. **Copies outside the Library** – backups, exports, access copies, log, printouts
7. **User accounts** – deactivate instead of delete
8. **Proof** – recording deletions without the data itself: the [deletion log](datenschutz.md#loschprotokoll)
9. **Changes to the deletion concept**

## Good to know {#gut-zu-wissen}

- **No legal advice.** Which periods apply to you, you clarify with your tax adviser or your data protection officer. The periods in the template are examples.
- **When you need it:** as a rule, the self-employed, landlords and businesses need a deletion concept because they keep other people's data. In a purely private household it is a help for tidying up, not an obligation.
- **For households less is usually enough:** if you only file the family's paperwork, you don't need a written deletion concept. Archive mode for tradespeople's invoices (2 years, § 14b UStG) and a look at "Retention expired" once a year help anyway.
- **The column "Lock in Ablago"** knows two values today: *archive mode* (locked against deletion until the end of the period) and *none*. You restrict access to locked folders via a field and a rule in the [permissions](berechtigungen.md), see [Deletion on request](datenschutz.md#loschen-auf-verlangen).
- **It describes Ablago as it is today.** The template here is updated with every version; extend your deletion concept when you use new functions.

Next: [Data protection in Ablago](datenschutz.md) · [Archive mode](archiv.md) · [Bin](papierkorb.md) · [Procedure documentation (template)](verfahrensdokumentation.md)
