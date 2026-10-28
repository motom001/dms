import { useEffect, useState } from 'react';
import { api } from '../api';
import { Link } from '../ort';

/**
 * Lesbare API-Dokumentation (#20), erzeugt aus /api/openapi.json der
 * installierten Version – ohne fremde Bibliothek.
 */
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function ApiDoku() {
  const [doc, setDoc] = useState<J | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { api.openapi().then(setDoc).catch((e) => setFehler((e as Error).message)); }, []);
  if (fehler) return <div className="hinweis schlecht"><p>{fehler}</p></div>;
  if (!doc) return <p className="leise">Lade …</p>;
  const basis = `${location.origin}${doc.servers?.[0]?.url ?? '/api/v1'}`;
  const gruppen = (doc.tags as Array<{ name: string; description: string }>).map((t) => ({
    ...t,
    ops: Object.entries(doc.paths as J).flatMap(([pfad, ms]) => Object.entries(ms as J).filter(([, op]) => (op as J).tags?.includes(t.name)).map(([m, op]) => ({ pfad, m, op: op as J }))),
  }));
  return (
    <div className="einspaltig apidoku">
      <div className="mappenkopf">
        <p className="ueber"><Link to="/profil/sicherheit" className="verweis">Profil</Link> › API</p>
        <h1>{doc.info.title} <span className="chip">Version {doc.info.version}</span></h1>
        <p className="leise">{doc.info.description}</p>
        <p className="klein">Adresse: <span className="mono">{basis}</span> · Beschreibung als Datei: <a className="verweis" href="/api/openapi.json" target="_blank" rel="noreferrer">openapi.json</a> (OpenAPI {doc.openapi}) – lässt sich z. B. in Postman oder Bruno importieren.</p>
      </div>
      <div className="blatt">
        <h2 className="h3">Erster Aufruf</h2>
        <pre className="protokolldaten">{`curl -H "Authorization: Bearer dms_…" ${basis}/ich`}</pre>
      </div>
      {gruppen.map((g) => (
        <section key={g.name} className="blatt">
          <h2 className="h3">{g.name}</h2>
          <p className="leise">{g.description}</p>
          {g.ops.map(({ pfad, m, op }) => (
            <details key={`${m}${pfad}`} className="apiop">
              <summary><span className={`methode m-${m}`}>{m.toUpperCase()}</span> <span className="mono">{pfad}</span> <span className="leise">{op.summary}</span></summary>
              <div className="apiinhalt">
                {op.description && <p>{op.description}</p>}
                {op.parameters?.length > 0 && (
                  <table><thead><tr><th>Parameter</th><th>Ort</th><th>Typ</th><th>Beschreibung</th></tr></thead>
                    <tbody>{(op.parameters as J[]).map((p) => <tr key={p.name}><td className="mono">{p.name}{p.required && <span className="pflicht">*</span>}</td><td>{p.in === 'path' ? 'Pfad' : 'Abfrage'}</td><td className="mono">{p.schema.type}</td><td>{p.description}</td></tr>)}</tbody>
                  </table>
                )}
                {op.requestBody && <><h3 className="klein ueber">Inhalt der Anfrage</h3><Schema s={inhaltSchema(op.requestBody)} doc={doc} /></>}
                <h3 className="klein ueber">Antworten</h3>
                <ul className="antworten">
                  {Object.entries(op.responses as J).map(([code, r]) => (
                    <li key={code}><span className={`chip ${code.startsWith('2') ? 'gut' : 'warn'}`}>{code}</span> {(r as J).description}
                      {code.startsWith('2') && (r as J).content && <Schema s={inhaltSchema(r as J)} doc={doc} />}</li>
                  ))}
                </ul>
                <pre className="protokolldaten">{beispiel(m, pfad, op, basis)}</pre>
              </div>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}

function inhaltSchema(x: J): J {
  const c = x.content ?? {};
  return (c['application/json'] ?? c['application/octet-stream'])?.schema ?? {};
}

const name = (ref: string) => ref.split('/').pop()!;

/** Schema zum Aufklappen: Felder mit Typ und Beschreibung, Verweise auf andere Schemas lösen sich auf. */
function Schema({ s, doc, tiefe = 0 }: { s: J; doc: J; tiefe?: number }) {
  if (s.$ref) {
    const n = name(s.$ref);
    return <details className="schema" open={tiefe === 0}><summary className="mono">{n}</summary><Schema s={doc.components.schemas[n]} doc={doc} tiefe={tiefe + 1} /></details>;
  }
  if (s.allOf) return <>{(s.allOf as J[]).map((x, i) => <Schema key={i} s={x} doc={doc} tiefe={tiefe} />)}</>;
  if (s.type === 'array') return <div className="klein">Liste von <Schema s={s.items} doc={doc} tiefe={tiefe} /></div>;
  if (s.format === 'binary') return <p className="klein mono">Datei (Bytes)</p>;
  if (s.type === 'object' && s.properties) {
    return (
      <ul className="schemafelder">
        {Object.entries(s.properties as J).map(([k, v]) => (
          <li key={k}><span className="mono">{k}</span>{s.required?.includes(k) && <span className="pflicht">*</span>} <span className="leise klein">{typText(v as J)}</span>
            {(v as J).description && <span className="klein"> – {(v as J).description}</span>}
            {tiefe < 3 && ((v as J).$ref || (v as J).items?.$ref) && <Schema s={(v as J).$ref ? v as J : (v as J).items} doc={doc} tiefe={tiefe + 1} />}
          </li>
        ))}
      </ul>
    );
  }
  return <p className="klein">{typText(s)}{s.description ? ` – ${s.description}` : ''}{s.example ? <><br /><span className="mono">{JSON.stringify(s.example)}</span></> : null}</p>;
}

function typText(v: J): string {
  if (v.$ref) return name(v.$ref);
  if (v.type === 'array') return `Liste von ${v.items?.$ref ? name(v.items.$ref) : v.items?.type ?? '…'}`;
  if (v.enum) return v.enum.join(' | ');
  return [v.type, v.format].filter(Boolean).join(', ') || 'beliebig';
}

function beispiel(m: string, pfad: string, op: J, basis: string) {
  const ziel = `${basis}${pfad.replace('{id}', '<id>')}${op.parameters?.some((p: J) => p.name === 'sicht') ? '?sicht=<typ-id>' : ''}`;
  const zeilen = [`curl -X ${m.toUpperCase()} "${ziel}"`, '  -H "Authorization: Bearer dms_…"'];
  const body = op.requestBody?.content;
  if (body?.['application/json']) zeilen.push('  -H "Content-Type: application/json"', `  -d '${JSON.stringify(m === 'post' && pfad === '/mappen' ? { typId: '<typ-id>', werte: { name: 'Beispiel' } } : { werte: {} })}'`);
  if (body?.['application/octet-stream']) zeilen.push('  -H "Content-Type: application/octet-stream"', '  --data-binary @rechnung.pdf');
  return zeilen.join(' \\\n');
}
