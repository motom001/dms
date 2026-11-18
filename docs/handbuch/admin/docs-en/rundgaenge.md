# Tours

A **tour** shows places on the real interface step by step – Ablago's own one the first time someone signs in, tours from packages (such as “Contracts at a glance”) and your own, which you write here. Everyone finds the tours they may use under [Discover Ablago](https://help.ablago.app/benutzer/aktuell/en/entdecken/).

You find them under **Workbench → Build the Library → Tours**. The area is in the bar from the level **Business** (see [Customising the workbench](uebersicht.md#werkbank-anpassen)); at smaller levels you show it via “Customise workbench”. If you have already written your own tours or switched off an included one, it stays shown after the update. The tours themselves work at every level – this is only about the area in the workbench. Whoever administers the area may edit.

![Workbench → Tours: list and editor](bilder/werkbank-rundgaenge.png)

## The list

The middle shows **all** tours: from Ablago, from packages and your own – with their origin, when they start (*the first time you sign in*, *offered after installing*, *by hand* …), whom they are for and how many steps they have. At the top you search in title, description and package and filter by origin. Switched-off tours are shown paler with the note *switched off*.

## Switching on and off

The switch is at the top right of the selected tour. It applies **to everyone** and takes effect at once: a switched-off tour is no longer under “Discover Ablago” for anyone, is not offered as a tip and does not start by itself – Ablago's own first-sign-in tour included. This is how you switch off the tours of a package, for example.

## Viewing tours from Ablago and from packages

A click shows the tour's file (with the texts in your language). You cannot change it; **Copy as own** creates a copy to edit. **Try it** starts the tour in a new window, only for you.

## Writing your own tours { #schreiben }

**+ New tour** opens a template. A tour is a small file in YAML format – exactly the format in which Ablago and the packages bring their tours ([developer manual](https://help.ablago.app/entwickler/aktuell/en/aufbau/#paket-rundgaenge)). You write the texts directly into it:

```yaml
schluessel: urlaub_beantragen
titel: Request leave
beschreibung: Where leave requests are and how to create one.
fuer: lesen
oeffne:
  neu: { typ: urlaubsantrag }      # empty form – nothing is saved
ersatz: You may not create this folder type. Ask the person who administers Ablago for you.
schritte:
  - schluessel: zeitraum
    ziel: mappe.feld:zeitraum
    ort: On the right of the form
    titel: Period
    text: Enter here from when to when you are off.
```

- At most **8 steps**, titles up to 60, texts up to 200 characters. Texts are plain text – Ablago does not show HTML or formatting.
- Every `ziel` needs `ort`: a sentence for screen readers saying where the place is.
- Your own tours **never start by themselves**. Whoever may see them finds them under “Discover Ablago”; you can offer them as a tip under [Tips](tipps.md).

### Finding targets { #ziele }

Targets are fixed **anchor points** – no names to learn by heart:

- **Next to the file** you see all anchor points with a short description, below them the real **fields and registers** of a folder type you choose, and the **Workbench areas**. A click inserts the anchor at the cursor.
- **Show target** opens Ablago in a new window in selection mode: places with an anchor point are highlighted when you hover over them, a click inserts their anchor into the file. Places without an anchor cannot be chosen (a click there works as usual, so you can open a folder, for example). **Esc** cancels. With the keyboard: Tab to a place, Enter chooses it.

### Check, try, save

- **Check** checks the file as when installing a package and names every error with its **line** and cause – unknown field, unknown anchor, a field or register the folder type does not have, texts that are too long, more than 8 steps. A click on the line moves the cursor there.
- **Try it** starts the tour in a new window, only for you – even unsaved. Nothing changes for others.
- **Save** only works without errors. If two administrators have the same tour open at the same time, neither overwrites the other: whoever saves second gets a note and sees the new state with **Discard**.

If something an own tour points to disappears later (such as a folder type), it is marked red in the list and does not apply until you repair it.

## Passing on and backing up

- **Create package** takes chosen own tours along as `inhalt/rundgaenge.yaml`. Folder types that go into the package become its own; folder types from installed packages become a dependency.
- Your own tours and what you switched on or off are stored in the database and therefore in every [backup](sicherung.md); the [full export](export.md) stores them as `struktur/entdecken.json`.
