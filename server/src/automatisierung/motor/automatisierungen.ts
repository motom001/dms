/**
 * Automatisierungen (#1278, vorher `server/src/automatisierung.ts`): die Klasse, die alle Teile zusammensetzt –
 * Konstruktor, Fassungen anmelden, Start und Stopp.
 */
import { AutomatisierungZeitplan } from './zeitplan';
import { Aufrufe, speicherAufrufRepo } from '../aufruf';
import { Ausleitung, speicherAusgangRepo, speicherAussenGeheimnisRepo } from '../ausleitung';
import { type AutomatisierungDeps, fassungsStand } from './hilfen';
import { mitFassungen } from './repo';
import { speicherEinstellungen } from '../../einstellungen/einstellungen';
import type { PaketAutomatisierung } from '../../pakete/verwaltung/index';
import { bereinigeAutomatisierung } from '../../../../shared/src/automatisierung';
import { log, ZEITPLAN_MS } from './gemeinsam';

export class Automatisierungen extends AutomatisierungZeitplan {
  private uhr: ReturnType<typeof setInterval> | null = null;
  /** „Aufruf von außen“ (#679): Adressen, Geheimnisse, Signatur und Bremse (`automatisierung/aufruf.ts`). */
  readonly aufrufe: Aufrufe;
  /** Karten nach außen (#671): Ziele, Geheimnisse, Ausgangskorb und Zustellung (`automatisierung/ausleitung.ts`). */
  readonly ausleitung: Ausleitung;
  protected aussenBasis: () => string;
  constructor(protected d: AutomatisierungDeps) {
    super();
    this.d = { ...d, repo: mitFassungen(d.repo, d.dienst) };
    const x = d.aufruf ?? {};
    this.aufrufe = new Aufrufe({
      repo: x.repo ?? speicherAufrufRepo(),
      zustand: x.zustand ?? (() => d.dienst.kurzzustand),
      verschluessele: x.verschluessele ?? ((k) => d.dienst.verschluesseleGeheimnis(k)),
      entschluessele: x.entschluessele ?? ((w) => d.dienst.entschluessele(w)),
      basis: x.basis,
      uhr: d.uhr,
      automatisierung: (id) => this.d.repo.hole(id),
      ausloesen: (a, id, daten) => this.reihe([a], { id, art: 'aufruf', daten, kette: 0 }),
    });
    const y = d.aussen ?? {};
    this.aussenBasis = y.basis ?? x.basis ?? (() => '');
    this.ausleitung = new Ausleitung({
      repo: y.repo ?? speicherAusgangRepo(),
      geheimnisse: y.geheimnisse ?? speicherAussenGeheimnisRepo(),
      einstellungen: d.dienst.kern.einstellungen ?? speicherEinstellungen(),
      verschluessele: y.verschluessele ?? x.verschluessele ?? ((k) => d.dienst.verschluesseleGeheimnis(k)),
      entschluessele: y.entschluessele ?? x.entschluessele ?? ((w) => d.dienst.entschluessele(w)),
      automatisierung: (id) => this.d.repo.hole(id),
      // Dauerfehler (#671): anhalten mit Grund „ziel“ – Werkbank-Übersicht und Mail der technischen Aufgaben melden es.
      anhalten: async (id, text) => {
        await this.d.repo.setze(id, { angehalten: { grund: 'ziel', text, zeit: this.iso() } });
      },
      mailer: y.mailer ?? (() => null),
      pause: d.pause,
      abruf: y.abruf,
      uhr: d.uhr,
    });
    d.dienst.automatisierungenVon = async (kontoId) => {
      const konto = await this.konto().catch(() => null);
      return konto?.id === kontoId
        ? (await this.d.repo.liste())
            .filter((a) => a.herkunft !== 'paket')
            .map((a) => ({ id: a.id, name: a.name, ...(a.aktiv && a.angehalten ? { angehalten: true } : {}) }))
        : [];
    };
    d.dienst.fristenUebernehmen = () => this.fristenUebernehmen();
    // Automatisierungsvorlagen (#1044): ein Motor – Platzhalter wie in jeder Automatisierung, mit den Rechten der Person,
    // die den Ablauf angelegt hat, und denen des Empfängers (#795). {automatisierung} ist der Name der Vorlage.
    d.dienst.ablaufPlatzhalter = (text, c, empf) =>
      this.fuelleMit(text, { a: { name: c.name }, mappe: c.mappe, typ: c.typ, z: c.z, daten: c.daten }, empf);
    d.dienst.paketAutomatisierungen = (p, liste, ein) => this.ausPaket(p, liste, ein);
    d.dienst.paketAutomatisierungenVergleich = (p, liste) => this.paketVergleich(p, liste as PaketAutomatisierung[]);
    d.dienst.typUmgebaut = (alt, neu, felder) => this.typUmgebaut(alt, neu, felder);
    // #1001: Favoriten und Tägliche Zusammenfassung stellt man nur noch in der Automatisierung ein.
    d.dienst.favoritenRegeln = async () =>
      (await this.d.repo.liste())
        .filter((a) => a.aktiv && !a.angehalten && a.wenn.art === 'favorit.geaendert')
        .flatMap((a) => a.dann.flatMap((k) => (k.art === 'favoriten' ? [{ rollen: k.rollen ?? [], vorgabe: k.vorgabe !== false }] : [])));
    d.dienst.zusammenfassungVorgabe = async () => {
      const a = (await this.d.repo.liste()).find(
        (x) =>
          x.aktiv && !x.angehalten && x.wenn.art === 'zeitplan' && x.wenn.jeBenutzer && x.dann.some((k) => k.art === 'zusammenfassung'),
      );
      return a && a.wenn.art === 'zeitplan' ? { uhrzeit: a.wenn.uhrzeit } : null;
    };
    // Vollexport: Automatisierungen mit ihrem Änderungsverlauf (die Läufe sind Protokoll und bleiben draußen).
    // Die Fassungen (#1006) stehen seit #1006 in struktur/fassungen.json; hier wie bisher je Automatisierung (Nummer als version).
    d.dienst.automatisierungenExport = async () =>
      Promise.all(
        (await this.d.repo.liste()).map(async (a) => ({
          ...a,
          fassungen: (await d.dienst.kern.repo.fassungen('automatisierung', a.id)).map((f) => ({
            version: f.nr,
            zeit: f.zeit,
            von: f.urheber.art === 'person' ? f.urheber.id : null,
            daten: f.daten,
          })),
        })),
      );
    this.fassungenAnmelden();
  }
  /**
   * Fassungen (#1006): Name, Beschreibung, Reihenfolge, an/aus, Wenn, Und, Dann und Sonst – nicht der Zustand (angehalten,
   * letzter Tag). Wiederherstellen über das normale Speichern (dieselben Prüfungen): Passt die Fassung nicht mehr zum
   * heutigen Stand (Feld oder Ansicht weg), meldet Ablago das wie beim Speichern, statt sie still zu ändern.
   */
  private fassungenAnmelden() {
    this.d.dienst.fassungen.registriere({
      art: 'automatisierung',
      stand: async (id) => {
        const a = await this.d.repo.hole(id);
        return a && { name: a.name, daten: fassungsStand(a) };
      },
      alle: async () => (await this.d.repo.liste()).map((a) => a.id),
      stelleHer: async (id, daten, o) => {
        const a = await this.gibt(id);
        // Werkbank-Karten (#677): wie beim Speichern nur mit dem Recht am Bereich (`darf` der Person).
        await this.aendere(
          id,
          { ...bereinigeAutomatisierung(daten), aktiv: (daten as { aktiv?: unknown }).aktiv === true, version: a.version },
          o.von.id,
          o.darf,
        );
      },
      kontext: async () => ({ automatisierung: await this.kontext() }),
    });
  }

  /** Abnehmer anmelden und den Zeitplan starten (Start des Servers). */
  start() {
    this.d.dienst.ereignisse.abonniere('automatisierungen', (e) => this.ereignis(e));
    // Karten nach außen (#671): den Ausgangskorb zustellen (nur der Leiter startet den Motor).
    this.ausleitung.start();
    // #712: Erinnerungen am Feld werden zu Automatisierungen – erst die Fristen übernehmen; frühere Beispiele des Kerns räumen (#883).
    void this.fristenUebernehmen()
      .catch((e) => log.warn('Erinnerungen nicht übernommen', { fehler: (e as Error).message }))
      .then(() => this.benachrichtigungenUebernehmen())
      .catch((e) => log.warn('Benachrichtigungen nicht übernommen', { fehler: (e as Error).message }))
      // #1001: „Post für dich“ und die Freigabe „Favoriten benachrichtigen“ ziehen in Automatisierungen um.
      .then(() => this.postFuerDichUebernehmen())
      .catch((e) => log.warn('„Post für dich“ nicht übernommen', { fehler: (e as Error).message }))
      .then(() => this.favoritenFreigabeUebernehmen())
      .catch((e) => log.warn('Freigabe „Favoriten benachrichtigen“ nicht übernommen', { fehler: (e as Error).message }))
      .then(() => this.raeumeBeispieleAuf())
      .catch((e) => log.warn('Frühere Beispiele nicht aufgeräumt', { fehler: (e as Error).message }));
    this.uhr ??= setInterval(() => {
      void this.zeitplan().catch((e) => log.error('Zeitplan fehlgeschlagen', { fehler: (e as Error).message }));
    }, ZEITPLAN_MS);
    this.uhr.unref?.();
  }
  stop() {
    if (this.uhr) clearInterval(this.uhr);
    this.uhr = null;
    this.ausleitung.stop();
    this.d.dienst.ereignisse.abbestellen('automatisierungen');
  }
}
