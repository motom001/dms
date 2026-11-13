# Sign-in protection {#anmeldeschutz}

After too many wrong passwords, Ablago blocks sign-in. Under **Workbench → Settings → Sign-in protection** you set when and for how long. The key for passwords and backups is under **Users and security → [Encryption](verschluesselung.md)**.

--8<-- "ausgeblendet-organisation.md"

## Two blocks {#zwei-sperren}

| Block | Default | What for |
| --- | --- | --- |
| **Per email address and IP** | 5 failed attempts → 1 minute | someone mistypes or tries out passwords for one account |
| **Per IP address**, across all email addresses | 30 failed attempts → 60 minutes | someone tries out many accounts from one address |

The block duration per IP may also be **0**: then the address stays blocked until someone who manages sign-in protection releases it. Failed attempts per IP count within the block duration (with "permanent", within one hour).

Failed attempts and blocks are stored in the database: they survive a restart and apply to all Ablago processes on the same database. A restore from a backup brings no blocks with it. Every block and every unblocking is in the [log](fehlersuche.md#protokoll).

## Email to the administrators { #mail-an-die-administratoren }

If Ablago can be reached from the internet, strangers constantly try out passwords. That is normal, and the blocks happen automatically. So by default Ablago sends **no email** when it blocks. What is blocked you can see at any time under **Workbench → Sign-in protection** and in the log.

If you want to know anyway, switch on one or both automations under **Workbench → Build the Library → [Automations](automatisierungen.md#benachrichtigungen)** (the package **Notifications** brings them switched off; after the update they are set as the earlier ticks here were):

| Automation | What comes |
| --- | --- |
| **Sign-in protection summary** (schedule daily 0:00 → *Report sign-in protection: summary*) | At most one email a day, shortly after midnight, about the previous day's blocks: how many IP addresses and user accounts were blocked, plus the five addresses with the most failed attempts. If Ablago was off, the report comes at the next start and combines the missed days. On days without a block nothing comes. |
| **Report account block immediately** (*User account blocked* → *Report sign-in protection: account block*) | An email as soon as too many wrong passwords or codes came for an existing account. That is rarer and more important than a blocked IP: perhaps someone has the password of this account in their sights. At most one email a day per account; failed attempts with unknown addresses trigger no e-mail. |

The emails go to all active people with the management permission for *Sign-in protection* (or "Full administration") and an email address, and need a set-up [Email sending](installation.md#e-mail-und-adresse).

!!! note "Up to version 0.84.7"
    Previously, by default an email came immediately for every blocked IP. With 0.84.8 the email is off by default – also in existing installations in which nobody changed the tick themselves. Whoever switches it on since 0.84.8 gets the daily summary instead of one email per block.

## Blocked addresses {#gesperrte-adressen}

At the very bottom of the page, the section **Blocked addresses** shows every blocked IP with reason, start and end – with many blocks in a list of fixed height that you scroll. **Release** lifts the block immediately. At the top of the page is your own address as Ablago sees it.

!!! warning "Behind a reverse proxy"
    For the block per IP to hit the right address, Ablago must believe the proxy's information. If the proxy sits on the same computer or in a private network, Ablago recognises this by itself (`TRUST_PROXY` not set or `auto`). Check at the top of the page: if your address shows the proxy's address instead of your device's, Ablago sees the same address for all sign-ins and, in the worst case, locks everyone out. See [Behind a reverse proxy](installation.md#hinter-einem-reverse-proxy).

## Exceptions {#ausnahmen}

Under **Never block** are addresses or networks that are never blocked, e.g. your home network `192.168.0.0/16` or the company network. Several separated by commas, at most 50.

## Locked out? {#ausgesperrt}

If you yourself are blocked and nobody else who manages can release you, the [command `dms`](konsole.md) in the container helps:

- `dms gesperrt` shows the blocked addresses,
- `dms entsperren <ip>` releases an address immediately.

Without access to the container, wait out the block duration or sign in from another device or network. If nobody with management permission can get in any more, the [emergency code from the emergency sheet](was-ist-passiert.md#notfallcode) or the [RESCUE file](notfall.md) helps.

If you can't get further because of [two-factor sign-in](#zwei-faktor-anmeldung) – phone and recovery codes gone –, `dms zweifaktor-zuruecksetzen <email>` removes it for your user; afterwards the password is enough again. If it is required and you haven't set it up yet, you can still switch off the requirement at any time under **Workbench → Sign-in protection** – also on the setup page after signing in.

## Emergency access {#notfallzugang}

Whoever has locked themselves out gets back in with the **emergency code** from the [emergency sheet](verschluesselung.md#notfallblatt) via Ablago's address with `/notfall` at the end and sets a new password for a person with management permission – step by step under [Back in with the emergency code](was-ist-passiert.md#notfallcode). Here it says on which emergency sheet the valid code is; **Go to emergency sheet** leads to [Encryption](verschluesselung.md#notfallblatt), where you download a new one. Every new emergency sheet brings a new code; the previous one then no longer applies.

- **Default: only from the home network.** The page `/notfall` only works from devices in private networks (e.g. `192.168.…`, `10.…`, `fd…`), not from the internet.
- **Allow emergency access from the internet:** with this tick it works from anywhere – for everyone who knows the address and has the code. Ablago warns against it and requires a [fresh sign-in](verwalten.md#frische-anmeldung) for it. Going back to "only home network" works without.
- Every wrong entry blocks input for 30 seconds – per address range (IPv4 individually, IPv6 per /64). Failed attempts also count towards sign-in protection above; many failed attempts are reported to the administrators bundled by email, at most once an hour.

!!! info "Behind a reverse proxy"
    Whether a request comes from the home network, Ablago decides by the browser's real address. For that the proxy must set `X-Forwarded-For` (all common ones do) and Ablago must trust it ([What the proxy tells Ablago](installation.md#was-der-proxy-dem-dms-mitteilt)). If such information arrives although `TRUST_PROXY=false` applies, or if `TRUST_PROXY=true` is set (then anyone could forge the information), the request counts as "not from the home network". A proxy that passes on no address at all makes all requests look as if from the home network – set it up so that it sets `X-Forwarded-For`.

If Ablago thinks you aren't in the home network, the Workbench shows below the note which address it sees and why: either it is a **public address** (see below), or **your proxy passes the address on in a way Ablago can't trust** – then check `TRUST_PROXY` and the proxy's headers as described under [What the proxy tells Ablago](installation.md#was-der-proxy-dem-dms-mitteilt).

### At home via the public name { #zu-hause-uber-den-offentlichen-namen }

If you open Ablago at home via its public name (e.g. `ablage.example.org`), that name points to the public address of your internet connection. The request then goes out of the router and straight back in (hairpin NAT); the proxy sees and passes on the public address, e.g. `203.0.113.7`. Ablago is right then: this request came via the internet.

The remedy is a **local DNS entry** (split DNS): in the home network the same name points straight to the proxy, e.g. `ablage.example.org → 192.168.1.10`. You create the entry in your router or in your DNS server at home (often called "local DNS", "DNS rebind protection – exceptions" or "host overrides"). Then wait a few minutes or restart the browser; the Workbench then shows an address from the home network. The certificate stays valid because the name stays the same.

## Two-factor sign-in {#zwei-faktor-anmeldung}

Every user can set up two-factor sign-in with an authenticator app under **My account → Security** (click your name at the top right) (TOTP, 6 digits, 30 seconds) and gets ten recovery codes with it. What this looks like for users is described in the [User manual](https://help.ablago.app/benutzer/aktuell/en/profil/#zwei-faktor-anmeldung).

Under **Workbench → Sign-in protection** in the block **Two-factor sign-in** you **require it per system role**: with the ticks **Require for everyone who may manage** and **Require for members**. The requirement takes effect **at the next sign-in**: whoever doesn't have it yet only sees the setup after signing in and only gets further afterwards. They can no longer switch it off themselves. Whoever is signed in right now keeps working and sees a notice at the top with the way to the setup.

If you require it for everyone who may manage and don't have it yourself yet, Ablago asks beforehand: **Set up now** takes you to **My account → Security**, **Require anyway** switches on the requirement – you then set it up at your next sign-in. The setting itself always stays reachable for administrators: switching it off also works while the setup is still ahead of you; the setup page after signing in offers **Switch off requirement for administrators** for this.

**A passkey fulfils the requirement as well** (#811) – but only a passkey for the maintained HTTPS address (see [Requiring them](#vorschreiben)); without it only the code app counts. Anyone required can add a [passkey](#passkeys) instead of the code app – it is then needed as a second step when signing in with a password, and the person cannot remove the last one themselves. With a passkey they may switch off the code app. The passkey requirement further down stays separate: it demands a passkey; the code app is not enough there.

Wrong codes count like wrong passwords for [sign-in protection](#zwei-sperren). A link for resetting the password only replaces the password; Ablago still asks for the code.

**Lost your phone?** Under **Workbench → Users** it says for the user whether two-factor sign-in is set up; **Reset** removes it. Afterwards the password is enough again – if it is required, the user sets it up anew at the next sign-in. Every setup, reset and every sign-in with a recovery code is in the [log](fehlersuche.md#protokoll).

The secret is stored in the database encrypted with [Ablago's key](verschluesselung.md) and is thus part of the backup; a key change re-encrypts it too. Ablago only stores recovery codes as a checksum.

!!! warning "Time"
    The codes depend on the time. If the server's clock is off by more than about 30 seconds, they don't fit. Let the server set the time via NTP.

!!! tip "Locked yourself out?"
    If you have lost your phone and codes, `dms zweifaktor-zuruecksetzen <email>` in the container removes your two-factor sign-in (see [command `dms`](konsole.md)). If you can't get to the container, [emergency access](notfall.md) helps.

## Passkeys {#passkeys}

With a **passkey** (WebAuthn) someone signs in without a password: phone, computer or security key ask for fingerprint, face or PIN. Each passkey only works for the address of Ablago it was created under – a fake sign-in page cannot use it (protection against phishing). Everyone creates, names and removes their own passkeys under **My account → Security**; several per person are possible. What this looks like is described in the [User manual](https://help.ablago.app/benutzer/aktuell/en/profil/#passkeys).

A passkey is good for three ways:

- **A way of its own:** **Sign in with a passkey** on the sign-in page, without email address and password. A passkey always requires confirmation on the device (PIN or biometrics) and therefore counts as a sign-in with all factors.
- **Second factor:** anyone who has set up two-factor sign-in can use the passkey instead of the code after the password. Code and recovery codes keep working.
- **Signing in again:** in [administration mode](verwalten.md) and before sensitive actions, instead of password and code – also for people who otherwise only sign in via a [provider](#anmeldung-uber-einen-anbieter-openid-connect). Likewise for **passwords for documents** in My account (with its own challenge, which is not valid for administration mode).
- **Two-factor requirement:** a passkey fulfils it as well (see [above](#zwei-faktor-anmeldung)).

### Only over HTTPS {#nur-uber-https}

Passkeys only work when Ablago can be reached over **HTTPS** with a name (e.g. `https://ablago.example.org`, not via an IP address); for trying out also on `http://localhost`. Ablago uses [Ablago's address](installation.md#e-mail-und-adresse) from **Workbench → Email and address** for this; if none is maintained there, the address the page was just called under. Without HTTPS, the button is replaced by the notice "Passkeys work as soon as Ablago can be reached over HTTPS", and the setup assistant offers no passkey at the end. How to run Ablago behind a proxy with a certificate is described under [HTTPS and certificates](installation.md#https-und-zertifikate).

**Address changed?** If Ablago gets a different name, existing passkeys no longer fit – that is intended, because exactly this protects against fake sites. The Workbench points this out when you change the address. Everyone then signs in with their password; in **My account → Security** each old passkey shows which address it was for, and they add a new one.

### Requiring them {#vorschreiben}

In the block **Passkeys** you require them per system role, like two-factor sign-in: **Require for everyone who may administer** and **Require for everyone else**. The requirement takes effect **at the next sign-in**: whoever has no passkey then first adds one and only continues afterwards; whoever is signed in right now keeps working and sees a notice at the top. With the requirement, the passkey is needed as a **second step** when signing in with a password (with a code app the code works too), and nobody can remove their last passkey themselves. The code app alone does not fulfil this requirement. **Only with a maintained HTTPS address:** switching it on only works once an address starting with `https://` is entered under **Workbench → Email and address**. Ablago always decides about the requirement by this address, never by the one someone happens to use to open the page – otherwise one could get in without a passkey via the IP address or a second name (such as the NAS's proxy). Via such addresses Ablago still asks for the passkey for the maintained address after the password (which does not work there) or reports "Please sign in via https://…". If you remove the address while the requirement is on, it **keeps** applying: those affected can only reach My account; the Workbench warns. Administrators can always switch it off, also on the page after signing in. If nobody can get in any more: `dms api PUT /api/werkbank/passkeys '{"admin":false,"mitglied":false}'` in the container (see [command `dms`](konsole.md)).

!!! warning "Without a code app there is no fallback"
    Without the requirement, the password alone stays a fallback when the device is missing. With the requirement and without a code app, someone who loses their only passkey needs your help. So recommend a second passkey (e.g. a security key) or additionally two-factor sign-in with recovery codes.

### Lost device, log, backup {#gerat-verloren-protokoll-sicherung}

- **Reset:** under **Workbench → Users** the person shows how many passkeys they have; **Reset** in the block **Passkeys** removes all of them – like resetting two-factor sign-in, a [sensitive action](verwalten.md#frische-anmeldung). In the container, `dms passkeys-zuruecksetzen <email>` does the same (see [command `dms`](konsole.md)), and [emergency access](notfall.md) removes them together with two-factor sign-in.
- **Sign-in protection:** failed attempts with a passkey count like wrong passwords for the [blocks](#zwei-sperren) per account and per IP address. Every challenge is valid for five minutes and only once. For signing in without an email address Ablago issues at most 20 per IP address (for IPv6 per /64 network) in five minutes; whoever floods only gets "too many requests" themselves.
- **Copied passkeys:** if a passkey reports a counter that does not increase, Ablago refuses and writes *Passkey abgelehnt: Zähler nicht gestiegen – womöglich kopiert* to the [log](fehlersuche.md#protokoll). Adding, renaming, removing and every sign-in are logged there with account and passkey name – never keys or identifiers.
- **Storage:** for each passkey Ablago only stores the **public key**, name, counter and times. That is nothing secret: whoever reads the database cannot sign in with it. Passkeys are part of the [backup](sicherung.md) and come back when restoring – at the same address they keep working. The [full export](export.md) only contains name and times per person, the setup file nothing of it.

## Sign-in via a provider (OpenID Connect) {#anmeldung-uber-einen-anbieter-openid-connect}

Instead of with a password, users sign in with the account of an identity provider – such as **Microsoft Entra ID** (Microsoft 365), **Google Workspace**, **Keycloak**, **Authentik** or **Authelia**. A button such as **Sign in with company account** then appears on the sign-in page. The provider sees every sign-in (who, when) – it doesn't see your documents.

### At the provider {#beim-anbieter}

Create an application (client) of type *Web* at the provider:

- **Redirect URI**: it is shown in the workbench, e.g. `https://dms.example.org/api/konto/anbieter/rueckkehr`. It follows from [Ablago's address](installation.md); enter that first.
- **Post-logout redirect URI**: Ablago's address with `/` at the end.
- **Scopes:** `openid`, `email`, `profile`.
- Note down **client ID** and **client secret**.

| Provider | Provider address (issuer) |
| --- | --- |
| Microsoft Entra ID | `https://login.microsoftonline.com/<Tenant-ID>/v2.0` |
| Google | `https://accounts.google.com` |
| Keycloak | `https://<server>/realms/<realm>` |
| Authentik | `https://<server>/application/o/<application>/` |
| Authelia | `https://<server>` |

### In Ablago {#im-dms}

Under **Workbench → Sign-in protection → Sign-in via a provider** you enter:

- **Provider address** (issuer),
- **Client ID**,
- **Client secret** – leave empty for public clients that have no secret. If one is already saved, an empty field leaves it unchanged; **Delete secret** removes it,
- **Button label** on the sign-in page.

Then click **Check connection**. Afterwards turn on the switch **Sign-in with this provider** and save. The client secret is stored in the database encrypted with [Ablago's key](verschluesselung.md).

- **Matching:** via the email address. If it doesn't exist in Ablago, Ablago refuses – unless **Create unknown addresses as new users** is on; then a user is created – with "Full administration" or without management permission, depending on **Manage new users**. With Entra ID, the sign-in name (UPN) also serves as the address.
- **Group for "Full administration":** if it is set, "Full administration" follows the group at every sign-in: whoever is in the group gets it, whoever no longer belongs loses it. The last person with "Full administration" keeps it. A selection of individual areas stays untouched (see [Who may manage Ablago?](verwalten.md)).
- **Password sign-in only for people who may manage:** everyone else only signs in via the provider. Whoever may manage keeps their password as emergency access in case the provider can't be reached.
- **On signing out, also sign out at the provider:** whoever signed in via the provider is also signed out there on signing out (if the provider offers this).
- A set-up [two-factor sign-in](#zwei-faktor-anmeldung) in Ablago also applies here. If the provider already requires a second factor, don't additionally require it in Ablago for these roles.

Every sign-in, refusal and created user is in the [log](fehlersuche.md#protokoll). If a sign-in fails, the sign-in page shows the reason.

!!! tip "In your own network"
    If the provider runs in the home network (e.g. Keycloak on the NAS), `http://` also works – but only for addresses in your own network. Ablago must be able to reach the provider itself.

    These count as your own network:

    - `localhost` and names without a dot (e.g. `http://keycloak:8080`),
    - private IP addresses: `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `127.x.x.x` as well as private and local IPv6 addresses (`::1`, `fc…`/`fd…`, `fe80…`),
    - names with the endings `.local`, `.lan`, `.internal` and `.home.arpa` – the official ending for home networks (e.g. `http://auth.home.arpa`).

    Only the real ending counts: `auth.home.arpa.example.org` is an address on the internet and needs `https://`. Other names such as `.fritz.box` or `.home` also need `https://` – or you give the provider a name under `.home.arpa` or take its IP address. The same applies to the endpoints for [mailboxes](postfaecher.md#anderer-anbieter) with "other provider".
