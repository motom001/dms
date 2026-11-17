import { useState } from 'react';
import { Ansage, umgestellt, useZiehen, Ziehgriff } from '../ziehen';
import {
  HISTORIENGRUPPEN,
  historiengruppeName,
  historiengruppenVon,
  REGISTERARTEN,
  schluesselAus,
  trefferlistenVon,
  zielErlaubt,
  zieleVon,
  type Historiengruppe,
  type Mappentyp,
  type Register,
  type Registerart,
} from '../../../shared/src/model';
import { registerAusblendbar } from '../../../shared/src/darstellung';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { t, tn } from '../sprache';
import { hinweis, rueckfrage } from '../rueckfrage';
import { Bereich, Feld, FeldGruppe, HakenFeld, Knopf, type Klappe } from '../bausteine';
import { SprachText } from './Beschriftung';
import { Feldaufteilung } from './Feldaufteilung';
import { ERST_BEIM_SPEICHERN, neueId, type Entwurf, type EntwurfRegister } from './entwurf';

/** Register des Mappentyp-Editors (#1279 aus Einrichtung.tsx gezogen): Reihenfolge, Name, Art und ihre Einstellungen. */

type SetE = (f: (x: Entwurf) => Entwurf) => void;
type Quelle = { typId: string; feldKey: string; text: string };

export function RegisterEditor({
  e,
  setE,
  feldAblage,
  klappe,
  ausblendenFragen,
}: {
  e: Entwurf;
  setE: SetE;
  feldAblage: (key: string) => { className: string };
  klappe: Klappe;
  ausblendenFragen: (uids: string[], titel: string, dann: (x: Entwurf) => Entwurf) => Promise<void>;
}) {
  const d = useDaten();
  const [ansage, setAnsage] = useState('');
  const zr = useZiehen({
    fertig: (quelle, ziel, ort) =>
      setE((x) => {
        const von = x.register.findIndex((r) => r._uid === quelle),
          zu = x.register.findIndex((r) => r._uid === ziel);
        return { ...x, register: umgestellt(x.register, von, zu, ort === 'vor' ? 'vor' : 'nach') };
      }),
  });
  const setzeReg = (i: number, patch: Partial<EntwurfRegister>) =>
    setE((x) => ({ ...x, register: x.register.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const eindeutig = (basis: string, i: number) => {
    let k = basis || 'register';
    let n = 2;
    while (e.register.some((r, j) => j !== i && r.key === k)) k = `${basis}_${n++}`.slice(0, 40);
    return k;
  };

  const hinzufuegen = (art: Registerart) => {
    const r = neuesRegister(art, eindeutig);
    setE((x) => ({ ...x, register: [...x.register, r] }));
  };
  function verschiebe(i: number, rueck: number) {
    const j = i + rueck;
    if (j < 0 || j >= e.register.length) return;
    setE((x) => {
      const rs = [...x.register];
      [rs[i], rs[j]] = [rs[j], rs[i]];
      return { ...x, register: rs };
    });
  }
  const entferne = (i: number) => registerEntfernen(e, i, setE);

  /** Register ausblenden (#655): Felder darauf gelten als ausgeblendet – wie beim FeldDef mit Rückfrage und ohne Pflicht. */
  function registerAusblenden(i: number, an: boolean) {
    const r = e.register[i];
    if (!an) {
      setzeReg(i, { ausgeblendet: undefined });
      return;
    }
    const setzen = (x: Entwurf): Entwurf => ({
      ...x,
      register: x.register.map((y) => (y._uid === r._uid ? { ...y, ausgeblendet: true } : y)),
    });
    void ausblendenFragen(
      e.felder.filter((f) => f._register === r.key && !f.ausgeblendet).map((f) => f._uid),
      t('mappentypen.darstellung.register-ausblenden', { name: r.name || r.key }),
      setzen,
    );
  }

  const quellen = quellenFuer(d.typen, e);
  return (
    <Bereich
      id="register"
      titel={t('mappentypen.editor.register-2')}
      hilfe={<Hilfe ort="mappentyp.register" />}
      klappe={klappe}
      kurz={
        e.register
          .map((r) =>
            r.ausgeblendet ? t('mappentypen.darstellung.register-kurz-ausgeblendet', { name: r.name || r.key }) : r.name || r.key,
          )
          .join(' · ') || t('mappentypen.editor.keine')
      }
      beschreibung={t('mappentypen.editor.die-trennblaetter-einer-mappe')}>
      <div className="registerliste">
        {e.register.map((r, i) => (
          <RegisterZeile
            key={r._uid}
            r={r}
            i={i}
            e={e}
            zr={zr}
            feldAblage={feldAblage}
            setzeReg={(patch) => setzeReg(i, patch)}
            verschiebe={(rueck) => verschiebe(i, rueck)}
            entferne={() => entferne(i)}
            ausblenden={(an) => registerAusblenden(i, an)}
            umbenennen={(name) => {
              if (!r._neu) {
                setzeReg(i, { name });
                return;
              }
              const key = eindeutig(schluesselAus(name), i);
              // Felder auf diesem Register wandern mit dem neuen Schlüssel mit.
              setE((x) => ({
                ...x,
                register: x.register.map((y, j) => (j === i ? { ...y, name, key } : y)),
                felder: x.felder.map((f) => (f._register === r.key ? { ...f, _register: key } : f)),
              }));
            }}
            setAnsage={setAnsage}
            quellen={quellen}
          />
        ))}
      </div>
      <Ansage text={ansage} />
      <div className="knoepfe">
        <Knopf onClick={() => hinzufuegen('felder')}>{t('mappentypen.editor.feldregister')}</Knopf>
        <Knopf onClick={() => hinzufuegen('dokumente')}>{t('mappentypen.editor.dokumentenregister')}</Knopf>
        <Knopf onClick={() => hinzufuegen('verknuepfungen')}>{t('mappentypen.editor.verknuepfungsregister-2')}</Knopf>
        {/* #800: mehrere Register „Historie“ möglich, z. B. „Verlauf“ und „Abrufe“. */}
        <Knopf onClick={() => hinzufuegen('protokoll')}>{t('mappentypen.editor.historie-2')}</Knopf>
      </div>
    </Bereich>
  );
}

/** Register entfernen (wirkt erst beim Speichern): Felder wandern auf ein anderes Feldregister – gibt es keins, geht es nicht. */
async function registerEntfernen(e: Entwurf, i: number, setE: SetE) {
  const r = e.register[i];
  if (r.art === 'felder') {
    const ziel = e.register.find((x, j) => j !== i && x.art === 'felder');
    const betroffen = e.felder.filter((f) => f._register === r.key);
    if (betroffen.length && !ziel) {
      await hinweis({
        titel: t('mappentypen.editor.register-laesst-sich-nicht'),
        text: t('mappentypen.editor.auf-diesem-register-liegen'),
      });
      return;
    }
    if (
      !(await rueckfrage({
        titel: t('mappentypen.editor.register-entfernen', { name: r.name }),
        text: `${betroffen.length ? t('mappentypen.editor.seine-felder-wandern-auf', { betroffen: betroffen.length, name: ziel!.name }) : ''}${ERST_BEIM_SPEICHERN}`.trim(),
        ja: t('mappentypen.editor.entfernen'),
      }))
    )
      return;
    setE((x) => ({
      ...x,
      register: x.register.filter((_, j) => j !== i),
      felder: x.felder.map((f) => (f._register === r.key ? { ...f, _register: ziel!.key } : f)),
    }));
    return;
  }
  if (
    !(await rueckfrage({
      titel: t('mappentypen.editor.register-entfernen', { name: r.name }),
      text: `${r.art === 'dokumente' ? t('mappentypen.editor.enthaelt-es-noch-dokumente') : ''}${ERST_BEIM_SPEICHERN}`.trim(),
      ja: t('mappentypen.editor.entfernen'),
    }))
  )
    return;
  setE((x) => ({ ...x, register: x.register.filter((_, j) => j !== i) }));
}

/** Eine Zeile der Registerliste: Kopf mit Griff, Art, Name, Kennung und Aktionen, darunter die Einstellungen ihrer Art. */
function RegisterZeile({
  r,
  i,
  e,
  zr,
  feldAblage,
  setzeReg,
  verschiebe,
  entferne,
  ausblenden,
  umbenennen,
  setAnsage,
  quellen,
}: {
  r: EntwurfRegister;
  i: number;
  e: Entwurf;
  zr: ReturnType<typeof useZiehen>;
  feldAblage: (key: string) => { className: string };
  setzeReg: (patch: Partial<EntwurfRegister>) => void;
  verschiebe: (rueck: number) => void;
  entferne: () => Promise<void>;
  ausblenden: (an: boolean) => void;
  umbenennen: (name: string) => void;
  setAnsage: (s: string) => void;
  quellen: Quelle[];
}) {
  const d = useDaten();
  const anzahl = e.felder.filter((f) => f._register === r.key).length;
  return (
    <div {...zr.eintrag(r._uid)}>
      <div
        {...(r.art === 'felder' ? feldAblage(r.key) : {})}
        className={`registerzeile art-${r.art} ${r.ausgeblendet ? 'ausgeblendet' : ''} ${r.art === 'felder' ? feldAblage(r.key).className : ''}`}>
        <RegisterKopf
          r={r}
          i={i}
          letzte={i === e.register.length - 1}
          zr={zr}
          setzeReg={setzeReg}
          verschiebe={verschiebe}
          entferne={entferne}
          umbenennen={umbenennen}
          setAnsage={setAnsage}
        />
        {r.art === 'felder' &&
          (anzahl ? (
            <Feldaufteilung
              r={r}
              felder={e.felder.filter((f) => f._register === r.key)}
              alle={e.felder}
              typen={d.typen}
              setze={(abschnitte) => setzeReg({ abschnitte })}
              ansage={setAnsage}
            />
          ) : (
            <p className="leise klein">{t('mappentypen.editor.noch-keine-felder-2')}</p>
          ))}
        {/* Ausblenden (#655): nicht bei Dokumentenregistern und Registern mit Systemfeldern. */}
        <RegisterAusblenden r={r} e={e} ausblenden={ausblenden} />
        {r.art === 'dokumente' && <DokumentenEinstellung r={r} setzeReg={setzeReg} />}
        {r.art === 'protokoll' && <HistorieEinstellung r={r} setzeReg={setzeReg} />}
        {r.art === 'verknuepfungen' && <VerknuepfungsQuellen r={r} e={e} setzeReg={setzeReg} quellen={quellen} />}
      </div>
    </div>
  );
}

function RegisterKopf({
  r,
  i,
  letzte,
  zr,
  setzeReg,
  verschiebe,
  entferne,
  umbenennen,
  setAnsage,
}: {
  r: EntwurfRegister;
  i: number;
  letzte: boolean;
  zr: ReturnType<typeof useZiehen>;
  setzeReg: (patch: Partial<EntwurfRegister>) => void;
  verschiebe: (rueck: number) => void;
  entferne: () => Promise<void>;
  umbenennen: (name: string) => void;
  setAnsage: (s: string) => void;
}) {
  return (
    <div className="registerkopf">
      <span className="registerchip">
        <Ziehgriff
          griff={zr.griff(r._uid, r.name || t('mappentypen.editor.register-2'))}
          tasten={{
            hoch:
              i > 0
                ? () => {
                    verschiebe(-1);
                    setAnsage(t('mappentypen.editor.steht-jetzt-an-stelle-3', { name: r.name, i }));
                  }
                : undefined,
            runter: !letzte
              ? () => {
                  verschiebe(1);
                  setAnsage(t('mappentypen.editor.steht-jetzt-an-stelle-4', { name: r.name, wert: i + 2 }));
                }
              : undefined,
          }}
        />
        <span className="chip">{REGISTERARTEN[r.art]}</span>
        {r.ausgeblendet && <span className="chip warn">{t('mappentypen.darstellung.chip.ausgeblendet')}</span>}
      </span>
      <SprachText
        beschriftungVerbergen
        beschriftung={t('mappentypen.editor.name-des-registers')}
        className="registername"
        wert={r.name}
        teil="name"
        beschriftungen={r.beschriftungen}
        setzeBeschriftungen={(b) => setzeReg({ beschriftungen: b as Register['beschriftungen'] })}
        setzeWert={umbenennen}
      />
      <code className="fkey" title={t('mappentypen.editor.kennung-3')}>
        {r.key}
      </code>
      <div className="feldaktionen">
        <Knopf art="link" gesperrt={i === 0} onClick={() => verschiebe(-1)} nurSymbol={t('mappentypen.editor.register-nach-vorn')}>
          <Symbol name="sortiert-auf" />
        </Knopf>
        <Knopf art="link" gesperrt={letzte} onClick={() => verschiebe(1)} nurSymbol={t('mappentypen.editor.register-nach-hinten')}>
          <Symbol name="sortiert-ab" />
        </Knopf>
        <Knopf
          art="link"
          onClick={() => entferne()}
          nurSymbol={t('mappentypen.editor.register-entfernen-2', { name: r.name })}
          title={t('mappentypen.editor.register-entfernen-3', { ERST_BEIM_SPEICHERN })}>
          <Symbol name="schliessen" />
        </Knopf>
      </div>
    </div>
  );
}

function RegisterAusblenden({ r, e, ausblenden }: { r: EntwurfRegister; e: Entwurf; ausblenden: (an: boolean) => void }) {
  const geht = registerAusblendbar({ art: r.art, felder: e.felder.filter((f) => f._register === r.key).map((f) => f.key) }, e.felder);
  if (!(geht || r.ausgeblendet)) return null;
  return (
    <HakenFeld
      beschriftung={t('mappentypen.darstellung.register-ausblenden-haken')}
      hinweis={
        r.art === 'felder'
          ? t('mappentypen.darstellung.register-ausblenden-hilfe')
          : t('mappentypen.darstellung.register-ausblenden-hilfe-2')
      }>
      <input type="checkbox" checked={!!r.ausgeblendet} onChange={(ev) => ausblenden(ev.target.checked)} />
    </HakenFeld>
  );
}

/** Dokumentenregister: Volltext und Versionierung (#194). */
function DokumentenEinstellung({ r, setzeReg }: { r: EntwurfRegister; setzeReg: (patch: Partial<EntwurfRegister>) => void }) {
  return (
    <>
      <p className="leise klein">{t('mappentypen.editor.hier-werden-dateien-hochgeladen')}</p>
      <HakenFeld beschriftung={t('mappentypen.editor.volltext-erzeugen')} hinweis={t('mappentypen.editor.textebene-von-pdfs-lesen')}>
        <input
          type="checkbox"
          checked={r.volltext !== false}
          onChange={(ev) => setzeReg({ volltext: ev.target.checked ? undefined : false })}
        />
      </HakenFeld>
      {/* Versionierung (#194) */}
      <HakenFeld
        beschriftung={t('mappentypen.editor.versionierung-einschalten')}
        hinweis={t('mappentypen.editor.beim-ersetzen-bleibt-die')}>
        <input
          type="checkbox"
          checked={!!r.versionierung}
          onChange={(ev) =>
            setzeReg({
              versionierung: ev.target.checked || undefined,
              ...(ev.target.checked ? {} : { versionenBehalten: undefined }),
            })
          }
        />
      </HakenFeld>
      {r.versionierung && (
        <Feld
          beschriftung={t('mappentypen.editor.nur-die-letzten-versionen')}
          className="klein einzug"
          hinweis={t('mappentypen.editor.leer-alle')}>
          <input
            type="number"
            min={2}
            className="kurz"
            value={r.versionenBehalten ?? ''}
            onChange={(ev) =>
              setzeReg({
                versionenBehalten: ev.target.value === '' ? undefined : Math.max(2, Math.trunc(Number(ev.target.value))),
              })
            }
          />
        </Feld>
      )}
    </>
  );
}

/** Register „Historie“ (#800): Geschrieben wird immer alles – hier steht nur, was dieses Register zeigt. */
function HistorieEinstellung({ r, setzeReg }: { r: EntwurfRegister; setzeReg: (patch: Partial<EntwurfRegister>) => void }) {
  return (
    <>
      <p className="leise klein">{t('mappentypen.editor.zeigt-wer-wann-was')}</p>
      {/* #800: Geschrieben wird immer alles – hier steht nur, was dieses Register zeigt. */}
      <FeldGruppe beschriftung={t('mappentypen.editor.historie-zeigt')} hinweis={t('mappentypen.editor.historie-zeigt-hinweis')}>
        {(Object.keys(HISTORIENGRUPPEN) as Historiengruppe[]).map((g) => {
          const an = historiengruppenVon(r).includes(g);
          return (
            <label key={g} className="haken">
              <input
                type="checkbox"
                checked={an}
                onChange={() => {
                  const alt = historiengruppenVon(r);
                  setzeReg({ zeigt: an ? alt.filter((x) => x !== g) : [...alt, g] });
                }}
              />
              <span>{historiengruppeName(g)}</span>
            </label>
          );
        })}
        {r.zeigt && (
          <Knopf art="link" groesse="klein" symbol="zuruecksetzen" onClick={() => setzeReg({ zeigt: undefined })}>
            {t('mappentypen.editor.historie-vorauswahl')}
          </Knopf>
        )}
      </FeldGruppe>
    </>
  );
}

/** Verknüpfungsregister: welche Verweisfelder es zeigt, je Quelle mit Trefferliste (#75). */
function VerknuepfungsQuellen({
  r,
  e,
  setzeReg,
  quellen,
}: {
  r: EntwurfRegister;
  e: Entwurf;
  setzeReg: (patch: Partial<EntwurfRegister>) => void;
  quellen: Quelle[];
}) {
  const d = useDaten();
  const gewaehlt = r.quellen ?? [];
  return quellen.length === 0 ? (
    <p className="leise klein">{t('mappentypen.editor.noch-verweist-kein-verweisfeld')}</p>
  ) : (
    <FeldGruppe beschriftung={t('mappentypen.editor.zeigt-mappen-die-so')} hinweis={t('mappentypen.editor.keine-auswahl-alle-als')}>
      <div className="feldstapel">
        {quellen.map((q) => {
          const an = gewaehlt.some((g) => g.typId === q.typId && g.feldKey === q.feldKey);
          const g = gewaehlt.find((x) => x.typId === q.typId && x.feldKey === q.feldKey);
          // Trefferliste je Quelle (#75): das Register zeigt die Mappen dann als Tabelle mit deren Spalten.
          const listen =
            q.typId === e.id
              ? e.trefferlisten.map((l) => ({ key: l.key, name: l.name }))
              : trefferlistenVon(d.typ(q.typId) ?? {}).map((l) => ({ key: l.key, name: l.name }));
          const fehlt = !!g?.trefferliste && !listen.some((l) => l.key === g.trefferliste);
          return (
            <div key={`${q.typId}-${q.feldKey}`} className="quellzeile">
              <label className="haken">
                <input
                  type="checkbox"
                  checked={an}
                  onChange={() =>
                    setzeReg({
                      quellen: an
                        ? gewaehlt.filter((x) => !(x.typId === q.typId && x.feldKey === q.feldKey))
                        : [...gewaehlt, { typId: q.typId, feldKey: q.feldKey }],
                    })
                  }
                />
                <span>{q.text}</span>
              </label>
              {/* Immer da, bis zum Anhaken unsichtbar: so springt beim An- und Abhaken keine Zeile (#372). */}
              <Feld beschriftung={t('mappentypen.editor.trefferliste-fuer', { text: q.text })} beschriftungVerbergen>
                <select
                  className={`klein ${fehlt ? 'fehlerhaft' : ''} ${an ? '' : 'platzhalter'}`}
                  value={g?.trefferliste ?? ''}
                  disabled={!an}
                  onChange={(ev) =>
                    setzeReg({
                      quellen: gewaehlt.map((x) =>
                        x === g
                          ? {
                              typId: x.typId,
                              feldKey: x.feldKey,
                              ...(ev.target.value ? { trefferliste: ev.target.value } : {}),
                            }
                          : x,
                      ),
                    })
                  }>
                  <option value="">{t('mappentypen.editor.einfache-liste-titel')}</option>
                  {fehlt && (
                    <option value={g!.trefferliste}>
                      {tn('mappentypen.editor.fehlt-einfache-liste', { trefferliste: g!.trefferliste })}
                    </option>
                  )}
                  {listen.map((l) => (
                    <option key={l.key} value={l.key}>
                      {t('mappentypen.editor.tabelle', { name: l.name })}
                    </option>
                  ))}
                </select>
              </Feld>
            </div>
          );
        })}
      </div>
    </FeldGruppe>
  );
}

/** Neues Register einer Art mit freiem Schlüssel aus dem Namen. */
function neuesRegister(art: Registerart, eindeutig: (basis: string, i: number) => string): EntwurfRegister {
  const name = {
    felder: t('mappentypen.editor.weitere-angaben'),
    dokumente: t('mappentypen.editor.dokumente'),
    verknuepfungen: t('mappentypen.editor.verknuepfungen'),
    protokoll: t('mappentypen.editor.historie'),
  }[art];
  return {
    key: eindeutig(schluesselAus(name), -1),
    name,
    art,
    _uid: neueId(),
    _neu: true,
    ...(art === 'verknuepfungen' ? { quellen: [] } : {}),
  };
}

/** Mögliche Quellen: jedes Referenzfeld, das auf diesen Mappentyp zeigt (auch aus ihm selbst). */
function quellenFuer(typen: Mappentyp[], e: Entwurf): Quelle[] {
  return [
    ...typen
      .filter((mappentyp) => mappentyp.id !== e.id)
      .flatMap((mappentyp) =>
        mappentyp.felder
          .filter((f) => f.typ === 'referenz' && zielErlaubt(f, e.id))
          .map((f) => ({ typId: mappentyp.id, feldKey: f.key, text: `${mappentyp.name} › ${f.label}` })),
      ),
    ...e.felder
      .filter((f) => f.typ === 'referenz' && zieleVon(f).includes(e.id))
      .map((f) => ({ typId: e.id, feldKey: f.key, text: `${e.name || t('mappentypen.editor.dieser-mappentyp-2')} › ${f.label}` })),
  ];
}
