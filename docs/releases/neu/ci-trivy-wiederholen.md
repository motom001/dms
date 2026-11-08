art: keine

## CI

- **Trivy-Download robuster:** Bei Störungen von github.com (504) bis zu acht Versuche mit Pause, danach ein zweiter Weg über die API. Die Prüfsumme gilt unverändert.
- **Release nicht mehr vom Trivy-Download abhängig:** Nach dem Veröffentlichen meldet Trivy nur. Lässt es sich nicht laden, gibt es eine Warnung statt eines roten Laufs ohne Release. Im Pull Request blockiert die Prüfung weiter.
