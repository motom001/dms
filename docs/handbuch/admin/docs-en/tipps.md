# Tips

**Tips** show in one sentence what else you can do in Ablago – as the tip of the day in the assistant and all together under [Discover Ablago](https://help.ablago.app/benutzer/aktuell/en/entdecken/). They come from Ablago, from packages and from you: here you adapt them to the way you work, write your own and switch individual ones off.

You find them under **Workbench → Build the Library → Tips**, next to the [tours](rundgaenge.md). The area is in the bar from the level **Household** (see [Customising the workbench](uebersicht.md#werkbank-anpassen)).

![Workbench → Tips: list and form](bilder/werkbank-tipps.png)

## The list

The middle shows **all** tips with their origin (Ablago, package, own), area and for whom. Adapted ones carry the note *adapted*, switched-off ones *switched off*. At the top you search in the text and filter by origin.

## The form

A click on a tip opens the form on the right – no code, no file:

- **Text:** at most 160 characters and two sentences; the counter shows how much is left.
- **Area:** the tip is listed under it on “Discover Ablago” (search, post, to-dos and deadlines, folders, my account, administration).
- **The sentence leads …** to a **place** in Ablago, into a **tour** or **to a page in the manual** (e.g. `benutzer/knoepfe/`; it opens in a new window). You choose places from a list with descriptions; with a folder type (below) its real fields and registers are added – the tip then opens the first folder of that type that the person may read. **Show target** opens Ablago in a new window, and a click on a highlighted place takes it over (as with [tours](rundgaenge.md#ziele)).
- **For whom:** everyone or administrators only; optionally only whoever may read a particular **folder type**.
- **Preview** shows the tip as it appears in the assistant; **Try it** opens the target in a new window like “Show me”.

Saving only works without errors; errors are shown at the field. If two administrators have the same tip open at the same time, neither overwrites the other.

## Adapting tips from Ablago and from packages { #anpassen }

You change tips from Ablago and from packages in the same form. The **adaptation is stored separately**, the original is kept and shown above it:

- An **update** of the package leaves your adaptation in place. If the package has changed the tip in the meantime, a note with a **comparison** (original then and now) appears at the top.
- **Reset to original** removes the adaptation at any time.
- Some tips from Ablago only appear when a feature is switched on (such as “Ask your Library”); that stays as it is.

## Switching on and off

The switch at the top of the tip applies **to everyone** and takes effect at once: a switched-off tip does not appear for anyone, not even under “Discover Ablago”. In addition, each person can hide individual tips with × or switch off the tip of the day altogether (user manual, [Discover Ablago](https://help.ablago.app/benutzer/aktuell/en/entdecken/)).

## Passing on and backing up

- **Create package** takes chosen own tips along as `inhalt/tipps.yaml`. If a tip starts an own tour, the tour must come along too. Adaptations of tips from other packages are not included (yet).
- Own tips, adaptations and what you switched on or off are stored in the database and therefore in every [backup](sicherung.md); the [full export](export.md) stores them as `struktur/entdecken.json`.
