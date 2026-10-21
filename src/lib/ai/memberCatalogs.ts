// The app's Home catalogs in every shipped language, bundled for the server's member notices
// (memberTranslator.mjs). Static imports, so the build carries them into the notify routes; the list
// is ACTIVE_LOCALES (mobile-app/src/i18n/locales.mjs), and tests/member-push-copy.test.mjs holds the two
// to the same set.

import enHome from '../../../mobile-app/src/i18n/catalogs/en/home.json';
import esHome from '../../../mobile-app/src/i18n/catalogs/es/home.json';
import ptBRHome from '../../../mobile-app/src/i18n/catalogs/pt-BR/home.json';
import frHome from '../../../mobile-app/src/i18n/catalogs/fr/home.json';
import deHome from '../../../mobile-app/src/i18n/catalogs/de/home.json';
import itHome from '../../../mobile-app/src/i18n/catalogs/it/home.json';
import idHome from '../../../mobile-app/src/i18n/catalogs/id/home.json';
import viHome from '../../../mobile-app/src/i18n/catalogs/vi/home.json';
import trHome from '../../../mobile-app/src/i18n/catalogs/tr/home.json';
import haHome from '../../../mobile-app/src/i18n/catalogs/ha/home.json';
import pcmHome from '../../../mobile-app/src/i18n/catalogs/pcm/home.json';
import ruHome from '../../../mobile-app/src/i18n/catalogs/ru/home.json';
import ukHome from '../../../mobile-app/src/i18n/catalogs/uk/home.json';

export const MEMBER_HOME_CATALOGS: Record<string, { home: Record<string, string> }> = {
  'en': { home: enHome },
  'es': { home: esHome },
  'pt-BR': { home: ptBRHome },
  'fr': { home: frHome },
  'de': { home: deHome },
  'it': { home: itHome },
  'id': { home: idHome },
  'vi': { home: viHome },
  'tr': { home: trHome },
  'ha': { home: haHome },
  'pcm': { home: pcmHome },
  'ru': { home: ruHome },
  'uk': { home: ukHome },
};
