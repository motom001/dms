/**
 * Und-Karten prüfen und Platzhalter füllen (#1278, Teil von `Automatisierungen`).
 */
import { AutomatisierungUebernehmen } from './uebernehmen';
import {
  type UndKarte,
  type Empfaenger,
  type Automatisierung,
  PERSONEN_IM_EREIGNIS,
  BETRIEB_PLATZHALTER,
  SYSTEMKONTO_WERKBANK,
} from '../../../../shared/src/automatisierung';
import { type Mappe, type Mappentyp, tagVon, titelAus } from '../../../../shared/src/model';
import { t, alsListe } from './gemeinsam';
import { type Bedingung, merkmalTrifft } from '../../../../shared/src/sichten';
import type { Zugriff } from '../../kern';
import { istUuid } from '../../repo';
import { istBetriebWenn } from '../../../../shared/src/ereignisse';
import { zeitpunktText, alsText, istStufe } from './hilfen';
import { postKennung, postVorlageNeu } from '../../../../shared/src/postfelder';
import { darfBereich } from '../../../../shared/src/verwaltungsrecht';

/** Und-Karten und Platzhalter. */
export abstract class AutomatisierungFuellen extends AutomatisierungUebernehmen {
  /** Und-Bedingungen: jede umkehrbar, „alle“ oder „eine davon“, eine Ebene Gruppen. */
  protected async pruefeUnd(
    karten: UndKarte[],
    modus: 'alle' | 'eine',
    mappe: Mappe | null,
    ich: string,
    personen: (e: Empfaenger) => Promise<string[]>,
  ): Promise<{ ok: boolean; text: string }> {
    if (!karten.length) return { ok: true, text: t('automatisierung.und.keine') };
    const flach: UndKarte[] = karten.flatMap((k) => (k.art === 'gruppe' ? k.karten : [k]));
    // Merkmal der Ablage (#1032): gilt ohne Mappe – auch bei Zeitplänen.
    const merkmal = (k: UndKarte) => k.art === 'bedingung' && k.bedingung.art === 'merkmal';
    if (!mappe && !flach.every(merkmal)) return { ok: false, text: t('automatisierung.und.ohne-mappe') };
    const merkmale = flach.some(merkmal) ? await this.d.dienst.werkbank.merkmale() : undefined;
    const mitMappe = flach.filter((k) => !merkmal(k));
    const teile = await Promise.all(
      mitMappe.map(async (k) =>
        k.art === 'bedingung'
          ? { art: 'bedingungen' as const, bedingungen: [k.bedingung as Bedingung] }
          : k.art === 'ansicht'
            ? { art: 'sicht' as const, sicht: k.sicht }
            : { art: 'favorit' as const, benutzer: k.art === 'favorit' ? await personen(k.von) : [] },
      ),
    );
    const erg = mappe && mitMappe.length ? await this.d.dienst.automatisierungshilfen.trifftTeile(mappe.id, teile, ich) : [];
    const trifft = (k: UndKarte) =>
      k.art === 'bedingung' && k.bedingung.art === 'merkmal' ? merkmalTrifft(k.bedingung, merkmale) : erg[mitMappe.indexOf(k)];
    const wert = new Map(flach.map((k) => [k, trifft(k) !== (k.nicht === true)]));
    const verbinde = (liste: UndKarte[], m: 'alle' | 'eine'): boolean => {
      const w = liste.map((k) => (k.art === 'gruppe' ? verbinde(k.karten, k.modus) !== (k.nicht === true) : wert.get(k)!));
      return m === 'alle' ? w.every(Boolean) : w.some(Boolean);
    };
    const ok = verbinde(karten, modus);
    const treffer = [...wert.values()].filter(Boolean).length;
    return { ok, text: t('automatisierung.und.ergebnis', { treffer, anzahl: flach.length }) };
  }

  /** Platzhalter wie beim Mappentitel – Feldwerte mit den Rechten des Kontos; Passwörter nie. */
  async fuelle(
    text: string,
    c: { a: Automatisierung; mappe: Mappe | null; typ: Mappentyp | null; z: Zugriff; daten: Record<string, unknown>; art?: string },
  ): Promise<string> {
    return (await this.fuelleMit(text, c, null)).text;
  }

  /**
   * Platzhalter füllen (#795): mit den Rechten des Kontos und – mit `empf` – zusätzlich mit denen des Empfängers. Was er
   * nicht sehen darf, erscheint als „(nicht sichtbar)“: Darf er die Mappe nicht lesen, gilt das für Titel, Mappentyp,
   * Datum, Tage und alle Felder; sonst für Titel verknüpfter Mappen und Personen, die er nicht sehen darf.
   * `verborgen` zählt die Platzhalter mit verdecktem Inhalt.
   */
  async fuelleMit(
    text: string,
    c: {
      a: Pick<Automatisierung, 'name'>;
      mappe: Mappe | null;
      typ: Mappentyp | null;
      z: Zugriff;
      daten: Record<string, unknown>;
      art?: string;
    },
    empf: Zugriff | null,
  ): Promise<{ text: string; verborgen: number; mappe: boolean }> {
    const { a, mappe, typ, z, daten } = c;
    const versteckt = t('automatisierung.platzhalter.nicht-sichtbar');
    const mappeSichtbar = !empf || !mappe || (await this.d.dienst.rechtepruefung.lesbare(empf, [mappe.id])).has(mappe.id);
    const refs =
      mappe && typ
        ? typ.felder
            .filter((f) => f.typ === 'referenz')
            .flatMap((f) => alsListe(mappe.werte[f.key]))
            .filter(istUuid)
        : [];
    const titel = refs.length ? await this.d.dienst.automatisierungshilfen.lesbareTitel(z, refs) : new Map<string, string>();
    if (empf && refs.length) {
      const ok = await this.d.dienst.rechtepruefung.lesbare(empf, refs);
      for (const id of [...titel.keys()]) if (!ok.has(id)) titel.delete(id);
    }
    const fest: Record<string, string> = {
      titel: mappe?.titel ?? '',
      mappentyp: typ?.name ?? '',
      heute: tagVon(new Date(this.jetzt()).toISOString()),
      automatisierung: a.name,
      datum: typeof daten.datum === 'string' ? tagVon(`${daten.datum}T12:00:00Z`) : '',
      tage: daten.tage === undefined ? '' : String(daten.tage),
    };
    const verdeckt = new Set<string>();
    // Ohne Leserecht an der Mappe: nichts, was aus ihr stammt.
    if (!mappeSichtbar)
      for (const k of ['titel', 'mappentyp', 'datum', 'tage'])
        if (fest[k]) {
          fest[k] = versteckt;
          verdeckt.add(k);
        }
    // Aus dem Ereignis (#678/#712): Personen mit Namen, Zeitraum einer Abwesenheit lesbar.
    const tag = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? tagVon(`${x}T12:00:00Z`) : '');
    const personen = (PERSONEN_IM_EREIGNIS[c.art ?? ''] ?? []).filter((k) => typeof daten[k] === 'string' && istUuid(daten[k] as string));
    const siehtPersonen =
      empf && personen.length
        ? await this.d.dienst.rechtepruefung.lesbare(
            empf,
            personen.map((k) => daten[k] as string),
          )
        : null;
    for (const k of personen) {
      const id = daten[k] as string;
      if (siehtPersonen && !siehtPersonen.has(id)) {
        fest[k] = versteckt;
        verdeckt.add(k);
      } else fest[k] = await this.d.dienst.kern.name(id);
    }
    if ('von' in daten || 'bis' in daten) {
      fest.von = tag(daten.von);
      fest.bis = tag(daten.bis);
      fest.zeitraum =
        fest.von && fest.bis
          ? t('automatisierung.platzhalter.zeitraum.von-bis', { von: fest.von, bis: fest.bis })
          : fest.von
            ? t('automatisierung.platzhalter.zeitraum.ab', { von: fest.von })
            : fest.bis
              ? t('automatisierung.platzhalter.zeitraum.bis', { bis: fest.bis })
              : t('automatisierung.platzhalter.zeitraum.offen');
    }
    // Werkbank-Karten (#677): Zeitpunkt, Meldung, wer, Version – den Text der Meldung nur für Empfänger, die den Bereich verwalten.
    if (c.art && istBetriebWenn(c.art))
      for (const [k, w] of Object.entries(await this.betriebWerte(c.art, daten, empf))) {
        fest[k] = w.wert;
        if (w.verdeckt) verdeckt.add(k);
      }
    // Aufruf von außen (#679): Zeitpunkt und die Parameter – nur Text, nie als Feld oder Code (Ersetzen in einem Durchgang).
    if (c.art === 'aufruf') {
      fest.zeitpunkt = zeitpunktText(daten.zeitpunkt);
      const p = daten.parameter && typeof daten.parameter === 'object' ? (daten.parameter as Record<string, unknown>) : {};
      for (const [k, w] of Object.entries(p)) if (typeof w === 'string' && !Object.hasOwn(fest, k)) fest[k] = w;
    }
    let verborgen = 0;
    // Post (#1042): {absender} und {fuer} gelten bis 1.0.0 als {von} und {an} (uebergaenge.ts).
    const alias = typ?.system === 'post';
    const erg = text.replace(/\{([a-z][a-z0-9_]*)((?:\|[^{}|]*)*)\}/g, (ganz, key: string) => {
      if (Object.hasOwn(fest, key)) {
        if (verdeckt.has(key)) verborgen++;
        return fest[key];
      }
      const k = alias ? postKennung(key) : key;
      const f = typ?.felder.find((x) => x.key === k);
      if (!f || f.typ === 'passwort' || !mappe) return ganz;
      if (!mappeSichtbar) {
        verborgen++;
        return versteckt;
      }
      let fehlt = false;
      const w = titelAus({ felder: typ!.felder, titelVorlage: alias ? postVorlageNeu(ganz) : ganz }, mappe.werte, (id) => {
        const x = titel.get(id);
        if (x === undefined) fehlt = true;
        return x ?? versteckt;
      });
      if (fehlt) verborgen++;
      return w;
    });
    return { text: erg, verborgen, mappe: mappeSichtbar };
  }

  /**
   * Platzhalter der Werkbank-Karten (#677). Text und Absender einer Fehlermeldung bzw. der Text einer Protokollmeldung
   * sieht ein Empfänger nur, wenn er „Gemeldete Fehler“ bzw. „Protokoll“ verwalten darf – sonst „(nicht sichtbar)“.
   */
  private async betriebWerte(
    art: string,
    daten: Record<string, unknown>,
    empf: Zugriff | null,
  ): Promise<Record<string, { wert: string; verdeckt?: boolean }>> {
    const darf = (bereich: string) => !empf || darfBereich(empf.ich, bereich);
    const leer = Object.fromEntries((BETRIEB_PLATZHALTER[art as keyof typeof BETRIEB_PLATZHALTER] ?? []).map((k) => [k, { wert: '' }]));
    const sicht = (wert: string, sieht: boolean) =>
      sieht ? { wert } : { wert: t('automatisierung.platzhalter.nicht-sichtbar'), verdeckt: true };
    if (art === 'fehler.gemeldet') {
      const sieht = darf(SYSTEMKONTO_WERKBANK.fehlermeldung);
      const m = sieht && typeof daten.fehlermeldung === 'string' ? await this.d.werkbank?.fehlermeldung(daten.fehlermeldung) : null;
      const von =
        sieht && typeof daten.benutzer === 'string' && istUuid(daten.benutzer) ? await this.d.dienst.kern.name(daten.benutzer) : '';
      return {
        ...leer,
        zeitpunkt: { wert: zeitpunktText(daten.zeitpunkt) },
        meldung: sicht(m?.text ?? alsText(daten.text), sieht),
        gemeldet_von: sicht(von, sieht),
      };
    }
    if (art === 'protokoll.meldung') {
      return {
        ...leer,
        zeitpunkt: { wert: zeitpunktText(daten.zeitpunkt) },
        stufe: { wert: istStufe(daten.stufe) ? t.frei(`automatisierung.stufe.${daten.stufe}`) : '' },
        modul: { wert: typeof daten.modul === 'string' ? t.frei(`werkbank.protokoll.modul.${daten.modul}`) : '' },
        meldung: sicht(alsText(daten.text), darf(SYSTEMKONTO_WERKBANK.protokoll)),
      };
    }
    return { ...leer, version: { wert: alsText(daten.version) }, installiert: { wert: alsText(daten.installiert) } };
  }
}
