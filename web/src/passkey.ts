import { t } from './sprache';

/**
 * Passkeys im Browser (#811): die eingebaute WebAuthn-Schnittstelle (`navigator.credentials`), ohne fremde Bibliothek.
 * Der Server liefert Optionen im JSON-Format von WebAuthn; hier werden sie zu den Objekten, die der Browser erwartet,
 * und die Antwort des Geräts wieder zu JSON. Neuere Browser können das selbst (`parse…FromJSON`, `toJSON`) – dann
 * nehmen wir das, sonst die kleinen Umwandlungen unten.
 */

/** Gehen Passkeys in diesem Browser auf dieser Seite? Nur in einem sicheren Kontext (HTTPS oder localhost). */
export function passkeysImBrowser(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true && typeof window.PublicKeyCredential === 'function' && !!navigator.credentials;
}

const ausB64 = (s: string): ArrayBuffer => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u.buffer;
};
const zuB64 = (x: ArrayBuffer | null | undefined): string | undefined => {
  if (!x) return undefined;
  let s = '';
  for (const c of new Uint8Array(x)) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

type Statisch = typeof PublicKeyCredential & {
  parseCreationOptionsFromJSON?: (o: PublicKeyCredentialCreationOptionsJSON) => PublicKeyCredentialCreationOptions;
  parseRequestOptionsFromJSON?: (o: PublicKeyCredentialRequestOptionsJSON) => PublicKeyCredentialRequestOptions;
};
const pkc = () => window.PublicKeyCredential as Statisch;

function erstellOptionen(o: PublicKeyCredentialCreationOptionsJSON): PublicKeyCredentialCreationOptions {
  const f = pkc().parseCreationOptionsFromJSON;
  if (f) return f(o);
  return {
    ...o, challenge: ausB64(o.challenge), user: { ...o.user, id: ausB64(o.user.id) },
    excludeCredentials: o.excludeCredentials?.map((c) => ({ ...c, id: ausB64(c.id), transports: c.transports as AuthenticatorTransport[] | undefined })),
  } as PublicKeyCredentialCreationOptions;
}

function anfrageOptionen(o: PublicKeyCredentialRequestOptionsJSON): PublicKeyCredentialRequestOptions {
  const f = pkc().parseRequestOptionsFromJSON;
  if (f) return f(o);
  return {
    ...o, challenge: ausB64(o.challenge),
    allowCredentials: o.allowCredentials?.map((c) => ({ ...c, id: ausB64(c.id), transports: c.transports as AuthenticatorTransport[] | undefined })),
  } as PublicKeyCredentialRequestOptions;
}

/** Antwort des Geräts als JSON – wie `PublicKeyCredential.toJSON()`. */
function alsJson(c: PublicKeyCredential): unknown {
  const eigen = (c as PublicKeyCredential & { toJSON?: () => unknown }).toJSON;
  if (typeof eigen === 'function') return eigen.call(c);
  const r = c.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  const response: Record<string, unknown> = { clientDataJSON: zuB64(r.clientDataJSON) };
  if ('attestationObject' in r && r.attestationObject) {
    response.attestationObject = zuB64(r.attestationObject);
    response.transports = typeof r.getTransports === 'function' ? r.getTransports() : [];
  } else {
    response.authenticatorData = zuB64(r.authenticatorData);
    response.signature = zuB64(r.signature);
    response.userHandle = zuB64(r.userHandle);
  }
  return { id: c.id, rawId: zuB64(c.rawId), type: c.type, response, authenticatorAttachment: c.authenticatorAttachment ?? undefined, clientExtensionResults: c.getClientExtensionResults?.() ?? {} };
}

/** Lesbarer Text, wenn das Gerät nicht mitmacht: abgebrochen, schon vorhanden, falsche Adresse. */
export function passkeyFehler(e: unknown): Error {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return new Error(t('anmeldung.passkey.abgebrochen'));
  if (name === 'InvalidStateError') return new Error(t('anmeldung.passkey.schon-da'));
  if (name === 'SecurityError') return new Error(t('anmeldung.passkey.adresse'));
  return e instanceof Error ? e : new Error(String(e));
}

/** Neuen Passkey auf dem Gerät anlegen; liefert die Antwort für den Server. */
export async function passkeyAnlegen(o: PublicKeyCredentialCreationOptionsJSON): Promise<unknown> {
  try {
    const c = await navigator.credentials.create({ publicKey: erstellOptionen(o) });
    if (!c) throw new DOMException('', 'NotAllowedError');
    return alsJson(c as PublicKeyCredential);
  } catch (e) { throw passkeyFehler(e); }
}

/** Mit einem Passkey bestätigen (Anmeldung, zweiter Schritt, erneute Anmeldung); liefert die Antwort für den Server. */
export async function passkeyVerwenden(o: PublicKeyCredentialRequestOptionsJSON): Promise<unknown> {
  try {
    const c = await navigator.credentials.get({ publicKey: anfrageOptionen(o) });
    if (!c) throw new DOMException('', 'NotAllowedError');
    return alsJson(c as PublicKeyCredential);
  } catch (e) { throw passkeyFehler(e); }
}

/** Vorschlag für den Namen eines neuen Passkeys: Art des Geräts aus dem Browser, z. B. „iPhone“ oder „Windows“. */
export function geraetename(): string {
  const ua = navigator.userAgent;
  const art = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return art ? t('profil.passkeys.name.vorschlag', { art }) : '';
}
