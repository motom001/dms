import { feldLabel } from '../../../../shared/src/beschriftung';
import {
  empfaengerText,
  karteText,
  VORLAGEN_GRENZEN,
  VORLAGEN_PLATZHALTER,
  type VorlagenEmpfaenger,
  type VorlagenKarte,
} from '../../../../shared/src/ablaufvorlagen';
import { einzigesZiel, jedeMappe, zieleVon, type Mappentyp } from '../../../../shared/src/model';
import { t } from '../../sprache';
import {
  Feld,
  FeldGruppe,
  HakenFeld,
  Knopf,
  Platzhalter,
  Umschalter,
  usePlatzhalterEinsetzen,
  type PlatzhalterGruppe,
} from '../../bausteine';

const EMPFAENGER: Array<VorlagenEmpfaenger['art']> = ['frage', 'selbst', 'ersteller'];

/** Verweisfelder auf Benutzer in den gewählten Mappentypen – als Empfänger wählbar. */
function benutzerFelder(typen: Mappentyp[], gewaehlt: string[]): Array<{ key: string; label: string }> {
  const benutzerTyp = typen.find((x) => x.system === 'benutzer');
  const inFrage = typen.filter((x) => gewaehlt.includes(x.id));
  if (!inFrage.length) return [];
  const felder = inFrage[0].felder.filter(
    (f) => f.typ === 'referenz' && ((!zieleVon(f).length && !jedeMappe(f)) || einzigesZiel(f) === benutzerTyp?.id),
  );
  return felder.filter((f) => inFrage.every((ty) => ty.felder.some((g) => g.key === f.key))).map((f) => ({ key: f.key, label: f.label }));
}

/**
 * Platzhalter einer Ablaufvorlage (#1177): „Allgemein“ (Eingabe, Person, Empfänger, Mappe, Datum) und je gewähltem
 * Mappentyp seine Felder unter dessen Namen. Ein Feld steht einmal – beim ersten Typ, der es hat; fehlt es in einem
 * anderen gewählten Typ, steht „nur bei …“ daran. Ohne gewählten Typ (= alle Mappentypen) gibt es nur „Allgemein“.
 */
function vorlagenPlatzhalter(typen: Mappentyp[], gewaehlt: string[]): PlatzhalterGruppe[] {
  const allgemein = [...VORLAGEN_PLATZHALTER, 'titel', 'mappentyp', 'heute', 'datum'].map((key) => ({
    key,
    text: t.frei(`automatisierung.vorlage.ui.platz.${key}`),
  }));
  const inFrage = typen.filter((x) => gewaehlt.includes(x.id));
  const schon = new Set<string>();
  return [
    { name: t('automatisierung.ui.platzhalter.allgemein'), eintraege: allgemein },
    ...inFrage.map((ty) => ({
      name: ty.name,
      eintraege: ty.felder
        .filter((f) => f.typ !== 'passwort' && !schon.has(f.key))
        .map((f) => {
          schon.add(f.key);
          const bei = inFrage.filter((x) => x.felder.some((g) => g.key === f.key));
          return {
            key: f.key,
            text: feldLabel(f),
            ...(bei.length < inFrage.length
              ? { zusatz: t('automatisierung.vorlage.ui.platz.nur-bei', { typen: bei.map((x) => x.name).join(', ') }) }
              : {}),
          };
        }),
    })),
  ];
}

export function KartenEditor({
  karte,
  typen,
  gewaehlt,
  setze,
  entfernen,
}: {
  karte: VorlagenKarte;
  typen: Mappentyp[];
  gewaehlt: string[];
  setze: (k: VorlagenKarte) => void;
  entfernen?: () => void;
}) {
  const felder = benutzerFelder(typen, gewaehlt);
  const hat = (e: VorlagenEmpfaenger) =>
    karte.empfaenger.some((x) => x.art === e.art && (x.art !== 'feld' || (e.art === 'feld' && x.feld === e.feld)));
  const schalte = (e: VorlagenEmpfaenger, an: boolean) =>
    setze({
      ...karte,
      empfaenger: an
        ? [...karte.empfaenger, e]
        : karte.empfaenger.filter((x) => !(x.art === e.art && (x.art !== 'feld' || (e.art === 'feld' && x.feld === e.feld)))),
    });
  const ein = usePlatzhalterEinsetzen();
  return (
    <div className="blatt karte">
      <div className="zeile-zwischen">
        <strong>{karteText(karte, typen)}</strong>
        {entfernen && (
          <Knopf groesse="klein" symbol="schliessen" onClick={entfernen}>
            {t('automatisierung.ui.entfernen')}
          </Knopf>
        )}
      </div>
      <Umschalter
        beschriftung={t('automatisierung.vorlage.ui.als')}
        wert={karte.als}
        setze={(als) => setze({ ...karte, als })}
        wahlen={[
          { wert: 'aufgabe', text: t('automatisierung.karte.aufgabe.als-aufgabe') },
          { wert: 'benachrichtigung', text: t('automatisierung.karte.aufgabe.als-benachrichtigung') },
        ]}
      />
      <FeldGruppe beschriftung={t('automatisierung.vorlage.ui.empfaenger')}>
        {EMPFAENGER.map((art) => (
          <HakenFeld key={art} beschriftung={empfaengerText({ art } as VorlagenEmpfaenger)}>
            <input
              type="checkbox"
              checked={hat({ art } as VorlagenEmpfaenger)}
              onChange={(x) => schalte({ art } as VorlagenEmpfaenger, x.target.checked)}
            />
          </HakenFeld>
        ))}
        {felder.map((f) => (
          <HakenFeld key={f.key} beschriftung={t('automatisierung.vorlage.ui.feld', { feld: f.label })}>
            <input
              type="checkbox"
              checked={hat({ art: 'feld', feld: f.key })}
              onChange={(x) => schalte({ art: 'feld', feld: f.key }, x.target.checked)}
            />
          </HakenFeld>
        ))}
      </FeldGruppe>
      <Feld
        beschriftung={t('automatisierung.vorlage.ui.text')}
        hinweis={gewaehlt.length ? undefined : t('automatisierung.vorlage.ui.platzhalter.ohne-typ')}>
        <textarea
          {...ein.feld('text', karte.text, (x) => setze({ ...karte, text: x }))}
          rows={2}
          maxLength={VORLAGEN_GRENZEN.text}
          value={karte.text}
          onChange={(x) => setze({ ...karte, text: x.target.value })}
        />
      </Feld>
      <Platzhalter einsetzen={ein.einsetzen} gruppen={vorlagenPlatzhalter(typen, gewaehlt)} />
    </div>
  );
}
