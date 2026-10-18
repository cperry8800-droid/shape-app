// Mutation spec for the payment notices (2026-10-18, owner: notify the coach, the member and the
// owner on every successful payment). Each mutation breaks one rule: who hears what, the owners'
// Auth check, the $0 guard, the dedupe keys, the copy's figures, and in the webhook, where each
// notice is sent, what amount and fee it carries, and which invoices count as a later month.
// tests/payment-notices.test.mjs and the suites beside it must notice every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/payment-notices-2026-10-18.mutations.mjs --fail-on-skipped
const NOTICES = 'src/lib/payment-notices.ts';
const WEBHOOK = 'src/app/api/stripe/webhook/route.ts';

export default {
  test: 'node --test tests/payment-notices.test.mjs tests/coach-thread.test.mjs tests/payments-said.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── Who hears what ──
    { name: 'a paid session gets a second receipt', file: NOTICES,
      find: "  return p.paidFor !== 'booking';", replace: '  return true;' },
    { name: 'the coach is told of a first month too (startCoaching already does)', file: NOTICES,
      find: "  return p.renewal && p.paidFor === 'coaching' && !!p.provider;", replace: "  return p.paidFor === 'coaching' && !!p.provider;" },
    { name: 'a renewal with no coach counts as the coach\'s', file: NOTICES,
      find: "  return p.renewal && p.paidFor === 'coaching' && !!p.provider;", replace: "  return p.renewal && p.paidFor === 'coaching';" },
    { name: 'the coach\'s renewal goes to the member', file: NOTICES,
      find: '        userId: coach.ownerId,', replace: '        userId: p.clientId,' },

    // ── The owners ──
    { name: 'owners: an unconfirmed account with the address counts', file: NOTICES,
      find: '      if (email && user?.email_confirmed_at && owners.includes(email)) ids.push(row.id);',
      replace: '      if (email && owners.includes(email)) ids.push(row.id);' },
    { name: 'owners: the profile\'s email is trusted (anyone can type it)', file: NOTICES,
      find: '      if (email && user?.email_confirmed_at && owners.includes(email)) ids.push(row.id);',
      replace: '      if (user?.email_confirmed_at) ids.push(row.id);' },
    { name: 'owners: the Auth address is compared as typed', file: NOTICES,
      find: "      const email = String(user?.email || '').toLowerCase();", replace: "      const email = String(user?.email || '');" },
    { name: 'owners: a stored count includes a duplicate', file: NOTICES,
      find: '      if (stored) out.owners += 1;', replace: '      out.owners += 1;' },

    // ── Guards and keys ──
    { name: 'a $0 checkout is announced as a payment', file: NOTICES,
      find: '  if (!p.key || !p.clientId || !(p.amountCents > 0)) return out;', replace: '  if (!p.key || !p.clientId) return out;' },
    { name: 'every owner notice shares one dedupe key (the second payment is never told)', file: NOTICES,
      find: '        data: { dedupe: `pay:${p.key}`,', replace: "        data: { dedupe: 'pay'," },
    { name: 'every receipt shares one dedupe key', file: NOTICES,
      find: '        data: { dedupe: `receipt:${p.key}`,', replace: "        data: { dedupe: 'receipt'," },
    { name: 'every renewal notice shares one dedupe key', file: NOTICES,
      find: '        data: { dedupe: `renewal:${p.key}`,', replace: "        data: { dedupe: 'renewal'," },

    // ── The copy ──
    { name: 'a 0% fee reads as no fee line at all', file: NOTICES,
      find: '  const fee = p.shapeFeeCents == null\n', replace: '  const fee = !p.shapeFeeCents\n' },
    { name: 'a negative amount prints as negative', file: NOTICES,
      find: '  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;', replace: '  return `$${(cents / 100).toFixed(2)}`;' },
    { name: 'the coach\'s share is left out of the renewal', file: NOTICES,
      find: "  const pay = p.coachCents ? ` · ${usd(p.coachCents)} to you` : '';\n  return { title: `Monthly payment: ${who}`",
      replace: "  const pay = '';\n  return { title: `Monthly payment: ${who}`" },

    // ── The webhook: a one-time purchase ──
    { name: 'purchase: the recorded price, not what Stripe charged', file: WEBHOOK,
      find: "              amountCents: session.amount_total ?? priceCents,\n              paidFor: kind === 'program'",
      replace: "              amountCents: priceCents,\n              paidFor: kind === 'program'" },
    { name: 'purchase: the payment\'s fee is dropped', file: WEBHOOK,
      find: '              shapeFeeCents: applicationFeeCents,\n', replace: '              shapeFeeCents: null,\n' },
    { name: 'purchase: the buyer\'s own item_name reaches the notices', file: WEBHOOK,
      find: "              shapeFeeCents: applicationFeeCents,\n              itemName: planSnapshot && typeof planSnapshot.name === 'string' && planSnapshot.name.trim() ? planSnapshot.name.trim() : null,",
      replace: "              shapeFeeCents: applicationFeeCents,\n              itemName: session.metadata?.item_name ?? null," },

    // ── The webhook: first months ──
    { name: 'coaching: a paid first month that has ended since is not announced', file: WEBHOOK,
      find: "        if (!subErr && moneyMoved && providerId && (providerRole === 'trainer' || providerRole === 'nutritionist')) {\n          const firstMonthCents",
      replace: "        if (!subErr && moneyMoved && !subEnded && providerId && (providerRole === 'trainer' || providerRole === 'nutritionist')) {\n          const firstMonthCents" },
    { name: 'membership: a paid first month that has ended since is not announced', file: WEBHOOK,
      find: '          if (membershipSaved && moneyMoved) {\n', replace: '          if (membershipSaved && moneyMoved && !subEnded) {\n' },
    { name: 'coaching: the first month states no fee', file: WEBHOOK,
      find: '            shapeFeeCents: splitAtBps(firstMonthCents, subFeeBps)?.shape ?? null,', replace: '            shapeFeeCents: null,' },
    { name: 'coaching: the first month is called a renewal', file: WEBHOOK,
      find: "            paidFor: 'coaching',\n            renewal: false,", replace: "            paidFor: 'coaching',\n            renewal: true," },
    { name: 'membership: the first month is called a renewal', file: WEBHOOK,
      find: "              paidFor: 'membership',\n              renewal: false,", replace: "              paidFor: 'membership',\n              renewal: true," },
    { name: 'split: an unreadable rate is read as 0% (all to the coach)', file: WEBHOOK,
      find: '  } catch {\n    return null;\n  }\n}', replace: '  } catch {\n    return { shape: 0, coach: cents };\n  }\n}' },
    { name: 'split: Shape\'s fee is the coach\'s share', file: WEBHOOK,
      find: '    return { shape: cents - coach, coach };', replace: '    return { shape: coach, coach };' },

    // ── The webhook: later months ──
    { name: 'invoice.paid: the first invoice counts too (the first month told twice)', file: WEBHOOK,
      find: "        if (invoice.billing_reason !== 'subscription_cycle' || !(invoice.amount_paid > 0) || !invoice.id) break;",
      replace: '        if (!(invoice.amount_paid > 0) || !invoice.id) break;' },
    { name: 'invoice.paid: a $0 invoice counts', file: WEBHOOK,
      find: "        if (invoice.billing_reason !== 'subscription_cycle' || !(invoice.amount_paid > 0) || !invoice.id) break;",
      replace: "        if (invoice.billing_reason !== 'subscription_cycle' || !invoice.id) break;" },
    { name: 'invoice.paid: a coach\'s account is searched for the membership', file: WEBHOOK,
      find: '        if (!acct) {\n          const { data: membership', replace: '        {\n          const { data: membership' },
    { name: 'invoice.paid: a Connect invoice finds rows on any account', file: WEBHOOK,
      find: "        if (acct) planQuery = planQuery.eq('stripe_account_id', acct);\n", replace: '' },
    { name: 'invoice.paid: any role counts as a coach', file: WEBHOOK,
      find: "        if (!row?.client_id || !row.provider_id || (row.provider_role !== 'trainer' && row.provider_role !== 'nutritionist')) break;",
      replace: '        if (!row?.client_id || !row.provider_id) break;' },
    { name: 'invoice.paid: a membership renewal is called a first month', file: WEBHOOK,
      find: "paidFor: 'membership', renewal: true });", replace: "paidFor: 'membership', renewal: false });" },
    { name: 'invoice.paid: a coach plan renewal is called a first month', file: WEBHOOK,
      find: "          paidFor: 'coaching',\n          renewal: true,", replace: "          paidFor: 'coaching',\n          renewal: false," },
    { name: 'invoice.paid: the coach\'s share is dropped', file: WEBHOOK,
      find: '          coachCents: split?.coach ?? null,\n', replace: '' },
    { name: 'invoice.paid: the renewal is keyed on the subscription (every month after the first is a duplicate)', file: WEBHOOK,
      find: '          key: invoice.id,\n          clientId: row.client_id,', replace: '          key: subId,\n          clientId: row.client_id,' },
  ],
};
