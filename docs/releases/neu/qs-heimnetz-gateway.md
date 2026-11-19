art: patch

## Verbessert

- **Heimnetz nicht bestimmbar erkennen** (#1355): Kommen Anfragen mit der Gateway-Adresse des eigenen Netzes an (bei Docker die des Docker-Netzes, etwa mit dem Userland-Proxy, Docker Desktop oder Rootless Docker), kann Ablago Heimnetz und Internet nicht unterscheiden. Solche Anfragen gelten jetzt nicht als Heimnetz – für den Notfallzugang, die Einrichtung ohne Code und die Angabe „Heimnetz“ in den Nachweisen. Die Werkbank meldet es auf der Übersicht, unter **Anmeldeschutz → Notfallzugang** und im Systemzustand, mit den Wegen zur Abhilfe.
- **Gateway gilt nicht automatisch als Proxy** (#1355): Bei `TRUST_PROXY` nicht gesetzt oder `auto` glaubt Ablago Proxy-Angaben weiter von privaten Adressen, aber nicht mehr vom Gateway des Docker-Netzes. Läuft dein Reverse-Proxy auf demselben Rechner wie Ablago (z. B. der Reverse-Proxy von DSM auf einer Synology), trage die Gateway-Adresse ausdrücklich in `TRUST_PROXY` ein; die Werkbank nennt sie. Ein Proxy als Container oder auf einem anderen Rechner im Heimnetz braucht nichts.

## Beim Update beachten

- **Reverse-Proxy auf demselben Rechner wie der Container** (z. B. der Reverse-Proxy von DSM auf `localhost`): `TRUST_PROXY` auf die Gateway-Adresse des Docker-Netzes setzen, etwa `TRUST_PROXY: "172.18.0.1"`. Die Werkbank nennt die Adresse auf der Übersicht und unter **Anmeldeschutz → Notfallzugang**. Ohne die Angabe teilen sich alle Anfragen eine Adresse, auch für den Anmeldeschutz. Anmelden geht in beiden Fällen.
