# Designs

Ein **Design** bestimmt die Farben der Oberfläche. Unter **Werkbank → Designs** pflegst du die Designs; jeder Benutzer wählt seines im Profil. Eines ist das **Standard**-Design für alle, die nichts anderes gewählt haben.

![Designs in der Werkbank](bilder/werkbank-designs.png)

## Mitgelieferte Designs

*Automatisch* (folgt der hellen oder dunklen Einstellung des Geräts), *Hell*, *Dunkel* und *Kontrast* (für schlechte Sicht, mit besonders starkem Kontrast).

## Eigenes Design

1. **+ Neu**
2. **Grundlage** wählen (automatisch, hell, dunkel, hoher Kontrast).
3. **Primär-** und **Sekundärfarbe** festlegen.
4. Die Vorschau zeigt sofort, wie Knöpfe, Listen und Hinweise aussehen.

Alle übrigen Farben leitet das DMS aus diesen beiden ab. Ist eine Farbe auf dem Hintergrund schlecht lesbar, hellt es sie auf oder dunkelt sie ab, bis der Kontrast reicht (WCAG 4,5:1, beim Kontrast-Design 7:1).

**Als Standard festlegen** macht ein Design zum Standard für alle. Das Standard-Design lässt sich nicht löschen.

## Eigenes CSS

Unter **Eigenes CSS** kannst du die Oberfläche weiter anpassen, etwa `.kopf { border-bottom-width: 3px; }`. `<style>`-Tags sind nicht erlaubt.

!!! warning "Oberfläche kaputt?"
    Macht ein eigenes CSS das DMS unbedienbar, hänge `?design=standard` an die Adresse, z. B. `http://nas:8080/werkbank/designs?design=standard`. Dann lädt das Standard-Design ohne eigenes CSS, und du kannst den Fehler beheben.

## Schriftgröße

Die Schriftgröße ist kein Teil des Designs: Jeder Benutzer stellt sie im Menü unter seinem Namen ein, je Gerät.
