# Unsere Repositories { #repositories }

Ablago besteht aus mehreren öffentlichen Repositories auf GitHub. Sie folgen derselben Arbeitsweise ([Mitmachen](index.md)): erst ein Issue, umgesetzt wird, was das Label `freigegeben` trägt, gemergt wird nur vom Maintainer. Jedes hat eine eigene `README.md` und – wo man mitarbeiten kann – eine `CONTRIBUTING.md`, die hierher verweist.

| Repository | Wofür | Wo du anfängst |
| --- | --- | --- |
| [dms](https://github.com/motom001/dms) | Ablago selbst: Server, Oberfläche, gemeinsamer Code, Images, alle vier Handbücher, Release | [Loslegen](loslegen.md), dann die [Karte](aufbau.md) |
| [dms-registry](https://github.com/motom001/dms-registry) | der Paketkatalog: Mappentypen, Ansichten, Beispiele und Pakete mit Code, mit Regeln, Schemas und Prüfwerkzeugen | [Pakete entwickeln](pakete.md), dort `REGELN.md` und der Ordner `vorlage/` |
| [dms-clients](https://github.com/motom001/dms-clients) | Programme außerhalb von Ablago, die mit Ablago sprechen: Home Assistant, Homey, ein Python-Client, später Apps | [Clients entwickeln](clients.md) |
| [dms-appstore](https://github.com/motom001/dms-appstore) | Einträge für App-Stores und NAS-Systeme (umbrelOS, ZimaOS, CasaOS, TrueNAS, UGREEN, Unraid), erzeugt aus den Vorlagen und mit jedem Release aktualisiert | `README.md` des Repositories; Anleitungen im [Installationshandbuch](https://help.ablago.app/installieren/aktuell/) |
| [dms-website](https://github.com/motom001/dms-website) | die Website [ablago.app](https://ablago.app) und die Marke: Logo und Farben im Ordner `marke/` | `README.md` des Repositories |

## Wohin gehört mein Beitrag? { #wohin }

- **Ein Fehler oder Wunsch an Ablago selbst** – auch an der Oberfläche oder einem Handbuch – gehört nach **dms**.
- **Ein neuer Mappentyp oder ein Paket** gehört nach **dms-registry**. Braucht das Paket etwas Neues im Kern (eine neue Schnittstelle, ein neues Ereignis), kommt dafür zusätzlich ein Issue in **dms**.
- **Eine Anbindung an ein anderes System** (Hausautomatisierung, Handy, Büro) gehört nach **dms-clients**. Was der Client von Ablago braucht, steht unter [Clients entwickeln](clients.md).
- **Ein Eintrag für einen weiteren App-Store oder ein NAS** gehört nach **dms-appstore**.
- **Website, Logo und Farben** gehören nach **dms-website**.

Unsicher? Dann ein Issue in **dms** – es wird bei Bedarf verschoben.
