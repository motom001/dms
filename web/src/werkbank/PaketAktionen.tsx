import { useEffect, useState } from 'react';
import { EINGEBAUTE_AKTIONEN, type AktionenEinstellung, type AktionRecht, type EingebauteAktion, type MappenAktion } from '../../../shared/src/paketaktionen';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { api, type PaketVorschau } from '../api';
import { HakenFeld, fehlerText } from '../bausteine';
import { Link } from '../ort';
import { t } from '../sprache';

/**
 * Aktionen im Menü „Mappe“ (#1039) in der Werkbank: je Paket die angemeldeten Aktionen mit ihren Rechten, jede
 * ausschaltbar; auf der Seite „Pakete“ an einer Stelle die eingebauten Aktionen (ausblenden) und alle Paket-Aktionen.
 * Ausblenden ist Ordnung, kein Recht: Wer etwas nicht darf, sieht es ohnehin nicht.
 */

/** Rechte einer Aktion als lesbarer Text. */
export const rechteText = (r: readonly AktionRecht[]) => r.map((x) => t.frei(`werkbank.paketaktionen.recht.${x.replace('_', '-')}`)).join(', ');

function useEinstellung() {
  const [e, setE] = useState<AktionenEinstellung | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { api.mappenaktionenEinstellung().then(setE, (x: unknown) => setFehler(fehlerText(x))); }, []);
  return { e, setE, fehler, setFehler };
}

/** Werkbank → Pakete → Paket: Aktionen dieses Pakets, je mit Haken „im Menü zeigen“. */
export function PaketAktionenBlock({ paket }: { paket: Pick<InstalliertesPaket, 'id' | 'name' | 'mappenaktionen'> }) {
  const { e, setE, fehler, setFehler } = useEinstellung();
  const aktionen = paket.mappenaktionen ?? [];
  if (!aktionen.length) return null;
  const aus = new Set(e?.paketAus[paket.id] ?? []);
  const schalte = (a: MappenAktion, an: boolean) => {
    const neu = an ? [...aus].filter((x) => x !== a.schluessel) : [...aus, a.schluessel];
    api.paketAktionenAusSetzen(paket.id, neu).then((x) => { setE(x); setFehler(undefined); }, (x: unknown) => setFehler(fehlerText(x)));
  };
  return (
    <section className="stapel" aria-label={t('werkbank.paketaktionen.titel')} data-anker="paket.aktionen">
      <h2 className="h3">{t('werkbank.paketaktionen.titel')}</h2>
      <p className="leise klein">{t('werkbank.paketaktionen.erklaerung')}</p>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {aktionen.map((a) => (
        <HakenFeld key={a.schluessel} beschriftung={a.name} hinweis={[t('werkbank.paketaktionen.braucht', { rechte: rechteText(a.rechte) }), a.dialog ? t('werkbank.paketaktionen.kern') : null, a.bedingung ? t('werkbank.paketaktionen.bedingung', { grund: a.bedingung.grund }) : null]}>
          <input type="checkbox" checked={!aus.has(a.schluessel)} disabled={!e} onChange={(x) => schalte(a, x.target.checked)} />
        </HakenFeld>
      ))}
    </section>
  );
}

/** Werkbank → Pakete: eingebaute Aktionen an einer Stelle ausblenden, dazu die Aktionen aller Pakete im Überblick. */
export function MappenMenueBlock({ pakete }: { pakete: InstalliertesPaket[] }) {
  const { e, setE, fehler, setFehler } = useEinstellung();
  const aus = new Set<EingebauteAktion>(e?.eingebautAus ?? []);
  const schalte = (k: EingebauteAktion, an: boolean) => {
    const neu = an ? [...aus].filter((x) => x !== k) : [...aus, k];
    api.eingebauteAktionenSetzen(neu).then((x) => { setE(x); setFehler(undefined); }, (x: unknown) => setFehler(fehlerText(x)));
  };
  const mitAktionen = pakete.filter((p) => p.mappenaktionen?.length);
  return (
    <section className="blatt" aria-label={t('werkbank.paketaktionen.menue')} data-anker="werkbank.mappenmenue">
      <h2 className="h3">{t('werkbank.paketaktionen.menue')}</h2>
      <p className="leise klein">{t('werkbank.paketaktionen.menue-erklaerung')}</p>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      <h3 className="h4">{t('werkbank.paketaktionen.eingebaut')}</h3>
      {EINGEBAUTE_AKTIONEN.map((k) => (
        <HakenFeld key={k} beschriftung={t.frei(`werkbank.paketaktionen.eingebaut.${k}`)}>
          <input type="checkbox" checked={!aus.has(k)} disabled={!e} onChange={(x) => schalte(k, x.target.checked)} />
        </HakenFeld>
      ))}
      <h3 className="h4">{t('werkbank.paketaktionen.von-paketen')}</h3>
      {!mitAktionen.length ? <p className="leise klein">{t('werkbank.paketaktionen.keine')}</p> : (
        <ul className="klein">
          {mitAktionen.map((p) => (
            <li key={p.id}><Link to={`/werkbank/pakete/${encodeURIComponent(p.id)}`} className="verweis">{p.name}</Link>:{' '}
              {p.mappenaktionen!.map((a) => (e?.paketAus[p.id]?.includes(a.schluessel) ? t('werkbank.paketaktionen.ausgeschaltet', { name: a.name }) : a.name)).join(', ')}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Rechte-Vorschau beim Installieren (#1039): jede Aktion mit Mappentypen und den Rechten, die sie am Ende braucht. */
export function AktionenVorschau({ aktionen, update }: { aktionen?: PaketVorschau['aktionen']; update: boolean }) {
  if (!aktionen?.length) return null;
  return (
    <div className="hinweis stapel info" data-anker="vorschau.aktionen">
      <p><strong>{t('werkbank.paketaktionen.vorschau')}</strong> {t('werkbank.paketaktionen.vorschau-erklaerung')}</p>
      <ul>{aktionen.map((a) => <li key={a.schluessel}>{t('werkbank.paketaktionen.vorschau-zeile', { name: a.name, typen: a.typen.join(', '), rechte: rechteText(a.rechte) })}{a.dialog && <> {t('werkbank.paketaktionen.kern')}</>}{update && a.neu && <> <span className="chip warn">{t('werkbank.paketaktionen.neu')}</span></>}</li>)}</ul>
    </div>
  );
}
