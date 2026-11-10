art: keine

## Intern

- **Routen ohne Anmeldung fest im Test** (#1029): `routen-liste.test.ts` führt alle 40 Routen mit `zugang: 'offen'` mit Grund auf. Eine neue offene Route oder ein Wechsel auf `offen` macht den Test rot und muss im PR begründet werden. Alle 40 sind von Sicherheit durchgesehen. Entwicklerhandbuch *Aufbau* (de/en) ergänzt.
