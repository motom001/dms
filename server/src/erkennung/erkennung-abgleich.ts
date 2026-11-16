/** Erkennung (#1278 aus erkennung.ts): Verweise und Absender vorschlagen, Abgleich der Dokumente. */
import { ErkennungPositionen } from './erkennung-positionen';
import { type Feld, type Mappe, type Mappentyp, zieleVon, type MappenBezug } from '../../../shared/src/model';
import {
  type Angaben,
  type EigeneAngaben,
  merkmalsfelder,
  findeMappen,
  eindeutigerTreffer,
  istAbsenderTyp,
  eigenerAussteller,
  vorschlaegeAus,
  type Abgleich,
  type TypFund,
  typAusText,
  type Briefkopf,
} from '../../../shared/src/erkennung';
import type { Zugriff } from '../kern';
import { type EigeneLage, type TypVorschlaege, TEXT_MAX, type ErkennungAntwort } from './erkennung-hilfen';
import { t } from '../sprache/sprache';
import { Fachfehler } from '../grundlagen/fehler';
import { ohneErkennung } from '../../../shared/src/anlagen';
import { istXmlDatei } from './erechnung';
import { erechnungText } from '../../../shared/src/erechnung';

export abstract class ErkennungAbgleich extends ErkennungPositionen {
  /**
   * Verweisfeld: Mappe eines Zieltyps, die im Text steht (markierte Felder, sonst der Titel); sonst „neu anlegen“ – das
   * nur bei genau einem Zieltyp (#1036: bei mehreren stünde nicht fest, welcher gemeint ist).
   *
   * „von“ und „an“ (#1043, Kennungen nach den Paket-Regeln): Eigene Organisationen und Personen des Haushalts sind nie
   * „von“. Steht eine von ihnen als Aussteller drin (`aussteller`), ist der Beleg wohl ausgehend: „von“ schlägt sie vor –
   * mit niedriger Sicherheit und Hinweis, nie still (Ergänzung Sicherheit) – und „an“ die Gegenseite.
   */
  protected async verweisFuer(
    f: Feld,
    text: string,
    a: Angaben,
    z: Zugriff | undefined,
    ctx: { eigen: EigeneLage; aussteller: EigeneAngaben | null },
  ): Promise<{
    mappe?: Mappe;
    sicherheit: 'hoch' | 'mittel' | 'niedrig';
    fundstelle: string;
    hinweis?: string;
    neu?: TypVorschlaege['neu'][string];
  } | null> {
    const ziele: Mappentyp[] = [];
    for (const id of zieleVon(f)) {
      const x = await this.repo().holeTyp(id);
      if (x && (!z || z.typen.has(x.id))) ziele.push(x);
    }
    if (!ziele.length) return null;
    const von = f.key === 'von';
    const an = f.key === 'an';
    const aus = ctx.aussteller;
    // „an“ eines eingehenden Belegs bleibt leer („leer heißt wir“) – sonst stünde hier der Absender.
    if (an && !aus) return null;
    if (von && aus) {
      // Ausgehend: die eigene Mappe – wenn das Feld auf ihren Typ zeigen darf und die Person sie lesen darf.
      const m =
        ziele.some((x) => x.id === aus.typId) && (await this.d.rechtepruefung.lesbare(z, [aus.mappeId])).has(aus.mappeId)
          ? await this.repo().holeMappe(aus.mappeId)
          : null;
      return m
        ? {
            mappe: m,
            sicherheit: 'niedrig',
            fundstelle: t('meldungen.erkennung.aussteller-eigen', { titel: m.titel ?? '' }),
            hinweis: t('meldungen.erkennung.ausgehend-hinweis'),
          }
        : null;
    }
    const vergleiche: Array<Pick<Mappentyp, 'id' | 'felder'>> = [];
    const mappen: Mappe[] = [];
    for (const ziel of ziele) {
      const alle = await this.repo().listeMappen(ziel.id);
      const lesbar = await this.d.rechtepruefung.lesbare(
        z,
        alle.map((m) => m.id),
      );
      // „von“ bzw. „an“ eines ausgehenden Belegs: nie eine eigene Mappe.
      mappen.push(...alle.filter((m) => lesbar.has(m.id) && !((von || (an && aus)) && ctx.eigen.ids.has(m.id))));
      // Ohne Felder zum Wiederfinden (#938) zählt der Titel als Name.
      vergleiche.push(
        merkmalsfelder(ziel).length > 0
          ? ziel
          : {
              id: ziel.id,
              felder: [
                {
                  key: '_titel',
                  label: t('meldungen.erkennung.name'),
                  typ: 'text' as const,
                  erkennung: { art: 'name' as const },
                  wiederfinden: true,
                },
              ],
            },
      );
    }
    const markiertIn = new Set(ziele.filter((x) => merkmalsfelder(x).length > 0).map((x) => x.id));
    const treffer = findeMappen(
      text,
      vergleiche,
      mappen.map((m) => ({ id: m.id, typId: m.typId, werte: markiertIn.has(m.typId) ? m.werte : { _titel: m.titel ?? '' } })),
    );
    const best = eindeutigerTreffer(treffer) ?? (treffer.length === 1 ? treffer[0] : null);
    if (best)
      return {
        mappe: mappen.find((m) => m.id === best.mappeId),
        sicherheit: best.stark ? 'hoch' : 'mittel',
        fundstelle: `gefunden: ${best.gruende.join(', ')}`,
        ...(an ? { hinweis: t('meldungen.erkennung.ausgehend-an') } : {}),
      };
    if (ziele.length !== 1 || an) return null;
    const [ziel] = ziele;
    const markiert = markiertIn.has(ziel.id);
    if (!istAbsenderTyp(ziel) && markiert) return null;
    const firma = a.briefkopf?.name ?? a.person?.organisation;
    if (!firma) return null;
    // Der Briefkopf ist der eigene (ausgehend): nicht als neue Organisation vorschlagen.
    if (von && eigenerAussteller({ name: firma, fundstelle: '' }, ctx.eigen.angaben)) return null;
    if (
      z &&
      !(
        await this.d.rechtepruefung.rechteAn(
          z,
          { id: '', typId: ziel.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe,
          true,
        )
      ).C
    )
      return null;
    const werte = Object.fromEntries(
      Object.entries(
        vorschlaegeAus(ziel, text, {
          ...a,
          person: null,
          briefkopf: { ...(a.briefkopf ?? { fundstelle: a.person?.fundstelle ?? '' }), name: firma },
        }),
      )
        .filter(([k, v]) => typeof v.wert === 'string' && ziel.felder.some((x) => x.key === k && x.typ !== 'referenz'))
        .map(([k, v]) => [k, v.wert as string]),
    );
    if (!Object.keys(werte).length) {
      const n = ziel.felder.find((x) => x.typ === 'text');
      if (n) werte[n.key] = firma;
    }
    return {
      sicherheit: 'mittel',
      fundstelle: a.briefkopf?.fundstelle ?? a.person?.fundstelle ?? '',
      neu: { typId: ziel.id, werte, fundstelle: a.briefkopf?.fundstelle ?? a.person?.fundstelle ?? firma },
    };
  }

  /**
   * „Dokument übernehmen“ (#934): Abgleich für Dokumente (höchstens 10, Lesen nötig) – Belege, Vorschläge für die
   * Verweisfelder von `typ` und die Warnung vor Doppelten (siehe `abgleich`). Ohne `typ` dazu `typ`: der Mappentyp für
   * „Wohin gehört das?“, dessen Name im Text steht – nur aus `ausPostZiele` (Haken und Recht zum Anlegen). Dokumente
   * ohne Volltext stehen in `ohneText`; das ist kein Fehler, die Seite zeigt dann eben keine Belege.
   */
  async abgleichDokumente(
    eingabe: unknown,
    z?: Zugriff,
  ): Promise<Abgleich & { bezuege: Record<string, MappenBezug>; ohneText: string[]; typ?: TypFund | null }> {
    const e = (eingabe ?? {}) as { dokumente?: unknown; typ?: unknown };
    const ids = [...new Set((Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string'))].slice(
      0,
      10,
    );
    const typ = typeof e.typ === 'string' && e.typ ? e.typ : undefined;
    const teile: string[] = [];
    const ohneText: string[] = [];
    for (const id of ids) {
      const d = await this.repo().holeDokument(id);
      if (!d) throw new Fachfehler(404, t('meldungen.erkennung.dieses-dokument-gibt-es'));
      await this.d.rechtepruefung.pruefeRecht(z, d.mappeId, 'R');
      // Anlagen (#998) und Original-E-Mail (#999): Abgleich nur mit Hauptdokumenten.
      if (ohneErkennung(d)) continue;
      const text = await this.repo().volltext(id);
      // E-Rechnung als XML (#1043): ohne Volltext zählt ihr lesbarer Auszug.
      const er =
        !text?.trim() && istXmlDatei(d.name, d.mime)
          ? await this.erechnungAus(() => this.d.kern.liesGanz(d.sha256), d.name, d.mime, d.groesse)
          : null;
      if (text?.trim()) teile.push(text);
      else if (er) teile.push(erechnungText(er));
      else ohneText.push(id);
    }
    const text = teile.join('\n\n').slice(0, TEXT_MAX);
    const erg = await this.abgleich(text, typ, z);
    if (typ) return { ...erg, ohneText };
    return { ...erg, ohneText, typ: text.trim() ? typAusText(text, await this.d.mappentypen.ausPostZiele(z)) : null };
  }

  /** Anlagen (#998) und Original-E-Mail (#999) weglassen: Erkennung, Fundstellen und KI arbeiten nur mit Hauptdokumenten. */
  protected async ohneAnlagen(ids: string[]): Promise<string[]> {
    const erg: string[] = [];
    for (const id of ids) {
      const d = await this.repo().holeDokument(id);
      if (d && !ohneErkennung(d)) erg.push(id);
    }
    return erg;
  }

  /** „Neue Organisation anlegen“: der erste Absender-Typ mit Namensfeld, den der Benutzer sieht und anlegen darf. */
  protected async neuerAbsender(b: Briefkopf, z?: Zugriff): Promise<ErkennungAntwort['neuerAbsender']> {
    if (!b.name) return null;
    const typen = (await this.repo().listeTypen()).filter((t) => istAbsenderTyp(t) && (!z || z.typen.has(t.id)));
    // Organisation vor Person: kein Vorname/Nachname; ein Typ mit Kennung „…organisation“ zuerst.
    const kandidaten = typen
      .filter((t) => !t.felder.some((f) => /vorname|nachname/.test(f.key)))
      .sort((a, c) => Number(/organisation/.test(c.schluessel ?? '')) - Number(/organisation/.test(a.schluessel ?? '')));
    for (const t of kandidaten) {
      if (
        z &&
        !(
          await this.d.rechtepruefung.rechteAn(z, { id: '', typId: t.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)
        ).C
      )
        continue;
      const leer = {
        emails: [],
        internet: [],
        ibans: [],
        ustids: [],
        telefon: [],
        mobil: [],
        fax: [],
        datum: null,
        betrag: null,
        nummern: [],
        person: null,
        briefkopf: b,
      };
      const werte = Object.fromEntries(
        Object.entries(vorschlaegeAus(t, '', leer))
          .filter(([, v]) => typeof v.wert === 'string')
          .map(([k, v]) => [k, v.wert as string]),
      );
      if (Object.keys(werte).length) return { typId: t.id, werte, fundstelle: b.fundstelle };
    }
    return null;
  }
}
