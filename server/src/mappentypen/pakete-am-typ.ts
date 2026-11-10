/**
 * Pakete am Mappentyp (#686, #1073 aus dienst.ts): welche Pakete Mappen eines Typs lesen dürften, einem Paket den Typ
 * verwehren, und ob ein Paket eine Mappe bei der Zustellung sehen darf. Schicht 2.
 */
import type { Benutzer, Mappe } from '../../../shared/src/model';
import { MAPPEN_EREIGNISSE, type InstalliertesPaket } from '../../../shared/src/pakete';
import { Fachfehler } from '../fehler';
import type { Kern, Zugreifender, Zugriff } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff/zugriff.dienst';

/** Was die Pakete am Typ außer Kern und Rechteprüfung brauchen – vom Dienst hereingereicht. */
export interface TypPaketeAnschluss {
  /** KI-Dienste (#796): Ist dieser Mappentyp für das Paket gesperrt? (KI-Einstellung, noch im Dienst) */
  kiSperre(p: Pick<InstalliertesPaket, 'laeufer'> | null | undefined): Promise<(typId: string) => boolean>;
  /** Konten (vom Start verbunden): Dienstkonten der Pakete. */
  konten(): { dienstkonten?(): Promise<Benutzer[]> } | undefined;
}

export class TypPakete {
  constructor(private readonly kern: Kern, private readonly rechtepruefung: ZugriffDienst, private readonly anschluss: TypPaketeAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }
  private get konten() { return this.anschluss.konten(); }
  private kiSperre(p: Pick<InstalliertesPaket, 'laeufer'> | null | undefined) { return this.anschluss.kiSperre(p); }
  private paketVerwehrt(): Promise<Record<string, string[]>> { return this.kern.paketVerwehrt(); }
  private zugriff(ich: Zugreifender): Promise<Zugriff> { return this.rechtepruefung.zugriff(ich); }
  private rechteAn(z: Zugriff, m: Mappe) { return this.rechtepruefung.rechteAn(z, m); }
  private typverweise(...a: Parameters<ZugriffDienst['typverweise']>) { return this.rechtepruefung.typverweise(...a); }

  /**
   * Darf der Benutzer dieses Pakets die Mappe (auch im Papierkorb; ohne Mappe: Mappen dieses Typs) lesen? null = ja,
   * sonst der Grund fürs Protokoll. Wird je Zustellung neu gebildet – Rechteänderungen wirken sofort.
   */
  async paketSiehtNicht(p: InstalliertesPaket, typId: string, mappeId: string | null): Promise<string | null> {
    const konto = (await this.konten?.dienstkonten?.())?.find((b) => b.paketId === p.id);
    const z = await this.zugriff({ id: konto?.id ?? `paket:${p.id}`, rolle: 'mitglied', art: 'dienst', paketId: p.id });
    if (!z.typen.has(typId)) return (await this.paketVerwehrt())[typId]?.includes(p.id) ? t('meldungen.dienst.mappentyp-fuer-dieses-paket') : (await this.kiSperre(p))(typId) ? t('meldungen.dienst.ki-nicht-zugelassen') : t('meldungen.dienst.kein-leserecht-am-mappentyp');
    if (!mappeId) return null;
    // #958: Nach dem Löschen liegt die Mappe im Papierkorb – geprüft wird mit ihren Werten von dort. Gibt es sie gar
    // nicht mehr (Papierkorb schon geleert), lässt sich das Leserecht nicht prüfen: dann nicht zustellen.
    const m = (await this.repo.holeMappe(mappeId)) ?? (await this.repo.holeAusPapierkorb(mappeId));
    if (!m) return t('meldungen.dienst.diese-mappe-gibt-es');
    if (!(await this.rechteAn(z, m)).R) return t('meldungen.dienst.kein-leserecht-an-dieser');
    return null;
  }

  /**
   * Pakete mit Code, die Mappen dieses Typs lesen dürften (bestätigte Rechte), samt ob sie Ereignisse dazu abonniert
   * haben und ob der Admin ihnen den Typ verwehrt hat – für den Abschnitt „Pakete“ im Mappentyp-Editor.
   */
  async paketeAmTyp(typId: string): Promise<Array<{ id: string; name: string; ereignisse: boolean; schreiben: boolean; verwehrt: boolean }>> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    if (typ.system === 'benutzer') return [];
    const [pakete, typen, verwehrt] = [await this.repo.listePakete(), await this.repo.listeTypen(), await this.paketVerwehrt()];
    const erg: Array<{ id: string; name: string; ereignisse: boolean; schreiben: boolean; verwehrt: boolean }> = [];
    for (const p of pakete) {
      const l = p.laeufer;
      if (!l) continue;
      const auf = await this.typverweise(p.id, pakete, typen);
      if (!auf(l.rechte.lesen).has(typId)) continue;
      erg.push({
        id: p.id, name: p.name, schreiben: auf(l.rechte.schreiben).has(typId), verwehrt: !!verwehrt[typId]?.includes(p.id),
        ereignisse: l.ereignisse.some((e) => MAPPEN_EREIGNISSE.includes(e)) && auf(l.mappentypen ?? []).has(typId),
      });
    }
    return erg.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  /** Einem Paket einen Mappentyp verwehren bzw. wieder erlauben; wirkt sofort (Lesen, Schreiben, Ereignisse). */
  async setzePaketVerwehrt(typId: string, paketId: string, verwehrt: boolean, von: string | null): Promise<void> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const am = await this.paketeAmTyp(typId);
    const p = am.find((x) => x.id === paketId);
    if (!p) throw new Fachfehler(404, t('meldungen.dienst.dieses-paket-darf-mappen'));
    const alle = await this.paketVerwehrt();
    const liste = new Set(alle[typId] ?? []);
    if (verwehrt) liste.add(paketId); else liste.delete(paketId);
    if (liste.size) alle[typId] = [...liste].sort(); else delete alle[typId];
    await this.einstellungen.schreibe('paket_verwehrt', Object.keys(alle).length ? alle : null);
    const typ = await this.repo.holeTyp(typId);
    protokoll.modul('werkbank').info(verwehrt ? 'Paket den Mappentyp verwehrt' : 'Paket den Mappentyp wieder erlaubt', { paket: paketId, typ: typ?.name ?? typId, von });
  }
}
