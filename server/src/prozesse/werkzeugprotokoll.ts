/**
 * Protokoll zwischen Ablago und dem Werkzeugdienst (#1354), eine Verbindung je Aufruf über einen Unix-Socket:
 *
 * - Ablago → Dienst: eine Zeile JSON (`Auftrag`), danach – nur mit `eingabe` – die Standardeingabe des Programms als
 *   Rahmen (Stück, Ende der Eingabe).
 * - Dienst → Ablago: Rahmen aus Art (1 Byte), Länge (4 Byte, big-endian) und Inhalt: Ausgabe, Fehlerausgabe, Ende
 *   (JSON mit Code und Signal) oder Startfehler (JSON mit Code wie ENOENT).
 * - Ablago schließt seine Seite nie halb: Endet die Verbindung, ist Ablago fertig oder weg, und der Dienst beendet das
 *   Programm samt allem, was es gestartet hat.
 */

import { WERKZEUG_AUFTRAG_MAX, WERKZEUG_RAHMEN_MAX } from '../grundlagen/grenzen';

export interface Auftrag {
  befehl: string;
  args: string[];
  /** Wanduhr-Grenze (ms); der Dienst beendet das Programm spätestens danach. */
  zeitMs?: number;
  /** Standardeingabe folgt nach der Zeile. */
  eingabe?: boolean;
  /** Um so viel niedriger rechnen (nice, #893). */
  nice?: number;
}

/** Eingebauter Auftrag: Benutzer und Grenzen, unter denen die Werkzeuge laufen (für Systemzustand und Probe). */
export const STAND_AUFTRAG = '__stand';
/** Was der Stand-Auftrag ausgibt: „uid gid ulimit-v ulimit-t ulimit-f“ – so, wie ein Werkzeug sie sieht. */
export const STAND_SKRIPT = 'echo "$(id -u) $(id -g) $(ulimit -v) $(ulimit -t) $(ulimit -f)"';

export const RAHMEN = { aus: 1, err: 2, ende: 3, fehler: 4, ein: 5, einEnde: 6 } as const;
export type RahmenArt = (typeof RAHMEN)[keyof typeof RAHMEN];

/** Längste Zeile des Auftrags (Argumente sind Pfade und Schalter). */
export const AUFTRAG_MAX = WERKZEUG_AUFTRAG_MAX;

export function rahmen(art: RahmenArt, inhalt: Buffer | string): Buffer {
  const b = typeof inhalt === 'string' ? Buffer.from(inhalt) : inhalt;
  const kopf = Buffer.alloc(5);
  kopf[0] = art;
  kopf.writeUInt32BE(b.length, 1);
  return Buffer.concat([kopf, b]);
}

/**
 * Größter Rahmen. Der Dienst schickt die Ausgabe in Stücken einer Pipe (höchstens 64 KB); was größer ist, kommt nicht
 * vom Dienst – Ablago behandelt alles von dort als nicht vertrauenswürdig (#1354).
 */
const RAHMEN_MAX = WERKZEUG_RAHMEN_MAX;

/** Liest Rahmen aus einem Strom von Stücken; ein zu großer Rahmen beendet das Lesen mit `fehler`. */
export class RahmenLeser {
  private rest: Buffer = Buffer.alloc(0);
  private kaputt = false;
  constructor(
    private weiter: (art: number, inhalt: Buffer) => void,
    private fehler: (meldung: string) => void = () => {},
  ) {}

  nimm(stueck: Buffer) {
    if (this.kaputt) return;
    this.rest = this.rest.length ? Buffer.concat([this.rest, stueck]) : stueck;
    while (this.rest.length >= 5) {
      const laenge = this.rest.readUInt32BE(1);
      if (laenge > RAHMEN_MAX) {
        this.kaputt = true;
        this.rest = Buffer.alloc(0);
        this.fehler(`Rahmen zu groß (${laenge} Byte)`);
        return;
      }
      if (this.rest.length < 5 + laenge) return;
      const art = this.rest[0];
      const inhalt = this.rest.subarray(5, 5 + laenge);
      this.rest = this.rest.subarray(5 + laenge);
      this.weiter(art, inhalt);
    }
  }
}
