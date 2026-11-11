/**
 * Nachgebildeter Authenticator für Tests der Passkeys (#811): ein P-256-Schlüsselpaar, eine Kennung, ein Zähler –
 * Attestation „none“, wie sie Handys und Passwortmanager meist liefern. Dazu ein kleines CBOR (nur, was ein
 * Authenticator braucht).
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

export const b64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const STANDARD_ORIGIN = 'https://ablago.example.org';

function kopf(art: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(art << 5) | n]);
  if (n < 256) return Buffer.from([(art << 5) | 24, n]);
  if (n < 65536) { const b = Buffer.alloc(3); b[0] = (art << 5) | 25; b.writeUInt16BE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = (art << 5) | 26; b.writeUInt32BE(n, 1); return b;
}
type Cbor = number | string | Buffer | Cbor[] | Map<Cbor, Cbor>;
function cbor(x: Cbor): Buffer {
  if (typeof x === 'number') return x >= 0 ? kopf(0, x) : kopf(1, -1 - x);
  if (typeof x === 'string') { const b = Buffer.from(x, 'utf8'); return Buffer.concat([kopf(3, b.length), b]); }
  if (Buffer.isBuffer(x)) return Buffer.concat([kopf(2, x.length), x]);
  if (Array.isArray(x)) return Buffer.concat([kopf(4, x.length), ...x.map(cbor)]);
  return Buffer.concat([kopf(5, x.size), ...[...x].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
}

/** Nachgebildeter Authenticator: ein Schlüsselpaar, eine Kennung, ein Zähler. */
export class Authenticator {
  private schluessel: { publicKey: KeyObject; privateKey: KeyObject } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  readonly kennung = randomBytes(16);
  zaehler = 0;
  /** Nutzer-Verifizierung (PIN, Fingerabdruck) melden? */
  uv = true;
  /** Die Konto-Kennung, die das Gerät beim Anlegen bekam. */
  private nutzer = '';

  private cose(): Buffer {
    const j = this.schluessel.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    return cbor(new Map<Cbor, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(j.x, 'base64url')], [-3, Buffer.from(j.y, 'base64url')]]));
  }
  private authData(rpId: string, mitSchluessel: boolean): Buffer {
    const z = Buffer.alloc(4); z.writeUInt32BE(this.zaehler >>> 0);
    const flags = 0x01 | (this.uv ? 0x04 : 0) | (mitSchluessel ? 0x40 : 0);
    const teile: Buffer[] = [createHash('sha256').update(rpId).digest(), Buffer.from([flags]), z];
    if (mitSchluessel) {
      const laenge = Buffer.alloc(2); laenge.writeUInt16BE(this.kennung.length);
      teile.push(Buffer.alloc(16), laenge, this.kennung, this.cose());
    }
    return Buffer.concat(teile);
  }
  private client(art: string, challenge: string, origin: string) { return Buffer.from(JSON.stringify({ type: art, challenge, origin, crossOrigin: false })); }

  anlegen(o: { challenge: string; rp: { id?: string }; user: { id: string } }, origin = STANDARD_ORIGIN, rpId = o.rp.id!) {
    this.nutzer = o.user.id;
    const authData = this.authData(rpId, true);
    return {
      id: b64(this.kennung), rawId: b64(this.kennung), type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: b64(this.client('webauthn.create', o.challenge, origin)),
        attestationObject: b64(cbor(new Map<Cbor, Cbor>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))),
        transports: ['internal'],
      },
    };
  }

  anmelden(o: { challenge: string; rpId?: string }, origin = STANDARD_ORIGIN, rpId = o.rpId!, zaehlen = true) {
    if (zaehlen) this.zaehler++;
    const authData = this.authData(rpId, false);
    const cd = this.client('webauthn.get', o.challenge, origin);
    const signatur = sign('sha256', Buffer.concat([authData, createHash('sha256').update(cd).digest()]), this.schluessel.privateKey);
    return {
      id: b64(this.kennung), rawId: b64(this.kennung), type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64(cd), authenticatorData: b64(authData), signature: b64(signatur), userHandle: this.nutzer },
    };
  }
}

