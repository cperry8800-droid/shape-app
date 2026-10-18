// tests/helpers/coach-checkout-module.mjs
//
// The registry entries a harness needs to load a module that imports src/lib/coach-checkout.ts
// (coach direct charges, part B): the real stripe-connect.ts and coach-checkout.ts, compiled once.
// Spread them FIRST into a registry, so a harness's own '@/lib/stripe-connect' still wins.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let loaded = null;

export async function coachCheckoutEntries() {
  loaded ??= (async () => {
    const connect = await loadRealModule(join(ROOT, 'src/lib/stripe-connect.ts'), { typescript: true });
    const coachCheckout = await loadRealModule(join(ROOT, 'src/lib/coach-checkout.ts'), { typescript: true, registry: new Map([['@/lib/stripe-connect', connect]]) });
    return [['@/lib/stripe-connect', connect], ['@/lib/coach-checkout', coachCheckout]];
  })();
  return loaded;
}
