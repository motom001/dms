import { useId, useRef, useState } from 'react';
import {
  BESCHREIBUNG_LAENGE,
  LIZENZ_SCHLUESSEL,
  LIZENZEN_ALPHABETISCH,
  lizenzPasst,
  LIZENZNAME_LAENGE,
  naechsteVersionen,
  paketIdAus,
  VERSIONSARTEN,
  type Lizenz,
  type PaketErstellenEingabe,
  type PaketPruefung,
  type VersionsArt,
} from '../../../../shared/src/paketerstellung';
import { Feld, FeldGruppe, HakenFeld, Knopf } from '../../bausteine';
import { t, tn } from '../../sprache';
import type { ErstellenZustand } from './zustand';

/**
 * Schritt 3 von „Paket erstellen“ (#374, #651; #1279 aus PaketErstellen.tsx gezogen): Name, Kennung, Beschreibung,
 * Autor, Version mit der Art der Änderung, nötige Ablago-Version und Lizenz.
 */

type Setze = (x: Partial<PaketErstellenEingabe>) => void;
type Lage = PaketPruefung['version'];

/** Schritt 3: Angaben zum Paket, Version, Lizenz; Probleme, die zu den Angaben gehören. */
export function AngabenSchritt({ z, probleme }: { z: ErstellenZustand; probleme: string[] }) {
  const e = z.e!;
  const setze = z.setze;
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.angaben')}>
      <h2 className="h3">{t('werkbank.paketerstellen.angaben')}</h2>
      <div className="raster">
        <Feld beschriftung={t('werkbank.paketerstellen.name')}>
          <input
            value={e.name}
            maxLength={60}
            onChange={(x) => setze({ name: x.target.value, ...(z.idAuto ? { id: paketIdAus(x.target.value) } : {}) })}
          />
        </Feld>
        <Feld
          beschriftung={t('werkbank.paketerstellen.id')}
          hinweis={tn('werkbank.paketerstellen.kleinbuchstaben-ziffern-und-z', {
            code: <code>{t('werkbank.paketerstellen.vertraege-familie')}</code>,
          })}>
          <input
            value={e.id}
            maxLength={20}
            onChange={(x) => {
              z.setIdAuto(false);
              setze({ id: x.target.value });
            }}
          />
        </Feld>
        <Feld
          beschriftung={t('werkbank.paketerstellen.beschreibung')}
          hinweis={t('werkbank.paketerstellen.ein-zwei-saetze-was', { min: BESCHREIBUNG_LAENGE.min, max: BESCHREIBUNG_LAENGE.max })}
          className="breit">
          <textarea
            rows={3}
            value={e.beschreibung}
            maxLength={BESCHREIBUNG_LAENGE.max}
            onChange={(x) => setze({ beschreibung: x.target.value })}
          />
        </Feld>
        <Feld beschriftung={t('werkbank.paketerstellen.autor')}>
          <input value={e.autor.name} onChange={(x) => setze({ autor: { ...e.autor, name: x.target.value } })} />
        </Feld>
        <Feld beschriftung={t('werkbank.paketerstellen.github-name-optional')} optional>
          <input value={e.autor.github} onChange={(x) => setze({ autor: { ...e.autor, github: x.target.value } })} />
        </Feld>
        <Feld
          beschriftung={t('werkbank.paketerstellen.was-ist-neu-in')}
          hinweis={t('werkbank.paketerstellen.steht-im-changelog-leer')}
          className="breit">
          <textarea
            rows={2}
            value={e.aenderungen}
            onChange={(x) => setze({ aenderungen: x.target.value })}
            placeholder={t('werkbank.paketerstellen.z-b-feld-kundennummer')}
          />
        </Feld>
      </div>
      <VersionWahl
        e={e}
        setze={setze}
        lage={z.lage ?? null}
        experte={z.experte}
        hochgeladen={z.hochgeladen}
        hochladen={(d) => void z.letzteHochladen(d)}
      />
      <LizenzWahl e={e} setze={setze} />
      {probleme.length > 0 && (
        <div className="hinweis schlecht">
          <ul>
            {probleme.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Beispiel und Titel je Art der Änderung (#651). */
const beispielText = (a: VersionsArt) =>
  ({
    korrektur: t('pakete.erstellen.version.korrekturBeispiel'),
    inhalt: t('pakete.erstellen.version.inhaltBeispiel'),
    gross: t('pakete.erstellen.version.grossBeispiel'),
  })[a];
const titelText = (a: VersionsArt, v: string) =>
  ({
    korrektur: t('pakete.erstellen.version.korrektur', { version: v }),
    inhalt: t('pakete.erstellen.version.inhalt', { version: v }),
    gross: t('pakete.erstellen.version.gross', { version: v }),
  })[a];

/** Nötige Ablago-Version (#651): aus der Auswahl; von Hand in der Stufe „Alles“. */
function DmsWahl({ e, setze, lage }: { e: PaketErstellenEingabe; setze: Setze; lage: Lage }) {
  const opt = lage.dmsOptionen;
  return (
    <Feld
      beschriftung={t('pakete.erstellen.dms.titel')}
      hinweis={
        lage.gruende.length ? t('pakete.erstellen.dms.gruende', { gruende: lage.gruende.join(', ') }) : t('pakete.erstellen.dms.grundlage')
      }>
      {e.vonHand ? (
        <input value={e.dms} onChange={(x) => setze({ dms: x.target.value })} />
      ) : (
        <select value={opt.includes(e.dms) ? e.dms : ''} onChange={(x) => setze({ dms: x.target.value })}>
          {[...opt].reverse().map((o, i, alle) => (
            <option key={o} value={o}>
              {o === opt[0]
                ? t('pakete.erstellen.dms.mindest', { angabe: o })
                : i === 0 && alle.length > 1
                  ? t('pakete.erstellen.dms.eigene', { angabe: o })
                  : o}
            </option>
          ))}
        </select>
      )}
    </Feld>
  );
}

/** #651: Version wählen (drei Arten der Änderung) und nötige Ablago-Version aus der Auswahl. */
function VersionWahl({
  e,
  setze,
  lage,
  experte,
  hochgeladen,
  hochladen,
}: {
  e: PaketErstellenEingabe;
  setze: Setze;
  lage: Lage | null;
  experte: boolean;
  hochgeladen: boolean;
  hochladen(d: File): void;
}) {
  const datei = useRef<HTMLInputElement>(null);
  const name = useId();
  if (!lage) return <p className="leise">{t('pakete.erstellen.version.titel')}: …</p>;
  const n = lage.bekannt ? naechsteVersionen(lage.bekannt) : null;
  return (
    <>
      <FeldGruppe beschriftung={t('pakete.erstellen.version.titel')} className="breit">
        <div className="haken-untereinander">
          {e.vonHand ? (
            <Feld beschriftung={t('pakete.erstellen.version.titel')} beschriftungVerbergen>
              <input value={e.version} onChange={(x) => setze({ version: x.target.value })} />
            </Feld>
          ) : n ? (
            <>
              <p className="leise klein">
                {t(hochgeladen ? 'pakete.erstellen.version.bekanntHochgeladen' : 'pakete.erstellen.version.bekannt', {
                  version: lage.bekannt!,
                })}
              </p>
              {VERSIONSARTEN.map((a) => (
                <label key={a} className="haken">
                  <input type="radio" name={name} checked={e.version === n[a]} onChange={() => setze({ version: n[a] })} />
                  <span>
                    {titelText(a, n[a])}
                    <small className="leise">{beispielText(a)}</small>
                  </span>
                </label>
              ))}
              {lage.art && lage.artGrund && (
                <p className="leise klein">{t('pakete.erstellen.version.erkannt', { grund: lage.artGrund })}</p>
              )}
            </>
          ) : (
            <>
              {experte ? (
                <>
                  <label className="haken">
                    <input type="radio" name={name} checked={e.version === '1.0.0'} onChange={() => setze({ version: '1.0.0' })} />
                    <span>
                      1.0.0<small className="leise">{t('pakete.erstellen.version.erstesErklaerung')}</small>
                    </span>
                  </label>
                  <label className="haken">
                    <input type="radio" name={name} checked={e.version === '0.1.0'} onChange={() => setze({ version: '0.1.0' })} />
                    <span>{t('pakete.erstellen.version.nullEins')}</span>
                  </label>
                </>
              ) : (
                <p>
                  <strong>{t('pakete.erstellen.version.erstes')}</strong>
                  <br />
                  <small className="leise">{t('pakete.erstellen.version.erstesErklaerung')}</small>
                </p>
              )}
            </>
          )}
          {!e.vonHand && (
            <p className="leise klein">
              {t('pakete.erstellen.version.unbekannt')}{' '}
              <Knopf onClick={() => datei.current?.click()}>{t('pakete.erstellen.version.hochladen')}</Knopf>
              <input
                ref={datei}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(x) => {
                  const f = x.target.files?.[0];
                  if (f) hochladen(f);
                  x.target.value = '';
                }}
              />
            </p>
          )}
          {experte && (
            <HakenFeld beschriftung={t('pakete.erstellen.version.vonHand')} hinweis={t('pakete.erstellen.version.vonHandHinweis')}>
              <input type="checkbox" checked={!!e.vonHand} onChange={(x) => setze({ vonHand: x.target.checked || undefined })} />
            </HakenFeld>
          )}
        </div>
      </FeldGruppe>
      <DmsWahl e={e} setze={setze} lage={lage} />
    </>
  );
}

/** #651: freie Lizenz (Suchfeld mit Vorschlägen), eigene Lizenz (Name + Text) oder keine. */
function LizenzWahl({ e, setze }: { e: PaketErstellenEingabe; setze: Setze }) {
  const art = e.lizenzArt ?? 'frei';
  const name = useId();
  return (
    <FeldGruppe beschriftung={t('pakete.erstellen.lizenz.titel')} className="breit">
      <div className="haken-untereinander">
        {(['frei', 'eigen', 'keine'] as const).map((a) => (
          <label key={a} className="haken">
            <input type="radio" name={name} checked={art === a} onChange={() => setze({ lizenzArt: a })} />
            <span>{t(`pakete.erstellen.lizenz.${a}`)}</span>
          </label>
        ))}
        {art === 'frei' && <LizenzSuche wert={e.lizenz} waehle={(l) => setze({ lizenz: l })} />}
        {art === 'eigen' && (
          <>
            <Feld beschriftung={t('pakete.erstellen.lizenz.name')}>
              <input
                value={e.lizenzName ?? ''}
                maxLength={LIZENZNAME_LAENGE.max}
                placeholder={t('pakete.erstellen.lizenz.namePlatzhalter')}
                onChange={(x) => setze({ lizenzName: x.target.value })}
              />
            </Feld>
            <Feld beschriftung={t('pakete.erstellen.lizenz.text')} className="breit">
              <textarea rows={6} value={e.lizenzText ?? ''} onChange={(x) => setze({ lizenzText: x.target.value })} />
            </Feld>
            <Feld beschriftung={t('pakete.erstellen.lizenz.datei')}>
              <input
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={(x) => {
                  const f = x.target.files?.[0];
                  if (f) void f.text().then((text) => setze({ lizenzText: text }));
                }}
              />
            </Feld>
          </>
        )}
        {art === 'keine' && <p className="leise klein">{t('pakete.erstellen.lizenz.keineHinweis')}</p>}
        {art !== 'frei' && (
          <div className="hinweis info">
            <p>{t('pakete.erstellen.lizenz.nichtKatalog')}</p>
          </div>
        )}
      </div>
    </FeldGruppe>
  );
}

const lizenzName = (l: Lizenz) => t.frei(`pakete.erstellen.lizenz.${LIZENZ_SCHLUESSEL[l]}.name`);
const lizenzSatz = (l: Lizenz) => t.frei(`pakete.erstellen.lizenz.${LIZENZ_SCHLUESSEL[l]}.satz`);

/** Suchfeld mit Vorschlägen (Combobox): Kürzel und Name, alphabetisch; Pfeiltasten, Enter, Escape. */
function LizenzSuche({ wert, waehle }: { wert: string; waehle(l: Lizenz): void }) {
  const [eingabe, setEingabe] = useState(wert);
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const id = useId();
  const liste = LIZENZEN_ALPHABETISCH.filter((l) => lizenzPasst(l, lizenzName(l), eingabe === wert ? '' : eingabe));
  const nimm = (l: Lizenz) => {
    waehle(l);
    setEingabe(l);
    setOffen(false);
  };
  const gewaehlt = (LIZENZEN_ALPHABETISCH as string[]).includes(wert) ? (wert as Lizenz) : null;
  return (
    <div
      className="refbox"
      onBlur={(x) => {
        if (!x.currentTarget.contains(x.relatedTarget as Node)) {
          setOffen(false);
          setEingabe(wert);
        }
      }}>
      <div className="wahl">
        <Feld beschriftung={t('pakete.erstellen.lizenz.suchen')} beschriftungVerbergen>
          <input
            type="search"
            role="combobox"
            placeholder={t('pakete.erstellen.lizenz.suchen')}
            autoComplete="off"
            aria-expanded={offen}
            aria-controls={offen ? `${id}-l` : undefined}
            aria-autocomplete="list"
            aria-activedescendant={offen && liste[aktiv] ? `${id}-${aktiv}` : undefined}
            value={eingabe}
            onFocus={() => setOffen(true)}
            onClick={() => setOffen(true)}
            onChange={(x) => {
              setEingabe(x.target.value);
              setOffen(true);
              setAktiv(0);
            }}
            onKeyDown={(x) => {
              if (x.key === 'Escape') {
                setOffen(false);
                setEingabe(wert);
              } else if (x.key === 'ArrowDown') {
                x.preventDefault();
                if (!offen) setOffen(true);
                else setAktiv((a) => Math.min(a + 1, liste.length - 1));
              } else if (x.key === 'ArrowUp') {
                x.preventDefault();
                setAktiv((a) => Math.max(a - 1, 0));
              } else if (x.key === 'Enter') {
                x.preventDefault();
                if (offen && liste[aktiv]) nimm(liste[aktiv]);
              }
            }}
          />
        </Feld>
        {offen && (
          <div id={`${id}-l`} className="wahlliste" role="listbox" aria-label={t('pakete.erstellen.lizenz.frei')}>
            {!liste.length ? (
              <p className="leise klein">{t('pakete.erstellen.lizenz.keinTreffer')}</p>
            ) : (
              liste.map((l, i) => (
                <div
                  key={l}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={l === wert}
                  className={`wahloption${i === aktiv ? ' an' : ''}`}
                  onMouseDown={(x) => x.preventDefault()}
                  onClick={() => nimm(l)}>
                  <strong>{l}</strong> – {lizenzName(l)}
                  <br />
                  <small className="leise">{lizenzSatz(l)}</small>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {gewaehlt && (
        <p className="leise klein">
          {lizenzName(gewaehlt)}: {lizenzSatz(gewaehlt)} {t('pakete.erstellen.lizenz.freiHinweis')}
        </p>
      )}
    </div>
  );
}
