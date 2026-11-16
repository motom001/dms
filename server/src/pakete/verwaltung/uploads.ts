/**
 * Hochgeladene Pakete (#189, #901): merken, wiederfinden, nach 30 Minuten aufräumen; Katalog in einer Sammeldatei.
 */
import { createHash } from 'node:crypto';
import { KATALOG_ALT_TAGE, type HerkunftPruefung, liesKatalog, type Katalog } from '../../../../shared/src/pakete';
import { Fachfehler } from '../../fehler';
import { nurTestschluessel, projektSchluessel, pruefeSignatur, SIGNATUR_DATEI, zeitVon } from '../../katalogsignatur';
import { t } from '../../sprache';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UPLOADS_SPEICHER_MAX } from '../../grenzen';
import { TAG_MS } from './abruf';
import { type Hochgeladen, UPLOAD_GUELTIG, type UploadArt } from './basis';
import { liesPaket } from './lesen';
import { type Handelnder, log } from './optionen';
import { SAMMEL_KATALOG } from './sammeldatei';
import { liesZip, PAKET_GRENZEN } from './zip-lesen';
import { PaketKataloge } from './kataloge';

/** Hochgeladene Pakete. */
export abstract class PaketUploads extends PaketKataloge {
  /**
   * Der offizielle Katalog in einer Sammeldatei (#594): katalog.json mit katalog.sig, gültig signiert mit einem
   * Projektschlüssel. Ohne beides: unsigniert; mit ungültiger Signatur: ungültig (steht im Protokoll).
   */
  protected eingebettet(dateien: Map<string, Buffer>): { katalog: Katalog | null; pruefung: HerkunftPruefung } {
    const kj = dateien.get(SAMMEL_KATALOG),
      ks = dateien.get(SIGNATUR_DATEI);
    if (!kj || !ks) return { katalog: null, pruefung: { art: 'unsigniert', offiziell: false, bestaetigen: true } };
    const r = pruefeSignatur(kj, ks, projektSchluessel(this.o.projektSchluessel));
    let katalog: Katalog | null = null;
    if (r.ok) {
      try {
        katalog = liesKatalog(JSON.parse(kj.toString('utf8')));
      } catch {
        katalog = null;
      }
    }
    const zeit = katalog ? zeitVon(katalog.erstellt) : NaN;
    if (!r.ok || !katalog || Number.isNaN(zeit)) {
      log.warn('Katalogsignatur in einer Sammeldatei ungültig', {
        grund: r.ok ? 'Katalog nicht lesbar oder ohne Zeitpunkt (erstellt)' : r.grund,
      });
      return { katalog: null, pruefung: { art: 'ungueltig', offiziell: false, bestaetigen: true } };
    }
    const alt = Date.now() - zeit > KATALOG_ALT_TAGE * TAG_MS;
    return {
      katalog,
      pruefung: {
        art: 'projekt',
        offiziell: true,
        stand: katalog.erstellt,
        ...(alt ? { alt: true } : {}),
        ...(nurTestschluessel(this.o.projektSchluessel) ? { test: true } : {}),
        bestaetigen: false,
      },
    };
  }

  /** Datei eines Uploads (#745): Name aus dem Hash der Kennung – die Kennung selbst steht nirgends. */
  private uploadDatei(token: string, endung: 'zip' | 'json') {
    return join(this.o.uploadOrdner!, `${createHash('sha256').update(token).digest('hex')}.${endung}`);
  }

  /** Upload merken: im Arbeitsspeicher und – bei mehreren Prozessen – im Upload-Ordner; Abgelaufenes fliegt dabei raus. */
  protected async merkeUpload(token: string, u: Hochgeladen, archiv: Buffer, art: UploadArt) {
    await this.raeumeUploadsAuf();
    this.behalte(token, { ...u, bytes: archiv.length, ...(art === 'sammel' ? { sammel: true } : {}) });
    const ordner = this.o.uploadOrdner;
    if (!ordner) return;
    await mkdir(ordner, { recursive: true, mode: 0o700 });
    await writeFile(this.uploadDatei(token, 'zip'), archiv, { mode: 0o600 });
    await writeFile(this.uploadDatei(token, 'json'), JSON.stringify({ von: u.von, am: u.am, zeit: u.zeit, pruefung: u.pruefung, art }), {
      mode: 0o600,
    });
  }

  /**
   * Abgelaufene Uploads aus dem Arbeitsspeicher und dem Upload-Ordner entfernen (#901) – beim Hochladen und alle fünf
   * Minuten, damit nicht installierte Pakete nicht liegen bleiben, bis jemand das nächste hochlädt.
   */
  async raeumeUploadsAuf() {
    for (const [k, x] of this.uploads) if (Date.now() - x.zeit > UPLOAD_GUELTIG) this.uploads.delete(k);
    const ordner = this.o.uploadOrdner;
    if (!ordner) return;
    for (const n of await readdir(ordner).catch(() => [] as string[])) {
      const s = await stat(join(ordner, n)).catch(() => null);
      if (s && Date.now() - s.mtimeMs > UPLOAD_GUELTIG) await rm(join(ordner, n), { force: true }).catch(() => {});
    }
  }

  /**
   * Upload im Arbeitsspeicher halten, zusammen höchstens UPLOADS_SPEICHER_MAX (#901): Darüber fallen die ältesten heraus.
   * Mit Upload-Ordner liegen sie dort weiter und werden bei Bedarf neu gelesen, sonst muss man sie neu hochladen.
   */
  private behalte(token: string, u: Hochgeladen) {
    this.uploads.delete(token);
    this.uploads.set(token, u);
    let summe = 0;
    for (const x of this.uploads.values()) summe += x.bytes ?? 0;
    for (const [k, x] of this.uploads) {
      if (summe <= UPLOADS_SPEICHER_MAX || k === token) break;
      this.uploads.delete(k);
      summe -= x.bytes ?? 0;
    }
  }

  /** Belegter Arbeitsspeicher der Uploads (für Tests und Systemzustand). */
  uploadsBytes(): number {
    let n = 0;
    for (const x of this.uploads.values()) n += x.bytes ?? 0;
    return n;
  }

  /** Upload vergessen (installiert): auch die Dateien. */
  protected async vergissUpload(token: string) {
    this.uploads.delete(token);
    if (this.o.uploadOrdner)
      for (const e of ['zip', 'json'] as const) await rm(this.uploadDatei(token, e), { force: true }).catch(() => {});
  }

  protected async hochgeladen(token: unknown): Promise<Hochgeladen> {
    const k = String(token ?? '');
    const abgelaufen = () => new Fachfehler(410, t('meldungen.pakete.das-hochgeladene-paket-ist'));
    const u = this.uploads.get(k);
    if (u) {
      if (Date.now() - u.zeit > UPLOAD_GUELTIG) throw abgelaufen();
      return u;
    }
    // Bei einem anderen Prozess hochgeladen (#745): Archiv neu lesen – mit denselben Prüfungen wie beim Hochladen.
    if (!this.o.uploadOrdner || !/^[0-9a-f-]{36}$/.test(k)) throw abgelaufen();
    let angaben: { von: Handelnder; am: string; zeit: number; pruefung: HerkunftPruefung; art: UploadArt };
    let archiv: Buffer;
    try {
      angaben = JSON.parse(await readFile(this.uploadDatei(k, 'json'), 'utf8'));
      archiv = await readFile(this.uploadDatei(k, 'zip'));
    } catch {
      throw abgelaufen();
    }
    if (Date.now() - angaben.zeit > UPLOAD_GUELTIG) throw abgelaufen();
    const paket = liesPaket(liesZip(archiv, PAKET_GRENZEN));
    const neu: Hochgeladen = {
      paket,
      von: angaben.von,
      am: angaben.am,
      zeit: angaben.zeit,
      pruefung: angaben.pruefung,
      bytes: archiv.length,
      ...(angaben.art === 'sammel' ? { sammel: true } : {}),
    };
    this.behalte(k, neu);
    return neu;
  }
}
