import { useEffect, useState } from 'react';
import { Ansage, umgestellt, useZiehen, Ziehgriff } from '../ziehen';
import {
  INDEXPLATZHALTER,
  istIndexplatzhalter,
  pruefeTitelFilter,
  schluesselAus,
  SYSTEMSPALTEN,
  titelAus,
  vorlageFelder,
  wirksameVorlage,
  type Feld as FeldDef,
  type Mappe,
  type Register,
  type Systemspalte,
  type Trefferliste,
} from '../../../shared/src/model';
import { FILTER } from '../../../shared/src/titelfilter';
import { wirksameTypen } from '../../../shared/src/sichten';
import { mappenApi, type Bezuege } from '../api/mappen';
import { useDaten } from '../daten';
import { titelOder } from '../seiten';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { t, tn } from '../sprache';
import { rueckfrage } from '../rueckfrage';
import { Bereich, Etikett, Feld, HakenFeld, type Klappe, Knopf, Platzhalter, usePlatzhalterEinsetzen } from '../bausteine';
import { SprachText } from './Beschriftung';
import { beispielWerte, ERST_BEIM_SPEICHERN, neueId, type Entwurf, type EntwurfListe } from './entwurf';

/** Titel einer Mappe und Trefferlisten im Mappentyp-Editor (#1279 aus Einrichtung.tsx gezogen). */
export function TitelEditor({ e, setze, klappe }: { e: Entwurf; setze: (v: string) => void; klappe: Klappe }) {
  const d = useDaten();
  const ein = usePlatzhalterEinsetzen();
  // Beispiele für die Vorschau: die ersten Mappen dieses Typs.
  const [mappen, setMappen] = useState<Mappe[]>([]);
  const [bezuege, setBezuege] = useState<Bezuege>({});
  const [beispielId, setBeispielId] = useState<string>('');
  useEffect(() => {
    if (d.zahlenDa && !d.anzahl(e.id)) return;
    mappenApi
      .seite(`typ:${e.id}`, 0, 50)
      .then((s) => {
        setMappen(s.mappen);
        setBezuege(s.bezuege);
        setBeispielId((b) => b || s.mappen[0]?.id || '');
      })
      .catch(() => {});
  }, [e.id, d.stand]); // eslint-disable-line react-hooks/exhaustive-deps -- Beispiele nur bei anderem Typ oder neuem Stand laden
  const felder = e.felder as unknown as FeldDef[];
  const v = e.titelVorlage;
  const unbekannt = vorlageFelder(v).filter((k) => !istIndexplatzhalter(k) && !felder.some((f) => f.key === k));
  const filterFehler = pruefeTitelFilter({ felder, titelVorlage: v });
  const beispiel = mappen.find((m) => m.id === beispielId);
  const werte = beispiel ? beispiel.werte : beispielWerte(felder);
  const jetzt = new Date().toISOString();
  const vorschau = titelAus(
    { felder, titelVorlage: v },
    werte,
    (id) => (id === 'beispiel' ? t('mappentypen.editor.verwiesene-mappe') : titelOder(bezuege[id]?.titel)),
    beispiel ?? { erstellt: jetzt, geaendert: jetzt },
  );
  const automatisch = wirksameVorlage({ felder, titelVorlage: '' });

  return (
    <Bereich
      id="titel"
      titel={t('mappentypen.editor.titel-einer-mappe')}
      klappe={klappe}
      kurz={
        <>
          <code className="mono">{v || automatisch || '–'}</code>
          {vorschau ? <> · z. B. „{vorschau}“</> : null}
        </>
      }
      beschreibung={t('mappentypen.editor.so-heisst-eine-mappe')}>
      <Feld beschriftung={t('mappentypen.editor.vorlage')}>
        <input
          id="titel-vorlage"
          {...ein.feld('titel', v, setze)}
          className="mono"
          value={v}
          onChange={(ev) => setze(ev.target.value)}
          placeholder={automatisch ? t('mappentypen.editor.leer-2', { automatisch }) : t('mappentypen.editor.titel-beispiel')}
        />
      </Feld>
      {/* Platzhalter zum Anklicken (#1177): derselbe Baustein wie bei Zusammengesetzt, Automatisierungen und Ablaufvorlagen. Passwörter nie im Titel (#46). */}
      <Platzhalter
        einsetzen={ein.einsetzen}
        gruppen={[
          {
            name: e.name || t('mappentypen.editor.dieser-mappentyp-2'),
            eintraege: felder
              .filter((f) => f.typ !== 'passwort' && f.typ !== 'tabelle')
              .map((f) => ({ key: f.key, text: f.label || f.key })),
          },
          {
            name: t('mappentypen.editor.platzhalter-allgemein'),
            eintraege: Object.entries(INDEXPLATZHALTER).map(([k, name]) => ({
              key: k,
              text: name,
              titel: t('mappentypen.editor.indexwert-datum-an-dem', {
                k,
                wert: k === 'angelegt' ? t('mappentypen.editor.angelegt') : t('mappentypen.editor.zuletzt-geaendert'),
              }),
            })),
          },
        ]}
      />
      {unbekannt.length > 0 && (
        <p className="fehlertext">
          {t('mappentypen.editor.diese-platzhalter-passen-zu')} {unbekannt.map((k) => `{${k}}`).join(', ')}
        </p>
      )}
      {filterFehler.map((x) => (
        <p key={x} className="fehlertext">
          {x}
        </p>
      ))}
      <details className="filterhilfe">
        {/* Das „?“ nicht im summary (nested-interactive, #1213): es steht im aufgeklappten Teil vorn. */}
        <summary className="klein tippziel">{t('mappentypen.editor.platzhalter-formatieren-mit-filtern')}</summary>
        <p className="leise klein">
          <Hilfe ort="werkbank.titelfilter" />{' '}
          {tn('mappentypen.editor.hinter-einem-senkrechten-strich', {
            code: <code className="mono">{t('mappentypen.editor.betreff-kurz-30-gross')}</code>,
          })}
        </p>
        <table className="klein filtertabelle">
          <tbody>
            {Object.entries(FILTER).map(([k, f]) => (
              <tr key={k}>
                <td>
                  <code className="mono">
                    {k}
                    {'arg' in f ? (f.arg === 'zahl' ? ':30' : ':"…"') : ''}
                  </code>
                </td>
                <td>{f.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className="vorschau">
        <span className="ueber">{t('mappentypen.editor.vorschau')}</span>
        <strong className="vorschautitel">{vorschau || t('mappentypen.editor.ohne-titel')}</strong>
        {mappen.length > 0 ? (
          <Feld beschriftung={t('mappentypen.editor.mit-den-werten-von')} className="klein">
            <select value={beispielId} onChange={(ev) => setBeispielId(ev.target.value)}>
              {mappen.map((m) => (
                <option key={m.id} value={m.id}>
                  {titelOder(m.titel)}
                </option>
              ))}
            </select>
          </Feld>
        ) : (
          <span className="klein leise">{t('mappentypen.editor.mit-beispielwerten')}</span>
        )}
      </div>
    </Bereich>
  );
}

/* ---------------------------------------------------------------- */

/** Trefferlisten (#75): mehrere je Typ, eine ist Standard; je Liste Spalten auswählen und anordnen (#19). */
export function TrefferlisteEditor({ e, setE, klappe }: { e: Entwurf; setE: (f: (x: Entwurf) => Entwurf) => void; klappe: Klappe }) {
  const d = useDaten();
  const name = (k: string) =>
    k.startsWith('feld:')
      ? e.felder.find((f) => `feld:${f._uid}` === k)?.label || t('mappentypen.editor.feld-ohne-namen')
      : (SYSTEMSPALTEN[k as Systemspalte] ?? k);
  const setzeListe = (i: number, patch: Partial<EntwurfListe>) =>
    setE((x) => ({ ...x, trefferlisten: x.trefferlisten.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const eindeutig = (basis: string, i: number) => {
    let k = basis || 'liste';
    let n = 2;
    while (e.trefferlisten.some((l, j) => j !== i && l.key === k)) k = `${basis || 'liste'}_${n++}`.slice(0, 40);
    return k;
  };
  function hinzufuegen() {
    const nm = t('mappentypen.editor.liste', { wert: e.trefferlisten.length + 1 });
    const vorlage = e.trefferlisten.find((l) => l.standard)?.spalten ?? [];
    setE((x) => ({
      ...x,
      trefferlisten: [
        ...x.trefferlisten,
        { _uid: neueId(), _neu: true, key: eindeutig(schluesselAus(nm), -1), name: nm, spalten: [...vorlage], standard: false },
      ],
    }));
  }
  async function entferne(i: number) {
    const l = e.trefferlisten[i];
    const n = verwendung(l.key).length;
    if (
      !(await rueckfrage({
        titel: t('mappentypen.editor.trefferliste-entfernen', { name: l.name }),
        text: `${n ? t('mappentypen.editor.sie-wird-an-stellen', { anzahl: n }) : ''}${ERST_BEIM_SPEICHERN}`.trim(),
        ja: t('mappentypen.editor.entfernen'),
      }))
    )
      return;
    setE((x) => {
      const rest = x.trefferlisten.filter((_, j) => j !== i);
      if (l.standard && rest.length) rest[0] = { ...rest[0], standard: true };
      return { ...x, trefferlisten: rest };
    });
  }
  // Wo eine Liste verwendet wird: Sichten mit diesem Typ und Verknüpfungsregister mit diesem Typ als Quelle.
  function verwendung(key: string): string[] {
    const sichten = d.sichten
      .filter((s) => s.trefferliste === key && wirksameTypen(d.sichten, s.id).includes(e.id))
      .map((s) => t('mappentypen.editor.ansicht-2', { name: s.name }));
    const register = [
      ...d.typen.filter((mappentyp) => mappentyp.id !== e.id).map((mappentyp) => ({ typ: mappentyp.name, register: mappentyp.register })),
      { typ: e.name || 'dieser Mappentyp', register: e.register as Register[] },
    ].flatMap(({ typ, register }) =>
      register
        .filter((r) => r.quellen?.some((q) => q.typId === e.id && q.trefferliste === key))
        .map((r) => t('mappentypen.editor.register-3', { name: r.name, typ })),
    );
    return [...sichten, ...register];
  }
  return (
    <Bereich
      id="trefferlisten"
      titel={t('mappentypen.editor.trefferlisten')}
      hilfe={<Hilfe ort="mappentyp.trefferlisten" />}
      klappe={klappe}
      kurz={t('mappentypen.editor.listen-standard', {
        anzahl: e.trefferlisten.length,
        wert: e.trefferlisten.find((l) => l.standard)?.name ?? '–',
      })}
      beschreibung={<>{t('mappentypen.editor.spalten-wenn-die-liste')}</>}>
      <div className="trefferlisten">
        {e.trefferlisten.map((l, i) => {
          const wo = verwendung(l.key);
          return (
            <section
              key={l._uid}
              className={`trefferlistenblock ${l.standard ? 'standard' : ''}`}
              aria-label={t('mappentypen.editor.trefferliste', { name: l.name })}>
              <div className="registerkopf">
                <SprachText
                  beschriftungVerbergen
                  beschriftung={t('mappentypen.editor.name-der-trefferliste')}
                  className="registername"
                  wert={l.name}
                  teil="name"
                  beschriftungen={l.beschriftungen}
                  setzeBeschriftungen={(b) => setzeListe(i, { beschriftungen: b as Trefferliste['beschriftungen'] })}
                  setzeWert={(nm) => {
                    setzeListe(i, l._neu ? { name: nm, key: eindeutig(schluesselAus(nm), i) } : { name: nm });
                  }}
                />
                <code className="fkey" title={t('mappentypen.editor.kennung-3')}>
                  {l.key}
                </code>
                <HakenFeld beschriftung={t('mappentypen.editor.standard')} className="klein">
                  <input
                    type="radio"
                    name="standardliste"
                    checked={l.standard}
                    onChange={() => setE((x) => ({ ...x, trefferlisten: x.trefferlisten.map((y, j) => ({ ...y, standard: j === i })) }))}
                  />
                </HakenFeld>
                <div className="feldaktionen">
                  <Knopf
                    gesperrt={e.trefferlisten.length < 2 && t('mappentypen.editor.eine-trefferliste-braucht-der')}
                    title={
                      e.trefferlisten.length < 2 ? undefined : t('mappentypen.editor.trefferliste-entfernen-2', { ERST_BEIM_SPEICHERN })
                    }
                    onClick={() => entferne(i)}
                    nurSymbol={t('mappentypen.editor.trefferliste-entfernen-3', { name: l.name })}>
                    <Symbol name="schliessen" />
                  </Knopf>
                </div>
              </div>
              <Spaltenwahl e={e} spalten={l.spalten} name={name} setze={(spalten) => setzeListe(i, { spalten })} />
              <p className="leise klein">
                {wo.length
                  ? t('mappentypen.editor.verwendet-in-2', { wo: wo.join(', ') })
                  : l.standard
                    ? t('mappentypen.editor.gilt-ueberall-wo-keine')
                    : t('mappentypen.editor.noch-nirgends-verwendet')}
              </p>
            </section>
          );
        })}
      </div>
      <div className="knoepfe">
        <Knopf onClick={hinzufuegen}>{t('mappentypen.editor.trefferliste-2')}</Knopf>
      </div>
    </Bereich>
  );
}

/** Spalten einer Trefferliste: auswählen und anordnen. */
function Spaltenwahl({
  e,
  spalten,
  name,
  setze,
}: {
  e: Entwurf;
  spalten: string[];
  name: (k: string) => string;
  setze: (eintrag: string[]) => void;
}) {
  // Spalten gelöschter Felder, Passwortfelder (#46) und Tabellen (#1030, ohne Wert) fallen weg.
  const liste = spalten.filter(
    (k) => !k.startsWith('feld:') || e.felder.some((f) => `feld:${f._uid}` === k && f.typ !== 'passwort' && f.typ !== 'tabelle'),
  );
  const verfuegbar = [
    // Ausgeblendete Felder (#655) nicht als neue Spalte; schon gewählte bleiben.
    ...e.felder
      .filter(
        (f) =>
          f.typ !== 'passwort' &&
          f.typ !== 'tabelle' &&
          !f.ausgeblendet &&
          !e.register.some((r) => r.ausgeblendet && r.key === f._register),
      )
      .map((f) => ({ k: `feld:${f._uid}`, n: f.label || f.key })),
    ...(Object.keys(SYSTEMSPALTEN) as Systemspalte[]).filter((k) => k !== '_typ').map((k) => ({ k, n: SYSTEMSPALTEN[k] })),
  ].filter((x) => !liste.includes(x.k));
  const [ansage, setAnsage] = useState('');
  const schiebe = (i: number, r: number) => {
    const j = i + r;
    if (j < 0 || j >= liste.length) return;
    const n = [...liste];
    [n[i], n[j]] = [n[j], n[i]];
    setze(n);
    setAnsage(t('mappentypen.editor.steht-jetzt-an-stelle-4', { name: name(liste[i]), wert: j + 1 }));
  };
  // Drag & Drop (#74)
  const zs = useZiehen({
    fertig: (quelle, ziel, ort) => setze(umgestellt(liste, liste.indexOf(quelle), liste.indexOf(ziel), ort === 'vor' ? 'vor' : 'nach')),
  });
  return (
    <>
      <Ansage text={ansage} />
      {liste.length > 0 && (
        <ol className="spaltenliste">
          {liste.map((k, i) => (
            <li key={k} {...zs.eintrag(k)} className={`${i < 3 ? 'kompakt' : ''} ${zs.eintrag(k).className}`}>
              <Ziehgriff griff={zs.griff(k, name(k))} tasten={{ hoch: () => schiebe(i, -1), runter: () => schiebe(i, 1) }} />
              <span className="nr">{i + 1}</span>
              <span className="nm">
                {name(k)}
                {k.startsWith('_') && <Etikett>{t('mappentypen.editor.system')}</Etikett>}
              </span>
              <span className="aktionen">
                <Knopf gesperrt={i === 0} onClick={() => schiebe(i, -1)} nurSymbol={t('mappentypen.editor.nach-vorn', { name: name(k) })}>
                  <Symbol name="sortiert-auf" />
                </Knopf>
                <Knopf
                  gesperrt={i === liste.length - 1}
                  onClick={() => schiebe(i, 1)}
                  nurSymbol={t('mappentypen.editor.nach-hinten', { name: name(k) })}>
                  <Symbol name="sortiert-ab" />
                </Knopf>
                <Knopf
                  onClick={() => setze(liste.filter((x) => x !== k))}
                  nurSymbol={t('mappentypen.editor.entfernen-2', { name: name(k) })}>
                  <Symbol name="schliessen" />
                </Knopf>
              </span>
            </li>
          ))}
        </ol>
      )}
      {verfuegbar.length > 0 && (
        <Feld beschriftung={t('mappentypen.editor.spalte-hinzufuegen')} className="schmal">
          <select
            value=""
            onChange={(ev) => {
              if (ev.target.value) setze([...liste, ev.target.value]);
            }}>
            <option value="">{t('mappentypen.editor.waehlen')}</option>
            {verfuegbar.map((x) => (
              <option key={x.k} value={x.k}>
                {x.n}
                {x.k.startsWith('_') ? t('mappentypen.editor.system-2') : ''}
              </option>
            ))}
          </select>
        </Feld>
      )}
    </>
  );
}
