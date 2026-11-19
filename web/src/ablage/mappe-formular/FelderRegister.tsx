import type { ReactNode } from 'react';
import { abschnittTitel, feldLabel } from '../../../../shared/src/beschriftung';
import { abschnittName, beschreibeAnzeige, typNameAus } from '../../../../shared/src/anzeige';
import { gruppiere } from '../../../../shared/src/darstellung';
import { deutschePlz } from '../../../../shared/src/feldformate';
import { eigeneFelderIm } from '../../../../shared/src/sichten';
import { wertfelder } from '../../../../shared/src/tabelle';
import { altesFeldAusblenden } from '../../../../shared/src/umwandlung';
import {
  istLeer,
  verweisAusText,
  zielErlaubt,
  zusammengesetztText,
  type Abschnitt,
  type Feld as FeldDef,
  type Register,
  type Werte,
} from '../../../../shared/src/model';
import { Knopf } from '../../bausteine';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { ausRoh, werteAusRoh, type Roh } from '../../werte';
import { anzahlWerte } from '../anzeige';
import { Tabellenfeld } from '../Tabellenfeld';
import { FeldEingabe } from './FeldEingabe';
import { folgendeAus, grundAus } from './hilfen';
import type { Kern } from './kern';
import type { NeuesFormular } from './MappenWahl';
import { startMitVerweis } from './werte';
import { AusgeblendetZeile } from './Zeilen';

/** Was die Felder eines Registers brauchen: die Eingabe von Hand, die Hinweise am Feld und das Fenster „+ … anlegen“. */
export interface FelderWege {
  setze(k: string, v: Roh): void;
  hinweisAm(f: FeldDef): ReactNode;
  neuesFormular: NeuesFormular;
}

/**
 * Ein Feldregister: Felder in Gruppen, Abschnitte (#890) ein- und ausklappbar. Ausgeblendetes Feld mit Wert (#1033):
 * ruhige Zeile statt der Eingabe; aufgedeckt mit dem Satz „nur bei …“.
 */
export function FelderRegister({ z, r, w }: { z: Kern; r: Register; w: FelderWege }) {
  const { typ } = z.p;
  const eingabe = feldEingaben(z, w);
  /** Altes Textfeld nach einem Paket-Update (#534): leer ausgeblendet, sonst mit Hinweis auf die Umwandlung. */
  const sichtbar = (f: FeldDef) => !altesFeldAusblenden(f, z.p.mappe?.werte[f.key], verweisAusText(typ, f));
  // Abschnitte (#890): jede Gruppe ein eigenes Raster – so beginnt nach jedem Abschnitt eine neue Zeile.
  // Anzeige-Bedingungen (#1033): Felder ausgeblendeter Abschnitte bleiben in der Gruppe (für die ruhige Zeile);
  // ein selbst ausgeblendetes Feld nur, wenn es einen Wert hat.
  const gruppen = gruppiere(
    r.abschnitte,
    z.alleAuf(r),
    (f) => !z.ausgeblendet.has(f.key) && sichtbar(f) && (!z.anz.felder.has(f.key) || z.hatWert(f) || z.aufgedeckt.has(`f:${f.key}`)),
  );
  const abschnittAus = (a: Abschnitt) =>
    z.anz.abschnitte.some((x) => x.register === r.key && x.abschnitt.vor === a.vor) && !z.aufgedeckt.has(`a:${r.key}.${a.vor}`);
  const abschnittAufgedeckt = (a: Abschnitt) =>
    z.anz.abschnitte.some((x) => x.register === r.key && x.abschnitt.vor === a.vor) && z.aufgedeckt.has(`a:${r.key}.${a.vor}`);
  const sichtbareGruppen = gruppen.filter((g) => !g.abschnitt || !abschnittAus(g.abschnitt) || g.felder.some(z.hatWert));
  if (!sichtbareGruppen.length) return <p className="leise">{t('ablage.mappeformular.auf-diesem-register-liegen')}</p>;
  return (
    <div className="feldgruppen">
      {sichtbareGruppen.map((g) => {
        const a = g.abschnitt;
        // Abschnitt ausgeblendet, aber mit Werten: eine ruhige Zeile an seiner Stelle – nichts verschwindet heimlich.
        if (a && abschnittAus(a)) {
          const n = anzahlWerte(
            typ,
            g.felder.map((f) => f.key),
            z.roh,
          );
          return (
            <AusgeblendetZeile
              key={a.vor}
              text={t(z.p.mappe ? 'ablage.anzeige.abschnitt' : 'ablage.anzeige.abschnitt-neu', { name: abschnittName(a, typ), anzahl: n })}
              anzeigen={() => z.decke(`a:${r.key}.${a.vor}`)}
            />
          );
        }
        const gerade =
          a && abschnittAufgedeckt(a) ? (
            <p className="anzeigehinweis leise klein">
              <Symbol name="auge-aus" /> {t('ablage.anzeige.gerade-aus', { bedingung: nurBei(z, a.anzeigen) })}
            </p>
          ) : null;
        if (!a?.titel)
          return (
            <div key={a?.vor ?? '_'} className={`formular${a ? ' nach-umbruch' : ''}`}>
              {gerade}
              {g.felder.map((f) => eingabe(f))}
            </div>
          );
        return <AbschnittBlock key={a.vor} z={z} r={r} a={a} felder={g.felder} gerade={gerade} eingabe={eingabe} />;
      })}
    </div>
  );
}

/** „nur bei …“: die Bedingung in Worten (#1033). */
const nurBei = (z: Kern, r2: Parameters<typeof beschreibeAnzeige>[0]) =>
  beschreibeAnzeige(r2, z.p.typ, { typ: typNameAus(z.d.typen), mappe: (id: string) => titelOder(z.bekannt[id]?.titel) });

/** Ein Abschnitt mit Überschrift (#890): Knopf zum Auf- und Zuklappen, eingeklappt mit „3 von 5 ausgefüllt“. */
function AbschnittBlock({
  z,
  r,
  a,
  felder,
  gerade,
  eingabe,
}: {
  z: Kern;
  r: Register;
  a: Abschnitt;
  felder: FeldDef[];
  gerade: ReactNode;
  eingabe(f: FeldDef, ueber?: string, ebene?: 2 | 3): ReactNode;
}) {
  const offen = z.abschnittOffen(r, a);
  const id = `abschnitt-${r.key}-${a.vor}`;
  // Tabellen (#1030) haben keinen Wert und zählen nicht mit.
  const mitWerten = wertfelder(felder);
  const gefuellt = mitWerten.filter((f) => !istLeer(ausRoh(f, z.roh[f.key]))).length;
  const mitFehler = felder.filter((f) => z.fehler?.felder[f.key]).length;
  return (
    <section className={`feldabschnitt${offen ? ' offen' : ''}`} aria-labelledby={`${id}-kopf`}>
      <h2 className="abschnittkopf">
        <Knopf art="eigen" id={`${id}-kopf`} aria-expanded={offen} aria-controls={id} onClick={() => z.umschaltenAbschnitt(r, a)}>
          <Symbol name="pfeil-rechts" />
          <span className="abschnitttitel">{abschnittTitel(a)}</span>
          {!offen && mitWerten.length > 0 && (
            <span className="leise klein">
              <span aria-hidden="true">· </span>
              {t('ablage.abschnitt.ausgefuellt', { gefuellt, anzahl: mitWerten.length })}
            </span>
          )}
          {mitFehler > 0 && (
            <span className="fehlerpunkt" title={t('ablage.mappeformular.felder-mit-fehler', { anzahl: mitFehler })}>
              {mitFehler}
            </span>
          )}
        </Knopf>
      </h2>
      <div id={id} className="formular" hidden={!offen}>
        {gerade}
        {felder.map((f, i) => eingabe(f, i === 0 ? abschnittTitel(a) : undefined, 3))}
      </div>
    </section>
  );
}

/**
 * Die Eingabe eines Felds: Tabelle (#1030) – verweisende Mappen zwischen den Feldern, „+ Neu“ im Fenster (#935);
 * ausgeblendet mit Wert (#1033) die ruhige Zeile; sonst die Eingabe mit den Hinweisen darunter.
 * Steht die Tabelle gleich unter einer gleichlautenden Abschnittsüberschrift („Positionen“), genügt die eine.
 * Überschrift der Tabelle (#1208): unter einem Abschnitt (h2) eine Ebene tiefer, sonst direkt unter dem Titel der Mappe.
 */
function feldEingaben(z: Kern, w: FelderWege) {
  const { typ, mappe, details } = z.p;
  const versteckt = (f: FeldDef) => z.anz.felder.has(f.key) && !z.aufgedeckt.has(`f:${f.key}`);
  const tabelle = (f: FeldDef, ueber?: string, ebene: 2 | 3 = 2) => (
    <Tabellenfeld
      key={f.key}
      feld={f}
      mappe={mappe}
      nurLesen={z.nurLesen || !!z.p.imFenster}
      ohneUeberschrift={!!ueber && ueber === feldLabel(f)}
      ebene={ebene}
      neuesFormular={(ziel, v, fertig) => w.neuesFormular(ziel, startMitVerweis(ziel, v), fertig)}
    />
  );
  /**
   * Werte dieser Mappe, mit denen ein Verweis zusammenpassen muss: die Felder, aus denen der Auswahlfilter Werte nimmt
   * (#173), und die Felder, die aus diesem Verweis folgen (#886).
   */
  const eigeneWerte = (f: FeldDef): Werte | undefined => {
    const keys = [...new Set([...eigeneFelderIm(f.auswahlFilter), ...folgendeAus(typ, f.key)])];
    if (!keys.length) return undefined;
    const werte = werteAusRoh(typ, z.roh);
    return Object.fromEntries(keys.map((k) => [k, werte[k] ?? null]));
  };
  // Zusammengesetzt (#1050): der Text aus den aktuellen Eingaben – er ändert sich sofort mit seinen Teilen.
  const feldEingabe = (f: FeldDef, anzeige?: ReactNode) => (
    <FeldEingabe
      key={f.key}
      feld={f}
      roh={
        f.typ === 'zusammengesetzt'
          ? zusammengesetztText(typ.felder, f, z.werteJetzt, (id) => titelOder(z.bekannt[id]?.titel))
          : z.roh[f.key]
      }
      fehler={z.fehler?.felder[f.key]?.[0]}
      setze={(v) => w.setze(f.key, v)}
      eigeneId={mappe?.id}
      bekannt={z.bekannt}
      merke={z.merke}
      typId={typ.id}
      typFelder={typ.felder}
      unpassend={details?.unpassend?.[f.key]}
      gruende={grundAus(details?.konflikte, f.key)}
      eigene={eigeneWerte(f)}
      neu={f.typ === 'referenz' && zielErlaubt(f, z.adNeu[f.key]?.typId) ? z.adNeu[f.key].werte : undefined}
      gesperrt={z.geschuetzt[f.key] ?? (z.nurLesen && f.typ !== 'passwort' ? '' : undefined)}
      nurLesen={z.nurLesen}
      plzDeutsch={f.format === 'plz' ? deutschePlz(f, typ.felder, z.roh as Werte) : undefined}
      passwortSehen={!z.rechte || z.rechte.P}
      zusatz={
        anzeige ? (
          <>
            {anzeige}
            {w.hinweisAm(f)}
          </>
        ) : (
          w.hinweisAm(f)
        )
      }
      gespeichert={mappe ? mappe.werte[f.key] : undefined}
      neuesFormular={w.neuesFormular}
    />
  );
  return (f: FeldDef, ueber?: string, ebene?: 2 | 3) =>
    f.typ === 'tabelle' && !versteckt(f) ? (
      tabelle(f, ueber, ebene)
    ) : versteckt(f) ? (
      <AusgeblendetZeile
        key={f.key}
        text={t(mappe ? 'ablage.anzeige.feld' : 'ablage.anzeige.feld-neu', { feld: feldLabel(f) })}
        anzeigen={() => z.decke(`f:${f.key}`)}
      />
    ) : (
      feldEingabe(
        f,
        z.anz.felder.has(f.key) ? (
          <p className="anzeigehinweis leise klein">
            <Symbol name="auge-aus" /> {t('ablage.anzeige.gerade-aus', { bedingung: nurBei(z, f.anzeigen) })}
          </p>
        ) : undefined,
      )
    );
}
