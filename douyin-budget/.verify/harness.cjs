/* jsdom 验证脚本：在内存 mock（local-db.js）驱动 local.html，
 * 验证：① 日历天气+节点角标 ② 节点增删改+内置同步幂等 ③ 报表三列+维度分析 ④ Excel 导出结构。
 * 不依赖真实 CloudBase / 真实 Open-Meteo（fetch 由桩返回），不触碰线上数据。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DIR = '/Users/gujiwen/WorkBuddy/2026-08-19-15-32-01/douyin-budget';
const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra || '' });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/* ---- 构造 Open-Meteo 桩数据：覆盖 2026-01-01 ~ 2027-02-15 ---- */
function buildOpenMeteo() {
  const start = new Date('2026-01-01T00:00:00');
  const end = new Date('2027-02-15T00:00:00');
  const time = [], code = [], tmax = [], tmin = [], pop = [];
  const codes = [0, 1, 2, 3, 61, 63, 80, 95]; // 覆盖 晴/多云阴/雨/雷雨
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    time.push(fmtDate(d));
    code.push(codes[(d.getDate() + d.getMonth()) % codes.length]);
    tmax.push(30 + (d.getDate() % 5));
    tmin.push(22 + (d.getDate() % 4));
    pop.push((d.getDate() * 7) % 100);
  }
  return {
    daily: {
      time, weather_code: code,
      temperature_2m_max: tmax, temperature_2m_min: tmin,
      precipitation_probability_max: pop
    }
  };
}

(async () => {
  let html = fs.readFileSync(path.join(DIR, 'local.html'), 'utf8');
  // 去掉外部脚本（cloudbase/xlsx 真实库），本地-db/app 也改为手工注入，避免资源加载问题
  html = html
    .replace(/<script src="lib\/cloudbase\.full\.js"><\/script>/, '')
    .replace(/<script src="lib\/xlsx\.full\.min\.js"><\/script>/, '')
    .replace(/<script src="local-db\.js"><\/script>/, '')
    .replace(/<script src="app\.js[^"]*"><\/script>/, '');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://localhost:8090/',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const doc = window.document;

  // stub: fetch / confirm / XLSX
  window.fetch = async () => ({ ok: true, status: 200, json: async () => buildOpenMeteo() });
  window.confirm = () => true;
  const exportCapture = { sheets: [], name: null };
  window.XLSX = {
    utils: {
      book_new: () => ({ _sheets: [] }),
      json_to_sheet: (data) => ({ _cols: data && data.length ? Object.keys(data[0]) : [], _rows: data }),
      book_append_sheet: (wb, ws, name) => { wb._sheets.push({ name, cols: ws._cols, rows: ws._rows }); }
    },
    writeFile: (wb, name) => { exportCapture.sheets = wb._sheets; exportCapture.name = name; }
  };

  // 注入 local-db.js（IIFE 接管 window.cloudbase）与 app.js（global 函数声明）
  const inject = (code) => {
    const s = doc.createElement('script');
    s.textContent = code;
    doc.body.appendChild(s);
  };
  inject(fs.readFileSync(path.join(DIR, 'local-db.js'), 'utf8'));
  inject(fs.readFileSync(path.join(DIR, 'app.js'), 'utf8'));

  // boot() 已自动 initCloud + checkGate；等一拍再确保
  await sleep(200);
  await window.initCloud();
  window.enterApp();           // 设置 UI + bindNodeModal + loadAll(异步)
  await window.loadAll();      // 显式 await 数据加载与渲染
  await sleep(200);

  /* ============ 1) 日历：天气 + 节点角标 ============ */
  const cal = doc.querySelector('#m-calendar');
  const days = cal.querySelectorAll('.cal-day');
  const today = fmtDate(new Date());
  check('日历渲染 31 天(2026-08)', days.length === 31, `实际 ${days.length}`);

  const cell0819 = cal.querySelector('.cal-day[data-date="2026-08-19"]');
  check('七夕(8-19) 标记 has-node', cell0819 && cell0819.classList.contains('has-node'));
  const ndot0819 = cell0819 && cell0819.querySelector('.node-flag .ndot');
  check('七夕(8-19) 节点角标颜色=橙(festival #fa8c16)',
    ndot0819 && (ndot0819.getAttribute('style') || '').includes('#fa8c16'),
    ndot0819 ? ndot0819.getAttribute('style') : '无角标');

  const wthCells = cal.querySelectorAll('.cal-day .wth');
  check('天气图标已渲染（至少 1 个 .wth）', wthCells.length >= 1, `共 ${wthCells.length} 个`);
  const cellToday = cal.querySelector(`.cal-day[data-date="${today}"]`);
  check('今天(' + today + ') 含天气', cellToday && cellToday.querySelector('.wth'));

  const hasNodeCount = cal.querySelectorAll('.cal-day.has-node').length;
  check('8 月节点日 >= 2（七夕+中元节）', hasNodeCount >= 2, `共 ${hasNodeCount} 个`);

  /* ============ 2) 节点增删改 + 内置同步幂等 ============ */
  const store = window.__LOCAL_STORE;
  const before = store.dbudget_nodes.size;
  check('内置节点预置 42 条', before === 42, `实际 ${before}`);

  // 新增一个营销节点到今天
  await window.addNode({ date: today, name: '测试营销节点', type: 'marketing', color: '#1677ff', note: 'harness' });
  const afterAdd = store.dbudget_nodes.size;
  check('新增节点后 = 43', afterAdd === 43, `实际 ${afterAdd}`);
  const cellToday2 = cal.querySelector(`.cal-day[data-date="${today}"]`);
  check('今天(' + today + ') 新增后标记 has-node', cellToday2 && cellToday2.classList.contains('has-node'));

  // 编辑该节点
  let addedId = null;
  store.dbudget_nodes.forEach((v, k) => { if (v.name === '测试营销节点') addedId = k; });
  check('找到新增节点 _id', !!addedId, addedId || '');
  await window.updateNode(addedId, { date: today, name: '改名节点', type: 'marketing', color: '#1677ff', note: 'harness' });
  const renamed = store.dbudget_nodes.get(addedId);
  check('编辑后名称=改名节点', renamed && renamed.name === '改名节点', renamed ? renamed.name : '缺失');

  // 删除该节点
  await window.deleteNode(addedId, '改名节点');
  check('删除后回到 42', store.dbudget_nodes.size === 42, `实际 ${store.dbudget_nodes.size}`);
  const cellToday3 = cal.querySelector(`.cal-day[data-date="${today}"]`);
  check('今天删除节点后不再 has-node', cellToday3 && !cellToday3.classList.contains('has-node'));

  // 内置同步幂等：删掉七夕内置，再 seedNodes 应补回，且不重复
  let qxId = null;
  store.dbudget_nodes.forEach((v, k) => { if (v.name === '七夕' && v.date === '2026-08-19') qxId = k; });
  await window.deleteNode(qxId, '七夕');
  const afterDelQx = store.dbudget_nodes.size;
  check('删除七夕内置后 = 41', afterDelQx === 41, `实际 ${afterDelQx}`);
  const cell0819b = cal.querySelector('.cal-day[data-date="2026-08-19"]');
  check('七夕删除后 8-19 失去 has-node', cell0819b && !cell0819b.classList.contains('has-node'));

  await window.seedNodes();
  check('seedNodes 补回七夕后 = 42（幂等不重复）', store.dbudget_nodes.size === 42, `实际 ${store.dbudget_nodes.size}`);
  const cell0819c = cal.querySelector('.cal-day[data-date="2026-08-19"]');
  check('seedNodes 后 8-19 重新 has-node', cell0819c && cell0819c.classList.contains('has-node'));

  /* ============ 3) 报表：三列 + 维度分析 ============ */
  doc.querySelector('#r-from').value = '2026-08-01';
  doc.querySelector('#r-to').value = '2026-08-25';
  await window.runReport();
  await sleep(100);

  const ths = [...doc.querySelectorAll('#r-day-table thead th')].map(t => t.textContent.trim());
  check('每日表 12 列（含星期/节点/天气）', ths.length === 12, ths.join(','));
  check('表头含「星期」', ths.includes('星期'));
  check('表头含「节点」', ths.includes('节点'));
  check('表头含「天气」', ths.includes('天气'));

  const rows = doc.querySelectorAll('#r-day-table tbody tr');
  check('每日表 25 行(8-01~8-25)', rows.length === 25, `实际 ${rows.length}`);
  const row0819 = doc.querySelector('#r-day-table tbody tr[data-date="2026-08-19"], #r-day-table tbody tr'); // 用内容定位
  // 直接取 8-19 行（按第一列文本）
  let row819 = null;
  rows.forEach(r => { if (r.children[0].textContent.trim() === '2026-08-19') row819 = r; });
  check('8-19 行 节点列含「七夕」', row819 && row819.children[2].textContent.includes('七夕'),
    row819 ? row819.children[2].textContent : '无行');
  check('8-19 行 天气列有值(非—)', row819 && row819.children[3].textContent.trim() !== '—',
    row819 ? row819.children[3].textContent : '无行');

  const dimBlock = doc.querySelector('#r-dim-block');
  const dimHtml = dimBlock ? dimBlock.innerHTML : '';
  check('维度分析区含「按星期」', dimHtml.includes('按星期'));
  check('维度分析区含「按节点」', dimHtml.includes('按节点'));
  check('维度分析区含「按天气」', dimHtml.includes('按天气'));
  const dimTables = dimBlock ? dimBlock.querySelectorAll('table.dim-table') : [];
  check('维度分析含 3 张分组表', dimTables.length === 3, `实际 ${dimTables.length}`);

  /* ============ 4) Excel 导出结构 ============ */
  doc.querySelector('#r-export').click();
  await sleep(50);
  const sheetNames = exportCapture.sheets.map(s => s.name);
  check('导出含「每日汇总」sheet', sheetNames.includes('每日汇总'), sheetNames.join(','));
  check('导出含「维度分析」sheet', sheetNames.includes('维度分析'));
  const daySheet = exportCapture.sheets.find(s => s.name === '每日汇总');
  const dayCols = daySheet ? daySheet.cols : [];
  check('每日汇总含「星期/节点/天气」列',
    dayCols.includes('星期') && dayCols.includes('节点') && dayCols.includes('天气'),
    dayCols.join(','));
  const dimSheet = exportCapture.sheets.find(s => s.name === '维度分析');
  check('维度分析 sheet 有数据行(>=3 分组)', dimSheet && dimSheet.rows.length >= 3,
    dimSheet ? `${dimSheet.rows.length} 行` : '无');

  /* ============ 汇总 ============ */
  const failed = results.filter(r => !r.ok);
  console.log('\n================ 验证汇总 ================');
  console.log(`总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  if (failed.length) { console.log('失败项：'); failed.forEach(f => console.log(' - ' + f.name + (f.extra ? ' (' + f.extra + ')' : ''))); }
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
