import { useEffect, useState, type ReactNode } from 'react';
import { feldLabel, typName } from '../../../../shared/src/beschriftung';
import { istVersendet, type Mappentyp, type Werte } from '../../../../shared/src/model';
import { mappenApi, type Bezuege } from '../../api/mappen';
import type { TypVorschlaege } from '../../api/werkbank';
import { t } from '../../sprache';
import { standardRoh, zuRoh, type RohWerte } from '../../werte';
import { Formular } from './Formular';
import { belegeVor, type ZuordnenNachher } from './werte';

/**
 * Lässt sich die Post beim Speichern auflösen (#936)? Nicht mit „Kopie in der Post behalten“ und nicht bei versendeten
 * E-Mails (dann wie bisher zuordnen, ohne Hinweis); ohne Recht zum Löschen bleibt sie zugeordnet – mit Hinweis.
 */
function useAufloesung(z: ZuordnenNachher | undefined) {
  const [x, setX] = useState<{ aufloesen?: boolean; gesperrt: boolean; dokumente: number } | null>(null);
  useEffect(() => {
    // Mit „Kopie in der Post behalten“ wird nicht aufgelöst (#936) – auch wenn der Haken erst später gesetzt wird (#934).
    if (!z || z.kopieren) {
      setX(null);
      return;
    }
    let aktuell = true;
    mappenApi.mappe(z.post).then(
      (p) => {
        if (!aktuell) return;
        if (istVersendet(p.mappe.werte)) {
          setX({ gesperrt: false, dokumente: p.dokumente.length });
          return;
        }
        const gesperrt = p.rechte?.D === false || p.loeschbar?.ok === false;
        setX({ aufloesen: !gesperrt, gesperrt, dokumente: p.dokumente.length });
      },
      () => {},
    );
    return () => {
      aktuell = false;
    };
  }, [z?.post, z?.kopieren]); // eslint-disable-line react-hooks/exhaustive-deps -- nur bei anderer Post neu laden
  return x;
}

export function NeueMappe({
  typ,
  verweis,
  sicht,
  zuordnen,
  vorbelegen,
  vorschlagStart,
  kopf,
}: {
  typ: Mappentyp;
  verweis?: string;
  sicht: string;
  zuordnen?: ZuordnenNachher;
  vorbelegen?: string;
  /** Seite „Dokument übernehmen“ (#934): Vorschläge aus dem Dokument und ein eigener Kopf (Titel, wie er nach dem Speichern heißt). */
  vorschlagStart?: TypVorschlaege;
  kopf?: (werte: Werte, bekannt: Bezuege) => ReactNode;
}) {
  const { start, vorbelegt } = startWerte(typ, verweis, vorbelegen, zuordnen);
  const aufloesung = useAufloesung(zuordnen);
  const mitDoks = zuordnen?.dokumente.length
    ? t('ablage.mappeformular.ihre-dokumente-kommen-hierher', { anzahl: zuordnen.dokumente.length })
    : '';
  // Abgetrennt (#936): Nicht gewählte Dokumente kommen als neue Post nach „Neue Post“.
  const uebrig = aufloesung?.aufloesen && zuordnen ? Math.max(0, aufloesung.dokumente - zuordnen.dokumente.length) : 0;
  // Auf der Seite „Dokument übernehmen“ (#934) zeigt der Kopf die Mappe; was mit der Post geschieht, sagt die Speicherleiste.
  if (kopf)
    return (
      <Formular
        typ={typ}
        start={start}
        sicht={sicht}
        zuordnen={zuordnen && { ...zuordnen, aufloesen: aufloesung?.aufloesen }}
        vorschlagStart={vorschlagStart}
        kopf={kopf}
      />
    );
  return (
    <>
      <div className="mappenkopf">
        <p className="ueber">{typName(typ)}</p>
        <h1>{t('ablage.mappeformular.neue-mappe')}</h1>
      </div>
      {zuordnen && (
        <div className="hinweis info">
          <p>
            {aufloesung?.aufloesen
              ? t('ablage.mappeformular.aus-der-post-wird', { wert: mitDoks })
              : t('ablage.mappeformular.nach-dem-speichern-wird', { wert: mitDoks })}
            {uebrig > 0 && <> {t('ablage.mappeformular.uebrige-als-neue-post', { anzahl: uebrig })}</>}
            {vorbelegt.length > 0 && <> {t('ablage.mappeformular.als-vorschlag-aus-der', { vorbelegt: vorbelegt.join(', ') })}</>}
          </p>
        </div>
      )}
      <Formular typ={typ} start={start} sicht={sicht} zuordnen={zuordnen && { ...zuordnen, aufloesen: aufloesung?.aufloesen }} />
    </>
  );
}

/**
 * Startwerte einer neuen Mappe: Vorgaben des Typs, ?vorbelegen (Auswahlfilter, #172), Vorschläge aus der Post und der
 * Erkennung (#336) und ?verweis=feldKey:mappeId. `vorbelegt`: Beschriftungen der Felder mit einem Vorschlag aus der Post.
 */
function startWerte(typ: Mappentyp, verweis: string | undefined, vorbelegen: string | undefined, zuordnen: ZuordnenNachher | undefined) {
  const start = standardRoh(typ);
  // ?vorbelegen={…} (#172): was sich aus dem Auswahlfilter eines Referenzfelds ergibt, z. B. Art = Arzt.
  try {
    belegeVor(typ, start, vorbelegen ? (JSON.parse(vorbelegen) as Record<string, unknown>) : {});
  } catch {
    /* ohne Vorbelegung */
  }
  // Vorschläge aus der Post (Betreff, Datum) und aus der Erkennung (#336: Betrag, Nummern, Verweis auf den Absender).
  const vorbelegt = postVorschlaege(typ, start, zuordnen);
  // ?verweis=feldKey:mappeId belegt ein Referenzfeld vor („+ Vertrag anlegen“ beim Vertragspartner).
  if (verweis) {
    const [k, id] = verweis.split(':');
    const f = typ.felder.find((x) => x.key === k && x.typ === 'referenz');
    if (f && id) start[f.key] = f.mehrfach ? [id] : id;
  }
  return { start, vorbelegt };
}

/** Vorschläge aus der Post in die Startwerte – nur, was zur Feldart passt; gibt die Beschriftungen dieser Felder zurück. */
function postVorschlaege(typ: Mappentyp, start: RohWerte, zuordnen: ZuordnenNachher | undefined): string[] {
  const vorbelegt: string[] = [];
  for (const [k, v] of Object.entries(zuordnen?.vorschlag ?? {})) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || f.typ === 'passwort' || v == null) continue;
    if ((f.typ === 'text' || f.typ === 'langtext' || f.typ === 'datum' || f.typ === 'referenz') && typeof v !== 'string') continue;
    if (f.typ === 'betrag' && (typeof v !== 'object' || Array.isArray(v) || typeof (v as { betrag?: unknown }).betrag !== 'number'))
      continue;
    start[k] = zuRoh(f, v);
    vorbelegt.push(feldLabel(f));
  }
  return vorbelegt;
}
