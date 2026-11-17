import { useMemo } from 'react';
import type { ErstellenStand, PaketErstellenEingabe, PaketPruefung } from '../../../../shared/src/paketerstellung';
import { FeldGruppe, HakenFeld, PaketChip, Suchfeld } from '../../bausteine';
import { t } from '../../sprache';
import type { Liste } from './zustand';

/**
 * Schritt 1 von „Paket erstellen“ (#374; #1279 aus PaketErstellen.tsx gezogen): Mappentypen, Ansichten (als Baum),
 * Wortlisten, Rundgänge, Tipps, Automatisierungen und – optional – Beispiel-Mappen wählen.
 */

type Umschalten = (liste: Liste, id: string, an: boolean) => void;

/** Mappentypen mit Herkunft und – wenn geändert (#653) – den Unterschieden zum Paketstand. */
function Typen({
  stand,
  e,
  umschalten,
  passt,
}: {
  stand: ErstellenStand;
  e: PaketErstellenEingabe;
  umschalten: Umschalten;
  passt: (n: string) => boolean;
}) {
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.mappentypen')}>
      <h2 className="h3">{t('werkbank.paketerstellen.mappentypen')}</h2>
      <FeldGruppe beschriftung={t('werkbank.paketerstellen.mappentypen')} beschriftungVerbergen>
        <ul className="stapel">
          {stand.typen
            .filter((eintrag) => passt(eintrag.name))
            .map((eintrag) => (
              <li key={eintrag.id}>
                <label className="haken">
                  <input
                    type="checkbox"
                    checked={e.typen.includes(eintrag.id)}
                    onChange={(x) => umschalten('typen', eintrag.id, x.target.checked)}
                  />
                  <span>
                    {eintrag.name}
                    <PaketChip paket={eintrag.paket} inLink titel={t('werkbank.paketerstellen.kommt-beim-export-als')} />
                    {eintrag.geaendert &&
                      (eintrag.unterschiede ? (
                        <details className="unterschiede">
                          <summary>
                            <span className="chip warn">{t('werkbank.paketerstellen.geaendert', { kurz: eintrag.unterschiede.kurz })}</span>
                          </summary>
                          <ul className="klein">
                            {eintrag.unterschiede.liste.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <>
                          {' '}
                          <span className="chip warn" title={t('werkbank.paketerstellen.nach-der-installation-des')}>
                            {t('werkbank.paketerstellen.geaendert-2')}
                          </span>
                        </>
                      ))}
                    {eintrag.beschreibung && <small className="leise">{eintrag.beschreibung}</small>}
                  </span>
                </label>
              </li>
            ))}
          {!stand.typen.length && <li className="leise">{t('werkbank.paketerstellen.keine-mappentypen')}</li>}
        </ul>
      </FeldGruppe>
    </section>
  );
}

/** Ansichten als Baum (eingerückt), Reihenfolge wie in der Ablage; beim Suchen ohne Einzug. */
function Sichten({
  stand,
  e,
  umschalten,
  passt,
  s,
}: {
  stand: ErstellenStand;
  e: PaketErstellenEingabe;
  umschalten: Umschalten;
  passt: (n: string) => boolean;
  s: string;
}) {
  const baum = useMemo(() => {
    const erg: Array<{ s: ErstellenStand['sichten'][number]; tiefe: number }> = [];
    const besuche = (eltern: string | null, tiefe: number, gesehen: Set<string>) => {
      for (const x of stand.sichten.filter((y) => y.elternId === eltern)) {
        if (gesehen.has(x.id)) continue;
        gesehen.add(x.id);
        erg.push({ s: x, tiefe });
        besuche(x.id, tiefe + 1, gesehen);
      }
    };
    besuche(null, 0, new Set());
    return erg;
  }, [stand.sichten]);
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.ansichten')}>
      <h2 className="h3">{t('werkbank.paketerstellen.ansichten')}</h2>
      <FeldGruppe beschriftung={t('werkbank.paketerstellen.ansichten')} beschriftungVerbergen>
        <ul className="stapel">
          {baum
            .filter(({ s: x }) => passt(x.name))
            .map(({ s: x, tiefe }) => (
              <li key={x.id} style={{ paddingLeft: `${s ? 0 : tiefe * 1.4}em` }}>
                <label className="haken">
                  <input
                    type="checkbox"
                    checked={e.sichten.includes(x.id)}
                    onChange={(y) => umschalten('sichten', x.id, y.target.checked)}
                  />
                  <span>
                    {x.name}
                    <PaketChip paket={x.paket} inLink />
                  </span>
                </label>
              </li>
            ))}
          {!stand.sichten.length && <li className="leise">{t('werkbank.paketerstellen.keine-ansichten')}</li>}
        </ul>
      </FeldGruppe>
    </section>
  );
}

/** Wortlisten (gleichbedeutende Wörter); die aus Paketen sind nicht wählbar. */
function Wortlisten({
  stand,
  e,
  umschalten,
  passt,
}: {
  stand: ErstellenStand;
  e: PaketErstellenEingabe;
  umschalten: Umschalten;
  passt: (n: string) => boolean;
}) {
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.wortlisten')}>
      <h2 className="h3">{t('werkbank.paketerstellen.wortlisten')}</h2>
      <p className="leise klein">{t('werkbank.paketerstellen.gleichbedeutende-woerter-fuer-die')}</p>
      <FeldGruppe beschriftung={t('werkbank.paketerstellen.wortlisten')} beschriftungVerbergen>
        <ul className="stapel">
          {(stand.wortlisten ?? [])
            .filter((g) => passt(g.woerter.join(' ')))
            .map((g) => (
              <li key={g.id}>
                <label className={`haken${g.paket ? ' grau' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={!!g.paket}
                    checked={!g.paket && (e.wortlisten ?? []).includes(g.id)}
                    onChange={(x) => umschalten('wortlisten', g.id, x.target.checked)}
                  />
                  <span>
                    {g.woerter.join(', ')}
                    <PaketChip paket={g.paket} inLink />
                  </span>
                </label>
              </li>
            ))}
          {!(stand.wortlisten ?? []).length && <li className="leise">{t('werkbank.paketerstellen.keine-wortlisten')}</li>}
        </ul>
      </FeldGruppe>
    </section>
  );
}

/** Eigene Rundgänge (#941): als inhalt/rundgaenge.yaml. */
function Rundgaenge({
  stand,
  e,
  umschalten,
  passt,
}: {
  stand: ErstellenStand;
  e: PaketErstellenEingabe;
  umschalten: Umschalten;
  passt: (n: string) => boolean;
}) {
  if (!stand.rundgaenge?.length) return null;
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.rundgaenge')}>
      <h2 className="h3">{t('werkbank.paketerstellen.rundgaenge')}</h2>
      <p className="leise klein">{t('werkbank.paketerstellen.rundgaenge.text')}</p>
      <FeldGruppe beschriftung={t('werkbank.paketerstellen.rundgaenge')} beschriftungVerbergen>
        <ul className="stapel">
          {stand.rundgaenge
            .filter((r) => passt(r.titel))
            .map((r) => (
              <li key={r.schluessel}>
                <label className="haken">
                  <input
                    type="checkbox"
                    checked={(e.rundgaenge ?? []).includes(r.schluessel)}
                    onChange={(x) => umschalten('rundgaenge', r.schluessel, x.target.checked)}
                  />
                  <span>{r.titel}</span>
                </label>
              </li>
            ))}
        </ul>
      </FeldGruppe>
    </section>
  );
}

/** Eigene Tipps (#942): als inhalt/tipps.yaml. */
function Tipps({
  stand,
  e,
  umschalten,
  passt,
}: {
  stand: ErstellenStand;
  e: PaketErstellenEingabe;
  umschalten: Umschalten;
  passt: (n: string) => boolean;
}) {
  if (!stand.tipps?.length) return null;
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.tipps')}>
      <h2 className="h3">{t('werkbank.paketerstellen.tipps')}</h2>
      <p className="leise klein">{t('werkbank.paketerstellen.tipps.text')}</p>
      <FeldGruppe beschriftung={t('werkbank.paketerstellen.tipps')} beschriftungVerbergen>
        <ul className="stapel">
          {stand.tipps
            .filter((x) => passt(x.text))
            .map((x) => (
              <li key={x.schluessel}>
                <label className="haken">
                  <input
                    type="checkbox"
                    checked={(e.tipps ?? []).includes(x.schluessel)}
                    onChange={(y) => umschalten('tipps', x.schluessel, y.target.checked)}
                  />
                  <span>{x.text}</span>
                </label>
              </li>
            ))}
        </ul>
      </FeldGruppe>
    </section>
  );
}

/** Eigene Automatisierungen (#680): als inhalt/automatisierungen.yaml, beim Installieren aus. */
function Automatisierungen({
  stand,
  e,
  umschalten,
  passt,
}: {
  stand: ErstellenStand;
  e: PaketErstellenEingabe;
  umschalten: Umschalten;
  passt: (n: string) => boolean;
}) {
  if (!stand.automatisierungen?.length) return null;
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.automatisierungen')}>
      <h2 className="h3">{t('werkbank.paketerstellen.automatisierungen')}</h2>
      <p className="leise klein">{t('werkbank.paketerstellen.automatisierungen.text')}</p>
      <FeldGruppe beschriftung={t('werkbank.paketerstellen.automatisierungen')} beschriftungVerbergen>
        <ul className="stapel">
          {stand.automatisierungen
            .filter((x) => passt(x.name))
            .map((x) => (
              <li key={x.id}>
                <label className="haken">
                  <input
                    type="checkbox"
                    checked={(e.automatisierungen ?? []).includes(x.id)}
                    onChange={(y) => umschalten('automatisierungen', x.id, y.target.checked)}
                  />
                  <span>
                    {x.name}
                    {x.kurz && <small className="hilfe">{x.kurz}</small>}
                  </span>
                </label>
              </li>
            ))}
        </ul>
      </FeldGruppe>
    </section>
  );
}

/** Beispiel-Mappen (optional) je Mappentyp; Beispiel-Dokumente (#878) nur auf ausdrücklichen Wunsch. */
function Beispiele({
  e,
  umschalten,
  passt,
  pruefung,
  mitDokumenten,
}: {
  e: PaketErstellenEingabe;
  umschalten: Umschalten;
  passt: (n: string) => boolean;
  pruefung: PaketPruefung | null;
  mitDokumenten(an: boolean): void;
}) {
  return (
    <section className="blatt" aria-label={t('werkbank.paketerstellen.beispiel-mappen')}>
      <h2 className="h3">{t('werkbank.paketerstellen.beispiel-mappen-optional')}</h2>
      <p className="leise klein">{t('werkbank.paketerstellen.ohne-auswahl-enthaelt-das')}</p>
      {!pruefung ? (
        <p className="leise klein">{t('werkbank.paketerstellen.lade')}</p>
      ) : !pruefung.beispielMappen.length ? (
        <p className="leise klein">{t('werkbank.paketerstellen.waehle-zuerst-eigene-mappentypen')}</p>
      ) : (
        pruefung.beispielMappen.map((b) => (
          <details key={b.typId} open={b.mappen.some((m) => e.beispiele.includes(m.id))}>
            <summary>
              {b.typ}{' '}
              <span className="leise klein">
                ({b.mappen.filter((m) => e.beispiele.includes(m.id)).length}{' '}
                {t('werkbank.paketerstellen.von-gewaehlt', { mappen: b.mappen.length, wert: b.mehr ? '+' : '' })}
              </span>
            </summary>
            <FeldGruppe beschriftung={b.typ} beschriftungVerbergen>
              <ul className="stapel">
                {b.mappen
                  .filter((m) => passt(m.titel))
                  .map((m) => (
                    <li key={m.id}>
                      <label className="haken">
                        <input
                          type="checkbox"
                          checked={e.beispiele.includes(m.id)}
                          onChange={(x) => umschalten('beispiele', m.id, x.target.checked)}
                        />
                        <span>
                          {m.titel}
                          {m.demo && (
                            <>
                              {' '}
                              <span className="chip gut">{t('werkbank.paketerstellen.demo')}</span>
                            </>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                {!b.mappen.length && <li className="leise klein">{t('werkbank.paketerstellen.keine-mappen')}</li>}
              </ul>
            </FeldGruppe>
          </details>
        ))
      )}
      {/* Beispiel-Dokumente (#878): nur auf ausdrücklichen Wunsch – Dokumente sind oft echt. */}
      {e.beispiele.length > 0 && (
        <HakenFeld beschriftung={t('werkbank.paketerstellen.mit-dokumenten')}>
          <input type="checkbox" checked={!!e.beispielDokumente} onChange={(x) => mitDokumenten(x.target.checked)} />
        </HakenFeld>
      )}
    </section>
  );
}

/** Schritt 1: Mappentypen, Ansichten und (optional) Beispiel-Mappen wählen. */
export function Auswahl({
  stand,
  e,
  suche,
  setSuche,
  umschalten,
  mitDokumenten,
  pruefung,
}: {
  stand: ErstellenStand;
  e: PaketErstellenEingabe;
  suche: string;
  setSuche(s: string): void;
  pruefung: PaketPruefung | null;
  umschalten: Umschalten;
  /** Beispiel-Dokumente (#878) mitnehmen. */
  mitDokumenten(an: boolean): void;
}) {
  const s = suche.trim().toLowerCase();
  const passt = (n: string) => !s || n.toLowerCase().includes(s);
  const p = { stand, e, umschalten, passt };
  return (
    <>
      <Suchfeld
        wert={suche}
        setze={setSuche}
        beschriftung={t('werkbank.paketerstellen.mappentypen-ansichten-und-wortlisten')}
        platzhalter={t('werkbank.paketerstellen.suchen')}
      />
      <Typen {...p} />
      <Sichten {...p} s={s} />
      <Wortlisten {...p} />
      <Rundgaenge {...p} />
      <Tipps {...p} />
      <Automatisierungen {...p} />
      <Beispiele e={e} umschalten={umschalten} passt={passt} pruefung={pruefung} mitDokumenten={mitDokumenten} />
    </>
  );
}
