import { useCallback, useEffect, useState } from 'react';
import { api, type AnmeldeschutzStand, type SperrEinstellung } from '../api';
import { Hilfe } from '../Hilfe';

/** Werkbank → Anmeldeschutz (#240): Fehlversuche je Konto und je IP, gesperrte IPs, Ausnahmen. */

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export function useAnmeldeschutz(offen: boolean) {
  const [stand, setStand] = useState<AnmeldeschutzStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.anmeldeschutz()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => { if (!offen) return; const t = setInterval(() => void laden(), 30_000); return () => clearInterval(t); }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type AnmeldeschutzZustand = ReturnType<typeof useAnmeldeschutz>;

export function AnmeldeschutzListe({ z }: { z: AnmeldeschutzZustand }) {
  const s = z.stand;
  return (
    <>
      <div className="listenkopf"><div><h1>Anmeldeschutz</h1><p className="leise klein">Gesperrte IP-Adressen. <Hilfe ort="werkbank.anmeldeschutz" /></p></div></div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!s ? <p className="leise">Lade …</p> : !s.gesperrt.length ? <p className="leise leerliste">Gerade ist keine Adresse gesperrt.</p> : (
        <ul className="mappenliste">
          {s.gesperrt.map((g) => (
            <li key={g.ip}><span className="eintrag werk">
              <span className="titel mono">{g.ip}</span>
              <span className="unter">seit {zeit(g.seit)} · {g.bis ? `bis ${zeit(g.bis)}` : 'bis entsperrt'}</span>
            </span></li>
          ))}
        </ul>
      )}
    </>
  );
}

export function AnmeldeschutzPanel({ z }: { z: AnmeldeschutzZustand }) {
  const s = z.stand;
  const [e, setE] = useState<(Omit<SperrEinstellung, 'ausnahmen'> & { ausnahmen: string }) | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { if (s && !e) setE({ ...s.einstellung, ausnahmen: s.einstellung.ausnahmen.join(', ') }); }, [s, e]);
  if (!s || !e) return <p className="leise">Lade …</p>;
  async function speichern() {
    try { const n = await api.anmeldeschutzSetzen({ ...e!, ausnahmen: e!.ausnahmen.split(/[\s,;]+/).filter(Boolean) }); z.setStand(n); setMeldung({ art: 'gut', text: 'Gespeichert.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function entsperren(ip: string) {
    try { z.setStand(await api.entsperren(ip)); setMeldung({ art: 'gut', text: `${ip} entsperrt.` }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const zahl = (wert: number, f: (n: number) => void, min: number, id: string) => <input id={id} type="number" min={min} value={wert} onChange={(x) => f(Number(x.target.value))} />;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Anmeldeschutz</h1>
        <p className="leise">Nach zu vielen falschen Passwörtern sperrt das DMS die Anmeldung – je E-Mail-Adresse und IP und zusätzlich je IP über alle Adressen. Sperren überstehen einen Neustart. Deine Adresse gerade: <code>{s.deineIp}</code></p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {s.gesperrt.length > 0 && (
        <div className="blatt">
          <h2 className="h3">Gesperrte Adressen</h2>
          <ul className="stapel">
            {s.gesperrt.map((g) => (
              <li key={g.ip}><strong className="mono">{g.ip}</strong> – {g.grund}; seit {zeit(g.seit)}, {g.bis ? `bis ${zeit(g.bis)}` : 'bis entsperrt'}{' '}
                <button type="button" className="knopf klein" onClick={() => void entsperren(g.ip)}>Entsperren</button></li>
            ))}
          </ul>
        </div>
      )}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }}>
        <h2 className="h3">Je E-Mail-Adresse und IP</h2>
        <div className="raster">
          <label className="eigenschaft"><span>Fehlversuche</span>{zahl(e.konto.versuche, (n) => setE({ ...e, konto: { ...e.konto, versuche: n } }), 1, 'as-konto-versuche')}</label>
          <label className="eigenschaft"><span>Sperre <small>in Minuten</small></span>{zahl(e.konto.minuten, (n) => setE({ ...e, konto: { ...e.konto, minuten: n } }), 1, 'as-konto-minuten')}</label>
        </div>
        <h2 className="h3">Je IP-Adresse, über alle E-Mail-Adressen</h2>
        <div className="raster">
          <label className="eigenschaft"><span>Fehlversuche</span>{zahl(e.ip.versuche, (n) => setE({ ...e, ip: { ...e.ip, versuche: n } }), 1, 'as-ip-versuche')}</label>
          <label className="eigenschaft"><span>Sperre <small>in Minuten, 0 = dauerhaft bis entsperrt</small></span>{zahl(e.ip.minuten, (n) => setE({ ...e, ip: { ...e.ip, minuten: n } }), 0, 'as-ip-minuten')}</label>
        </div>
        <label className="eigenschaft"><span>Nie sperren <small>Adressen oder Netze, z. B. 192.168.0.0/16 – dein Heimnetz</small></span>
          <input id="as-ausnahmen" value={e.ausnahmen} placeholder="192.168.0.0/16, 10.0.0.0/8" onChange={(x) => setE({ ...e, ausnahmen: x.target.value })} /></label>
        <label className="haken"><input id="as-mail" type="checkbox" checked={e.mail} onChange={(x) => setE({ ...e, mail: x.target.checked })} /><span>Administratoren per Mail informieren, wenn eine IP gesperrt wird</span></label>
        <div className="knoepfe"><button className="knopf primaer">Speichern</button></div>
      </form>
    </div>
  );
}
