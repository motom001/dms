# No VOLUME for the database in dms-komplett (#943) { #kein-volume }

**Question:** should the image `dms-komplett` declare the folder `/data/postgres` as a volume with `VOLUME`, so that the database does not disappear with the container?

**Decision:** no. Ablago warns loudly when `/data/postgres` is not a mount point of its own, and the installation manual shows how to rescue the data.

**Reasons:** An anonymous volume would look like protection, but it doesn't help in exactly the cases that matter: `docker run` and "recreate container" in a NAS interface create a new, empty anonymous volume each time. The old database then lingers under a hash name, and Ablago starts empty. Only Compose carries anonymous volumes over when recreating. On top of that the database silently ends up where Docker lives (on a NAS often the small system partition), and the check `datenbankOhneVolume()` could no longer tell it from a real folder – the warning would be lost. `/data/files`, `/data/geheim` and `/data/sicherung` have no `VOLUME` either (#115), and a `VOLUME` can't be undone in derived images. Hence: no `VOLUME`, but a loud warning and instructions for rescuing the data.

**Consequences:** how start, permissions and warning are implemented is under [dms-komplett: database folder](../server.md#komplett-datenbankordner).

**Status:** applies since #943.
