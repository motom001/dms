import type { Luecke } from '../../../shared/src/loeschkonzept';
import { Hilfe } from '../Hilfe';

/**
 * Werkbank → Datenschutz → Löschkonzept (#469): das Löschkonzept als PDF oder Word-Datei, Abschnitt 2
 * „Datenarten und Fristen“ aus den Mappentypen. Lücken (ohne Zweck, ohne Frist) stehen hier und im Dokument.
 */
export function LoeschkonzeptBlatt({ luecken }: { luecken: Luecke[] }) {
  return (
    <section className="blatt" id="loeschkonzept">
      <h2 className="h3">Löschkonzept <Hilfe ort="werkbank.loeschkonzept" /></h2>
      <p className="leise klein">Das DMS füllt die Vorlage aus dem Handbuch mit deinen Mappentypen, Zwecken, Aufbewahrungsfristen und Einstellungen (Papierkorb, Sicherungen). Was es nicht wissen kann – Rechtsgrundlage, Zuständige, Begründung der Fristen –, steht in [eckigen Klammern] zum Ergänzen. Aus den Mappen selbst kommt nichts hinein.</p>
      {luecken.length > 0 && (
        <div className="hinweis warn stapel">
          <p><strong>Bitte ergänzen</strong> – sonst steht es im Dokument als Lücke:</p>
          <ul>{luecken.map((l, i) => <li key={i}>{l.art === 'zweck' || l.art === 'verantwortlicher' || l.art === 'keine' ? <a href="#datenschutz-einstellungen" className="verweis">{l.text}</a> : l.text}</li>)}</ul>
        </div>
      )}
      <p className="knoepfe">
        <a className="knopf primaer" href="/api/werkbank/datenschutz/loeschkonzept?format=pdf">Als PDF erzeugen</a>
        <a className="knopf" href="/api/werkbank/datenschutz/loeschkonzept?format=docx">Als Word-Datei (.docx)</a>
      </p>
    </section>
  );
}
