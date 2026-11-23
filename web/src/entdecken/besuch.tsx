import { useEffect, useRef, useState } from 'react';
import type { BesuchSeite, EntdeckenStand } from '../../../shared/src/entdecken';
import { kontoApi } from '../api/konto';
import { Knopf } from '../bausteine';
import { Symbol } from '../Symbol';
import { t } from '../sprache';
import { ladeEntdecken, starteRundgang, useAktiverRundgang, useEntdecken } from './stand';

/**
 * Rundgänge beim ersten Besuch einer Seite (#1512, #1522, #1523): Die Werkbank, die Ablage und eine geöffnete Mappe
 * haben je einen Rundgang, der beim ersten Besuch von selbst startet (`start: erster_besuch`, der Server liefert in
 * `beimBesuch`, was noch aussteht). Eine geöffnete Mappe gehört zur Ablage: Dort kommt zuerst der Rundgang der Ablage.
 *
 * Ruhe geht vor (Usability-Grundsatz 2.11): nie in Vertretung, je Rundgang höchstens einmal je Laden der Seite, nie
 * während ein anderer läuft – und nach dem Ende eines Rundgangs erst, wenn die Person selbst eine andere Seite
 * aufruft. Rundgänge folgen also nicht direkt aufeinander.
 */

/** Welche Besuchsseiten der Pfad zeigt, in der Reihenfolge, in der ihre Rundgänge Vorrang haben. */
export function besuchSeiten(pfad: string): BesuchSeite[] {
  const teile = pfad.split('/').filter(Boolean);
  if (teile[0] === 'werkbank') return ['werkbank'];
  if (teile[0] === 'profil') return ['konto'];
  if (teile[0] !== 'ablage') return [];
  return MAPPE_ID.test(teile[2] ?? '') ? ['ablage', 'mappe'] : ['ablage'];
}
const MAPPE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Der Rundgang, der jetzt starten soll: erst der von der ersten Anmeldung, dann der erste ausstehende je Seite. */
export function naechsterRundgang(stand: EntdeckenStand, seiten: readonly BesuchSeite[], versucht: ReadonlySet<string>): string | null {
  if (stand.starten && seiten.includes('ablage') && !versucht.has(stand.starten)) return stand.starten;
  for (const seite of seiten) {
    const b = (stand.beimBesuch ?? []).find((x) => x.seite === seite && !x.leise && !versucht.has(x.schluessel));
    if (b) return b.schluessel;
  }
  return null;
}

/** Nach dem Ende eines Rundgangs so lange warten, bis ein Rücksprung des Rundgangs selbst durch ist. */
const RUHE_MS = 1200;

export function useRundgangBeimBesuch(o: { pfad: string; aus: boolean }) {
  const { stand } = useEntdecken();
  const aktiv = useAktiverRundgang();
  const versucht = useRef(new Set<string>());
  // Pfad, auf dem die Person nach dem letzten Rundgang stand: Dort startet keiner mehr von selbst.
  const [ruhePfad, setRuhePfad] = useState<string | null>(null);
  const lief = useRef(false);
  useEffect(() => {
    if (aktiv) {
      lief.current = true;
      return;
    }
    if (!lief.current) return;
    const z = setTimeout(() => setRuhePfad(location.pathname), RUHE_MS);
    return () => clearTimeout(z);
  }, [aktiv]);
  useEffect(() => {
    if (o.aus || aktiv || !stand || (lief.current && (ruhePfad === null || ruhePfad === o.pfad))) return;
    const r = naechsterRundgang(stand, besuchSeiten(o.pfad), versucht.current);
    if (!r) return;
    versucht.current.add(r);
    starteRundgang(r, true);
  }, [stand, aktiv, o.aus, o.pfad, ruhePfad]);
}

/**
 * Stiller Hinweis auf einen Rundgang dieser Seite (`leise: true`, z. B. Mein Konto, #1523): ein Satz in normaler
 * Schrift, der Satz selbst startet den Rundgang, × blendet ihn aus (gilt als gesehen). Kein Rahmen, keine Farbe,
 * keine Bewegung (Usability-Grundsatz 2.11).
 */
export function StillerRundgangHinweis({ seite }: { seite: BesuchSeite }) {
  const { stand } = useEntdecken();
  const aktiv = useAktiverRundgang();
  const [weg, setWeg] = useState<string | null>(null);
  const b = stand?.beimBesuch?.find((x) => x.seite === seite && x.leise && x.schluessel !== weg);
  const r = b && stand?.rundgaenge.find((x) => x.schluessel === b.schluessel);
  if (!b || !r || aktiv) return null;
  return (
    <p className="stiller-hinweis">
      {/* Wie ein Tipp auf der Startseite: der Satz ist der Link (TippEintrag in Entdecken.tsx). */}
      <a
        href="/entdecken"
        className="tipp-satz"
        onClick={(e) => {
          e.preventDefault();
          starteRundgang(r.schluessel);
        }}>
        {t('entdecken.hinweis.rundgang')}
      </a>
      <Knopf
        art="eigen"
        className="weg"
        nurSymbol={t('entdecken.hinweis.ausblenden')}
        onClick={async () => {
          setWeg(r.schluessel);
          await kontoApi.rundgangMerken(r.schluessel, 'gesehen').catch(() => {});
          await ladeEntdecken();
        }}>
        <Symbol name="schliessen" />
      </Knopf>
    </p>
  );
}
