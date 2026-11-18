# Designs

A **design** determines the colours of the interface. You maintain the designs under **Workbench → Designs**; every user chooses theirs under My account. One is the **default** design for everyone who hasn't chosen anything else.

--8<-- "ausgeblendet-organisation.md"

![Designs in the workbench](bilder/werkbank-designs.png)

## Built-in designs {#mitgelieferte-designs}

*Automatic* (follows the device's light or dark setting), *Light*, *Dark* and *Contrast* (for poor eyesight, with particularly strong contrast).

## Your own design {#eigenes-design}

1. **+ Theme**
2. Choose a **basis** (automatic, light, dark, high contrast).
3. Set the **primary** and **secondary colour**.
4. The preview shows immediately what buttons, lists and notices look like.

Ablago derives all other colours from these two. If a colour is hard to read on the background, it lightens or darkens it until the contrast is sufficient (WCAG 4.5:1, 7:1 for the contrast design).

**Set as default** makes a design the default for everyone. The default design can't be deleted.

## Logo and lettering {#logo-und-schriftzug}

Every design has its own **logo** (default: the Ablago symbol) and a **lettering**. The [setup wizard](installation.md#haushalt) sets the lettering of the default design to the household's name, e.g. "The Example Family". Designs without their own lettering show "Ablago". Logo and lettering appear

- at the top left in the header,
- in the title and icon of the browser tab (e.g. "The Example Family – Filing"),
- for the **default design** also on the sign-in page.

They don't appear in e-mails.

- **Upload logo:** PNG, JPEG, WebP or SVG, at most 1 MB. **Restore default** brings back the folder symbol. Ablago rejects SVGs with scripts, events or references to other files.
- **Lettering:** at most 30 characters; empty = logo only.

Because logo and lettering belong to the design, choose a logo for every design that is easy to see on its background – such as a light logo for *Dark*.

## Your own CSS {#eigenes-css}

Under **Own CSS** you can adapt the interface further, for instance `.kopf { border-bottom-width: 3px; }`. The character `<` is not allowed, so that the CSS can't change anything outside the styling; in texts (e.g. with `content`) you write `\3C ` instead.

!!! warning "Interface broken?"
    If your own CSS makes Ablago unusable, append `?design=standard` to the address, e.g. `http://nas.home.arpa:8080/werkbank/designs?design=standard`. Then the default design loads without your own CSS, and you can fix the error.

## Font size {#schriftgroe}

The font size is not part of the design: every user sets it under My account in **Appearance**, per device.
