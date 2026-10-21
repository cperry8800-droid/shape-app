// The app's Home and notice catalogs in every shipped language, bundled for the server's notices
// (memberTranslator.mjs): the AI layer's member notices read home:push.*, and push dispatch and the
// preference-aware email say every other notice from notice:* (noticeCopy.mjs). Static imports, so
// the build carries them into the routes; the list is ACTIVE_LOCALES (mobile-app/src/i18n/locales.mjs),
// and tests/member-push-copy and tests/server-notices hold the two to the same set.

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
import enNotice from '../../../mobile-app/src/i18n/catalogs/en/notice.json';
import esNotice from '../../../mobile-app/src/i18n/catalogs/es/notice.json';
import ptBRNotice from '../../../mobile-app/src/i18n/catalogs/pt-BR/notice.json';
import frNotice from '../../../mobile-app/src/i18n/catalogs/fr/notice.json';
import deNotice from '../../../mobile-app/src/i18n/catalogs/de/notice.json';
import itNotice from '../../../mobile-app/src/i18n/catalogs/it/notice.json';
import idNotice from '../../../mobile-app/src/i18n/catalogs/id/notice.json';
import viNotice from '../../../mobile-app/src/i18n/catalogs/vi/notice.json';
import trNotice from '../../../mobile-app/src/i18n/catalogs/tr/notice.json';
import haNotice from '../../../mobile-app/src/i18n/catalogs/ha/notice.json';
import pcmNotice from '../../../mobile-app/src/i18n/catalogs/pcm/notice.json';
import ruNotice from '../../../mobile-app/src/i18n/catalogs/ru/notice.json';
import ukNotice from '../../../mobile-app/src/i18n/catalogs/uk/notice.json';

export const MEMBER_HOME_CATALOGS: Record<string, { home: Record<string, string>; notice: Record<string, string> }> = {
  'en': { home: enHome, notice: enNotice },
  'es': { home: esHome, notice: esNotice },
  'pt-BR': { home: ptBRHome, notice: ptBRNotice },
  'fr': { home: frHome, notice: frNotice },
  'de': { home: deHome, notice: deNotice },
  'it': { home: itHome, notice: itNotice },
  'id': { home: idHome, notice: idNotice },
  'vi': { home: viHome, notice: viNotice },
  'tr': { home: trHome, notice: trNotice },
  'ha': { home: haHome, notice: haNotice },
  'pcm': { home: pcmHome, notice: pcmNotice },
  'ru': { home: ruHome, notice: ruNotice },
  'uk': { home: ukHome, notice: ukNotice },
};
