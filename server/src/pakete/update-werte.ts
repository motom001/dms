/**
 * Werte entfallener Felder nach einem Paket-Update (#1658, Kommentar Entwicklung „Mittelweg für Lena“): Das Update
 * entfernt das Feld am Mappentyp sofort; die Werte bleiben an der Mappe (wie beim Entfernen eines Felds in der Werkbank)
 * und kommen hier – im Hintergrund, in Schüben – in die Notiz der Mappe, mit Kopfzeile „Aus dem Update von „Finanzen“
 * 3.1.0:“. Nennt das Paket einen Umbau-Schritt in denselben Typ (umbenennen), zieht der Wert ins neue Feld, wenn es leer
 * ist und der Wert passt; sonst ebenfalls in die Notiz. Nichts geht verloren.
 *
 * Gespeichert als Einstellung `paket_update_werte` (eine Liste von Aufträgen): Mappentyp, Felder, wie weit (`nach`: Id
 * der letzten erledigten Mappe), wie viele. So setzt ein Neustart fort, wo er war. Wer gerade arbeitet, trägt sich mit
 * Frist ein (`lauf`, über `tausche`) – bei mehreren Prozessen arbeitet einer; stirbt er, übernimmt nach der Frist ein
 * anderer. Eine Mappe, die schon eine Notiz mit dieser Kopfzeile hat, bekommt keine zweite.
 */
import { randomUUID } from 'node:crypto';
import {
  formatiere,
  istLeer,
  NOTIZ_MAX,
  verweiseVon,
  type Feld,
  type Feldaenderung,
  type Mappe,
  type Werte,
} from '../../../shared/src/model';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';
import { wandle } from './umbau-werte';

const log = protokoll.modul('pakete');

/** Name der Einstellung. */
export const UPDATE_WERTE = 'paket_update_werte';
/** So viele Mappen je Schub. */
const SCHUB = 100;
/** Frist der Eintragung „ich arbeite daran“ (verlängert je Schub). */
const FRIST_MS = 60_000;

/** Ein Auftrag: die Werte dieser Felder eines Mappentyps übertragen. */
export interface WerteAuftrag {
  id: string;
  paket: { id: string; name: string; version: string };
  typId: string;
  typName: string;
  /** Die entfallenen Felder, wie sie vor dem Update waren; `nach` = Kennung des neuen Felds (umbenennen). */
  felder: Array<Feld & { nach?: string }>;
  /** Wer das Update gemacht hat (Notiz, Historie). */
  von: string | null;
  /** Id der letzten erledigten Mappe (Reihenfolge nach Id); null = noch keine. */
  nach: string | null;
  fertig: number;
  /** Mappen mit Wert – beim ersten Schub gezählt. */
  gesamt: number | null;
  seit: string;
  lauf?: { id: string; bis: number };
}

/** Was das Update einreiht. */
export type WerteAuftragNeu = Omit<WerteAuftrag, 'id' | 'nach' | 'fertig' | 'gesamt' | 'seit'>;

/** Stand für die Oberfläche: je Mappentyp „Update wird übernommen (412 von 735)“. */
export interface WerteStand {
  typId: string;
  paket: string;
  fertig: number;
  gesamt: number | null;
}

const liste = (v: unknown): WerteAuftrag[] => (Array.isArray(v) ? (v as WerteAuftrag[]) : []);

export class UpdateWerte {
  /** Kennung dieses Prozesses für die Eintragung. */
  private readonly ich = randomUUID();
  private laeuft: Promise<void> | null = null;

  constructor(private readonly kern: Kern) {}

  private get einst() {
    return this.kern.einstellungen;
  }

  /** Aufträge einreihen (nach dem Speichern des Updates) und anstoßen. */
  async einreihen(neu: WerteAuftragNeu[]): Promise<void> {
    if (!neu.length || !this.einst) return;
    const dazu = neu.map((a) => ({ ...a, id: randomUUID(), nach: null, fertig: 0, gesamt: null, seit: new Date().toISOString() }));
    await this.aendere((l) => [...l, ...dazu]);
    log.info('Paket-Update: Werte entfallener Felder werden übertragen', {
      paket: dazu[0].paket.id,
      version: dazu[0].paket.version,
      typen: dazu.map((a) => a.typName).join(', '),
    });
    void this.anstossen();
  }

  /** Stand je Mappentyp (für den Mappentyp in der Werkbank). */
  async stand(): Promise<WerteStand[]> {
    return liste(await this.einst?.lies(UPDATE_WERTE)).map((a) => ({
      typId: a.typId,
      paket: a.paket.name,
      fertig: a.fertig,
      gesamt: a.gesamt,
    }));
  }

  /** Arbeiten, bis nichts mehr ansteht (Start, nach einem Update). Läuft schon ein Lauf in diesem Prozess: derselbe. */
  anstossen(): Promise<void> {
    this.laeuft ??= this.lauf()
      .catch((e: Error) => log.error('Paket-Update: Werte nicht übertragen', { fehler: e.message }))
      .finally(() => {
        this.laeuft = null;
      });
    return this.laeuft;
  }

  private async lauf() {
    for (;;) {
      const a = await this.nimm();
      if (!a) return;
      await this.arbeite(a);
    }
  }

  /** Den ersten freien Auftrag für diesen Prozess eintragen (Frist abgelaufen oder ohne Eintragung). */
  private async nimm(): Promise<WerteAuftrag | null> {
    for (let i = 0; i < 5; i++) {
      const roh = await this.einst?.lies(UPDATE_WERTE);
      const l = liste(roh);
      const a = l.find((x) => !x.lauf || x.lauf.bis < Date.now() || x.lauf.id === this.ich);
      if (!a) return null;
      const mein = { ...a, lauf: { id: this.ich, bis: Date.now() + FRIST_MS } };
      if (
        await this.tausche(
          roh,
          l.map((x) => (x.id === a.id ? mein : x)),
        )
      )
        return mein;
    }
    return null;
  }

  private async tausche(alt: unknown, neu: WerteAuftrag[]): Promise<boolean> {
    const e = this.einst!;
    const wert = neu.length ? neu : null;
    if (e.tausche) return e.tausche(UPDATE_WERTE, alt ?? null, wert);
    await e.schreibe(UPDATE_WERTE, wert);
    return true;
  }

  /** Die Liste ändern – mit `tausche`, damit ein anderer Prozess dazwischen nichts verliert. */
  private async aendere(f: (l: WerteAuftrag[]) => WerteAuftrag[]) {
    for (let i = 0; i < 10; i++) {
      const roh = await this.einst!.lies(UPDATE_WERTE);
      if (await this.tausche(roh, f(liste(roh)))) return;
    }
    throw new Error('Einstellung paket_update_werte: zu viele gleichzeitige Änderungen');
  }

  /** Einen Auftrag in Schüben abarbeiten; danach fällt er aus der Liste. */
  private async arbeite(a: WerteAuftrag) {
    const repo = this.kern.repo;
    const typ = await repo.holeTyp(a.typId);
    // Gibt es ein Feld wieder (Update zurückgerollt, Fassung wiederhergestellt), bleibt sein Wert, wo er ist.
    const felder = a.felder.filter((f) => !typ?.felder.some((g) => g.key === f.key));
    const mappen = typ && felder.length ? await mitWert(await repo.listeMappen(a.typId), felder) : [];
    let x: WerteAuftrag = { ...a, gesamt: a.gesamt ?? mappen.length };
    const kopf = t('pakete.update.notiz', { paket: a.paket.name, version: a.paket.version });
    const offen = mappen.filter((m) => !a.nach || m.id > a.nach);
    for (let i = 0; i < offen.length; i += SCHUB) {
      const schub = offen.slice(i, i + SCHUB);
      await this.kern.inTransaktion(() => this.schub(schub, felder, typ!, x, kopf));
      x = { ...x, nach: schub[schub.length - 1].id, fertig: x.fertig + schub.length, lauf: { id: this.ich, bis: Date.now() + FRIST_MS } };
      const stand = x;
      await this.aendere((l) => l.map((y) => (y.id === stand.id ? stand : y)));
      // Anderen Anfragen Luft lassen.
      await new Promise((r) => setImmediate(r));
    }
    await this.aendere((l) => l.filter((y) => y.id !== a.id));
    log.info('Paket-Update: Werte entfallener Felder übertragen', { paket: a.paket.id, typ: a.typName, mappen: x.fertig });
  }

  /** Ein Schub: je Mappe die Werte ins neue Feld bzw. in die Notiz, dazu ein Eintrag in der Historie. */
  private async schub(
    schub: Mappe[],
    felder: WerteAuftrag['felder'],
    typ: NonNullable<Awaited<ReturnType<Kern['repo']['holeTyp']>>>,
    a: WerteAuftrag,
    kopf: string,
  ) {
    const repo = this.kern.repo;
    const schon = new Set((await repo.notizenVon(schub.map((m) => m.id))).filter((n) => n.text.startsWith(kopf)).map((n) => n.mappeId));
    const titel = await repo.titelVon(
      schub.flatMap((m) => felder.filter((f) => f.typ === 'referenz').flatMap((f) => verweise(m.werte[f.key]))),
    );
    const titelVon = (id: string) => titel.get(id) || t('meldungen.dienst.ohne-titel');
    for (const m of schub) {
      if (schon.has(m.id)) continue;
      const werte: Werte = { ...m.werte };
      const zeilen: string[] = [];
      const umgezogen: string[] = [];
      for (const f of felder) {
        const v = m.werte[f.key];
        if (istLeer(v)) continue;
        const zf = f.nach ? typ.felder.find((g) => g.key === f.nach) : undefined;
        const w = zf && istLeer(werte[zf.key]) ? wandle(f, zf, v) : null;
        if (zf && w) {
          werte[zf.key] = w.wert;
          umgezogen.push(t('pakete.update.umgezogen', { von: f.label, nach: zf.label }));
          if (w.genau) continue;
        }
        if (f.typ !== 'passwort') zeilen.push(`${f.label}: ${formatiere(f, v, titelVon)}`);
      }
      if (umgezogen.length) await repo.aendereMappe(m.id, werte, verweiseVon(typ, werte), a.von);
      if (zeilen.length)
        await repo.legeNotizAn({
          id: randomUUID(),
          mappeId: m.id,
          text: `${kopf}\n${zeilen.join('\n')}`.slice(0, NOTIZ_MAX),
          erstellt: '',
          erstelltVon: a.von,
          geaendert: '',
          geaendertVon: a.von,
        });
      await repo.historieSchreibe([
        {
          mappeId: m.id,
          benutzerId: a.von,
          art: 'geaendert',
          daten: {
            text: t('pakete.update.historie', { paket: a.paket.name, version: a.paket.version }),
            aenderungen: felder
              .filter((f) => !istLeer(m.werte[f.key]))
              .map((f): Feldaenderung => {
                if (f.typ === 'passwort') return { feld: f.key, label: f.label, geheim: true };
                const zf = f.nach ? typ.felder.find((g) => g.key === f.nach) : undefined;
                const neu =
                  zf && !istLeer(werte[zf.key]) && werte[zf.key] !== m.werte[zf.key]
                    ? `${zf.label}: ${formatiere(zf, werte[zf.key], titelVon)}`
                    : t('pakete.umbau.in-notiz');
                return { feld: f.key, label: f.label, alt: formatiere(f, m.werte[f.key], titelVon), neu };
              }),
          },
        },
      ]);
    }
  }
}

/** Mappen mit einem Wert in einem der Felder, nach Id (so setzt ein Neustart an der richtigen Stelle fort). */
async function mitWert(mappen: Mappe[], felder: Feld[]) {
  return mappen.filter((m) => felder.some((f) => !istLeer(m.werte[f.key]))).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Ids verwiesener Mappen in einem Wert (Verweisfeld, einzeln oder mehrfach). */
const verweise = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [];
