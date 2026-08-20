/* ================================================================
 * 抖音本地推 · 投流预算管理
 * 数据层：腾讯云 CloudBase NoSQL（匿名登录 + 已登录用户可读写）
 * 说明：访问密码仅作前端门禁（防君子），数据权限为登录用户可读写
 * ================================================================ */
'use strict';

/* ---------- 配置 ---------- */
const ENV_ID = 'suzhou-leyuan-d6gfkgrlvcef0e76f';
const REGION = 'ap-shanghai';
const ACCESS_KEY = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL3N1emhvdS1sZXl1YW4tZDZnZmtncmx2Y2VmMGU3NmYuYXAtc2hhbmdoYWkudGNiLWFwaS50ZW5jZW50Y2xvdWRhcGkuY29tIiwic3ViIjoiYW5vbiIsImF1ZCI6InN1emhvdS1sZXl1YW4tZDZnZmtncmx2Y2VmMGU3NmYiLCJleHAiOjQwOTA4MDgxMDksImlhdCI6MTc4NzEyNDkwOSwibm9uY2UiOiJGRDMtTUtaTVFFS1NSUXBiTFBtRGtBIiwiYXRfaGFzaCI6IkZEMy1NS1pNUUVLU1JRcGJMUG1Ea0EiLCJuYW1lIjoiQW5vbnltb3VzIiwic2NvcGUiOiJhbm9ueW1vdXMiLCJwcm9qZWN0X2lkIjoic3V6aG91LWxleXVhbi1kNmdma2dybHZjZWYwZTc2ZiIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJ1c2VyX3R5cGUiOiIiLCJjbGllbnRfdHlwZSI6ImNsaWVudF91c2VyIiwiaXNfc3lzdGVtX2FkbWluIjpmYWxzZX0.nVEJv7_WviQjYKtNJtEqtzezvzAt5qQdGwncsZDCiDZ9qSnkwJAxNFQLUI0iA_FBeK2Ie9eAQxDIXnilA7yYJzsd0igPGdacFe2CAdqV7ScwtmPEuVs58CsILGGjse_sCWmwErJe4HSAjWcJ_pNbx2TVvKsJCUSJLtqYjSSWIiXsZEGnsJLakZATU-vKRqPop8VozIKTI5hgngIgSkora9w5YTmjEluHF5Zyj91qCwY8VGzO0pF6Ovs42yLissb1Febr8lvlBwuZoX8qSWK9P_FLQqve-njPWwS5a9Mhq9IRkN9-B_ui2_7T-PQvOvuaoTOC4765z-DSflW4-ED2ZQ';
const C = {
  plans: 'dbudget_plans',
  days: 'dbudget_days',
  months: 'dbudget_months',
  logs: 'dbudget_logs',
  settings: 'dbudget_settings'
};
/* 投流计划分类（4 项，外加"未分类"用于未指派的历史计划） */
const CATEGORIES = ['通投短视频', '通投搜索', '直播', '门店全域'];
const CAT_COLORS = {
  '通投短视频': 'cat-blue',
  '通投搜索': 'cat-purple',
  '直播': 'cat-red',
  '门店全域': 'cat-green',
  '未分类': 'cat-gray'
};
function catBadge(cat) {
  const c = cat || '未分类';
  return `<span class="badge cat-badge ${CAT_COLORS[c] || 'cat-gray'}">${esc(c)}</span>`;
}
function catIndex(c) { const i = CATEGORIES.indexOf(c); return i < 0 ? 99 : i; }
/* 生成分类下拉选项：首项"未分类"(value="")用于未指派计划 */
function catOptions(selected) {
  return ['', ...CATEGORIES].map(c => `<option value="${esc(c)}" ${c === (selected || '') ? 'selected' : ''}>${c || '未分类'}</option>`).join('');
}
const SESSION_KEY = 'dbpwd_ok';

/* ---------- 小工具 ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtMonth = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const todayStr = () => fmtDate(new Date());
const monthStr = () => fmtMonth(new Date());
const money = (n) => '¥' + (n == null ? 0 : n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const moneyRaw = (n) => (n == null ? 0 : Math.round(n * 100) / 100);
/* 曝光量格式化：≥1万 显示 x.x万 */
const fmtNum = (n) => {
  n = n == null ? 0 : n;
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString('zh-CN');
};
/* ROI = 成交金额 ÷ 实际消耗；无消耗时显示 — */
const fmtRoi = (gmv, actual) => {
  if (!gmv || !actual || actual <= 0) return '—';
  return (gmv / actual).toFixed(1) + '倍';
};
const daysInMonth = (month) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
const monthLabel = (month) => `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
function parseDate(dateStr) { return new Date(dateStr + 'T00:00:00'); }

/* 密码哈希：UTF-8 字节 → SHA-256（支持中文密码） */
function hashPwd(s) {
  let b;
  try { b = unescape(encodeURIComponent(s)); } catch (e) { b = s; }
  return sha256(b);
}

/* ---------- SHA-256（纯 JS，兼容 file:// 环境） ---------- */
function sha256(ascii) {
  function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
  const mathPow = Math.pow, maxWord = mathPow(2, 32);
  let result = '';
  const words = [];
  const asciiBitLength = ascii.length * 8;
  let hash = sha256.h = sha256.h || [];
  const k = sha256.k = sha256.k || [];
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0);
  words[words.length] = (asciiBitLength);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0, 8);
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (w[i - 16]
          + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
          + w[i - 7]
          + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

/* ---------- CloudBase 初始化 ---------- */
let db = null, cmd = null;
async function initCloud() {
  const app = cloudbase.init({ env: ENV_ID, region: REGION, accessKey: ACCESS_KEY, auth: { detectSessionInUrl: true } });
  const { error } = await app.auth.signInAnonymously();
  if (error) throw error;
  db = app.database();
  cmd = db.command;
}

/* ---------- 数据层 ---------- */
async function getAll(coll, where = {}, limitPerPage = 200) {
  const res = [];
  let skip = 0;
  for (;;) {
    let q = db.collection(coll).where(where);
    const page = await q.skip(skip).limit(limitPerPage).get();
    res.push(...page.data);
    if (page.data.length < limitPerPage) break;
    skip += limitPerPage;
  }
  return res;
}
async function getSetting(key) {
  const res = await db.collection(C.settings).where({ key }).limit(1).get();
  return res.data.length ? res.data[0].value : null;
}
async function setSetting(key, value) {
  const res = await db.collection(C.settings).where({ key }).limit(1).get();
  if (res.data.length) {
    await db.collection(C.settings).doc(res.data[0]._id).update({ value });
  } else {
    await db.collection(C.settings).add({ key, value });
  }
}
async function addLog(action, detail) {
  try {
    await db.collection(C.logs).add({ time: new Date().toISOString(), action, detail });
  } catch (e) { console.warn('写日志失败', e); }
}
async function upsertMonth(month, totalBudget, note) {
  const res = await db.collection(C.months).where({ month }).limit(1).get();
  const doc = { totalBudget: moneyRaw(totalBudget), note: note || '', updatedAt: new Date().toISOString() };
  if (res.data.length) {
    await db.collection(C.months).doc(res.data[0]._id).update(doc);
  } else {
    await db.collection(C.months).add({ month, ...doc });
  }
}
/* 按 (date, planId) 幂等写入：用复合 _id + doc().set/update，避免 add 返回 _id 字段名不一致问题 */
const dayId = (date, planId) => date + '__' + planId;
async function upsertDay(date, planId, patch) {
  const id = dayId(date, planId);
  const ref = db.collection(C.days).doc(id);
  const old = dayDoc(date, planId);
  const now = new Date().toISOString();
  if (old) {
    await ref.update({ ...patch, updatedAt: now });
    Object.assign(old, patch, { updatedAt: now });
    return id;
  } else {
    const data = { date, planId, budget: 0, actual: 0, ...patch, updatedAt: now };
    await ref.set(data);
    if (!dayCache[date]) dayCache[date] = {};
    dayCache[date][planId] = { _id: id, ...data };
    return id;
  }
}

/* ---------- 全局状态 ---------- */
let plans = [];
let month = monthStr();          // 月度排布当前查看月份
let monthRecords = null;         // 当前月 dbudget_months 记录
let report = null;               // 报表缓存
let accountBalance = null;       // 实际账户余额（跨月延续，存 settings）
let accountUpdatedAt = null;     // 账户余额上次更新时间

/* ---------- Toast / Alert ---------- */
let toastTimer = null;
function toast(msg, type = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}
function showAlert(id, msg, type = 'info') {
  const el = $('#' + id);
  el.textContent = msg;
  el.className = 'alert show alert-' + type;
}
function hideAlert(id) { $('#' + id).className = 'alert'; }

/* ---------- 密码门禁 ---------- */
async function checkGate() {
  const hash = await getSetting('accessPwdHash');
  if (!hash) {
    $('#gate-title').textContent = '首次使用 · 设置访问密码';
    $('#gate-desc').textContent = '设置一个访问密码（至少4位），请牢记';
    $('#gate-btn').onclick = async () => {
      const v = $('#gate-pwd').value;
      if (v.length < 4) { $('#gate-err').textContent = '密码至少 4 位'; return; }
      const h = hashPwd(v);
      try {
        await setSetting('accessPwdHash', h);
        await addLog('初始化', '设置访问密码');
        sessionStorage.setItem(SESSION_KEY, h);
        toast('密码已设置，请牢记');
        enterApp();
      } catch (e) { $('#gate-err').textContent = '保存失败：' + e.message; }
    };
  } else if (sessionStorage.getItem(SESSION_KEY) === hash) {
    enterApp();
  } else {
    $('#gate-title').textContent = '进入预算管理';
    $('#gate-desc').textContent = '请输入访问密码';
    $('#gate-btn').onclick = () => {
      const v = hashPwd($('#gate-pwd').value);
      if (v === hash) { sessionStorage.setItem(SESSION_KEY, hash); enterApp(); }
      else { $('#gate-err').textContent = '密码不正确'; $('#gate-pwd').value = ''; }
    };
    $('#gate-pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#gate-btn').click(); });
  }
}
function enterApp() {
  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');
  loadAll();
}
function lockApp() {
  sessionStorage.removeItem(SESSION_KEY);
  $('#app').classList.add('hidden');
  $('#gate-pwd').value = '';
  $('#gate-err').textContent = '';
  $('#gate').classList.remove('hidden');
  checkGate();
}

/* ---------- 修改密码 ---------- */
function openModal() {
  $('#modal-old').value = ''; $('#modal-new').value = ''; $('#modal-new2').value = ''; $('#modal-err').textContent = '';
  $('#modal').classList.remove('hidden');
}
$('#modal-cancel').onclick = () => $('#modal').classList.add('hidden');
$('#modal-ok').onclick = async () => {
  const old = $('#modal-old').value, n1 = $('#modal-new').value, n2 = $('#modal-new2').value;
  const cur = await getSetting('accessPwdHash');
  if (hashPwd(old) !== cur) { $('#modal-err').textContent = '原密码不正确'; return; }
  if (n1.length < 4) { $('#modal-err').textContent = '新密码至少 4 位'; return; }
  if (n1 !== n2) { $('#modal-err').textContent = '两次输入不一致'; return; }
  try {
    await setSetting('accessPwdHash', hashPwd(n1));
    sessionStorage.setItem(SESSION_KEY, hashPwd(n1));
    await addLog('安全', '修改访问密码');
    $('#modal').classList.add('hidden');
    toast('密码已修改');
  } catch (e) { $('#modal-err').textContent = '保存失败：' + e.message; }
};

/* ---------- 数据加载 ---------- */
const monthEndStr = (mm) => mm + '-' + pad2(daysInMonth(mm));
const monthRange = (mm) => ({ date: cmd.gte(mm + '-01').and(cmd.lte(monthEndStr(mm))) });

async function loadAll() {
  try {
    const [p, d, m] = await Promise.all([
      getAll(C.plans, {}),
      getAll(C.days, monthRange(month)),
      getAll(C.months, { month })
    ]);
    plans = p;
    /* 排序字段回填：历史计划未设 order 时按当前返回顺序赋值，保留"原有排序"；随后按 order 升序稳定排序 */
    let needOrderPersist = false;
    plans.forEach((pl, i) => { if (pl.order == null || pl.order === '') { pl.order = i; needOrderPersist = true; } });
    plans.sort((a, b) => (Number(a.order) - Number(b.order)) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (needOrderPersist) {
      try {
        await Promise.all(plans.map(pl => db.collection(C.plans).doc(pl._id).update({ order: pl.order })));
        await addLog('计划', '初始化计划排序字段（order）');
      } catch (e) { console.warn('order 回填失败', e); }
    }
    monthRecords = m[0] || null;
    cacheMonthDays(d);
    /* 加载实际账户余额（跨月延续，存 settings） */
    const accRaw = await getSetting('accountBalance');
    accountBalance = accRaw != null ? Number(accRaw) : null;
    const accTs = await getSetting('accountBalanceUpdatedAt');
    accountUpdatedAt = accTs || null;
    $('#today-line').textContent = '今天 ' + todayStr() + ' · ' + new Date().toLocaleDateString('zh-CN', { weekday: 'long' });
    renderAll();
  } catch (e) {
    showAlert('ov-alert', '数据加载失败：' + e.message + '（若首次部署，权限规则可能仍在生效中，请稍后刷新重试）', 'err');
  }
}

/* 月度日历数据：以 date->{planId: doc} 缓存 */
const dayCache = {};
function cacheMonthDays(list) {
  Object.keys(dayCache).forEach(k => delete dayCache[k]);
  list.forEach(d => {
    if (!dayCache[d.date]) dayCache[d.date] = {};
    dayCache[d.date][d.planId] = d;
  });
}
function dayDoc(date, planId) {
  return dayCache[date] && dayCache[date][planId];
}
/* 该日是否被手动锁定（任一计划记录带 manual 标记）：重排不改写锁定日预算 */
function isManualDay(ds) {
  const m = dayCache[ds];
  return !!m && Object.values(m).some(d => d && d.manual);
}

/* ---------- 渲染入口 ---------- */
function renderAll() {
  renderMonthSel();
  renderOverview();
  renderMonth();
  renderPlans();
  renderLogs();
  renderPlanOrder();
}

/* ================================================================
 * 总览
 * ================================================================ */
function renderMonthSel() {
  const sel = $('#ov-month-sel');
  const cur = new Date();
  const list = [];
  for (let i = -3; i <= 2; i++) {
    const d = new Date(cur.getFullYear(), cur.getMonth() + i, 1);
    list.push(fmtMonth(d));
  }
  sel.innerHTML = list.map(mm => `<option value="${mm}" ${mm === monthStr() ? 'selected' : ''}>${monthLabel(mm)}</option>`).join('');
}
function renderOverview() {
  const mm = monthStr();
  const total = monthRecords ? monthRecords.totalBudget || 0 : 0;
  const days = Object.keys(dayCache).filter(d => d.startsWith(mm)).map(k => dayCache[k]);
  let spent = 0, gmv = 0, impr = 0;
  days.forEach(m => Object.values(m).forEach(d => {
    spent += d.actual || 0;
    gmv += d.gmv || 0;
    impr += d.impressions || 0;
  }));
  const left = total - spent;
  const today = todayStr();
  const lastDay = mm + '-' + pad2(daysInMonth(mm));
  let remainDays = 0;
  if (lastDay >= today) {
    const t = parseDate(today), l = parseDate(lastDay);
    remainDays = Math.floor((l - t) / 86400000) + 1;
  }
  const daily = remainDays > 0 ? Math.floor(left / remainDays) : left;

  $('#ov-month').textContent = monthLabel(mm);
  $('#ov-total').textContent = total ? money(total) : '未设置';
  $('#ov-spent').textContent = money(spent);
  $('#ov-left').textContent = money(left);
  $('#ov-left').className = 'card-value ' + (left < 0 ? 'warn' : left > 0 ? 'good' : '');
  $('#ov-daily').textContent = remainDays + ' 天 / ' + money(daily);
  $('#ov-daily').className = 'card-value ' + (daily < 0 ? 'warn' : '');
  $('#ov-roi').textContent = fmtRoi(gmv, spent);
  $('#ov-roi').className = 'card-value';
  $('#ov-impr').textContent = fmtNum(impr);
  $('#ov-impr').className = 'card-value';

  /* 待填报提醒 */
  const unfilled = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i);
    if (!d.startsWith(mm)) continue;
    const m = dayCache[d] || {};
    const has = Object.values(m).some(x => (x.budget || 0) > 0 && (x.actual || 0) > 0);
    if (!has && Object.values(m).some(x => (x.budget || 0) > 0)) unfilled.push(d.slice(5));
  }
  const alertEl = $('#ov-alert');
  if (unfilled.length) {
    showAlert('ov-alert', '⚠️ 以下日期尚未填报实际消耗：' + unfilled.join('、') + '，请到「月度排布」点击日历中对应日期补充。', 'warn');
  } else if (!total) {
    showAlert('ov-alert', '本月尚未设置总预算，请到「月度排布」设置，并使用「一键重排」快速分配每日预算。', 'info');
  } else {
    hideAlert('ov-alert');
  }

  /* 近14天图表 */
  const chartData = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const m = dayCache[d] || {};
    let b = 0, a = 0;
    Object.values(m).forEach(x => { b += x.budget || 0; a += x.actual || 0; });
    chartData.push({ label: d.slice(5), budget: b, actual: a });
  }
  renderChart('#ov-chart', chartData);

  /* 本月计划明细（含 GMV / ROI / 曝光量） */
  const planSum = {};
  Object.keys(dayCache).forEach(k => {
    if (!k.startsWith(mm)) return;
    Object.values(dayCache[k]).forEach(d => {
      if (!planSum[d.planId]) planSum[d.planId] = { budget: 0, actual: 0, gmv: 0, impressions: 0 };
      planSum[d.planId].budget += d.budget || 0;
      planSum[d.planId].actual += d.actual || 0;
      planSum[d.planId].gmv += d.gmv || 0;
      planSum[d.planId].impressions += d.impressions || 0;
    });
  });
  const tbody = $('#ov-plan-table tbody');
  if (!Object.keys(planSum).length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#6b7686">本月暂无排布/填报数据</td></tr>';
  } else {
    tbody.innerHTML = plans.map(p => {
      const s = planSum[p._id];
      if (!s) return '';
      const rate = s.budget > 0 ? (s.actual / s.budget * 100).toFixed(1) + '%' : '—';
      const cls = s.actual > s.budget ? 'over' : '';
      return `<tr>
        <td>${esc(p.name)}${p.active === false ? ' <span class="badge badge-off">停用</span>' : ''}</td>
        <td>${catBadge(p.category)}</td>
        <td class="num">${money(s.budget)}</td>
        <td class="num ${cls}">${money(s.actual)}</td>
        <td class="num ${cls}">${rate}</td>
        <td class="num">${money(s.gmv)}</td>
        <td class="num roi">${fmtRoi(s.gmv, s.actual)}</td>
        <td class="num">${fmtNum(s.impressions)}</td>
        <td class="num ${cls}">${money(s.budget - s.actual)}</td>
      </tr>`;
    }).join('');
  }
}

/* ---------- 通用柱状图（CSS） ---------- */
function renderChart(sel, data) {
  const el = $(sel);
  const max = Math.max(1, ...data.map(d => Math.max(d.budget, d.actual)));
  const today = todayStr();
  if (!data.some(d => d.budget > 0 || d.actual > 0)) {
    el.innerHTML = '<div class="chart-empty">该时间段暂无数据</div>';
    return;
  }
  el.innerHTML = data.map(d => {
    const bh = Math.round(d.budget / max * 100);
    const ah = Math.round(d.actual / max * 100);
    const isToday = today.endsWith(d.label);
    return `<div class="chart-col" title="${d.label}：预算${d.budget} 实际${d.actual}">
      <div class="chart-bars">
        <div class="chart-bar budget" style="height:${Math.max(bh, 1)}%"></div>
        <div class="chart-bar actual" style="height:${Math.max(ah, 1)}%"></div>
      </div>
      <div class="chart-label" style="${isToday ? 'color:#1677ff;font-weight:600' : ''}">${d.label}</div>
    </div>`;
  }).join('');
}

/* ---------- 实际账户余额（跨月延续） ---------- */
function renderAccount() {
  $('#m-account').value = accountBalance != null ? accountBalance : '';

  /* 本月总预算 */
  const total = monthRecords ? monthRecords.totalBudget || 0 : 0;
  /* 本月已消耗（实际） */
  let spent = 0;
  Object.keys(dayCache).forEach(k => {
    if (!k.startsWith(month)) return;
    Object.values(dayCache[k]).forEach(d => { spent += d.actual || 0; });
  });

  $('#acc-monthly').textContent = total ? money(total) : '未设置';
  $('#acc-spent').textContent = money(spent);

  /* 预估月末余额 = 账户余额 - 剩余待花预算（本月总预算 - 本月已消耗）。
     账户余额为当前实时余额（已含历史扣减），只扣剩余未花的预算，避免重复扣已消耗部分。 */
  if (accountBalance != null) {
    const remaining = Math.max(0, total - spent);
    const forecast = accountBalance - remaining;
    const el = $('#acc-forecast');
    el.textContent = money(forecast);
    el.title = `账户余额 ${money(accountBalance)} − 剩余待花预算 ${money(remaining)}（总预算 ${money(total)} − 已消耗 ${money(spent)}）`;
    el.className = forecast < 0 ? 'warn' : forecast > 0 ? 'good' : '';
  } else {
    $('#acc-forecast').textContent = '未设置';
  }

  /* 上次更新时间 */
  if (accountUpdatedAt) {
    const t = new Date(accountUpdatedAt);
    $('#acc-updated').textContent = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
  } else {
    $('#acc-updated').textContent = '—';
  }
}

/* 保存账户余额 */
$('#m-save-account').onclick = async () => {
  const v = parseFloat($('#m-account').value);
  if (isNaN(v) || v < 0) { toast('请输入有效的账户余额', 'err'); return; }
  const oldVal = accountBalance;
  try {
    const now = new Date().toISOString();
    await setSetting('accountBalance', v);
    await setSetting('accountBalanceUpdatedAt', now);
    const diff = oldVal != null ? v - oldVal : 0;
    const diffStr = oldVal != null ? `（${diff >= 0 ? '+' : ''}${money(diff)}）` : '';
    await addLog('账户余额', `更新实际账户余额为 ${money(v)}${diffStr}`);
    accountBalance = v;
    accountUpdatedAt = now;
    renderAccount();
    toast('账户余额已保存');
  } catch (e) { toast('保存失败：' + e.message, 'err'); }
};

/* 同步本月消耗：从账户余额中扣减本月实际已花费金额 */
$('#m-sync-account').onclick = async () => {
  if (accountBalance == null) { toast('请先设置账户余额', 'err'); return; }
  /* 计算本月实际消耗 */
  const mm = month;
  let spent = 0;
  Object.keys(dayCache).forEach(k => {
    if (!k.startsWith(mm)) return;
    Object.values(dayCache[k]).forEach(d => { spent += d.actual || 0; });
  });
  if (spent <= 0) { toast(`${monthLabel(mm)}暂无实际消耗，无需同步`, 'err'); return; }
  if (!confirm(`将从账户余额中扣减 ${monthLabel(mm)} 实际消耗 ${money(spent)}\n当前余额 ${money(accountBalance)} → ${money(accountBalance - spent)}\n确定执行？`)) return;
  try {
    const newVal = accountBalance - spent;
    const now = new Date().toISOString();
    await setSetting('accountBalance', newVal);
    await setSetting('accountBalanceUpdatedAt', now);
    await addLog('账户余额', `同步 ${monthLabel(mm)} 消耗：${money(accountBalance)} − ${money(spent)} = ${money(newVal)}`);
    accountBalance = newVal;
    accountUpdatedAt = now;
    renderAccount();
    toast('已同步本月消耗');
  } catch (e) { toast('同步失败：' + e.message, 'err'); }
};

/* ================================================================
 * 月度排布
 * ================================================================ */
function renderMonth() {
  $('#m-label').textContent = monthLabel(month);
  $('#m-total').value = monthRecords ? monthRecords.totalBudget || '' : '';
  $('#m-note').value = monthRecords ? monthRecords.note || '' : '';

  /* 余额自动带出：当月总预算 - 当月已消耗 - 未发生的手动锁定日预算（口径与一键重排一致） */
  const total = monthRecords ? monthRecords.totalBudget || 0 : 0;
  let spent = 0;
  Object.keys(dayCache).forEach(k => {
    if (!k.startsWith(month)) return;
    Object.values(dayCache[k]).forEach(d => { spent += d.actual || 0; });
  });
  const today = todayStr();
  let lockedBudget = 0;
  Object.keys(dayCache).forEach(k => {
    if (!k.startsWith(month) || k < today) return;
    const docs = Object.values(dayCache[k]);
    if (!docs.some(d => d && d.manual)) return;                              // 非锁定日
    if (docs.some(d => (d.actual || 0) > 0 || (d.gmv || 0) > 0 || (d.impressions || 0) > 0)) return; // 已发生日按实际计
    docs.forEach(d => { lockedBudget += d.budget || 0; });
  });
  const left = total - spent - lockedBudget;
  $('#m-balance').value = Math.max(0, Math.floor(left));

  renderAccount();
  renderCalendar();
}

function renderCalendar() {
  const el = $('#m-calendar');
  const y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7));
  const dim = daysInMonth(month);
  const firstDow = new Date(y, mo - 1, 1).getDay(); // 0=周日
  const today = todayStr();
  const heads = ['日', '一', '二', '三', '四', '五', '六'];
  let html = heads.map(h => `<div class="cal-head">${h}</div>`).join('');
  for (let i = 0; i < firstDow; i++) html += '<div></div>';
  for (let d = 1; d <= dim; d++) {
    const ds = `${month}-${pad2(d)}`;
    const m = dayCache[ds] || {};
    let b = 0, a = 0, g = 0, filled = false, hasBudget = false, hasRemark = false;
    Object.values(m).forEach(x => {
      b += x.budget || 0; a += x.actual || 0; g += x.gmv || 0;
      if ((x.budget || 0) > 0) hasBudget = true;
      if ((x.actual || 0) > 0) filled = true;
      if (x.remark) hasRemark = true;
    });
    const isPast = ds < today;
    const isToday = ds === today;
    const isLocked = Object.values(m).some(x => x && x.manual);
    const dow = new Date(y, mo - 1, d).getDay();
    const cls = [
      'cal-day',
      isToday ? 'today' : '',
      isPast ? 'past' : '',
      (dow === 0 || dow === 6) ? 'weekend' : ''
    ].join(' ');
    html += `<div class="${cls}" data-date="${ds}" ${isLocked ? 'title="该日预算已手动锁定，一键重排不会覆盖"' : ''}>
      <div class="d">${d}${isLocked ? ' 🔒' : ''}<small>${isToday ? '今天' : ''}</small></div>
      ${hasBudget ? `<div class="amt b">预 ${money(b)}</div>` : ''}
      ${filled ? `<div class="amt a">实 ${money(a)}</div>` : ''}
      ${filled && g > 0 ? `<div class="amt r">ROI ${fmtRoi(g, a)}</div>` : ''}
      ${hasBudget && !isPast ? (filled ? '<div class="dot filled"></div>' : '<div class="dot unfilled"></div>') : ''}
      ${hasRemark ? '<div class="remark-flag">📝</div>' : ''}
    </div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('.cal-day').forEach(cell => {
    cell.onclick = () => openDayEdit(cell.dataset.date);
  });
}

/* 点击某天 → 编辑该日各计划预算/实际/GMV/曝光量（只显示当天执行的计划，可手动添加） */
let editingDate = null;
function openDayEdit(ds) {
  editingDate = ds;
  const m = dayCache[ds] || {};
  const activePlans = plans.filter(p => p.active !== false);
  const canFill = ds < todayStr() || ds === todayStr();
  const hasData = (p) => {
    const doc = m[p._id];
    return !!doc && ((doc.budget || 0) > 0 || (doc.actual || 0) > 0 || (doc.gmv || 0) > 0 || (doc.impressions || 0) > 0);
  };
  const shown = plans.filter(hasData);                         // 当天执行的计划（含停用但有数据的）
  const hiddenPool = activePlans.filter(p => !hasData(p));      // 启用且当天未执行的计划（可手动添加）

  function rowHtml(p) {
    const doc = m[p._id];
    return `<div class="row" data-plan="${p._id}">
      <span class="pname">${esc(p.name)}${p.active === false ? ' <span class="badge badge-off">停用</span>' : ''}</span>
      <input type="number" class="input e-budget" min="0" step="100" value="${doc && doc.budget != null ? doc.budget : ''}" placeholder="预算" title="上下调控键每次 ±100">
      <input type="number" class="input no-spin e-actual" min="0" value="${doc && doc.actual != null ? doc.actual : ''}" placeholder="实际" ${canFill ? '' : 'disabled'}>
      <input type="number" class="input no-spin e-gmv" min="0" value="${doc && doc.gmv != null ? doc.gmv : ''}" placeholder="GMV" ${canFill ? '' : 'disabled'}>
      <input type="number" class="input no-spin e-impr" min="0" value="${doc && doc.impressions != null ? doc.impressions : ''}" placeholder="曝光量" ${canFill ? '' : 'disabled'}>
      <input type="text" class="input e-remark" value="${doc && doc.remark ? esc(doc.remark) : ''}" placeholder="备注（异常说明等）">
    </div>`;
  }
  function refreshRows() {
    const wrap = panel.querySelector('#de-rows');
    wrap.innerHTML = shown.map(rowHtml).join('') || '<p class="hint">该日暂无执行计划，可从下方添加</p>';
    const sel = panel.querySelector('#de-add-plan');
    const rest = hiddenPool.filter(p => !shown.includes(p));
    sel.innerHTML = '<option value="">＋ 添加计划…</option>' + rest.map(p => `<option value="${p._id}">${esc(p.name)}</option>`).join('');
    sel.disabled = !rest.length;
  }

  const past = ds < todayStr();
  const lockedDay = isManualDay(ds);
  const savedBudgetTotal = Object.values(m).reduce((s, d) => s + ((d && d.budget) || 0), 0);
  const headHtml = () => `📅 ${ds} 计划明细（仅显示当天执行的计划）${isManualDay(ds) ? ' 🔒 已锁定（重排不覆盖）' : ''} ${past ? '<span class="sub">过去日期可改全部数据</span>' : '<span class="sub">今天可改实际/GMV/曝光；未来仅预算</span>'}`;
  const panel = document.createElement('div');
  panel.className = 'day-edit';
  panel.id = 'day-edit-panel';
  panel.innerHTML = `
    <h4>${headHtml()}</h4>
    <div class="de-grid">
      <div class="de-grid-head"><span>计划</span><span>预算(元)</span><span>实际(元)</span><span>GMV(元)</span><span>曝光量</span><span>备注</span></div>
      <div id="de-rows"></div>
    </div>
    <div class="de-sum">日预算合计 <b id="de-sum-budget">¥0</b>（原 ${money(savedBudgetTotal)}，调整 <span id="de-sum-diff">¥0</span>）<span class="sub">｜实际合计 <span id="de-sum-actual">¥0</span></span></div>
    <div class="de-add-row">
      <select id="de-add-plan" class="input"></select>
      <button class="btn btn-ghost btn-sm" id="de-add-btn">添加</button>
    </div>
    <div class="actions">
      <button class="btn btn-ghost btn-sm" id="de-lock"${lockedDay ? ' title="解除后该日预算可被「一键重排」重新分配"' : ' title="锁定后「一键重排」不会改动该日预算（手动修改预算保存后也会自动锁定）"'}>${lockedDay ? '🔓 解除锁定' : '🔒 锁定此日'}</button>
      <button class="btn btn-ghost btn-sm" id="de-close">关闭</button>
      <button class="btn btn-primary btn-sm" id="de-save">保存该日数据</button>
    </div>`;
  const old = $('#day-edit-panel');
  if (old) old.remove();
  const anchor = $('#m-calendar').closest('.panel');
  anchor.insertAdjacentElement('afterend', panel);
  refreshRows();

  /* 日预算合计实时更新（含未保存的改动），方便对照日预算 */
  function updateDeSum() {
    let b = 0, a = 0;
    panel.querySelectorAll('#de-rows .row').forEach(r => {
      b += parseFloat(r.querySelector('.e-budget').value) || 0;
      a += parseFloat(r.querySelector('.e-actual').value) || 0;
    });
    panel.querySelector('#de-sum-budget').textContent = money(b);
    const diff = b - savedBudgetTotal;
    const de = panel.querySelector('#de-sum-diff');
    de.textContent = (diff > 0 ? '+' : '') + money(diff);
    de.className = diff > 0 ? 'over' : '';
    panel.querySelector('#de-sum-actual').textContent = money(a);
  }
  panel.addEventListener('input', updateDeSum);
  updateDeSum();

  $('#de-close').onclick = () => panel.remove();
  /* 锁定 / 解除锁定：锁定日的预算不会被「一键重排」改写 */
  $('#de-lock').onclick = async () => {
    const docs = Object.values(m).filter(d => d && ((d.budget || 0) > 0 || (d.actual || 0) > 0 || (d.gmv || 0) > 0 || (d.impressions || 0) > 0));
    if (!docs.length) { toast('该日暂无预算数据，请先保存数据后再锁定', 'err'); return; }
    const locking = !isManualDay(ds);
    if (locking && !confirm(`锁定 ${ds}？「一键重排」将不再改动该日预算。`)) return;
    try {
      const now = new Date().toISOString();
      for (const d of docs) {
        const id = d._id || dayId(ds, d.planId);
        await db.collection(C.days).doc(id).update({ manual: locking, updatedAt: now });
        d.manual = locking;
      }
      await addLog('锁定调整', `${ds} ${locking ? '锁定：重排不覆盖该日预算' : '解除锁定：该日预算可被重排'}`);
      panel.querySelector('h4').innerHTML = headHtml();
      const lkBtn = panel.querySelector('#de-lock');
      lkBtn.textContent = locking ? '🔓 解除锁定' : '🔒 锁定此日';
      renderMonth();
      toast(locking ? `已锁定 ${ds}，重排不会覆盖` : `已解除 ${ds} 的锁定`);
    } catch (e) { toast('操作失败：' + e.message, 'err'); }
  };
  $('#de-add-btn').onclick = () => {
    const sel = panel.querySelector('#de-add-plan');
    const pid = sel.value;
    if (!pid) return;
    const p = hiddenPool.find(x => x._id === pid);
    if (p && !shown.includes(p)) shown.push(p);
    refreshRows();
  };
  $('#de-save').onclick = async () => {
    const updates = [];
    panel.querySelectorAll('#de-rows .row').forEach(r => {
      const planId = r.dataset.plan;
      const b = parseFloat(r.querySelector('.e-budget').value);
      const a = parseFloat(r.querySelector('.e-actual').value);
      const g = parseFloat(r.querySelector('.e-gmv').value);
      const im = parseFloat(r.querySelector('.e-impr').value);
      const rem = r.querySelector('.e-remark').value.trim();
      updates.push({
        planId,
        budget: isNaN(b) ? null : b,
        actual: isNaN(a) ? null : a,
        gmv: isNaN(g) ? null : g,
        impressions: isNaN(im) ? null : im,
        remark: rem
      });
    });
    /* 预算有改动 → 该日自动锁定，重排不覆盖 */
    const budgetChanged = updates.some(u => {
      const o = m[u.planId];
      const nv = u.budget == null ? 0 : u.budget;
      const ov = o && o.budget != null ? o.budget : 0;
      return nv !== ov;
    });
    try {
      for (const u of updates) {
        const patch = {};
        if (u.budget != null) patch.budget = u.budget;
        if (u.actual != null && canFill) patch.actual = u.actual;
        if (u.gmv != null && canFill) patch.gmv = u.gmv;
        if (u.impressions != null && canFill) patch.impressions = u.impressions;
        const oldDoc = m[u.planId];
        const oldRem = (oldDoc && oldDoc.remark) || '';
        if (u.remark !== oldRem) patch.remark = u.remark;
        if (budgetChanged && Object.keys(patch).length) patch.manual = true;
        if (!Object.keys(patch).length) continue;
        await upsertDay(ds, u.planId, patch);
      }
      const remCount = updates.filter(u => u.remark).length;
      await addLog('排布调整', `${ds} 逐计划数据调整（预算/实际/GMV/曝光量${remCount ? `/备注${remCount}条` : ''}）${budgetChanged ? '；预算有手动调整，该日已锁定（重排不覆盖）' : ''}`);
      panel.remove();
      await refreshMonth();
      toast('已保存');
    } catch (e) { toast('保存失败：' + e.message, 'err'); }
  };
}

async function refreshMonth() {
  const list = await getAll(C.days, monthRange(month));
  cacheMonthDays(list);
  renderMonth();
}

$('#m-save-total').onclick = async () => {
  const total = parseFloat($('#m-total').value);
  const note = $('#m-note').value.trim();
  if (isNaN(total) || total < 0) { toast('请输入有效的总预算', 'err'); return; }
  try {
    await upsertMonth(month, total, note);
    await addLog('月度预算', `设置 ${monthLabel(month)} 总预算 ${money(total)}${note ? '（备注：' + note + '）' : ''}`);
    monthRecords = (await getAll(C.months, { month }))[0] || null;
    renderMonth();
    toast('月度预算已保存');
  } catch (e) { toast('保存失败：' + e.message, 'err'); }
};

/* ---------- 一键重排（核心） ---------- */
$('#m-rebalance').onclick = async () => {
  /* 剩余可排预算 = 当月总预算 − 实际已发生（全月），与"账户实际余额"概念分离，不回写总预算 */
  const total = Number(monthRecords ? monthRecords.totalBudget || 0 : 0);
  if (!total) { toast('请先在「月度排布」设置当月总预算', 'err'); return; }
  let actualTotal = 0;
  Object.keys(dayCache).forEach(k => {
    if (!k.startsWith(month)) return;
    Object.values(dayCache[k]).forEach(d => { actualTotal += d.actual || 0; });
  });

  const includeToday = $('#m-include-today').checked;
  const pushOn = $('#m-weekday').checked;
  const today = todayStr();
  const lastDay = month + '-' + pad2(daysInMonth(month));
  let start = today > month + '-01' ? today : month + '-01';
  if (!includeToday) start = addDays(start, 1);
  if (start > lastDay) { toast('本月已无可排布的剩余日期', 'err'); return; }
  const activePlans = plans.filter(p => p.active !== false);
  if (!activePlans.length) { toast('请先到「投流计划」新增并启用计划', 'err'); return; }

  /* 计算剩余天数 —— 排除"实际已发生"的日期：
     含实际/GMV/曝光任一有值的日期即视为已发生，其预算保持原样、不被重排改写；当日若已填实际同样跳过 */
  const occurred = new Set();
  Object.keys(dayCache).forEach(k => {
    if (!k.startsWith(month)) return;
    Object.values(dayCache[k]).forEach(d => {
      if ((d.actual || 0) > 0 || (d.gmv || 0) > 0 || (d.impressions || 0) > 0) occurred.add(k);
    });
  });
  /* 手动锁定日：用户手动调整过预算（保存时自动标记）或明确点「锁定此日」的日期，重排一律不改写 */
  const manualSet = new Set();
  Object.keys(dayCache).forEach(k => {
    if (!k.startsWith(month)) return;
    if (Object.values(dayCache[k]).some(d => d && d.manual)) manualSet.add(k);
  });
  const days = [];
  for (let d = start; d <= lastDay; d = addDays(d, 1)) days.push(d);
  const openDays = days.filter(d => !occurred.has(d) && !manualSet.has(d));
  const N = openDays.length;
  if (!N) { toast('剩余可排布日期均已锁定（已填实际数据或手动调整过预算），无需重排', 'err'); return; }

  /* 锁定日的预算已 earmark（保留不动），从可排余额中扣除，避免重排总额超支 */
  let lockedBudget = 0, lockedCount = 0;
  days.forEach(ds => {
    if (!manualSet.has(ds) || occurred.has(ds)) return;
    lockedCount++;
    Object.values(dayCache[ds]).forEach(d => { lockedBudget += d.budget || 0; });
  });
  const balance = Math.max(0, total - actualTotal - lockedBudget);
  if (balance <= 0) { toast(`剩余可排预算 ≤ 0（总预算已被实际消耗${lockedCount ? '或锁定预算' : ''}占满），无需重排`, 'err'); return; }

  /* 计划明细比例：取 start 之前最近一天的数据（跨月也可查）——
     优先按「实际消耗」比例，其次按「预算」比例，均无数据则平均分配 */
  let ratios = null, refDate = '', refBasis = '平均';
  try {
    const prevRes = await db.collection(C.days).where({ date: cmd.lt(start) }).orderBy('date', 'desc').limit(300).get();
    if (prevRes.data.length) {
      refDate = prevRes.data[0].date;
      const prevDocs = prevRes.data.filter(d => d.date === refDate);
      const byPlan = {};
      prevDocs.forEach(d => { byPlan[d.planId] = d; });
      let sumA = 0, sumB = 0;
      activePlans.forEach(p => {
        const d = byPlan[p._id];
        if (d) { sumA += d.actual || 0; sumB += d.budget || 0; }
      });
      if (sumA > 0) {
        ratios = activePlans.map(p => { const d = byPlan[p._id]; return d ? (d.actual || 0) : 0; });
        refBasis = '实际消耗';
      } else if (sumB > 0) {
        ratios = activePlans.map(p => { const d = byPlan[p._id]; return d ? (d.budget || 0) : 0; });
        refBasis = '预算';
      }
    }
  } catch (e) { ratios = null; }

  /* 按比例把日预算分到各计划，每个计划凑整至 100 元（最少 100 元保底）；
     最大余数法分配，保证各计划合计精确等于当日预算 */
  const allocDay = (dayBudget) => {
    const units = Math.round(dayBudget / 100);   // 当日预算折成 100 元单位数
    const n = activePlans.length;
    const out = new Array(n).fill(0);
    if (units <= 0 || n === 0) return out;
    const r = ratios || activePlans.map(() => 1);
    const rSum = r.reduce((a, b) => a + b, 0) || 1;
    if (units < n) {
      /* 预算太少不够每计划 100 元：只给比例最高的前 units 个计划各 100 元 */
      const order = r.map((v, i) => i).sort((a, b) => r[b] - r[a]);
      for (let i = 0; i < units; i++) out[order[i]] = 1;
      return out;
    }
    const raw = r.map(v => units * v / rSum);
    const floors = raw.map(v => Math.max(1, Math.floor(v)));
    let rem = units - floors.reduce((a, b) => a + b, 0);
    if (rem > 0) {
      const byFrac = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f);
      let j = 0;
      while (rem > 0) { floors[byFrac[j % n].i] += 1; rem--; j++; }
    }
    while (rem < 0) {
      let mi = -1;
      for (let i = 0; i < n; i++) if (floors[i] > 1 && (mi < 0 || floors[i] > floors[mi])) mi = i;
      if (mi < 0) break;
      floors[mi] -= 1; rem += 1;
    }
    return floors;   // 单位：100 元
  };

  /* 周策略权重：冲锋日（周五=5 / 周六=6 / 周日=0）上浮，周一至周四略低；未启用则平均 */
  const PUSH = { 0: true, 5: true, 6: true };
  const W_PUSH = 1.2, W_NORMAL = 0.9;
  const dowOf = (ds) => { const p = ds.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getDay(); };
  const weightOf = (ds) => { const dow = dowOf(ds); return pushOn ? (PUSH[dow] ? W_PUSH : W_NORMAL) : 1; };
  const weights = openDays.map(weightOf);
  const wSum = weights.reduce((a, b) => a + b, 0);
  /* 加权日预算 → 凑整至 100 元 */
  const rawDay = openDays.map((ds, i) => balance * weights[i] / wSum);
  const dayBudgets = rawDay.map(v => Math.round(v / 100) * 100);
  /* 残差回补到某个冲锋日（保证总额≈剩余可排预算，不丢不留） */
  let resid = Math.round(balance - dayBudgets.reduce((a, b) => a + b, 0));
  if (resid !== 0) {
    let idx = pushOn ? openDays.findIndex(ds => PUSH[dowOf(ds)]) : 0;
    if (idx < 0) idx = 0;
    dayBudgets[idx] = Math.max(0, dayBudgets[idx] + resid);
  }

  /* 确认弹层 */
  const pushDays = openDays.filter(ds => PUSH[dowOf(ds)]).length;
  const skipInfo = (occurred.size || lockedCount)
    ? `\n已自动跳过 ${occurred.size} 个「实际已发生」日期和 ${lockedCount} 个「手动锁定」日期（预算合计 ${money(lockedBudget)}），其预算保持原样。`
    : '';
  const strat = pushOn
    ? `\n采用周策略：周五/周六/周日（共 ${pushDays} 天）预算上浮约 20%、周一至周四略低，每日凑整至 100 元。`
    : `\n采用平均分配（未启用周策略）。`;
  const refInfo = ratios
    ? `\n计划明细按前一日（${refDate}）的「${refBasis}」比例预设，每个计划凑整至 100 元，可随后在日历中逐日微调。`
    : `\n未找到前一日计划数据，计划明细按平均分配，可随后在日历中逐日微调。`;
  const approx = money(Math.round(balance / N / 100) * 100);
  if (!confirm(`剩余可排预算 ${money(balance)}（当月总预算 ${money(total)} − 实际已发生 ${money(actualTotal)}${lockedCount ? ` − 已锁定预算 ${money(lockedBudget)}` : ''}）\n分到 ${N} 天，每日约 ${approx}，再按比例分到 ${activePlans.length} 个计划。\n${start} 之前的日期预算与实际数据均保持不变。${skipInfo}${strat}${refInfo}\n确定执行？`)) return;

  try {
    /* 重排只改写 ${start} 及之后、且"实际未发生"的日期；已发生日期（含当日若有实际/GMV/曝光）一律保持不动，避免误改历史预算 */

    const log = [];
    openDays.forEach((ds, i) => {
      allocDay(dayBudgets[i]).forEach((u, pi) => {
        const b = u * 100;                     /* 每个计划按 100 元整数预设 */
        if (b > 0) log.push({ ds, planId: activePlans[pi]._id, budget: b });
      });
    });
    /* 批量写：复合 _id 直接 doc().set（覆盖式，简单可靠）—— 写完整对象，保留旧的 actual/GMV/曝光量 */
    for (const item of log) {
      const id = dayId(item.ds, item.planId);
      const old = dayDoc(item.ds, item.planId);
      const data = {
        date: item.ds, planId: item.planId, budget: item.budget,
        actual: old ? (old.actual || 0) : 0,
        gmv: old ? (old.gmv || 0) : 0,
        impressions: old ? (old.impressions || 0) : 0,
        updatedAt: new Date().toISOString()
      };
      await db.collection(C.days).doc(id).set(data);
      if (!dayCache[item.ds]) dayCache[item.ds] = {};
      dayCache[item.ds][item.planId] = { _id: id, ...data };
    }
    /* 日志明细到计划：各天预算因周策略/比例略有差异，展示区间 */
    const planDetail = activePlans.map(p => {
      const items = log.filter(x => x.planId === p._id);
      if (!items.length) return `${p.name} 0`;
      const bs = items.map(x => x.budget);
      const mn = Math.min(...bs), mx = Math.max(...bs);
      return `${p.name} ${mn === mx ? '¥' + mn + '/天' : '¥' + mn + '~' + mx + '/天'}`;
    }).join('；');
    await addLog('一键重排', `${monthLabel(month)}：按剩余可排预算 ${money(balance)}（总预算 ${money(total)} − 实际 ${money(actualTotal)}${lockedCount ? ` − 锁定 ${money(lockedBudget)}` : ''}）重排 ${N} 天${pushOn ? '，周策略（周五六日上浮）' : ''}，每日凑整至 100 元；跳过 ${occurred.size} 个已发生日 + ${lockedCount} 个手动锁定日；计划明细按前一日${refDate ? '（' + refDate + '）' : ''}「${refBasis}」比例预设、每计划凑整至 100 元。计划明细：${planDetail}`);
    await refreshMonth();
    renderOverview();
    toast('重排完成');
  } catch (e) { toast('重排失败：' + e.message, 'err'); }
};

$('#m-prev').onclick = async () => { month = addDays(month + '-01', -1).slice(0, 7); await switchMonth(); };
$('#m-next').onclick = async () => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) + 1, 1);
  month = fmtMonth(d); await switchMonth();
};
async function switchMonth() {
  try {
    const [m, d] = await Promise.all([
      getAll(C.months, { month }),
      getAll(C.days, monthRange(month))
    ]);
    monthRecords = m[0] || null;
    cacheMonthDays(d);
    renderMonth();
  } catch (e) { toast('切换月份失败：' + e.message, 'err'); }
}

/* ================================================================
 * 投流计划
 * ================================================================ */
function renderPlans() {
  const tbody = $('#p-table tbody');
  if (!plans.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6b7686">暂无计划，请添加</td></tr>';
    return;
  }
  tbody.innerHTML = plans.map(p => `
    <tr data-id="${p._id}">
      <td><input class="input p-name" value="${esc(p.name)}" style="min-width:160px"></td>
      <td><select class="input p-cat">${catOptions(p.category)}</select></td>
      <td><input class="input p-remark" value="${esc(p.remark || '')}" style="min-width:140px"></td>
      <td><span class="badge ${p.active === false ? 'badge-off' : 'badge-on'}">${p.active === false ? '停用' : '启用'}</span></td>
      <td>${p.createdAt ? p.createdAt.slice(0, 10) : '—'}</td>
      <td>
        <button class="op-btn p-save">保存</button>
        <button class="op-btn ${p.active === false ? '' : 'danger'} p-toggle">${p.active === false ? '启用' : '停用'}</button>
        <button class="op-btn danger p-del">删除</button>
      </td>
    </tr>`).join('');
  updatePlanSaveBtn();
}

/* 判断某行输入是否相对已保存数据发生变化 */
function planRowChanged(tr) {
  const id = tr.dataset.id;
  const p = plans.find(x => x._id === id);
  if (!p) return false;
  const name = (tr.querySelector('.p-name').value || '').trim();
  const remark = (tr.querySelector('.p-remark').value || '').trim();
  const category = tr.querySelector('.p-cat').value;
  return name !== p.name || category !== (p.category || '') || remark !== (p.remark || '');
}

/* 刷新「一键保存」按钮：统计有改动的行数并切换可用/禁用 */
function updatePlanSaveBtn() {
  const btn = $('#p-save-all');
  if (!btn) return;
  const rows = [...$('#p-table tbody').querySelectorAll('tr[data-id]')];
  let n = 0;
  rows.forEach(tr => {
    const changed = planRowChanged(tr);
    tr.classList.toggle('dirty', changed);
    if (changed) n++;
  });
  btn.textContent = `一键保存（${n}）`;
  btn.disabled = n === 0;
}
$('#p-add').onclick = async () => {
  const name = $('#p-name').value.trim();
  const remark = $('#p-remark').value.trim();
  const category = $('#p-cat').value;
  if (!name) { toast('请输入计划名称', 'err'); return; }
  try {
    /* 计划 ID 由前端自定义生成，彻底规避 SDK add() 返回 _id 字段不稳定导致 planId=undefined 的问题 */
    const pid = 'plan_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const maxOrder = plans.reduce((m, p) => Math.max(m, Number(p.order) || 0), -1);
    const order = maxOrder + 1;
    await db.collection(C.plans).doc(pid).set({ name, remark, category, active: true, order, createdAt: new Date().toISOString() });
    plans.push({ _id: pid, name, remark, category, active: true, order, createdAt: new Date().toISOString() });
    await addLog('计划', `新增计划「${name}」（${category || '未分类'}）`);
    $('#p-name').value = ''; $('#p-remark').value = ''; $('#p-cat').value = '';
    plans.sort((a, b) => (Number(a.order) - Number(b.order)) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    renderPlans(); renderPlanOrder();
    toast('已新增');
  } catch (e) { toast('新增失败：' + e.message, 'err'); }
};
$('#p-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('.op-btn');
  if (!btn) return;
  const tr = btn.closest('tr');
  const id = tr.dataset.id;
  const p = plans.find(x => x._id === id);
  if (!p) return;
  try {
    if (btn.classList.contains('p-save')) {
      const name = tr.querySelector('.p-name').value.trim();
      const remark = tr.querySelector('.p-remark').value.trim();
      const category = tr.querySelector('.p-cat').value;
      if (!name) { toast('名称不能为空', 'err'); return; }
      await db.collection(C.plans).doc(id).update({ name, remark, category, updatedAt: new Date().toISOString() });
      await addLog('计划', `修改计划「${p.name}」→「${name}」（${category || '未分类'}）`);
      p.name = name; p.remark = remark; p.category = category;
      toast('已保存');
    } else if (btn.classList.contains('p-toggle')) {
      const next = p.active === false ? true : false;
      await db.collection(C.plans).doc(id).update({ active: next, updatedAt: new Date().toISOString() });
      await addLog('计划', `${next ? '启用' : '停用'}计划「${p.name}」`);
      p.active = next;
      toast(next ? '已启用' : '已停用');
    } else if (btn.classList.contains('p-del')) {
      const days = await getAll(C.days, { planId: id }, 1);
      if (days.length) {
        toast('该计划已有排布/填报数据，建议停用而非删除', 'err');
        return;
      }
      if (!confirm(`确定删除计划「${p.name}」？`)) return;
      await db.collection(C.plans).doc(id).remove();
      await addLog('计划', `删除计划「${p.name}」`);
      plans = plans.filter(x => x._id !== id);
      toast('已删除');
    }
    renderPlans(); renderOverview();
  } catch (err) { toast('操作失败：' + err.message, 'err'); }
});

/* 输入时实时标记脏行 + 刷新一键保存按钮 */
$('#p-table').addEventListener('input', (e) => {
  if (!e.target.closest('tr[data-id]')) return;
  updatePlanSaveBtn();
});

/* 一键保存：批量提交所有有改动的计划（名称/分类/备注） */
$('#p-save-all').onclick = async () => {
  const rows = [...$('#p-table tbody').querySelectorAll('tr[data-id]')];
  const changed = [];
  for (const tr of rows) {
    const id = tr.dataset.id;
    const p = plans.find(x => x._id === id);
    if (!p) continue;
    const name = (tr.querySelector('.p-name').value || '').trim();
    const remark = (tr.querySelector('.p-remark').value || '').trim();
    const category = tr.querySelector('.p-cat').value;
    if (!name) { toast('计划名称不能为空，请检查后再保存', 'err'); return; }
    if (name !== p.name || category !== (p.category || '') || remark !== (p.remark || '')) {
      changed.push({ id, p, name, remark, category });
    }
  }
  if (!changed.length) { toast('没有需要保存的改动'); return; }
  if (!confirm(`确认一次性保存 ${changed.length} 个计划的修改？`)) return;
  try {
    await Promise.all(changed.map(c => db.collection(C.plans).doc(c.id).update({
      name: c.name, remark: c.remark, category: c.category, updatedAt: new Date().toISOString()
    })));
    changed.forEach(c => { c.p.name = c.name; c.p.remark = c.remark; c.p.category = c.category; });
    const names = changed.map(c => `「${c.p.name}」→「${c.name}」`).join('；');
    await addLog('计划', `一键保存 ${changed.length} 个计划：${names}`);
    renderPlans(); renderOverview(); renderPlanOrder();
    toast(`已保存 ${changed.length} 个计划`);
  } catch (e) { toast('保存失败：' + e.message, 'err'); }
};

/* ================================================================
 * 报表
 * ================================================================ */
function defaultRange() {
  const t = new Date();
  const from = fmtDate(new Date(t.getFullYear(), t.getMonth(), 1));
  return { from, to: todayStr() };
}
function initReport() {
  const r = defaultRange();
  $('#r-from').value = r.from;
  $('#r-to').value = r.to;
}
$('#r-run').onclick = runReport;
async function runReport() {
  const from = $('#r-from').value, to = $('#r-to').value;
  if (!from || !to || from > to) { toast('请选择有效的日期范围', 'err'); return; }
  try {
    const list = await getAll(C.days, { date: cmd.gte(from).and(cmd.lte(to)) });
    const planName = {};
    const planCat = {};
    const planOrderMap = {};
    plans.forEach(p => { planName[p._id] = p.name; planCat[p._id] = p.category || '未分类'; planOrderMap[p._id] = p.order != null ? Number(p.order) : 1e9; });

    const dayMap = {};   // date -> {budget, actual, gmv, impressions, remarks}
    const planMap = {};  // planId -> {name, budget, actual, gmv, impressions}
    const catMap = {};   // category -> {budget, actual, gmv, impressions}
    const detail = [];   // 明细行
    list.forEach(d => {
      if (!dayMap[d.date]) dayMap[d.date] = { budget: 0, actual: 0, gmv: 0, impressions: 0, remarks: [] };
      dayMap[d.date].budget += d.budget || 0;
      dayMap[d.date].actual += d.actual || 0;
      dayMap[d.date].gmv += d.gmv || 0;
      dayMap[d.date].impressions += d.impressions || 0;
      if (d.remark) dayMap[d.date].remarks.push(`${planName[d.planId] || '未知'}: ${d.remark}`);
      if (!planMap[d.planId]) planMap[d.planId] = { name: planName[d.planId] || '未知计划', budget: 0, actual: 0, gmv: 0, impressions: 0 };
      planMap[d.planId].budget += d.budget || 0;
      planMap[d.planId].actual += d.actual || 0;
      planMap[d.planId].gmv += d.gmv || 0;
      planMap[d.planId].impressions += d.impressions || 0;
      const cat = planCat[d.planId] || '未分类';
      if (!catMap[cat]) catMap[cat] = { budget: 0, actual: 0, gmv: 0, impressions: 0 };
      catMap[cat].budget += d.budget || 0;
      catMap[cat].actual += d.actual || 0;
      catMap[cat].gmv += d.gmv || 0;
      catMap[cat].impressions += d.impressions || 0;
      const r = moneyRaw(d.gmv), act = moneyRaw(d.actual);
      detail.push({
        日期: d.date, 计划: planName[d.planId] || '未知计划',
        预算: moneyRaw(d.budget), 实际: act, GMV: r,
        ROI: act > 0 ? +(r / act).toFixed(2) : '',
        曝光量: d.impressions || 0,
        差额: moneyRaw(act - (d.budget || 0)),
        备注: d.remark || ''
      });
    });

    /* 补齐范围内无数据的日期（预算0实际0） */
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const dayRows = days.map(ds => {
      const x = dayMap[ds] || { budget: 0, actual: 0, gmv: 0, impressions: 0, remarks: [] };
      return {
        日期: ds, 预算: moneyRaw(x.budget), 实际: moneyRaw(x.actual), GMV: moneyRaw(x.gmv),
        ROI: x.actual > 0 ? +(x.gmv / x.actual).toFixed(2) : '',
        曝光量: x.impressions || 0,
        差额: moneyRaw(x.actual - x.budget),
        达成率: x.budget > 0 ? (x.actual / x.budget * 100).toFixed(1) + '%' : '—',
        备注: (x.remarks || []).join('; ')
      };
    });
    const planRows = Object.entries(planMap).map(([pid, s]) => ({
      pid,
      计划: s.name, 分类: planCat[pid] || '未分类', 预算: moneyRaw(s.budget), 实际: moneyRaw(s.actual),
      达成率: s.budget > 0 ? (s.actual / s.budget * 100).toFixed(1) + '%' : '—',
      GMV: moneyRaw(s.gmv),
      ROI: s.actual > 0 ? +(s.gmv / s.actual).toFixed(2) : '',
      曝光量: s.impressions || 0,
      日均消耗: moneyRaw(s.actual / days.length)
    })).sort((a, b) => (catIndex(a['分类']) - catIndex(b['分类'])) || ((planOrderMap[a.pid] ?? 1e9) - (planOrderMap[b.pid] ?? 1e9)));

    /* 按分类汇总（ROI = 成交金额 ÷ 实际消耗） */
    const catRows = Object.entries(catMap).map(([cat, s]) => ({
      分类: cat, 预算: moneyRaw(s.budget), 实际: moneyRaw(s.actual),
      达成率: s.budget > 0 ? (s.actual / s.budget * 100).toFixed(1) + '%' : '—',
      GMV: moneyRaw(s.gmv), ROI: s.actual > 0 ? +(s.gmv / s.actual).toFixed(2) : '', 曝光量: s.impressions || 0
    })).sort((a, b) => catIndex(a['分类']) - catIndex(b['分类']));

    report = { from, to, days, dayMap, planMap, dayRows, planRows, catRows, detail };
    renderReport();
  } catch (e) { showAlert('r-alert', '报表生成失败：' + e.message, 'err'); }
}
function renderReport() {
  if (!report) return;
  hideAlert('r-alert');
  const { from, to, dayMap, planMap, dayRows, planRows, days } = report;
  let b = 0, a = 0, g = 0, im = 0;
  Object.values(dayMap).forEach(x => { b += x.budget; a += x.actual; g += x.gmv; im += x.impressions; });
  const daysN = Math.max(1, days.length);
  $('#r-budget').textContent = money(b);
  $('#r-actual').textContent = money(a);
  $('#r-gmv').textContent = money(g);
  $('#r-roi').textContent = fmtRoi(g, a);
  $('#r-impr').textContent = fmtNum(im);
  $('#r-rate').textContent = (b > 0 ? (a / b * 100).toFixed(1) + '%' : '—') + ' / ' + money(a / daysN);

  const chartData = dayRows.map(r => ({ label: r['日期'].slice(5), budget: r['预算'], actual: r['实际'] }));
  renderChart('#r-chart', chartData);

  $('#r-day-table tbody').innerHTML = dayRows.map(r => {
    const cls = r['差额'] > 0 ? 'over' : '';
    const rem = r['备注'] || '';
    return `<tr>
      <td>${r['日期']}</td>
      <td class="num">${money(r['预算'])}</td>
      <td class="num ${cls}">${money(r['实际'])}</td>
      <td class="num">${money(r['GMV'])}</td>
      <td class="num roi">${fmtRoi(r['GMV'], r['实际'])}</td>
      <td class="num">${fmtNum(r['曝光量'])}</td>
      <td class="num ${cls}">${r['差额'] > 0 ? '+' + money(r['差额']) : money(r['差额'])}</td>
      <td class="num">${r['达成率']}</td>
      <td class="remark-cell" title="${esc(rem)}">${esc(rem)}</td>
    </tr>`;
  }).join('');

  /* 按分类汇总 */
  const catRows = report.catRows || [];
  $('#r-cat-table tbody').innerHTML = catRows.length
    ? catRows.map(r => {
        const cls = (r['达成率'] !== '—' && moneyRaw(r['实际']) > moneyRaw(r['预算'])) ? 'over' : '';
        return `<tr>
          <td>${catBadge(r['分类'])}</td>
          <td class="num">${money(r['预算'])}</td>
          <td class="num ${cls}">${money(r['实际'])}</td>
          <td class="num">${r['达成率']}</td>
          <td class="num">${money(r['GMV'])}</td>
          <td class="num roi">${fmtRoi(r['GMV'], r['实际'])}</td>
          <td class="num">${fmtNum(r['曝光量'])}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" style="text-align:center;color:#6b7686">暂无数据</td></tr>';

  $('#r-plan-table tbody').innerHTML = planRows.map(r => {
    const cls = moneyRaw(r['实际']) > moneyRaw(r['预算']) ? 'over' : '';
    return `<tr>
      <td>${esc(r['计划'])}</td>
      <td>${catBadge(r['分类'])}</td>
      <td class="num">${money(r['预算'])}</td>
      <td class="num ${cls}">${money(r['实际'])}</td>
      <td class="num">${r['达成率']}</td>
      <td class="num">${money(r['GMV'])}</td>
      <td class="num roi">${fmtRoi(r['GMV'], r['实际'])}</td>
      <td class="num">${fmtNum(r['曝光量'])}</td>
      <td class="num">${money(r['日均消耗'])}</td>
    </tr>`;
  }).join('');
}
/* ---------- 报表：投流计划拖拽排序 ---------- */
function renderPlanOrder() {
  const ul = $('#r-order-list');
  if (!ul) return;
  ul.innerHTML = plans.map((p, i) => `
    <li class="order-item" draggable="true" data-id="${p._id}">
      <span class="drag-handle">⠿</span>
      <span class="order-idx">${i + 1}</span>
      <span class="order-name">${esc(p.name)}</span>
      ${catBadge(p.category)}
      <span class="order-state">${p.active === false ? '<span class="badge badge-off">停用</span>' : ''}</span>
    </li>`).join('');
  bindOrderDrag();
}
function bindOrderDrag() {
  const ul = $('#r-order-list');
  if (!ul) return;
  let dragEl = null;
  ul.querySelectorAll('.order-item').forEach(li => {
    li.addEventListener('dragstart', (e) => { dragEl = li; li.classList.add('dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.dataset.id || ''); } catch (_) {} });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); dragEl = null; });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragEl || dragEl === li) return;
      const rect = li.getBoundingClientRect();
      const after = (e.clientY - rect.top) / rect.height > 0.5;
      if (after) li.after(dragEl); else li.before(dragEl);
    });
    li.addEventListener('drop', (e) => { e.preventDefault(); savePlanOrder(); });
  });
}
async function savePlanOrder() {
  const ul = $('#r-order-list');
  if (!ul) return;
  const ids = [...ul.querySelectorAll('.order-item')].map(li => li.dataset.id);
  plans.forEach(p => { const idx = ids.indexOf(p._id); if (idx >= 0) p.order = idx; });
  plans.sort((a, b) => (Number(a.order) - Number(b.order)) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  try {
    await Promise.all(plans.map(p => db.collection(C.plans).doc(p._id).update({ order: p.order })));
    await addLog('计划', '调整计划展示顺序');
    renderPlanOrder();
    renderOverview();
    if (report) renderReport();
    toast('顺序已保存');
  } catch (e) { toast('保存顺序失败：' + e.message, 'err'); }
}

function sumDay(dayMap) {
  let b = 0, a = 0;
  Object.values(dayMap).forEach(x => { b += x.budget; a += x.actual; });
  return { b, a };
}

$('#r-export').onclick = () => {
  if (!report) { toast('请先生成报表', 'err'); return; }
  if (typeof XLSX === 'undefined') { toast('Excel 组件未加载', 'err'); return; }
  const { from, to, dayRows, planRows, catRows, detail } = report;
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(dayRows);
  XLSX.utils.book_append_sheet(wb, ws1, '每日汇总');

  const wsCat = XLSX.utils.json_to_sheet(catRows || []);
  XLSX.utils.book_append_sheet(wb, wsCat, '按分类汇总');

  const ws2 = XLSX.utils.json_to_sheet(planRows.map(({ pid, ...r }) => r));
  XLSX.utils.book_append_sheet(wb, ws2, '按计划汇总');

  const ws3 = XLSX.utils.json_to_sheet(detail);
  XLSX.utils.book_append_sheet(wb, ws3, '明细');

  XLSX.writeFile(wb, `抖音投流报表_${from}_${to}.xlsx`);
  addLog('报表', `导出 Excel：${from} ~ ${to}`);
  toast('已导出 Excel');
};

/* ================================================================
 * 操作日志
 * ================================================================ */
async function renderLogs() {
  try {
    const res = await db.collection(C.logs).orderBy('time', 'desc').limit(200).get();
    const tbody = $('#l-table tbody');
    if (!res.data.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#6b7686">暂无日志</td></tr>';
      return;
    }
    tbody.innerHTML = res.data.map(l => {
      const t = new Date(l.time);
      const ts = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`;
      return `<tr><td>${ts}</td><td><b>${esc(l.action)}</b></td><td>${esc(l.detail || '')}</td></tr>`;
    }).join('');
  } catch (e) {
    $('#l-table tbody').innerHTML = `<tr><td colspan="3" style="text-align:center;color:#b42318">日志加载失败：${esc(e.message)}</td></tr>`;
  }
}

/* ---------- 导航 ---------- */
$$('.tab').forEach(tab => {
  tab.onclick = () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('#tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'overview') renderOverview();
    if (tab.dataset.tab === 'month') renderMonth();
    if (tab.dataset.tab === 'report') {
      if (!$('#r-from').value) initReport();
      if (!report) runReport();
      renderPlanOrder();
    }
    if (tab.dataset.tab === 'logs') renderLogs();
  };
});

/* ---------- 顶部按钮 ---------- */
$('#btn-change-pwd').onclick = openModal;
$('#btn-lock').onclick = () => { lockApp(); toast('已锁定'); };

/* ---------- 启动 ---------- */
(function boot() {
  $('#p-cat').innerHTML = catOptions('');
  $('#gate').classList.remove('hidden');

  /* 本地 file:// 直接打开会被浏览器拦截数据请求，给出明确指引 */
  if (location.protocol === 'file:') {
    $('#gate-title').textContent = '请用本地服务打开';
    $('#gate-desc').textContent = '浏览器会拦截 file:// 页面访问云端数据';
    $('#gate-btn').classList.add('hidden');
    $('#gate-err').innerHTML =
      '⚠️ 当前是用「双击 index.html」的方式打开的，无法访问云端数据。<br><br>' +
      '请改用以下任一方式：<br>' +
      '① 双击项目里的 <b>启动-本地预览.command</b>（Mac）或 <b>启动-本地预览.bat</b>（Windows），' +
      '会自动打开浏览器访问 http://localhost:8090；<br>' +
      '② 或直接访问线上网址：<br>' +
      '<a href="https://suzhou-leyuan-d6gfkgrlvcef0e76f-1468483089.tcloudbaseapp.com/douyin-budget/" target="_blank" rel="noopener">线上地址：suzhou-leyuan...tcloudbaseapp.com/douyin-budget/</a>';
    return;
  }

  (async () => {
    try {
      await initCloud();
      await checkGate();
    } catch (e) {
      const isLocal = /^localhost$|^127\.0\.0\.1$/.test(location.hostname);
      $('#gate-err').innerHTML =
        '初始化失败：' + esc(e.message) + '<br>' +
        (isLocal
          ? '提示：本地访问已开启，但仍连不上云端，请检查网络后刷新重试。'
          : '提示：当前地址不在 CloudBase 安全域名内。请使用 <b>http://localhost:8090</b>（运行启动脚本）或线上网址访问。');
    }
  })();
})();
