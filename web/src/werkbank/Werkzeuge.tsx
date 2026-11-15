import { Knopf, type KnopfErgebnis } from '../bausteine';
import { HilfeVerweis } from '../Hilfe';
import { t } from '../sprache';
import { fehlendeProgramme, fehlendeWerkzeuge, type WerkzeugArt, type Werkzeuge } from '../../../shared/src/werkzeuge';

/**
 * Eingebaute Werkzeuge (#1189): Sind alle da, steht hier nichts – Lena hat dann nichts zu tun. Fehlt eins, sagt ein
 * Hinweis in Alltagssprache, was deshalb nicht geht und was hilft, mit „Erneut prüfen“ und „Mehr dazu“. Die Namen
 * der Programme stehen nur als Detail für Fachleute darunter. Steht oben auf Suche und Volltext und im Systemzustand.
 */
export function WerkzeugeHinweis({ werkzeuge, pruefen }: { werkzeuge: Werkzeuge | null | undefined; pruefen: () => Promise<string | undefined> }) {
  const fehlt = fehlendeWerkzeuge(werkzeuge);
  if (!werkzeuge || !fehlt.length) return null;
  const programme = fehlt.map((art) => `${fehlendeProgramme(werkzeuge, art).join(', ')} (${PAKET[art]})`).join('; ');
  return (
    <div className="hinweis warn" role="status" id="werkzeuge">
      {fehlt.map((art) => <p key={art}><strong>{t.frei(`werkbank.werkzeuge.${art}.fehlt`)}</strong> {t.frei(`werkbank.werkzeuge.${art}.folge`)}</p>)}
      <p>{t('werkbank.werkzeuge.abhilfe', { anzahl: fehlt.length })}</p>
      <p className="leise klein">{t('werkbank.werkzeuge.fachleute', { programme })}</p>
      <div className="knoepfe">
        <Knopf laeuftText={t('werkbank.werkzeuge.prueft')} onClick={async (): Promise<KnopfErgebnis> => {
          const f = await pruefen();
          return f ? { art: 'schlecht', text: f } : { art: 'gut', text: t('werkbank.werkzeuge.geprueft') };
        }}>{t('werkbank.werkzeuge.erneut-pruefen')}</Knopf>
        <HilfeVerweis ort="werkbank.werkzeuge">{t('werkbank.werkzeuge.mehr')}</HilfeVerweis>
      </div>
    </div>
  );
}

/** Name des Programmpakets für Fachleute (so heißt es in den Paketquellen der Linux-Distributionen). */
const PAKET: Record<WerkzeugArt, string> = { poppler: 'Poppler', qpdf: 'qpdf', schriften: 'Alpine' };

/** Zeilen für „Installiert“ unter Version und Updates: je Werkzeug „vorhanden“ oder „fehlt“. */
export function werkzeugZeilen(w: Werkzeuge | null | undefined): Array<[string, string]> {
  if (!w) return [];
  const fehlt = fehlendeWerkzeuge(w);
  return (['poppler', 'qpdf', 'schriften'] as const).filter((art) => art !== 'schriften' || w.schriften !== undefined).map((art) => [t.frei(`werkbank.werkzeuge.${art}.name`), fehlt.includes(art) ? t('werkbank.werkzeuge.fehlt') : t('werkbank.werkzeuge.vorhanden')]);
}
