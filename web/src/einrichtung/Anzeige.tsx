import { useMemo, useState } from 'react';
import { anzeigeBedingungProblem, beschreibeAnzeige, beschreibeAnzeigeBedingung, typNameAus, ANZEIGE_BEDINGUNGEN_MAX, type Anzeigebedingung, type Anzeigeregel } from '../../../shared/src/anzeige';
import { feldLabel } from '../../../shared/src/beschriftung';
import { merkmalName } from '../../../shared/src/merkmale';
import { jedeMappe, zielErlaubt, zieleVon, type Feld, type Mappentyp } from '../../../shared/src/model';
import { bedingungsfelder, OPERATOREN_JE_ART } from '../../../shared/src/sichten';
import { FeldGruppe, Knopf } from '../bausteine';
import { useDaten } from '../daten';
import { Symbol } from '../Symbol';
import { t } from '../sprache';
import { FeldBedingung } from '../werkbank/Sichten';

/**
 * „Anzeigen, wenn …“ (#1033) am Feld und am Abschnitt im Typ-Editor: Bedingungen aus dem Baukasten der Ansichten
 * (Feldwert, Verweis zeigt auf eine bestimmte Mappe), dazu das Merkmal der Ablage (#1032) und „Verweis zeigt auf eine
 * Mappe vom Typ …“; jede umkehrbar, „alle“ oder „eine davon“. Ohne Bedingung ist es immer zu sehen.
 */

type TypTeil = { felder: Feld[] };

/** Kurz am Feld bzw. Abschnitt (#1033, Hinweis Qualität): Symbol und Satz „nur bei …“. */
export function AnzeigeChip({ regel, typ }: { regel?: Anzeigeregel; typ: TypTeil }) {
  const d = useDaten();
  if (!regel?.bedingungen.length) return null;
  const text = beschreibeAnzeige(regel, typ, { typ: typNameAus(d.typen), mappe: (id) => d.person(id) });
  return <span className="chip anzeigechip" title={text}><Symbol name="auge" /> {text}</span>;
}

export function AnzeigeEditor({ regel, setze, typ, eigene, typen }: {
  regel?: Anzeigeregel; setze: (r: Anzeigeregel | undefined) => void;
  /** Alle Felder des Mappentyps (auch auf anderen Registern). */
  typ: TypTeil;
  /** Felder, auf die die Bedingung nicht schauen darf: das Feld selbst bzw. die des eigenen Abschnitts. */
  eigene: string[];
  typen: Mappentyp[];
}) {
  const d = useDaten();
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (id: string, x: string) => setTitel((y) => ({ ...y, [id]: x }));
  const felder = useMemo(() => bedingungsfelder([typ]).filter((f) => !f.key.startsWith('_') && !eigene.includes(f.key)), [typ, eigene]);
  const verweise = typ.felder.filter((f) => f.typ === 'referenz' && !eigene.includes(f.key));
  const bedingungen = regel?.bedingungen ?? [];
  const namen = { typ: typNameAus(typen), mappe: (id: string) => titel[id] ?? d.person(id) };
  const setzeListe = (liste: Anzeigebedingung[]) => setze(liste.length ? { modus: regel?.modus ?? 'alle', bedingungen: liste } : undefined);
  const setzeB = (i: number, b: Anzeigebedingung) => setzeListe(bedingungen.map((x, j) => (j === i ? b : x)));

  /** Ziel einer Bedingung als Wert der Auswahl. */
  const zielVon = (b: Anzeigebedingung) => (b.art === 'merkmal' ? `merkmal:${b.merkmal}` : b.art === 'feld' ? `feld:${b.bedingung.feld}` : `verweistyp:${b.feld}`);
  const neu = (ziel: string, nicht?: boolean): Anzeigebedingung | null => {
    const n = nicht ? { nicht: true } : {};
    const [art, key] = ziel.split(':');
    if (art === 'merkmal') return { ...n, art: 'merkmal', merkmal: 'beruflich' };
    if (art === 'verweistyp') {
      const f = typ.felder.find((x) => x.key === key);
      // Mehrere Zieltypen (#1036): der erste davon; bei „jede Mappe“ der erste eigene Typ.
      const fest = (f ? zieleVon(f)[0] : undefined) ?? typen.find((x) => !x.system)?.id;
      return { ...n, art: 'verweistyp', feld: key, typ: fest ?? '' };
    }
    const f = felder.find((x) => x.key === key);
    if (!f) return null;
    // Vorgabe wie in Ansichten; bei Auswahlfeldern gleich „ist einer von“ – das häufigste „nur bei …“.
    const op = OPERATOREN_JE_ART[f.art][0];
    return { ...n, art: 'feld', bedingung: { art: 'feld', feld: f.key, op, ...(op === 'einerVon' || op === 'zeigtAuf' ? { wert: { art: 'fest', wert: [] } } : op === 'gleich' ? { wert: { art: 'fest', wert: '' } } : {}) } };
  };
  const erstes = felder[0] ? `feld:${felder[0].key}` : 'merkmal:beruflich';

  return (
    <FeldGruppe beschriftung={t('mappentypen.anzeige.titel')} hilfe="mappentyp.anzeigen" className="anzeigeeditor"
      hinweis={bedingungen.length ? beschreibeAnzeige(regel, typ, namen) : t('mappentypen.anzeige.immer')}>
      {bedingungen.length > 1 && (
        <label className="anzeigemodus"><span className="leise klein">{t('mappentypen.anzeige.modus')}</span>
          <select value={regel!.modus} onChange={(x) => setze({ ...regel!, modus: x.target.value === 'eine' ? 'eine' : 'alle' })}>
            <option value="alle">{t('mappentypen.anzeige.alle')}</option><option value="eine">{t('mappentypen.anzeige.eine')}</option>
          </select></label>
      )}
      {bedingungen.length > 0 && (
        <ol className="bedingungen">
          {bedingungen.map((b, i) => {
            const problem = anzeigeBedingungProblem(b, typ, eigene, (id) => typen.some((x) => x.id === id));
            const feld = b.art === 'feld' ? felder.find((f) => f.key === b.bedingung.feld) : undefined;
            const vf = b.art === 'verweistyp' ? typ.felder.find((f) => f.key === b.feld) : undefined;
            return (
              <li key={i} className={problem ? 'fehlerhaft' : ''}>
                <div className="bedingungszeile">
                  <select aria-label={t('mappentypen.anzeige.ziel')} value={zielVon(b)} onChange={(x) => { const n = neu(x.target.value, b.nicht); if (n) setzeB(i, n); }}>
                    <optgroup label={t('mappentypen.anzeige.ablage')}><option value="merkmal:beruflich">{merkmalName('beruflich')}</option></optgroup>
                    <optgroup label={t('mappentypen.anzeige.feldwert')}>
                      {b.art === 'feld' && !feld && <option value={zielVon(b)}>{t('mappentypen.anzeige.fehlt', { feld: b.bedingung.feld })}</option>}
                      {felder.map((f) => <option key={f.key} value={`feld:${f.key}`}>{f.label}</option>)}
                    </optgroup>
                    {(verweise.length > 0 || b.art === 'verweistyp') && <optgroup label={t('mappentypen.anzeige.verweistyp')}>
                      {b.art === 'verweistyp' && !vf && <option value={zielVon(b)}>{t('mappentypen.anzeige.fehlt', { feld: b.feld })}</option>}
                      {verweise.map((f) => <option key={f.key} value={`verweistyp:${f.key}`}>{t('mappentypen.anzeige.verweistyp-feld', { feld: feldLabel(f) })}</option>)}
                    </optgroup>}
                  </select>
                  <select aria-label={t('mappentypen.anzeige.umkehren')} value={b.nicht ? 'nicht' : 'ja'} onChange={(x) => setzeB(i, { ...b, nicht: x.target.value === 'nicht' || undefined })}>
                    <option value="ja">{t('mappentypen.anzeige.trifft-zu')}</option><option value="nicht">{t('mappentypen.anzeige.trifft-nicht-zu')}</option>
                  </select>
                  {b.art === 'feld' && feld && <FeldBedingung b={b.bedingung} feld={feld} setze={(n) => n.art === 'feld' && setzeB(i, { ...b, bedingung: n })} titel={titel} merke={merke} />}
                  {b.art === 'verweistyp' && (
                    <select aria-label={t('mappentypen.anzeige.typ')} value={b.typ} onChange={(x) => setzeB(i, { ...b, typ: x.target.value })}>
                      {!typen.some((x) => x.id === b.typ) && <option value={b.typ}>–</option>}
                      {typen.filter((x) => !vf || jedeMappe(vf) || !zieleVon(vf).length || zielErlaubt(vf, x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  )}
                  <Knopf art="link" groesse="klein" onClick={() => setzeListe(bedingungen.filter((_, j) => j !== i))}>{t('mappentypen.anzeige.entfernen')}</Knopf>
                </div>
                <p className={problem ? 'fehlertext klein' : 'leise klein'}>{problem ?? beschreibeAnzeigeBedingung(b, typ, namen)}</p>
              </li>
            );
          })}
        </ol>
      )}
      <div className="knoepfe">
        <Knopf groesse="klein" gesperrt={bedingungen.length >= ANZEIGE_BEDINGUNGEN_MAX ? t('mappentypen.anzeige.hoechstens', { anzahl: ANZEIGE_BEDINGUNGEN_MAX }) : false}
          onClick={() => { const n = neu(erstes); if (n) setzeListe([...bedingungen, n]); }}>{t('mappentypen.anzeige.hinzu')}</Knopf>
        {bedingungen.length > 0 && <Knopf art="link" groesse="klein" onClick={() => setze(undefined)}>{t('mappentypen.anzeige.immer-zeigen')}</Knopf>}
      </div>
    </FeldGruppe>
  );
}
