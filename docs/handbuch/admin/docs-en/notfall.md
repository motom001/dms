# Emergency: no admin left {#notfall-kein-admin-mehr}

!!! tip "First the emergency sheet, then the console"
    If you have the [emergency sheet](verschluesselung.md#notfallblatt), the easiest way is with the **emergency code** on it – without files on the NAS: [Getting back in with the emergency code](was-ist-passiert.md#notfallcode). If there is still a person with "Full administration" and you just can't get in (forgotten password, IP blocked, lost phone for two-factor sign-in), the [command `dms`](konsole.md) in the container also works, e.g. `dms passwort <email>`. The RESCUE file below is the way if the emergency sheet is lost too.

If nobody with the administration permission can get in any more – forgotten password, the only person with "Full administration" unreachable, no email sending for "Forgot your password?" –, you create a new account for yourself via a file on the NAS. You don't need a command line for it.

## How it works {#so-gehts}

1. On the NAS (e.g. in the file manager), open the folder with the key file, in the template `/volume1/docker/dms/geheim`.
2. Create a text file **`RESCUE`** there (without an extension) with exactly this content:
   ```
   NOTFALLZUGANG
   ```
3. Wait a minute. Ablago checks the folder on start and every 30 seconds. It creates a new user **"Emergency admin ‹date›"** with "Full administration" and writes a **one-time link** into the file `RESCUE`.
4. Open the file again and the link in it in your browser – within **15 minutes**. Set your own password there; you are then signed in.
5. In **Workbench → Users**, give the emergency admin a proper name and, under **My account**, a real email address – or use it to create a password link for your actual account and deactivate the emergency admin afterwards.

If the link contains `localhost`, no address of Ablago has been set yet: replace `http://localhost:3000` with the address under which you open Ablago, e.g. `http://nas.home.arpa:8080`.

## What happens {#was-dabei-geschieht}

- Without the keyword `NOTFALLZUGANG` nothing happens; an empty or different file is only recorded in the log.
- The file never contains a password, only the link. It works once and only for 15 minutes; after that Ablago deletes the file itself.
- The [log](fehlersuche.md#protokoll) records the emergency access (module *konto*), and everyone with "Full administration" gets an email – if sending is set up.
- The workbench overview shows a notice until the emergency admin has been renamed or deactivated.

!!! info "Isn't that dangerous?"
    Anyone who can write into the `geheim` folder has full access to the data anyway: the key is there, and next to it are the database and documents. No new way in is created – but make sure that only you can access these folders on the NAS.
