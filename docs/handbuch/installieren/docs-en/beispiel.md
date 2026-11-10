# How the developer runs it {#so-lauft-es-beim-entwickler}

This page shows how Ablago runs at my home every day. It is **an example, not a recommendation and not a must**. Any other NAS, a mini PC or an old computer with Docker does the job just as well; the guides for them are on the left. Here it is about *why* I did something this way. Perhaps that helps with your own decisions.

![Example setup: access via Nginx Proxy Manager to Ablago; documents and keys on an SSD, backups on RAID 5 and as a copy in the cloud](grafiken/aufbau-entwickler.en.svg){ style="display:block;max-width:100%;height:auto;margin:1em auto;border-radius:14px" }

## The device {#das-gerat}

Ablago runs on a **UGREEN DXP4800 Plus** with the **Docker app of UGOS**. There, Ablago is a *project* with the Compose template that is also in the guide for [UGREEN](ugreen.md). There is no special solution: I use the same template as everyone else. That way I notice myself when something in the guide gets stuck.

## Access on the go {#zugriff-von-unterwegs}

A second container, **[Nginx Proxy Manager](https://nginxproxymanager.com/)** (`jc21/nginx-proxy-manager`), publishes Ablago to the outside, with an HTTPS certificate. This way I use Ablago fully from my phone, also on the go. The data still stays on the NAS at home.

In Ablago, all that's needed is the public address entered under **Workbench → email and address**. Ablago recognises by itself that the requests come via the proxy. What's behind this is described in the Administrator manual under [Behind a reverse proxy](https://help.ablago.app/admin/aktuell/en/installation/#hinter-einem-reverse-proxy).

!!! tip "Set up first, then publish"
    Only make Ablago reachable from outside once the setup is complete.

## Storage: fast where it counts – safe where it counts {#speicher-schnell-wo-es-zahlt-sicher-wo-es-zahlt}

UGOS can create several storage pools and volumes. I use that to distribute Ablago's folders by purpose:

| Folder | is on | Why |
|---|---|---|
| Documents (`files`) and keys (`geheim`) | a single **SSD** | Opening and searching documents should be fast. |
| Backups (`sicherung`) | a **RAID 5** of ordinary hard disks | The backups survive the failure of one disk. |
| Copy of the backups | **cloud storage** off site | UGREEN's app **Backup & Sync** copies *only* the `sicherung` folder there – in case something happens to the whole NAS. |

For this I simply adjust the paths in the Compose configuration. Ablago itself doesn't notice any of it.

## The deliberate trade-off {#die-bewusste-abwagung}

The SSD is **single**. If it fails, the documents and the key on it are gone. I accept that because two things are kept separately:

- the **backups**, on the RAID and in the cloud,
- the **[emergency sheet](https://help.ablago.app/admin/aktuell/en/verschluesselung/#notfallblatt)** with the key, in my password manager on my phone.

With both, Ablago can be [restored](https://help.ablago.app/admin/aktuell/en/wiederherstellen/) on a new disk or a new device. Important here: the key is **not** with the backups. The backups are encrypted with it, and whoever gets hold of a copy can't do anything with it without the key.

If you want more resilience, mirror the SSD (RAID 1). That costs a second SSD.

## What I don't recommend just because I do it this way {#was-ich-nicht-empfehle-nur-weil-ich-es-so-mache}

- **The device:** I use it because it suits my requirements. There is no affiliate link or payment for it, see ["How the project is funded"](https://github.com/motom001/dms#so-finanziert-sich-das-projekt).
- **The proxy:** any other reverse proxy works too, such as your NAS's built-in one, Caddy or Traefik.
- **The cloud:** a USB disk at relatives' or a second NAS off site serves the same purpose.

Questions about this setup or ideas on what could be done better are welcome in the [issues](https://github.com/motom001/dms/issues).
