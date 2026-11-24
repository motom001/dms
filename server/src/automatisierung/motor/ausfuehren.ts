/**
 * Einen Lauf ausführen (#674, #1278 Teil von `Automatisierungen`): Und · Dann · Sonst, Protokoll je Schritt, Vermerk
 * in der Historie.
 */
import { randomUUID } from 'node:crypto';
import { AutomatisierungFuellen } from './fuellen';
import {
  type Automatisierung,
  type LaufZustand,
  type Lauf,
  AUTOMATISIERUNG_GRENZEN,
  type Schritt,
  automatisierungsProbleme,
  kontextTyp,
  type Empfaenger,
  type DannKarte,
} from '../../../../shared/src/automatisierung';
import { type Anlass, mappeVon } from './hilfen';
import { t, log, alsListe } from './gemeinsam';
import type { Mappe } from '../../../../shared/src/model';
import { Fachfehler } from '../../grundlagen/fehler';
import { istUuid } from '../../repo';
import { type KartenKontext, DANN_AUSFUEHRER, KarteLeer } from './karten';

type LaufOptionen = { trocken: boolean; test: boolean; wiederholtVon?: string };
/** Schritte und Ende eines Laufs fortschreiben (im Lauf und in der Datenbank). */
interface Fortschreiber {
  ende(zustand: LaufZustand, fehler?: string | null): Promise<Lauf>;
  schritt(i: number, s: Partial<Schritt>): Promise<void>;
}
/** Die Mappe des Anlasses darf das Systemkonto nicht lesen. */
const NICHT_LESBAR = Symbol('nicht lesbar');

/** Einen Lauf ausführen. */
export abstract class AutomatisierungAusfuehren extends AutomatisierungFuellen {
  /** Lauf ohne Ausführen festhalten (übersprungen: Kette, Bremse, Stopp, keine Leserechte). */
  protected async vermerke(a: Automatisierung, anlass: Anlass, zustand: LaufZustand, text: string) {
    const mappeId = mappeVon(anlass);
    await this.d.repo.beginne({
      id: randomUUID(),
      automatisierungId: a.id,
      ereignisId: anlass.id,
      art: anlass.art,
      daten: anlass.daten,
      mappeId,
      zustand,
      trocken: false,
      test: false,
      schritte: [{ teil: 'wenn', zustand: 'uebersprungen', text }],
      fehler: null,
      gestartet: this.iso(),
      beendet: this.iso(),
    });
  }

  /** Eine Automatisierung für ein Ereignis ausführen; null, wenn es dazu schon einen Lauf gibt. */
  protected async fuehreAus(a: Automatisierung, anlass: Anlass, o: LaufOptionen): Promise<Lauf | null> {
    const mappeId = mappeVon(anlass);
    // Automatisierungen eines angehaltenen Pakets (#1563) laufen nicht – nach „Fortsetzen“ wieder wie vorher.
    if (!o.test && a.paketId && (await this.d.dienst.kern.repo.listePakete()).some((p) => p.id === a.paketId && p.angehalten)) return null;
    if (!o.test && (await this.gebremst(a, anlass))) return null;
    const l = this.neuerLauf(a, anlass, o, mappeId);
    if (!(await this.d.repo.beginne(l))) return null;
    const f = this.fortschreiber(a, l);
    try {
      // Passt die Automatisierung noch (Mappentyp, Felder, Ansichten)? Sonst rot und angehalten.
      const k = await this.kontext();
      const probleme = automatisierungsProbleme(a, k);
      if (probleme.length) {
        if (!o.test) await this.d.repo.setze(a.id, { angehalten: { grund: 'fehlerhaft', text: probleme.join(' '), zeit: this.iso() } });
        await f.schritt(1, { zustand: 'fehler', text: probleme[0] });
        return await f.ende('fehlgeschlagen', probleme.join(' '));
      }
      const typ = kontextTyp(a.wenn, k.typen);
      const konto = await this.konto();
      const z = await this.d.dienst.postSystemmappen.systemZugriff('automatisierung');
      const mappe = await this.lesbareMappe(z, mappeId);
      if (mappe === NICHT_LESBAR) {
        await f.schritt(1, { zustand: 'uebersprungen', text: t('automatisierung.lauf.nicht-lesbar') });
        return await f.ende('uebersprungen');
      }
      if (typ && mappe && mappe.typId !== typ.id) {
        await f.schritt(1, { zustand: 'uebersprungen', text: t('automatisierung.lauf.anderer-typ') });
        return await f.ende('uebersprungen');
      }
      const personen = this.personen(anlass, mappe);
      // Und
      const und = await this.pruefeUnd(a.und.karten, a.und.modus, mappe, konto.id, personen);
      await f.schritt(1, { zustand: und.ok ? 'ok' : 'nein', text: und.text });
      // Dann – oder Sonst (#677), wenn die Bedingungen nicht zutreffen; ohne Sonst-Karten „trifft nicht zu“.
      const zweig = und.ok ? 'dann' : 'sonst';
      for (let i = 2; i < l.schritte.length; i++) if (l.schritte[i].teil !== zweig) l.schritte[i].zustand = 'uebersprungen';
      if (!und.ok && !a.sonst.length) return await f.ende('unzutreffend');
      const kontext = this.kartenKontext({ a, anlass, o, l, z, konto, mappe, typ, personen });
      return await this.fuehreKartenAus(a, anlass, { l, f, kontext, konto, ok: und.ok });
    } catch (x) {
      return f.ende('fehlgeschlagen', (x as Error).message);
    }
  }

  /** Kette zu tief oder zu viele Läufe in der letzten Minute (Bremse): nur vermerken, bei der Bremse anhalten. */
  private async gebremst(a: Automatisierung, anlass: Anlass): Promise<boolean> {
    if (anlass.kette >= AUTOMATISIERUNG_GRENZEN.tiefe) {
      await this.vermerke(a, anlass, 'uebersprungen', t('automatisierung.lauf.kette', { tiefe: AUTOMATISIERUNG_GRENZEN.tiefe }));
      return true;
    }
    const seit = new Date(this.jetzt() - 60_000).toISOString();
    if ((await this.d.repo.zaehleSeit(a.id, seit)) >= AUTOMATISIERUNG_GRENZEN.laeufeJeMinute) {
      const text = t('automatisierung.angehalten.bremse', { anzahl: AUTOMATISIERUNG_GRENZEN.laeufeJeMinute });
      await this.d.repo.setze(a.id, { angehalten: { grund: 'bremse', text, zeit: this.iso() } });
      await this.vermerke(a, anlass, 'uebersprungen', text);
      log.warn('Automatisierung angehalten (Bremse)', { id: a.id, name: a.name });
      return true;
    }
    return false;
  }

  /** Der neue Lauf mit seinen Schritten: Wenn, Und, je Karte Dann und Sonst. */
  private neuerLauf(a: Automatisierung, anlass: Anlass, o: LaufOptionen, mappeId: string | null): Lauf {
    const schritte: Schritt[] = [
      {
        teil: 'wenn',
        zustand: 'ok',
        text:
          anlass.art === 'datum'
            ? t('automatisierung.wenn.datum')
            : anlass.art === 'zeitplan'
              ? t('automatisierung.wenn.zeitplan')
              : anlass.art === 'aufruf'
                ? t('automatisierung.wenn.aufruf')
                : t.frei(`ereignisse.name.${anlass.art.replace(/_/g, '-')}`),
      },
      { teil: 'und', zustand: 'offen' },
      ...a.dann.map((k): Schritt => ({ teil: 'dann', karte: k.id, zustand: 'offen' })),
      // Sonst (#677): eigene Schritte – je Lauf läuft genau einer der beiden Zweige, der andere ist „übersprungen“.
      ...a.sonst.map((k): Schritt => ({ teil: 'sonst', karte: k.id, zustand: 'offen' })),
    ];
    return {
      id: randomUUID(),
      automatisierungId: a.id,
      ereignisId: anlass.id,
      art: anlass.art,
      daten: anlass.daten,
      mappeId,
      zustand: 'laeuft',
      trocken: o.trocken,
      test: o.test,
      schritte,
      fehler: null,
      gestartet: this.iso(),
      beendet: null,
      wiederholtVon: o.wiederholtVon ?? null,
    };
  }

  /** Schritte und Ende des Laufs fortschreiben. */
  private fortschreiber(a: Automatisierung, l: Lauf): Fortschreiber {
    return {
      ende: async (zustand, fehler = null) => {
        Object.assign(l, { zustand, fehler, beendet: this.iso() });
        await this.d.repo.aktualisiere(l.id, { zustand, fehler, beendet: l.beendet, schritte: l.schritte });
        if (zustand === 'fehlgeschlagen') log.warn('Automatisierung fehlgeschlagen', { id: a.id, name: a.name, fehler });
        return l;
      },
      schritt: async (i, s) => {
        Object.assign(l.schritte[i], s);
        await this.d.repo.aktualisiere(l.id, { schritte: l.schritte });
      },
    };
  }

  /** Mappe mit den Rechten des Systemkontos: Was es nicht lesen darf, sieht die Automatisierung nicht. */
  private async lesbareMappe(z: KartenKontext['z'], mappeId: string | null): Promise<Mappe | null | typeof NICHT_LESBAR> {
    let mappe: Mappe | null = null;
    if (mappeId) {
      try {
        mappe = await this.d.dienst.rechtepruefung.pruefeRecht(z, mappeId, 'R');
      } catch (x) {
        if (x instanceof Fachfehler && x.status === 403) return NICHT_LESBAR;
        if (!(x instanceof Fachfehler && x.status === 404)) throw x;
      }
    }
    return mappe;
  }

  /** Empfänger einer Karte als Personen-Ids. */
  private personen(anlass: Anlass, mappe: Mappe | null) {
    return async (e: Empfaenger): Promise<string[]> => {
      if (e.art === 'person') return [e.id];
      if (e.art === 'rolle') return this.d.dienst.automatisierungshilfen.mitgliederDerRolle(e.id);
      const ersteller = mappe?.erstelltVon && istUuid(mappe.erstelltVon) ? [mappe.erstelltVon] : [];
      if (e.art === 'ersteller') return ersteller;
      // Person aus dem Ereignis (#678/#712), z. B. der Vertreter bei „Abwesenheit gesetzt“.
      if (e.art === 'ereignis') return alsListe(anlass.daten[e.feld]).filter(istUuid);
      const imFeld = mappe ? alsListe(mappe.werte[e.feld]).filter(istUuid) : [];
      return imFeld.length || e.sonst !== 'ersteller' ? imFeld : ersteller;
    };
  }

  /** Was jede Karte beim Ausführen bekommt. */
  private kartenKontext(x: {
    a: Automatisierung;
    anlass: Anlass;
    o: LaufOptionen;
    l: Lauf;
    z: KartenKontext['z'];
    konto: KartenKontext['konto'];
    mappe: Mappe | null;
    typ: KartenKontext['typ'];
    personen: KartenKontext['personen'];
  }): KartenKontext {
    const { a, anlass, o, l, z, konto, mappe, typ, personen } = x;
    return {
      dienst: this.d.dienst,
      z,
      konto,
      automatisierung: a,
      mappe,
      typ,
      daten: anlass.daten,
      ereignisId: o.test ? l.id : anlass.id,
      trocken: o.trocken,
      personen,
      person: anlass.ausloeser?.art === 'benutzer' && istUuid(anlass.ausloeser.id) ? anlass.ausloeser.id : null,
      fuelle: (text) => this.fuelle(text, { a, mappe, typ, z, daten: anlass.daten, art: anlass.art }),
      fuelleFuer: async (text, an) => {
        const c = { a, mappe, typ, z, daten: anlass.daten, art: anlass.art };
        const empf = an ? await this.d.dienst.ohneLeserecht.zugriffVon(an) : null;
        if (!empf) return { text: await this.fuelle(text, c), verborgen: 0, mappe: true };
        const basis = await this.fuelleMit(text, c, null);
        const fuer = await this.fuelleMit(text, c, empf);
        return { text: fuer.text, verborgen: Math.max(0, fuer.verborgen - basis.verborgen), mappe: fuer.mappe };
      },
      anlass: { automatisierung: { id: a.id, name: a.name, eingerichtetVon: a.erstelltVon } },
      werkbank: this.d.werkbank,
      laufId: l.id,
      anlassArt: anlass.art,
      aussen: { ausleitung: this.ausleitung, basis: this.aussenBasis },
    };
  }

  /** Die Karten des Zweigs (Dann oder Sonst) nacheinander; mit Zeitgrenze, Stopp und Karten ohne Ziel (#1082). */
  private async fuehreKartenAus(
    a: Automatisierung,
    anlass: Anlass,
    x: { l: Lauf; f: Fortschreiber; kontext: KartenKontext; konto: KartenKontext['konto']; ok: boolean },
  ): Promise<Lauf> {
    const { l, f, kontext, konto } = x;
    const { schritt, ende } = f;
    const zweig = x.ok ? 'dann' : 'sonst';
    const begonnen = this.jetzt();
    let leer = 0;
    const karten = x.ok ? a.dann : a.sonst;
    const basis = x.ok ? 2 : 2 + a.dann.length;
    for (let i = 0; i < karten.length; i++) {
      const karte = karten[i];
      const si = i + basis;
      if (this.jetzt() - begonnen > AUTOMATISIERUNG_GRENZEN.laufzeitS * 1000) {
        await schritt(si, { zustand: 'fehler', text: t('automatisierung.lauf.zeit', { s: AUTOMATISIERUNG_GRENZEN.laufzeitS }) });
        return await ende('fehlgeschlagen', t('automatisierung.lauf.zeit', { s: AUTOMATISIERUNG_GRENZEN.laufzeitS }));
      }
      await schritt(si, { zustand: 'laeuft' });
      if (karte.art === 'stopp') {
        await schritt(si, { zustand: 'ok', text: t('automatisierung.karte.stopp.ergebnis') });
        continue;
      }
      try {
        const art = (karte as DannKarte).art;
        const ausf = DANN_AUSFUEHRER[art];
        if (!ausf) throw new Fachfehler(422, t('automatisierung.karte.unbekannt', { art }));
        const text = await this.d.dienst.kern.mitAusloeser(
          { art: 'automatisierung', id: a.id, konto: konto.id, kette: anlass.kette + 1 },
          () => ausf(karte, kontext),
        );
        await schritt(si, { zustand: 'ok', text });
      } catch (x) {
        const text = (x as Error).message;
        // Ziel fehlt (#1082): übersprungen, die übrigen Karten laufen weiter.
        if (x instanceof KarteLeer) {
          await schritt(si, { zustand: 'uebersprungen', text });
          leer++;
          continue;
        }
        await schritt(si, { zustand: 'fehler', text });
        l.schritte.forEach((x, j) => {
          if (j > si && x.teil === zweig) x.zustand = 'uebersprungen';
        });
        return await ende('fehlgeschlagen', text);
      }
    }
    // Liefen alle Karten ins Leere, ist der Lauf übersprungen (zählt nicht als Fehlschlag).
    return await ende(leer && leer === karten.filter((k) => k.art !== 'stopp').length ? 'uebersprungen' : 'abgeschlossen');
  }
}
