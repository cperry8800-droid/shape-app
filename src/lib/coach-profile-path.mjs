// Where a coach's profile lives on the website, for links built on the server.
//
// The live coach profile is the living profile, `/newdesign/MemberProfile.html`, and the site
// links it the way marketplace.jsx does: `?u=<the listing's owner_id>&role=<role>` for a coach
// with an account, `?name=<listing name>&role=<role>` for one without (Shape's own listings).
// ⚠ NOT `TrainerPublic.html?id=` / `NutritionistPublic.html?id=`: those two are redirect stubs
// that forward only `?u=` or `?coach=` and drop `?id=` (Codex on #2350), so a link by listing id
// lands on the visitor's own profile.
//
// The result always carries a `?`, because the checkout actions append `&error=…` to it.
export function coachProfilePath(role, listing) {
  const r = role === 'nutritionist' ? 'nutritionist' : 'trainer';
  const owner = listing && typeof listing.owner_id === 'string' ? listing.owner_id.trim() : '';
  if (owner) return `/newdesign/MemberProfile.html?u=${encodeURIComponent(owner)}&role=${r}`;
  const name = listing && typeof listing.name === 'string' ? listing.name.trim() : '';
  if (name) return `/newdesign/MemberProfile.html?name=${encodeURIComponent(name)}&role=${r}`;
  return `/newdesign/Marketplace.html?role=${r}`;
}
