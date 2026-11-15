/** Ziel nach der Anmeldung (#721): Admins in die Werkbank, ein Link dorthin hat Vorrang. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADMIN_START, startseiteVon, zielNachAnmeldung } from '../../shared/src/startseite';

describe('Startseite nach der Anmeldung (#721)', () => {
  it('Admin ohne Link landet in der Werkbank-Übersicht', () => {
    assert.equal(zielNachAnmeldung('admin', null), ADMIN_START);
    assert.equal(zielNachAnmeldung('admin', '/'), '/werkbank');
  });
  it('Admin mit Link in die Werkbank (oder Mein Konto) landet beim Link', () => {
    assert.equal(zielNachAnmeldung('admin', '/werkbank/sicherung'), '/werkbank/sicherung');
    assert.equal(zielNachAnmeldung('admin', '/werkbank/pakete?installieren=basis@1.4.0'), '/werkbank/pakete?installieren=basis@1.4.0');
    assert.equal(zielNachAnmeldung('admin', '/profil/sicherheit'), '/profil/sicherheit');
    assert.equal(zielNachAnmeldung('admin', '/werkbankx'), ADMIN_START);
  });
  it('Admin mit Link in die Ablage landet in der Werkbank', () => {
    assert.equal(zielNachAnmeldung('admin', '/ablage/mappen/1234'), ADMIN_START);
    assert.equal(zielNachAnmeldung('admin', '/ablage'), ADMIN_START);
  });
  it('Benutzer bleiben, wo der Link hinführt', () => {
    assert.equal(zielNachAnmeldung('mitglied', '/ablage/mappen/1234'), '/ablage/mappen/1234');
    assert.equal(zielNachAnmeldung('mitglied', null), null);
    assert.equal(zielNachAnmeldung(undefined, '/werkbank'), '/werkbank');
  });
  it('Logo und „/“: Admins in die Werkbank, sonst Startseite oder Eingang', () => {
    assert.equal(startseiteVon('admin'), '/werkbank');
    assert.equal(startseiteVon('mitglied'), '/ablage/start');
    assert.equal(startseiteVon('mitglied', true), '/ablage/eingang');
  });
});
