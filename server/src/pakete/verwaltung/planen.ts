/**
 * Vorschau planen (`plane`): was ein Paket anlegt bzw. ergänzt, mit allen Prüfungen – für Vorschau und Installation.
 * Die Schritte (#1278, Schritt 6a-2) stehen in planen-schritte.ts (mit der Paketverwaltung) und planen-lauf.ts (Stand,
 * Sprachpaket, Hinweise, Namen, Ansichten) – in dieser Reihenfolge, wie vorher.
 */
import { type Katalog, type KatalogVersion } from '../../../../shared/src/pakete';
import { t } from '../../sprache/sprache';
import { mitkommtVon } from '../index';
import { eigeneKonflikte } from '../index';
import { type Paket } from './format';
import { nachEltern } from './hilfen';
import { type Vorschau } from './plan';
import {
  ausgelasseneSichten,
  belegteNamen,
  inhaltsHinweise,
  type PlanMehr,
  problem,
  pruefeSprachpaket,
  sichtPlan,
  typIdVon,
} from './planen-lauf';
import { PaketPlanSchritte } from './planen-schritte';

/** Vorschau planen. */
export abstract class PaketPlanung extends PaketPlanSchritte {
  /**
   * geplant (#405): Namen von Mappentypen und Ansichten (oberste Ebene), die Pakete davor im selben Ablauf anlegen –
   * sie zählen wie vorhandene; die eigenen kommen dazu.
   */
  protected async plane(
    paket: Paket,
    v?: KatalogVersion,
    katalog?: Katalog,
    namen: Record<string, string> = {},
    sichtNamen: Record<string, string> = {},
    mehr: PlanMehr = {},
  ): Promise<Vorschau> {
    const { geplant, quelle, sammel, ablauf } = mehr;
    const l = await this.neuerPlanLauf(paket, { v, katalog, namen, sichtNamen, geplant, quelle, sammel, ablauf });
    const herkunft = this.pruefeHerkunft(l);
    // Was Ablago darf (#1562): über der Grenze weder installieren noch aktualisieren – mit Grund in Worten.
    await this.pruefeDarf(l, herkunft.geprueft);
    pruefeSprachpaket(l);
    const dmsTypen = await this.pruefeDmsVerweise(l);
    inhaltsHinweise(l);
    const abhaengigkeiten = this.planeAbhaengigkeiten(l);
    const { belegt, namensHerkunft } = belegteNamen(l);
    const ueb = await this.uebernahme(paket, l.ich);
    if (ueb) l.hinweise.push(t('meldungen.pakete.ablageort-uebernommen', { name: ueb.name }));
    // Vorgaben (#1038): Zustand je Vorgabe, Ergänzungen an Vorgaben anderer Pakete (die es geben muss).
    const vorgaben = await this.planeVorgaben(paket, l.ich, {
      installierte: l.installierte,
      typen: l.typen,
      namen,
      herausgeber: l.herausgeber,
      hinweise: l.hinweise,
    });
    const beruflich = paket.typen.some((x) => x.archiv?.jahreBeruflich) && (await this.d.kern.merkmale()).beruflich;
    const typIdJetzt = typIdVon(l, dmsTypen, ueb);
    const umbau = await this.planeUmbauLage(l, typIdJetzt, vorgaben.vorgaben);
    const typen = await Promise.all(paket.typen.map((paketTyp) => this.typPlan(l, paketTyp, { ueb, umbau, belegt, beruflich })));
    for (const n of belegt) geplant?.typen.add(n);
    const ausgelassen = ausgelasseneSichten(l, nachEltern(paket.sichten));
    const sichten = paket.sichten.map((s) => sichtPlan(l, s, { ausgelassen, ueb, typIdJetzt }));
    // Namenskonflikte (#1123) vor dem Installieren: je Typ bzw. Ansicht mit Herkunft – in der Vorschau durch Umbenennen lösbar.
    const namenskonflikte = eigeneKonflikte({
      typen,
      sichten,
      herkunft: namensHerkunft,
      uebernommen: new Set(umbau.schritte.flatMap((g) => (g.plan.art === 'uebernehmen' && g.alt ? [g.alt.id] : []))),
    });
    for (const k of namenskonflikte) problem(l, 'namenskonflikt', k);
    const vorschau = await this.baueVorschau(l, { herkunft, abhaengigkeiten, typen, sichten, vorgaben, umbau, namenskonflikte });
    if (umbau.schritte.length) this.umbauLagen.set(vorschau, umbau);
    vorschau.mitkommt = mitkommtVon(paket, vorschau, this.mitkommtNamen(paket, l.installierte, l.typen), !!l.ich);
    vorschau.kurzanleitung = paket.kurzanleitung ?? null;
    return vorschau;
  }
}
