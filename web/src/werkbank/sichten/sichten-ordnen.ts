import { useState } from 'react';
import { useZiehen, type Ort } from '../../ziehen';
import { kinderVon, mitNachkommen, type Sicht } from '../../../../shared/src/sichten';
import { sichtRegelwerkVon } from '../../../../shared/src/sichtrechte';
import { werkbankApi } from '../../api/werkbank';
import { useDaten } from '../../daten';
import { elternkette } from '../SichtRechte';
import { t } from '../../sprache';

/** Ansichten ordnen (#73): Ziehen, Tastatur und die Meldungen dazu. Sofort gespeichert; Kreise sind unmöglich. */
export function useSichtenOrdnen() {
  const d = useDaten();
  const [ansage, setAnsage] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const name = (id: string | null) => (id ? (d.sicht(id)?.name ?? '') : '');
  /** „Heizung erbt jetzt von „Haus“: Standard R, 2 Regeln.“ bzw. „… erbt keine Regeln mehr.“ */
  const vererbtHinweis = (n: string, elternId: string | null) => {
    if (!elternId) return t('werkbank.sichten.liegt-jetzt-auf-der', { n });
    const kette = elternkette(d.sichten, elternId);
    const regeln = kette.reduce((x, s) => x + sichtRegelwerkVon(s).regeln.length, 0);
    const standard = sichtRegelwerkVon(kette[0]).grund;
    return t('werkbank.sichten.erbt-jetzt-die-berechtigungen', {
      n,
      name: name(elternId),
      wert:
        Object.entries(standard)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join('') || '–',
      wert2: regeln ? t('werkbank.sichten.regeln', { anzahl: regeln }) : t('werkbank.sichten.keine-regeln'),
    });
  };

  // Drag & Drop (#73): sofort gespeichert; Untersichten wandern mit, Kreise sind unmöglich.
  async function verschiebe(id: string, elternId: string | null, stelle: number) {
    setFehler(undefined);
    try {
      const vorher = d.sicht(id)?.elternId ?? null;
      await werkbankApi.sichtVerschieben(id, elternId, stelle);
      await d.neuLaden();
      setAnsage(
        t('werkbank.sichten.liegt-jetzt-an-stelle', {
          name: name(id),
          wert: elternId ? t('werkbank.sichten.unter', { name: name(elternId) }) : t('werkbank.sichten.auf-der-obersten-ebene'),
          wert2: stelle + 1,
        }),
      );
      // Berechtigungen (#148): Mit der neuen Elternsicht gelten sofort deren Regeln.
      if (vorher !== elternId) setHinweis(vererbtHinweis(name(id), elternId));
    } catch (x) {
      setFehler((x as Error).message);
    }
  }
  const z = useZiehen({
    hinein: true,
    erlaubt: (quelle, ziel) => !mitNachkommen(d.sichten, quelle).some((s) => s.id === ziel),
    fertig: (quelle, ziel, ort: Ort) => {
      const zs = d.sicht(ziel);
      if (!zs) return;
      if (ort === 'in') {
        void verschiebe(quelle, ziel, kinderVon(d.sichten, ziel).filter((s) => s.id !== quelle).length);
        return;
      }
      const geschwister = kinderVon(d.sichten, zs.elternId).filter((s) => s.id !== quelle);
      const i = geschwister.findIndex((s) => s.id === ziel);
      void verschiebe(quelle, zs.elternId, ort === 'vor' ? i : i + 1);
    },
  });
  // Tastatur: Alt+↑/↓ in der Ebene, Alt+→ unter die vorherige Sicht, Alt+← eine Ebene höher.
  const tasten = (s: Sicht) => {
    const geschwister = kinderVon(d.sichten, s.elternId);
    const i = geschwister.findIndex((x) => x.id === s.id);
    return {
      hoch: i > 0 ? () => void verschiebe(s.id, s.elternId, i - 1) : undefined,
      runter: i < geschwister.length - 1 ? () => void verschiebe(s.id, s.elternId, i + 1) : undefined,
      rein: i > 0 ? () => void verschiebe(s.id, geschwister[i - 1].id, kinderVon(d.sichten, geschwister[i - 1].id).length) : undefined,
      raus: s.elternId
        ? () => {
            const eltern = d.sicht(s.elternId!)!;
            const ebene = kinderVon(d.sichten, eltern.elternId);
            void verschiebe(s.id, eltern.elternId, ebene.findIndex((x) => x.id === eltern.id) + 1);
          }
        : undefined,
    };
  };
  return { ansage, fehler, hinweis, setHinweis, z, tasten };
}
