import { useState, type DragEvent as ReactDragEvent } from 'react';
import { formatiere, type Feld as FeldDef } from '../../../../shared/src/model';
import { formatFehler, mitSchema, telefonLink } from '../../../../shared/src/feldformate';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { farbeVon, liesNutzlast, useBruecke, ziehtWert } from '../bruecke';

/**
 * Feld auf der Seite „Dokument übernehmen“ (#934): leuchtet auf, wenn man über seinen Rahmen am Dokument fährt (und
 * lässt beim Überfahren seine Rahmen aufleuchten), merkt sich als zuletzt gewähltes Feld, nimmt Werte vom Dokument
 * an (Ziehen) und zeigt die Nummern seiner Rahmen. Ohne Seite (überall sonst) nichts davon.
 */
export function useUebernahmeFeld(f: FeldDef, gesperrt: boolean) {
  const b = useBruecke();
  const [drueber, setDrueber] = useState(false);
  if (!b || gesperrt) return { klasse: '', props: {}, nummern: null, unter: null };
  const marken = b.marken.filter((m) => m.feldKey === f.key);
  return {
    klasse: `${b.hervor === f.key ? ' ue-hervor' : ''}${b.aktiv === f.key ? ' ue-aktiv' : ''}${drueber ? ' ue-drueber' : ''}`,
    props: {
      onMouseEnter: () => b.setHervor(f.key),
      onMouseLeave: () => b.setHervor(null),
      onFocusCapture: () => b.setAktiv(f.key),
      onPointerDownCapture: () => b.setAktiv(f.key),
      onDragOver: (e: ReactDragEvent) => {
        if (!ziehtWert(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!drueber) setDrueber(true);
      },
      onDragLeave: (e: ReactDragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrueber(false);
      },
      onDrop: (e: ReactDragEvent) => {
        const n = ziehtWert(e) ? liesNutzlast(e) : null;
        if (!n) return;
        e.preventDefault();
        setDrueber(false);
        b.setAktiv(f.key);
        b.nimm(f, n);
      },
    },
    nummern: marken.length ? (
      <span className="ue-nummern">
        {marken.map((m) => (
          <span key={m.nr} className={`ue-nr ${farbeVon(m.nr)}`} title={t('ablage.uebernehmen.rahmen-nr', { nr: m.nr })}>
            {m.nr}
          </span>
        ))}
      </span>
    ) : null,
    unter: b.unterFeld(f),
  };
}

/** Link zu einer Angabe mit Format (#535): mailto:, tel: oder die Internetseite (neuer Tab). */
export function FormatLink({ f, wert, nurSymbol }: { f: FeldDef; wert: string; nurSymbol?: boolean }) {
  const href = f.format === 'email' ? `mailto:${wert}` : f.format === 'telefon' ? telefonLink(wert) : mitSchema(wert);
  const text = t(
    f.format === 'email'
      ? 'felder.eingabe.link.email'
      : f.format === 'telefon'
        ? 'felder.eingabe.link.telefon'
        : 'felder.eingabe.link.internetseite',
    { wert },
  );
  const extern = f.format === 'internetseite' ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return nurSymbol ? (
    <a href={href} className="ff-link" aria-label={text} title={text} {...extern}>
      <Symbol name={f.format === 'email' ? 'email' : f.format === 'telefon' ? 'telefon' : 'extern'} />
    </a>
  ) : (
    <a href={href} className="verweis" title={text} {...extern}>
      {wert}
    </a>
  );
}

/** Nur lesbare Angabe mit Format (#535): E-Mail, Telefon und Internetseite als Link, IBAN in Vierergruppen. */
export function FormatWert({ f, wert }: { f: FeldDef; wert: string }) {
  if (!wert) return null;
  if ((f.format === 'email' || f.format === 'telefon' || f.format === 'internetseite') && !formatFehler(f, wert, { felder: [], werte: {} }))
    return <FormatLink f={f} wert={wert} />;
  return <>{formatiere(f, wert)}</>;
}
