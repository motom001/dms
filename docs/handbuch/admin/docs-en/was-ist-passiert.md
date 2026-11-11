# Emergency: What has happened to you? {#notfall-was-ist-dir-passiert}

You have the [emergency sheet](verschluesselung.md#notfallblatt) in front of you and scanned the code on it? Good. Read here on your phone and work on the computer at the same time. Pick what has happened – each case has only a few steps.

You can always reach this page at **https://help.ablago.app/emergency** (German: **https://help.ablago.app/notfall**). The addresses stay valid because they are on paper.

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
