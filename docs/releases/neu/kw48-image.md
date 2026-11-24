art: minor

## Beim Update beachten

- **Node.js 26** (#1473): Die Images bauen auf `node:26-alpine` auf. Für Betreiber ändert sich nichts. Wer ein eigenes Image auf Ablago aufbaut oder Ablago ohne Container betreibt, braucht jetzt Node.js 26; für die Entwicklung gilt dasselbe (`engines` in `package.json`).

## Geändert

- **Image kennt seine Version** (#1447): Das Image setzt `DMS_VERSION` beim Bau auf die Release-Version. Der Abgleich der Fassungen beim Start läuft damit einmal je Version und nennt sie („Update auf Ablago 0.x.y“ statt „Entwicklung“). Der erste Start nach dem Update holt das einmal nach; doppelte Fassungen oder Mappentypen entstehen dabei nicht.
- **Image nur mit stabilen Versionen** (#1480): `ghcr.io/motom001/ablago:<Version>` trägt nur Versionen, die zu `:stabil` befördert wurden – derselbe Digest wie `ghcr.io/motom001/dms:<Version>`. Gedacht für App-Kataloge wie TrueNAS, die sonst jedes Release übernehmen.
