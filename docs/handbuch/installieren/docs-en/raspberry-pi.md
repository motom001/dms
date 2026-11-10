# Raspberry Pi – step by step {#raspberry-pi-schritt-fur-schritt}

!!! info "Tested: template and arm64 image automatically, device not yet"
    GitHub's machines test the arm64 image with every change on a real ARM machine; the template is started there as a trial (amd64). There is no report from a Raspberry Pi yet; we are looking for a Raspberry Pi 5 for the project ([#589](https://github.com/motom001/dms/issues/589)). What that means is described under [Tested platforms](plattformen.md).

With this guide you get Ablago running on a **Raspberry Pi 4 or 5** – from unpacking to the first sign-in. You don't need any IT knowledge. You type or copy a few commands, and each one is explained. Allow **about an hour**, most of it waiting.

**Every step is built the same way:** what you do · what you see afterwards · what helps if it doesn't work · where the **official guide** is. If something looks different for you than here – programs get new versions –, you'll find the current state there.

1. [Shopping list](#einkaufsliste)
2. [Install the system](#system-aufspielen)
3. [Connect and find the Pi](#anschliessen)
4. [Connect to the Pi](#verbinden)
5. [Install Ablago – one command](#dms-installieren)
6. [Set up in the browser](#im-browser-einrichten)
7. [Good to know](#gut-zu-wissen)

Afterwards you can voluntarily measure [how fast your Pi is](#wie-schnell-ist-mein-pi) and help the project with it.

!!! note "The script speaks German"
    The setup script and Ablago's messages in the container log are in German. Below, each message is shown as it appears, with its meaning in English.

??? note "For advanced users: the short version"
    Write Raspberry Pi OS Lite (64-bit) with SSH to an SSD, install Docker following the [official guide for Debian](https://docs.docker.com/engine/install/debian/), then:

    ```sh
    curl -fsSLO https://raw.githubusercontent.com/motom001/dms/main/deploy/raspberry-pi/einrichten.sh
    bash einrichten.sh            # or: bash einrichten.sh /mnt/ssd/dms
    ```

    The script checks 64-bit, memory, space and Docker, creates `~/dms` with the template [`deploy/raspberry-pi/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/raspberry-pi/docker-compose.yml) (two containers) and a `.env` with a random database password, and starts. Without the script, it works as under [PC with Linux](linux.md#3-dms-starten).

## 1. Shopping list { #einkaufsliste }

| What | Recommendation | Why |
| --- | --- | --- |
| **Raspberry Pi** | **Pi 5** or **Pi 4** with **4 GB** or **8 GB** of memory | Ablago also runs with 2 GB, but it is tight. With 4 GB or more there is room for text recognition and backups. |
| **Power supply** | the **official power supply** for your model (Pi 5: 27 W, Pi 4: 15 W, both with USB-C) | A weak phone charger leads to strange errors and crashes, and the SSD gets too little power. |
| **Case with cooler** | for the Pi 5 with a fan (e.g. the official "Active Cooler"), for the Pi 4 at least a heat sink | If the Pi gets too hot, it slows itself down. |
| **SSD** | an **SSD with a USB 3 connection** (128 GB to 1 TB); for the Pi 5 alternatively an NVMe SSD on a HAT | See below: SSD instead of an SD card. |
| **Network cable** | an ordinary LAN cable to the router | More stable and faster than Wi-Fi; the Pi is then easy to find in the router. |
| **PC or Mac** | you already have one | You use it to write the system to the SSD and later set up everything in the browser. |

!!! tip "Why an SSD instead of an SD card?"
    Ablago has a **database**. It constantly writes many small changes. **SD cards wear out** doing this. An SSD is built for it, lasts many years and is **many times faster**: search, previews, text recognition and backups are noticeably quicker. The easiest is an SSD with a USB connection: you write the system directly to it and then need no SD card at all.

**What doesn't work:** Raspberry Pi 3, Pi 2, Pi 1 and Pi Zero have too little memory. A **32-bit system** doesn't work even on a Pi 4 or 5 – Ablago is only available for 64-bit.

**Official guide:** [Raspberry Pi – hardware, power supplies and cooling](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html)

## 2. Install the system { #system-aufspielen }

The "system" is **Raspberry Pi OS** – something like Windows, just for the Pi. You write it to the SSD with the program **Raspberry Pi Imager**.

!!! tip "Screenshots wanted"
    Where it says "Screenshot to follow" below, a picture is still missing. If you have the Imager in front of you right now and would like to help: [issue #591](https://github.com/motom001/dms/issues/591) lists which pictures are missing and what to look out for (no real data, no real Wi-Fi or password).

1. **Install the Imager:** download the [Raspberry Pi Imager](https://www.raspberrypi.com/software/) for your system (Windows, macOS or Linux) and install it like any other program.
2. **Connect the SSD:** plug the SSD into your PC or Mac via USB.
3. **Start the Imager** and **choose the device**: your model, i.e. *Raspberry Pi 5* or *Raspberry Pi 4*.

    !!! example "Screenshot to follow – Imager: home page"
        **Shown:** the Imager's home page with the three buttons *Choose Device*, *Choose OS* and *Choose Storage*. **Highlighted:** *Choose Device*, below it the list with *Raspberry Pi 5* and *Raspberry Pi 4*.

4. **Choose the OS:** *Raspberry Pi OS (other)* → **Raspberry Pi OS Lite (64-bit)**. "Lite" means: without a desktop. A server doesn't need one, and that leaves more memory for Ablago.

    !!! example "Screenshot to follow – Imager: choose operating system"
        **Shown:** the list of operating systems, with *Raspberry Pi OS (other)* expanded. **Highlighted:** the entry *Raspberry Pi OS Lite (64-bit)* – not the one without "(64-bit)".

5. **Choose the storage:** your **SSD**. Check the name and size – **everything on this drive will be erased**. If a USB stick or memory card is still plugged into the PC, unplug it first; then you can't mix anything up.

    !!! example "Screenshot to follow – Imager: choose storage"
        **Shown:** the list of drives with name and size. **Highlighted:** the SSD (e.g. "USB SSD – 256 GB").

6. **Customise settings:** on *Next*, the Imager asks whether you want to customise the settings → **Edit settings**. Depending on the Imager version, the questions come on one page with tabs or as separate pages one after another – the questions are the same:

    | Setting | What you enter | Why |
    | --- | --- | --- |
    | **Hostname** (name of the Pi) | `dms` | This is the name you'll find the Pi by later: `dms.local` |
    | **Username and password** | a name, e.g. `lena`, and a **good password** – write both down | You use them to sign in to the Pi in step 4 |
    | **Wi-Fi** | leave empty | You use the network cable |
    | **Time zone and keyboard** | your time zone (e.g. `Europe/London`) and keyboard layout | Correct time for deadlines and backups |
    | **SSH** (tab *Services* or *Remote access*) | **Enable SSH**, *Use password authentication* | Without SSH you can't connect to the Pi from your PC |

    !!! example "Screenshot to follow – Imager: settings"
        **Shown:** the dialog *Customise settings*, tab *General* with hostname `dms`, username `lena`, password (dots), Wi-Fi empty, time zone and keyboard; next to it the tab *Services* with the tick at **Enable SSH**. **Highlighted:** hostname, username and the tick at SSH.

7. **Write:** *Save* → *Yes* (apply settings) → *Yes* (erase drive). Depending on your computer, the system asks for your password. Writing and verifying takes **5 to 15 minutes**. At *Write Successful*, remove the SSD.

**If it doesn't work**

- *The Imager doesn't show the SSD:* use another USB port or another cable; some SSD enclosures take a moment to appear.
- *Writing aborts or verifying fails:* try again. If it happens again, the USB cable or the SSD enclosure is often to blame.
- *You can't find "Raspberry Pi OS Lite (64-bit)":* it is under *Raspberry Pi OS (other)*. If you didn't choose a model under *Choose Device*, the Imager sometimes shows more or different entries.

**Official guide:** [Getting started – Raspberry Pi Imager](https://www.raspberrypi.com/documentation/computers/getting-started.html)

## 3. Connect and find the Pi { #anschliessen }

1. **Connect – in this order:** the SSD to one of the **blue USB ports** (that's USB 3, faster), the network cable from the Pi to the router, and the power supply **last**. There is **no** SD card in the Pi.
2. **Wait:** the red light shows power, the green one flickers while the Pi is working. On the **first start** it sets itself up and restarts once. Give it **3 to 5 minutes**.
3. **Find it:** usually you simply reach the Pi by the name **`dms.local`** (the hostname from step 2 with `.local` after it). Just try it in step 4.

    If that doesn't work, look in your **router**: open its interface in the browser (the address is usually on a sticker on the router) and look for the list of devices on your home network. There the Pi is listed with the name `dms` and its **IP address**, e.g. `192.168.178.42`. Write it down.

    ![Example of a device list in a router with made-up values: the Raspberry Pi is called dms, is connected by cable and has the address 192.168.178.42](grafiken/router-geraeteliste.en.svg){ style="display:block;max-width:100%;height:auto;margin:1em auto;border-radius:14px" }

    The view looks a little different on every router; the values in the picture are made up.

!!! tip "Always the same address"
    In the router's device list you can usually set that the Pi **always gets the same IP address** (often "Always assign this device the same IPv4 address" or "DHCP reservation"). Then Ablago's address stays the same too.

**If it doesn't work**

- *The green light doesn't flicker, the Pi doesn't show up in the router:* it isn't starting from the SSD. Use another blue USB port. A **Pi 4** from the first production years can't boot from USB yet – then you have to update its bootloader once, as described in the official guide (section *Boot from USB*). Fallback: write the system to an SD card in step 2; you then use the SSD for Ablago's data (see *Folders on an additional SSD* in [step 5](#dms-installieren)).
- *The Pi keeps restarting:* almost always the **power supply**. Use the official one.

**Official guide:** [Raspberry Pi – boot process and booting from USB](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) · [Find the IP address](https://www.raspberrypi.com/documentation/computers/remote-access.html)

## 4. Connect to the Pi { #verbinden }

The Pi has no screen. You control it from your PC via a **terminal** – a window in which you type commands. The connection is called **SSH**.

1. **Open a terminal:**
    - **Windows 10 and 11:** open the Start menu, type `Terminal` or `PowerShell`, open it.
    - **macOS:** Finder → *Applications* → *Utilities* → **Terminal**.
    - **Linux:** the program *Terminal*.
2. **Connect** – type this command, with your username from step 2 instead of `lena`, and press ++enter++:

    ```sh
    ssh lena@dms.local
    ```

    If `dms.local` didn't work, use the IP address from the router: `ssh lena@192.168.178.42`.

3. **The question about the fingerprint:** on the **first** connection you see something like this:

    ```text
    The authenticity of host 'dms.local (192.168.178.42)' can't be established.
    ED25519 key fingerprint is SHA256:q3Vb0Xk1…
    This key is not known by any other names.
    Are you sure you want to continue connecting (yes/no/[fingerprint])?
    ```

    That is **normal**: your PC doesn't know the Pi yet. Type `yes` and press ++enter++.

4. **Enter the password:** `lena@dms.local's password:` appears. Type the password from step 2 and press ++enter++. **Nothing appears while you type** – no dots, no asterisks. That is normal too.

5. **Done** when the last line looks like this:

    ```text
    lena@dms:~ $
    ```

    Everything you now type into this window runs **on the Pi**. You can copy commands from this guide (button at the top right of the command) and paste them into the terminal with a **right-click** or ++ctrl+shift+v++ (Windows, Linux) or ++cmd+v++ (macOS).

**If it doesn't work**

| What you see | What it means | What helps |
| --- | --- | --- |
| `Could not resolve hostname dms.local` | Your PC doesn't know the name | Use the IP address from the router (step 3) |
| `Connection refused` | SSH is off on the Pi | Repeat step 2 and **enable SSH** |
| `Connection timed out` | The Pi can't be reached | Check the cable, wait 5 minutes, check the address in the router |
| `Permission denied, please try again.` | Username or password wrong | Mind upper and lower case; username from step 2 |
| `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!` | You reinstalled the system; your PC remembers the old Pi | Type `ssh-keygen -R dms.local` once, then connect again |

**Official guide:** [Remote access with SSH](https://www.raspberrypi.com/documentation/computers/remote-access.html)

## 5. Install Ablago { #dms-installieren }

Three steps; the commands are in boxes to copy. After each box, wait until `lena@dms:~ $` appears again.

### 5.1 Bring the system up to date {#51-system-auf-den-neuesten-stand-bringen}

```sh
sudo apt update && sudo apt full-upgrade -y
```

`sudo` means: run as administrator. The first time, the Pi asks for your password (again with nothing shown while typing). This takes a few minutes.

**Official guide:** [Updating Raspberry Pi OS](https://www.raspberrypi.com/documentation/computers/os.html)

### 5.2 Install Docker {#52-docker-installieren}

Ablago runs in **Docker** – a program that starts ready-packaged applications ("containers") without bending anything in the system. Raspberry Pi OS (64-bit) is based on Debian, so **Docker's official guide for Debian** applies. For long-term operation, Docker recommends installing Docker from its own **package source**: that's a directory on the internet from which `apt` (the Pi's package manager) loads programs – just like the programs of Raspberry Pi OS itself. The commands below are taken unchanged from that guide. There are three boxes; copy them one at a time and wait each time until `lena@dms:~ $` appears again.

**First: get the tools ready.**

```sh
--8<-- "docker-apt-1-werkzeuge.txt"
```

The first command fetches the current list of programs, the second installs two small helpers: `ca-certificates` checks whether a website is genuine, `curl` downloads files. Usually both are already there; then the Pi only reports `is already the newest version`.

**Second: add Docker's package source.**

```sh
--8<-- "docker-apt-2-debian.txt"
```

What the lines do:

- `sudo install -m 0755 -d /etc/apt/keyrings` creates the folder for the keys.
- `sudo curl … -o /etc/apt/keyrings/docker.asc` downloads Docker's **key**. With it, the Pi later checks with every download that the programs really come from Docker and nobody has changed anything on the way.
- `sudo chmod a+r …` allows the package manager to read the key.
- `sudo tee /etc/apt/sources.list.d/docker.sources <<EOF` … `EOF` writes the package source into a small file: where the programs come from (`URIs`), for which Debian version (`Suites`), for which architecture (`Architectures`) and with which key they are checked (`Signed-By`). The Pi fills in the parts in `$(…)` itself: its architecture (`arm64`) and the name of its Debian version (e.g. `trixie` or `bookworm`). You don't need to change anything. The Pi then shows the file once.
- `sudo apt update` reads the list in again – now with Docker's programs.

**Third: install Docker.**

```sh
--8<-- "docker-apt-3-pakete.txt"
```

This installs Docker itself (`docker-ce`), the `docker` command (`docker-ce-cli`), the part that actually runs the containers (`containerd.io`) and two extensions, including **Docker Compose** (`docker-compose-plugin`) – Ablago uses it to start its two containers together. The Pi shows how much it wants to download and asks `Do you want to continue? [Y/n]`: just press ++enter++. This takes a few minutes. Docker then starts by itself, also after every restart.

Finally, allow your user to use Docker without `sudo`:

```sh
sudo usermod -aG docker $USER
```

The command adds you to the group `docker`. **Then sign out once and connect again**, otherwise it doesn't apply yet:

```sh
exit
```

…and `ssh lena@dms.local` again as in step 4. Check:

```sh
docker compose version
```

If `Docker Compose version v2…` (or higher) appears, Docker is ready.

**Updates:** because Docker now comes from a package source, it is updated together with the system – with the same command as in step 5.1: `sudo apt update && sudo apt full-upgrade -y`. You update Ablago itself separately, see [Good to know](#gut-zu-wissen) and [Updating](https://help.ablago.app/admin/aktuell/en/aktualisieren/).

??? note "For advanced users: Docker's installation script"
    Docker also offers a script that does everything above in one go:

    ```sh
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    ```

    Docker itself recommends the script **only for test and development environments**, though, not for a computer that runs permanently. For your Pi with real paperwork, take the way above. By the way, the script sets up the same package source; updates then also come via `apt`.

**Official guide:** [Install Docker Engine on Debian](https://docs.docker.com/engine/install/debian/) · [Use Docker without sudo](https://docs.docker.com/engine/install/linux-postinstall/)

### 5.3 Ablago – with one command { #53-das-dms-mit-einem-befehl }

!!! warning "Look first, then start"
    A script from the internet should be looked at before you start it. Ablago's setup script is short and has detailed comments in German: [einrichten.sh on GitHub](https://github.com/motom001/dms/blob/main/deploy/raspberry-pi/einrichten.sh). You can also do it in two steps – download, look at it on the Pi (scroll with the arrow keys, quit with ++q++), then start:

    ```sh
    curl -fsSLO https://raw.githubusercontent.com/motom001/dms/main/deploy/raspberry-pi/einrichten.sh
    less einrichten.sh
    bash einrichten.sh
    ```

    The script needs **no `sudo`** and installs nothing on the system. Don't start it with `sudo` either – it refuses.

The command in one piece – it downloads the script and starts it:

```sh
curl -fsSLO https://raw.githubusercontent.com/motom001/dms/main/deploy/raspberry-pi/einrichten.sh && bash einrichten.sh
```

**What the script does:**

1. **Check:** 64-bit system, at least 2 GB of memory, enough free space, Docker with Compose. If something is missing, it says what and stops **before** it creates anything.
2. **Create:** the folder `~/dms` (i.e. `/home/lena/dms`) with the template `docker-compose.yml` – **two containers**, Ablago and its database – and a file `.env` with a **random password** for the database. You don't need to remember the password; the setup wizard doesn't need it.
3. **Start:** it downloads the programs (a few hundred MB, a few minutes the first time), starts Ablago and waits until it responds.

**What you see at the end** (values made up; the script speaks German – "Fertig! Öffne … im Browser" means "Done! Open in your browser", followed by the setup code):

```text
Fertig! Öffne auf deinem PC, Tablet oder Handy im Browser:

    http://dms.local:8080
    oder http://192.168.178.42:8080

Der Assistent fragt zuerst nach dem Einrichtungscode:

    K7QM-2XPA-9R4T

Deine Daten liegen in /home/lena/dms (Datenbank, Dokumente, Schlüssel, Sicherungen).
```

Leave the window open; you'll need the **setup code** (*Einrichtungscode*) in a moment. You can start the script **again at any time**: it leaves your data, the template and the password as they are and shows the address and code again.

**If it doesn't work** – the script says what is missing with "Abbruch:" (abort):

| Message | Meaning | What helps |
| --- | --- | --- |
| *Auf dem Gerät läuft ein 32-Bit-System* / *das System selbst aber mit 32 Bit* | a 32-bit system | Repeat step 2 with **Raspberry Pi OS Lite (64-bit)** |
| *Zu wenig Arbeitsspeicher* | too little memory | A Pi with 1 GB is not enough; you need 2 GB, better 4 GB |
| *Zu wenig freier Platz* | too little free space | Use a bigger SSD or give another folder (see below) |
| *Docker ist noch nicht installiert* | Docker is not installed yet | Step 5.2 |
| *Docker ist nur mit sudo erreichbar* | Docker can only be reached with sudo | The script asks for your password and continues. For later: sign out and connect again (step 5.2) |
| *Port 8080 ist schon belegt* | port 8080 is already in use | Another program on the Pi already uses this address. In `~/dms/docker-compose.yml`, change `"8080:3000"` e.g. to `"8081:3000"`, then `bash einrichten.sh` |
| *Die Vorlage ließ sich nicht laden* / *Die Programme ließen sich nicht laden* | the template or programs couldn't be downloaded | The Pi can't reach the internet: check the network cable, then try again |
| *Ablago antwortet nach 5 Minuten noch nicht* | Ablago still doesn't respond after 5 minutes | Look at the log: `cd ~/dms && docker compose logs app --tail 50` – and write an [issue](https://github.com/motom001/dms/issues) with the message |

??? note "Folders on an additional SSD"
    If the Pi starts from an SD card and the SSD is attached in addition, Ablago's data belongs on the SSD. The SSD must be mounted permanently for this, e.g. at `/mnt/ssd` – how that works is in the [official guide on external storage](https://www.raspberrypi.com/documentation/computers/configuration.html). Then give the script the folder:

    ```sh
    sudo mkdir -p /mnt/ssd/dms && sudo chown $USER: /mnt/ssd/dms
    bash einrichten.sh /mnt/ssd/dms
    ```

    The script warns if the folder is on the SD card.

??? note "Without the script: the individual steps"
    The script does nothing other than this (two containers, as under [PC with Linux](linux.md#3-dms-starten)):

    ```sh
    mkdir -p ~/dms && cd ~/dms
    curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/motom001/dms/main/deploy/raspberry-pi/docker-compose.yml
    (umask 077 && echo "DB_PASSWORD=$(openssl rand -hex 24)" > .env)
    docker compose up -d
    docker compose logs app | grep -A1 Einrichtungscode
    ```

    For trying out, [one container (dms-komplett)](komplett.md) also works – for long-term operation we recommend two, see [One or two containers?](index.md#ein-oder-zwei-container).

## 6. Set up in the browser { #im-browser-einrichten }

1. **Open:** on your PC, enter the address from the script in your browser, i.e. `http://dms.local:8080` (or `http://192.168.178.42:8080` with your IP address). After a fresh start it can take a minute until the page appears.
2. **Setup code:** the wizard first asks for the code the script displayed. It makes sure nobody else on your home network sets up your Ablago before you. The wizard does **not** ask for a database – the script has already filled it in.

    ![Setup code](bilder/einrichtung-code.png)

3. **Continue in the wizard:**

    --8<-- "assistent-weiter.md"

4. **Add text recognition:** in the step **Packages**, tick **Text recognition**. This makes scanned letters and photos searchable. The Pi takes a little longer for it than a big PC, but it runs in the background.

    ![Adding packages in the setup wizard](bilder/einrichtung-pakete.png)

5. **Sign in:** at the end you sign in with the administrator you created in the wizard.

    ![Sign-in](bilder/anmelden.png)

Done – your Ablago is running. How to continue (switch on backup, get going) is described under [After the installation](index.md#nach-der-installation).

!!! tip "On the phone"
    Some phones (especially older Android devices) don't know names ending in `.local`. Use the IP address there, i.e. `http://192.168.178.42:8080`.

## 7. Good to know { #gut-zu-wissen }

- **Backup to another device:** under **Workbench → Backup**, switch on the schedule, and under **Workbench → Encryption** print the **emergency sheet**. The backups end up in `~/dms/sicherung` – i.e. on the same SSD. If it breaks, they are gone too. So copy them elsewhere regularly, e.g. to a NAS or a USB disk. More under [Backup](https://help.ablago.app/admin/aktuell/en/sicherung/).
- **Update Ablago:** **Workbench → system health → Version and updates** shows whether there is a new version. To update: `cd ~/dms && docker compose pull && docker compose up -d` – or simply run `bash einrichten.sh` again. More under [Updating](https://help.ablago.app/admin/aktuell/en/aktualisieren/).
- **Update the system:** about once a month `sudo apt update && sudo apt full-upgrade -y` (step 5.1) – that also brings Docker up to date. If you don't want to forget, let security updates be installed automatically, see [PC with Linux](linux.md#4-den-rechner-zum-server-machen).
- **Heat:** with `vcgencmd measure_temp` the Pi shows its temperature. Up to about 70 °C everything is fine; from 80 °C it slows itself down. Then a fan or a more airy place helps (not in a closed cupboard).
- **Switching off:** never just pull the plug while it's running – the database could be damaged. Shut down cleanly with `sudo shutdown -h now`, wait until the green light is off, then pull the plug.
- **After a power cut** the Pi starts by itself, and Ablago starts with it.
- **On the go:** only open Ablago to the outside once the setup is done, and only with HTTPS – see [Behind a reverse proxy](https://help.ablago.app/admin/aktuell/en/installation/#hinter-einem-reverse-proxy).

### If the page doesn't load {#wenn-die-seite-nicht-ladt}

| What you see | What it means | What helps |
| --- | --- | --- |
| *This site can't be reached* right after starting | Ablago is still starting | Wait 1–2 minutes, reload the page |
| *dms.local could not be found* | Your device doesn't know `.local` names | Use the IP address: `http://192.168.178.42:8080` |
| Nothing loads, not even with the IP address | The Pi is off or Ablago isn't running | Connect to the Pi (step 4), then `cd ~/dms && docker compose ps`: `app` and `db` must show `Up`. Otherwise `docker compose up -d` |
| `permission denied while trying to connect to the Docker daemon socket` | You didn't sign in again after step 5.2 | `exit`, connect again |
| Setup code lost | – | Start `bash einrichten.sh` again; it shows it again |
| The Pi restarts by itself now and then, message *Undervoltage* in the log (`dmesg`) | The power supply delivers too little power | Use the official power supply |
| Ablago is suddenly very slow | The Pi is too hot or the SSD gets too little power | Check the temperature (see above), check the power supply |

If none of this helps, write an [issue on GitHub](https://github.com/motom001/dms/issues) with the model, memory, the message and – if available – the last lines of `docker compose logs app --tail 50` (look through them first: no names or addresses).

## How fast is my Pi? { #wie-schnell-ist-mein-pi }

How well Ablago runs on a Raspberry Pi has **not been measured yet** by the project – the machines for the measurements have Intel or AMD processors. With about **half an hour** you can help. This is **voluntary**, and Ablago itself reports nothing on its own – you decide what you send.

!!! warning "Only with a test installation"
    Measuring happens in a **separate test installation** next to your Ablago, with made-up data. Your real Library stays untouched. So that the two don't slow each other down, you pause your Ablago meanwhile – do this when nobody is working with it.

### Prepare {#vorbereiten}

Connect to the Pi (step 4), then pause your Ablago and start the test installation:

```sh
cd ~/dms && docker compose stop
mkdir -p ~/dms-test
docker run -d --name dms-test -p 8099:3000 \
  -v "$HOME/dms-test/files:/data/files" \
  -v "$HOME/dms-test/geheim:/data/geheim" \
  -v "$HOME/dms-test/sicherung:/data/sicherung" \
  -v "$HOME/dms-test/postgres:/data/postgres" \
  ghcr.io/motom001/dms-komplett:stabil
until curl -fsS http://127.0.0.1:8099/api/konto/status >/dev/null; do sleep 5; done; echo bereit
```

The test installation is [dms-komplett](komplett.md) (Ablago and the database in one container) on port 8099. When `bereit` (ready) appears, continue.

### Measurement 1: load test, level small {#messung-1-lasttest-stufe-klein}

The [load test](https://help.ablago.app/admin/aktuell/en/lasttest/) pretends that 2 to 5 people are working with Ablago at the same time, with 5,000 made-up folders. Enter your model and memory at `--geraet` and the type of storage (`SSD`, `NVMe` or `SD-Karte`) at `--speicher`:

```sh
docker exec -it dms-test dms-lasttest klein --geraet "Raspberry Pi 5 (8 GB)" --speicher SSD
```

On the Pi this takes **about 10 to 20 minutes** (first creating the folders, then measuring for 2 minutes). At the end there is a report and below it the block **Messergebnis Lasttest** (load test result). Select the block in the terminal with the mouse, copy it (Windows and Linux: ++ctrl+shift+c++ or right-click → *Copy*; macOS: ++cmd+c++) and paste it into a text file.

### Measurement 2: text recognition {#messung-2-texterkennung}

Here you measure how long the **Text recognition** package needs per page on the Pi. Everything in the browser, in the **test installation**:

1. Open `http://dms.local:8099` and sign in with the account the load test created: email `lena@example.org`, password `lasttest-passwort-1`. (Both only apply to this test installation, which you delete afterwards.)
2. **Workbench → Packages** → **Fetch catalogue** → at **Text recognition**, click **Install** and confirm the permissions.
3. **Workbench → Demo data** – the area is hidden in the sidebar; the hidden areas are listed at the bottom of the sidebar, and one click shows them. Set there:
    - **Number:** `20`
    - **Seed:** `pi-probe-1` – this way everyone who measures gets **the same** documents, and the times can be compared.
    - Tick **Create documents**, **Folders with documents** at 100 %, **Documents per folder** from 1 to 1.
    - Under **Mix**, move the slider **"Scanned" PDF** all the way to the right to 100 % (the others go to 0 % by themselves).
    - Write down the number from the **estimate**: "≈ … pages for text recognition".

    ![Workbench → Demo data](bilder/werkbank-demo.png)

4. Click **Create demo data**. As soon as "… demo folders and … documents created" appears below, **note the time**.
5. Open **Workbench → Search and full text** and reload now and then. When **nothing is waiting any more** under *Text recognition for scans and images*, **note the time** again.
6. **Calculate:** minutes × 60 ÷ pages = **seconds per page**. Example: 6 minutes for 45 pages → 360 ÷ 45 = 8 seconds per page.

### Report back {#zuruckmelden}

Open the form **[Load test result](https://github.com/motom001/dms/issues/new?template=messergebnis-lasttest.yml)** on GitHub (you need a free GitHub account for it):

- **Device/model:** e.g. `Raspberry Pi 5 (8 GB)`
- **Image:** *dms-komplett* (the test installation)
- **Data storage:** SSD, NVMe – or, for an SD card, *Don't know* and "SD card" in the remarks
- **Levels measured:** *klein* (small)
- **Result block:** the copied block, unchanged
- **Remarks:** the text recognition, e.g. like this:

    ```text
    Text recognition: seed pi-probe-1, 20 folders, ≈ 45 pages according to the estimate,
    duration 6 minutes → about 8 seconds per page. Package Text recognition, version per Workbench → Packages: …
    ```

Instead of the form, a comment in [issue #576](https://github.com/motom001/dms/issues/576) also works. **The contribution is public:** the result block contains no names and addresses – don't add any yourself either (no IP addresses, no computer names, no screenshots with real paperwork).

### Clean up {#aufraumen}

Delete the test installation and start your Ablago again:

```sh
docker rm -f dms-test
sudo rm -rf ~/dms-test
cd ~/dms && docker compose start
```

### Measurements so far {#bisherige-messungen}

The project fills in the table from the reports. More devices are listed under [What Ablago can handle](https://help.ablago.app/admin/aktuell/en/verkraftet/).

| Model | Memory | Storage | Ablago | Load test small: p95 | Error rate | Text recognition per page | Status |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| Raspberry Pi 5 | – | – | – | to follow | to follow | to follow | first measurement: maintainer |
| Raspberry Pi 4 | – | – | – | to follow | to follow | to follow | – |
