/*
 * Form der IMAP-Verbindung und der gelesenen Mail (#1278, Schritt 5b; vorher in postfach.ts): für imap.ts, die Ablage
 * der Anhänge (postfach-anhaenge.ts) und die Messung externer Dienste (system/externmessung.ts), ohne postfach.ts
 * einzubinden – sonst entstünde ein Kreis über die Postfächer. Bindet selbst nichts ein.
 */

export type Verschluesselung = 'ssl' | 'starttls' | 'keine';

/** Zugangsdaten mit Klartext-Passwort bzw. Zugriffstoken (OAuth, #358), nur für die Verbindung. */
export interface Zugang {
  server: string;
  port: number;
  verschluesselung: Verschluesselung;
  benutzer: string;
  passwort: string;
  zugriffstoken?: string;
}

export interface ImapSitzung {
  uidValidity: string;
  /** Anzahl Mails im Ordner. */
  anzahl: number;
  /** UIDs (und Message-IDs) ab dieser UID. */
  neue(abUid: number): Promise<Array<{ uid: number; messageId?: string }>>;
  quelle(uid: number): Promise<Buffer>;
  verschiebe(uid: number, ordner: string): Promise<void>;
  gelesen(uid: number): Promise<void>;
  loesche(uid: number): Promise<void>;
  ordnerListe(): Promise<string[]>;
  schliessen(): Promise<void>;
  /** Bytes hin und zurück in dieser Sitzung (#565, Messung externer Dienste), soweit bekannt. */
  bytes?(): { hin: number; zurueck: number };
}
export type ImapVerbinder = (z: Zugang, ordner: string) => Promise<ImapSitzung>;

export interface GeleseneMail {
  messageId?: string;
  betreff: string;
  datum: Date | null;
  absenderName: string;
  absenderAdresse: string;
  text: string;
  anhaenge: Array<{ name: string; mime: string; inhalt: Buffer; eingebettet: boolean }>;
}
export type MailLeser = (quelle: Buffer) => Promise<GeleseneMail>;
