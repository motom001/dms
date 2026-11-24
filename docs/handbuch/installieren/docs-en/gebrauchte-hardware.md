# Used hardware {#gebrauchte-hardware}

A Raspberry Pi 5 with power supply, case and SSD quickly costs more than many people think. It is often cheaper with a **used mini PC**, a **thin client** or the **old notebook** from the cupboard. These devices have an Intel or AMD processor (x86, "amd64"), a network port and usually an SSD. Ablago runs on them with the normal image, without any special path – and the device gets a second life.

This page helps you decide whether a device is enough, and what to look out for when buying. Afterwards, continue with the guide [PC or mini PC with Linux](linux.md).

!!! info "No device is tested by the project"
    These are values from experience, not a promise. Which devices the project tests itself is shown under [Tested platforms](plattformen.md). Reports from the community are a hint there, not a promise. We deliberately don't name manufacturers or sellers as a recommendation.

## Which devices are suitable {#welche-gerate-in-frage-kommen}

| Device | Well suited because … | Look out for … |
| --- | --- | --- |
| **Mini PC** (small office computer, often from company leasing returns) | quiet, economical, small; usually with SSD and network port | Power supply included? Room for a second drive? |
| **Thin client** (workstation computer without much storage) | very economical and silent, often very cheap | Memory and SSD are often too small – can they be upgraded? |
| **Old notebook** | already there; has a built-in battery as a small emergency power supply | Battery in continuous operation (see [below](#notebook)), network port |
| **Old office computer** (tower) | lots of room for drives, easy to upgrade | Power consumption and noise in continuous operation |

**Rather not suitable:**

- **Old smartphones and tablets:** Docker doesn't run on them, the battery is not made for continuous operation at the socket, and there are no more updates.
- **Very old computers** with a 32-bit processor: Ablago only exists for 64 bit.
- **Devices with processors older than about 2013** (e.g. 3rd generation Intel Core and older): they often still run but need a lot of power for little performance.

## What the device should have at least { #mindestens }

| | At least | Good for a household | For a small business |
| --- | --- | --- | --- |
| **Processor** | 2 cores, 64 bit (x86) | 4 cores | 4 cores or more |
| **Memory** | 2 GB | 4 GB | 8 GB |
| **Storage** | SSD with 64 GB | SSD with 128 GB or more | SSD with 256 GB or more |
| **Network** | network cable (LAN) | network cable | network cable |

The columns follow the levels of the [load test](https://help.ablago.app/admin/aktuell/en/lasttest/): *klein* is a household (5,000 folders), *mittel* a small business (50,000 folders). How different devices perform there is shown in [What Ablago can handle](https://help.ablago.app/admin/aktuell/en/verkraftet/). With the load test you can also measure your own device – and report the result to us.

**What the terms mean:**

- **Cores:** how many things the processor can do at the same time. More cores mainly help with text recognition.
- **Memory (RAM):** the fast storage in which programs run. Ablago itself needs around 1 GB, the database comes on top.
- **SSD:** storage without moving parts. It is much faster and quieter than a hard disk (HDD), and the database benefits a lot from it.

## Checklist when buying { #checkliste }

- **SSD instead of a hard disk.** If the device only has a hard disk (HDD), plan to add an SSD. For documents and backups there may also be a large hard disk.
- **Network port (LAN).** WiFi works but is slower and less reliable.
- **Power supply included.** It is often missing with used mini PCs and thin clients. A matching original power supply is safer than a copy.
- **Power consumption at idle.** The device runs around the clock. A mini PC often needs only 5 to 15 watts at idle, an old tower easily 30 to 60 watts. Each watt of continuous load is around 9 kWh a year. A simple meter for the socket shows the real value.
- **Noise.** If the device stands in a living room, look for a quiet fan or none at all.
- **Updates from the manufacturer.** Are there still BIOS or firmware updates for the model? Install the newest before setting up; manufacturers fix security holes with them, too.
- **64 bit.** Almost all processors since about 2010 can do this – if in doubt, look up the model number on the internet.

## Notebook in continuous operation { #notebook }

- **Battery:** a battery that hangs fully charged on the socket for years ages quickly and can swell. Set a **charge limit of about 80 %** in the BIOS or in the manufacturer's software. If that isn't possible, take the battery out if the notebook starts without it. A swollen battery (bulging case, touchpad lifting) must come out of the device at once and go to the recycling centre.
- **Lid closed without sleep:** the notebook must not go to sleep when you close it. On Linux, add the line `HandleLidSwitch=ignore` to the file `/etc/systemd/logind.conf` and restart. On a server system without a desktop this is usually already the case.
- **Ventilation:** don't put the notebook on fabric or in a narrow cupboard; the vents need air.

## Operating system { #betriebssystem }

A lean Linux without a desktop is enough, e.g. **[Debian](https://www.debian.org/distrib/)** or **[Ubuntu Server](https://ubuntu.com/download/server)** in the long-term support version (LTS). How to install it is described in the official guide of the respective system. Then continue with [PC or mini PC with Linux](linux.md): install Docker, start Ablago, set it up in the browser.

## Before using it again { #vorher }

- **Delete old data securely:** if the device comes from someone else or had your old data on it, erase the drive completely when installing Linux (when partitioning, "use entire disk"). For an SSD, the manufacturer's *Secure Erase* command (in the BIOS or with the manufacturer's tool) deletes most thoroughly.
- **Check the drive (SMART):** hard disks and SSDs keep track of their own condition. On Linux, `sudo smartctl -a /dev/sda` (package `smartmontools`; for NVMe SSDs `/dev/nvme0`) shows the values. What matters is *SMART overall-health: PASSED*, no *Reallocated* or *Pending Sectors* and, for SSDs, a *Percentage Used* well below 100 %. If a value stands out, take another drive – your documents should lie safely on it for years.
- **Plan a backup:** even a new device can fail, a used one all the more. Set up the [backup](https://help.ablago.app/admin/aktuell/en/sicherung/) right after setup and copy it to another place regularly.

!!! tip "Prices"
    Used mini PCs and thin clients are often available for a fraction of the new price; prices change quickly, though. Compare with the total price of a Raspberry Pi including power supply, case and SSD – and include the electricity for a few years.
