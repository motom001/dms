import { feldLabel } from '../../../shared/src/beschriftung';
import type { Feld as FeldDef } from '../../../shared/src/model';
import { moeglicheNach, moeglicheVon, VORBELEGEN_MAX, type Vorbelegung } from '../../../shared/src/vorbelegen';
import { Feld, Knopf } from '../bausteine';
import { Symbol } from '../Symbol';
import { t } from '../sprache';

/** Auswahl eines Felds; ein gespeicherter Wert, den es (so) nicht mehr gibt, bleibt sichtbar – die Prüfung meldet ihn. */
function FeldWahl({ id, beschriftung, wert, felder, alle, setze }: {
  id: string; beschriftung: string; wert: string; felder: FeldDef[]; alle: FeldDef[]; setze(k: string): void;
}) {
  const alt = alle.find((x) => x.key === wert);
  return (
    <Feld beschriftung={beschriftung} id={id} className="vorbelegen-wahl">
      <select value={wert} onChange={(e) => setze(e.target.value)}>
        {!felder.some((x) => x.key === wert) && <option value={wert}>{alt ? feldLabel(alt) : wert}</option>}
        {felder.map((x) => <option key={x.key} value={x.key}>{feldLabel(x)}</option>)}
      </select>
    </Feld>
  );
}

/**
 * Beim Auswählen übernehmen (#1037) im Mappentyp-Editor: Paare „Feld der verwiesenen Mappe → Feld dieser Mappe“. Wählt
 * man eine Mappe, schlägt Ablago deren Werte in leeren Feldern vor. Zur Wahl stehen nur Felder, die zusammenpassen
 * (passtZusammen); Passwortfelder nie, berechnete Felder nie als Ziel. Mehrere Zieltypen (#1036): die Felder aller
 * Ziele, je Kennung einmal – das Paar gilt für jeden Typ, der das Feld hat.
 */
export function VorbelegenEditor({ f, id, setze, alleFelder, zielListen }: {
  f: Pick<FeldDef, 'key' | 'vorbelegen'>;
  id: (x: string) => string;
  setze(patch: { vorbelegen?: Vorbelegung[] }): void;
  /** Die Felder dieses Typs, wie sie im Editor gerade stehen. */
  alleFelder: FeldDef[];
  /** Die Felder der Zieltypen (der eigene, wenn er dazugehört, wie im Editor). */
  zielListen: FeldDef[][];
}) {
  const paare = f.vorbelegen ?? [];
  const nachAlle = moeglicheNach(alleFelder, f);
  const passend = (von: string) => nachAlle.filter((n) => moeglicheVon(zielListen, n).some((y) => y.key === von));
  const vonAlle = [...new Map(nachAlle.flatMap((n) => moeglicheVon(zielListen, n)).map((x) => [x.key, x] as const)).values()];
  const frei = (von: string, ausser?: number) => passend(von).filter((n) => !paare.some((x, j) => j !== ausser && x.nach === n.key));
  const quellen = zielListen.flat();
  if (!vonAlle.length && !paare.length) return null;

  const speichere = (neu: Vorbelegung[]) => setze({ vorbelegen: neu.length ? neu : undefined });
  const aendere = (i: number, p: Vorbelegung | null) => speichere(p ? paare.map((x, j) => (j === i ? p : x)) : paare.filter((_, j) => j !== i));
  // Neue Quelle: das bisherige Zielfeld, wenn es passt – sonst das gleichnamige, sonst das erste freie.
  const waehleVon = (i: number, von: string) => {
    const n = frei(von, i);
    const nach = n.some((x) => x.key === paare[i].nach) ? paare[i].nach : n.find((x) => x.key === von)?.key ?? n[0]?.key ?? paare[i].nach;
    aendere(i, { von, nach });
  };
  // Zuerst gleichnamige Felder (Vertragsart.kuendigungsfrist → Vertrag.kuendigungsfrist), sonst das erste, das passt.
  const dazu = () => {
    const gleich = vonAlle.find((v) => frei(v.key).some((n) => n.key === v.key));
    const v = gleich ?? vonAlle.find((x) => frei(x.key).length);
    if (v) speichere([...paare, { von: v.key, nach: gleich ? gleich.key : frei(v.key)[0].key }]);
  };
  const name = (l: FeldDef[], k: string) => { const x = l.find((y) => y.key === k); return x ? feldLabel(x) : k; };

  return (
    <fieldset className="wahl vorbelegen">
      <legend>{t('mappentypen.editor.vorbelegen')}</legend>
      <small className="hilfe">{t('mappentypen.editor.vorbelegen-hilfe')}</small>
      {paare.map((p, i) => {
        const nachFeld = alleFelder.find((x) => x.key === p.nach);
        const passt = !!nachFeld && nachAlle.includes(nachFeld) && moeglicheVon(zielListen, nachFeld).some((y) => y.key === p.von);
        return (
          <div key={`${p.von}>${p.nach}>${i}`} className="vorbelegen-paar">
            <FeldWahl id={id(`vb-von-${i}`)} beschriftung={t('mappentypen.editor.vorbelegen-von')} wert={p.von} felder={vonAlle} alle={quellen} setze={(k) => waehleVon(i, k)} />
            <span className="pfeil" aria-hidden="true">→</span>
            <FeldWahl id={id(`vb-nach-${i}`)} beschriftung={t('mappentypen.editor.vorbelegen-nach')} wert={p.nach} felder={frei(p.von, i)} alle={alleFelder} setze={(k) => aendere(i, { von: p.von, nach: k })} />
            <Knopf art="link" nurSymbol={t('mappentypen.editor.vorbelegen-entfernen', { von: name(quellen, p.von), nach: name(alleFelder, p.nach) })} onClick={() => aendere(i, null)}><Symbol name="schliessen" /></Knopf>
            {!passt && <small className="chip warn">{t('mappentypen.editor.vorbelegen-passt-nicht')}</small>}
          </div>
        );
      })}
      {paare.length < VORBELEGEN_MAX && vonAlle.some((x) => frei(x.key).length > 0) && <div><Knopf art="link" groesse="klein" onClick={dazu}>{t('mappentypen.editor.vorbelegen-dazu')}</Knopf></div>}
    </fieldset>
  );
}
