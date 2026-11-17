/** Rechte Spalte der Ablage (#1279 eigene Datei): neue Mappe, Weitergeben, Papierkorb, eine Mappe oder der Platzhalter. */
import type { ReactNode } from 'react';
import { sichtName, typName } from '../../../../shared/src/beschriftung';
import { darfErstellen, type Mappentyp } from '../../../../shared/src/model';
import type { Sicht } from '../../../../shared/src/sichten';
import { istTeiltyp, uebergeordneterTyp } from '../../../../shared/src/teile';
import { useDaten } from '../../daten';
import { AufgabenWeitergeben } from '../../profil/Abwesenheit';
import { t } from '../../sprache';
import { NeueMappe } from '../MappeFormular';
import { PapierkorbDetail } from '../Papierkorb';
import { MappeLader } from '../liste/MappeLader';
import { zuordnenAus } from '../liste/hilfen';

type RechtsProps = {
  sicht: string;
  dritt: string | undefined;
  typ: Mappentyp | undefined;
  verwaltet: Sicht | undefined;
  suche: URLSearchParams;
  anhang: string;
};

const leer = (text: ReactNode) => (
  <div className="leer">
    <p>{text}</p>
  </div>
);

/** „…/neu“: neue Mappe – oder warum es hier keine gibt (mehrere Typen, kein Recht, Teil, nicht anlegbar). */
function neuRechts({ sicht, typ, verwaltet, suche }: RechtsProps, d: ReturnType<typeof useDaten>) {
  if (!typ) return leer(t('ablage.ablage.diese-ansicht-zeigt-mehrere'));
  if (verwaltet?.rechte?.C === false) return leer(t('ablage.ablage.in-der-ansicht-lassen', { name: sichtName(verwaltet) }));
  // Teile (#1031) entstehen an ihrer übergeordneten Mappe („+ Position“ an der Rechnung).
  if (istTeiltyp(typ) && !suche.get('verweis'))
    return leer(
      t('ablage.teile.neu-an-uebergeordneter', {
        name: typName(typ),
        eltern: ((x) => (x ? typName(x) : '…'))(d.typ(uebergeordneterTyp(typ))),
      }),
    );
  if (!darfErstellen(typ))
    return leer(
      t('ablage.ablage.von-lassen-sich-in', {
        name: typ.name,
        wert: typ.system === 'benutzer' ? t('ablage.ablage.benutzer-legt-in-der') : '',
      }),
    );
  return (
    <NeueMappe
      key={`${typ.id}-${suche.get('verweis') ?? ''}-${suche.get('zuordnen') ?? ''}-${suche.get('vorbelegen') ?? ''}`}
      typ={typ}
      sicht={sicht}
      verweis={suche.get('verweis') ?? undefined}
      zuordnen={zuordnenAus(suche)}
      vorbelegen={suche.get('vorbelegen') ?? undefined}
    />
  );
}

export function Rechts(p: RechtsProps) {
  const d = useDaten();
  const { sicht, dritt, typ, suche, anhang } = p;
  if (dritt === 'neu') return neuRechts(p, d);
  if (dritt === 'weitergeben' && sicht === 'eingang') return <AufgabenWeitergeben />;
  if (dritt && sicht === 'papierkorb') return <PapierkorbDetail key={dritt} id={dritt} werkbank={false} />;
  if (dritt) return <MappeLader key={dritt} id={dritt} sicht={sicht} anhang={anhang} alsPost={suche.get('als') === 'post'} />;
  return (
    <div className="platzhalter">
      <p>{t('ablage.ablage.waehle-in-der-liste', { wert: typ ? t('ablage.ablage.oder-lege-eine-neue') : '' })}</p>
    </div>
  );
}
