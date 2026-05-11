# Shape API

Small backend for production-only operations that cannot run inside the mobile app.

## Setup

1. Copy `.env.example` to `.env`.
2. Add your Stripe test secret key, webhook secret, Supabase URL, anon key, and service-role key.
3. Run:

```bash
npm install
npm run dev
```

The mobile app should use:

```bash
VITE_API_BASE_URL=http://localhost:4242
```

## Production notes

- Do not put `STRIPE_SECRET_KEY` in the Capacitor app.
- Do not put `SUPABASE_SERVICE_ROLE_KEY` in the Capacitor app.
- Before launch, replace client-sent prices with server/database price lookup.
- Stripe webhook events persist to your existing `subscriptions` and `one_time_purchases` tables.
- For iOS digital subscriptions or digital app features, use Apple In-App Purchase unless your use case qualifies for an allowed exception.
