/**
 * Erkennung im Kern (#336): Vorschläge beim Zuordnen von Post – Absender, Angaben und Zielmappe.
 *
 * Läuft auf das interne Ereignis „Volltext fertig“ (nicht auf das Ende der eingebauten Texterkennung),
 * damit es auch mit einer Texterkennung als Paket (#458) läuft. Gerechnet wird einmal je Post, das
 * Ergebnis liegt an der Post (Tabelle erkennungen). Gespeichert sind nur Ids und Begründungen; beim
 * Lesen sieht jeder nur die Mappen, die er lesen darf. Die Muster stehen in shared/src/erkennung/.
 *
 * #1278: aufgeteilt, die Tür bleibt hier – die Klasse ist eine Kette ErkennungBasis (erkennung-basis.ts) →
 * ErkennungPositionen (erkennung-positionen.ts) → ErkennungAbgleich (erkennung-abgleich.ts) → ErkennungPost
 * (erkennung-post.ts) → Erkennung; Typen und Hilfen in erkennung-hilfen.ts.
 */
import { ErkennungPost } from './erkennung-post';
import type { ErkennungDienst } from './erkennung-basis';
import type { Repo } from '../repo';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { Klassifizierung } from './klassifizierung';
import { Gelerntes } from './gelerntes';
import {
  type ErkennAnbieter,
  type PostErkennung,
  type ErkennungAntwort,
  type TypVorschlaege,
  TEXT_MAX,
  log,
  ohneFremdeFundstellen,
  ausstellerAus,
} from './erkennung-hilfen';
import { t } from '../sprache/sprache';
import type { Zugriff } from '../kern';
import { Fachfehler } from '../grundlagen/fehler';
import { type Mappentyp, type Mappe, type MappenBezug, zieleVon } from '../../../shared/src/model';
import {
  schemaFuer,
  findeAngaben,
  ENGINE_EINGEBAUT,
  pruefeVorschlaege,
  vorschlaegeAus,
  type Vorschlag,
  eigenerAussteller,
  fuellfelder,
  wendeGutschriftAn,
} from '../../../shared/src/erkennung';
import { type ERechnung, erechnungText, vorschlaegeAusERechnung } from '../../../shared/src/erechnung';
import { ohneErkennung } from '../../../shared/src/anlagen';
import { Vorberechnung } from './vorberechnung';
import { istXmlDatei } from './erechnung';
import { DokumentCodes } from './codes';

export { sichereZuordnung, type PostErkennung } from './erkennung-hilfen';

export class Erkennung extends ErkennungPost {
  constructor(
    protected d: ErkennungDienst,
    protected repo: () => Repo,
    protected einst: () => Einstellungen | undefined = () => undefined,
  ) {
    super();
    this.gelerntes = new Gelerntes(einst, repo, d);
    this.klassifizierung = new Klassifizierung(d, this, repo, this.gelerntes);
    this.vorberechnung = new Vorberechnung(
      {
        klassifiziere: (e, z) => this.klassifizierung.klassifiziere(e, z),
        fuerTyp: (typId, e, z) => this.fuerTyp(typId, e, z),
        abgleichDokumente: (e, z) => this.abgleichDokumente(e, z),
      },
      repo,
      einst,
    );
    this.codes = new DokumentCodes(d, repo, () => this.standard());
    // Mappentyp am Code (#1728): Codes nach der Vorberechnung rechnen sie neu.
    this.codes.gelesen = (mappe) => void this.vorberechnung.nachCodes(mappe);
  }

  /** „Wohin gehört das?“ mehrstufig (#939): Pakete mit dms:klassifizieren, Kern-Erkennung und Abgleich. */
  readonly klassifizierung: Klassifizierung;
  /** Aus Korrekturen gelernt (#1681): Typ je Absender, Kennwort je Absender und Feld. */
  readonly gelerntes: Gelerntes;
  /** Erkennung im Hintergrund vorberechnen (#1567): Beim Öffnen der Post wird nur gelesen. */
  readonly vorberechnung: Vorberechnung;
  /** Codes auf Dokumenten (#1723): von einem Paket mit dms:codes gelesen, für Felder mit der Erkennungsart „code“. */
  readonly codes: DokumentCodes;

  /** Wird gesetzt, sobald der Paket-Läufer läuft (index.ts). */
  anbieter?: ErkennAnbieter;

  /** Hörer auf „Volltext fertig“: Gehört das Dokument zu Post, die Erkennung dieser Post neu rechnen. */
  async nachVolltext(e: { dokument: string; mappe: string }): Promise<PostErkennung | null> {
    const m = await this.repo().holeMappe(e.mappe);
    if (!m) return null;
    const t = await this.repo().holeTyp(m.typId);
    if (t?.system !== 'post') return null;
    const ergebnis = await this.fuerPost(m.id);
    // Automatisch zuordnen (#337): nur nach neuem Volltext, nie beim bloßen Lesen.
    if (ergebnis) await this.d.post.automatischZuordnen(m.id, ergebnis);
    // Ereigniskatalog (#670): eigene Schritte lassen sich hinten an die Erkennung hängen.
    if (ergebnis) await this.d.kern.ereignis('erkennung.fertig', { mappe: m.id, typ: m.typId, dokument: e.dokument });
    // Vorberechnen (#1567): erst, wenn alle Dokumente der Post ihren Volltext haben und die Post noch nicht zugeordnet ist.
    if (ergebnis && !ergebnis.auto) this.vorberechnung.anstossen(m.id);
    return ergebnis;
  }

  /** Für die Oberfläche bzw. die API: nur, was der Benutzer lesen darf. */
  async fuerBenutzer(postId: string, z?: Zugriff): Promise<ErkennungAntwort> {
    const post = await this.d.rechtepruefung.pruefeRecht(z, postId, 'R');
    const typ = await this.repo().holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(422, t('meldungen.erkennung.vorschlaege-beim-zuordnen-gibt'));
    const e = await this.ergebnis(postId);
    if (!e) throw new Fachfehler(404, t('meldungen.erkennung.diese-post-gibt-es'));
    const ids = [
      ...e.absender.map((x) => x.mappeId),
      ...e.ziele.map((x) => x.mappeId),
      ...(e.auto ? [e.auto.ziel] : []),
      ...(e.ausgehend ? [e.ausgehend.mappeId] : []),
    ];
    const lesbar = await this.d.rechtepruefung.lesbare(z, ids);
    const bezuege = await this.repo().bezuege(ids.filter((id) => lesbar.has(id)));
    const titel = (id: string) => bezuege.get(id)?.titel ?? '';
    const absender = e.absender
      .filter((x) => lesbar.has(x.mappeId) && bezuege.has(x.mappeId))
      .map((x) => ({ ...x, titel: titel(x.mappeId) }));
    const ziele = e.ziele.filter((x) => lesbar.has(x.mappeId) && bezuege.has(x.mappeId)).map((x) => ({ ...x, titel: titel(x.mappeId) }));
    return {
      zeit: e.zeit,
      dokumente: e.dokumente,
      absender,
      eindeutig: e.eindeutig && lesbar.has(e.eindeutig) ? e.eindeutig : null,
      angaben: e.angaben,
      neuerAbsender: e.briefkopf && !absender.length ? await this.neuerAbsender(e.briefkopf, z) : null,
      ziele,
      bezuege: Object.fromEntries(bezuege),
      auto:
        e.auto && lesbar.has(e.auto.ziel) && (!e.eindeutig || lesbar.has(e.eindeutig))
          ? { ziel: e.auto.ziel, zeit: e.auto.zeit, grund: e.auto.grund, rueckgaengig: !!e.auto.rueckgaengig }
          : null,
      ausgehend: e.ausgehend
        ? { titel: lesbar.has(e.ausgehend.mappeId) ? titel(e.ausgehend.mappeId) : '', fundstelle: e.ausgehend.fundstelle }
        : null,
    };
  }

  /** Typ und Zugriff prüfen: bestehende Mappe braucht Bearbeiten, eine neue das Anlegen. */
  private async typFuer(typId: string, mappeId: string | undefined, z?: Zugriff): Promise<{ typ: Mappentyp; mappe?: Mappe }> {
    const typ = z ? z.typen.get(typId) : await this.repo().holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.erkennung.diesen-mappentyp-gibt-es'));
    if (typ.system) throw new Fachfehler(422, t('meldungen.erkennung.ist-ein-systemmappentyp-dort', { name: typ.name }));
    if (mappeId) {
      const mappe = await this.d.rechtepruefung.pruefeRecht(z, mappeId, 'U');
      if (mappe.typId !== typ.id) throw new Fachfehler(422, t('meldungen.erkennung.die-mappe-hat-einen'));
      return { typ, mappe };
    }
    if (
      z &&
      !(
        await this.d.rechtepruefung.rechteAn(z, { id: '', typId: typ.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)
      ).C
    )
      throw new Fachfehler(403, t('meldungen.erkennung.mappen-dieses-typs-darfst'));
    return { typ };
  }

  /** JSON Schema der Felder, die die Erkennung füllen darf (#391; für Clients und künftige Engines aus Paketen). */
  async schema(typId: string, z?: Zugriff): Promise<Record<string, unknown>> {
    const typ = z ? z.typen.get(typId) : await this.repo().holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.erkennung.diesen-mappentyp-gibt-es'));
    return schemaFuer(typ, this.erlaubteFelder(typ));
  }

  /**
   * „Aus Dokument ausfüllen“ (#391, Stufe 1): eingebaute Erkennung gegen die Felder des Typs. Text aus `text`
   * (z. B. von Fotos, die gerade gelesen wurden) und den Volltexten der Dokumente `dokumente` (muss man lesen
   * dürfen). Verweisfelder: vorhandene Mappe des Zieltyps, die sich im Text wiederfindet – sonst ein Vorschlag
   * „neu anlegen“. Jede Antwort geht durch die Prüfung gegen die Feldtypen; nichts wird gespeichert.
   */
  async fuerTyp(typId: string, eingabe: unknown, z?: Zugriff, zusatz?: { erechnung?: ERechnung | null }): Promise<TypVorschlaege> {
    const e = (eingabe ?? {}) as { text?: unknown; dokumente?: unknown; mappe?: unknown; positionen?: unknown };
    const { typ, mappe } = await this.typFuer(typId, typeof e.mappe === 'string' && e.mappe ? e.mappe : undefined, z);
    const teile: string[] = [];
    if (typeof e.text === 'string' && e.text.trim()) teile.push(e.text.slice(0, TEXT_MAX));
    // Mappentypen, aus denen der Text stammt (#796): Gesperrte gehen an kein KI-Paket.
    const quellTypen = new Set<string>([typ.id]);
    const quellMappen = new Set<string>();
    // E-Rechnung (#1043): aus der Datei (Route) oder aus einem der Dokumente – XML direkt, PDF über den Anhang.
    let er = zusatz?.erechnung ?? null;
    for (const id of (Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string').slice(0, 10)) {
      const d = await this.repo().holeDokument(id);
      if (!d) throw new Fachfehler(404, t('meldungen.erkennung.dieses-dokument-gibt-es'));
      quellTypen.add((await this.d.rechtepruefung.pruefeRecht(z, d.mappeId, 'R')).typId);
      quellMappen.add(d.mappeId);
      // Anlagen (#998) und Original-E-Mail (#999): Erkennung und KI nutzen nur Hauptdokumente.
      if (ohneErkennung(d)) continue;
      if (!er && (istXmlDatei(d.name, d.mime) || d.mime === 'application/pdf'))
        er = await this.erechnungAus(() => this.d.kern.liesGanz(d.sha256), d.name, d.mime, d.groesse);
      const eintrag = await this.repo().volltext(id);
      // Eine E-Rechnung als XML hat keinen Volltext – dann ist ihr Text der lesbare Auszug.
      if (!eintrag?.trim() && er && istXmlDatei(d.name, d.mime)) {
        teile.push(erechnungText(er));
        continue;
      }
      if (!eintrag?.trim()) throw new Fachfehler(409, t('meldungen.erkennung.hat-noch-keinen-volltext', { name: d.name }));
      teile.push(eintrag);
    }
    if (er && !teile.length) teile.push(erechnungText(er));
    const text = teile.join('\n\n').slice(0, TEXT_MAX);
    const erlaubt = this.erlaubteFelder(typ, mappe);
    const angaben = findeAngaben(text);
    // Erkennung per Paket (#511), wenn gewählt; sonst bzw. wenn das Paket nicht antwortet: eingebaut.
    const dokIds = await this.ohneAnlagen(
      (Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string').slice(0, 10),
    );
    let engine: TypVorschlaege['engine'] = { art: 'eingebaut' };
    let hinweis: string | undefined;
    let ausPaket: Record<string, unknown> | null = null;
    let gekuerzt = false;
    const wahl = text.trim() ? await this.wahlFuer(typ.id) : { engine: ENGINE_EINGEBAUT, abfluss: false };
    if (wahl.engine !== ENGINE_EINGEBAUT) {
      const p = this.anbieter?.pakete().find((x) => x.id === wahl.engine);
      const gesperrt = p ? await this.d.ki.kiSperreFuer(p.id) : () => false;
      const kiTyp = [...quellTypen].find((x) => gesperrt(x));
      if (!p) hinweis = t('meldungen.erkennung.das-paket-fuer-die', { engine: wahl.engine });
      else if (p.netz && !wahl.abfluss) hinweis = t('meldungen.erkennung.fuer-ist-der-datenabfluss', { name: p.name });
      else if (kiTyp) {
        // KI-Dienste (#796): Ziel- oder Quell-Mappentyp nicht zugelassen – nichts an das Paket, die eingebaute Erkennung übernimmt.
        hinweis = t('meldungen.erkennung.ki-nicht-zugelassen', { name: p.name, typ: (await this.repo().holeTyp(kiTyp))?.name ?? '' });
        log.info('Erkennung nicht an Paket gegeben (Mappentyp nicht für KI-Dienste zugelassen)', { typ: typ.name, paket: p.id });
      } else {
        try {
          const r = await this.perPaket(p, typ, text, dokIds, erlaubt);
          // Geantwortet, aber nichts, was die Prüfung übersteht (#564): wie bei einem Fehler die eingebaute Erkennung.
          if (r.ohneFelder || Object.keys(pruefeVorschlaege(typ, r.vorschlaege, erlaubt).vorschlaege).length) {
            ausPaket = ohneFremdeFundstellen(r.vorschlaege, text, typ.name, p.id);
            gekuerzt = r.gekuerzt;
            engine = { art: 'paket', id: p.id, name: p.name };
          } else {
            hinweis = t('meldungen.erkennung.hat-nichts-brauchbares-geliefert', { name: p.name });
            log.info('Erkennung per Paket ohne brauchbare Vorschläge', {
              typ: typ.name,
              paket: p.id,
              felder: Object.keys(r.vorschlaege).length,
            });
          }
        } catch (x) {
          hinweis = t('meldungen.erkennung.hat-nicht-geantwortet-die', { name: p.name, message: (x as Error).message });
          log.warn('Erkennung per Paket fehlgeschlagen', { typ: typ.name, paket: p.id, fehler: (x as Error).message.slice(0, 300) });
        }
      }
    }
    // Gleichbedeutende Wörter (#1657): „Rechnung“ und „Beleg“ – weitere Wörter, hinter denen eine Nummer steht.
    const gruppen = ausPaket ? [] : await this.d.suche.gleichbedeutendeWoerter().catch(() => []);
    const roh: Record<string, unknown> = ausPaket ?? vorschlaegeAus(typ, text, angaben, { gruppen });
    // Hinweise am Vorschlag kommen nur aus dem Kern (eingebaute Erkennung, E-Rechnung, Verweise) – nie aus einem Paket.
    const hinweise = new Map<string, string>();
    if (!ausPaket) for (const [k, v] of Object.entries(roh)) if ((v as Vorschlag).hinweis) hinweise.set(k, (v as Vorschlag).hinweis!);
    // E-Rechnung (#1043): Ihre Werte stehen exakt in den Daten und gehen vor – geprüft wird danach wie bei allen.
    const ausER = er ? vorschlaegeAusERechnung(typ, er) : {};
    for (const [k, v] of Object.entries(ausER)) {
      roh[k] = v;
      if (v.hinweis) hinweise.set(k, v.hinweis);
      else hinweise.delete(k);
    }
    const bezuege: Record<string, MappenBezug> = {};
    const neu: TypVorschlaege['neu'] = {};
    // Eigene Organisation und Haushalt (#995, #1043): nie „von“; stehen sie als Aussteller drin, ist der Beleg wohl ausgehend.
    const eigen = await this.eigeneLage();
    const aussteller = eigenerAussteller(ausstellerAus(angaben, er), eigen.angaben);
    const felder = fuellfelder(typ).map((x) => x.feld);
    // Ausgehend: „an“ bekommt die Gegenseite, auch wenn das Feld nicht für die Erkennung markiert ist.
    const an = aussteller ? typ.felder.find((f) => f.key === 'an' && f.typ === 'referenz' && !felder.includes(f)) : undefined;
    for (const f of an ? [...felder, an] : felder) {
      if (f.typ !== 'referenz' || !zieleVon(f).length || !erlaubt(f)) continue;
      const v = await this.verweisFuer(f, text, angaben, z, { eigen, aussteller });
      if (v?.mappe) {
        roh[f.key] = { wert: f.mehrfach ? [v.mappe.id] : v.mappe.id, sicherheit: v.sicherheit, fundstelle: v.fundstelle };
        if (v.hinweis) hinweise.set(f.key, v.hinweis);
        else hinweise.delete(f.key);
        bezuege[v.mappe.id] = { titel: v.mappe.titel ?? '', typId: v.mappe.typId };
      } else if (v?.neu) neu[f.key] = v.neu;
    }
    // „an“ nie dieselbe Mappe wie „von“ (#1485) – auch nicht aus einem Paket: Der Empfänger ist nie der Aussteller.
    const gleich = (x: unknown) => JSON.stringify([(x as Vorschlag | undefined)?.wert].flat());
    if (roh.an && roh.von && gleich(roh.an) === gleich(roh.von)) {
      delete roh.an;
      hinweise.delete('an');
    }
    if (aussteller && !roh.von) hinweis = [hinweis, t('meldungen.erkennung.ausgehend-allgemein')].filter(Boolean).join(' ');
    // Gelernt aus Korrekturen (#1681): der Wert hinter dem Kennwort dieses Absenders geht vor – mit Hinweis.
    for (const [k, v] of Object.entries(await this.gelerntes.feldVorschlaege([...quellMappen], typ, text)))
      if (!ausER[k]) {
        roh[k] = { wert: v.wert, sicherheit: 'hoch', fundstelle: v.fundstelle };
        hinweise.set(k, v.hinweis);
      }
    // Codes auf dem Dokument (#1723): exakt gelesen – gehen in Feldern mit der Erkennungsart „code“ vor Text, Paket und Gelerntem.
    await this.codes.trageEin(typ, dokIds, erlaubt, roh, hinweise);
    // Jede Antwort – eingebaut oder vom Paket – geht durch die Prüfung gegen die Feldtypen; verworfen wird mit Grund protokolliert (ohne Werte).
    const { vorschlaege, verworfen } = pruefeVorschlaege(typ, roh, erlaubt);
    for (const [k, v] of Object.entries(vorschlaege)) {
      const h = hinweise.get(k);
      if (h) v.hinweis = h;
    }
    // Gutschrift (#1043): positive Beträge negativ, wo das Feld es erlaubt – auch bei Antworten aus Paketen.
    wendeGutschriftAn(typ, vorschlaege, angaben.gutschrift, new Set(Object.keys(ausER)));
    // Lieferschein und Rechnung (#1043): Eine Mappe des Zieltyps, in deren Dokumenten die Nummer dieses Belegs steht.
    await this.nenntNummer(typ, vorschlaege, bezuege, erlaubt, z);
    // Folgt aus (#886): Felder, die aus einem vorgeschlagenen Verweis folgen, bekommen ihren Vorschlag dazu.
    await this.d.mappenEingaben.folgeVorschlaege(typ, { vorschlaege, bezuege, neu }, z);
    // Aus Datum ableiten (#1648): z. B. Steuerjahr aus „Bis“ – die passende Mappe oder „… anlegen“.
    await this.d.mappenEingaben.ausDatumVorschlaege(typ, { vorschlaege, bezuege, neu }, erlaubt, z);
    // Beim Auswählen übernehmen (#1037): Werte aus vorgeschlagenen Mappen, mit den Rechten der Person – erst hier, nach
    // einer Erkennung per Paket, damit sie nie an ein KI-Paket gehen (#796).
    await this.d.mappenEingaben.vorbelegenVorschlaege(typ, { vorschlaege, bezuege, neu }, erlaubt, mappe, z);
    if (verworfen.length)
      log.warn('Vorschläge der Erkennung verworfen', {
        typ: typ.name,
        engine: engine.art === 'paket' ? engine.id : ENGINE_EINGEBAUT,
        felder: verworfen.map((x) => `${x.feld}: ${x.grund}`).join('; '),
      });
    // Fundstellen (#939): Seite und Rahmen aus der Textebene bzw. Texterkennung; nicht gefunden = Wert ohne Rahmen.
    if (dokIds.length && Object.keys(vorschlaege).length) await this.stellen(typ, vorschlaege, dokIds);
    const positionen = er ? await this.positionen(typ, er, z, mappe, e.positionen === true || e.positionen === '1') : undefined;
    const dazu = text.trim() ? await this.dazu(text, typ, mappe, z) : [];
    log.info('Aus Dokument ausfüllen', {
      typ: typ.name,
      engine: engine.art === 'paket' ? engine.id : ENGINE_EINGEBAUT,
      zeichen: text.length,
      vorschlaege: Object.keys(vorschlaege).length,
      neu: Object.keys(neu).length,
      erechnung: er?.syntax ?? null,
      positionen: positionen?.zeilen.length ?? 0,
      dazu: dazu.length,
      ausgehend: !!aussteller,
    });
    return {
      vorschlaege,
      bezuege,
      neu,
      verworfen: verworfen.length,
      zeichen: text.length,
      engine,
      ...(hinweis ? { hinweis } : {}),
      ...(gekuerzt ? { gekuerzt: true as const } : {}),
      ...(er
        ? {
            erechnung: {
              syntax: er.syntax,
              gutschrift: er.gutschrift,
              ...(er.profil ? { profil: er.profil } : {}),
              ...(er.nummer ? { nummer: er.nummer } : {}),
            },
          }
        : {}),
      ...(positionen?.zeilen.length || positionen?.zurueckgehalten ? { positionen } : {}),
      ...(dazu.length ? { dazu } : {}),
    };
  }
}
