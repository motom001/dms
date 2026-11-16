/**
 * Zwischenspeicher im Arbeitsspeicher bei mehreren Prozessen (#874). Mit einem Prozess gelten die vollen Grenzen wie
 * bisher. Mit `n` Prozessen bekommt jeder `1/n` davon: Der Hauptprozess verteilt die Anfragen reihum, dasselbe
 * Dokument landete sonst in jedem Prozess einmal ganz – mit vier Prozessen also bis zu viermal 256 MB für die
 * PDF-Anzeige und viermal 64 MB für gestempelte WebDAV-Fassungen. Zusammen bleibt es so bei dem, was ein Prozess
 * belegt; ein Treffer ist dafür seltener (dann wird neu bereinigt bzw. gestempelt – langsamer, nie falsch).
 *
 * Nicht geteilt: Vektoren für die Ähnlichkeitssuche (jeder Prozess braucht den ganzen Index), der Lesespeicher für
 * Mappentypen, Ansichten und Einstellungen (#741, höchstens 64 Einträge) und die Zahlen der Ansichten (höchstens 500).
 */
let anteil = 1;

/** Anteil dieses Prozesses an den Grenzen (1 = volle Grenze). */
export const zwischenspeicherAnteil = () => anteil;

/** Beim Start von Ablago: so viele Prozesse teilen sich die Grenzen. */
export function teileZwischenspeicher(prozesse: number) {
  anteil = 1 / Math.max(1, Math.floor(prozesse));
}

/** Grenze in Bytes bzw. Einträgen für diesen Prozess, mindestens `mindestens`. */
export const anteilVon = (voll: number, mindestens = 1) => Math.max(mindestens, Math.floor(voll * anteil));
