art: patch

## Sicherheit

- **Anmeldeschutz zusätzlich je Konto** (#1295):
  - Der Anmeldeschutz zählte Fehlversuche nur je Adresse und je Adresse+Konto, bei IPv6 je einzelne Adresse. Mit wechselnden Adressen ließen sich so beliebig viele Passwörter gegen ein Konto ausprobieren, etwa aus einem IPv6-/64-Netz oder mit vorgetäuschten Proxy-Köpfen.
  - Neu ist eine feste Bremse je Konto: 30 Fehlversuche in 60 Minuten, über alle Adressen. Danach nimmt Ablago für dieses Konto bis zum Ende der Stunde kein Passwort mehr an, außer aus den Ausnahmen. Das Laufwerk mit API-Schlüssel ist ausgenommen.
  - IPv6 zählt je /64-Netz.
  - Handbuch: Admin → Anmeldeschutz.
