# What Ablago may do

Instead of asking separately for every package and every folder type, you decide **once** what Ablago may do. Ablago keeps to this in the server – even if someone bypasses the interface – and no longer asks each time within this limit.

The card **What Ablago may do** is at the very top of the [workbench overview](uebersicht.md). It shows your two answers as two sentences. **Change …** shows the two questions; under the chosen answer there is one sentence on what it means, and below that "What this means for you". Only people with **Full administration** may change it; everyone who administers can see the card.

## Question 1: Which packages may Ablago use? { #pakete }

| Answer | What is added |
| --- | --- |
| **None – only Ablago itself** | You set up folder types and workflows yourselves. What comes with Ablago, such as text recognition, still works. |
| **Templates only** | Plus ready-made folder types and views such as Household or Contracts – without code of their own. |
| **Also helpers that only work here** (recommended, default) | Plus packages with code of their own, such as a separator sheet or an AI on this device. Nothing leaves Ablago. |
| **Also helpers that use services on the network** | Plus packages that use services on the network – on the internet or in your home: backup to a remote target, mail through a sending service, an AI assistant. They get content from all areas. You can exclude individual areas – see [fine-tuning](#feinabstimmung). |

Ablago reads from the package itself where it belongs: without code of its own it is a template, with code and without addresses on the network a helper that only works here, with addresses on the network (including a service address from the settings) a helper that uses services on the network – whether the service runs on the internet or in your home, such as an AI on the NAS.

- **Installing and updating:** a package above the limit cannot be installed. The preview says why in words, e.g. "“Translation” uses services on the network – you have not allowed that.", and offers **Allow …**.
- **Updates:** if an update lifts a package above the limit (for example it newly uses services on the network), Ablago does not install it: "The update for “Translation” newly uses services on the network – you have not allowed that." The installed version keeps running.
- **What comes with Ablago** (built-in helpers) runs with every answer: text recognition, PDF/A, full text and conversion from the official catalogue, without internet – including their add-ons such as further languages for text recognition. A package from another publisher that replaces such a helper follows question 1.

## Fine-tuning: areas for services on the network { #feinabstimmung }

“Also helpers with internet” is **one decision**: packages with network access such as the AI assistant receive content from **all areas** – including post and health, including folder types added later. If you want to keep individual areas in Ablago, exclude them here:

1. Workbench → Overview → card **What Ablago may do** → open **Fine-tuning: areas for services on the network**.
2. Remove the tick for the areas that should stay in Ablago – for example *Health* and *Post*. This takes effect immediately for all packages with network access.

The tour **Keep areas away from services on the network** (assistant → Tips) shows the way too. The folder type has the same tick under *Permissions* (“May go to services on the network”); there it is saved with **Save folder type**. The page of a package with network access and the message “Nothing went to …: the document is in the folder type …” lead here with **To the fine-tuning**.

- **Packages without network access** – such as *Local AI – similarity* or text recognition – are never affected by the fine-tuning: they receive all areas, according to their permissions.
- **When installing** a package with network access, the preview says who gets what, e.g. ““AI assistant” sends content from all areas to the address from the setting “Service address”, excluding: Health.” For the *Health* package a notice appears if a package with network access is already active.
- **Existing installations** keep their previous list; new folder types only go out there once allowed. The overview asks once “So far only these areas go to services on the network – allow all?”. **Allow all areas** in the fine-tuning switches to “all areas”; you can then exclude individual ones again.
- Who *sees* a folder is still up to the [permissions](berechtigungen.md) – there is no second, hidden block for services on the network there.

## Question 2: How much should Ablago do on its own? { #selbst }

- **Nothing on its own**
- **Recognise and propose** (recommended, default)
- **Do everything, I check afterwards**

Ablago already remembers the answer. It takes effect once Ablago recognises post and documents on its own; until then it changes nothing.

## What always stays a decision of its own { #immer }

With every answer, Ablago still asks separately about:

- a third-party or unsigned catalogue and a publisher that did not exist before,
- permissions on administration or on backups,
- the Health package if a package with network access is already active – a notice in the preview, with the way to the [fine-tuning](#feinabstimmung),
- everything that already needs a fresh sign-in today.

## Changing { #aendern }

- **Raising** needs a fresh sign-in. The change is recorded with the old and new value in the evidence journal (access and permissions), and everyone with administration rights gets an email. Nothing happens on its own: no package is installed, no folder type released.
- **Lowering** takes effect immediately and is recorded in the journal. If installed packages no longer fit the new answer, Ablago names them beforehand with the reason; **Pause and save** [pauses](pakete.md#anhalten) them – their folder types, folders and settings stay.

## During setup { #einrichtung }

The setup assistant asks both questions in the step [What may Ablago do?](installation.md#was-darf-ablago), before the packages. Afterwards Ablago chooses the packages itself – matching the first answer, the use and the recommendation in the official, signed catalogue; what is not allowed is shown next to it with the reason. This only happens during setup: no packages are added on their own later.

## Provider and setup file { #anbieter }

The [setup file](einrichtungsdatei.md) holds both answers under `darf`. A provider who runs Ablago for others sets maximum values there with `hoechstens`. The server enforces them; higher answers are greyed out in the card with "Set by your provider".

## After the update { #update }

Installations that existed before this version get answers that change nothing: "Also helpers that use services on the network" for question 1 – as much as was possible before – and "Recognise and propose" for question 2. Nothing is paused, nothing becomes stricter or looser without asking. Once, the overview shows the note "New: What Ablago may do – please take a look once". New installations start with the recommended answers.
