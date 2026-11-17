import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { auswahlText, istVersendet, POST_STAND, type Mappentyp } from '../../../shared/src/model';
import { mappenApi, type MappeDetails } from '../api/mappen';
import { Dreiteilung } from '../bereiche';
import { useDaten } from '../daten';
import { geheZu } from '../ort';
import { t } from '../sprache';
import type { Laden } from './uebernehmen/hilfen';
import { Uebernehmen } from './uebernehmen/Uebernehmen';

/**
 * Seite „Dokument übernehmen“ (#934): eine Seite für neue Post aus allen Eingängen und für „Aus Dokument ausfüllen“ an
 * einer Mappe. Links die gewohnten Ansichten, in der Mitte das Dokument, rechts die Mappe wie überall sonst.
 *
 * /ablage/:sicht/:postId/uebernehmen          Post: „Wohin gehört das?“ wählt den Mappentyp, daraus wird beim Speichern
 *                                               die Mappe (Post auflösen, #936), danach die nächste Post
 * /ablage/:sicht/:mappeId/uebernehmen?dokument=…  „Aus Dokument ausfüllen“: diese Mappe rechts, ihr Dokument in der Mitte
 *
 * Erkannte Werte bekommen nummerierte, farbige Rahmen an der Fundstelle; Rahmen und Feld leuchten gemeinsam auf.
 * Werte lassen sich ins Feld ziehen oder per Feld wählen → Rahmen anklicken übernehmen; markierter Text (Textebene
 * bzw. Texterkennung) geht in das zuletzt gewählte Feld. Die mobile Fassung kommt im zweiten Schritt – bis dahin steht
 * alles in einer Spalte untereinander.
 *
 * Aufgeteilt (#1279): Teile, Hooks und Rahmen stehen unter uebernehmen/.
 */

export function UebernehmenSeite({ id, sicht, links, suche }: { id: string; sicht: string; links: ReactNode; suche: URLSearchParams }) {
  const d = useDaten();
  const [details, setDetails] = useState<Laden<MappeDetails>>(null);
  const laden = useCallback(async () => {
    try {
      setDetails(await mappenApi.mappe(id));
    } catch {
      setDetails('fehlt');
    }
  }, [id]);
  useEffect(() => {
    void laden();
  }, [laden]);
  // Solange die Texterkennung läuft, kommt der Text nach – dann noch einmal laden (Vorschläge und Rahmen).
  const wartet = details && details !== 'fehlt' && details.dokumente.some((x) => x.ocr?.stand === 'wartet' || x.ocr?.stand === 'laeuft');
  useEffect(() => {
    if (!wartet) return;
    const z = window.setInterval(() => void laden(), 4000);
    return () => window.clearInterval(z);
  }, [wartet, laden]);

  const typ = details && details !== 'fehlt' ? d.typ(details.mappe.typId) : undefined;
  const post = typ?.system === 'post';
  // Versendete E-Mails und Post, die man nicht bearbeiten darf, zeigt die gewohnte Mappe.
  const nichtHier = !!details && details !== 'fehlt' && post && (istVersendet(details.mappe.werte) || details.rechte?.U === false);
  useEffect(() => {
    if (nichtHier) geheZu(`/ablage/${sicht}/${id}?als=post`, true);
  }, [nichtHier, sicht, id]);

  let mitte: ReactNode;
  let rechts: ReactNode;
  if (details === null || nichtHier) {
    mitte = <p className="leise">{t('ablage.uebernehmen.lade')}</p>;
    rechts = null;
  } else if (details === 'fehlt' || !typ) {
    mitte = (
      <div className="leer">
        <p>{t('ablage.uebernehmen.gibt-es-nicht')}</p>
      </div>
    );
    rechts = null;
  } else
    return (
      <Uebernehmen
        key={id}
        details={details}
        typ={typ}
        sicht={sicht}
        links={links}
        neuLaden={laden}
        dokumentWunsch={suche.get('dokument')}
      />
    );
  return (
    <Dreiteilung ort="uebernehmen" ebene="uebernehmen" offen={id}>
      {links}
      <section className="spalte liste ue-mitte" aria-label={t('ablage.uebernehmen.dokument')}>
        {mitte}
      </section>
      <section className="spalte mappe" aria-label={t('ablage.ablage.mappe')}>
        {rechts}
      </section>
    </Dreiteilung>
  );
}

/** Für Ablage.tsx: Post mit Stand „Neu“ öffnet diese Seite (alle Eingänge, #934) – außer man will die Post selbst sehen. */
export function oeffnetUebernehmen(details: MappeDetails, typ: Mappentyp | undefined): boolean {
  const w = details.mappe.werte;
  return (
    typ?.system === 'post' && (auswahlText(w.stand) || POST_STAND.neu) === POST_STAND.neu && !istVersendet(w) && details.rechte?.U !== false
  );
}
