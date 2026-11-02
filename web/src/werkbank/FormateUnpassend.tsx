import { useEffect, useState } from 'react';
import { api } from '../api';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { t } from '../sprache';

type Liste = Awaited<ReturnType<typeof api.formateUnpassend>>['typen'];

/**
 * Wartung „Angaben, die nicht zum Format passen“ (#535): Ein neues Format oder neue Datumsgrenzen machen
 * gespeicherte Angaben nicht ungültig. Hier stehen sie je Mappentyp und Feld, mit Sprung zur Mappe.
 */
export function FormateUnpassend() {
  const [liste, setListe] = useState<Liste | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { api.formateUnpassend().then((r) => setListe(r.typen), (e: Error) => setFehler(e.message)); }, []);
  return (
    <section className="blatt" id="formate">
      <h2 className="h3">{t('felder.wartung.titel')} <Hilfe ort="werkbank.wartung.formate" /></h2>
      <p className="leise">{t('felder.wartung.text')}</p>
      {fehler ? <p className="fehlertext" role="alert">{fehler}</p>
        : liste === null ? <p className="leise">{t('felder.wartung.laedt')}</p>
        : !liste.length ? <p className="leise">{t('felder.wartung.leer')}</p>
        : liste.map((typ) => (
          <div key={typ.typId} className="ff-typ">
            <h3 className="h4">{typ.typ}</h3>
            {typ.felder.map((f) => (
              <details key={f.key} className="aufklappbereich ff-feld">
                <summary>{t('felder.wartung.feld', { feld: f.label, anzahl: f.anzahl })}</summary>
                <div className="tabellenrahmen festhoehe">
                  <table className="ff-tabelle">
                    <thead><tr><th>{t('felder.wartung.spalte.mappe')}</th><th>{t('felder.wartung.spalte.wert')}</th><th>{t('felder.wartung.spalte.grund')}</th></tr></thead>
                    <tbody>{f.mappen.map((m) => (
                      <tr key={m.id}>
                        <td><Link to={`/ablage/${typ.typId}/${m.id}`} className="verweis">{titelOder(m.titel)}</Link></td>
                        <td className="ff-wert">{m.wert}</td><td>{m.grund}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {f.anzahl > f.mappen.length && <p className="leise klein">{t('felder.wartung.mehr')}</p>}
              </details>
            ))}
          </div>
        ))}
    </section>
  );
}
