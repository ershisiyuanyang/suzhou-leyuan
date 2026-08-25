/* 验证 fetchWeather 的刷新策略（12h TTL）：
 *  - 过去日期(<今天)：缓存固定，不刷新
 *  - 未来日期且缓存<12h：不刷新
 *  - 未来日期且缓存>12h：刷新（更新云端记录）
 * 用本地 mock（local-db.js）驱动，fetch 由桩返回，不触碰线上。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DIR = '/Users/gujiwen/WorkBuddy/2026-08-19-15-32-01/douyin-budget';
const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const genId = () => 'w_' + Math.random().toString(36).slice(2, 10);

/* Open-Meteo 桩：覆盖 2026-01-01 ~ 2027-02-15，确定性值 */
function buildOpenMeteo() {
  const start = new Date('2026-01-01T00:00:00');
  const end = new Date('2027-02-15T00:00:00');
  const time = [], code = [], tmax = [], tmin = [], pop = [];
  const codes = [0, 1, 2, 3, 61, 63, 80, 95];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    time.push(fmtDate(d));
    code.push(codes[(d.getDate() + d.getMonth()) % codes.length]);
    tmax.push(30 + (d.getDate() % 5));
    tmin.push(22 + (d.getDate() % 4));
    pop.push((d.getDate() * 7) % 100);
  }
  return { daily: { time, weather_code: code, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_probability_max: pop } };
}

(async () => {
  let html = fs.readFileSync(path.join(DIR, 'local.html'), 'utf8')
    .replace(/<script src="lib\/cloudbase\.full\.js"><\/script>/, '')
    .replace(/<script src="lib\/xlsx\.full\.min\.js"><\/script>/, '')
    .replace(/<script src="local-db\.js"><\/script>/, '')
    .replace(/<script src="app\.js[^"]*"><\/script>/, '');

  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://localhost:8090/', pretendToBeVisual: true });
  const { window } = dom;
  const doc = window.document;
  window.fetch = async () => ({ ok: true, status: 200, json: async () => buildOpenMeteo() });
  window.confirm = () => true;
  window.XLSX = { utils: { book_new: () => ({ _sheets: [] }), json_to_sheet: (d) => ({ _cols: d && d.length ? Object.keys(d[0]) : [], _rows: d }), book_append_sheet: (wb, ws, n) => wb._sheets.push({ name: n, cols: ws._cols, rows: ws._rows }) }, writeFile: () => {} };

  const inject = (code) => { const s = doc.createElement('script'); s.textContent = code; doc.body.appendChild(s); };
  inject(fs.readFileSync(path.join(DIR, 'local-db.js'), 'utf8'));
  inject(fs.readFileSync(path.join(DIR, 'app.js'), 'utf8'));

  await sleep(150);
  await window.initCloud();

  // 构造三个测试日期（相对今天），并预置不同 fetchedAt 的缓存
  const now = new Date();
  const past = fmtDate(addDays(now, -5));
  const futOld = fmtDate(addDays(now, 5));
  const futFresh = fmtDate(addDays(now, 3));
  const month = past.slice(0, 7); // 同月（当前环境为 2026-08）
  const oldFa = new Date(now.getTime() - 2 * 86400000).toISOString();   // 2 天前（>12h）
  const freshFa = new Date(now.getTime() - 1 * 3600000).toISOString();  // 1 小时前（<12h）

  const store = window.__LOCAL_STORE;
  const wx = store.dbudget_weather;
  // 注意：mock 的 Map key 必须等于文档 _id（与真实 CloudBase 一致）
  wx.set('p1', { _id: 'p1', date: past, code: 888, tmax: 1, tmin: 1, pop: 1, fetchedAt: freshFa });     // 过去，固定
  wx.set('f1', { _id: 'f1', date: futOld, code: 999, tmax: 1, tmin: 1, pop: 1, fetchedAt: oldFa });      // 未来且旧，应刷新
  wx.set('f2', { _id: 'f2', date: futFresh, code: 777, tmax: 1, tmin: 1, pop: 1, fetchedAt: freshFa });  // 未来且新，不刷新

  // 清空内存缓存（确保从 mock 重新加载预置值）
  // 注：weatherCache 是模块内部变量，fetchWeather 每次会先从 DB 读，无需手动清

  await window.fetchWeather(month);
  await sleep(100);

  const get = (date) => { let r = null; wx.forEach(v => { if (v.date === date) r = v; }); return r; };
  const p = get(past), fo = get(futOld), ff = get(futFresh);

  check('过去日期 缓存固定不变 (code=888)', p && p.code === 888, p ? 'code=' + p.code : '缺失');
  check('未来-新(<12h) 不刷新 (code=777)', ff && ff.code === 777, ff ? 'code=' + ff.code : '缺失');
  check('未来-旧(>12h) 已刷新 (code≠999)', fo && fo.code !== 999, fo ? 'code=' + fo.code : '缺失');
  check('未来-旧 刷新后 fetchedAt 已更新', fo && fo.fetchedAt && Date.parse(fo.fetchedAt) > Date.parse(oldFa), fo ? fo.fetchedAt : '缺失');

  const failed = results.filter(r => !r.ok);
  console.log(`\n总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('TTL TEST ERROR', e); process.exit(2); });
