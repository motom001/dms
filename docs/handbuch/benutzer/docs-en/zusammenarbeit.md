# Notes, mentions, history {#notizen-erwahnungen-historie}

## Notes {#notizen}

Notes are short, formatted texts on a folder – "Called Mr Özdemir, he's coming on Friday". They don't belong to any field and don't need a folder type that provides for them.

![Notes on a folder](bilder/notizen.png)

- Every folder has its own tab **Notes** for them, directly before the **History**; the number next to it says how many there are. If someone mentions you in a note, the folder opens right there.
- Every note shows who wrote it when and who last changed it.
- **Everyone** may change and delete notes – like slips of paper in a shared folder. The [history](#historie) keeps visible what happened.
- With the tick **Notes** next to the search field, the search also searches the notes.
- You can also mention someone with **@** in notes.

## Mentions {#erwahnungen}

In formatted texts and notes you mention a user with **@** – or any other folder, such as a contract or a person: type **@** and the first letters (or choose **@ Mention** in the toolbar), and the suggestions appear right where you are writing; choose with ↑/↓, accept with Enter or Tab, Esc closes. The user gets a [task](eingang.md), and the folder appears under "To do" for them until they complete it.

- If you save the text again, no second task is created.
- If you remove the mention again, the task stays open; the history records that it was removed.
- If you mention yourself, you don't get a task.
- If you aren't allowed to see a mentioned user, it says **@User (not visible)** – without the name and without a link. **Deleted user**, or the greyed-out name with the note "This user no longer exists", only appears if the user really no longer exists.
- If you open a mentioned user, the list next to it is **All folders: User** – the list of the folder type, not a view.

### Mentioning folders { #mappen-erwahnen }

![Choice after @: folder type before the title](bilder/erwaehnen-auswahl.png){ loading=lazy }

A mention is a reference to a folder; a user is just the special case with a person and an account behind it. That's why the same **@** also mentions contracts, persons, organisations and any other folder you may read.

- **Choice:** each suggestion names the folder type first, then the title – "Person · Dr. Bernd Beispiel", "Organisation · Dr. Bernd Beispiel", "User · Lena". If two folders have the same type and title, the first column of the results list (e.g. the town) appears quietly below. Users come first, then your favourites and recently opened folders, then the rest. Only folders you may read appear.
- **Display:** the text always shows the **current** title – if the folder is renamed, the mention changes with it. Hovering shows the folder type; a click opens the folder. If you may not read it, it says **@folder (not visible)** without a title; if it no longer exists, **@deleted folder**.
- **Who hears about it:** a mentioned user gets a task as before. For any other folder, everyone who has it as a [favourite](ablage.md#favoriten-als-abo) hears about it – depending on their setting under My account → [Notifications](profil.md#benachrichtigungen) right away, in the daily summary or never. Only new mentions count, not every save, and only people who may read **both** folders. Person folders aren't users: `@Dr. Bernd Beispiel` only reaches those who have him as a favourite.
- **In the mentioned folder:** the **Notes** tab shows a quiet notice at the top, e.g. "Mentioned in a note at Dr. Bernd Beispiel, 05/11/2026" with a link – not a real note. It disappears when the mention is removed and only shows places in folders you may read.
- Only **which** folder is meant is saved, not its title. Ablago fills in the title only when showing it – for each person according to their permissions. While you write, the text shows the current titles.
- Exports, PDFs and letters from templates show the current title as text – or **@folder (not visible)** if the person exporting may not read the folder. The history, data subject access requests and the full export show only **@mention** instead of the title (the full export with the folder's ID).

## History {#historie}

If the folder type has a tab **History**, it shows the story of the folder, newest first:

- created and changed – expanded with every changed field, **before** and **after**,
- documents uploaded and deleted,
- put in the bin and restored,
- notes, tasks and mentions, passed-on tasks,
- Emails sent – with a link to the email,
- who displayed a password (never the password itself; changed passwords only appear as "changed"),
- for a folder created from a post, also the whole story of the post – marked *from post* – and the entry "Created from post “…”" ([more](post.md#post-auflosen)).

![History of a folder](bilder/protokoll.png)

Entries with a **▸** in front can be expanded; at the end it says what's behind them (e.g. "3 fields", "before/after", "2 attachments"). **Expand all entries** opens all at once. Names lead to the user's folder.

**Retrievals:** Ablago also records who **downloaded** a file and when – in the interface (with and without a stamp, also as an export), with an **API key** or via the [drive](laufwerk.md) – with the route, the file and the version (original, older version, archive version …). Viewing in the browser doesn't count. If the same person retrieves the same file the same way several times on the same day – Explorer and Office often read a file many times – it appears once; a retrieval on a later day gets its own entry.

**What the tab shows** is set by the administrator on the folder type. Without a setting the history shows everything except retrievals; some folder types have their own tab for them, e.g. *Retrievals*. With **Show everything** at the top you still see all entries of the folder. Everything is always recorded.

The history only loads when you open the tab and shows the newest 100 entries; **Load more** fetches the next ones.

Entries cannot be changed or deleted. The history begins with version 0.12; older changes are not recorded, and entries before version 0.12.1 partly have fewer details.
