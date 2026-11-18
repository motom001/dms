import { Feld, FeldGruppe, HakenFeld, Knopf } from '../../bausteine';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Mappentyp } from '../../../../shared/src/model';
import {
  bedingungsfelder,
  beschreibeBedingung,
  OPERATOREN_JE_ART,
  type Bedingung,
  type Bedingungsfeld,
} from '../../../../shared/src/sichten';
import { beschreibeRegelBedingung, kurz, RECHTE, RECHTE_LISTE, type Regel, type RegelBedingung } from '../../../../shared/src/rechte';
import { mappenApi } from '../../api/mappen';
import { werkbankApi } from '../../api/werkbank';
import { useDaten } from '../../daten';
import { t } from '../../sprache';
import { FeldBedingung } from '../Sichten';
import { MappenSuche } from '../MappenSuche';
import { ARTEN, NAECHSTE, WIRKUNG_TEXT, type Art } from './hilfen';

interface Zeile {
  r: Regel;
  typ: Mappentyp;
  felder: Bedingungsfeld[];
  titel: Record<string, string>;
  merke: (id: string, text: string) => void;
  setze: (r: Regel) => void;
  setzeB: (i: number, b: RegelBedingung) => void;
  neuB: (art: Art, nicht?: boolean) => RegelBedingung;
  bedText: (b: RegelBedingung) => string;
  rollenTyp: string | undefined;
  benutzerTyp: string | undefined;
}

export function RegelKarte({
  r,
  typ,
  problem,
  setze,
  weg,
  griff,
  titel,
  merke,
  gespeichert,
  nachKopie,
  offen,
  umschalten,
}: {
  r: Regel;
  typ: Mappentyp;
  problem: string | null;
  setze: (r: Regel) => void;
  weg: () => void;
  griff: ReactNode;
  titel: Record<string, string>;
  merke: (id: string, text: string) => void;
  gespeichert: boolean;
  nachKopie: () => void;
  /** Zuklappen wie bei Feldern (#146). */
  offen: boolean;
  umschalten: () => void;
}) {
  const d = useDaten();
  const felder = useMemo(() => bedingungsfelder([typ]), [typ]);
  const [kopie, setKopie] = useState(false);
  const setzeB = (i: number, b: RegelBedingung) => setze({ ...r, wenn: r.wenn.map((x, j) => (j === i ? b : x)) });
  const neuB = (art: Art, nicht?: boolean): RegelBedingung => {
    const n = nicht ? { nicht: true } : {};
    if (art === 'feld') {
      const f = felder[0];
      return { ...n, art, bedingung: { art: 'feld', feld: f?.key ?? '_erstellt', op: OPERATOREN_JE_ART[f?.art ?? 'zeit'][0] } };
    }
    if (art === 'benutzer') return { ...n, art, benutzer: [] };
    if (art === 'rolle') return { ...n, art, rollen: [] };
    if (art === 'merkmal') return { ...n, art, merkmal: 'beruflich' };
    return { ...n, art };
  };
  const rollenTyp = d.typen.find((mappentyp) => mappentyp.system === 'rolle')?.id;
  const benutzerTyp = d.typen.find((mappentyp) => mappentyp.system === 'benutzer')?.id;
  const feldName = (b: Extract<Bedingung, { art: 'feld' }>) =>
    beschreibeBedingung(
      b,
      [typ],
      (id) => titel[id] ?? d.person(id),
      undefined,
      (id) => d.typ(id)?.name,
    );

  const bedText = (b: RegelBedingung) =>
    beschreibeRegelBedingung(b, { benutzer: (id) => titel[id] ?? d.person(id), rolle: (id) => titel[id] ?? '…', feld: feldName });
  // Rollen- und Benutzernamen für die Kurzform nachladen.
  const fehlend = r.wenn
    .flatMap((b) => (b.art === 'rolle' ? b.rollen : b.art === 'benutzer' ? b.benutzer : []))
    .filter((x) => !titel[x])
    .join(',');
  useEffect(() => {
    if (offen) return;
    for (const x of fehlend ? fehlend.split(',') : [])
      mappenApi
        .mappe(x)
        .then((m) => merke(x, m.mappe.titel ?? ''))
        .catch(() => merke(x, '(gelöscht)'));
  }, [fehlend, offen]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste der fehlenden Mappen ändert

  if (!offen) return regelZu({ r, problem, griff, umschalten, bedText });
  const z: Zeile = { r, typ, felder, titel, merke, setze, setzeB, neuB, bedText, rollenTyp, benutzerTyp };

  return (
    <div className={`regel ${problem ? 'fehlerhaft' : ''}`}>
      {regelKopf(r, griff, setze)}
      <p className="ueber klein">{t('werkbank.berechtigungen.wenn-2')}</p>
      <ul className="bedingungen">{r.wenn.map((b, i) => bedingungZeile(b, i, z))}</ul>
      <div className="knoepfe">
        <Knopf onClick={() => setze({ ...r, wenn: [...r.wenn, neuB('rolle')] })}>{t('werkbank.berechtigungen.bedingung')}</Knopf>
        {r.wenn.length > 1 && <span className="leise klein">{t('werkbank.berechtigungen.alle-bedingungen-muessen-zutreffen')}</span>}
      </div>
      <p className="ueber klein">{t('werkbank.berechtigungen.dann')}</p>
      {wirkungWahl(r, setze)}
      {problem && <p className="fehlertext klein">{problem}</p>}
      <div className="knoepfe">
        <Knopf
          gesperrt={!gespeichert && t('werkbank.berechtigungen.erst-speichern')}
          aria-expanded={kopie}
          onClick={() => setKopie((x) => !x)}>
          {t('werkbank.berechtigungen.in-andere-mappentypen-kopieren')}
        </Knopf>
        <Knopf symbol="schliessen" onClick={weg}>
          {t('werkbank.berechtigungen.regel-entfernen')}
        </Knopf>
        <Knopf onClick={umschalten}>{t('werkbank.berechtigungen.zuklappen')}</Knopf>
      </div>
      {kopie && (
        <Kopieren
          typ={typ}
          regel={r}
          fertig={() => {
            setKopie(false);
            nachKopie();
          }}
        />
      )}
    </div>
  );
}

/** Zugeklappte Regel (#146): Name, Wirkung und die Bedingungen in Worten. */
function regelZu({
  r,
  problem,
  griff,
  umschalten,
  bedText,
}: {
  r: Regel;
  problem: string | null;
  griff: ReactNode;
  umschalten: () => void;
  bedText: (b: RegelBedingung) => string;
}) {
  return (
    <div className={`regel zu ${problem ? 'fehlerhaft' : ''}`}>
      <div className="regelkopf">
        {griff}
        <Knopf art="eigen" className="regelsumme" aria-expanded={false} onClick={umschalten}>
          <strong>{r.name || t('werkbank.berechtigungen.ohne-namen')}</strong>
          <span className="chip">
            {kurz(r.dann)}
            {r.stopp ? t('werkbank.berechtigungen.stopp') : ''}
          </span>
          <span className="leise klein">
            {t('werkbank.berechtigungen.wenn')} {r.wenn.map(bedText).join(` ${t('werkbank.berechtigungen.und')} `) || '…'}
          </span>
        </Knopf>
      </div>
      {problem && <p className="fehlertext klein">{problem}</p>}
    </div>
  );
}

/** Eine Bedingung der Regel: Art, „nicht“, Rollen, Benutzer oder Feld mit Vergleich. */
function bedingungZeile(b: RegelBedingung, i: number, z: Zeile) {
  const { r, typ, felder, titel, merke, setze, setzeB, neuB, bedText, rollenTyp, benutzerTyp } = z;
  const feld: Bedingungsfeld | undefined = b.art === 'feld' ? felder.find((f) => f.key === b.bedingung.feld) : undefined;
  return (
    <li key={i}>
      <div className="bedingungszeile">
        <Feld beschriftung={t('werkbank.berechtigungen.art-der-bedingung')} beschriftungVerbergen>
          <select value={b.art} onChange={(x) => setzeB(i, neuB(x.target.value as Art, b.nicht))}>
            {ARTEN.filter((a) => !a.nurBenutzerTyp || typ.system === 'benutzer' || a.art === b.art).map((a) => (
              <option key={a.art} value={a.art}>
                {a.name}
              </option>
            ))}
          </select>
        </Feld>
        <HakenFeld beschriftung={t('werkbank.berechtigungen.nicht')} className="klein">
          <input
            type="checkbox"
            title={t('werkbank.berechtigungen.bedingung-verneinen')}
            checked={!!b.nicht}
            onChange={(x) => setzeB(i, { ...b, nicht: x.target.checked || undefined })}
          />
        </HakenFeld>
        {b.art === 'rolle' && rollenTyp && (
          <MappenSuche
            typId={rollenTyp}
            gewaehlt={b.rollen}
            titel={titel}
            merke={merke}
            setze={(ids) => setzeB(i, { ...b, rollen: ids })}
          />
        )}
        {b.art === 'benutzer' && benutzerTyp && (
          <MappenSuche
            typId={benutzerTyp}
            gewaehlt={b.benutzer}
            titel={titel}
            merke={merke}
            setze={(ids) => setzeB(i, { ...b, benutzer: ids })}
          />
        )}
        {b.art === 'feld' && (
          <>
            <Feld beschriftung={t('werkbank.berechtigungen.feld')} beschriftungVerbergen>
              <select
                value={b.bedingung.feld}
                onChange={(x) => {
                  const f = felder.find((y) => y.key === x.target.value);
                  if (f) setzeB(i, { ...b, bedingung: { art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] } });
                }}>
                {!feld && <option value={b.bedingung.feld}>{t('werkbank.berechtigungen.fehlt', { feld: b.bedingung.feld })}</option>}
                {felder.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Feld>
            {feld && (
              <FeldBedingung
                b={b.bedingung}
                feld={feld}
                setze={(n) => n.art === 'feld' && setzeB(i, { ...b, bedingung: n })}
                titel={titel}
                merke={merke}
              />
            )}
          </>
        )}
        <Knopf groesse="klein" symbol="schliessen" onClick={() => setze({ ...r, wenn: r.wenn.filter((_, j) => j !== i) })}>
          {t('werkbank.berechtigungen.bedingung-entfernen')}
        </Knopf>
      </div>
      <p className="leise klein">{bedText(b)}</p>
    </li>
  );
}

/** Dann: Wirkung je Recht (erteilen, entziehen, unverändert) und Stopp. */
function wirkungWahl(r: Regel, setze: (r: Regel) => void) {
  return (
    <div className="rechtewahl" role="group" aria-label={t('werkbank.berechtigungen.wirkung-je-recht')}>
      {RECHTE_LISTE.map((k) => {
        const w = r.dann[k] ?? '';
        return (
          <Knopf
            key={k}
            art="eigen"
            className={`rechtknopf ${w}`}
            nurSymbol={
              w
                ? t('werkbank.berechtigungen.recht-wert', { recht: RECHTE[k], wert: w })
                : t('werkbank.berechtigungen.recht-unveraendert', { recht: RECHTE[k] })
            }
            title={t('werkbank.berechtigungen.klicken-zum-wechseln', {
              RECHTE: RECHTE[k],
              wert: w || t('werkbank.berechtigungen.unveraendert'),
            })}
            onClick={() => {
              const n = NAECHSTE[w];
              const dann = { ...r.dann };
              if (n) dann[k] = n;
              else delete dann[k];
              setze({ ...r, dann });
            }}>
            <span className="buchstabe">{k}</span>
            {WIRKUNG_TEXT[w]}
          </Knopf>
        );
      })}
      <HakenFeld beschriftung={t('werkbank.berechtigungen.stopp-2')} hinweis={t('werkbank.berechtigungen.trifft-die-regel-zu')}>
        <input type="checkbox" checked={r.stopp} onChange={(x) => setze({ ...r, stopp: x.target.checked })} />
      </HakenFeld>
    </div>
  );
}

function Kopieren({ typ, regel, fertig }: { typ: Mappentyp; regel: Regel; fertig: () => void }) {
  const d = useDaten();
  const [ziele, setZiele] = useState<string[]>([]);
  const [meldung, setMeldung] = useState<string>();
  async function los() {
    try {
      const r = await werkbankApi.regelKopieren(typ.id, regel.id, ziele);
      setMeldung(
        t('werkbank.berechtigungen.in-mappentypen-ans-ende', {
          anzahl: r.kopiert,
          wert: r.ausgelassen ? t('werkbank.berechtigungen.bedingungen-passten-dort-nicht', { anzahl: r.ausgelassen }) : '',
        }),
      );
      setZiele([]);
      void d.neuLaden();
      setTimeout(fertig, 2500);
    } catch (x) {
      setMeldung((x as Error).message);
    }
  }
  return (
    <div className="hinweis info">
      <p>{t('werkbank.berechtigungen.die-regel-kommt-in', { name: regel.name })}</p>
      <FeldGruppe beschriftung={t('werkbank.berechtigungen.kopieren-ziele')} beschriftungVerbergen className="typwahl">
        {d.typen
          .filter((mappentyp) => mappentyp.id !== typ.id)
          .map((mappentyp) => (
            <label key={mappentyp.id} className="haken">
              <input
                type="checkbox"
                checked={ziele.includes(mappentyp.id)}
                onChange={(x) => setZiele(x.target.checked ? [...ziele, mappentyp.id] : ziele.filter((y) => y !== mappentyp.id))}
              />
              <span>{mappentyp.name}</span>
            </label>
          ))}
      </FeldGruppe>
      <div className="knoepfe">
        <Knopf art="haupt" gesperrt={!ziele.length} onClick={() => los()}>
          {t('werkbank.berechtigungen.kopieren')}
        </Knopf>
      </div>
      {meldung && (
        <p role="status" className="klein">
          {meldung}
        </p>
      )}
    </div>
  );
}

/** Kopf der aufgeklappten Regel: Griff, Name, Wirkung in Kurzform. */
function regelKopf(r: Regel, griff: ReactNode, setze: (r: Regel) => void) {
  return (
    <div className="regelkopf">
      {griff}
      <Feld beschriftung={t('werkbank.berechtigungen.name-der-regel')} beschriftungVerbergen className="regelname">
        <input
          placeholder={t('werkbank.berechtigungen.name-z-b-buchhaltung')}
          value={r.name}
          onChange={(x) => setze({ ...r, name: x.target.value })}
        />
      </Feld>
      <span className="chip" title={t('werkbank.berechtigungen.kurzform-der-wirkung')}>
        {kurz(r.dann)}
        {r.stopp ? t('werkbank.berechtigungen.stopp') : ''}
      </span>
    </div>
  );
}
