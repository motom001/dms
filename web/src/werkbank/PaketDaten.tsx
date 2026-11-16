/**
 * Einrichtung und Nachweise (#1054) auf der Seite eines Pakets: je angefragtem Bereich ein Haken – Vorgabe: nichts.
 * Anhaken darf nur, wer den Bereich selbst verwaltet; Zugang und Nachweise nur mit Gesamter Verwaltung und frischer
 * Anmeldung (fragt die Anfrage selbst nach). Wer speichert, wird die hinterlegte Person: Verliert sie das
 * Verwaltungsrecht, wirkt der Haken nicht mehr – das steht dann am Haken.
 */
import { useEffect, useState } from 'react';
import type { PaketdatenAnsicht, PaketdatenArt } from '../../../shared/src/paketdaten';
import { gebietsschema } from '../../../shared/src/sprache';
import { paketeApi } from '../api/pakete';
import { FeldGruppe, HakenFeld, Knopf, type KnopfErgebnis } from '../bausteine';
import { t } from '../sprache';

const datum = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
const schluessel = (art: PaketdatenArt, bereich: string) => `${art}:${bereich}`;

/** Übersicht (#996: Übersicht liest, Einstellungen ändern): was freigegeben ist, „Ändern“ führt in die Einstellungen. */
export function PaketDatenZeile({ paket, aendern }: { paket: string; aendern: () => void }) {
  const [a, setA] = useState<PaketdatenAnsicht | null>(null);
  useEffect(() => {
    paketeApi.paketdaten(paket).then(setA, () => setA(null));
  }, [paket]);
  if (!a) return null;
  const liste = (art: PaketdatenArt) =>
    a.bereiche
      .filter((b) => b.art === art && b.wirksam)
      .map((b) => b.name)
      .join(', ') || '–';
  return (
    <>
      <h2 className="h3">{t('pakete.daten.titel')}</h2>
      <p>
        {a.bereiche.some((b) => b.angehakt)
          ? t('pakete.daten.zeile', { einrichtung: liste('einrichtung'), nachweise: liste('nachweise') })
          : t('pakete.daten.nichts')}{' '}
        <Knopf art="link" onClick={aendern}>
          {t('pakete.reiter.aendern')}
        </Knopf>
      </p>
    </>
  );
}

export function PaketDatenBlock({ paket }: { paket: string }) {
  const [a, setA] = useState<PaketdatenAnsicht | null>(null);
  const [wahl, setWahl] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState('');
  const uebernimm = (x: PaketdatenAnsicht) => {
    setA(x);
    setWahl(new Set(x.bereiche.filter((b) => b.angehakt).map((b) => schluessel(b.art, b.bereich))));
  };
  useEffect(() => {
    paketeApi.paketdaten(paket).then(uebernimm, (e: Error) => setFehler(e.message));
  }, [paket]);
  if (!a) return fehler ? <p className="fehlertext">{fehler}</p> : null;

  const geaendert = a.bereiche.some((b) => b.angehakt !== wahl.has(schluessel(b.art, b.bereich)));
  // Wer speichert, gibt alle Haken in seinem Namen frei: Haken, die ich nicht verwalte, erst abwählen.
  const fremd = a.bereiche.some((b) => !b.darf && wahl.has(schluessel(b.art, b.bereich)));
  const umschalten = (k: string, an: boolean) =>
    setWahl((w) => {
      const n = new Set(w);
      if (an) n.add(k);
      else n.delete(k);
      return n;
    });
  const speichern = async (): Promise<KnopfErgebnis> => {
    const auswahl = {
      einrichtung: a.bereiche.filter((b) => b.art === 'einrichtung' && wahl.has(schluessel(b.art, b.bereich))).map((b) => b.bereich),
      nachweise: a.bereiche.filter((b) => b.art === 'nachweise' && wahl.has(schluessel(b.art, b.bereich))).map((b) => b.bereich),
    };
    uebernimm(await paketeApi.paketdatenSpeichern(paket, auswahl));
    return { art: 'gut', text: t('pakete.daten.gespeichert') };
  };
  const gruppe = (art: PaketdatenArt) => {
    const zeilen = a.bereiche.filter((b) => b.art === art);
    if (!zeilen.length) return null;
    return (
      <FeldGruppe
        beschriftung={t(art === 'einrichtung' ? 'pakete.daten.einrichtung' : 'pakete.daten.nachweise')}
        hilfe={art === 'einrichtung' ? 'pakete.recht.einrichtung' : 'pakete.recht.nachweise'}
        hinweis={art === 'nachweise' ? t('pakete.daten.nachweise.hinweis') : undefined}>
        {zeilen.map((b) => {
          const k = schluessel(b.art, b.bereich);
          const an = wahl.has(k);
          const hinweis =
            b.angehakt && !b.wirksam
              ? t('pakete.daten.wirkt-nicht', { person: a.benutzer ?? '–' })
              : !b.darf
                ? b.frisch
                  ? t('pakete.daten.nicht-erlaubt.gesamt')
                  : t('pakete.daten.nicht-erlaubt')
                : b.frisch
                  ? t('pakete.daten.frisch')
                  : undefined;
          return (
            <HakenFeld key={k} beschriftung={b.name} hinweis={hinweis}>
              {/* Abwählen geht immer; anhaken nur, wer den Bereich verwaltet. */}
              <input type="checkbox" checked={an} disabled={!b.darf && !an} onChange={(e) => umschalten(k, e.target.checked)} />
            </HakenFeld>
          );
        })}
      </FeldGruppe>
    );
  };
  return (
    <section aria-labelledby="paketdaten-titel" data-anker="pakete.paketdaten">
      <h2 className="h3" id="paketdaten-titel">
        {t('pakete.daten.titel')}
      </h2>
      <p className="leise klein">{t('pakete.daten.text')}</p>
      {gruppe('einrichtung')}
      {gruppe('nachweise')}
      <p className="klein">
        {a.benutzer && a.am ? t('pakete.daten.freigegeben', { person: a.benutzer, datum: datum(a.am) }) : t('pakete.daten.nichts')}
      </p>
      <div className="knoepfe">
        <Knopf art="haupt" gesperrt={!geaendert ? true : fremd ? t('pakete.daten.abwaehlen') : undefined} onClick={speichern}>
          {t('pakete.daten.speichern')}
        </Knopf>
      </div>
      {a.verlauf.length > 0 && (
        <details className="klein">
          <summary>{t('pakete.daten.verlauf')}</summary>
          <ul className="stapel">
            {a.verlauf.map((v) => (
              <li key={v.am}>
                {t('pakete.daten.verlauf.zeile', {
                  datum: datum(v.am),
                  von: v.von,
                  einrichtung: v.einrichtung.join(', ') || '–',
                  nachweise: v.nachweise.join(', ') || '–',
                })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
