// The code box on /subscribe and /purchase (coach direct charges, part B): a Shape code or the
// coach's own, checked by the server action before the redirect to Stripe (coach-checkout.ts).
// A Shape code lives on Shape's Stripe account and the checkout on the coach's, so Stripe's own
// box could never take one; this box is where it goes in.

export default function CheckoutCodeField() {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: '0.72rem', color: 'rgba(255,255,255,0.52)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
        Code (optional)
      </span>
      <input
        type="text"
        name="code"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={64}
        pattern="[A-Za-z0-9_\-]{2,64}"
        placeholder="Shape or coach code"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: '0.9rem',
          background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: 'inherit', fontFamily: 'inherit',
        }}
      />
    </label>
  );
}
