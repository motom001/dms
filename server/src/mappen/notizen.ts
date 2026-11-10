/**
 * Notizen anlegen, ändern, löschen (#55, #81, #1078 aus dienst.ts; gehören zu den Mappen, nicht zum Ausgang). Schicht 2 –
 * bekommt den Kern und die Historie; Ereignis, Erwähnungen (aufgaben/, Schicht 3) und die Übersetzungen über den
 * Anschluss.
 */
import { randomUUID } from 'node:crypto';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { Notiz } from '../../../shared/src/model';
import type { MappenHistorie } from './historie';
import { MappenDienst } from './mappen.dienst';

/** Was die Notizen außer Kern und Historie brauchen – vom Dienst hereingereicht. */
export interface NotizenAnschluss {
  /** Ereignis auslösen – über die Fassade des Dienstes (Tests ersetzen `dienst.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** @-Erwähnungen abgleichen (#56, #81; aufgaben/, über die Fassade). */
  erwaehnungenAbgleichen(mappeId: string, quelle: { key: string; ort: string; auszug?: string }, altText: string, neuText: string, von: string | null): Promise<void>;
  /** Übersetzungen (#732; uebersetzung.ts bekommt noch den ganzen Dienst). */
  uebersetzung(): { vergiss(mappe: string, quelle?: string): Promise<unknown> };
}

export class MappenNotizen {
  constructor(private readonly kern: Kern, private readonly historie: MappenHistorie, private readonly anschluss: NotizenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get uebersetzung() { return this.anschluss.uebersetzung(); }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private erwaehnungenAbgleichen(...a: Parameters<NotizenAnschluss['erwaehnungenAbgleichen']>) { return this.anschluss.erwaehnungenAbgleichen(...a); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.historie.notiere(...a); }

  async legeNotizAn(mappeId: string, text: unknown, von: string | null): Promise<Notiz> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const text2 = MappenDienst.notiztext(text);
    const n = await this.repo.legeNotizAn({ id: randomUUID(), mappeId, text: text2, erstellt: '', erstelltVon: von, geaendert: '', geaendertVon: von });
    await this.notiere(mappeId, von, 'notiz', { text: t('meldungen.dienst.angelegt', { vorschau: MappenDienst.vorschau(text2) }), voll: text2 });
    // Typ von oben (#928) – eine Abfrage weniger.
    await this.ereignis('mappe.notiz', { mappe: mappeId, typ: m.typId, notiz: n.id }, von);
    await this.erwaehnungenAbgleichen(mappeId, { key: `notiz:${n.id}`, ort: 'in einer Notiz', auszug: MappenDienst.vorschau(text2) }, '', text2, von);
    return n;
  }

  /** Bearbeiten und Löschen darf jeder (Abstimmung zu #55); die Historie hält fest, wer es war. */
  async aendereNotiz(id: string, text: unknown, von: string | null): Promise<Notiz> {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diese-notiz-gibt-es'));
    const text2 = MappenDienst.notiztext(text);
    if (text2 === alt.text) return alt;
    const n = await this.repo.aendereNotiz(id, text2, von);
    await this.uebersetzung.vergiss(alt.mappeId, `notiz:${id}`);
    await this.notiere(alt.mappeId, von, 'notiz', { text: t('meldungen.dienst.geaendert-2', { vorschau: MappenDienst.vorschau(text2) }), vorher: MappenDienst.vorschau(alt.text), alt: alt.text, neu: text2 });
    await this.erwaehnungenAbgleichen(alt.mappeId, { key: `notiz:${id}`, ort: 'in einer Notiz', auszug: MappenDienst.vorschau(text2) }, alt.text, text2, von);
    return n;
  }

  async loescheNotiz(id: string, von: string | null) {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diese-notiz-gibt-es'));
    await this.repo.loescheNotiz(id);
    await this.uebersetzung.vergiss(alt.mappeId, `notiz:${id}`);
    await this.notiere(alt.mappeId, von, 'notiz', { text: t('meldungen.dienst.geloescht', { vorschau: MappenDienst.vorschau(alt.text) }), voll: alt.text });
  }
}
