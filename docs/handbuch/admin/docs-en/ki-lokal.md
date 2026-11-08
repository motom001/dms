# Running AI locally {#ki-lokal-betreiben}

With the package **AI assistant**, Ablago answers questions about your Library ([Ask your library](pakete.md#frag-deine-ablage)) and fills in fields from documents ([Fill in from document](pakete.md#erkennung-durch-ein-paket)); from version 1.3.0 it also suggests where new post belongs ([Where does this belong?](pakete.md#wohin-gehoert-das)). The package doesn't compute anything itself – it asks an **AI service**. If this service runs at your home, for instance on your NAS, you need **no cloud**: the data doesn't leave the house.

For the service there is a ready-made example with **[Ollama](https://ollama.com)** (MIT licence): [`deploy/beispiele/ki-ollama/`](https://github.com/motom001/dms/tree/main/deploy/beispiele/ki-ollama). It starts with `docker compose up -d`, downloads the model by itself at the first start and **can't be reached from outside** – only Ablago talks to it.

!!! warning "A NAS is not an AI computer"
    Without a graphics card, the processor does the computing. That works but is slow: on a typical NAS, expect **half a minute to two minutes per answer**, not seconds (see [How fast is it?](#geschwindigkeit)). For "Fill in from document", which may run in the background, that is often enough; for a fluent conversation rather not.

## What goes to the AI service { #was-geht-wohin }

- **Ask your library:** the question, the chat so far and **a few excerpts** that Ablago itself has picked out – only from folders the person asking may read, at most as many as set under [Maximum per question](pakete.md#frag-deine-ablage) (default 8 excerpts, together 6,000 characters).
- **Fill in from document:** the document's text (at most 50,000 characters), the name of the folder type and a description of the fields – never password fields, never fields the user may not edit.
- **Never:** the whole stock, files or images, users, passwords.
- **Only from allowed folder types:** the AI assistant is an AI package – it only receives content from folder types that are allowed for AI services; new ones only once you allow them (see [AI services and folder types](pakete.md#ki-dienste)). When it sent what to where is shown in its [network calls](pakete.md#netzaufrufe).

If Ollama runs at your place, all of this stays in the house. The example switches off Ollama's cloud functions (`OLLAMA_NO_CLOUD=1`, no computing at Ollama on the internet). Ollama only goes to the internet to download the model. Ollama doesn't write content into the log – for that, do **not** switch on `OLLAMA_DEBUG`, which also shows the requests.

## What you need {#was-du-brauchst}

- Ablago from **0.125.0** and the package **AI assistant** from 1.1.1 (Workbench → Packages).
- Docker with Compose on the device on which Ablago runs (for another computer see [Ollama on another computer](#anderer-rechner)).
- **Space:** a few GB for the Ollama image (it brings the libraries for NVIDIA and Vulkan) and 2–3 GB per small model, best on an SSD – from a hard disk, loading the model takes longer.
- **Memory:** a small model occupies about 3–4 GB while computing. The example limits the AI container to 6 GB so that Ablago, the database and other containers keep enough.

## Setup step by step { #einrichtung }

### 1. Start the AI service {#1-ki-dienst-starten}

1. Create a folder, e.g. `/volume1/docker/dms-ki/`, and put the file [`docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/docker-compose.yml) from the example into it.
2. If you want another model, change the line `x-modell: &modell "ministral-3:3b"` at the top (see [Which model?](#modell)).
3. Start the project – on the command line in the folder with `docker compose up -d`, in the NAS's interface as a new project (name e.g. `dms-ki`, paste the Compose file).
4. The service **`modell-laden`** now fetches the model (2–3 GB) and **then exits** – so "Exited" is correct for it. Progress: `docker compose logs -f modell-laden`. At the next start it sees that the model is already there and downloads nothing.

The project creates the Docker network **`dms-ki`**. It is `internal`, so it doesn't lead outside; Ollama has **no port to the outside**. That is intentional: Ollama has no sign-in – whoever reaches the address can ask questions, download and delete models.

### 2. Attach Ablago to the network `dms-ki` { #2-das-dms-ins-netz-dms-ki-hangen }

Ablago must reach Ollama. For that it additionally joins the network `dms-ki`. In **Ablago's** Compose file, add the networks to the service `app` (with `dms-komplett` it is called `dms`) and the block `networks:` at the end:

```yaml
services:
  app:
    # … as before …
    networks:
      - default
      - dms-ki

networks:
  dms-ki:
    external: true
```

Then restart the Ablago project. On the command line it also works without changing the file: `docker compose -f docker-compose.yml -f /volume1/docker/dms-ki/dms-anbinden.yml up -d` with [`dms-anbinden.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/dms-anbinden.yml) from the example.

!!! note "Order"
    Start the AI service **before** Ablago: it creates the network `dms-ki`. If the network is missing, Ablago doesn't start ("network dms-ki declared as external, but could not be found").

**Prefer everything in one project?** You can also take the services `ollama` and `modell-laden` directly into Ablago's Compose file. Then both are in the same network, and the lines above are not needed; you then also leave out the block `networks:` with `dms-ki` (and the line `- dms-ki` at `ollama`).

### 3. Set up the package {#3-paket-einrichten}

1. *Workbench → Packages → AI assistant → Install*, confirm the permissions.
2. Tab **Settings**:
    - **Service address:** `http://ollama:11434/v1` – `ollama` is the name of the service in the network `dms-ki`. `http://` is right here: the connection stays in the Docker network on the same device.
    - **Model:** exactly the name from the Compose file, e.g. `ministral-3:3b`.
    - **Key (API key):** leave empty.
3. **Save** and confirm the address (**Confirm address and save**) – see [Service address](pakete.md#dienst-adresse).
4. **Test connection.** The message says whether Ollama can be reached, whether the model is there and how long a short test answer took. The first test takes longer because Ollama first loads the model into memory.

### 4. On a NAS without a graphics card: less at once { #nas-einstellungen }

Without a graphics card, **reading** above all costs time: every excerpt must first go through the model before the first word comes. On a NAS without a graphics card we therefore recommend:

| Setting | where | Default | on a NAS without graphics |
| --- | --- | --- | --- |
| Excerpts per question at most | Workbench → Packages → AI assistant → Ask your library | 8 | **4** |
| Characters per question at most | same place | 6,000 | **3,000** |
| Answer at most (tokens) | package settings | 800 | **400** |
| Time limit (seconds) for Fill in from document | package settings | 50 | **55** (highest value) |

Fewer excerpts means: faster answers, but more often "isn't in the excerpts". Try it with your own questions.

### Ollama on another computer { #anderer-rechner }

A PC with a graphics card in the home network is usually much faster than a NAS. Start Ollama there (or the example with [`nvidia.yml`](#nvidia) or [`amd.yml`](#amd)) and make it reachable in the home network – in the example with `ports: ["11434:11434"]` at the service `ollama`, in a normal installation with `OLLAMA_HOST=0.0.0.0`. In Ablago you then enter `http://<address of the PC>:11434/v1`, e.g. `http://192.168.1.20:11434/v1`.

Because Ollama has no sign-in, **every device in the home network** can then reach it. Best allow the port in the PC's firewall only for the NAS's address, and never open it to the outside in the router. The PC must be running when the AI is to work; otherwise Ablago reports "can't be reached", and *Fill in from document* uses the built-in recognition.

## Which model? { #modell }

A **model** is what does the computing; Ollama downloads it from its library. The size in **billions of parameters** (bn) determines quality, speed and memory requirement. Ollama usually downloads the models rounded to 4 bits ("quantised") – that halves to quarters the memory requirement with hardly worse answers.

As of 11/2026, with an open licence:

| Model (name at Ollama) | Size | Licence | Memory while computing approx. | what for |
| --- | --- | --- | --- | --- |
| **`ministral-3:3b`** (Mistral AI) | 3 bn | Apache-2.0 | 4 GB | **Recommended without a graphics card** – "Ask your library" and "Fill in from document"; speaks German well. Preset in the example. |
| `granite4.1:3b` (IBM) | 3 bn | Apache-2.0 | 3 GB | Alternative without a graphics card |
| `ministral-3:8b` (Mistral AI) | 8 bn | Apache-2.0 | 7–8 GB | with a graphics card (8 GB); without graphics only for background work such as "Fill in from document" – then `mem_limit: 9g` |
| `qwen2.5:7b` (Alibaba) | 7 bn | Apache-2.0 | 6–7 GB | with a graphics card; proven for structured output |

The memory figures are rough values for the model with the context from the example (8,192 tokens); `docker stats` shows what it really needs at your place. The package has **one** field *Model* – so "Ask your library" and "Fill in from document" use the same model.

**Less suitable:**

- **Models that "think"** – such as `qwen3`, `qwen3.5` or models with *thinking* in the name. Ollama lets them think for a long time before the actual answer. The AI assistant switches this off from 1.1.1 (`reasoning_effort: none`); whether a model sticks to it hasn't been measured. With older versions this means on a NAS: minutes without a visible answer, often up to the time limit.
- `qwen2.5:3b` (named as an example in the package's description) is under the *Qwen Research License* – not an open licence, only for non-commercial use. `llama3.2:3b` is under the *Llama 3.2 Community License* with terms of use. Both run well technically; check the licence if you don't use Ablago only privately.
- Very small models (under 2 bn) are fast but more likely to invent values with *Fill in from document*.

**Do I need an embedding model?** No. The similarity search (similar documents, search in your own words, excerpts by similarity) is done by the package **Local AI – similarity** directly in Ablago, with a small model of its own and without Ollama. The AI assistant doesn't fetch embeddings from Ollama. So don't download an embedding model into Ollama – it would only take up space.

## Context, memory and processor { #kontext-speicher }

The Compose file sets a few values that matter on a NAS:

| Setting | in the example | why |
| --- | --- | --- |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | This much text the model reads at once (about 20,000 characters of German). Without a graphics card Ollama otherwise takes **4,096** – then **Ollama silently drops older messages** when a request is too long: with long chats the excerpts, with long documents the text. The answer then has no basis. Enter the same value in the package under **Context length** (see below). |
| `mem_limit` | `6g` | Memory limit for the AI container. If the model needs more, Docker ends the container (it restarts); then take a smaller model or raise the limit. |
| `cpu_shares` | `256` | If Ablago and AI compute at the same time, Ablago gets priority – the Library stays usable. |
| `OLLAMA_KEEP_ALIVE` | `30m` | The model stays in memory for 30 minutes after the last question; afterwards the memory is free, and the next question loads it again (a few seconds). |
| `OLLAMA_NUM_PARALLEL`, `OLLAMA_MAX_LOADED_MODELS` | `1` | one request, one model at a time – predictable memory |

**Context length in the package:** the AI assistant (from 1.2.0) has the setting **Context length** (default 8,192 tokens, matching the example). If a request is longer, **the package** shortens it itself before Ollama silently cuts it off – and says so: with *Ask your library* "Sent to the AI: 6 of 9 excerpts (shortened)" (with long chats, older questions and answers are dropped first), with *Fill in from document* "Document text shortened". **Never** set the context length larger than `OLLAMA_CONTEXT_LENGTH` – otherwise Ollama silently cuts off again. Larger means: more text at once, but more memory and slower reading. The display needs Ablago from 0.138.0.

For *Fill in from document* with **long documents**, 8,192 isn't quite enough (Ablago passes up to 50,000 characters). With `16384` the container needs about 0.5–1 GB more; without a graphics card, though, such long texts exceed the time limit anyway, and the built-in recognition takes over.

## How fast is it? { #geschwindigkeit }

!!! warning "Estimate – not measured"
    The values in this section are an **honest estimate** from experience with similar processors, not a measurement. Measured values go into the table [Measurements](#messwerte).

Estimated for a **UGREEN DXP4800 Plus** (Intel Pentium Gold 8505, 5 cores, 16 GB) **with the processor only** and a model with 3 bn parameters:

| | Estimate |
| --- | --- |
| Loading the model (after a break, from SSD) | 5–20 s |
| Reading (excerpts, document text) | 30–60 tokens/s |
| Writing (the answer) | 5–9 tokens/s, i.e. about 3–6 words per second |
| Ask your library with the default maximum (8 excerpts, 6,000 characters) | first word after 40–90 s, whole answer after 1–2 minutes |
| Ask your library with 4 excerpts, 3,000 characters ([recommendation](#nas-einstellungen)) | first word after 20–45 s, whole answer after 40–90 s |
| Fill in from document, one page (approx. 2,500 characters) | 30–60 s – close to the time limit |
| Fill in from document, several pages | above the time limit → the built-in recognition takes over |

**So on such a device, answers take half a minute to two minutes rather than a few seconds.** The package has at most 2 minutes for one call; an answer that needs longer is cancelled. With a graphics card (NVIDIA, AMD), the same answers are usually there within a few seconds.

## Measurements { #messwerte }

We enter measured values here – every line with date and versions, because new versions of Ollama and new models can be faster or slower.

| Device | CPU / graphics | RAM | Variant | Model | Reading tokens/s | Writing tokens/s | Ask: first word / whole | Fill in (1 page) | Memory | Ollama / Ablago | As of |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| UGREEN DXP4800 Plus | Pentium Gold 8505 / – | 16 GB | processor only | ministral-3:3b | – | – | – | – | – | 0.40.13 / 0.136.0 | measurement to follow |
| UGREEN DXP4800 Plus | Pentium Gold 8505 / Intel UHD | 16 GB | Intel graphics (trial) | ministral-3:3b | – | – | – | – | – | 0.40.13 / 0.136.0 | measurement to follow |

### Measuring yourself { #selbst-messen }

1. **Reading and writing:** ask a question with timings in the AI container –

    ```sh
    docker compose exec ollama ollama run ministral-3:3b --verbose "Summarise in three sentences what home contents insurance is for."
    ```

    At the end there are, among others, `prompt eval rate` (**reading**, tokens/s) and `eval rate` (**writing**, tokens/s). For reading, a longer question is more meaningful – paste in a page of text, for example.
2. **Ask your library:** ask a typical question in Ablago and measure with a stopwatch until the first word appears and until the answer is finished. Ask twice – the first question loads the model.
3. **Fill in from document:** take a one-page invoice or a letter, measure the time until the suggestions; also note whether suggestions came or the built-in recognition took over.
4. **Memory:** during an answer `docker stats --no-stream` – column *MEM USAGE* of the container `ollama`.

You can fill in this block and report it voluntarily as a [new issue](https://github.com/motom001/dms/issues/new/choose) with the title "Measurement local AI: *device*". It contains no names, addresses or content – don't enter any either. The contribution is public; Ablago itself reports nothing.

```text
Measurement local AI
Ablago version:              
Package AI assistant:        1.1.1
Ollama:                      0.40.13
Variant:                     processor only | Intel graphics (trial) | NVIDIA | AMD
Device:                      
CPU / cores / graphics:      
Memory / limit:              16 GB / 6 GB
Model:                       ministral-3:3b
Context:                     8192
Reading (prompt eval rate):  … tokens/s
Writing (eval rate):         … tokens/s
Ask your library:            first word … s, finished … s (maximum … excerpts / … characters)
Fill in from document:       … s, result: suggestions | built-in recognition took over
Memory AI container:         … GB (peak)
```

## With graphics { #grafik }

For graphics you add one of the extensions from the example to the Compose file. In a NAS interface that only knows one file, you take over the few lines of the extension by hand into the service `ollama`.

### Intel graphics in the processor (trial) { #intel }

Many NAS and mini PCs have **Intel graphics in the processor** (UHD, Iris Xe) but no slot for a graphics card. Ollama officially supports NVIDIA and AMD; Intel graphics only works via **Vulkan**. In the official image (version from the example), Vulkan is included and switched on as soon as the container sees the graphics – but only the Vulkan loader, **no driver for Intel graphics**. The extension [`intel-grafik.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/intel-grafik.yml) therefore builds a small image on your device at the first start: the official Ollama in the same version plus the Mesa driver from Ubuntu. It contains no model and is not maintained by the project.

```sh
docker compose -f docker-compose.yml -f intel-grafik.yml up -d --build
```

Whether Ollama uses the graphics is in the log (`docker compose logs ollama`) in the line `inference compute` with `library=Vulkan`. If it only says `library=cpu`, the processor is still doing the computing.

**What to expect:** small graphics in the processor share the memory with the processor; when writing the answer they therefore bring little. When **reading** – the slowest part on a NAS – they could help and take load off the processor. Whether that is true and whether it runs stably has **not been measured**. We only recommend the variant once measurements show it; until then **"processor only"** is the safe choice. If something goes wrong, restart without `intel-grafik.yml`.

### NVIDIA { #nvidia }

With [`nvidia.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/nvidia.yml). Needed on the device: the NVIDIA driver and the *NVIDIA Container Toolkit* (on Unraid the plugin "Nvidia Driver", on TrueNAS built into the apps). With 8 GB of graphics memory, models up to 8 bn parameters run fluently.

### AMD { #amd }

With [`amd.yml`](https://github.com/motom001/dms/blob/main/deploy/beispiele/ki-ollama/amd.yml) – takes the image `ollama/ollama:<version>-rocm` and passes `/dev/kfd` and `/dev/dri` into the container. The amdgpu driver with ROCm 7 is needed; which cards work is in the Ollama documentation under "GPU". For cards that ROCm doesn't know, try the Vulkan variant (`intel-grafik.yml`).

## Notes per NAS { #nas }

- **UGREEN (UGOS Pro):** *Docker → Project → Create*, paste the Compose file. The project creates the network `dms-ki` itself; in the Ablago project you add the lines from [step 2](#einrichtung) and rebuild it. The Intel variant (`/dev/dri`, a small image of its own) is easiest via SSH on the command line.
- **Synology (Container Manager):** *Container Manager → Project → Create*, paste the Compose file. Expect "processor only"; most models have no usable graphics.
- **QNAP (Container Station):** *Container Station → Applications → Create*, paste the Compose file; "processor only", for models with a graphics card the NVIDIA variant.
- **Unraid:** with the plugin *Docker Compose Manager* as for [Ablago](https://help.ablago.app/installieren/aktuell/en/unraid/); for NVIDIA install the plugin "Nvidia Driver" first.
- **TrueNAS:** *Apps → Custom App* with the Compose file, as with the [template for Ablago](https://help.ablago.app/installieren/aktuell/en/truenas/).
- **Umbrel, CasaOS, ZimaOS:** Ollama is available in the app store there; address and setup are in the description of the package AI assistant.

Ollama runs on **amd64 and arm64** (e.g. Raspberry Pi 5) – there, though, only with the processor and correspondingly slowly.

## Does my Coral stick or my NPU help? { #coral-npu }

**No, not for language models.** Image accelerators such as the **Google Coral** (Edge TPU) only compute very small TensorFlow Lite models with a few MB of memory – a language model with billions of parameters doesn't fit, and Ollama can't use them. Text recognition and similarity search in Ablago don't benefit either. Such sticks are good for camera software, for instance for object detection in the video image.

The same applies to the **NPU** in newer processors: Ollama doesn't use it.

## If the NAS is too slow { #zu-langsam }

Devices and prices are examples as of 11/2026 – they go out of date quickly.

1. **Measure first:** a small model with the processor only (see [Measuring yourself](#messwerte)). For background work such as *Fill in from document* that is often enough, especially with the [settings for a NAS](#nas-einstellungen).
2. **An existing PC with a graphics card** (NVIDIA or AMD): Ollama there, Ablago points to it via the service address ([Ollama on another computer](#anderer-rechner)). Usually the fastest solution without costs; disadvantage: the PC must be running when the AI is to work.
3. **A small AI device of your own**, e.g. NVIDIA Jetson Orin Nano Super (around $400, about 25 W). Ollama runs on it, fluently with models of 2–8 bn parameters; 8 GB of memory is tight, though.
4. **A mini PC with a lot of shared memory** (Apple chip, AMD Ryzen AI Max) – comfortable, usually more than a household needs.

What does **not** help:

- **USB accelerators** don't help with language models – besides the Coral also sticks with Hailo-10H (e.g. ASUS UGen300): they can only run a few specially converted small models with a short context (about 2,000 tokens) and don't write text faster than a processor. They are meant for image recognition.
- An **external graphics card** only works if the device has Thunderbolt or USB4 – most NAS don't.

Without any additional device, the **similarity search** with the package **Local AI – similarity** runs directly in Ablago and fast enough even on a NAS: similar documents and search in your own words, just without answers in whole sentences.

## Troubleshooting { #fehlersuche }

| Message or sign | Cause and remedy |
| --- | --- |
| *Test connection*: service can't be reached | Is the AI project running (`docker compose ps`)? Is Ablago attached to the network `dms-ki` (`docker network inspect dms-ki` – `ollama` and Ablago must be listed there)? Does the service address say exactly `http://ollama:11434/v1`? |
| *Test connection*: model not there | Did `modell-laden` run through (`docker compose logs modell-laden`)? Does the name in the package match `x-modell` exactly? Catch up with `docker compose up -d modell-laden`. |
| Ablago doesn't start: "network dms-ki … could not be found" | Start the AI project first – or take the lines for `dms-ki` out of Ablago's Compose file again. |
| Container `ollama` keeps restarting | Usually the memory limit: `docker inspect <container> --format '{{.State.OOMKilled}}'` shows `true`. Smaller model or raise `mem_limit`. |
| The answer doesn't fit the excerpts or is "plucked from thin air" | Too little context – check `OLLAMA_CONTEXT_LENGTH` and don't set the **context length** in the package larger (see [Context](#kontext-speicher)); with long chats **New chat**. |
| "(shortened)" with *Ask your library* or "Document text shortened" | The request was longer than the package's **context length**. Set fewer characters per question or – with enough memory – raise `OLLAMA_CONTEXT_LENGTH` and the context length in the package together. |
| *Fill in from document*: "returned nothing usable" | The service answered but with no value that fits the fields – the built-in recognition took over. With small models this happens; a larger model or clearer field labels help. |
| The answer breaks off or *Fill in from document* always uses the built-in recognition | Time limit reached – see [settings for a NAS](#nas-einstellungen), smaller model or graphics. |
| The Library becomes sluggish while the AI is computing | The model is using the processor. Take over `cpu_shares` from the example; if necessary fewer excerpts per question. |

The package's latest calls with their duration are under **Workbench → Packages → AI assistant** in the section [Package runner](pakete.md#pakete-mit-code) – without content.

## Removing {#entfernen}

1. Uninstall the package AI assistant in Ablago (or clear the service address).
2. Take the lines for `dms-ki` out of Ablago's Compose file and restart Ablago.
3. Stop and delete the AI project (`docker compose down`), then delete the folder with the models (`ollama`).
