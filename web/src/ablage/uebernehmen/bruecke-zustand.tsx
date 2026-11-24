import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { feldLabel } from '../../../../shared/src/beschriftung';
import { zielErlaubt, type Feld as FeldDef, type Mappentyp, type Wert } from '../../../../shared/src/model';
import { musterTeil, wertAusText } from '../../../../shared/src/uebernehmen';
import { t } from '../../sprache';
import type { Bruecke, FormularAnschluss, Marke, Nutzlast } from '../bruecke';
import type { Erkannt } from './erkennung';
import { kurz } from './hilfen';
import { VerweisBelege } from './teile';

/** Meldung oben in der Mitte: übernommen, passt nicht, erst ein Feld wählen. */
export type UeMeldung = { text: string; art: 'gut' | 'warn' } | null;

/**
 * Brücke zwischen Dokument und Formular (#934): welches Feld hervorgehoben und welches gewählt ist, Werte vom Dokument
 * ins Feld nehmen (Ziehen, Rahmen, markierter Text) und die Meldung dazu.
 */
export function useBrueckeZustand(zielTyp: Mappentyp | undefined, erkannt: Erkannt | null, marken: Marke[]) {
  const [hervor, setHervor] = useState<string | null>(null);
  const [aktiv, setAktiv] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<UeMeldung>(null);
  useEffect(() => {
    if (!meldung) return;
    const z = window.setTimeout(() => setMeldung(null), 5000);
    return () => window.clearTimeout(z);
  }, [meldung]);
  const anschluss = useRef<FormularAnschluss | null>(null);
  const anschliessen = useCallback((a: FormularAnschluss) => {
    anschluss.current = a;
    return () => {
      if (anschluss.current === a) anschluss.current = null;
    };
  }, []);
  const nimm = useCallback((f: FeldDef, n: Nutzlast, ziel?: FormularAnschluss) => {
    const a = ziel ?? anschluss.current;
    if (!a) return;
    const { wert, bezug } = wertFuer(f, n);
    if (wert == null) {
      setMeldung({
        art: 'warn',
        text:
          f.typ === 'referenz'
            ? t('ablage.uebernehmen.verweis-nur-rahmen', { feld: feldLabel(f) })
            : t('ablage.uebernehmen.passt-nicht', { text: kurz(n.text), feld: feldLabel(f) }),
      });
      return;
    }
    a.setze(f.key, wert, bezug);
    // Feldmuster (#1607): passt kein Teil, steht der Text trotzdem im Feld – mit Hinweis statt stiller Übernahme.
    if (f.typ === 'text' && f.muster && typeof wert === 'string' && musterTeil(f.muster, wert) !== wert) {
      setMeldung({ art: 'warn', text: t('ablage.uebernehmen.muster-passt-nicht', { text: kurz(wert), feld: feldLabel(f) }) });
      return;
    }
    setMeldung({
      art: 'gut',
      text: t('ablage.uebernehmen.uebernommen', {
        text: kurz(f.typ === 'text' && typeof wert === 'string' ? wert : n.text),
        feld: feldLabel(f),
      }),
    });
  }, []);
  // Fenster „+ … anlegen“ (#935): Solange es offen ist, gehen Rahmen und markierter Text dorthin.
  const fensterZiel = useRef<((n: Nutzlast) => boolean) | null>(null);
  const fenster = useCallback((z: ((n: Nutzlast) => boolean) | null) => {
    fensterZiel.current = z;
  }, []);
  /** Rahmen angeklickt bzw. Text markiert: ins zuletzt gewählte Feld; ohne gewähltes Feld zeigt der Rahmen sein Feld. */
  const insAktive = useCallback(
    (n: Nutzlast, eigenesFeld?: string) => {
      if (fensterZiel.current) {
        if (!fensterZiel.current(n)) setMeldung({ art: 'warn', text: t('ablage.uebernehmen.erst-feld-waehlen', { text: kurz(n.text) }) });
        return;
      }
      const f = aktiv ? zielTyp?.felder.find((x) => x.key === aktiv) : undefined;
      if (f) {
        nimm(f, n);
        return;
      }
      if (eigenesFeld) {
        anschluss.current?.zeige(eigenesFeld);
        setHervor(eigenesFeld);
        return;
      }
      setMeldung({ art: 'warn', text: t('ablage.uebernehmen.erst-feld-waehlen', { text: kurz(n.text) }) });
    },
    [aktiv, zielTyp, nimm],
  );
  const unterFeld = useCallback(
    (f: FeldDef): ReactNode => {
      if (f.typ !== 'referenz' || !erkannt?.abgleich) return null;
      const liste = erkannt.abgleich.verweise[f.key] ?? [];
      if (!liste.length) return null;
      return (
        <VerweisBelege
          f={f}
          liste={liste}
          bezuege={erkannt.abgleich.bezuege}
          marken={marken.filter((x) => x.feldKey === f.key)}
          nehmen={(x) =>
            nimm(f, {
              text: erkannt.abgleich!.bezuege[x.mappeId]?.titel ?? '',
              mappeId: x.mappeId,
              typId: x.typId,
              titel: erkannt.abgleich!.bezuege[x.mappeId]?.titel ?? '',
            })
          }
        />
      );
    },
    [erkannt, marken, nimm],
  );
  const bruecke = useMemo<Bruecke>(
    () => ({ marken, hervor, setHervor, aktiv, setAktiv, nimm, anschliessen, unterFeld, fenster }),
    [marken, hervor, aktiv, nimm, anschliessen, unterFeld, fenster],
  );
  return { bruecke, hervor, setHervor, meldung, setMeldung, insAktive };
}

/** Wert fürs Feld aus dem, was vom Dokument kommt: Verweis nur aus einem Rahmen mit Mappe, sonst aus Wert oder Text. */
function wertFuer(f: FeldDef, n: Nutzlast): { wert: Wert | null; bezug?: { id: string; titel: string; typId: string } } {
  if (f.typ === 'referenz') {
    if (n.mappeId && n.typId && zielErlaubt(f, n.typId))
      return { wert: f.mehrfach ? [n.mappeId] : n.mappeId, bezug: { id: n.mappeId, titel: n.titel ?? n.text, typId: n.typId } };
    return { wert: null };
  }
  if (n.wert != null && n.feldTyp === f.typ) return { wert: n.wert };
  return { wert: wertAusText(f, n.text) };
}
