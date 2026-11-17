import { HakenFeld } from '../../bausteine';
import type { PaketVorschau } from '../../api/pakete';
import { Hilfe } from '../../Hilfe';
import { t, tn } from '../../sprache';
import { sprachname } from '../../../../shared/src/beschriftung';
import { MITMACHEN_URL } from '../../../../shared/src/sprachwahl';
import type { VorgabePlan } from '../../../../shared/src/vorgaben';

/**
 * Abschnitte der Paket-Vorschau (#1279 aus PaketVorschau.tsx gezogen): vorhandene Ansichten, Vorgaben, Mappen anderer
 * Pakete, Sprachpaket; dazu Herkunft der Übersetzung und Herausgeber neben dem Namen.
 */

/**
 * Eine vorhandene Ansicht des Pakets in der Vorschau (#1125): vorhanden, wird ersetzt, oder bleibt (geändert bzw. ohne
 * Prüfwert) – dann mit Haken „trotzdem ersetzen“.
 */
export function SichtZustandZeile({
  s,
  ersetzen,
  setze,
}: {
  s: PaketVorschau['sichten'][number];
  ersetzen: boolean;
  setze(an: boolean): void;
}) {
  if (s.zustand === 'aktualisiert') return <span>{t('werkbank.pakete.ansicht.aktualisiert', { name: s.name })}</span>;
  if (s.zustand !== 'geaendert' && s.zustand !== 'unbekannt')
    return <span className="leise">{t('werkbank.pakete.vorhanden', { name: s.name })}</span>;
  return (
    <div className="stapel">
      <span>
        {t(s.zustand === 'geaendert' ? 'werkbank.pakete.ansicht.geaendert' : 'werkbank.pakete.ansicht.unbekannt', { name: s.name })}
      </span>
      <HakenFeld beschriftung={t('werkbank.pakete.ansicht.ersetzen')}>
        <input type="checkbox" checked={ersetzen} onChange={(e) => setze(e.target.checked)} />
      </HakenFeld>
    </div>
  );
}

/** Was mit einer Vorgabe geschieht (#1038), als kurzer Zusatz hinter ihrem Namen. */
function vorgabeZustand(x: VorgabePlan, update: boolean): string {
  const teile = [
    x.zustand === 'neu'
      ? update
        ? t('werkbank.pakete.vorgaben.neu')
        : ''
      : x.zustand === 'aktualisiert'
        ? t('werkbank.pakete.vorgaben.aktualisiert')
        : x.zustand === 'geaendert'
          ? x.neueFassung
            ? t('werkbank.pakete.vorgaben.geaendert-neue-fassung')
            : t('werkbank.pakete.vorgaben.geaendert')
          : x.zustand === 'geloescht'
            ? t('werkbank.pakete.vorgaben.geloescht')
            : x.zustand === 'uebernommen'
              ? t('werkbank.pakete.vorgaben.uebernommen')
              : '',
    x.vorlagen ? t('werkbank.pakete.vorgaben.vorlagen', { anzahl: x.vorlagen }) : '',
  ].filter(Boolean);
  return teile.join(', ');
}

/**
 * Vorgaben in der Vorschau (#1038): Mappen, die das Paket zum Behalten mitbringt – je Mappentyp. Beim Update nur, was
 * sich tut; was unverändert bleibt, steht als Zahl darunter.
 */
export function VorgabenVorschau({ v }: { v: PaketVorschau }) {
  const alle = (v.vorgaben ?? []).filter((x) => !x.fremd);
  if (!alle.length) return null;
  const zeigen = v.update ? alle.filter((x) => x.zustand !== 'gleich' || x.vorlagen > 0) : alle;
  const typen = [...new Set(zeigen.map((x) => x.typ))];
  const gleich = alle.length - zeigen.length;
  return (
    <section className="stapel" aria-label={t('werkbank.pakete.vorgaben.titel')} data-anker="pakete.vorgaben">
      <h3>
        {t('werkbank.pakete.vorgaben.titel')} <Hilfe ort="pakete.vorgaben" />
      </h3>
      <p className="leise klein">{v.update ? t('werkbank.pakete.vorgaben.text-update') : t('werkbank.pakete.vorgaben.text')}</p>
      {typen.map((typ) => (
        <div key={typ}>
          <p className="klein">
            <strong>{typ}</strong>
          </p>
          <ul className="klein">
            {zeigen
              .filter((x) => x.typ === typ)
              .map((x) => {
                const z = vorgabeZustand(x, v.update);
                return (
                  <li key={x.schluessel}>
                    {x.name}
                    {z && <span className="leise"> · {z}</span>}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      {gleich > 0 && <p className="leise klein">{t('werkbank.pakete.vorgaben.unveraendert', { anzahl: gleich })}</p>}
    </section>
  );
}

/**
 * Mappen anderer Pakete (#1038) – Teil der Rechte-Vorschau: Vorgaben in deren Mappentypen und Vorlagen, die das Paket an
 * ihre Vorgaben hängt. Mehr darf es dort nicht (keine Felder, keine Rechte, nichts löschen).
 */
export function FremdeMappenVorschau({ v }: { v: PaketVorschau }) {
  const fremd = (v.vorgaben ?? []).filter((x) => x.fremd && (x.zustand === 'neu' || x.vorlagen > 0));
  const erg = (v.ergaenzungen ?? []).filter((e) => !e.fehlt && e.vorlagen > 0);
  if (!fremd.length && !erg.length) return null;
  return (
    <div className="hinweis info stapel" data-anker="pakete.fremde-mappen">
      <p>
        <strong>{t('werkbank.pakete.fremde-mappen.titel')}</strong>
      </p>
      <ul>
        {fremd.map((x) => (
          <li key={x.schluessel}>{t('werkbank.pakete.fremde-mappen.vorgabe', { name: x.name, typ: x.typ, paket: x.fremd ?? '' })}</li>
        ))}
        {erg.map((e) => (
          <li key={e.ziel}>{t('werkbank.pakete.fremde-mappen.vorlagen', { anzahl: e.vorlagen, name: e.name, paket: e.paket })}</li>
        ))}
      </ul>
      <p className="leise klein">{t('werkbank.pakete.fremde-mappen.grenze')}</p>
    </div>
  );
}

/** Sprachpaket in der Vorschau (#731): Sprache, Abdeckung, maschinell/geprüft, Beschriftungen für andere Pakete. */
export function SprachVorschau({ s }: { s: NonNullable<PaketVorschau['sprache']> }) {
  return (
    <div className="hinweis info stapel">
      <p>
        {t('werkbank.pakete.sprache.vorschau', {
          sprache: sprachname(s.kennung),
          prozent: s.abdeckung.prozent,
          vorhanden: s.abdeckung.vorhanden,
          gesamt: s.abdeckung.gesamt,
          ablago: s.ablago,
        })}
      </p>
      <SprachHerkunft maschinell={s.maschinell} geprueftVon={s.geprueftVon} />
      {s.pakete.length > 0 && <p>{t('werkbank.pakete.sprache.beschriftungen', { pakete: s.pakete.join(', ') })}</p>}
      <p className="leise klein">{t('werkbank.pakete.sprache.erlauben')}</p>
    </div>
  );
}
/** „Maschinell übersetzt – Verbesserungen willkommen“ bzw. „Geprüft von …“ (#731) – wie in Mein Konto. */
export function SprachHerkunft({ maschinell, geprueftVon }: { maschinell: boolean; geprueftVon?: string }) {
  if (geprueftVon) return <p className="leise klein">{t('werkbank.pakete.sprache.geprueft', { wer: geprueftVon })}</p>;
  if (!maschinell) return null;
  return (
    <p className="leise klein">
      {tn('werkbank.pakete.sprache.maschinell', {
        link: (
          <a href={MITMACHEN_URL} target="_blank" rel="noreferrer">
            {t('werkbank.pakete.sprache.mitmachen')}
          </a>
        ),
      })}
    </p>
  );
}

/**
 * Herausgeber neben dem Namen (#1084): „Verträge · app.ablago“, immer vollständig (nie gekürzt – sonst sähe
 * app.ablago-community wie app.ablago aus). Nicht belegte als „Herausgeber laut Paket: … – nicht geprüft“.
 */
export function Herausgeber({ wer, geprueft }: { wer?: string | null; geprueft?: boolean }) {
  if (!wer) return null;
  return (
    <span className="leise" title={t('werkbank.pakete.herausgeber')}>
      {' '}
      · {geprueft ? wer : t('werkbank.pakete.herausgeber-ungeprueft', { wer })}
    </span>
  );
}
