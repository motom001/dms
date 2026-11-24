import { t } from '../../sprache';
import { KnopfLink } from '../../bausteine';
import type { WerkbankUebersicht } from '../../api/betrieb';
import type { EmpfohlenesPaket } from '../../../../shared/src/pakete';
import type { Hinweis } from './hilfen';

/**
 * Empfohlene Pakete (#1511): ein Hinweis statt drei. Je fehlendem Paket eine Zeile mit Name, einem Satz und „Installieren“
 * (derselbe Ablauf wie „Installieren per Link“, #191/#405); darunter „Alle Pakete ansehen“. Installierte verschwinden,
 * sind alle da, verschwindet der Hinweis ganz. Warten schon Scans auf die Texterkennung, wird er zur Warnung.
 *
 * Kommt die Installation von einer älteren Version (`umstieg`) und fehlt die Texterkennung, sagt das der eigene
 * Umstiegs-Hinweis „Texterkennung ist jetzt ein Paket“ – sie steht dann nicht noch einmal in dieser Liste.
 */
export function empfohlenePakete(u: WerkbankUebersicht, h: Hinweis[]) {
  const fehlt = u.empfohlenFehlt;
  if (!fehlt) return;
  const liste = umstiegTexterkennung(u) ? fehlt.filter((id) => id !== 'texterkennung') : fehlt;
  if (!liste.length) return;
  const warten = liste.includes('texterkennung') ? (u.texterkennung?.paket ?? 0) : 0;
  h.push({
    schluessel: 'pakete.empfohlen',
    art: warten ? 'warn' : 'info',
    text: <EmpfohleneListe liste={liste} warten={warten} />,
    ziel: '/werkbank/pakete',
    knopf: t('werkbank.uebersicht.empfohlen.alle'),
    eigeneKnoepfe: true,
  });
}

/** Umstiegs-Hinweis zur Texterkennung (#459): nur für Installationen, die von einer älteren Version kommen (#1511). */
export const umstiegTexterkennung = (u: WerkbankUebersicht) => u.texterkennungPaket === false && (u.umstieg ?? !u.empfohlenFehlt);

function EmpfohleneListe({ liste, warten }: { liste: EmpfohlenesPaket[]; warten: number }) {
  return (
    <span className="empfohlen">
      <strong>{t('werkbank.uebersicht.empfohlen')}</strong> {t('werkbank.uebersicht.empfohlen.text')}
      <span className="empfohlen-liste" role="list">
        {liste.map((id) => (
          <span key={id} className="empfohlen-zeile" role="listitem">
            <span>
              <strong>{t.frei(`werkbank.uebersicht.empfohlen.${id}`)}</strong> – {t.frei(`werkbank.uebersicht.empfohlen.${id}.satz`)}
              {id === 'texterkennung' && warten ? ` ${t('volltext.werkbank.paket.ohne', { anzahl: warten })}` : ''}
            </span>
            <KnopfLink
              to={`/werkbank/pakete?installieren=${id}`}
              groesse="klein"
              aria-label={t('werkbank.uebersicht.empfohlen.installieren.name', { name: t.frei(`werkbank.uebersicht.empfohlen.${id}`) })}>
              {t('werkbank.uebersicht.empfohlen.installieren')}
            </KnopfLink>
          </span>
        ))}
      </span>
      <KnopfLink to="/werkbank/pakete" art="link">
        {t('werkbank.uebersicht.empfohlen.alle')}
      </KnopfLink>
    </span>
  );
}
