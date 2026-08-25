/* 诊断 SDK 读取可靠性：哪些查询方式能真正返回数据。
 * 用于定位 loadNodes/seedNodes/getAll 的 .where({}) 空查询为何返回 0。
 */
const fs = require('fs');
const cloudbase = require('@cloudbase/js-sdk');
const APPJS = '/Users/gujiwen/WorkBuddy/2026-08-19-15-32-01/douyin-budget/app.js';
const ACCESS_KEY = fs.readFileSync(APPJS,'utf8').match(/const ACCESS_KEY = '([^']+)'/)[1];
const ENV_ID = 'suzhou-leyuan-d6gfkgrlvcef0e76f';

(async () => {
  const app = cloudbase.init({ env: ENV_ID, accessKey: ACCESS_KEY, region: 'ap-shanghai', auth: { detectSessionInUrl: true } });
  await app.auth().signInAnonymously();
  const db = app.database();
  const cmd = db.command;

  const tryq = async (label, q) => {
    try {
      const r = await q.limit(100).get();
      console.log(`[${label}] 返回条数=`, r.data.length);
    } catch (e) { console.log(`[${label}] 异常 ->`, e.message || e); }
  };

  await tryq('empty where {}', db.collection('dbudget_nodes').where({}));
  await tryq('by _openid wdWG', db.collection('dbudget_nodes').where({ _openid: 'wdWGqEBzXLYLTgSVJWYbdg' }));
  await tryq('exists _id', db.collection('dbudget_nodes').where({ _id: cmd.exists(true) }));
  await tryq('date gte 2000', db.collection('dbudget_nodes').where({ date: cmd.gte('2000-01-01') }));
  await tryq('no-where get', db.collection('dbudget_nodes'));
  process.exit(0);
})().catch(e => { console.error('DIAG ERR', e); process.exit(1); });
