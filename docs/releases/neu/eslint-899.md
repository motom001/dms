art: keine

## Geändert

- **ESLint und dependency-cruiser** (#899): Server, Oberfläche und gemeinsamer Code werden vor dem Merge mit ESLint 10 (mit Typinformation, React-Hooks, Größen- und Komplexitätsregeln) und dependency-cruiser (keine Kreisläufe, feste Richtung zwischen `shared`, `server` und `web`) geprüft – im neuen CI-Job „stil“ parallel zu den Tests. Bestehende Verstöße stehen in Bestandslisten, die nicht wachsen dürfen; neuer Code ist voll streng. Die vorhandenen `eslint-disable`-Kommentare sind geprüft: drei entfernt, alle übrigen mit Begründung. Nur Werkzeuge, nichts im Image.
