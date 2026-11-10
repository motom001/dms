# Beispiel: lokaler KI-Dienst (Ollama) neben Ablago

Damit beantwortet das Paket **KI-Assistent** Fragen an die Ablage („Frag deine Ablage“) und füllt Felder aus Dokumenten („Aus Dokument ausfüllen“) – **ohne Cloud**: Das Modell rechnet auf deinem eigenen Gerät. Die ganze Anleitung mit Modell-Empfehlung, Speicherbedarf und Messwerten steht im Administratorhandbuch unter **[KI lokal betreiben](https://help.ablago.app/admin/aktuell/ki-lokal/)**.

| Datei | wofür |
| --- | --- |
| [`docker-compose.yml`](docker-compose.yml) | Ollama, **nur Prozessor** – läuft überall. Lädt das Modell beim ersten Start selbst. Kein Port nach außen, Speichergrenze 6 GB. |
| [`dms-anbinden.yml`](dms-anbinden.yml) | Ergänzung für das Compose-Projekt von Ablago: hängt es ins gemeinsame Netz `dms-ki`. |
| [`intel-grafik.yml`](intel-grafik.yml) | **Versuch:** Intel-Grafik im Prozessor über Vulkan (`/dev/dri`). Nicht gemessen. |
| [`nvidia.yml`](nvidia.yml) | NVIDIA-Grafikkarte (NVIDIA Container Toolkit nötig). |
| [`amd.yml`](amd.yml) | AMD-Grafikkarte mit ROCm. |
| [`probe.sh`](probe.sh) | Probe der CI: startet das Beispiel mit einem winzigen Modell und fragt es aus dem Netz `dms-ki`. |

Ollama steht unter der MIT-Lizenz; das Projekt baut **kein eigenes Image** und legt kein Modell bei. Das Modell lädt Ollama beim ersten Start aus seiner Bibliothek in den Ordner `./ollama`.

## Kurz: so geht's

1. Ordner anlegen, z. B. `/volume1/docker/dms-ki/`, und `docker-compose.yml` hineinlegen. Wenn du willst, oben das Modell ändern.
2. Starten: `docker compose up -d` (oder in der Oberfläche des NAS als Projekt). Der Dienst `modell-laden` lädt das Modell (2–3 GB) und beendet sich danach; Fortschritt mit `docker compose logs -f modell-laden`.
3. Ablago ins Netz `dms-ki` hängen: [`dms-anbinden.yml`](dms-anbinden.yml) – mit `-f` dazunehmen oder die paar Zeilen in die Compose-Datei von Ablago übernehmen – und Ablago neu starten.
4. In Ablago: *Werkbank → Pakete → KI-Assistent* installieren, Einstellungen **Dienst-Adresse** `http://ollama:11434/v1` und **Modell** wie oben, Adresse bestätigen, **Verbindung testen**.

Mit Grafik: `docker compose -f docker-compose.yml -f nvidia.yml up -d` (bzw. `amd.yml`, `intel-grafik.yml` mit `--build`).

## Warum kein Port nach außen?

Ollama hat keine Anmeldung: Wer die Adresse erreicht, kann fragen, Modelle laden und löschen. Deshalb hat das Beispiel **kein `ports:`**. Ablago erreicht Ollama über das gemeinsame Docker-Netz `dms-ki`; das Netz ist `internal`, führt also nicht nach draußen. Ins Internet kommt nur der Ollama-Container selbst über sein eigenes Netz – zum Laden des Modells. Die Cloud-Funktionen von Ollama sind ausgeschaltet (`OLLAMA_NO_CLOUD`).

## Aktualisieren

Die Ollama-Version steht fest (`ollama/ollama:0.40.15`) – in `docker-compose.yml` (zweimal), `intel-grafik.yml` und `amd.yml`. Für eine neue Version die Nummer in allen drei Dateien ändern und neu starten (`docker compose pull && docker compose up -d`). Die CI prüft, dass überall dieselbe Nummer steht. Neue Versionen schlägt Dependabot jede Woche als Pull Request für `docker-compose.yml` vor; `amd.yml` und `intel-grafik.yml` kommen im selben Pull Request von Hand dazu – die Probe nennt den Befehl dafür.
