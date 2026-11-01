/**
 * Paket-Läufer (#338): ein sehr kleines WASI (preview1) – genug, damit mit wasi-sdk gebaute Module laufen,
 * aber ohne Dateisystem, ohne Netz, ohne Umgebung. Was ein Modul darüber hinaus braucht, bekommt es nur über
 * die Funktionen des DMS (Modul „dms“). Unbekannte WASI-Funktionen antworten mit ENOSYS.
 */
import { randomFillSync } from 'node:crypto';

const ERFOLG = 0, EBADF = 8, EINVAL = 28, ENOSYS = 52, ESPIPE = 70, ENOTCAPABLE = 76;

/** Wirft das Modul proc_exit, endet der Aufruf mit diesem Fehler. */
export class WasiEnde extends Error {
  constructor(public code: number) { super(`Das Modul hat sich mit Code ${code} beendet.`); }
}

/** Ausgaben auf stdout/stderr landen zeilenweise im Protokoll des Pakets (mit Obergrenze). */
export interface WasiAusgabe { (zeile: string, fd: 1 | 2): void }

export function wasiImporte(speicher: () => WebAssembly.Memory, ausgabe: WasiAusgabe, namen: string[]): Record<string, (...a: number[]) => number> {
  const dv = () => new DataView(speicher().buffer);
  const u8 = () => new Uint8Array(speicher().buffer);
  const puffer: Record<1 | 2, string> = { 1: '', 2: '' };
  let ausgegeben = 0;
  const schreibe = (fd: 1 | 2, text: string) => {
    puffer[fd] += text;
    let i: number;
    while ((i = puffer[fd].indexOf('\n')) >= 0) {
      const zeile = puffer[fd].slice(0, i); puffer[fd] = puffer[fd].slice(i + 1);
      if (ausgegeben++ < 200) ausgabe(zeile.slice(0, 2000), fd);
    }
    if (puffer[fd].length > 4000) { ausgabe(puffer[fd].slice(0, 2000), fd); puffer[fd] = ''; }
  };
  const dec = new TextDecoder();
  const f: Record<string, (...a: number[]) => number> = {
    args_sizes_get: (anz, groesse) => { dv().setUint32(anz, 0, true); dv().setUint32(groesse, 0, true); return ERFOLG; },
    args_get: () => ERFOLG,
    environ_sizes_get: (anz, groesse) => { dv().setUint32(anz, 0, true); dv().setUint32(groesse, 0, true); return ERFOLG; },
    environ_get: () => ERFOLG,
    clock_res_get: (_id, aus) => { dv().setBigUint64(aus, 1000n, true); return ERFOLG; },
    clock_time_get: (id, _gen, aus) => {
      const ns = id === 0 ? BigInt(Date.now()) * 1_000_000n : process.hrtime.bigint();
      dv().setBigUint64(aus, ns, true); return ERFOLG;
    },
    random_get: (ptr, len) => { randomFillSync(u8(), ptr, len); return ERFOLG; },
    sched_yield: () => ERFOLG,
    fd_write: (fd, iovs, anzahl, geschrieben) => {
      if (fd !== 1 && fd !== 2) return EBADF;
      let n = 0;
      for (let i = 0; i < anzahl; i++) {
        const p = dv().getUint32(iovs + i * 8, true), l = dv().getUint32(iovs + i * 8 + 4, true);
        schreibe(fd as 1 | 2, dec.decode(u8().subarray(p, p + l))); n += l;
      }
      dv().setUint32(geschrieben, n, true); return ERFOLG;
    },
    fd_read: (fd, _iovs, _anzahl, gelesen) => { if (fd !== 0) return EBADF; dv().setUint32(gelesen, 0, true); return ERFOLG; },
    fd_close: (fd) => (fd <= 2 ? ERFOLG : EBADF),
    fd_seek: (fd) => (fd <= 2 ? ESPIPE : EBADF),
    fd_sync: (fd) => (fd <= 2 ? ERFOLG : EBADF),
    fd_fdstat_get: (fd, aus) => {
      if (fd > 2) return EBADF;
      const d = dv();
      d.setUint8(aus, 2); // Zeichengerät
      d.setUint16(aus + 2, 0, true);
      d.setBigUint64(aus + 8, 0n, true); d.setBigUint64(aus + 16, 0n, true);
      return ERFOLG;
    },
    fd_fdstat_set_flags: (fd) => (fd <= 2 ? ERFOLG : EBADF),
    // Keine vorgeöffneten Verzeichnisse: wasi-libc hört bei EBADF auf zu suchen.
    fd_prestat_get: () => EBADF,
    fd_prestat_dir_name: () => EBADF,
    poll_oneoff: () => ENOSYS,
    proc_raise: () => ENOSYS,
    proc_exit: (code) => { throw new WasiEnde(code); },
  };
  const erg: Record<string, (...a: number[]) => number> = {};
  for (const n of namen) erg[n] = f[n] ?? (n.startsWith('path_') || n.startsWith('sock_') ? () => ENOTCAPABLE : n.startsWith('fd_') ? () => EBADF : () => ENOSYS);
  void EINVAL;
  return erg;
}
