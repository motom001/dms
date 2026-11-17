/** Dialoge der Automatisierungsvorlagen an der Mappe (#1044, #1279 eigene Datei): Erinnern, Aufgabe vergeben, weitere. */
import { useState, type ReactNode } from 'react';
import { fragtDatum, laeuftAm, vorschlagDatum, type MappenAblauf, type VorlageZumAnwenden } from '../../../../shared/src/ablaufvorlagen';
import { datumDe } from '../../../../shared/src/fristen';
import { heuteIn, verschiebe } from '../../../../shared/src/sichten';
import { automatisierungApi } from '../../api/automatisierung';
import { mappenApi } from '../../api/mappen';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { Hilfe } from '../../Hilfe';
import { t, tn } from '../../sprache';
import { Feld, Knopf } from '../../bausteine';
import { BenutzerWahl, ProbeHinweis, trotzdemZuweisen, type Probe } from './gemeinsam';

/**
 * Erinnern (#131) – seit #1044 die Automatisierungsvorlage „Erinnern“ (bzw. die eines Pakets, das sie ersetzt): Datum,
 * Text, für mich oder jemand anderen. Fragt die Vorlage etwas nicht, fehlt das Feld. Auch zum Ändern geplanter Abläufe.
 */
export function ErinnerungFormular({
  mappeId,
  e,
  vorlage,
  neuLaden,
  schliessen,
  eingebettet,
  probe,
}: {
  mappeId: string;
  e?: MappenAblauf;
  vorlage?: VorlageZumAnwenden;
  neuLaden: () => Promise<void>;
  schliessen: () => void;
  eingebettet?: boolean;
  probe?: Probe;
}) {
  const d = useDaten();
  const { ich } = useKonto();
  const fragen = vorlage?.fragen ?? ['datum', 'empfaenger', 'text'];
  const mitText = fragen.includes('text');
  const mitEmpfaenger = fragen.includes('empfaenger');
  const [datum, setDatum] = useState(() => startDatum(e, vorlage));
  const [text, setText] = useState(e?.text ?? '');
  const [an, setAn] = useState(e?.empfaengerId ?? ich.id);
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  async function senden() {
    setFehler(undefined);
    try {
      const x = { datum, ...(mitText ? { text } : {}), ...(mitEmpfaenger ? { empfaengerId: an || undefined } : {}) };
      if (probe) {
        await probe.anwenden(x);
        return;
      }
      const r = e
        ? await automatisierungApi.ablaufAendern(e.id, x)
        : await mappenApi.ablaufAnwenden(mappeId, vorlage?.kennung ?? 'erinnern', x);
      await neuLaden();
      await d.neuLaden();
      if (r.hinweis) setHinweis(r.hinweis);
      else schliessen();
    } catch (x) {
      setFehler((x as Error).message);
    }
  }
  const t_ = erinnernTexte(vorlage, !!e);
  const inhalt = (
    <>
      <div className="raster">
        <Feld beschriftung={t('ablage.aufgaben.am')}>
          <input type="date" value={datum} onChange={(x) => setDatum(x.target.value)} />
        </Feld>
        {mitEmpfaenger && <BenutzerWahl label={t('ablage.aufgaben.fuer-2')} sichtbar wert={an} setze={setAn} />}
        {mitText && (
          <Feld beschriftung={t('ablage.aufgaben.woran')} className="breit">
            <input
              value={text}
              maxLength={500}
              onChange={(x) => setText(x.target.value)}
              placeholder={t('ablage.aufgaben.z-b-angebote-vergleichen')}
              autoFocus
            />
          </Feld>
        )}
      </div>
      <p className="leise klein">
        {t('ablage.aufgaben.am-gewaehlten-tag-steht', { wert: an === ich.id ? '' : t('ablage.aufgaben.des-empfaengers') })}
      </p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {hinweis && (
        <div className="hinweis warn">
          <p>{hinweis}</p>
        </div>
      )}
      <div className="knoepfe">
        {eingebettet && <Knopf onClick={schliessen}>{t('ablage.aufgaben.abbrechen')}</Knopf>}
        <Knopf art="haupt" gesperrt={!datum || (mitText && !text.trim()) || (mitEmpfaenger && !an)} onClick={senden}>
          {t_.knopf}
        </Knopf>
      </div>
    </>
  );
  if (eingebettet) return <div className="erinnerungformular">{inhalt}</div>;
  return (
    <section className="blatt" aria-label={t_.name}>
      <div className="blattkopf zeile-zwischen">
        <h2 className="h3">{t_.titel}</h2>
        <Knopf onClick={schliessen}>{t('ablage.aufgaben.schliessen')}</Knopf>
      </div>
      {probe && <ProbeHinweis />}
      {inhalt}
    </section>
  );
}

/** Datum im Erinnern-Dialog: das des geplanten Ablaufs, sonst der Vorschlag der Vorlage (#1180), sonst in einer Woche. */
function startDatum(e: MappenAblauf | undefined, vorlage: VorlageZumAnwenden | undefined): string {
  if (e) return e.datum;
  return vorlage ? vorschlagDatum(vorlage.wann, heuteIn()) : verschiebe(heuteIn(), 7);
}

/** Beschriftungen des Erinnern-Dialogs: bei „Erinnern“ wie bisher, bei einer anderen Vorlage mit ihrem Namen. */
function erinnernTexte(vorlage: VorlageZumAnwenden | undefined, aendern: boolean): { name: string; titel: ReactNode; knopf: string } {
  const andere = !!vorlage && vorlage.kennung !== 'erinnern';
  const name = vorlage?.name ?? t('ablage.aufgaben.erinnern');
  const knopf = aendern ? (andere ? t('ablage.aufgaben.ablauf-aendern') : t('ablage.aufgaben.erinnerung-aendern')) : name;
  return { name, knopf, titel: andere ? name : tn('ablage.aufgaben.erinnern-2', { hilfe: <Hilfe ort="ablage.erinnern" /> }) };
}

/** Aufgabe von Hand vergeben – seit #1044 die Automatisierungsvorlage „Aufgabe vergeben“ (sofort, genauso schnell). */
export function NeueAufgabe({
  mappeId,
  vorlage,
  neuLaden,
  schliessen,
  probe,
}: {
  mappeId: string;
  vorlage?: VorlageZumAnwenden;
  neuLaden: () => Promise<void>;
  schliessen: () => void;
  probe?: Probe;
}) {
  const d = useDaten();
  const fragen = vorlage?.fragen ?? ['empfaenger', 'text'];
  const [an, setAn] = useState('');
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const fehlt = (fragen.includes('empfaenger') && !an) || (fragen.includes('text') && !text.trim());
  async function senden() {
    setFehler(undefined);
    if (an && !(await trotzdemZuweisen(mappeId, an, d.person(an)))) return;
    try {
      const x = { ...(fragen.includes('empfaenger') ? { empfaengerId: an } : {}), ...(fragen.includes('text') ? { text } : {}) };
      if (probe) {
        await probe.anwenden(x);
        return;
      }
      const r = await mappenApi.ablaufAnwenden(mappeId, vorlage?.kennung ?? 'aufgabe_vergeben', x);
      await neuLaden();
      await d.neuLaden();
      // Empfänger darf die Mappe nicht lesen (#127): Maske offen lassen, Hinweis zeigen.
      if (r.hinweis) {
        setHinweis(r.hinweis);
        setText('');
        setAn('');
      } else schliessen();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  const titel = vorlage?.name ?? t('ablage.aufgaben.aufgabe-vergeben');
  return (
    <section className="blatt" aria-label={titel}>
      <div className="blattkopf zeile-zwischen">
        <h2 className="h3">{titel}</h2>
        <Knopf onClick={schliessen}>{t('ablage.aufgaben.schliessen')}</Knopf>
      </div>
      {probe && <ProbeHinweis />}
      <div className="raster">
        {fragen.includes('empfaenger') && <BenutzerWahl label={t('ablage.aufgaben.fuer-2')} sichtbar wert={an} setze={setAn} />}
        {fragen.includes('text') && (
          <Feld beschriftung={t('ablage.aufgaben.was-ist-zu-tun')} className="breit">
            <input
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('ablage.aufgaben.z-b-bitte-rechnung')}
            />
          </Feld>
        )}
      </div>
      <p className="leise klein">{t('ablage.aufgaben.die-mappe-erscheint-beim')}</p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {hinweis && (
        <div className="hinweis warn" role="status">
          <p>{hinweis}</p>
        </div>
      )}
      <div className="knoepfe">
        <Knopf art="haupt" gesperrt={fehlt} onClick={senden}>
          {titel}
        </Knopf>
      </div>
    </section>
  );
}

/**
 * Weitere Automatisierungsvorlagen im Menü „Mappe“ (#1044), z. B. „Wiedervorlage“ aus dem Paket Benachrichtigungen: ein
 * kleiner Dialog mit genau den Fragen der Vorlage; was sie nicht fragt, steht als Satz da („Läuft am …“).
 */
export function AblaufFormular({
  mappeId,
  vorlage,
  neuLaden,
  schliessen,
  probe,
}: {
  mappeId: string;
  vorlage: VorlageZumAnwenden;
  neuLaden: () => Promise<void>;
  schliessen: () => void;
  probe?: Probe;
}) {
  const d = useDaten();
  const { ich } = useKonto();
  const [an, setAn] = useState(vorlage.wann.art === 'sofort' ? '' : ich.id);
  // Datum: bei „In …“ mit der Frage „Datum“ der Vorschlag der Vorlage (heute + 14 Tage), änderbar (#1180).
  const [datum, setDatum] = useState(vorschlagDatum(vorlage.wann, heuteIn()));
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const f = vorlage.fragen;
  const mitDatum = fragtDatum(vorlage);
  const am = vorlage.wann.art === 'in' ? laeuftAm(vorlage.wann, heuteIn(), mitDatum ? datum || null : null) : null;
  const fehlt = (f.includes('empfaenger') && !an) || (f.includes('text') && !text.trim()) || (mitDatum && !datum);
  async function senden() {
    setFehler(undefined);
    if (f.includes('empfaenger') && an && an !== ich.id && !(await trotzdemZuweisen(mappeId, an, d.person(an)))) return;
    try {
      const x = {
        ...(f.includes('empfaenger') ? { empfaengerId: an } : {}),
        ...(mitDatum ? { datum } : {}),
        ...(f.includes('text') ? { text } : {}),
      };
      if (probe) {
        await probe.anwenden(x);
        return;
      }
      const r = await mappenApi.ablaufAnwenden(mappeId, vorlage.kennung, x);
      await neuLaden();
      await d.neuLaden();
      if (r.hinweis) setHinweis(r.hinweis);
      else schliessen();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  return (
    <section className="blatt" aria-label={vorlage.name}>
      <div className="blattkopf zeile-zwischen">
        <h2 className="h3">{vorlage.name}</h2>
        <Knopf onClick={schliessen}>{t('ablage.aufgaben.schliessen')}</Knopf>
      </div>
      {probe && <ProbeHinweis />}
      {vorlage.beschreibung && <p className="leise">{vorlage.beschreibung}</p>}
      <div className="raster">
        {mitDatum && (
          <Feld
            beschriftung={t('ablage.aufgaben.am')}
            hinweis={
              vorlage.wann.art === 'in'
                ? t('ablage.aufgaben.vorschlag', { datum: datumDe(vorschlagDatum(vorlage.wann, heuteIn())) })
                : undefined
            }>
            <input type="date" value={datum} onChange={(x) => setDatum(x.target.value)} />
          </Feld>
        )}
        {f.includes('empfaenger') && <BenutzerWahl label={t('ablage.aufgaben.fuer-2')} sichtbar wert={an} setze={setAn} />}
        {f.includes('text') && (
          <Feld beschriftung={t('ablage.aufgaben.text')} className="breit">
            <input value={text} maxLength={2000} onChange={(x) => setText(x.target.value)} />
          </Feld>
        )}
      </div>
      <p className="leise klein">
        {am
          ? t('ablage.aufgaben.laeuft-am', { datum: datumDe(am) })
          : vorlage.wann.art === 'sofort'
            ? t('ablage.aufgaben.laeuft-sofort')
            : t('ablage.aufgaben.laeuft-am-gewaehlten')}
      </p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {hinweis && (
        <div className="hinweis warn" role="status">
          <p>{hinweis}</p>
        </div>
      )}
      <div className="knoepfe">
        <Knopf art="haupt" gesperrt={fehlt} onClick={senden}>
          {vorlage.name}
        </Knopf>
      </div>
    </section>
  );
}
