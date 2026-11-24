# What Ablago may do

Instead of asking separately for every package and every folder type, you decide **once** what Ablago may do. Ablago keeps to this in the server – even if someone bypasses the interface – and no longer asks each time within this limit.

The card **What Ablago may do** is at the very top of the [workbench overview](uebersicht.md). It shows your two answers as two sentences. **Change …** shows the two questions; under the chosen answer there is one sentence on what it means, and below that "What this means for you". Only people with **Full administration** may change it; everyone who administers can see the card.

## Question 1: Which packages may Ablago use? { #pakete }

| Answer | What is added |
| --- | --- |
| **None – only Ablago itself** | You set up folder types and workflows yourselves. Ablago's built-in helpers such as text recognition still work. |
| **Templates only** | Plus ready-made folder types and views such as Household or Contracts – without code of their own. |
| **Also helpers that only work here** (recommended, default) | Plus packages with code of their own, such as a separator sheet or an AI on this device. Nothing leaves Ablago. |
| **Also helpers with internet** | Plus packages that use the internet: backup to a remote target, mail through a sending service, an AI assistant. Content only from areas you release; health always stays inside. |

Ablago reads from the package itself where it belongs: without code of its own it is a template, with code and without addresses on the network a helper that only works here, with addresses on the network (including a service address from the settings) a helper with internet.

- **Installing and updating:** a package above the limit cannot be installed. The preview says why in words, e.g. "“Translation” uses the internet – you have not allowed that.", and offers **Allow …**.
- **Updates:** if an update lifts a package above the limit (for example it newly uses the internet), Ablago does not install it: "The update for “Translation” newly uses the internet – you have not allowed that." The installed version keeps running.
- **Built-in helpers** run with every answer: text recognition, PDF/A, full text and conversion from the official catalogue, without internet – including their add-ons such as further languages for text recognition. A package from another publisher that replaces such a helper follows question 1.

## Question 2: How much should Ablago do on its own? { #selbst }

- **Nothing on its own**
- **Recognise and propose** (recommended, default)
- **Do everything, I check afterwards**

Ablago already remembers the answer. It takes effect once Ablago recognises post and documents on its own; until then it changes nothing.

## What always stays a decision of its own { #immer }

With every answer, Ablago still asks separately about:

- a third-party or unsigned catalogue and a publisher that did not exist before,
- permissions on administration or on backups,
- health and similarly sensitive folder types,
- everything that already needs a fresh sign-in today.

## Changing { #aendern }

- **Raising** needs a fresh sign-in. The change is recorded with the old and new value in the evidence journal (access and permissions), and everyone with administration rights gets an email. Nothing happens on its own: no package is installed, no folder type released.
- **Lowering** takes effect immediately and is recorded in the journal. If installed packages no longer fit the new answer, Ablago names them beforehand with the reason; remove them under [Packages](pakete.md), then the answer can be changed.

## Provider and setup file { #anbieter }

The [setup file](einrichtungsdatei.md) holds both answers under `darf`. A provider who runs Ablago for others sets maximum values there with `hoechstens`. The server enforces them; higher answers are greyed out in the card with "Set by your provider".

## After the update { #update }

Installations that existed before this version get answers that change nothing: "Also helpers with internet" for question 1 – as much as was possible before – and "Recognise and propose" for question 2. Nothing is paused, nothing becomes stricter or looser without asking. Once, the overview shows the note "New: What Ablago may do – please take a look once". New installations start with the recommended answers.
