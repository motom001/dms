# Our repositories { #repositories }

Ablago consists of several public repositories on GitHub. They follow the same way of working ([contributing](index.md)): an issue first, what carries the label `freigegeben` (approved) gets implemented, only the maintainer merges. Each has its own `README.md` and – where you can contribute – a `CONTRIBUTING.md` that points here.

| Repository | What for | Where you start |
| --- | --- | --- |
| [dms](https://github.com/motom001/dms) | Ablago itself: server, interface, shared code, images, all four manuals, release | [Getting started](loslegen.md), then the [map](aufbau.md) |
| [dms-registry](https://github.com/motom001/dms-registry) | the package catalogue: folder types, views, examples and packages with code, with rules, schemas and check tools | [Developing packages](pakete.md), there `REGELN.en.md` and the folder `vorlage/` |
| [dms-clients](https://github.com/motom001/dms-clients) | programs outside Ablago that talk to Ablago: Home Assistant, Homey, a Python client, later apps | [Developing clients](clients.md) |
| [dms-appstore](https://github.com/motom001/dms-appstore) | entries for app stores and NAS systems (umbrelOS, ZimaOS, CasaOS, TrueNAS, UGREEN, Unraid), generated from the templates and updated with every release | the repository's `README.en.md`; guides in the [installation manual](https://help.ablago.app/installieren/aktuell/en/) |
| [dms-website](https://github.com/motom001/dms-website) | the website [ablago.app](https://ablago.app) and the brand: logo and colours in the folder `marke/` | the repository's `README.md` |

## Where does my contribution belong? { #wohin }

- **A bug or wish for Ablago itself** – also for the interface or a manual – belongs in **dms**.
- **A new folder type or a package** belongs in **dms-registry**. If the package needs something new in the core (a new interface, a new event), an additional issue goes into **dms**.
- **A connection to another system** (home automation, phone, office) belongs in **dms-clients**. What the client needs from Ablago is under [Developing clients](clients.md).
- **An entry for a further app store or NAS** belongs in **dms-appstore**.
- **Website, logo and colours** belong in **dms-website**.

Not sure? Then open an issue in **dms** – it will be moved if necessary.
