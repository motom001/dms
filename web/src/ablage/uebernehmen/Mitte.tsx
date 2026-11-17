import { useState } from 'react';
import { typName } from '../../../../shared/src/beschriftung';
import type { Dokument, Mappe } from '../../../../shared/src/model';
import type { Leerseiten } from '../../../../shared/src/leerseiten';
import { Feld, Knopf } from '../../bausteine';
import { useDaten } from '../../daten';
import { Hilfe } from '../../Hilfe';
import { geheZu, Link } from '../../ort';
import { titelOder } from '../../seiten';
import { t, tn } from '../../sprache';
import { Symbol } from '../../Symbol';
import { AnlageMarke, anlageZeilentext, OriginalEmailWahl } from '../Anlagen';
import type { Marke, Nutzlast } from '../bruecke';
import type { UeMeldung } from './bruecke-zustand';
import { DokumentBlatt } from './DokumentBlatt';
import type { Woerter } from './hilfen';
import { Ablageflaeche, PostKopf } from './teile';
import type { Folge, useReihe } from './wohin';

/** Was ein Dokument in der Mitte braucht: Wörter, Rahmen, Hervorhebung, Leerseiten und den Weg ins Formular. */
export interface BlattLage {
  woerter: Record<string, Woerter | 'keine'>;
  marken: Marke[];
  hervor: string | null;
  setHervor(k: string | null): void;
  insAktive(n: Nutzlast, eigenesFeld?: string): void;
  leer: { von(x: Dokument): Leerseiten | null; setze(id: string, l: Leerseiten | null): void };
  herunterladen: boolean;
}

/** Kopf der Mitte: bei Post Titel und Blättern, an einer Mappe „Zurück zur Mappe“ und die Wahl des Dokuments. */
export function MitteKopf({
  post,
  m,
  sicht,
  reihe,
  mitText,
  dokId,
  setDokId,
}: {
  post: boolean;
  m: Mappe;
  sicht: string;
  reihe: ReturnType<typeof useReihe>;
  mitText: Dokument[];
  dokId: string | undefined;
  setDokId(id: string): void;
}) {
  const { pos, np } = reihe;
  const blaettern = (nach: number) => (reihe.reihe && np ? () => geheZu(`/ablage/${np}/${reihe.reihe![nach]}/uebernehmen`) : undefined);
  return (
    <div className="ue-kopf">
      {post ? (
        <PostKopf
          titel={titelOder(m.titel)}
          alsPost={`/ablage/${sicht}/${m.id}?als=post`}
          pos={pos}
          anzahl={reihe.reihe?.length ?? 0}
          vorige={blaettern(pos - 1)}
          naechste={blaettern(pos + 1)}
        />
      ) : (
        <>
          <Link to={`/ablage/${sicht}/${m.id}`} className="verweis ue-zurueck">
            <Symbol name="pfeil-links" /> {t('ablage.uebernehmen.zurueck-zur-mappe')}
          </Link>
          {mitText.length > 1 && (
            <div className="klein ue-dokwahl">
              <Feld beschriftung={t('ablage.uebernehmen.dokument')} beschriftungVerbergen>
                <select value={dokId} onChange={(e) => setDokId(e.target.value)}>
                  {mitText.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Feld>
            </div>
          )}
          <Hilfe ort="post.zuordnen" />
        </>
      )}
    </div>
  );
}

/** Die Dokumente in der Mitte: Anlagen eingeklappt, sonst das Blatt mit „Passt eher zu …“ und „Ab hier abtrennen“. */
export function MitteDokumente({
  post,
  doks,
  meldung,
  blatt,
  folge,
  eml,
  setEml,
  abtrennen,
  hochladen,
}: {
  post: boolean;
  doks: Dokument[];
  meldung: UeMeldung;
  blatt: BlattLage;
  folge: Folge;
  eml: boolean;
  setEml(an: boolean): void;
  abtrennen(ab: number): Promise<void>;
  hochladen(f: File[]): Promise<void>;
}) {
  const [offeneAnlagen, setOffeneAnlagen] = useState<Set<string>>(new Set());
  const dokumentBlatt = (x: Dokument, marken: Marke[]) => (
    <DokumentBlatt
      x={x}
      w={blatt.woerter[x.id]}
      marken={marken}
      hervor={blatt.hervor}
      setHervor={blatt.setHervor}
      insAktive={blatt.insAktive}
      leer={post ? blatt.leer.von(x) : null}
      setzeLeer={(l) => blatt.leer.setze(x.id, l)}
      herunterladen={blatt.herunterladen}
    />
  );
  return (
    <>
      <p className={`ue-meldung klein ${meldung?.art ?? ''}`} role="status" aria-live="polite">
        {meldung?.text ?? ''}
      </p>
      {!doks.length && <p className="leise">{t('ablage.uebernehmen.keine-dokumente')}</p>}
      {doks.map((x, i) =>
        x.anlageZu ? (
          // Anlage (#998): eingeklappt „Anlage 1 · HU/AU-Protokoll · 2 Seiten“; ein Klick zeigt sie.
          <div key={x.id} className="ue-anlage">
            <p className="ue-anlage-kopf">
              <Knopf
                art="link"
                aria-expanded={offeneAnlagen.has(x.id)}
                onClick={() =>
                  setOffeneAnlagen((o) => {
                    const n = new Set(o);
                    if (n.has(x.id)) n.delete(x.id);
                    else n.add(x.id);
                    return n;
                  })
                }>
                {anlageZeilentext(x)}
              </Knopf>
              <AnlageMarke d={x} /> <span className="leise klein">{t('ablage.anlagen.nicht-erkannt')}</span>
            </p>
            {post && x.originalEmail && <OriginalEmailWahl emails={[x]} an={eml} setze={setEml} wie="uebernehmen" />}
            {offeneAnlagen.has(x.id) && dokumentBlatt(x, [])}
          </div>
        ) : (
          <div key={x.id}>
            {i > 0 && folge[x.id] && <PasstEher x={x} folge={folge[x.id]} abtrennen={() => abtrennen(i)} />}
            {dokumentBlatt(
              x,
              blatt.marken.filter((k) => k.dokId === x.id),
            )}
          </div>
        ),
      )}
      {post && <Ablageflaeche hochladen={(f) => void hochladen(f)} />}
    </>
  );
}

/** „Passt eher zu …“ über einem Folgedokument, mit „Ab hier abtrennen“. */
function PasstEher({ x, folge, abtrennen }: { x: Dokument; folge: Folge[string]; abtrennen(): Promise<void> }) {
  const d = useDaten();
  return (
    <div className="hinweis warn ue-passt" role="note">
      <p>
        {folge.mappe
          ? tn('ablage.uebernehmen.passt-eher-mappe', {
              name: x.name,
              typ: d.typ(folge.mappe.typId) ? typName(d.typ(folge.mappe.typId)!) : '',
              link: (
                <Link to={`/ablage/${folge.mappe.typId}/${folge.mappe.id}`} className="verweis">
                  {titelOder(folge.mappe.titel)}
                </Link>
              ),
            })
          : t('ablage.uebernehmen.passt-eher-typ', {
              name: x.name,
              typ: d.typ(folge.typId) ? typName(d.typ(folge.typId)!) : '',
            })}
      </p>
      <Knopf groesse="klein" onClick={() => abtrennen()}>
        {t('ablage.uebernehmen.ab-hier-abtrennen')}
      </Knopf>
    </div>
  );
}
