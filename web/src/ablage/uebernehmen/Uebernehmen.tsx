import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { darfErstellen, kannAusPost, type Mappentyp, type Wert, type Werte } from '../../../../shared/src/model';
import { eingangsreihenfolge, gruppiere, nurHauptdokumente } from '../../../../shared/src/anlagen';
import type { Bezuege, MappeDetails } from '../../api/mappen';
import { Dreiteilung } from '../../bereiche';
import { useDaten } from '../../daten';
import { t } from '../../sprache';
import { BrueckeKontext } from '../bruecke';
import { useLeerseiten } from '../Leerseiten';
import { useBrueckeZustand } from './bruecke-zustand';
import { useErkannt, useKlassifizierung, useMarken, useVorschlagStart, useWoerter } from './erkennung';
import { DOKS_MAX } from './hilfen';
import { MitteDokumente, MitteKopf } from './Mitte';
import { usePostWege } from './post-wege';
import { Rechts } from './Rechts';
import { GelesenVorschau, NeuesDokument, QuellenWahl, useVerknuepfteDokumente, type NurGelesen } from './quellen';
import { NeuKopf } from './teile';
import { useFolge, useReihe, useWohin } from './wohin';

/**
 * Die Seite „Dokument übernehmen“ (#934) mit geladener Mappe: links die Ansichten, in der Mitte die Dokumente mit
 * Rahmen, rechts die Mappe. Laden und Speichern stehen in den Hooks daneben, die Teile der Seite in Mitte und Rechts.
 */
export function Uebernehmen({
  details,
  typ,
  sicht,
  links,
  neuLaden,
  dokumentWunsch,
}: {
  details: MappeDetails;
  typ: Mappentyp;
  sicht: string;
  links: ReactNode;
  neuLaden: () => Promise<void>;
  dokumentWunsch: string | null;
}) {
  const d = useDaten();
  const m = details.mappe;
  const post = typ.system === 'post';
  // Dokumente in der Mitte: bei Post alle untereinander, an einer Mappe das gewählte (sonst das neueste mit Text).
  const mitText = details.dokumente.filter((x) => x.ocr?.stand === 'fertig');
  const [dokId, setDokId] = useState(
    () => dokumentWunsch ?? [...mitText].sort((a, b) => b.erstellt.localeCompare(a.erstellt))[0]?.id ?? details.dokumente[0]?.id,
  );
  // „Aus Dokument ausfüllen“ an einer Mappe (#1494): auch Dokumente verknüpfter Mappen, oder eine neue Datei nur gelesen.
  const fremde = useVerknuepfteDokumente(details, typ, !post);
  const [gelesen, setGelesen] = useState<NurGelesen | null>(null);
  const alleDoks = useMemo(() => [...details.dokumente, ...fremde.flatMap((q) => q.dokumente)], [details.dokumente, fremde]);
  // Post: in der Reihenfolge, in der sie abgelegt wurden (Seite 1 zuerst) – „Ab hier abtrennen“ meint die folgenden.
  // Anlagen (#998) stehen eingeklappt hinter ihrem Hauptdokument; Erkennung, Klassifizieren und KI lesen sie nie.
  // Eingangsreihenfolge (#999): bei einer E-Mail so, wie die Anhänge in ihr stehen.
  // Gemerkt (#1255): Ein neues Array je Darstellung ließ die Rahmen bei jedem Tastendruck neu suchen.
  const doks = useMemo(
    () =>
      post
        ? gruppiere(eingangsreihenfolge(details.dokumente)).flatMap((g) => [g.haupt, ...g.anlagen])
        : gelesen
          ? []
          : alleDoks.filter((x) => x.id === dokId),
    [post, details.dokumente, alleDoks, dokId, gelesen],
  );
  const erkennDoks = nurHauptdokumente(doks)
    .filter((x) => x.ocr?.stand === 'fertig')
    .slice(0, DOKS_MAX);
  // Original-E-Mail (#999): geht mit dem Dokument, an dem sie hängt (Vorgabe). Sie enthält alle Anhänge der Mail –
  // abgewählt bleibt sie als eigenes Dokument in der Post.
  const [eml, setEml] = useState(true);
  const mitDoks = useMemo(() => details.dokumente.filter((x) => eml || !x.originalEmail).map((x) => x.id), [details.dokumente, eml]);
  const emlAus = eml ? {} : { originalEmail: false as const };
  // Leerseiten (#997): nur bei Post – die Wahl je Seite gilt sofort, gelöscht wird erst beim Übernehmen.
  const leer = useLeerseiten(doks);
  const erkennKey = erkennDoks.map((x) => x.id).join(',');

  // „Wohin gehört das?“ (nur Post): Typen mit „Kann aus Post angelegt werden“, in denen ich anlegen darf (#937).
  const ziele = useMemo(() => d.typen.filter((x) => kannAusPost(x) && darfErstellen(x)), [d.typen]);
  const { klass, zielId, setZielId, setGewaehlt } = useKlassifizierung(post, typ, erkennKey, ziele);
  const zielTyp = zielId ? d.typ(zielId) : undefined;
  const erkanntDok = useErkannt(zielTyp, erkennKey, post, m.id);
  // Nur gelesen (#1494): Die Vorschläge der Datei stehen rechts, ohne Rahmen im Dokument.
  const erkannt = useMemo(
    () => (gelesen ? { typId: typ.id, vorschlaege: gelesen.r, abgleich: null } : erkanntDok),
    [gelesen, erkanntDok, typ.id],
  );
  const { woerter, dokKey } = useWoerter(doks);
  const vorschlagStart = useVorschlagStart(zielTyp, erkannt, post, m.werte);
  const marken = useMarken(zielTyp, vorschlagStart, erkannt, woerter, doks);
  const { bruecke, hervor, setHervor, meldung, setMeldung, insAktive } = useBrueckeZustand(zielTyp, erkannt, marken);
  const wege = usePostWege({ details, typ, sicht, doks, mitDoks, emlAus, neuLaden, setMeldung });
  const wohin = useWohin(details, post, erkennKey);
  const folge = useFolge(post, doks, dokKey, zielId, ziele);
  const reihe = useReihe(post, m.id);

  const kopf = useCallback(
    (werte: Werte, bek: Bezuege) => (zielTyp ? <NeuKopf typ={zielTyp} werte={werte} bekannt={bek} /> : null),
    [zielTyp],
  );
  const zuordnen = useMemo(() => {
    const reg = zielTyp?.register.find((r) => r.art === 'dokumente')?.key;
    return {
      post: m.id,
      register: reg,
      dokumente: mitDoks,
      kopieren: false,
      vorschlag: {} as Record<string, Wert>,
      ...(eml ? {} : { originalEmail: false as const }),
    };
  }, [m.id, mitDoks, zielTyp, eml]);
  // Original herunterladen, wenn es sich nicht anzeigen lässt (#1211): mit Exportrecht, ohne Pflicht-Stempel.
  const herunterladen = details.exportierbar !== false && typ.stempel?.modus !== 'pflicht';

  return (
    <BrueckeKontext.Provider value={bruecke}>
      <Dreiteilung ort="uebernehmen" ebene="uebernehmen" offen={m.id}>
        {links}
        <section className="spalte liste ue-mitte" aria-label={t('ablage.uebernehmen.dokument')} data-anker="uebernehmen.dokument">
          <MitteKopf
            post={post}
            m={m}
            sicht={sicht}
            reihe={reihe}
            wahl={
              <>
                <QuellenWahl
                  eigene={mitText}
                  fremde={fremde}
                  dokId={gelesen ? undefined : dokId}
                  setDokId={(id) => {
                    setGelesen(null);
                    setDokId(id);
                  }}
                />
                <NeuesDokument details={details} typ={typ} neuLaden={neuLaden} gespeichert={setDokId} gelesen={setGelesen} />
              </>
            }
          />
          {gelesen && <GelesenVorschau x={gelesen} />}
          {!post && !gelesen && !doks.length && <p className="leise">{t('ablage.uebernehmen.quelle-hinweis')}</p>}
          <MitteDokumente
            post={post}
            doks={doks}
            meldung={meldung}
            blatt={{ woerter, marken, hervor, setHervor, insAktive, leer, herunterladen }}
            folge={folge}
            eml={eml}
            setEml={setEml}
            abtrennen={wege.abtrennen}
            hochladen={wege.hochladen}
          />
        </section>

        <section className="spalte mappe ue-rechts" aria-label={t('ablage.ablage.mappe')} data-anker="mappe">
          <Rechts
            details={details}
            typ={typ}
            sicht={sicht}
            neuLaden={neuLaden}
            wohin={wohin}
            ziele={ziele}
            zielTyp={zielTyp}
            klass={klass}
            typWaehlen={(x) => {
              setGewaehlt(true);
              setZielId(x);
            }}
            erkannt={erkannt}
            vorschlagStart={vorschlagStart}
            zuordnen={zuordnen}
            kopf={kopf}
            inVorhandene={wege.inVorhandene}
            ohneMappe={wege.ohneMappe}
          />
        </section>
      </Dreiteilung>
    </BrueckeKontext.Provider>
  );
}
