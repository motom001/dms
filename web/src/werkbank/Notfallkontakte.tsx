import { useCallback, useEffect, useState } from 'react';
import { betriebApi, type NotfallkontaktErgebnis } from '../api/betrieb';
import { Knopf, KnopfLink, type KnopfErgebnis } from '../bausteine';
import { eingabeFehler, KontaktFormular, leererKontakt } from './NotfallkontaktFormular';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto';
import { t } from '../sprache';
import { erreichbar, NOTFALLKONTAKTE_MAX, type Notfallkontakt, type NotfallkontaktEingabe, type NotfallkontakteStand } from '../../../shared/src/notfallkontakte';
import { zeit } from './Sicherung';

/**
 * Notfallkontakte (#812): Werkbank → Verschlüsselung, Abschnitt „Notfallkontakte“ (beim Notfallblatt, #993). Das
 * Formular (NotfallkontaktFormular.tsx) benutzt auch der Einrichtungsassistent. Keine Rechte, kein Konto, kein Link –
 * nur eine Info-Mail und der Eintrag auf dem Notfallblatt.
 */

const ERGEBNIS: Record<NotfallkontaktErgebnis['mail'], string> = {
  verschickt: 'werkbank.notfallkontakte.ergebnis.verschickt', offen: 'werkbank.notfallkontakte.ergebnis.offen', fehler: 'werkbank.notfallkontakte.ergebnis.fehler',
  keine: 'werkbank.notfallkontakte.ergebnis.gespeichert', grenze: 'werkbank.notfallkontakte.ergebnis.grenze',
};

/** Was mit der Info-Mail ist – eine Zeile unter dem Kontakt. */
function MailStand({ k, versand }: { k: Notfallkontakt; versand: boolean }) {
  if (k.mailStand === 'verschickt' && k.mailAm) return <span className="leise klein">{t('werkbank.notfallkontakte.mail.verschickt', { zeit: zeit(k.mailAm) })}</span>;
  if (k.mailStand === 'fehler') return <span className="fehlertext klein">{t('werkbank.notfallkontakte.mail.fehler', { fehler: k.mailFehler ?? '' })}</span>;
  return <span className="leise klein">{versand ? t('werkbank.notfallkontakte.mail.wartet') : t('werkbank.notfallkontakte.mail.offen')}</span>;
}

/** Abschnitt in Werkbank → Verschlüsselung. `geaendert`: nach jeder Änderung (Notfallblatt-Hinweis neu laden). */
export function NotfallkontakteAbschnitt({ geaendert }: { geaendert(): void }) {
  const { ich } = useKonto();
  const [stand, setStand] = useState<NotfallkontakteStand | null>(null);
  const [ladefehler, setLadefehler] = useState<string>();
  const [form, setForm] = useState<{ id: string | null; wert: NotfallkontaktEingabe; antwortSperre?: string } | null>(null);
  const [fehler, setFehler] = useState<string[]>();
  const [ergebnis, setErgebnis] = useState<KnopfErgebnis | null>(null);

  const laden = useCallback(async () => {
    try { setStand(await betriebApi.notfallkontakte()); setLadefehler(undefined); } catch (e) { setLadefehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  const nachher = async (r: NotfallkontaktErgebnis, text?: string) => {
    setErgebnis({ art: r.mail === 'fehler' ? 'warn' : 'gut', text: text ?? t.frei(ERGEBNIS[r.mail]) });
    await laden();
    geaendert();
  };

  async function speichern() {
    if (!form) return;
    const f = eingabeFehler(form.wert);
    setFehler(f);
    if (f.length) return;
    const r = form.id ? await betriebApi.notfallkontaktAendern(form.id, form.wert) : await betriebApi.notfallkontaktAnlegen(form.wert);
    setForm(null);
    await nachher(r);
  }

  async function loeschen(k: Notfallkontakt) {
    const r = await betriebApi.notfallkontaktLoeschen(k.id);
    await nachher(r, r.mail === 'verschickt' ? t('werkbank.notfallkontakte.ergebnis.geloescht-mail') : r.mail === 'grenze' ? undefined : t('werkbank.notfallkontakte.ergebnis.geloescht'));
  }

  const voll = !!stand && stand.kontakte.length >= stand.max;
  return (
    <section className="blatt" id="notfallkontakte">
      <h2 className="h3">{t('werkbank.notfallkontakte.titel')} <Hilfe ort="verschluesselung.notfallkontakte" /></h2>
      <p className="leise">{t('werkbank.notfallkontakte.text')}</p>
      {ladefehler && <div className="hinweis schlecht"><p>{ladefehler}</p></div>}
      {stand && !stand.versand && (
        <div className="hinweis info">
          <p>{t('werkbank.notfallkontakte.ohne-versand')}</p>
          <KnopfLink to="/werkbank/betrieb" groesse="klein">{t('werkbank.notfallkontakte.versand-einrichten')}</KnopfLink>
        </div>
      )}
      {stand?.blattVeraltet && <div className="hinweis warn" role="status"><p>{t('werkbank.notfallkontakte.blatt-neu')} <a className="verweis" href="#notfallblatt">{t('werkbank.notfallkontakte.zum-blatt')}</a></p></div>}
      {stand && !stand.kontakte.length && !form && <p className="leise">{t('werkbank.notfallkontakte.leer')}</p>}
      {stand && stand.kontakte.length > 0 && (
        <ul className="liste-einfach">
          {stand.kontakte.map((k) => (
            <li key={k.id} data-kontakt={k.id}>
              <strong>{k.name}</strong> <span>{erreichbar(k)}</span>
              {k.notiz && <div className="leise klein">{k.notiz}</div>}
              <div className="leise klein">{t('werkbank.notfallkontakte.eingetragen', { name: k.eingetragenVonName || '–' })}{k.antwortAn ? ` · ${t('werkbank.notfallkontakte.antwort.an', { name: k.eingetragenVonName || '–' })}` : ''}</div>
              <div><MailStand k={k} versand={stand.versand} /></div>
              {form?.id !== k.id && (
                <div className="knoepfe">
                  <Knopf groesse="klein" onClick={() => { setFehler(undefined); setForm({ id: k.id, wert: { name: k.name, email: k.email, telefon: k.telefon, notiz: k.notiz, antwortAn: k.antwortAn }, antwortSperre: k.eingetragenVon !== ich.id ? t('werkbank.notfallkontakte.antwort.hinweis') : undefined }); }}>{t('werkbank.notfallkontakte.aendern')}</Knopf>
                  {stand.versand && <Knopf groesse="klein" gesperrt={k.erneutMoeglich ? false : t('werkbank.notfallkontakte.erneut.heute')}
                    onClick={async () => { await betriebApi.notfallkontaktErneut(k.id); await laden(); return { art: 'gut', text: t('werkbank.notfallkontakte.ergebnis.erneut') }; }}>{t('werkbank.notfallkontakte.erneut')}</Knopf>}
                  <Knopf art="gefahr" groesse="klein" symbol="geloescht" onClick={() => loeschen(k)}
                    rueckfrage={{ titel: t('werkbank.notfallkontakte.loeschen.titel'), text: t('werkbank.notfallkontakte.loeschen.text', { name: k.name }), ja: t('werkbank.notfallkontakte.loeschen') }}>{t('werkbank.notfallkontakte.loeschen')}</Knopf>
                </div>
              )}
              {form?.id === k.id && <Bearbeiten form={form} setForm={setForm} fehler={fehler} speichern={speichern} />}
            </li>
          ))}
        </ul>
      )}
      {form && form.id === null && <Bearbeiten form={form} setForm={setForm} fehler={fehler} speichern={speichern} />}
      {!form && stand && (
        <div className="knoepfe">
          <Knopf art="anlegen" groesse="klein" gesperrt={voll ? t('werkbank.notfallkontakte.max', { max: NOTFALLKONTAKTE_MAX }) : false} ergebnis={ergebnis}
            onClick={() => { setErgebnis(null); setFehler(undefined); setForm({ id: null, wert: leererKontakt() }); }}>{t('werkbank.notfallkontakte.neu')}</Knopf>
        </div>
      )}
    </section>
  );
}

type Form = { id: string | null; wert: NotfallkontaktEingabe; antwortSperre?: string };
function Bearbeiten({ form, setForm, fehler, speichern }: { form: Form; setForm(f: Form | null): void; fehler?: string[]; speichern(): Promise<void> }) {
  return (
    <div className="stapel">
      <KontaktFormular wert={form.wert} setze={(w) => setForm({ ...form, wert: w })} antwortSperre={form.antwortSperre} fehler={fehler} />
      <div className="knoepfe">
        <Knopf art="haupt" onClick={speichern}>{t('werkbank.notfallkontakte.speichern')}</Knopf>
        <Knopf art="link" onClick={() => setForm(null)}>{t('werkbank.notfallkontakte.abbrechen')}</Knopf>
      </div>
    </div>
  );
}
