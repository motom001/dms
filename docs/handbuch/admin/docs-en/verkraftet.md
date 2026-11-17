# What Ablago can handle {#was-ablago-verkraftet}

Measured with the [load test](lasttest.md) in three levels: **small** (household, 25 simultaneous requests, 5,000 folders), **medium** (small business, 100 simultaneous with an export running alongside, 50,000 folders) and **large** (increasing the load up to the limit, 200,000 folders). The columns show p95 – 95 % of the answers were faster – and for large the limit in simultaneous requests at which 95 % of the answers still stayed below 3 s.

Since #739, every level additionally measures **with saving** (same load, about 10 % writing requests), and there is the level **extreme** (like large, with 500,000 or 1 million folders). The previous columns measure exactly as before and remain comparable with the older rows; the new values are in a separate table below. Older measurements have no row there.

The rows "GitHub machine" are measured by the project every week on GitHub's machines (workflow *Lasttest*); there Ablago, PostgreSQL and the load test run on the same machine. The other rows are reports from operators – collected in the issue [Load test results (#576)](https://github.com/motom001/dms/issues/576) and in [separate reports](https://github.com/motom001/dms/issues?q=label%3Amessergebnis-lasttest), each with version and date, because new versions can be faster or slower.

On which devices the project tests Ablago itself – and until when it expects to – is shown in the installation manual under [Tested platforms](https://help.ablago.app/installieren/aktuell/en/plattformen/).

| Device | CPU / cores | RAM | Storage | Image | Ablago | small p95 | medium p95 | large: limit | As of |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| GitHub machine (ubuntu-latest) | 4 cores (x64) | 16 GB | SSD | without container, PostgreSQL 17 alongside | 0.146.0 | 60 ms | 586 ms | 200 (136/s, p95 2.8 s) | 03.11.2026 |
| UGREEN DXP4800 Plus (maintainer) | Intel Pentium Gold 8505, 6 cores (x64) | 15.4 GB | SSD | dms-komplett | 0.153.0 | 76 ms | 423 ms | 225 (157/s, p95 2.6 s) | 03.11.2026 |
| GitHub machine (ubuntu-latest) | 4 cores (x64) | 16 GB | SSD | without container, PostgreSQL 17 alongside | 0.139.0 | 95 ms | 2,384 ms | below 25 (p95 3.2 s at 25) | 02.11.2026, first run, before speeding up (#615) |

**With saving and extreme** – p95 of the runs "+ saving", in brackets p95 of the writing requests only; for extreme the limit, the duration of creating the load test data and the size of the database:

| Device | Ablago | small + saving p95 | medium + saving p95 | large + saving p95 (at limit) | extreme 500,000: limit | extreme 1 million: limit | As of |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| GitHub machine (ubuntu-latest) | – | not measured yet | | | | | |

You have measured yourself? [Running a load test yourself](lasttest.md) describes how. You add the result block as a comment to the collective issue [Load test results (#576)](https://github.com/motom001/dms/issues/576) – or you create a separate issue with the template [Load test result](https://github.com/motom001/dms/issues/new?template=messergebnis-lasttest.yml). The project enters the reports here.

**How much memory?** What matters for choosing the device is what the **whole container** needs – in the result the row *Arbeitsspeicher Container höchstens* (container memory at most), not just *Ablago höchstens*. On the project's NAS (UGREEN DXP4800 Plus, `dms-komplett`, 200,000 folders), Ablago itself needed at most about 1 GB, the Docker interface showed just under 2 GB for the container. As a rule of thumb: for a household, a device with **2 GB** free for the container is enough; for a small business or very many folders, plan **4 GB**. Part of it is file cache that the system gives back when needed.

**One or two processes?** Since #1259 `dms-komplett`, and since #1309 the image `dms` with its own database too, uses two [processes](technik.md#mehrere-prozesse) by itself if the container may use at least 4 cores and 8 GB. On the maintainer's NAS (UGREEN DXP4800 Plus, 6 threads, 16 GB, Ablago 0.287.0, 15 Nov 2026) with one and two processes respectively: small p95 90 and 66 ms (497 and 697 requests per second), medium p95 408 and 285 ms (426 and 605 per second), load limit 250 and 450 simultaneous, memory at most 1.8 GB and just under 3 GB together. Older rows in the tables were measured with one process unless stated otherwise.

**Memory during a large export (#970):** The 1.8 GB with one process came at *medium* from the export alongside (ZIP of 20,835 folders), not from the load alone – at *large* without export it stayed at 1.1 GB. The cause was memory outside Node.js that preparing the rows took for every cell. Not any more since #970: in the test container the peak at *medium* fell from 1.1 GB to 0.7 GB, and an export now costs only a fraction of that. The promise stays **at most 1.5 GB per process**; the load test now checks it at every stage. New measurements from the NAS will follow in this table.

**How to read the table:** if *small* is below 0.3 s, Ablago feels smooth for a household. If *medium* is below 1 s, the device is also enough for a small business with large exports alongside. These values are the project's **target**. The *limit* of large is no target for everyday use – 100 simultaneous requests are already 10–15 people clicking at the same moment (see [Technology → Many simultaneous requests](technik.md#last)).

**Target and CI limit:** for *small* and *medium*, the weekly measurement on GitHub's machines turns red if it misses the **CI limit**. The CI limit came from the first run there plus 20 % and only gets stricter, at most down to the target. Since speeding up (#615), *medium* also meets the target (586 ms on GitHub's machines, 423 ms on the maintainer's NAS); so the CI limit is now **equal to the target**: 0.3 s for *small*, 1 s for *medium*. Measurements from other devices help further – report them in the collective issue [Load test results (#576)](https://github.com/motom001/dms/issues/576).
