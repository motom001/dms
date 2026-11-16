/**
 * Teile der Vorschau: Text-Vorlagen, Vorgaben (#1038), Titel der Ziele, was mitkommt (#1047), Namen von Typen.
 */
import { zieleVon, type Mappe, type Mappentyp } from '../../../../shared/src/model';
import { DMS_RECHTE_TYPEN, type InstalliertesPaket } from '../../../../shared/src/pakete';
import { bereinigeVorlage, karteText } from '../../../../shared/src/ablaufvorlagen';
import { typKennung } from '../../../../shared/src/kennungen';
import { t } from '../../sprache';
import { planeErgaenzungen, planeVorgaben } from '../index';
import { titelKennung, type TitelSuche } from '../index';
import { type MitkommtNamen } from '../index';
import { vorgabeVerweis, type ErgaenzungPlan, type VorgabePlan } from '../../../../shared/src/vorgaben';
import { DMS_TYPEN, type Paket, paketZiele } from './format';
import { type Vorschau } from './plan';
import { PaketUploads } from './uploads';

/** Teile, aus denen `plane` die Vorschau zusammensetzt. */
export abstract class PaketVorschauTeile extends PaketUploads {
  /**
   * Rechte-Vorschau der Automatisierungsvorlagen (#1044): Karten in Klartext; neu oder mit anderen Karten als die
   * installierte Fassung (Sicherheit: ein Update ändert keine Karte ohne neue Vorschau).
   */
  protected async vorlagenPlan(paket: Paket, typen: Mappentyp[]): Promise<NonNullable<Vorschau['ablaufvorlagen']>> {
    const da = await this.d.ablaeufe.vorlagen();
    const felder = [...typen, ...(paket.typen as unknown as Mappentyp[])];
    return (paket.ablaufvorlagen ?? []).map((a) => {
      const d = bereinigeVorlage(a.daten);
      const alt = da.find(
        (v) =>
          v.kennung === (a.ersetzt ?? `${paket.manifest.id}:${a.schluessel}`) && v.herkunft === 'paket' && v.paketId === paket.manifest.id,
      );
      const karten = d.karten.map((k) => karteText(k, felder));
      return {
        schluessel: a.schluessel,
        name: d.name,
        karten,
        ersetzt: a.ersetzt ?? null,
        neu: !alt,
        geaendert: !!alt && JSON.stringify(alt.karten.map((k) => karteText(k, felder))) !== JSON.stringify(karten),
      };
    });
  }

  /**
   * Vorschau der Vorgaben (#1038). Hinweise: Vorlagen für eine Vorgabe, die es nicht gibt, kommen nicht; ein Paket
   * eines anderen Herausgebers ergänzt Mappen eines Pakets (steht so in der Vorschau, #1084).
   */
  protected async planeVorgaben(
    paket: Paket,
    ich: InstalliertesPaket | null,
    x: {
      installierte: InstalliertesPaket[];
      typen: Mappentyp[];
      namen: Record<string, string>;
      herausgeber: string | null;
      hinweise: string[];
    },
  ): Promise<{ vorgaben: VorgabePlan[]; ergaenzungen: ErgaenzungPlan[] }> {
    const m = paket.manifest;
    const { installierte, typen, namen, herausgeber, hinweise } = x;
    if (!paket.vorgaben?.length && !paket.ergaenzungen?.length) return { vorgaben: [], ergaenzungen: [] };
    const lage = await this.vorgabenLage(paket, ich);
    const typ = (vw: string) => {
      const v = vorgabeVerweis(vw, m.id);
      if (v.paket === m.id) {
        const pt = paket.typen.find((x) => x.schluessel === v.schluessel);
        const da = typen.find((x) => x.id === ich?.typen[v.schluessel]);
        return {
          daten: da ?? (pt as unknown as Mappentyp | undefined),
          name: da?.name ?? namen[v.schluessel] ?? pt?.name ?? v.schluessel,
          fremd: null,
        };
      }
      const p = installierte.find((x) => x.id === v.paket);
      const da = typen.find((x) => x.id === p?.typen[v.schluessel]);
      return { daten: da, name: da?.name ?? v.schluessel, fremd: p?.name ?? v.paket };
    };
    const vorgaben = planeVorgaben({ vorgaben: paket.vorgaben ?? [], lage, ich, sprache: await this.sprache(), typ });
    const ziele = new Map<string, Mappe | undefined>();
    for (const e of paket.ergaenzungen ?? []) ziele.set(e.ziel, await this.vorgabeMappe(e.ziel, m.id));
    const ergaenzungen = planeErgaenzungen(paket.ergaenzungen ?? [], ich, (z) => {
      const p = vorgabeVerweis(z, m.id).paket;
      return { mappe: ziele.get(z), paket: installierte.find((x) => x.id === p)?.name ?? p };
    });
    for (const e of ergaenzungen.filter((x) => x.fehlt))
      hinweise.push(t('meldungen.pakete.vorgaben.ergaenzung-ohne-ziel', { ziel: e.name, paket: e.paket }));
    // Herausgeber (#1084): Ergänzt das Paket Mappen eines Pakets, das jemand anderes herausgibt, steht das ausdrücklich da.
    const fremdePakete = new Set([
      ...vorgaben
        .filter((v) => v.fremd)
        .map((v) => vorgabeVerweis(paket.vorgaben!.find((x) => x.schluessel === v.schluessel)!.typ, m.id).paket),
      ...ergaenzungen.map((e) => vorgabeVerweis(e.ziel, m.id).paket),
    ]);
    for (const pid of fremdePakete) {
      const p = installierte.find((x) => x.id === pid);
      const h = p ? this.herausgeberVon(p) : null;
      if (p && h !== herausgeber)
        hinweise.push(
          t('meldungen.pakete.vorgaben.anderer-herausgeber', {
            name: p.name,
            herausgeber: h ?? t('meldungen.pakete.herausgeber-unbekannt'),
          }),
        );
    }
    return { vorgaben, ergaenzungen };
  }

  /** Lesbarer Name eines Typverweises für die Rechte-Rückfrage. */
  /**
   * Auswahl → Verweis im Umbau (#1125), Vorschau: Mappen nach Titel unter den Zieltypen des Verweisfelds `feld` am Zieltyp
   * `nach` – vorhandene Mappen und Vorgaben, die dieses Paket neu anlegt (Platzhalter-Id). undefined = kein Verweisfeld.
   */
  protected async zielTitel(x: {
    paket: Paket;
    nach: string;
    feld: string;
    typen: Mappentyp[];
    installierte: InstalliertesPaket[];
    typId: (vw: string) => string | null;
    vorgaben: VorgabePlan[];
  }): Promise<TitelSuche | undefined> {
    const m = x.paket.manifest;
    const [p, sl] = x.nach.split(':');
    const eigen = p === m.id ? x.paket.typen.find((y) => y.schluessel === sl)?.felder.find((f) => f.key === x.feld) : undefined;
    const fremd =
      p !== m.id
        ? x.typen.find((y) => y.id === x.installierte.find((i) => i.id === p)?.typen[sl])?.felder.find((f) => f.key === x.feld)
        : undefined;
    if ((eigen ?? fremd)?.typ !== 'referenz') return undefined;
    const verweise = eigen ? paketZiele(eigen).map((vw) => (vw.includes(':') ? vw : typKennung(m.id, vw))) : [];
    const ids = eigen ? verweise.map(x.typId).filter((y): y is string => !!y) : zieleVon(fremd!);
    const index = new Map<string, string[]>();
    const dazu = (titel: string, id: string) => {
      const k = titelKennung(titel);
      index.set(k, [...new Set([...(index.get(k) ?? []), id])]);
    };
    for (const id of ids) for (const mp of await this.d.mappen.listeMappen(id)) if (mp.titel) dazu(mp.titel, mp.id);
    // Vorgaben, die erst mit dieser Installation kommen (#1038) – z. B. die Vertragsart „Strom“.
    for (const v of x.paket.vorgaben ?? []) {
      const plan = x.vorgaben.find((y) => y.schluessel === v.schluessel && !y.fremd);
      if (plan?.zustand === 'neu' && verweise.includes(v.typ.includes(':') ? v.typ : typKennung(m.id, v.typ)))
        dazu(plan.name, `vorgabe:${v.schluessel}`);
    }
    return (_typen, titel) => index.get(titelKennung(titel)) ?? [];
  }

  /** Namen für „Was mitkommt“ (#1047): Mappentyp eines Verweises und Bezeichnung eines Felds darin. */
  protected mitkommtNamen(paket: Paket, installierte: InstalliertesPaket[], typen: Mappentyp[]): MitkommtNamen {
    return {
      // Ohne „(paket)“ dahinter wie im Katalog: „60 Tage vor „Ende“ (Mietvertrag)“.
      typ: (vw) => {
        const [p, s] = vw.includes(':') ? vw.split(':') : [paket.manifest.id, vw];
        if (p === paket.manifest.id || p === 'dms') return this.typName(vw, paket, installierte, typen);
        return typen.find((x) => x.id === installierte.find((i) => i.id === p)?.typen[s])?.name ?? s;
      },
      feld: (vw, key) => {
        const [p, s] = vw.includes(':') ? vw.split(':') : [paket.manifest.id, vw];
        if (p === paket.manifest.id) return paket.typen.find((x) => x.schluessel === s)?.felder.find((f) => f.key === key)?.label ?? key;
        const id = installierte.find((x) => x.id === p)?.typen[s];
        return typen.find((x) => x.id === id)?.felder.find((f) => f.key === key)?.label ?? key;
      },
    };
  }

  protected typName(vw: string, paket: Paket, installierte: InstalliertesPaket[], typen: Mappentyp[]): string {
    const [p, s] = vw.includes(':') ? vw.split(':') : [paket.manifest.id, vw];
    if (p === paket.manifest.id) return paket.typen.find((t) => t.schluessel === s)?.name ?? s;
    if (p === 'dms') return DMS_TYPEN[s] ?? DMS_RECHTE_TYPEN[s] ?? s;
    const id = installierte.find((x) => x.id === p)?.typen[s];
    return `${typen.find((t) => t.id === id)?.name ?? s} (${p})`;
  }
}
