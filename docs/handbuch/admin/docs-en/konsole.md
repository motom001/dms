# Console: the `dms` command {#konsole-befehl-dms}

Ablago's container has the command `dms`. With it you handle emergencies and routine work without a browser – for instance if you have locked yourself out or want to do something by script.

The easiest way is to call it in the folder of the Compose file via the service name:

```sh
docker compose exec app dms hilfe     # two containers (service "app")
docker compose exec dms dms hilfe     # dms-komplett (service "dms")
```

With `docker exec` you need the container's name. Docker puts it together from the name of the project and the service, e.g. `dms-app-1` (two containers) or `dms-dms-1` (dms-komplett). `docker ps` shows which names exist. Take Ablago's container, not the database's:

```sh
docker exec -it dms-app-1 dms hilfe
```

In the NAS's Docker interface (Synology Container Manager, QNAP Container Station, Unraid, TrueNAS …) you open the container's **terminal** instead and enter `dms hilfe`.

The commands and their output are in German.

## Who may do this? {#wer-darf-das}

Whoever may run commands in the container may also use `dms` – like a person with "Full administration" in administration mode. The command talks to the **running Ablago**, not directly to the database; locks, sessions and log thus stay consistent. Every action is recorded in the [log](fehlersuche.md#protokoll) with the note **(Konsole)**.

`dms` acts as the oldest active person with "Full administration". With `--als <email>` you choose someone else.

Technically, Ablago creates a file `/tmp/dms-konsole.json` with a random key on start, readable only inside the container. The environment variable `DMS_KONSOLE_DATEI` sets another location; it must then be the same for Ablago and the command `dms`. Ablago only accepts the key via the address `127.0.0.1` – it doesn't work via the published port or a reverse proxy.

The command `dms` also works in [maintenance mode](wartungsmodus.md). So you end it with `dms wartung aus`, even if the interface is locked.

## Emergency { #notfall }

| Command | What it does |
| --- | --- |
| `dms passwort <email>` | Set a password directly, without email and link. Asks for the new password twice; all of the user's sessions end. Without a terminal: `--passwort <new>`. |
| `dms zweifaktor-zuruecksetzen <email>` | Remove [two-factor sign-in](anmeldeschutz.md#zwei-faktor-anmeldung) (phone lost). |
| `dms passkeys-zuruecksetzen <email>` | Remove all [passkeys](anmeldeschutz.md#passkeys) of a person (device lost). |
| `dms gesperrt` | blocked IP addresses ([sign-in protection](anmeldeschutz.md)) |
| `dms entsperren <ip>` | unblock an IP address |
| `dms wartung` / `dms wartung aus` | status of [maintenance mode](wartungsmodus.md) / end it |
| `dms abmelden <email>` | end all of a user's sessions |
| `dms abmelden --alle` | sign out all users everywhere |

!!! example "Locked out"
    ```sh
    docker compose exec app dms passwort me@example.org
    docker compose exec app dms entsperren 192.168.1.20
    ```

If there is no active person with "Full administration" at all any more, `dms passwort` still sets a password; the other commands need one. Then the [emergency access](notfall.md) helps.

## Operation { #betrieb }

| Command | What it does |
| --- | --- |
| `dms status` | version, variant, uptime, database |
| `dms sicherung` | list backups, running backup |
| `dms sicherung jetzt` | start a [backup](sicherung.md) |
| `dms sicherung pruefen <name>` | check a backup |

## Administration { #verwaltung }

| Command | What it does |
| --- | --- |
| `dms benutzer` | users with role, status and last sign-in |
| `dms benutzer anlegen <email> <name> [--admin]` | create a user; the invitation goes by email or the link is in the output |
| `dms benutzer deaktivieren <email>` / `aktivieren <email>` | block or unblock an account |

## Everything else: `dms api` { #alles-andere-dms-api }

You reach every function of the workbench with `dms api <METHOD> <path> [json]`. The answer comes as JSON.

```sh
dms api GET /api/werkbank/anmeldeschutz
dms api PUT /api/werkbank/zweifaktor '{"admin":true}'
dms api PUT /api/werkbank/sicherung/plan '{"uhrzeit":"02:30"}'
```

Which paths exist is shown by the network tab of the browser's developer tools while you change the setting in the workbench.

## For scripts {#fur-skripte}

- `--json` outputs every answer as JSON.
- `--ja` answers confirmations (e.g. for `abmelden --alle`); without a terminal (`docker exec` without `-it`) it is mandatory.
- Return value: `0` done, `1` error, `2` wrong call, `3` Ablago isn't running or is in setup mode, `4` access refused, `130` input cancelled (e.g. with Ctrl+C when asked for the password).

## Messages {#meldungen}

- **"Ablago läuft nicht"** (Ablago isn't running) – the server is starting or has crashed; see the container's log.
- **"Ablago läuft im Einrichtungsmodus"** (Ablago is in setup mode) – no database is connected yet. Set up Ablago in the browser first.
- **"Keine Berechtigung für /tmp/dms-konsole.json"** (no permission for …) – `docker exec` was called with `--user`; call it without `--user`.
