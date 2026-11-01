/**
 * Erkennung im Kern (#336): Vorschläge beim Zuordnen von Post – Absender, Angaben und Zielmappe.
 *
 * Läuft auf das interne Ereignis „Volltext fertig“ (nicht auf das Ende der eingebauten Texterkennung),
 * damit es auch mit einer Texterkennung als Paket (#458) läuft. Gerechnet wird einmal je Post, das
 * Ergebnis liegt an der Post (Tabelle erkennungen). Gespeichert sind nur Ids und Begründungen; beim
 * Lesen sieht jeder nur die Mappen, die er lesen darf. Die Muster stehen in shared/src/erkennung.ts.
 */

import type { Fund, Nummernfund, Briefkopf, Treffer } from '../../shared/src/erkennung';
import { eindeutigerTreffer, findeAngaben, findeMappen, istAbsenderTyp, merkmalsfelder, vorschlaegeAus, type Vergleichsmappe } from '../../shared/src/erkennung';
import { auswahlText, type Betrag, type Mappe, type Mappentyp, type MappenBezug } from '../../shared/src/model';
import type { Dienst, Zugriff } from './dienst';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import type { Repo } from './repo';

const log = protokoll.modul('ablage');

/** Ein Vorschlag für die Zielmappe; die Gründe stehen ohne Titel da (die setzt erst das Lesen ein). */
export interface Zielvorschlag { mappeId: string; typId: string; punkte: number; gruende: string[] }

/** Was an einer Post gespeichert ist. */
export interface PostErkennung {
  zeit: string;
  /** Dokumente der Post mit Volltext. */
  dokumente: number;
  /** Mögliche Absender (Organisation, Niederlassung, Person …), beste zuerst. */
  absender: Treffer[];
  /** Eindeutig erkannter Absender (genau einer mit starkem Merkmal). */
  eindeutig: string | null;
  angaben: { datum: Fund | null; betrag: Fund<Betrag> | null; nummern: Nummernfund[] };
  /** Absender aus dem Briefkopf, wenn keiner der vorhandenen passt. */
  briefkopf: Briefkopf | null;
  ziele: Zielvorschlag[];
}

/** Was ein Benutzer davon sieht: nur lesbare Mappen, mit Titeln. */
export interface ErkennungAntwort {
  zeit: string;
  dokumente: number;
  absender: Array<Treffer & { titel: string }>;
  eindeutig: string | null;
  angaben: PostErkennung['angaben'];
  /** Unbekannter Absender: Vorschlag „neue Organisation anlegen“ mit vorbelegten Feldern. */
  neuerAbsender: { typId: string; werte: Record<string, string>; fundstelle: string } | null;
  ziele: Array<Zielvorschlag & { titel: string }>;
  bezuege: Record<string, MappenBezug>;
}

const MAX_ABSENDER = 5;
const MAX_ZIELE = 8;
const MAX_MAPPEN = 20_000;

export class Erkennung {
  constructor(private d: Dienst, private repo: () => Repo) {}

  /** Hörer auf „Volltext fertig“: Gehört das Dokument zu Post, die Erkennung dieser Post neu rechnen. */
  async nachVolltext(e: { dokument: string; mappe: string }): Promise<PostErkennung | null> {
    const m = await this.repo().holeMappe(e.mappe);
    if (!m) return null;
    const t = await this.repo().holeTyp(m.typId);
    if (t?.system !== 'post') return null;
    return this.fuerPost(m.id);
  }

  /** Text, an dem die Erkennung einer Post arbeitet: Absender, Betreff und Nachricht, dann die Volltexte. */
  private async postText(post: Mappe): Promise<{ text: string; dokumente: number }> {
    const teile = [auswahlText(post.werte.absender), auswahlText(post.werte.betreff), auswahlText(post.werte.nachricht)].filter(Boolean);
    let dokumente = 0;
    for (const d of await this.repo().listeDokumente(post.id)) {
      const t = d.ocr?.stand === 'fertig' ? await this.repo().volltext(d.id) : null;
      if (t?.trim()) { teile.push(t); dokumente++; }
    }
    return { text: teile.join('\n\n'), dokumente };
  }

  /** Mappentypen mit Merkmalen und ihre Mappen (für den Abgleich). */
  private async vergleich(): Promise<{ typen: Mappentyp[]; mappen: Vergleichsmappe[] }> {
    const typen = (await this.repo().listeTypen()).filter((t) => t.system !== 'post' && t.system !== 'benutzer' && merkmalsfelder(t).length);
    const mappen: Vergleichsmappe[] = [];
    for (const t of typen) {
      for (const m of await this.repo().listeMappen(t.id)) {
        mappen.push({ id: m.id, typId: m.typId, werte: m.werte, geaendert: m.geaendert });
        if (mappen.length >= MAX_MAPPEN) return { typen, mappen };
      }
    }
    return { typen, mappen };
  }

  /** Erkennung einer Post rechnen und speichern. */
  async fuerPost(postId: string): Promise<PostErkennung | null> {
    const repo = this.repo();
    const post = await repo.holeMappe(postId);
    if (!post) return null;
    const start = Date.now();
    const { text, dokumente } = await this.postText(post);
    const angaben = findeAngaben(text);
    const { typen, mappen } = await this.vergleich();
    const typVon = new Map(typen.map((t) => [t.id, t]));
    const treffer = findeMappen(text, typen, mappen);
    const absender = treffer.filter((x) => istAbsenderTyp(typVon.get(x.typId)!)).slice(0, MAX_ABSENDER);
    const eindeutig = eindeutigerTreffer(absender);
    const haupt = eindeutig ?? (absender[0]?.stark ? absender[0] : null);

    // Ziele: direkte Treffer (z. B. Vertrag über die Vertragsnummer), Mappen, die auf den Absender verweisen,
    // frühere Post dieses Absenders und der Absender selbst.
    const ziele = new Map<string, Zielvorschlag>();
    const dazu = (mappeId: string, typId: string, punkte: number, grund: string) => {
      if (mappeId === post.id) return;
      const z = ziele.get(mappeId) ?? { mappeId, typId, punkte: 0, gruende: [] };
      z.punkte += punkte;
      if (!z.gruende.includes(grund)) z.gruende.push(grund);
      ziele.set(mappeId, z);
    };
    for (const x of treffer) if (!istAbsenderTyp(typVon.get(x.typId)!)) dazu(x.mappeId, x.typId, x.punkte + 1, `gefunden: ${x.gruende.join(', ')}`);
    if (haupt) {
      const alleTypen = new Map((await repo.listeTypen()).map((t) => [t.id, t]));
      for (const r of (await repo.rueckverweise(haupt.mappeId)).slice(0, 200)) {
        const qt = alleTypen.get(r.quelleTypId);
        if (!qt || qt.system || istAbsenderTyp(qt)) continue;
        dazu(r.quelleId, r.quelleTypId, 2, `verweist über „${qt.felder.find((f) => f.key === r.feldKey)?.label ?? r.feldKey}“ auf den Absender`);
      }
      const frueher = (await repo.erkennungenMitAbsender(haupt.mappeId, 50)).filter((id) => id !== post.id);
      const zaehler = new Map<string, number>();
      for (const p of await repo.holeMappen(frueher)) for (const z of Array.isArray(p.werte.bezug) ? p.werte.bezug.map(String) : []) zaehler.set(z, (zaehler.get(z) ?? 0) + 1);
      const ziel = await repo.holeMappen([...zaehler.keys()]);
      for (const m of ziel) {
        const n = zaehler.get(m.id)!;
        if (alleTypen.get(m.typId)?.system) continue;
        dazu(m.id, m.typId, 2 + Math.min(n, 5), `frühere Post dieses Absenders ging hierher${n > 1 ? ` (${n}-mal)` : ''}`);
      }
      const at = alleTypen.get(haupt.typId);
      if (at?.register.some((r) => r.art === 'dokumente')) dazu(haupt.mappeId, haupt.typId, 1, 'der Absender selbst');
    }
    const ergebnis: PostErkennung = {
      zeit: new Date().toISOString(),
      dokumente,
      absender,
      eindeutig: eindeutig?.mappeId ?? null,
      angaben: { datum: angaben.datum, betrag: angaben.betrag, nummern: angaben.nummern.slice(0, 10) },
      briefkopf: absender.length ? null : angaben.briefkopf,
      ziele: [...ziele.values()].sort((a, b) => b.punkte - a.punkte).slice(0, MAX_ZIELE),
    };
    await repo.erkennungSchreibe(post.id, ergebnis, ergebnis.eindeutig);
    log.info('Erkennung für Post', { post: post.id, dokumente, absender: absender.length, eindeutig: !!eindeutig, ziele: ergebnis.ziele.length, ms: Date.now() - start });
    return ergebnis;
  }

  /** Gespeichertes Ergebnis; fehlt es (ältere Post, E-Mail ohne Anhang), wird es jetzt einmal gerechnet. */
  async ergebnis(postId: string): Promise<PostErkennung | null> {
    const da = await this.repo().erkennungLies(postId);
    return da ? da.ergebnis as PostErkennung : this.fuerPost(postId);
  }

  /** Für die Oberfläche bzw. die API: nur, was der Benutzer lesen darf. */
  async fuerBenutzer(postId: string, z?: Zugriff): Promise<ErkennungAntwort> {
    const post = await this.d.pruefeRecht(z, postId, 'R');
    const typ = await this.repo().holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(422, 'Vorschläge beim Zuordnen gibt es nur für Post.');
    const e = await this.ergebnis(postId);
    if (!e) throw new Fachfehler(404, 'Diese Post gibt es nicht.');
    const ids = [...e.absender.map((x) => x.mappeId), ...e.ziele.map((x) => x.mappeId)];
    const lesbar = await this.d.lesbare(z, ids);
    const bezuege = await this.repo().bezuege(ids.filter((id) => lesbar.has(id)));
    const titel = (id: string) => bezuege.get(id)?.titel ?? '';
    const absender = e.absender.filter((x) => lesbar.has(x.mappeId) && bezuege.has(x.mappeId)).map((x) => ({ ...x, titel: titel(x.mappeId) }));
    const ziele = e.ziele.filter((x) => lesbar.has(x.mappeId) && bezuege.has(x.mappeId)).map((x) => ({ ...x, titel: titel(x.mappeId) }));
    return {
      zeit: e.zeit, dokumente: e.dokumente, absender,
      eindeutig: e.eindeutig && lesbar.has(e.eindeutig) ? e.eindeutig : null,
      angaben: e.angaben,
      neuerAbsender: e.briefkopf && !absender.length ? await this.neuerAbsender(e.briefkopf, z) : null,
      ziele,
      bezuege: Object.fromEntries(bezuege),
    };
  }

  /** „Neue Organisation anlegen“: der erste Absender-Typ mit Namensfeld, den der Benutzer sieht und anlegen darf. */
  private async neuerAbsender(b: Briefkopf, z?: Zugriff): Promise<ErkennungAntwort['neuerAbsender']> {
    if (!b.name) return null;
    const typen = (await this.repo().listeTypen()).filter((t) => istAbsenderTyp(t) && (!z || z.typen.has(t.id)));
    // Organisation vor Person: kein Vorname/Nachname; ein Typ mit Kennung „…organisation“ zuerst.
    const kandidaten = typen.filter((t) => !t.felder.some((f) => /vorname|nachname/.test(f.key)))
      .sort((a, c) => Number(/organisation/.test(c.schluessel ?? '')) - Number(/organisation/.test(a.schluessel ?? '')));
    for (const t of kandidaten) {
      if (z && !(await this.d.rechteAn(z, { id: '', typId: t.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C) continue;
      const leer = { emails: [], internet: [], ibans: [], ustids: [], telefon: [], mobil: [], fax: [], datum: null, betrag: null, nummern: [], person: null, briefkopf: b };
      const werte = Object.fromEntries(Object.entries(vorschlaegeAus(t, '', leer)).filter(([, v]) => typeof v.wert === 'string').map(([k, v]) => [k, v.wert as string]));
      if (Object.keys(werte).length) return { typId: t.id, werte, fundstelle: b.fundstelle };
    }
    return null;
  }
}
