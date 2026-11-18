# Kein VOLUME für die Datenbank in dms-komplett (#943) { #kein-volume }

**Frage:** Soll das Image `dms-komplett` den Ordner `/data/postgres` mit `VOLUME` als Volume anlegen, damit die Datenbank nicht mit dem Container verschwindet?

**Entscheidung:** Nein. Ablago warnt laut, wenn `/data/postgres` kein eigener Einhängepunkt ist, und das Installationshandbuch zeigt, wie man die Daten rettet.

**Gründe:** Ein anonymes Volume sähe nach Schutz aus, hilft aber gerade in den Fällen nicht, um die es geht: `docker run` und „Container neu erstellen“ in der Oberfläche eines NAS legen jedes Mal ein neues, leeres anonymes Volume an. Die alte Datenbank liegt dann unter einem Hash-Namen herum, und Ablago fängt leer an. Nur Compose übernimmt anonyme Volumes beim Neuanlegen. Dazu landet die Datenbank unbemerkt dort, wo Docker liegt (auf einem NAS oft die kleine Systempartition), und die Prüfung `datenbankOhneVolume()` könnte sie nicht mehr von einem echten Ordner unterscheiden – die Warnung fiele weg. Auch `/data/files`, `/data/geheim` und `/data/sicherung` haben kein `VOLUME` (#115), und ein `VOLUME` lässt sich in abgeleiteten Images nicht zurücknehmen. Deshalb: kein `VOLUME`, dafür eine laute Warnung und eine Anleitung zum Retten.

**Folgen:** Wie Start, Rechte und Warnung umgesetzt sind, steht unter [dms-komplett: Datenbank-Ordner](../server.md#komplett-datenbankordner).

**Stand:** gilt seit #943.
