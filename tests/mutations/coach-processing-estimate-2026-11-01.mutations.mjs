// Mutation spec for coach payments on direct charges, part C (2026-11-01): the card-processing
// ESTIMATE (coachForecast.js processingCents and earn) and where a coach reads it: the website's
// Business calculator, the app's, the two marketing calculators, the program and workout price
// notes, and Nora's fee entry. Each mutation undoes one guard; the tests must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-processing-estimate-2026-11-01.mutations.mjs --fail-on-skipped
const CF = 'public/newdesign/coachForecast.js';
const BIZ = 'public/newdesign/dashBusiness.jsx';
const APP = 'mobile-app/src/broadsheet/BSCoachBusiness.jsx';
const COACH = 'public/newdesign/coach.jsx';
const NUT = 'public/newdesign/nutritionist.jsx';
const PROGRAM = 'public/newdesign/newProgram.jsx';
const WORKOUT = 'public/newdesign/newWorkout.jsx';
const KNOW = 'src/lib/ai/shapeKnowledge.mjs';

export default {
  test: 'node --test tests/coach-forecast.test.mjs tests/business-plan-page.test.mjs tests/app-coach-business.test.mjs tests/marketing-earnings.test.mjs tests/shape-knowledge.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── The rule ──
    { name: 'the card rate is not Stripe\'s', file: CF,
      find: '  const CARD_PCT = 0.029;',
      replace: '  const CARD_PCT = 0.025;' },
    { name: 'no fixed fee a charge', file: CF,
      find: '  const CARD_FIXED_CENTS = 30;',
      replace: '  const CARD_FIXED_CENTS = 0;' },
    { name: 'Billing\'s share is not Stripe\'s', file: CF,
      find: '  const BILLING_PCT = 0.007;',
      replace: '  const BILLING_PCT = 0.005;' },
    { name: 'a subscription pays no Billing share', file: CF,
      find: '    return Math.round(p * (CARD_PCT + (recurring ? BILLING_PCT : 0)) + CARD_FIXED_CENTS);',
      replace: '    return Math.round(p * CARD_PCT + CARD_FIXED_CENTS);' },
    { name: 'a one-time sale pays the Billing share', file: CF,
      find: '    return Math.round(p * (CARD_PCT + (recurring ? BILLING_PCT : 0)) + CARD_FIXED_CENTS);',
      replace: '    return Math.round(p * (CARD_PCT + BILLING_PCT) + CARD_FIXED_CENTS);' },
    { name: 'the default is a one-time sale', file: CF,
      find: '  function processingCents(priceCents, { recurring = true } = {}) {',
      replace: '  function processingCents(priceCents, { recurring = false } = {}) {' },
    { name: 'a free price is charged the fixed fee', file: CF,
      find: '    if (p <= 0) return 0;\n    return Math.round(p * (CARD_PCT',
      replace: '    return Math.round(p * (CARD_PCT' },
    { name: 'a bad price is not read as nothing', file: CF,
      find: '    const p = Math.max(0, num(priceCents) || 0);\n    if (p <= 0) return 0;',
      replace: '    const p = Math.max(0, Number(priceCents) || 0);\n    if (p <= 0) return 0;' },
    { name: 'processing is estimated on the net, not the gross', file: CF,
      find: '    const proc = Math.round(n * processingCents(priceCents));',
      replace: '    const proc = Math.round(n * processingCents(netOf(priceCents, byoShare)));' },
    { name: 'processing is one charge in all, not one a client', file: CF,
      find: '    const proc = Math.round(n * processingCents(priceCents));',
      replace: '    const proc = n > 0 ? processingCents(priceCents) : 0;' },
    { name: 'what is left can go below nothing', file: CF,
      find: '      processingCents: proc, afterProcessingCents: Math.max(0, netCents - proc),',
      replace: '      processingCents: proc, afterProcessingCents: netCents - proc,' },
    { name: 'the estimate is folded into the net', file: CF,
      find: '    const netCents = Math.round(net);\n    const proc',
      replace: '    const netCents = Math.round(net) - Math.round(n * processingCents(priceCents));\n    const proc' },

    // ── The website's Business calculator ──
    { name: 'the dashboard shows no estimate', file: BIZ,
      find: '        {e.grossCents > 0 ? (\n          <div data-dbz-processing=""',
      replace: '        {false ? (\n          <div data-dbz-processing=""' },
    { name: 'the dashboard shows the net as what is left', file: BIZ,
      find: '            About {dashMoney(e.processingCents)} card processing · about {dashMoney(e.afterProcessingCents)} a month after it',
      replace: '            About {dashMoney(e.processingCents)} card processing · about {dashMoney(e.netCents)} a month after it' },
    { name: 'the dashboard does not say what the estimate is', file: BIZ,
      find: '            <span style={{ display: "block", marginTop: 3 }}>{DBZ_PROCESSING_BASIS}</span>',
      replace: '' },

    // ── The app's Business calculator ──
    { name: 'the app shows no estimate', file: APP,
      find: '      {e.grossCents > 0 ? (\n        <Note t={t} style={{ marginTop: 4 }}>',
      replace: '      {false ? (\n        <Note t={t} style={{ marginTop: 4 }}>' },
    { name: 'the app shows the net as what is left', file: APP,
      find: "processing: bsBizMoney(e.processingCents), after: bsBizMoney(e.afterProcessingCents) })}",
      replace: "processing: bsBizMoney(e.processingCents), after: bsBizMoney(e.netCents) })}" },
    { name: 'the app does not say what the estimate is', file: APP,
      find: "          <span style={{ display: 'block', marginTop: 3 }}>{tr('coach:business.earn.processingBasis',",
      replace: "          <span hidden style={{ display: 'block', marginTop: 3 }}>{false && tr('coach:business.earn.processingBasis'," },
    { name: 'the app estimate drops back to the faint ink', file: APP,
      find: '        <Note t={t} style={{ marginTop: 4, color: t.INK70 || t.INK }}>',
      replace: '        <Note t={t} style={{ marginTop: 4 }}>' },

    // ── The marketing calculators ──
    { name: 'the trainer page leaves processing out of the take-home', file: COACH,
      find: '  const takeHome = processingMonthly == null ? monthly : Math.max(0, monthly - processingMonthly);',
      replace: '  const takeHome = monthly;' },
    { name: 'the trainer page estimates one charge in all', file: COACH,
      find: '  const processingMonthly = CF ? Math.round(clients * CF.processingCents(price * 100) / 100) : null;',
      replace: '  const processingMonthly = CF ? Math.round(CF.processingCents(price * 100) / 100) : null;' },
    { name: 'the trainer page annualizes the take-home before processing', file: COACH,
      find: '  const yearly = takeHome * 12;',
      replace: '  const yearly = monthly * 12;' },
    { name: 'the trainer page hides the estimate line', file: COACH,
      find: '              {processingMonthly == null ? null : (\n                <div data-processing-estimate=""',
      replace: '              {true ? null : (\n                <div data-processing-estimate=""' },
    { name: 'the trainer page calls the estimate exact', file: COACH,
      find: '{processingMonthly == null ? "Your take-home" : "Your take-home, estimated"}',
      replace: '{"Your take-home"}' },
    { name: 'the nutritionist page leaves processing out of the take-home', file: NUT,
      find: '  const takeHome = processingMonthly == null ? monthly : Math.max(0, monthly - processingMonthly);',
      replace: '  const takeHome = monthly;' },
    { name: 'the trainer page says it estimated when it did not', file: COACH,
      find: "                ? \"The take-home is before Stripe's card-processing fee, which comes out of your share.\"",
      replace: "                ? \"Stripe's card processing comes out of your share: it is estimated here.\"" },
    { name: 'the nutritionist page hides the estimate line', file: NUT,
      find: '              {processingMonthly == null ? null : (\n                <div data-processing-estimate=""',
      replace: '              {true ? null : (\n                <div data-processing-estimate=""' },

    // ── The program and workout price notes ──
    { name: 'a one-time program is estimated as a subscription', file: PROGRAM,
      find: '  const proc = priced && CF ? CF.processingCents(Math.round(p * 100), { recurring: sub }) / 100 : null;',
      replace: '  const proc = priced && CF ? CF.processingCents(Math.round(p * 100)) / 100 : null;' },
    { name: 'a subscription program is estimated as a one-time sale', file: PROGRAM,
      find: '  const proc = priced && CF ? CF.processingCents(Math.round(p * 100), { recurring: sub }) / 100 : null;',
      replace: '  const proc = priced && CF ? CF.processingCents(Math.round(p * 100), { recurring: false }) / 100 : null;' },
    { name: 'the page never tells the note its billing model', file: PROGRAM,
      find: '            <NpFeeNote price={price} kind={kind} />',
      replace: '            <NpFeeNote price={price} />' },
    { name: 'a program sale leaves processing out', file: PROGRAM,
      find: '  const after = (v) => "$" + Math.max(0, v - (proc || 0)).toFixed(2);',
      replace: '  const after = (v) => "$" + Math.max(0, v).toFixed(2);' },
    { name: 'a workout sale is estimated as a subscription', file: WORKOUT,
      find: '  const proc = priced && CF ? CF.processingCents(Math.round(p * 100), { recurring: false }) / 100 : null;',
      replace: '  const proc = priced && CF ? CF.processingCents(Math.round(p * 100)) / 100 : null;' },
    { name: 'a workout sale leaves processing out', file: WORKOUT,
      find: '  const money = (v) => "$" + Math.max(0, v - (proc || 0)).toFixed(2);',
      replace: '  const money = (v) => "$" + Math.max(0, v).toFixed(2);' },

    // ── Nora ──
    { name: 'Nora says Shape pays card processing', file: KNOW,
      find: 'Stripe’s card-processing fee comes out of the coach’s share, estimated at about 2.9% + 30¢ a US card charge plus 0.7% Stripe Billing on a subscription',
      replace: 'Shape pays the card-processing fee' },
  ],
};
