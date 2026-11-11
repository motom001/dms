# To do and tasks {#zu-erledigen-und-aufgaben}

**To do** is the top view in the Library. It shows the folders where **you should do something** – each of them has an open **task** for you. The number next to it says how many there are.

At the top you switch between **List**, **Month** and **Year**: the list shows what needs to be done now; [Month and Year](#monat-und-jahr) show your dates in a calendar. There is no "coming up" preview – reminders of deadlines come into the list via [automations](https://help.ablago.app/admin/aktuell/en/automatisierungen/) exactly when it's time.

![To do with a task](bilder/eingang.png)

In the list, each folder shows what needs to be done. In the folder itself, at the top below the title, there is a yellow notice with the task: in front **Your task:** (or **Post for you:**, **You were mentioned:**, **Your reminder:**), on the right the buttons **Done** and **Pass on** – they belong to the task, not to the folder. What you can do with the whole folder is in the menu **Folder ▾** next to the title. For a mention in a note, the folder opens directly on the tab **Notes**; **To the note** in the notice jumps there.

## Where do tasks come from? {#woher-kommen-aufgaben}

| Kind | When | How is it completed? |
| --- | --- | --- |
| **Doesn't fit** | An administrator has changed the folder type – e.g. a new required field –, and your folder no longer fits it. | Add or correct the marked details and save. Then it completes itself. |
| **Mention** | Someone has mentioned you with **@** in a formatted text or a note. | Click **Done** in the notice. |
| **Assigned** | Someone has given you something to do via **Folder ▾ → Assign task**. | Click **Done** in the notice. |
| **Deadline** | A date in a folder is approaching, e.g. "Notice by 30.09.2027" – when and for whom is set by an automation. Next to it, it says how many days are left. | Click **Done**. If the date changes or is cleared, it completes itself. If the date repeats (e.g. yearly), Ablago suggests the next one: **Set date to …**. |
| **Reminder** | You or someone else has set a reminder for this folder via **Folder ▾ → Remind**, and the day has come. | Click **Done**. |
| **Stand-in** | Someone has entered you as their [Stand-in](profil.md#abwesenheit) for their absence. The task is on their user folder and names the period. | **Done** means "noted". If the absence changes or ends, it completes itself. |
| **Post for you** | Your name is under **To** on new [post](post.md). | Assign the post, complete it or pass it on. Then it completes itself. |
| **Access request** | A person has downloaded their access copy under Art. 15 GDPR (a copy of all data stored about them) via the retrieval link – or the link was blocked after too many wrong retrieval codes. You get this if you created the access copy or the person's folder is one of your [favourites](ablage.md#favoriten). | **Done** means "noted". Until then, no second message comes for the same link. |

With "Doesn't fit", Ablago doesn't delete or change anything by itself; the affected fields are marked in the folder, and the check happens on the next save.

### Tasks without a recipient {#aufgaben-ohne-empfanger}

If a task has no single recipient – such as post without **To** –, the administrators get it, plus one person the management has chosen for this. If that is you, such tasks appear under **To do** for you, and you complete them or pass them on like any other.

You may then also sometimes see the notice at the top **"Something needs attention for administration. Sign in as an administrator."** This concerns technical matters such as the backup. If you have the admin account, click **Sign in as administrator**. Otherwise let the person who administers Ablago know. The notice disappears as soon as everything is done.

## Assigning a task {#eine-aufgabe-vergeben}

To the right of a folder's title, next to the star, is the menu **Folder ▾**; in it, **Assign task**. Choose **for whom** it is and write **what needs to be done**. The folder then appears under "To do" for that user.

![Assign task](bilder/aufgabe-vergeben.png)

Tasks always go to a user, not to a role – so it is clear who takes care of it. If the recipient may not read the folder under the [permissions](mappen.md#was-du-sehen-und-andern-darfst), Ablago asks first: "Jonas may not see this folder. The task reaches Jonas, but the folder doesn't. The admin will be informed." With **Assign anyway** it goes out, with **Cancel** it doesn't. You can't give permissions here – the administrator does that.

If you see a **Folder you can't see** under "To do", you have a task on a folder you may not read. If someone gave it to you by hand, its text is shown. If it was created automatically, you only see "Task on a folder you may not see – ask Lena" and the due date – the same in the Daily summary. For a deadline the date is left out too, as it comes from the folder. When you open it, you can complete the task or pass it on to someone who may see the folder. If the administrator gives you read permission for the duration of the task, you can read the folder until the task is done or passed on.

## Remind { #erinnern }

Via **Folder ▾ → Remind** in a folder you have yourself – or someone else – reminded of the folder on a particular day, e.g. "on 15.11.: compare offers". Until then, the reminder appears at the top of the folder and in the [calendar](#monat-und-jahr); whoever created it and whoever receives it can change or delete it there. On the chosen day, the folder lands under "To do".

![Reminder on a folder](bilder/erinnerung.png)

## Month and year {#monat-und-jahr}

**Month** and **Year** show what's coming your way – like the calendar on your phone:

- your tasks with a date (including overdue ones),
- your reminders,
- the dates of **deadlines** on all folders you may read – e.g. "Notice by" or "MOT due",
- the public holidays of the [region](https://help.ablago.app/admin/aktuell/en/region/).

With **Favourites only** you only see the dates of your [favourites](ablage.md#favoriten). A click on an entry opens the folder; completing works as usual in the folder or in the list. The calendar only displays – moving dates or free dates without a folder deliberately don't exist here. Ablago remembers your choice; **Today** jumps back to today.

### Month {#monat}

The month shows the weeks from Monday to Sunday, with today highlighted. Public holidays are shown small on the day. Each entry is a short line with an icon and the folder's title; when you hover over it, you see the full text. If there are more than three entries on a day, **+2 more** shows the whole day's list below; a click on the day's number does the same. With the arrows next to the month or the arrow keys you page through.

Overdue entries appear in red on their day and additionally at the top as **"1 overdue"** – so they don't get lost if their day is in an earlier month. A click on it shows them as a list.

**Recurring deadlines** (e.g. contracts that can be cancelled yearly) also appear with their next dates, somewhat lighter and dashed: they are calculated and not yet entered in the folder.

![To do as a month](bilder/anstehend-monat.png)

Month and year use the full width next to the views. When you open an entry, the folder appears on the right and the month moves compactly into the middle: days with entries carry a dot, below them are the entries of the chosen day.

![Month with an open folder](bilder/anstehend-monat-mappe.png)

### Year {#jahr}

The year shows twelve small months. Days with entries are bold and carry a dot (lighter if only calculated dates of recurring deadlines are there, red for overdue ones); the number appears when you hover over it. A click on a day or a month opens the month view.

![To do as a year](bilder/anstehend-jahr.png)

### On the phone {#am-handy}

On the phone there are **List** and **Month**. The month is compact like the phone's calendar: one dot per entry, below them the entries of the day tapped. Swiping left or right pages through the month. The year view only exists on a larger screen.

![Month on the phone](bilder/anstehend-handy.png)

A subscription for your calendar (e.g. on your phone) doesn't exist yet.

<span id="anstehend"></span>Part of this used to be called **Coming up**; old bookmarks now lead to the month.

## Pass on {#weitergeben}

If a task suits someone else better, click **Pass on** in the notice, choose the user and confirm with **Pass on** (**Esc** cancels). The folder then appears under "To do" for them; the [history](zusammenarbeit.md#historie) records who passed it to whom and when.

<span id="mehrere-weitergeben"></span>Before your holiday, you pass on several tasks at once: in the list **To do**, **Pass on several tasks …** leads to all your open tasks – with a filter and selection, e.g. three to Lena, four to Jonas and the rest to your stand-in.

## When someone is absent {#wenn-jemand-abwesend-ist}

If someone has entered an [absence](profil.md#abwesenheit), it is shown in the selection when assigning and passing on and in the @ suggestions, e.g. "Lena – absent until 15.11., covered by Jonas". New tasks for absent people automatically go to their stand-in; the folder's history says "passed on because of absence of …".

## Daily summary {#tagliche-zusammenfassung}

If you have open tasks, Ablago sends you the **Daily summary**: an email with the list and links to the folders – no email for every single task. The usual time is **on working days at 7 am**; you set the time and weekdays in your [profile under Notifications](profil.md#benachrichtigungen), where you can also unsubscribe. The email contains the titles of your folders and links to them and goes via the mail server your administrator has set up – the documents themselves are not included.
