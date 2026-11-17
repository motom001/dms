import type { ReactNode } from 'react';
import { typName } from '../../../../shared/src/beschriftung';
import type { Klassifizierung } from '../../../../shared/src/klassifizierung';
import type { Mappentyp, Werte } from '../../../../shared/src/model';
import type { Bezuege, MappeDetails } from '../../api/mappen';
import type { TypVorschlaege } from '../../api/werkbank';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { MappeAnsicht, NeueMappe, type ZuordnenNachher } from '../MappeFormular';
import { AufloesungHinweis } from '../Post';
import { NeueMappeWahl, NurErledigen, VorhandeneMappeWahl, WohinGehoert, ZielLeiste } from '../WohinGehoert';
import type { Erkannt } from './erkennung';
import { DoppeltWarnung } from './teile';
import type { useWohin } from './wohin';

/** Was die rechte Spalte zeigt: die Mappe, bei Post „Wohin gehört das?“ und darunter die neue oder gewählte Mappe. */
export interface RechtsLage {
  details: MappeDetails;
  typ: Mappentyp;
  sicht: string;
  neuLaden: () => Promise<void>;
  wohin: ReturnType<typeof useWohin>;
  ziele: Mappentyp[];
  zielTyp: Mappentyp | undefined;
  klass: (Klassifizierung & { bezuege: Bezuege }) | null | undefined;
  typWaehlen(id: string): void;
  erkannt: Erkannt | null;
  vorschlagStart: TypVorschlaege | undefined;
  zuordnen: ZuordnenNachher;
  kopf(werte: Werte, bekannt: Bezuege): ReactNode;
  inVorhandene(ziel: { id: string; typId: string; titel: string }): Promise<void>;
  ohneMappe(): Promise<void>;
}

/** Rechte Spalte der Seite „Dokument übernehmen“ (#934, #1217). */
export function Rechts(l: RechtsLage) {
  const { details, typ, wohin, zielTyp } = l;
  const m = details.mappe;
  const post = typ.system === 'post';
  const { ziel } = wohin;
  const ohneRegister = post && !!zielTyp && details.dokumente.length > 0 && !zielTyp.register.some((r) => r.art === 'dokumente');
  const doppelt = (l.erkannt?.abgleich?.doppelt ?? []).filter((x) => x.mappeId !== m.id);
  return (
    <>
      {post && <AufloesungHinweis postId={m.id} />}
      {post && (
        <WohinGehoert ziel={ziel} setZiel={wohin.setZiel}>
          {ziel === 'neu' && <NeueMappeWahl ziele={l.ziele} zielTyp={zielTyp} klass={l.klass} waehle={l.typWaehlen} />}
          {ziel === 'vorhanden' && (
            <VorhandeneMappeWahl
              ziele={wohin.mappenZiele}
              vorschlaege={wohin.mappenVorschlaege}
              wahl={wohin.vorhandenId}
              setze={wohin.setVorhandenId}
              bekannt={wohin.bekannt}
              merke={wohin.merke}
            />
          )}
          {ziel === 'erledigen' && <NurErledigen />}
        </WohinGehoert>
      )}
      {(!post || ziel === 'neu') && doppelt.length > 0 && zielTyp && (
        <DoppeltWarnung liste={doppelt} bezuege={l.erkannt!.abgleich!.bezuege} legen={post ? wohin.dorthin : undefined} />
      )}
      {ziel === 'neu' && ohneRegister && (
        <div className="hinweis warn">
          <p>{t('ablage.uebernehmen.ohne-dokumentenregister', { typ: typName(zielTyp!) })}</p>
        </div>
      )}
      <RechtsMappe {...l} />
    </>
  );
}

/** Unten rechts: die Mappe selbst (an einer Mappe), die neue Mappe oder die Leiste für die gewählte Wahl (Post). */
function RechtsMappe({
  details,
  typ,
  sicht,
  neuLaden,
  wohin,
  zielTyp,
  vorschlagStart,
  zuordnen,
  kopf,
  inVorhandene,
  ohneMappe,
}: RechtsLage) {
  const m = details.mappe;
  const { ziel, vorhandenZiel } = wohin;
  if (typ.system !== 'post')
    return <MappeAnsicht key={m.id} typ={typ} details={details} sicht={sicht} neuLaden={neuLaden} vorschlagStart={vorschlagStart} />;
  if (ziel === 'vorhanden')
    return (
      <ZielLeiste
        text={
          vorhandenZiel
            ? t('ablage.uebernehmen.dorthin-legen', { titel: titelOder(vorhandenZiel.titel) })
            : t('ablage.uebernehmen.zur-mappe-legen')
        }
        tu={vorhandenZiel ? () => inVorhandene(vorhandenZiel) : undefined}
      />
    );
  if (ziel === 'erledigen') return <ZielLeiste text={t('ablage.post.erledigt')} tu={ohneMappe} />;
  if (zielTyp)
    return <NeueMappe key={zielTyp.id} typ={zielTyp} sicht={sicht} zuordnen={zuordnen} vorschlagStart={vorschlagStart} kopf={kopf} />;
  return (
    <>
      <p className="leise ue-leer">{t('ablage.uebernehmen.erst-typ-waehlen')}</p>
      <ZielLeiste text={t('ablage.mappeformular.mappe-anlegen')} />
    </>
  );
}
