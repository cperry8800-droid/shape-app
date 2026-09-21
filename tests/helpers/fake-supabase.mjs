// tests/helpers/fake-supabase.mjs
//
// A table-driven stand-in for the supabase-js query builder, enough for the
// read paths Nora's tools use: from().select().eq/in/is/gte/lte/lt/or()
// .order().limit().maybeSingle(), awaited as { data, error }, plus rpc().
//
// It APPLIES the filters and orders to the rows it was given, so a test reads
// what the query would actually return rather than whatever the stub was told
// to say — a reader that forgets an `.eq('status', …)` gets the wrong rows
// here exactly as it would in production. It also PROJECTS the select list:
// a column the reader never asked for comes back undefined, which is how a
// `select('a, b')` that reads `row.c` fails in production (silently, as an
// absent value) — the fake would otherwise hand every column over and hide
// it. `*` or an embedded resource (`rel(...)`) disables the projection.
// `fail` names tables (or 'rpc:<name>') whose reads answer { error }, the
// honest-unavailable path.
export function fakeSupabase({ tables = {}, rpcs = {}, fail = [] } = {}) {
  const calls = [];
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function run(state) {
    let rows = (tables[state.table] || []).slice();
    for (const f of state.filters) rows = rows.filter(f);
    if (state.orders.length) {
      rows.sort((x, y) => {
        for (const o of state.orders) {
          const a = x[o.col], b = y[o.col];
          const an = a == null, bn = b == null;
          if (an && bn) continue;
          if (an) return o.nullsFirst ? -1 : 1;
          if (bn) return o.nullsFirst ? 1 : -1;
          const c = cmp(a, b);
          if (c !== 0) return o.ascending ? c : -c;
        }
        return 0;
      });
    }
    if (state.limit != null) rows = rows.slice(0, state.limit);
    return rows.map((r) => project(r, state.select));
  }
  // PostgREST's select list: `col`, `alias:col`, and `*` / `rel(...)` (no projection).
  function project(row, select) {
    if (select == null) return row;
    const cols = String(select).split(',').map((c) => c.trim()).filter(Boolean);
    if (!cols.length || cols.some((c) => c === '*' || c.includes('('))) return row;
    const out = {};
    for (const c of cols) {
      const [alias, col] = c.includes(':') ? c.split(':') : [c, c];
      if (Object.prototype.hasOwnProperty.call(row, col)) out[alias] = row[col];
    }
    return out;
  }
  function from(table) {
    const state = { table, filters: [], orders: [], limit: null, single: false, select: null };
    const chain = {
      select(cols) { state.select = cols; return chain; },
      eq(col, v) { state.filters.push((r) => r[col] === v); return chain; },
      neq(col, v) { state.filters.push((r) => r[col] !== v); return chain; },
      in(col, vs) { state.filters.push((r) => vs.includes(r[col])); return chain; },
      is(col, v) { state.filters.push((r) => (v === null ? r[col] == null : r[col] === v)); return chain; },
      gte(col, v) { state.filters.push((r) => r[col] != null && String(r[col]) >= String(v)); return chain; },
      lte(col, v) { state.filters.push((r) => r[col] != null && String(r[col]) <= String(v)); return chain; },
      lt(col, v) { state.filters.push((r) => r[col] != null && String(r[col]) < String(v)); return chain; },
      gt(col, v) { state.filters.push((r) => r[col] != null && String(r[col]) > String(v)); return chain; },
      // PostgREST's 'col.op.value,col.op.value' disjunction — the two operators
      // the readers use.
      or(expr) {
        const terms = String(expr).split(',').map((t) => { const [col, op, ...rest] = t.split('.'); return { col, op, val: rest.join('.') }; });
        state.filters.push((r) => terms.some(({ col, op, val }) => {
          if (op === 'is' && val === 'null') return r[col] == null;
          if (op === 'gte') return r[col] != null && String(r[col]) >= val;
          if (op === 'eq') return String(r[col]) === val;
          throw new Error(`fake-supabase: unsupported or() operator ${op}`);
        }));
        return chain;
      },
      order(col, { ascending = true, nullsFirst = false } = {}) { state.orders.push({ col, ascending, nullsFirst }); return chain; },
      limit(n) { state.limit = n; return chain; },
      maybeSingle() { state.single = true; return chain; },
      then(res, rej) {
        calls.push({ table, select: state.select, single: state.single, limit: state.limit });
        const failed = fail.includes(table);
        const out = failed
          ? { data: null, error: { message: `fake failure on ${table}` } }
          : { data: state.single ? (run(state)[0] ?? null) : run(state), error: null };
        return Promise.resolve(out).then(res, rej);
      },
    };
    return chain;
  }
  return {
    from,
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (fail.includes(`rpc:${name}`)) return { data: null, error: { message: `fake failure on rpc ${name}` } };
      const fn = rpcs[name];
      return { data: fn ? await fn(args) : null, error: null };
    },
    _calls: calls,
  };
}
