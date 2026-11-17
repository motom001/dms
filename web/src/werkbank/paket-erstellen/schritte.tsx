import type { ErstellenStand, PaketEntwurf, PaketPruefung } from '../../../../shared/src/paketerstellung';
import { gebietsschema } from '../../../../shared/src/sprache';
import { Knopf, KnopfLink } from '../../bausteine';
import { Symbol } from '../../Symbol';
import { t, tn } from '../../sprache';
import { groesse, type ErstellenZustand } from './zustand';

/**
 * Rahmen und Schritte von „Paket erstellen“ (#374, #652; #1279 aus PaketErstellen.tsx gezogen): Schrittleiste, Frage
 * „Neues Paket oder neue Version“, Prüfung, Erstellen mit Inhalt und die Leiste mit den Knöpfen.
 */

/** Assistent „Paket erstellen“ (#374): Kennung in der Adresse der Paketseite (#1278, Schritt 5: vorher in Pakete.tsx). */
export const ERSTELLEN = t('werkbank.pakete.erstellen');
/** Selbst erstelltes Paket in der Paketverwaltung (#652): Kennung in der Adresse. */
export const SELBST = t('werkbank.paketerstellen.selbst');

const SCHRITTE = [
  t('werkbank.paketerstellen.auswaehlen'),
  t('werkbank.paketerstellen.pruefen'),
  t('werkbank.paketerstellen.angaben'),
  t('werkbank.paketerstellen.erstellen'),
] as const;
/** Probleme, die zu den Angaben gehören (Schritt 3), statt zur Auswahl. */
export const istAngabe = (p: string) => /^(Id|Name|Version|Beschreibung|Autor|GitHub|Lizenz|Ablago-Version):/.test(p);

/** Die Schritte als Leiste: erledigte mit Haken, der aktuelle markiert; jeder Schritt anklickbar. */
export function Schrittleiste({ schritt, setSchritt }: { schritt: number; setSchritt(s: number): void }) {
  return (
    <ol
      className="assistent-schritte"
      aria-label={t('werkbank.paketerstellen.schritt-von', {
        wert: schritt + 1,
        SCHRITTE: SCHRITTE.length,
        SCHRITTE2: SCHRITTE[schritt],
      })}>
      {SCHRITTE.map((s, i) => (
        <li key={s} className={i < schritt ? 'erledigt' : i === schritt ? 'aktiv' : ''} aria-current={i === schritt ? 'step' : undefined}>
          <Knopf onClick={() => setSchritt(i)}>
            <span className="nr" aria-hidden="true">
              {i < schritt ? <Symbol name="haken" /> : i + 1}
            </span>
            <span className="name">{s}</span>
          </Knopf>
        </li>
      ))}
    </ol>
  );
}

/** #652: Schritt 1 beginnt mit der Frage „Neues Paket“ oder „Neue Version von …“, sobald es frühere Pakete gibt. */
export function NeuOderVersion({ stand, neu, version }: { stand: ErstellenStand; neu(): void; version(w: PaketEntwurf): void }) {
  const liste = [...stand.entwuerfe].sort((a, b) => b.exportiert.localeCompare(a.exportiert));
  return (
    <section className="blatt" aria-label={t('pakete.erstellen.frage.titel')}>
      <h2 className="h3">{t('pakete.erstellen.frage.titel')}</h2>
      <div className="knoepfe">
        <Knopf art="haupt" onClick={neu}>
          {t('pakete.erstellen.frage.neu')}
        </Knopf>
      </div>
      <p className="leise klein">{t('pakete.erstellen.frage.neuText')}</p>
      <h3 className="h4">{t('pakete.erstellen.frage.version')}</h3>
      <ul className="stapel">
        {liste.map((w) => (
          <li key={w.id}>
            <Knopf onClick={() => version(w)}>{t('pakete.erstellen.frage.versionVon', { name: w.name })}</Knopf>
            <small className="leise">
              {' '}
              {w.id} ·{' '}
              {t('pakete.erstellen.frage.zuletzt', {
                version: w.version,
                datum: new Date(w.exportiert).toLocaleDateString(gebietsschema()),
              })}
            </small>
          </li>
        ))}
      </ul>
      <p className="leise klein">{t('pakete.erstellen.frage.versionText')}</p>
    </section>
  );
}

/** Schritt 2: automatische Prüfung – Probleme der Auswahl, was fehlt (mit „Mit aufnehmen“), Hinweise und der Inhalt. */
export function PruefenSchritt({ z, probleme }: { z: ErstellenZustand; probleme: string[] }) {
  const p = z.pruefung;
  const umschalten = z.umschalten;
  const auswahlProbleme = probleme;
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.pruefung')}>
      <h2 className="h3">{t('werkbank.paketerstellen.automatische-pruefung')}</h2>
      {!p ? (
        <p className="leise">{t('werkbank.paketerstellen.pruefe')}</p>
      ) : (
        <>
          {auswahlProbleme.length > 0 && (
            <div className="hinweis schlecht">
              <ul>
                {auswahlProbleme.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {p.fehlend.length > 0 && (
            <div className="hinweis warn">
              <p>{t('werkbank.paketerstellen.nicht-gewaehlt-aber-gebraucht')}</p>
              <ul>
                {p.fehlend.map((f) => (
                  <li key={f.id}>
                    {f.art === 'typ' ? t('werkbank.paketerstellen.mappentyp') : t('werkbank.paketerstellen.ansicht')} „{f.name}“{' '}
                    <span className="leise">({f.grund})</span>{' '}
                    <Knopf onClick={() => umschalten(f.art === 'typ' ? 'typen' : 'sichten', f.id, true)}>
                      {t('werkbank.paketerstellen.mit-aufnehmen')}
                    </Knopf>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.hinweise.length > 0 && (
            <div className="hinweis info">
              <ul>
                {p.hinweise.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {!auswahlProbleme.length && !p.fehlend.length && <p className="gut">{t('werkbank.paketerstellen.die-auswahl-passt')}</p>}
          <Inhalt p={p} />
        </>
      )}
    </section>
  );
}

/** Schritt 4: Paket mit Datei und Inhalt (oder was noch fehlt) und nach dem Erstellen der Weg dorthin. */
export function ErstellenSchritt({ z }: { z: ErstellenZustand }) {
  const p = z.pruefung;
  const e = z.e!;
  const fertig = z.fertig;
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.erstellen')}>
      <h2 className="h3">{t('werkbank.paketerstellen.erstellen')}</h2>
      {!p ? (
        <p className="leise">{t('werkbank.paketerstellen.pruefe')}</p>
      ) : p.einspielbar ? (
        <>
          <div className="hinweis gut">
            <p>
              {t('werkbank.paketerstellen.das-paket-hat-dieselbe', {
                wert: Object.keys(p.abhaengigkeiten).length ? t('werkbank.paketerstellen.wenn-dort-die-abhaengigkeiten') : '',
              })}
            </p>
          </div>
          <dl className="eigenschaften">
            <dt>{t('werkbank.paketerstellen.paket')}</dt>
            <dd>
              {tn('werkbank.paketerstellen.version-ablago', {
                name: e.name,
                id: e.id,
                version: e.version,
                wert: e.lizenzArt === 'eigen' ? e.lizenzName : e.lizenzArt === 'keine' ? t('pakete.erstellen.lizenz.keine') : e.lizenz,
                dms: e.dms,
              })}
            </dd>
            <dt>{t('werkbank.paketerstellen.datei')}</dt>
            <dd>
              {p.datei?.name} · {groesse(p.datei?.bytes ?? 0)}
            </dd>
          </dl>
          <Inhalt p={p} />
          {e.lizenzArt && e.lizenzArt !== 'frei' && (
            <div className="hinweis warn">
              <p>{t('pakete.erstellen.lizenz.nichtKatalog')}</p>
            </div>
          )}
        </>
      ) : (
        <div className="hinweis schlecht stapel">
          <p>{t('pakete.erstellen.nochnicht')}</p>
          <ul>
            {p.probleme.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {fertig && (
        <div className="hinweis gut" role="status">
          <p>
            {fertig}{' '}
            <KnopfLink to={`/werkbank/pakete/${SELBST}${e.id}`} groesse="klein">
              {t('pakete.erstellen.fertig.ansehen')}
            </KnopfLink>
          </p>
        </div>
      )}
    </section>
  );
}

/** Was ins Paket kommt („würde installieren …“). */
function Inhalt({ p }: { p: PaketPruefung }) {
  const abh = Object.entries(p.abhaengigkeiten);
  return (
    <dl className="eigenschaften">
      <dt>{t('werkbank.paketerstellen.mappentypen')}</dt>
      <dd>{p.inhalt.typen.map((eintrag) => eintrag.name).join(', ') || '–'}</dd>
      <dt>{t('werkbank.paketerstellen.ansichten')}</dt>
      <dd>
        {p.inhalt.sichten
          .map((s) => (s.eltern ? `${p.inhalt.sichten.find((x) => x.schluessel === s.eltern)?.name} → ${s.name}` : s.name))
          .join(', ') || '–'}
      </dd>
      <dt>{t('werkbank.paketerstellen.beispiele')}</dt>
      <dd>
        {p.inhalt.beispiele ? (
          <>
            {p.inhalt.beispiele}
            {p.inhalt.beispielDokumente
              ? ` ${t('werkbank.paketerstellen.mit-dokumenten-anzahl', { anzahl: p.inhalt.beispielDokumente })}`
              : ''}
          </>
        ) : (
          t('werkbank.paketerstellen.keine')
        )}
      </dd>
      <dt>{t('werkbank.paketerstellen.wortlisten')}</dt>
      <dd>{p.inhalt.wortlisten || t('werkbank.paketerstellen.keine')}</dd>
      {!!p.inhalt.rundgaenge && (
        <>
          <dt>{t('werkbank.paketerstellen.rundgaenge')}</dt>
          <dd>{p.inhalt.rundgaenge}</dd>
        </>
      )}
      {!!p.inhalt.tipps && (
        <>
          <dt>{t('werkbank.paketerstellen.tipps')}</dt>
          <dd>{p.inhalt.tipps}</dd>
        </>
      )}
      {!!p.inhalt.automatisierungen && (
        <>
          <dt>{t('werkbank.paketerstellen.automatisierungen')}</dt>
          <dd>{p.inhalt.automatisierungen}</dd>
        </>
      )}
      <dt>{t('werkbank.paketerstellen.abhaengigkeiten')}</dt>
      <dd>{abh.length ? abh.map(([k, v]) => `${k} ${v}`).join(', ') : t('werkbank.paketerstellen.keine')}</dd>
    </dl>
  );
}

/** Leiste unten: Abbrechen, Stand der Prüfung, Zurück/Weiter bzw. Erstellen (mit ZIP). */
export function Leiste({ z }: { z: ErstellenZustand }) {
  const { schritt, setSchritt, prueft, frage, sendet } = z;
  const p = z.pruefung;
  return (
    <div className="speicherleiste">
      <KnopfLink to="/werkbank/pakete">{t('werkbank.paketerstellen.abbrechen')}</KnopfLink>
      <span className="status" role="status">
        {prueft
          ? t('werkbank.paketerstellen.pruefe')
          : p
            ? p.einspielbar
              ? t('werkbank.paketerstellen.bereit-zum-erstellen')
              : t('werkbank.paketerstellen.punkte-offen', { anzahl: p.probleme.length })
            : ''}
      </span>
      <div className="knoepfe">
        {schritt > 0 && <Knopf onClick={() => setSchritt(schritt - 1)}>{t('werkbank.paketerstellen.zurueck')}</Knopf>}
        {schritt < SCHRITTE.length - 1 ? (
          <Knopf art="haupt" gesperrt={schritt === 0 && frage} onClick={() => setSchritt(schritt + 1)}>
            {t('werkbank.paketerstellen.weiter')}
          </Knopf>
        ) : (
          <>
            <Knopf gesperrt={sendet || prueft || !p?.einspielbar} onClick={() => void z.erstellen(true)}>
              {t('pakete.erstellen.mitZip')}
            </Knopf>
            <Knopf
              art="haupt"
              gesperrt={prueft || !p?.einspielbar}
              laeuft={sendet}
              laeuftText={t('werkbank.paketerstellen.erstelle')}
              onClick={() => void z.erstellen(false)}>
              {t('pakete.erstellen.knopf')}
            </Knopf>
          </>
        )}
      </div>
    </div>
  );
}
