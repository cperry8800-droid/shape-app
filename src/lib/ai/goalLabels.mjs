// src/lib/ai/goalLabels.mjs
//
// The primary goal's words in each of the app's languages: the labels its goal step and Goals page
// write into client_identity.goal (bsPrimaryGoalLabel, goal:primary.goal.<id>), which the member's public
// profile shows as written. Nora's account setup (accountSetup.mjs) writes the same mirror, so it writes
// it in the member's app language too (Codex on #2566), never English over their own words. Copied from
// mobile-app/src/i18n/catalogs/<locale>/goal.json so the server bundle carries twelve labels, not thirteen
// catalogs; tests/nora-account-setup.test.mjs holds every entry equal to its catalog.

export const PRIMARY_GOAL_LABELS = Object.freeze({
  "en": Object.freeze({ fat_loss: "Lose fat", muscle: "Build muscle", recomp: "Recomp", maintain: "Maintain", strength: "Get stronger", endurance: "Endurance", mobility: "Mobility", athletic: "Athletic performance", health: "General health", tone: "Tone up", race: "Run a race", postpartum: "Postpartum" }),
  "es": Object.freeze({ fat_loss: "Perder grasa", muscle: "Ganar músculo", recomp: "Recomp", maintain: "Mantener", strength: "Ser más fuerte", endurance: "Resistencia", mobility: "Movilidad", athletic: "Rendimiento deportivo", health: "Salud general", tone: "Tonificar", race: "Correr una carrera", postpartum: "Posparto" }),
  "pt-BR": Object.freeze({ fat_loss: "Perder gordura", muscle: "Ganhar músculo", recomp: "Recomp", maintain: "Manter", strength: "Ficar mais forte", endurance: "Resistência", mobility: "Mobilidade", athletic: "Desempenho atlético", health: "Saúde geral", tone: "Definir o corpo", race: "Correr uma prova", postpartum: "Pós-parto" }),
  "fr": Object.freeze({ fat_loss: "Perdre du gras", muscle: "Prendre du muscle", recomp: "Recomp", maintain: "Maintenir", strength: "Devenir plus fort", endurance: "Endurance", mobility: "Mobilité", athletic: "Performance sportive", health: "Santé générale", tone: "Se tonifier", race: "Courir une course", postpartum: "Post-partum" }),
  "de": Object.freeze({ fat_loss: "Fett verlieren", muscle: "Muskeln aufbauen", recomp: "Recomp", maintain: "Halten", strength: "Stärker werden", endurance: "Ausdauer", mobility: "Mobilität", athletic: "Sportliche Leistung", health: "Allgemeine Gesundheit", tone: "Straffer werden", race: "Ein Rennen laufen", postpartum: "Nach der Geburt" }),
  "it": Object.freeze({ fat_loss: "Perdere grasso", muscle: "Mettere massa", recomp: "Recomp", maintain: "Mantieni", strength: "Diventare più forte", endurance: "Resistenza", mobility: "Mobilità", athletic: "Performance atletica", health: "Salute generale", tone: "Tonificare", race: "Correre una gara", postpartum: "Post-parto" }),
  "id": Object.freeze({ fat_loss: "Turunkan lemak", muscle: "Bangun otot", recomp: "Rekomp", maintain: "Pertahankan", strength: "Jadi lebih kuat", endurance: "Daya tahan", mobility: "Mobilitas", athletic: "Performa atletik", health: "Kesehatan umum", tone: "Bentuk tubuh", race: "Ikut lomba lari", postpartum: "Pascamelahirkan" }),
  "vi": Object.freeze({ fat_loss: "Giảm mỡ", muscle: "Tăng cơ", recomp: "Tái cấu trúc", maintain: "Duy trì", strength: "Khỏe hơn", endurance: "Sức bền", mobility: "Linh hoạt", athletic: "Thành tích thể thao", health: "Sức khỏe tổng thể", tone: "Săn chắc", race: "Chạy một giải", postpartum: "Sau sinh" }),
  "tr": Object.freeze({ fat_loss: "Yağ yakmak", muscle: "Kas yapmak", recomp: "Rekomp", maintain: "Koru", strength: "Daha güçlü olmak", endurance: "Dayanıklılık", mobility: "Mobilite", athletic: "Atletik performans", health: "Genel sağlık", tone: "Sıkılaşmak", race: "Bir yarışa katılmak", postpartum: "Doğum sonrası" }),
  "ha": Object.freeze({ fat_loss: "Rage kiba", muscle: "Gina tsoka", recomp: "Sake gina jiki", maintain: "Riƙe", strength: "Ƙara ƙarfi", endurance: "Juriya", mobility: "Sassauci", athletic: "Ƙwarewar wasanni", health: "Lafiya gaba ɗaya", tone: "Tsaurara jiki", race: "Gudun gasa", postpartum: "Bayan haihuwa" }),
  "pcm": Object.freeze({ fat_loss: "Lose fat", muscle: "Build muscle", recomp: "Recomp", maintain: "Maintain", strength: "Get stronger", endurance: "Endurance", mobility: "Mobility", athletic: "Athletic performance", health: "General health", tone: "Tone up", race: "Run race", postpartum: "After born pikin" }),
  "ru": Object.freeze({ fat_loss: "Сбросить жир", muscle: "Набрать мышцы", recomp: "Рекомп", maintain: "Поддержание", strength: "Стать сильнее", endurance: "Выносливость", mobility: "Мобильность", athletic: "Спортивные результаты", health: "Общее здоровье", tone: "Подтянуть тело", race: "Пробежать забег", postpartum: "После родов" }),
  "uk": Object.freeze({ fat_loss: "Скинути жир", muscle: "Набрати м'язи", recomp: "Рекомп", maintain: "Підтримання", strength: "Стати сильнішим", endurance: "Витривалість", mobility: "Мобільність", athletic: "Спортивні результати", health: "Загальне здоров'я", tone: "Підтягнути тіло", race: "Пробігти забіг", postpartum: "Після пологів" }),
});

/** A listed goal's words in this language, else in English; null for a goal that is not listed. */
export function primaryGoalLabel(id, locale = 'en') {
  const en = PRIMARY_GOAL_LABELS.en;
  if (!Object.prototype.hasOwnProperty.call(en, id)) return null;
  const row = Object.prototype.hasOwnProperty.call(PRIMARY_GOAL_LABELS, locale) ? PRIMARY_GOAL_LABELS[locale] : en;
  return row[id] || en[id];
}

// A goal's words, in any of the app's languages, back to its id (Codex on #2566): Nora in a Spanish
// chat may pass "Perder grasa", which the English-only reader (signupGoalFromText) would keep as the
// member's own words, so Goals would show no chip and the weight read would miss it. Folded as a
// person types them: case, spacing and compatibility forms aside. null for words no language uses.
const fold = (s) => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const BY_WORDS = (() => {
  const m = new Map();
  for (const row of Object.values(PRIMARY_GOAL_LABELS)) for (const [id, words] of Object.entries(row)) m.set(fold(words), id);
  return m;
})();
export function primaryGoalFromWords(text) {
  const k = fold(text);
  return k && BY_WORDS.has(k) ? BY_WORDS.get(k) : null;
}
