import { useEffect, useState, type ReactNode } from 'react';
import { ReiterFlaeche, Reiter } from '../../bausteine';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { fragtPaketdatenAn } from '../../../../shared/src/paketdaten';
import { hatEinstellungen } from '../../../../shared/src/paketkern';
import { darfVerlassen, geheZu } from '../../ort';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { PaketAusprobieren } from '../PaketAusprobieren';
import { PaketDatenBlock } from '../PaketDaten';
import { PaketEinstellungen, vergissPaketEntwurf } from '../PaketEinstellungen';
import type { PaketeZustand } from '../paketeZustand';
import { PaketVerlauf } from '../PaketVerlauf';

/**
 * Register des Pakets (#1214, Baustein Reiter): Übersicht liest, Einstellungen ändern (#996); ein Warnsymbol, wenn
 * Einstellungen fehlen. Gleich aufgebaut bei allen Paketen – welche Reiter es gibt, ergibt sich aus dem Manifest.
 */
type PaketReiterArt = 'uebersicht' | 'einstellungen' | 'verlauf' | 'ausprobieren';
function PaketReiter({
  reiter,
  setze,
  noetig,
  reiterListe,
}: {
  reiter: PaketReiterArt;
  setze(r: PaketReiterArt): void;
  noetig: boolean;
  reiterListe: PaketReiterArt[];
}) {
  const text = (r: PaketReiterArt) =>
    r === 'einstellungen' ? (
      <>
        {t('werkbank.pakete.einstellungen')}
        {noetig && (
          <>
            {' '}
            <Symbol name="warnung" className="sym-warn" />
            <span className="sr">{t('werkbank.pakete.einstellungen-noetig-2')}</span>
          </>
        )}
      </>
    ) : r === 'verlauf' ? (
      t('pakete.verlauf.reiter')
    ) : r === 'ausprobieren' ? (
      t('pakete.probe.reiter')
    ) : (
      t('werkbank.pakete.uebersicht')
    );
  return (
    <Reiter
      id="paket"
      wert={reiter}
      setze={setze}
      beschriftung={t('werkbank.pakete.paket')}
      wahlen={reiterListe.map((r) => ({ wert: r, text: text(r) }))}
    />
  );
}
/**
 * Reiter eines installierten Pakets (#996): Übersicht immer, Einstellungen bei Feldern im Manifest oder Feldarten des
 * Kerns, Ausprobieren bei `code.ausprobieren` (#1004), Verlauf bei Paketen mit Läufer (#1003).
 */
function reiterVon(inst: InstalliertesPaket | null): PaketReiterArt[] {
  if (!inst) return [];
  return [
    'uebersicht',
    ...(hatEinstellungen(inst) || (!!inst.laeufer && fragtPaketdatenAn(inst.laeufer)) ? ['einstellungen' as const] : []),
    ...(inst.laeufer?.reiter?.ausprobieren ? ['ausprobieren' as const] : []),
    ...(inst.laeufer ? ['verlauf' as const] : []),
  ];
}
const REITER: readonly PaketReiterArt[] = ['uebersicht', 'einstellungen', 'ausprobieren', 'verlauf'];
/** Zwischen Einstellungen und Ausprobieren bleibt der Entwurf (#1004) – kein „Verlassen ohne Speichern?“. */
const mitEntwurf = (r: PaketReiterArt) => r === 'einstellungen' || r === 'ausprobieren';

/**
 * Welcher Reiter offen ist (`?reiter=` beim Öffnen), welche es gibt, Wechsel mit „Verlassen ohne Speichern?“ aus den
 * Einstellungen; `zu` springt in einen Reiter und dort zu einem Anker (z. B. „Ändern“ in der Übersicht).
 */
export function usePaketReiter(inst: InstalliertesPaket | null) {
  const [reiter, setReiter] = useState<PaketReiterArt>(
    () => REITER.find((r) => r === new URLSearchParams(location.search).get('reiter')) ?? 'uebersicht',
  );
  const liste = reiterVon(inst);
  const aktiv = liste.includes(reiter) ? reiter : 'uebersicht';
  const wechsel = (r: PaketReiterArt) => {
    if (mitEntwurf(aktiv) && mitEntwurf(r)) {
      setReiter(r);
      return;
    }
    void darfVerlassen().then((ok) => {
      if (!ok) return;
      if (inst) vergissPaketEntwurf(inst.id);
      setReiter(r);
    });
  };
  const zu = (r: PaketReiterArt, anker?: string) => {
    setReiter(r);
    if (anker) setTimeout(() => document.querySelector(`[data-anker="${anker}"]`)?.scrollIntoView({ block: 'center' }), 400);
  };
  return { reiter: aktiv, liste, wechsel, zu };
}

/** Reiter oben und alles außer der Übersicht (#996): die Übersicht steht in PaketDetail selbst. */
export function PaketReiterBlock({
  r,
  inst,
  z,
}: {
  r: ReturnType<typeof usePaketReiter>;
  inst: InstalliertesPaket | null;
  z: PaketeZustand;
}) {
  if (!inst || r.liste.length < 2) return null;
  return (
    <>
      <PaketReiter reiter={r.reiter} reiterListe={r.liste} noetig={!!inst.einstellungenNoetig} setze={r.wechsel} />
      {/* Einrichtung und Nachweise (#1054) mit eigener Freigabe (frische Anmeldung, hinterlegte Person) unter den Einstellungen. */}
      {r.reiter === 'einstellungen' && (
        <ReiterFlaeche id="paket" wert={r.reiter}>
          {hatEinstellungen(inst) && <PaketEinstellungen paket={inst} gespeichert={() => void z.laden()} />}
          {inst.laeufer && fragtPaketdatenAn(inst.laeufer) && <PaketDatenBlock paket={inst.id} />}
        </ReiterFlaeche>
      )}
      {r.reiter === 'verlauf' && (
        <ReiterFlaeche id="paket" wert={r.reiter}>
          <PaketVerlauf inst={inst} />
        </ReiterFlaeche>
      )}
      {r.reiter === 'ausprobieren' && (
        <ReiterFlaeche id="paket" wert={r.reiter}>
          <PaketAusprobieren inst={inst} zuEinstellungen={() => r.wechsel('einstellungen')} />
        </ReiterFlaeche>
      )}
    </>
  );
}
/** Inhalt unter dem Register – ohne Register (Paket ohne Einstellungen) ohne Fläche. */
export function MitFlaeche({ an, wert, children }: { an: boolean; wert: string; children: ReactNode }) {
  return an ? (
    <ReiterFlaeche id="paket" wert={wert}>
      {children}
    </ReiterFlaeche>
  ) : (
    <>{children}</>
  );
}

/**
 * Kurzanleitung (#1047) einmal direkt nach der Installation: im Ablauf der Paketseite gesetzt oder über ?neu=1 (Link,
 * Hochladen) – der Merker verschwindet gleich aus der Adresse, damit ein Neuladen ihn nicht wieder zeigt.
 */
export function useAnleitungNeu(): [boolean, (an: boolean) => void] {
  const [neu, setNeu] = useState(() => new URLSearchParams(location.search).has('neu'));
  useEffect(() => {
    if (new URLSearchParams(location.search).has('neu')) geheZu(location.pathname, true);
  }, []);
  return [neu, setNeu];
}
