// A recording fake of the SERVICE-ROLE client for Nora's admin help desk
// (src/lib/ai/adminLookup.mjs): reads filter and project like PostgREST, inserts and updates
// land in `_logs` (the admin_lookup_log rows), and `_calls` lists every call in order.
// `fail` names tables ('profiles') or one operation on one ('insert:admin_lookup_log').
export function fakeDb({ tables = {}, fail = [] } = {}) {
  const calls = [];
  const db = {
    _calls: calls,
    _logs: [],
    from(table) {
      const st = { table, filters: [], op: 'select', payload: null, limit: null, cols: null };
      const run = () => {
        calls.push({ table, op: st.op, cols: st.cols, filters: st.filters.map((f) => f.desc) });
        if (fail.includes(table) || fail.includes(`${st.op}:${table}`)) return { data: null, error: { message: `fake failure on ${st.op} ${table}` } };
        if (st.op === 'insert') {
          const row = { id: `log-${db._logs.length + 1}`, ...st.payload };
          db._logs.push(row);
          return { data: { id: row.id }, error: null };
        }
        if (st.op === 'update') {
          for (const row of db._logs) if (st.filters.every((f) => f.test(row))) Object.assign(row, st.payload);
          return { data: null, error: null };
        }
        let rows = (tables[table] || []).filter((r) => st.filters.every((f) => f.test(r)));
        if (st.limit != null) rows = rows.slice(0, st.limit);
        // Project the selected columns, as PostgREST does.
        const cols = String(st.cols || '*').split(',').map((c) => c.trim());
        if (!cols.includes('*')) rows = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
        return { data: st.single ? rows[0] || null : rows, error: null };
      };
      const chain = {
        select(cols) { st.cols = cols; return chain; },
        insert(p) { st.op = 'insert'; st.payload = p; return chain; },
        update(p) { st.op = 'update'; st.payload = p; return chain; },
        eq(c, v) { st.filters.push({ desc: `${c}=${v}`, test: (r) => r[c] === v }); return chain; },
        in(c, vs) { st.filters.push({ desc: `${c} in ${vs}`, test: (r) => vs.includes(r[c]) }); return chain; },
        order() { return chain; },
        limit(n) { st.limit = n; return chain; },
        single() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return chain;
    },
  };
  return db;
}
