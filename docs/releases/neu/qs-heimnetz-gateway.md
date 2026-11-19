art: patch

## Verbessert

- **Heimnetz nicht bestimmbar erkennen** (#1355): Kommen Anfragen mit der Gateway-Adresse des eigenen Netzes an (bei Docker die des Docker-Netzes, etwa mit dem Userland-Proxy, Docker Desktop oder Rootless Docker), kann Ablago Heimnetz und Internet nicht unterscheiden. Solche Anfragen gelten jetzt nicht als Heimnetz – für den Notfallzugang, die Einrichtung ohne Code und die Angabe „Heimnetz“ in den Nachweisen. Die Werkbank meldet es auf der Übersicht, unter **Anmeldeschutz → Notfallzugang** und im Systemzustand, mit den Wegen zur Abhilfe.
