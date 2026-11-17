import { useMemo, useState, type ReactNode } from 'react';
import {
  EREIGNIS_PERSON,
  PERSONEN_IM_EREIGNIS,
  type Empfaenger,
  type Kontextdaten,
  type MailEmpfaenger,
  type UndKarte,
  type WennKarte,
} from '../../../../shared/src/automatisierung';
import { einzigesZiel, jedeMappe, zieleVon, type Mappentyp } from '../../../../shared/src/model';
import {
  bedingungsfelder,
  beschreibeBedingung,
  OPERATOREN_JE_ART,
  type Bedingung,
  type Bedingungsfeld,
} from '../../../../shared/src/sichten';
import { Feld, HakenFeld, Knopf } from '../../bausteine';
import { useDaten } from '../../daten';
import { t } from '../../sprache';
import { FeldBedingung } from '../Sichten';
import { ohneMappeWenn, sichtenFuer } from './hilfen';

/**
 * Und-Karten einer Automatisierung (#675, #1032; #1279 aus Automatisierungen.tsx gezogen): Bedingung, Ansicht, Favorit,
 * Merkmal, Gruppe – dazu die Wahl der Empfänger, die auch Dann-Karten nutzen.
 */

export function neueUnd(art: string, typ: Mappentyp | null): UndKarte {
  if (art === 'ansicht') return { art: 'ansicht', sicht: '' };
  if (art === 'favorit') return { art: 'favorit', von: { art: 'person', id: '' } };
  if (art === 'gruppe') return { art: 'gruppe', modus: 'eine', karten: [] };
  // Merkmal der Ablage (#1032): „Ablage wird beruflich genutzt“, umkehrbar über „nicht“.
  if (art === 'merkmal') return { art: 'bedingung', bedingung: { art: 'merkmal', merkmal: 'beruflich' } };
  const f = bedingungsfelder(typ ? [typ] : [])[0];
  return { art: 'bedingung', bedingung: { art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] } };
}

/** Und-Karte mit einer Bedingung an einem Feld. */
type FeldUndKarte = Extract<UndKarte, { art: 'bedingung' }> & { bedingung: Extract<Bedingung, { art: 'feld' }> };

/** Bedingung an einem Feld: Feld wählen, dann die Bedingung wie in den Ansichten. */
function FeldUnd({
  u,
  felder,
  aendere,
  titel,
  merke,
}: {
  u: FeldUndKarte;
  felder: Bedingungsfeld[];
  aendere: (n: UndKarte) => void;
  titel: Record<string, string>;
  merke: (mid: string, x: string) => void;
}) {
  const feld = felder.find((f) => f.key === (u.bedingung as Extract<Bedingung, { art: 'feld' }>).feld) as Bedingungsfeld | undefined;
  return (
    <>
      <Feld beschriftung={t('automatisierung.ui.und.feld')} beschriftungVerbergen>
        <select
          value={feld?.key ?? ''}
          onChange={(x) => {
            const f = felder.find((y) => y.key === x.target.value);
            if (f) aendere({ ...u, bedingung: { art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] } });
          }}>
          {!feld && <option value="">–</option>}
          {felder.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </Feld>
      {feld && <FeldBedingung b={u.bedingung} feld={feld} setze={(b) => aendere({ ...u, bedingung: b })} titel={titel} merke={merke} />}
    </>
  );
}

export function UndListe({
  karten,
  typ,
  k,
  setze,
  tief = 0,
}: {
  karten: UndKarte[];
  typ: Mappentyp | null;
  k: Kontextdaten;
  setze: (k: UndKarte[]) => void;
  tief?: number;
}) {
  const d = useDaten();
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (mid: string, x: string) => setTitel((y) => ({ ...y, [mid]: x }));
  const felder = useMemo(() => bedingungsfelder(typ ? [typ] : []), [typ]);
  const aendere = (i: number, n: UndKarte) => setze(karten.map((x, j) => (j === i ? n : x)));
  if (!karten.length) return null;
  return (
    <ol className="bedingungen">
      {karten.map((u, i) => (
        <li key={i} className="karte">
          <div className="bedingungszeile">
            <HakenFeld beschriftung={t('automatisierung.ui.und.nicht')} className="klein">
              <input
                type="checkbox"
                title={t('automatisierung.ui.und.nicht.hilfe')}
                checked={u.nicht === true}
                onChange={(x) => aendere(i, { ...u, nicht: x.target.checked || undefined })}
              />
            </HakenFeld>
            {u.art === 'bedingung' && u.bedingung.art === 'feld' && (
              <FeldUnd u={u as FeldUndKarte} felder={felder} aendere={(n) => aendere(i, n)} titel={titel} merke={merke} />
            )}
            {u.art === 'ansicht' && (
              <Feld beschriftung={t('automatisierung.ui.karte.und.ansicht')} beschriftungVerbergen>
                <select value={u.sicht} onChange={(x) => aendere(i, { ...u, sicht: x.target.value })}>
                  <option value="">{t('automatisierung.ui.und.ansicht.waehlen')}</option>
                  {sichtenFuer(k, typ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Feld>
            )}
            {u.art === 'favorit' && <EmpfaengerWahl e={u.von} typ={typ} k={k} setze={(v) => aendere(i, { ...u, von: v as Empfaenger })} />}
            {u.art === 'gruppe' && (
              <Feld beschriftung={t('automatisierung.ui.und.modus')} beschriftungVerbergen>
                <select value={u.modus} onChange={(x) => aendere(i, { ...u, modus: x.target.value as 'alle' | 'eine' })}>
                  <option value="alle">{t('automatisierung.ui.und.alle')}</option>
                  <option value="eine">{t('automatisierung.ui.und.eine')}</option>
                </select>
              </Feld>
            )}
            <Knopf groesse="klein" symbol="schliessen" onClick={() => setze(karten.filter((_, j) => j !== i))}>
              {t('automatisierung.ui.entfernen')}
            </Knopf>
          </div>
          <p className="leise klein">{undKurz(u, typ, k, (mid) => titel[mid] ?? d.person(mid))}</p>
          {u.art === 'gruppe' && tief === 0 && (
            <div className="einzug">
              <UndListe karten={u.karten} typ={typ} k={k} setze={(x) => aendere(i, { ...u, karten: x })} tief={1} />
              <Feld beschriftung={t('automatisierung.ui.karte.hinzu')} beschriftungVerbergen>
                <select
                  value=""
                  onChange={(x) => {
                    if (x.target.value) aendere(i, { ...u, karten: [...u.karten, neueUnd(x.target.value, typ)] });
                  }}>
                  <option value="">{t('automatisierung.ui.karte.hinzu')}</option>
                  {['bedingung', 'ansicht', 'favorit', 'merkmal'].map((art) => (
                    <option key={art} value={art}>
                      {t.frei(`automatisierung.ui.karte.und.${art}`)}
                    </option>
                  ))}
                </select>
              </Feld>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function empfaengerName(e: Empfaenger, typ: Mappentyp | null, k: Kontextdaten) {
  if (e.art === 'person') return k.benutzer.find((b) => b.id === e.id)?.name ?? '?';
  if (e.art === 'rolle') return t('automatisierung.ui.empfaenger.rolle-name', { name: k.rollen.find((r) => r.id === e.id)?.name ?? '?' });
  if (e.art === 'ersteller') return t('automatisierung.ui.empfaenger.ersteller');
  if (e.art === 'ereignis') return t('automatisierung.ui.empfaenger.ereignis-name', { name: EREIGNIS_PERSON[e.feld] ?? e.feld });
  return t('automatisierung.ui.empfaenger.feld-name', { name: typ?.felder.find((f) => f.key === e.feld)?.label ?? e.feld });
}

function undKurz(u: UndKarte, typ: Mappentyp | null, k: Kontextdaten, titelVon: (id: string) => string): string {
  const nicht = u.nicht ? `${t('automatisierung.ui.und.nicht')}: ` : '';
  if (u.art === 'bedingung') return nicht + beschreibeBedingung(u.bedingung, typ ? [typ] : [], titelVon);
  if (u.art === 'ansicht')
    return nicht + t('automatisierung.ui.und.ansicht.kurz', { name: k.sichten.find((s) => s.id === u.sicht)?.name ?? '?' });
  if (u.art === 'favorit') return nicht + t('automatisierung.ui.und.favorit.kurz', { wer: empfaengerName(u.von, typ, k) });
  return nicht + t.frei(`automatisierung.ui.und.gruppe.${u.modus}`, { anzahl: u.karten.length });
}

/** `extra` (#671, E-Mail): weitere Optionen – „Adresse eingeben“ (`adresse:`) und E-Mail-Felder (`feld:…`). */
export function EmpfaengerWahl({
  e,
  typ,
  k,
  setze,
  wenn,
  extra,
}: {
  e: Empfaenger;
  typ: Mappentyp | null;
  k: Kontextdaten;
  setze: (e: Empfaenger | MailEmpfaenger) => void;
  wenn?: WennKarte;
  extra?: ReactNode;
}) {
  const benutzerTyp = k.typen.find((x) => x.system === 'benutzer');
  const felder = (typ?.felder ?? []).filter(
    (f) => f.typ === 'referenz' && ((!zieleVon(f).length && !jedeMappe(f)) || einzigesZiel(f) === benutzerTyp?.id),
  );
  const ausEreignis = wenn ? (PERSONEN_IM_EREIGNIS[wenn.art] ?? []) : [];
  // Werkbank-Karten (#677) haben keine Mappe: kein Ersteller, keine Felder.
  const ohneMappe = !!wenn && ohneMappeWenn(wenn);
  const wert =
    e.art === 'feld'
      ? `feld:${e.feld}`
      : e.art === 'ereignis'
        ? `ereignis:${e.feld}`
        : e.art === 'ersteller'
          ? 'ersteller:'
          : `${e.art}:${e.id}`;
  return (
    <Feld beschriftung={t('automatisierung.ui.empfaenger')} beschriftungVerbergen>
      <select
        value={wert}
        onChange={(x) => {
          const [art, ...rest] = x.target.value.split(':');
          const v = rest.join(':');
          setze(
            art === 'adresse'
              ? { art: 'adresse', adresse: '' }
              : art === 'feld'
                ? { art: 'feld', feld: v }
                : art === 'ereignis'
                  ? { art: 'ereignis', feld: v }
                  : art === 'ersteller'
                    ? { art: 'ersteller' }
                    : { art: art as 'person' | 'rolle', id: v },
          );
        }}>
        <option value="person:">{t('automatisierung.ui.empfaenger.waehlen')}</option>
        {extra}
        {!ohneMappe && <option value="ersteller:">{t('automatisierung.ui.empfaenger.ersteller')}</option>}
        {ausEreignis.length > 0 && (
          <optgroup label={t('automatisierung.ui.empfaenger.ereignis')}>
            {ausEreignis.map((p) => (
              <option key={p} value={`ereignis:${p}`}>
                {EREIGNIS_PERSON[p] ?? p}
              </option>
            ))}
          </optgroup>
        )}
        {felder.length > 0 && (
          <optgroup label={t('automatisierung.ui.empfaenger.felder')}>
            {felder.map((f) => (
              <option key={f.key} value={`feld:${f.key}`}>
                {f.label}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={t('automatisierung.ui.empfaenger.personen')}>
          {k.benutzer
            .filter((b) => b.aktiv !== false)
            .map((b) => (
              <option key={b.id} value={`person:${b.id}`}>
                {b.name}
              </option>
            ))}
        </optgroup>
        <optgroup label={t('automatisierung.ui.empfaenger.rollen')}>
          {k.rollen.map((r) => (
            <option key={r.id} value={`rolle:${r.id}`}>
              {r.name}
            </option>
          ))}
        </optgroup>
      </select>
    </Feld>
  );
}
