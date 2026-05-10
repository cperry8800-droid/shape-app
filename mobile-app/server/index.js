import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = Number(process.env.PORT || 4242);
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeApplicationFeePercent = Number(process.env.STRIPE_APPLICATION_FEE_PERCENT || 15);

if (!stripeSecretKey) console.warn('STRIPE_SECRET_KEY is not set.');
if (!supabaseUrl || !supabaseAnonKey) console.warn('Supabase auth verification is not configured.');
if (!supabaseUrl || !supabaseServiceRoleKey) console.warn('Supabase service writes are not configured.');

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const supabaseAuth = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function isoFromStripeSeconds(seconds) {
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null;
}

function priceToCents(price) {
  const amount = Number(String(price || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function normalizeProviderRole(role) {
  const normalized = String(role || '').toLowerCase();
  return ['trainer', 'nutritionist'].includes(normalized) ? normalized : null;
}

function normalizeProviderId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function providerTable(role) {
  return role === 'nutritionist' ? 'nutritionists' : 'trainers';
}

function providerPriceColumn(role) {
  return role === 'nutritionist' ? 'meal_plan_price' : 'session_price';
}

function applicationFeeCents(amountCents) {
  if (!Number.isFinite(stripeApplicationFeePercent) || stripeApplicationFeePercent <= 0) return null;
  return Math.max(0, Math.round(amountCents * (stripeApplicationFeePercent / 100)));
}

function stripeAccountStatus(account) {
  if (account?.charges_enabled && account?.payouts_enabled && account?.details_submitted) return 'active';
  const disabledReason = account?.requirements?.disabled_reason || '';
  if (disabledReason.includes('rejected')) return 'rejected';
  if (disabledReason) return 'restricted';
  return 'pending';
}

async function fetchProvider(providerRole, providerId) {
  if (!supabaseAdmin || !providerRole || !providerId) return null;
  const priceColumn = providerPriceColumn(providerRole);
  const { data, error } = await supabaseAdmin
    .from(providerTable(providerRole))
    .select(`id, name, stripe_account_id, stripe_account_status, stripe_product_id, stripe_price_id, ${priceColumn}`)
    .eq('id', providerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchOwnedProvider(providerRole, userId) {
  if (!supabaseAdmin || !providerRole || !userId) return null;
  const priceColumn = providerPriceColumn(providerRole);
  const { data, error } = await supabaseAdmin
    .from(providerTable(providerRole))
    .select(`id, owner_id, name, stripe_account_id, stripe_account_status, ${priceColumn}`)
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function updateProviderStripeFields(providerRole, providerId, fields) {
  if (!supabaseAdmin || !providerRole || !providerId) return;
  const { error } = await supabaseAdmin
    .from(providerTable(providerRole))
    .update(fields)
    .eq('id', providerId);
  if (error) throw error;
}

async function updateProviderByStripeAccount(account) {
  if (!supabaseAdmin || !account?.id) return;
  const status = stripeAccountStatus(account);
  const trainerUpdate = await supabaseAdmin
    .from('trainers')
    .update({ stripe_account_status: status })
    .eq('stripe_account_id', account.id);
  if (trainerUpdate.error) throw trainerUpdate.error;

  const nutritionistUpdate = await supabaseAdmin
    .from('nutritionists')
    .update({ stripe_account_status: status })
    .eq('stripe_account_id', account.id);
  if (nutritionistUpdate.error) throw nutritionistUpdate.error;
}

function connectCheckoutOptions({ provider, amountCents, isSubscription }) {
  const destination = provider?.stripe_account_status === 'active'
    ? provider?.stripe_account_id
    : null;
  if (!destination) return {};

  if (isSubscription) {
    return {
      subscription_data: {
        application_fee_percent: stripeApplicationFeePercent,
        transfer_data: { destination },
      },
    };
  }

  const fee = applicationFeeCents(amountCents);
  return {
    payment_intent_data: {
      ...(fee ? { application_fee_amount: fee } : {}),
      transfer_data: { destination },
    },
  };
}

async function getUserFromRequest(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !supabaseAuth) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error) throw error;
  return data.user || null;
}

async function upsertCompletedCheckout(session) {
  if (!supabaseAdmin) {
    console.warn('Skipping Supabase write; SUPABASE_SERVICE_ROLE_KEY is missing.');
    return;
  }

  const clientId = session.metadata?.client_id;
  const providerId = normalizeProviderId(session.metadata?.provider_id);
  const providerRole = normalizeProviderRole(session.metadata?.provider_role);
  const priceCents = Number(session.metadata?.price_cents || 0);

  if (!clientId) {
    console.warn('checkout.session.completed missing client_id', session.id);
    return;
  }

  if (session.mode === 'payment') {
    const kind = session.metadata?.kind;
    if (!providerId || !providerRole || !kind) {
      console.warn('one-time checkout missing provider metadata', session.id);
      return;
    }

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null;
    let applicationFeeCents = null;

    if (paymentIntentId && stripe) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      applicationFeeCents = intent.application_fee_amount || null;
    }
    if (!applicationFeeCents && session.metadata?.application_fee_cents) {
      applicationFeeCents = Number(session.metadata.application_fee_cents) || null;
    }

    const { error } = await supabaseAdmin.from('one_time_purchases').upsert(
      {
        client_id: clientId,
        provider_id: providerId,
        provider_role: providerRole,
        kind,
        price_cents: priceCents,
        application_fee_cents: applicationFeeCents,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        status: 'paid',
      },
      { onConflict: 'stripe_checkout_session_id' }
    );
    if (error) throw error;
    return;
  }

  if (!providerId || !providerRole) {
    console.warn('subscription checkout missing provider metadata', session.id);
    return;
  }

  let currentPeriodEnd = null;
  if (typeof session.subscription === 'string' && stripe) {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    currentPeriodEnd = isoFromStripeSeconds(subscription.current_period_end);
  }

  const { error } = await supabaseAdmin.from('subscriptions').upsert(
    {
      client_id: clientId,
      provider_id: providerId,
      provider_role: providerRole,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      stripe_subscription_id: typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id || null,
      status: 'active',
      price_cents: priceCents || null,
      current_period_end: currentPeriodEnd,
    },
    { onConflict: 'stripe_subscription_id' }
  );
  if (error) throw error;
}

async function updateSubscriptionStatus(subscription) {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_end: isoFromStripeSeconds(subscription.current_period_end),
    })
    .eq('stripe_subscription_id', subscription.id);
  if (error) throw error;
}

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !webhookSecret) {
    return res.status(400).json({ error: 'Stripe webhook is not configured.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (error) {
    return res.status(400).send(`Webhook error: ${error.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await upsertCompletedCheckout(event.data.object);
    }
    if (event.type === 'account.updated') {
      await updateProviderByStripeAccount(event.data.object);
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      await updateSubscriptionStatus(event.data.object);
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook persistence failed:', error);
    res.status(500).json({ error: error.message || 'Webhook persistence failed.' });
  }
});

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    stripeConfigured: Boolean(stripe),
    supabaseAuthConfigured: Boolean(supabaseAuth),
    supabaseWritesConfigured: Boolean(supabaseAdmin),
  });
});

app.post('/api/stripe/checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured on the server.' });
  }

  let user = null;
  try {
    user = await getUserFromRequest(req);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid Supabase session.' });
  }

  if (!user) {
    return res.status(401).json({ error: 'Sign in before checkout.' });
  }

  const { item, coach, role } = req.body || {};
  const amountCents = priceToCents(item?.price);
  const isSubscription = item?.type === 'Subscription';
  const providerRole = normalizeProviderRole(role || coach?.role);
  const providerId = normalizeProviderId(coach?.provider_id || coach?.db_id || coach?.id);
  const kind = providerRole === 'nutritionist' ? 'meal_plan' : 'booking';

  if (!item?.name || amountCents < 50) {
    return res.status(400).json({ error: 'Invalid checkout item.' });
  }
  if (!providerId || !providerRole) {
    return res.status(400).json({
      error: 'Provider is not mapped to a Supabase trainer/nutritionist id yet.',
    });
  }

  try {
    const provider = await fetchProvider(providerRole, providerId);
    const connectOptions = connectCheckoutOptions({ provider, amountCents, isSubscription });
    const feeCents = isSubscription ? null : applicationFeeCents(amountCents);
    const lineItem = isSubscription && provider?.stripe_price_id
      ? {
          quantity: 1,
          price: provider.stripe_price_id,
        }
      : {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            recurring: isSubscription ? { interval: 'month' } : undefined,
            product_data: {
              name: coach?.name ? `${item.name} - ${coach.name}` : item.name,
              description: item.sub || undefined,
            },
          },
        };

    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      success_url: `${clientUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}?checkout=cancelled`,
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      metadata: {
        client_id: user.id,
        provider_id: String(providerId),
        provider_role: providerRole,
        kind,
        price_cents: String(amountCents),
        application_fee_cents: feeCents ? String(feeCents) : '',
        item_name: item.name,
      },
      line_items: [lineItem],
      allow_promotion_codes: true,
      ...connectOptions,
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to create checkout session.' });
  }
});

app.post('/api/stripe/connect-account', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured on the server.' });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Supabase service role is not configured on the server.' });
  }

  let user = null;
  try {
    user = await getUserFromRequest(req);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid Supabase session.' });
  }

  if (!user) {
    return res.status(401).json({ error: 'Sign in before setting up payouts.' });
  }

  const providerRole = normalizeProviderRole(req.body?.role);
  if (!providerRole) {
    return res.status(400).json({ error: 'Choose trainer or nutritionist payouts.' });
  }

  try {
    const provider = await fetchOwnedProvider(providerRole, user.id);
    if (!provider) {
      return res.status(404).json({
        error: `No ${providerRole} profile is connected to this account yet.`,
      });
    }

    let accountId = provider.stripe_account_id;
    let status = provider.stripe_account_status || 'pending';
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'standard',
        email: user.email || undefined,
        metadata: {
          owner_id: user.id,
          provider_id: String(provider.id),
          provider_role: providerRole,
        },
      });
      accountId = account.id;
      status = stripeAccountStatus(account);
      await updateProviderStripeFields(providerRole, provider.id, {
        stripe_account_id: accountId,
        stripe_account_status: status,
      });
    } else {
      const account = await stripe.accounts.retrieve(accountId);
      status = stripeAccountStatus(account);
      await updateProviderStripeFields(providerRole, provider.id, {
        stripe_account_status: status,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${clientUrl}?stripe_connect=refresh`,
      return_url: `${clientUrl}?stripe_connect=return`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url, accountId, status });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to start Stripe Connect onboarding.' });
  }
});

app.listen(port, () => {
  console.log(`Shape API listening on http://localhost:${port}`);
});
