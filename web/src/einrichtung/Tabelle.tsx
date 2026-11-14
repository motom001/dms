import { feldLabel, listenName, typName } from '../../../shared/src/beschriftung';
import { trefferlistenVon, zielErlaubt, type Feld as FeldDef, type Mappentyp } from '../../../shared/src/model';
import { TABELLE_NEU_MAX, tabelleNeuText, type Tabellenquelle } from '../../../shared/src/tabelle';
import { Feld } from '../bausteine';
import { t } from '../sprache';
import { SprachText } from './Beschriftung';

/** Eine mögliche Quelle: ein Mappentyp (ohne `typ` der eigene) mit seinen Verweisfeldern auf diesen Typ. */
interface Quellwahl { id: string; typ?: Mappentyp; name: string; felder: FeldDef[] }

/** Quellen: Verweisfelder anderer Typen auf diesen – und eigene, die auf diesen Typ selbst zeigen (Hierarchie). */
function quellenFuer(eigeneId: string, eigenerName: string, typen: Mappentyp[], eigeneFelder: FeldDef[]): Quellwahl[] {
  const aufMich = (g: FeldDef) => g.typ === 'referenz' && zielErlaubt(g, eigeneId);
  const eigen = t('mappentypen.editor.dieser-mappentyp-3', { wert: eigenerName || t('mappentypen.editor.dieser-mappentyp-2') });
  return [
    ...typen.filter((x) => x.id !== eigeneId).map((x) => ({ id: x.id, typ: x, name: typName(x), felder: x.felder.filter(aufMich) })),
    { id: eigeneId, name: eigen, felder: eigeneFelder.filter(aufMich) },
  ].filter((x) => x.felder.length);
}

/** Auswahl in einem Feldrahmen; ein gespeicherter Wert, den es nicht mehr gibt, bleibt sichtbar (die Prüfung meldet ihn). */
function Wahl({ id, beschriftung, hinweis, wert, leer, optionen, gesperrt, setze }: {
  id: string; beschriftung: string; hinweis: string; wert: string; leer: string; optionen: Array<{ wert: string; text: string }>; gesperrt?: boolean; setze(w: string): void;
}) {
  return (
    <Feld beschriftung={beschriftung} id={id} hinweis={hinweis}>
      <select value={wert} disabled={gesperrt} onChange={(e) => setze(e.target.value)}>
        <option value="">{leer}</option>
        {optionen.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}
        {wert && !optionen.some((o) => o.wert === wert) && <option value={wert}>{wert}</option>}
      </select>
    </Feld>
  );
}

/**
 * Einstellungen der Feldart Tabelle (#1030) im Mappentyp-Editor: zeigt Mappen vom Typ …, die über Feld … hierher
 * verweisen (wie die Quelle eines Verknüpfungsregisters), mit den Spalten der Trefferliste … des anderen Typs und der
 * Beschriftung von „+ Neu“. Zur Wahl stehen nur Verweisfelder, die auf diesen Typ zeigen – auch eigene (Hierarchie).
 */
export function TabellenEditor({ f, id, eigeneId, eigenerName, typen, eigeneFelder, setze }: {
  f: Pick<FeldDef, 'key' | 'quelle' | 'beschriftungen'>;
  id: (x: string) => string;
  eigeneId: string; eigenerName: string;
  /** Alle Mappentypen der Ablage. */
  typen: Mappentyp[];
  /** Die Felder dieses Typs, wie sie im Editor gerade stehen. */
  eigeneFelder: FeldDef[];
  setze(patch: { quelle?: Tabellenquelle; beschriftungen?: FeldDef['beschriftungen'] }): void;
}) {
  const q: Tabellenquelle = f.quelle ?? { typId: '', feldKey: '' };
  const quellen = quellenFuer(eigeneId, eigenerName, typen, eigeneFelder);
  const gewaehlt = quellen.find((x) => x.id === q.typId);
  const listen = gewaehlt?.typ ? trefferlistenVon(gewaehlt.typ).filter((l) => !l.standard) : [];
  const neuVorgabe = tabelleNeuText({ quelle: { ...q, neu: undefined } }, gewaehlt?.typ ?? { name: eigenerName || t('mappentypen.editor.dieser-mappentyp-2') });
  const setzeQuelle = (patch: Partial<Tabellenquelle>) => setze({ quelle: { ...q, ...patch } });
  // Gibt es nur ein passendes Feld, ist es gleich gewählt.
  const waehleTyp = (wert: string) => {
    const felder = quellen.find((y) => y.id === wert)?.felder ?? [];
    setzeQuelle({ typId: wert, feldKey: felder.length === 1 ? felder[0].key : '', trefferliste: undefined });
  };
  if (!quellen.length) return <p className="leise klein">{t('mappentypen.tabelle.keine-quelle')}</p>;
  const waehlen = t('mappentypen.tabelle.waehlen');
  return (
    <div className="raster">
      <Wahl id={id('tabelle-typ')} beschriftung={t('mappentypen.tabelle.typ')} hinweis={t('mappentypen.tabelle.typ-hilfe')} wert={q.typId} leer={waehlen}
        optionen={quellen.map((x) => ({ wert: x.id, text: x.name }))} setze={waehleTyp} />
      <Wahl id={id('tabelle-feld')} beschriftung={t('mappentypen.tabelle.feld')} hinweis={t('mappentypen.tabelle.feld-hilfe')} wert={q.feldKey} leer={waehlen} gesperrt={!gewaehlt}
        optionen={(gewaehlt?.felder ?? []).map((g) => ({ wert: g.key, text: feldLabel(g) }))} setze={(feldKey) => setzeQuelle({ feldKey })} />
      <Wahl id={id('tabelle-liste')} beschriftung={t('mappentypen.tabelle.liste')} hinweis={t('mappentypen.tabelle.liste-hilfe')} wert={q.trefferliste ?? ''} leer={t('mappentypen.tabelle.liste-standard')} gesperrt={!gewaehlt?.typ}
        optionen={listen.map((l) => ({ wert: l.key, text: listenName(l) }))} setze={(w) => setzeQuelle({ trefferliste: w || undefined })} />
      <SprachText beschriftung={t('mappentypen.tabelle.neu')} hinweis={t('mappentypen.tabelle.neu-hilfe')} id={id('tabelle-neu')} wert={q.neu ?? ''} placeholder={neuVorgabe} teil="neu" beschriftungen={f.beschriftungen}
        setzeWert={(neu) => setzeQuelle({ neu: neu.slice(0, TABELLE_NEU_MAX) || undefined })} setzeBeschriftungen={(b) => setze({ beschriftungen: b as FeldDef['beschriftungen'] })} />
      <p className="leise klein">{t('mappentypen.tabelle.ohne-wert')}</p>
    </div>
  );
}
