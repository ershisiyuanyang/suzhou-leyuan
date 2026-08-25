#!/usr/bin/env python3
# 生成 local-db.js：把 6 个备份 JSON 内联进一个纯内存的 CloudBase NoSQL mock，
# 仅在 window.__LOCAL_DB === true 时接管 window.cloudbase，使页面以本地备份数据运行。
import json, os

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKUP = os.path.join(ROOT, "backup")
NAMES = ["dbudget_settings", "dbudget_plans", "dbudget_months",
         "dbudget_users", "dbudget_days", "dbudget_logs"]

data = {}
for n in NAMES:
    with open(os.path.join(BACKUP, n + ".json"), encoding="utf-8") as f:
        data[n] = json.load(f)

# 本地沙箱预置内置节点（与线上 seed 一致），便于本地直接查看节点/天气渲染
_builtin = json.load(open(os.path.join(ROOT, ".seed", "builtin_nodes.json"), encoding="utf-8"))
data["dbudget_nodes"] = [dict(_id="bn_" + b["date"] + "_" + b["type"], **b) for b in _builtin]
data["dbudget_weather"] = []

# 转成 JS 字面量；把 < 转义避免提前闭合 </script>
data_js = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")

JS = r'''/* 本地模式数据层（local-db.js）
 * 仅当 window.__LOCAL_DB === true 时生效，用 6 个备份 JSON 模拟 CloudBase NoSQL。
 * 纯内存、同步接管 window.cloudbase，不发起任何网络请求、不触碰线上数据。
 * 说明：本地运行期间的任何修改只存在于内存，刷新页面即回到备份快照。
 */
(function () {
  if (!window.__LOCAL_DB) return;

  const __BACKUP__ = ''' + data_js + r''';

  const store = {};
  for (const k in __BACKUP__) {
    const m = new Map();
    for (const d of __BACKUP__[k]) m.set(d._id, d);
    store[k] = m;
  }

  function makeLeaf(op, val) {
    const leaf = { __cmd: true, op, val, _and: null };
    leaf.and = (other) => ({ __cmd: true, op: null, val: null, _and: [leaf, other] });
    return leaf;
  }
  const command = {
    lt: v => makeLeaf('lt', v),
    lte: v => makeLeaf('lte', v),
    gt: v => makeLeaf('gt', v),
    gte: v => makeLeaf('gte', v),
    eq: v => makeLeaf('eq', v),
    neq: v => makeLeaf('neq', v),
    in: v => makeLeaf('in', v)
  };

  function matchCmd(fv, c) {
    if (c._and) return c._and.every(x => matchCmd(fv, x));
    switch (c.op) {
      case 'lt': return fv < c.val;
      case 'lte': return fv <= c.val;
      case 'gt': return fv > c.val;
      case 'gte': return fv >= c.val;
      case 'eq': return fv === c.val;
      case 'neq': return fv !== c.val;
      case 'in': return Array.isArray(c.val) && c.val.indexOf(fv) >= 0;
    }
    return true;
  }
  function matchWhere(doc, where) {
    for (const k in where) {
      const cond = where[k];
      if (cond && cond.__cmd) { if (!matchCmd(doc[k], cond)) return false; }
      else { if (doc[k] !== cond) return false; }
    }
    return true;
  }
  function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function clone(d) { return JSON.parse(JSON.stringify(d)); }

  function makeDoc(name, id) {
    return {
      async get() { const d = store[name].get(id); return { data: d ? [clone(d)] : [] }; },
      async set(doc) { const full = Object.assign({ _id: id }, doc); store[name].set(id, full); return { _id: id }; },
      async update(patch) {
        const d = store[name].get(id);
        if (!d) throw new Error('doc not found: ' + id);
        Object.assign(d, patch);
        return { stats: { updated: 1 } };
      },
      async remove() { store[name].delete(id); return { stats: { removed: 1 } }; }
    };
  }

  function makeCollection(name) {
    const st = {};
    const b = {
      where(w) { st.where = w || {}; return b; },
      orderBy(f, dir) { st.orderBy = { f, dir }; return b; },
      limit(n) { st.limit = n; return b; },
      skip(n) { st.skip = n || 0; return b; },
      async get() {
        let arr = [...store[name].values()].map(clone);
        if (st.where) arr = arr.filter(d => matchWhere(d, st.where));
        if (st.orderBy) {
          const { f, dir } = st.orderBy;
          arr.sort((a, b2) => {
            let r = (a[f] < b2[f]) ? -1 : (a[f] > b2[f]) ? 1 : 0;
            return dir === 'desc' ? -r : r;
          });
        }
        const start = st.skip || 0;
        const end = (st.limit != null) ? start + st.limit : arr.length;
        return { data: arr.slice(start, end) };
      },
      async add(doc) { const id = genId(); const full = Object.assign({ _id: id }, doc); store[name].set(id, full); return { _id: id }; },
      doc(id) { return makeDoc(name, id); }
    };
    return b;
  }

  function makeDb() { return { command, collection(name) { return makeCollection(name); } }; }

  const mockCloudbase = {
    init() {
      return {
        auth: {
          async signInAnonymously() { return { error: null }; },
          async getLoginState() { return null; },
          async signOut() { return { error: null }; }
        },
        database() { return makeDb(); }
      };
    }
  };

  window.cloudbase = mockCloudbase;
  window.__LOCAL_STORE = store;
  console.log('[local-db] 已载入备份数据（内存模式）：',
    Object.fromEntries(Object.entries(store).map(([k, m]) => [k, m.size])));
})();
'''

with open(os.path.join(ROOT, "local-db.js"), "w", encoding="utf-8") as f:
    f.write(JS)

# 同时生成 local.html：复制 index.html，在 cloudbase SDK 与 app.js 间注入本地模式开关
with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
    html = f.read()
marker = '<script src="app.js?v=20260825a"></script>'
inject = '<script>window.__LOCAL_DB = true;</script>\n<script src="local-db.js"></script>\n' + marker
if marker not in html:
    raise SystemExit("未在 index.html 找到 app.js 引入标记，请检查版本号")
html2 = html.replace(marker, inject, 1)
with open(os.path.join(ROOT, "local.html"), "w", encoding="utf-8") as f:
    f.write(html2)

print("wrote local-db.js:", os.path.getsize(os.path.join(ROOT, "local-db.js")), "bytes")
print("wrote local.html:", os.path.getsize(os.path.join(ROOT, "local.html")), "bytes")
print("备份记录数:", {k: len(v) for k, v in data.items()})
