/**
 * Beispiel-Ablage (#988): legt die Beispiel-Mappen der installierten Pakete nachträglich an und entfernt sie wieder.
 * Anlegen wie beim Installieren (ohne Mappen-Ereignisse, also ohne Automatisierungen und Benachrichtigungen); Entfernen
 * nur unveränderter Beispiele – eigene Daten und geänderte Beispiele bleiben. Schicht 4 – nutzt die Paketverwaltung.
 */
import {
  BEISPIEL_NOETIG,
  BEISPIEL_PAKETE,
  type BeispielAblageAnlegen,
  type BeispielAblageEntfernen,
  type BeispielAblageStand,
} from '../../shared/src/beispielablage';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import type { Handelnder, Paketverwaltung } from './pakete/verwaltung/index';
import { t } from './sprache';

const log = protokoll.modul('werkbank');

type Pakete = Pick<Paketverwaltung, 'beispieleAnlegen' | 'beispieleEntfernen'>;

export class BeispielAblage {
  constructor(
    private readonly pakete: Pakete,
    private readonly installierte: () => Promise<InstalliertesPaket[]>,
  ) {}

  async stand(): Promise<BeispielAblageStand> {
    const da = await this.installierte();
    const name = (id: string) => da.find((p) => p.id === id)?.name ?? null;
    const pakete = da.filter((p) => p.beispielMappen?.length).map((p) => ({ id: p.id, name: p.name, angelegt: p.beispielMappen!.length }));
    return {
      noetig: BEISPIEL_NOETIG.map((id) => ({ id, name: name(id), installiert: !!name(id) })),
      pakete,
      angelegt: pakete.reduce((n, p) => n + p.angelegt, 0),
    };
  }

  /** Fehlt ein nötiges Paket, legt sie nichts an und nennt es. Scheitert ein Paket, bleiben die übrigen. */
  async anlegen(von: Handelnder): Promise<BeispielAblageAnlegen> {
    const st = await this.stand();
    const fehlt = st.noetig.filter((p) => !p.installiert).map((p) => p.id);
    if (fehlt.length) throw new Fachfehler(409, t('meldungen.beispielablage.pakete-fehlen', { pakete: fehlt.join(', ') }));
    const da = await this.installierte();
    const erg: BeispielAblageAnlegen = { angelegt: 0, fehler: [] };
    for (const id of BEISPIEL_PAKETE) {
      const p = da.find((x) => x.id === id);
      if (!p) continue;
      try {
        erg.angelegt += (await this.pakete.beispieleAnlegen(id, von)).angelegt;
      } catch (e) {
        erg.fehler.push({ id, name: p.name, meldung: (e as Error).message });
      }
    }
    log.info('Beispiel-Ablage angelegt', { von: von.email, angelegt: erg.angelegt, fehler: erg.fehler.map((f) => f.id) });
    return erg;
  }

  /** Alle unveränderten Beispiel-Mappen der installierten Pakete, ohne Papierkorb, im Löschprotokoll. */
  async entfernen(von: Handelnder): Promise<BeispielAblageEntfernen> {
    const erg: BeispielAblageEntfernen = { entfernt: 0, behalten: [] };
    for (const p of (await this.installierte()).filter((x) => x.beispielMappen?.length)) {
      const r = await this.pakete.beispieleEntfernen(p.id, von);
      erg.entfernt += r.entfernt;
      erg.behalten.push(...r.behalten);
    }
    log.info('Beispiel-Ablage entfernt', { von: von.email, entfernt: erg.entfernt, behalten: erg.behalten.length });
    return erg;
  }
}
