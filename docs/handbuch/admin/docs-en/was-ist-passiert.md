# Emergency: What has happened to you? {#notfall-was-ist-dir-passiert}

You have the [emergency sheet](verschluesselung.md#notfallblatt) in front of you and scanned the code on it? Good. Read here on your phone and work on the computer at the same time. Pick what has happened – each case has only a few steps.

You can always reach this page at **https://help.ablago.app/emergency** (German: **https://help.ablago.app/notfall**). The addresses stay valid because they are on paper.

## Which emergency? { #uebersicht }

- [Ablago doesn't load or stays black](#laedt-nicht) – the page stays empty, "Ablago isn't responding right now" or "the database isn't responding"
- [Ablago no longer starts](#startet-nicht) – for example after an update
- [My device is broken](#geraet-kaputt)
- [I can't get in any more](#kein-zugang) – forgotten password, lost two-factor phone
- [No admin left](notfall.md) – nobody with the administration permission can get in, and there is no emergency sheet
- [Someone else has to take over](#uebernehmen)

## Ablago doesn't load or stays black { #laedt-nicht }

Ablago was running, but now it isn't working – without you having changed anything.

**How you can tell:**

- The page stays **black or empty**, or it shows "Connecting to Ablago …" for a long time.
- Instead of the sign-in page it says **"Ablago isn't responding right now."** – below it what is going on, what you can do and when it last checked.
- A red bar at the top says **"Ablago is busy – the database isn't responding."**

Ablago itself is then usually still running but can't reach its database. Your documents are not affected.

**What the message says** – the first sentence under "Ablago isn't responding right now." tells you where the problem is:

| The message says … | It means | What usually helps |
|---|---|---|
| "Ablago is running but hasn't had an answer from its database for …" | Ablago is stuck: no database connection is free, or the database doesn't answer in time. | Restart the **Ablago container** (step 2). |
| "Ablago is running but hasn't been able to reach its database for … – it is probably switched off." | The database refuses the connection: its container isn't running or can't be reached. | Start the **database container** or the whole project. Restarting only Ablago doesn't help here. |
| "Ablago doesn't answer at all." | Ablago itself doesn't answer – it is restarting right now, or the container isn't running. | Wait a moment; otherwise check in the container interface that the Ablago container is running. |

At the bottom the message shows the **time** of the last check and – if you have signed in with this browser before – the **version** of Ablago. Both help when you tell someone or report a bug.

!!! info "Why is there no “Restart Ablago” button and no log?"
    Anyone who knows the address can see the message – and without the database Ablago can't check who you are. A restart button would therefore be a tool for shutting Ablago down from outside, and the log contains names, addresses and file names. So the page only shows what is going on and what you can do; restarting and reading the log happen through the container (steps 2 and 3).

**What you can do – in this order:**

1. **Reload the page.** Wait a minute and reload the page (on a phone: pull the page down). Ablago also keeps trying on its own and loads the page as soon as it responds again. If it then says "Reloading alone didn't help" (or in the bar "Already reloaded and Ablago still isn't responding"), go to step 2.
2. **Restart the container.** This ends all running requests and rebuilds the connections to the database. Nothing is lost. If the message says the database is "probably switched off", restart the whole project or the database container.
    - **Synology (Container Manager):** *Container Manager → Project →* your Ablago project *→ Action → Restart*. For a single container: *Container →* select the Ablago container *→ Action → Restart*.
    - **UGREEN, QNAP, Unraid:** select the Ablago container in the Docker interface and choose **Restart**.
    - **With the command line** in the folder with the Compose file: `docker compose restart` (restarts Ablago and the database). Only Ablago: `docker compose restart app`, or with [dms-komplett](https://help.ablago.app/installieren/aktuell/en/komplett/) `docker compose restart dms`.
3. **Look at the log.** Once the container shows "running" again, reload the page. If it still doesn't work (or didn't before), look at the log of the last two hours:
    ```
    docker logs --since 2h <container>
    ```
    `<container>` is the name of the Ablago container, e.g. `dms-app-1`; `docker ps` shows them all. In the NAS interface: *Container → Details → Log*. Look out for these lines:
    - **"Anfragen warten lange auf eine freie Verbindung zur Datenbank"** (requests are waiting a long time for a free database connection) – with the number of connections in use and reserved and the schedules running. This is the state that the restart fixes.
    - **"Verbindung für Sperren abgebrochen"** (connection for locks lost) – the connection to the database was briefly gone; Ablago rebuilds it itself.
    - Lines with **"Datenbank"** and **"nicht erreichbar"** or **"connection refused"** – the database container isn't running. Restart it or the whole project.
    - **No lines at all** since a certain time: note the time of the last line.
4. **Does it happen again?** Then please report it as a bug on [GitHub](https://github.com/motom001/dms/issues) – with the version of Ablago, the time and the log from step 3 (make names and email addresses in it unrecognisable first). That way the cause can be found.

While Ablago is reachable, **Workbench → system health** (see [Many simultaneous requests](technik.md#last)) shows how many database connections are in use and which locks are running.

## Ablago no longer starts { #startet-nicht }

For example after an update. Your data is still on the device – an update deletes nothing.

1. Open the usual address. If it says "Ablago is starting …", just wait – the page shows what is happening and reloads by itself. If it says "Ablago could not start", it names the reason.
2. Open your device's management (e.g. the Container Manager on the NAS) and look at the log of the Ablago container. Usually one line says what is missing.
3. If this came after an update: enter the previous version as the image tag and restart. How that works is described under [Which image tag?](aktualisieren.md#image-tag).
4. If that doesn't help, the [troubleshooting](fehlersuche.md) guides you further.

## My device is broken { #geraet-kaputt }

You set up Ablago anew and restore the backup.

1. Have ready: the **emergency sheet** with the key and the **two files of a backup** – from the old disk or from the [off-site copy](sicherung-ausser-haus.md).
2. Install Ablago anew, as described under [How do I get a DMS?](https://help.ablago.app/installieren/aktuell/en/).
3. Copy the two files into the backup folder of the new installation.
4. Open Ablago in the browser. In the setup wizard, choose **Restore from a backup** and type in the **key from the emergency sheet**. Spaces don't count; below easily confused characters, the sheet says which one is meant.
5. Then sign in with your previous credentials.

All details are under [New NAS, old backup](wiederherstellen.md#neues-nas-alte-sicherung).

## I can't get in any more { #kein-zugang }

- **Forgotten password:** on the sign-in page, choose **Forgot your password?** – this works if email sending is set up. Otherwise another person who may administer Ablago creates a password link for you under **Workbench → Users**.
- **Nobody who may administer can get in any more:** use the **emergency code** from the emergency sheet – see below. Without an emergency sheet, the [RESCUE file on the device](notfall.md) helps.
- **Lost the phone for two-factor sign-in:** another person with "Full administration" resets it, you use a recovery code – or the emergency code (it resets two-factor sign-in).
- **Lost the device with your passkey:** sign in with your password and remove the passkey under **My account → Security**. If a passkey is required and you have no other one, another person with "Full administration" resets your passkeys – or the emergency code (it removes the passkeys too).

### Getting back in with the emergency code { #notfallcode }

At the bottom of the emergency sheet, in the box **Locked out?**, there is a long code in groups of four and the address of your Library with `/notfall` at the end. It works on the phone just as on the computer.

1. Open the address **on your home network**, i.e. with a device on the Wi-Fi at home, e.g. `http://nas.home.arpa:8080/notfall`. From the internet it only works if it is allowed under [Sign-in protection](anmeldeschutz.md#notfallzugang).
2. Type in the **emergency code**. Upper and lower case, spaces and hyphens don't count. **Not the key** from the emergency sheet – that never belongs in the browser.
3. If you mistype, it says "The emergency code was wrong", and input is **blocked for 30 seconds** – a countdown counts down. This only applies to your device or your connection; someone making failed attempts elsewhere doesn't lock you out.
4. If the code is correct, you choose the **account** for which you set a new password. Only people who may administer Ablago are offered.
5. Set the **new password**. Ablago ends all sign-ins of this account, resets two-factor sign-in and removes the passkeys – set them up anew afterwards. The account's API keys remain valid.
6. Download the **new emergency sheet**. The old code only works once – the new sheet has a new one. Print it and destroy the old one.
7. **Sign in** – with the account's email address and the new password.

Everyone who may administer Ablago and the account's previous email address immediately get an email: "Your Library's emergency access was used …" – even before anything changes. Many failed attempts are reported bundled. In the workbench there is a red notice until someone chooses **Read**, and the [log](fehlersuche.md#protokoll) records everything.

!!! warning "Emergency sheet lost or stolen?"
    Whoever has the sheet can take over an account with the administration permission via the emergency code – not unnoticed, because all administrators then get an e-mail. Download a new emergency sheet immediately under **Workbench → Encryption**: then the old code no longer works. Also change the key, because it was on the sheet too.

## Someone else has to take over { #uebernehmen }

You found the emergency sheet because the person who set up Ablago can no longer do it?

1. **Keep the sheet safe** and don't pass it on. Whoever has it can read the backups.
2. Under **Whom to ask?** on the sheet are people who can help. Talk to them first.
3. **If Ablago is still running**, sign in with the account of a person who may administer Ablago (often in the password safe). If it is missing, the [emergency code](#notfallcode) at the bottom of the sheet helps. Then create your own account, see [Users and roles](benutzer.md).
4. **If Ablago no longer runs**, proceed as under [My device is broken](#geraet-kaputt).
