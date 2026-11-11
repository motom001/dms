# Home page {#startseite}

After signing in, the Library opens with the **home page**. It shows at a glance where to start – a few tiles, each with **one** number and **one** click behind it. You can reach it at any time via **Start** at the very top left of the Library or via the logo.

The home page uses the full width next to the views: on a large screen the tiles are side by side, on a smaller one in several rows.

![Home page](bilder/startseite.png)

## Find quickly {#schnell-finden}

At the very top of the home page there is **one box**. On the right next to it, **Advanced search** leads to the [advanced search](ablage.md#erweiterte-suche) – for questions such as "all invoices that have not been paid yet".

Without "Ask your library" the box is a **search field**: "Search – name, number, registration …". With "Ask your library" you switch between the two with **Ask · Search** above it ([see below](#fragen-oder-suchen)). The search searches as you type (from two characters) across **all folders you may read** – you don't need to know which view something is in. It searches titles and field values as the search in the views does; with **also in documents** additionally the full text (takes a little longer).

The hits are grouped by folder type, with folders that have the search term in the title first. Below each hit it says **why it matches**, with the term highlighted – for example "Contract number: KV-123456". A tap opens the folder. More than 60 hits: search more precisely or use the [advanced search](ablage.md#erweiterte-suche).

With **also in documents** and a package such as **AI local – similarity**, **"Similar hits"** additionally appear below the hits: folders in which your search term doesn't occur but whose document matches it – "invoice for the heating" thus also finds "gas boiler maintenance". They carry the label **similar**; below it is the matching document. More under [Similar documents](dokumente.md#aehnliche-dokumente).

On the phone you can also **dictate** (the keyboard's microphone). If you type an **archive number** and then Enter or "Search", you jump directly to the document – as in the views. If you empty the field (with **×** or Esc), the tiles appear again.

## Ask your Library { #frag-deine-ablage }

If your administrator has set up a package such as **AI assistant**, the box at the top is **"Ask your library"** at first. Here you ask a question in your own words – for example "When does the car insurance run out?" – and get an answer below it with links to the matching folders. Without such a package there is only the search.

### Ask or search { #fragen-oder-suchen }

Above the box is the toggle **Ask · Search** – on the phone above the box as well:

- **Ask** – the box is "Ask your library".
- **Search** – the box is the search with **also in documents**, as described [above](#schnell-finden).
- **Advanced search** next to it on the right is there in both cases.

![Home page with “Ask · Search” above the box](bilder/startseite-fragen.png)

What you have typed stays when you switch – if you started a question and would rather search, just click **Search**. Ablago remembers what you chose last, on your other devices too; the first time it is **Ask**.

With the keyboard: Tab goes to the chosen side of the toggle, the arrow keys switch, Tab moves on into the box. A screen reader says "Ask or search" and which side is chosen; the box is called "Ask your library" or "Search all folders" accordingly. If you switch with the mouse or your finger, you stay in the box.

### Asking a question {#eine-frage-stellen}

- **Ask:** type your question, then **Ask** or Enter (new line with Shift + Enter). The answer appears as it is written; **Cancel** stops it.
- **Sources:** below the answer are the folders it comes from, as links. The numbers in square brackets, e.g. "[2]", point to the passages below.
- **"Sent to the AI: n excerpts from m folders":** expanded, you see exactly the passages that went to the AI service – never more than that, never your whole Library. Only folders that **you** may read are searched; passwords are never included.
- **"… 6 of 9 excerpts (shortened)":** the AI service can only read a certain amount of text at once. If it was too much, the package shortened it – expanded, you then only see the passages that really went there. In long chats it may also leave out older questions and answers; that is then noted below the answer. If something is missing from the answer, a **New chat** often helps.
- **Follow-up questions:** you can keep asking in the same chat ("And when is the notice period?"). For every question, Ablago looks for new passages. **New chat** starts from the beginning.
- **Nothing is saved.** The chat only stays in this browser window and is gone on reloading. Ablago's log only records *that* a question was asked – not what. For the cost overview Ablago only keeps, per question, who asked when, how long it took and how many tokens the AI service reported – again without question and answer.
- **"AI features paused until …":** your administrator has set a monthly budget for the AI service, and it has been used up. From the date shown it works again – or as soon as your administrator raises the budget.

The answer is written by an AI service. It can be wrong or fail to find something – check important things in the sources. The answer is only text: it doesn't change anything in your Library. The excerpts go to the AI service your administrator has set up – either a computer on your home network, then everything stays with you, or a provider. Which one it is your administrator sees under Workbench → Packages at the package's service address.

## Tip of the day {#tipp-des-tages}

Below the box there is now and then a quiet line with a tip – at most one a day. The sentence is the link; the small × hides the tip. More under [Discover Ablago](entdecken.md#tipps).

## The tiles {#die-kacheln}

| Tile | Number | A click opens |
| --- | --- | --- |
| **To do** | open tasks and folders where you should do something | [To do](eingang.md) |
| **New post** | post that nobody has assigned yet | the view *New post* ([Post](post.md)) |
| **Next date** | date and folder of the next date (your tasks with a date, reminders, deadlines on folders you may read); below it, how much is overdue | the [month in To do](eingang.md#monat-und-jahr) |
| **Favourites** or a **view of your choice** | your favourites or the folders of the view | the favourites or the view |

If a tile is empty, a green tick appears instead of a zero, e.g. "✓ Nothing to do". *To do* is highlighted as long as there is something to do. All numbers only count what you may see.

**The numbers update by themselves.** If you leave the home page open, it fetches new numbers, dates and recently opened folders as soon as something has changed in the Library – you don't need to reload the page. The same goes for the numbers next to *New post* and *To do* on the left. Changes by others appear after a few seconds (at most about half a minute), your own straight away. Ablago only asks while the tab is visible; this does not count as activity. The values change quietly in place, without announcements for screen readers; the list of recently opened folders does not reorder while the mouse pointer or the focus is on it.

Below them are the **recently opened** folders – the last five you opened and may still see. A click opens the folder on the right; the home page then moves to the middle like any list, so you can switch between the recently opened folders. **Start** on the left shows it at full width again. On the phone the tiles are listed one below the other, each a row with the number on the right. Above them, on the phone, is the large button **Photograph post** – it opens the camera directly ([Capturing post with your phone](post.md#post-erfassen-am-handy)).

![Home page with an open folder](bilder/startseite-mappe.png)

## Recently opened { #zuletzt-geoeffnet }

A click on the heading **Recently opened ›** or on **Show all recently opened ›** below it opens the list of the **last 25** folders – the newest at the top, each with folder type and time, e.g. “Contract · opened today, 10:30”. A click opens the folder on the right; **← Start** takes you back to the home page.

- **Creating and changing count as opening.** A folder you have just created or changed – also via “Assign” or a new document – is at the top afterwards, even if you did not open it yourself. Changes by others do not move your list.
- **The list is yours alone.** It only shows folders you may still read; folders in the Bin are left out.
- There is no entry of its own on the left under the views – the way there is via the home page.

## When the Library is still empty {#wenn-die-ablage-noch-leer-ist}

In a new Ablago there is nothing to count yet. Then the home page shows three starting points:

- **File your first post** – choose a file or take a photo with your phone; it becomes [post](post.md).
- **Install the Household package** – for administrators only: ready-made folder types for accounts, contracts, insurance policies and more. For the self-employed and small businesses there are further packages in the [package catalogue](https://catalog.ablago.app/).
- **Help: how to get started** – the [First steps](erste-schritte.md).

## Settings {#einstellen}

Under [My account](profil.md#startseite) in **Appearance → Home page**:

- **Start with the home page** – switched off, you go directly to *To do* after signing in, and *Start* disappears from the list of views.
- **Fourth tile** – *Favourites* (default) or a view, e.g. *Contracts* or *Notice within the next 3 months*.
