// tests/helpers/goals-client.mjs
//
// A stand-in for the supabase-js client over `user_goals`, enough for a route that reads and writes a
// whole document compare-and-set (src/lib/user-goals-cas.ts): select('data').eq().eq().maybeSingle(),
// update({ data }).eq().eq().is('data->>rev', null) | .eq('data->>rev', tok).select('kind'), and
// insert(row), with PostgREST's answers: an UPDATE that matches nothing is no error and no rows, and an
// insert over an existing (user_id, kind) is 23505. `docs` maps `${user_id}:${kind}` → data. `fail`
// names operations that answer { error }: 'read', 'update', 'insert'. `beforeUpdate(key)` runs just
// before an update applies (a second device writing between a read and a write). rpc() answers from
// `rpcs` (a function of the args, or { data, error }), and every call is recorded in `calls`.
export function goalsClient({ docs = {}, rpcs = {}, fail = [], beforeUpdate = null, user = { id: 'u1' } } = {}) {
  const store = new Map(Object.entries(docs));
  const calls = [];
  const revText = (d) => (d && typeof d === 'object' && d.rev != null ? String(d.rev) : null);
  return {
    store,
    calls,
    auth: { getUser: async () => ({ data: { user } }) },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      const r = rpcs[name];
      if (typeof r === 'function') return r(args);
      return r || { data: null, error: null };
    },
    from(table) {
      if (table !== 'user_goals') throw new Error(`goals-client: unexpected table ${table}`);
      const f = {};
      let op = null;
      let row = null;
      let revFilter;
      const key = () => `${f.user_id}:${f.kind}`;
      const exec = async () => {
        if (op === 'select') {
          calls.push({ op: 'read', key: key() });
          if (fail.includes('read')) return { data: null, error: { message: 'fake read failure' } };
          return { data: store.has(key()) ? { data: store.get(key()) } : null, error: null };
        }
        if (op === 'update') {
          calls.push({ op: 'update', key: key(), rev: revFilter, data: row.data });
          if (fail.includes('update')) return { data: null, error: { message: 'fake update failure' } };
          if (beforeUpdate) beforeUpdate(key(), store);
          if (!store.has(key())) return { data: [], error: null };
          if (revText(store.get(key())) !== revFilter) return { data: [], error: null };
          store.set(key(), row.data);
          return { data: [{ kind: f.kind }], error: null };
        }
        throw new Error('goals-client: nothing to run');
      };
      const chain = {
        select(cols) { if (!op) op = 'select'; return chain; },
        update(r) { op = 'update'; row = r; return chain; },
        eq(col, v) { if (col === 'data->>rev') revFilter = v; else f[col] = v; return chain; },
        is(col, v) { if (col === 'data->>rev') revFilter = v === null ? null : v; return chain; },
        maybeSingle() { return chain; },
        then(res, rej) { return exec().then(res, rej); },
        async insert(r) {
          const k = `${r.user_id}:${r.kind}`;
          calls.push({ op: 'insert', key: k, data: r.data });
          if (fail.includes('insert')) return { error: { message: 'fake insert failure' } };
          if (store.has(k)) return { error: { code: '23505', message: 'duplicate key' } };
          store.set(k, r.data);
          return { error: null };
        },
      };
      return chain;
    },
  };
}
