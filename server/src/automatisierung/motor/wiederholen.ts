/**
 * Testlauf und Wiederholen (#707, #1278 Teil von `Automatisierungen`).
 */
import { randomUUID } from 'node:crypto';
import { AutomatisierungAusloesen } from './ausloesen';
import { type Lauf, istBetrieb, istAufruf, kontextTyp } from '../../../../shared/src/automatisierung';
import { t } from './gemeinsam';
import { eigeneVersion } from '../../system';
import { istUuid } from '../../repo';
import { Fachfehler } from '../../fehler';
import { tageBis } from './hilfen';

/** Testlauf und Wiederholen fehlgeschlagener Läufe. */
export abstract class AutomatisierungWiederholen extends AutomatisierungAusloesen {
  /* ---------- Testlauf und Wiederholen ---------- */

  /** Mit einer gewählten Mappe ausführen – trocken (zeigt nur, was passieren würde) oder echt. */
  async wiedergeben(id: string, mappeId: unknown, trocken: boolean): Promise<Lauf> {
    const a = await this.gibt(id);
    await this.pruefe(a);
    // Werkbank-Karten (#677): ohne Mappe – mit einer Beispielmeldung (der Probelauf ruft nichts ab).
    if (istBetrieb(a.wenn)) {
      const w = a.wenn;
      const zeitpunkt = this.iso();
      const daten: Record<string, unknown> =
        w.art === 'fehler.gemeldet'
          ? { fehlermeldung: null, benutzer: null, zeitpunkt, text: t('automatisierung.test.beispiel.fehler') }
          : w.art === 'protokoll.meldung'
            ? {
                stufe: w.stufe,
                modul: w.modul ?? 'system',
                text: [t('automatisierung.test.beispiel.protokoll'), w.enthaelt].filter(Boolean).join(': '),
                zeitpunkt,
              }
            : { version: eigeneVersion(), installiert: eigeneVersion() };
      const l = await this.fuehreAus(a, { id: randomUUID(), art: w.art, daten, kette: 0 }, { trocken, test: true });
      return l ?? this.lauf(id);
    }
    // Aufruf von außen (#679): ohne Mappe – mit einem Beispielwert je Parameter.
    if (istAufruf(a.wenn)) {
      const daten = {
        zeitpunkt: this.iso(),
        parameter: Object.fromEntries(a.wenn.parameter.map((n) => [n, t('automatisierung.test.beispiel.parameter')])),
      };
      const l = await this.fuehreAus(a, { id: randomUUID(), art: 'aufruf', daten, kette: 0 }, { trocken, test: true });
      return l ?? this.lauf(id);
    }
    if (!istUuid(mappeId)) throw new Fachfehler(422, t('automatisierung.test.mappe'));
    const k = await this.kontext();
    const typ = kontextTyp(a.wenn, k.typen);
    // Rechte des Kontos „Automatisierung“, nicht die des Admins – die Meldung sagt das auch so (#709).
    const roh = await this.d.dienst.rechtepruefung.pruefeRecht(undefined, mappeId, 'R');
    const m = await this.d.dienst.rechtepruefung
      .pruefeRecht(await this.d.dienst.postSystemmappen.systemZugriff('automatisierung'), mappeId, 'R')
      .catch((x: unknown) => {
        if (x instanceof Fachfehler && (x.status === 403 || x.status === 404))
          throw new Fachfehler(403, t('automatisierung.test.rechte', { typ: k.typen.find((y) => y.id === roh.typId)?.name ?? '' }));
        throw x;
      });
    if (typ && m.typId !== typ.id) throw new Fachfehler(422, t('automatisierung.test.typ', { typ: typ.name }));
    // Zeitplan „für jeden Benutzer“ (#1001, statt „Jetzt senden“ unter Werkbank → Aufgaben): die gewählte Benutzer-Mappe ist der Benutzer des Laufs.
    const daten: Record<string, unknown> = {
      mappe: m.id,
      typ: m.typId,
      ...(a.wenn.art === 'datum' ? { feld: a.wenn.feld, datum: m.werte[a.wenn.feld] ?? null, tage: tageBis(m.werte[a.wenn.feld]) } : {}),
      ...(a.wenn.art === 'zeitplan' && a.wenn.jeBenutzer ? { benutzer: m.id } : {}),
    };
    const l = await this.fuehreAus(a, { id: randomUUID(), art: a.wenn.art, daten, kette: 0 }, { trocken, test: true });
    return l ?? this.lauf(id);
  }

  /** Einen fehlgeschlagenen Lauf noch einmal (mit den Angaben des Ereignisses, gegen den heutigen Stand). */
  async wiederhole(laufId: string): Promise<Lauf> {
    const alt = await this.lauf(laufId);
    if (alt.zustand !== 'fehlgeschlagen') throw new Fachfehler(409, t('automatisierung.wiederholen.nicht'));
    const a = await this.gibt(alt.automatisierungId);
    await this.d.repo.aktualisiere(alt.id, { zustand: 'wiederholt' });
    const l = await this.fuehreAus(
      a,
      { id: randomUUID(), art: alt.art, daten: alt.daten, kette: 0 },
      { trocken: alt.trocken, test: alt.test, wiederholtVon: alt.id },
    );
    return l!;
  }

  /**
   * Fehlgeschlagene Läufe nicht wiederholen (#707): einer (`laufId`) oder alle (einer Automatisierung bzw. alle). Sie bleiben
   * im Verlauf als „fehlgeschlagen, nicht wiederholt“ mit Person und Zeit stehen; nichts wird gelöscht.
   */
  async nichtWiederholen(o: { laufId?: string; automatisierungId?: string }, von: string | null): Promise<{ anzahl: number }> {
    if (o.laufId) {
      const l = await this.lauf(o.laufId);
      if (l.zustand !== 'fehlgeschlagen') throw new Fachfehler(409, t('automatisierung.wiederholen.nicht'));
      return { anzahl: await this.d.repo.nichtWiederholen([l.id], von) };
    }
    const ids = (await this.d.repo.fehlgeschlagene(o.automatisierungId)).map((l) => l.id);
    return { anzahl: ids.length ? await this.d.repo.nichtWiederholen(ids, von) : 0 };
  }

  /** Alle fehlgeschlagenen Läufe (einer oder aller Automatisierungen) wiederholen. */
  async wiederholeAlle(id?: string): Promise<{ wiederholt: number }> {
    let n = 0;
    for (const l of (await this.d.repo.fehlgeschlagene(id)).reverse()) {
      await this.wiederhole(l.id).catch(() => null);
      n++;
    }
    return { wiederholt: n };
  }
}
