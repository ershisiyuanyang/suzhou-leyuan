# 苏州乐园 · 营销工具站

苏州高新旅游产业集团有限公司（苏州乐园）营销工具的代码仓库，部署在腾讯云开发（CloudBase）。

## 在线应用

| 应用 | 说明 | 访问地址 |
|------|------|----------|
| 苏州乐园学习/测试网站 | 静态站（index.html / admin.html） | https://suzhou-leyuan-d6gfkgrlvcef0e76f-1468483089.tcloudbaseapp.com |
| 抖音投流预算管理 | 投流计划/月度排布/报表工具（douyin-budget/） | https://douyin-budget-suzhou-leyuan-d6gfkgrlvcef0e76f.webapps.tcloudbase.com |

## CloudBase 资源

- 环境 ID：`suzhou-leyuan-d6gfkgrlvcef0e76f`（个人版）
- 数据库集合：`dbudget_plans`（投流计划）、`dbudget_days`（每日计划明细）、`dbudget_months`（月度总预算）、`dbudget_logs`（操作日志）、`dbudget_settings`（账户余额/访问密码）
- 认证：Web SDK 匿名登录 + publishable key（前端 `lib/cloudbase.full.js`，v3）

## douyin-budget 工具说明

本地目录 `douyin-budget/`，纯静态（index.html + app.js + style.css + lib/），无构建步骤。

功能：投流计划管理（分类/一键保存/拖拽排序）、月度排布（周策略/百元整数/前日比例预设/锁定保护）、日常填报（合并入日历面板，含备注）、报表（分类汇总/每日汇总/Excel 导出）、实际账户余额、操作日志。

### 本地预览

```bash
cd douyin-budget
npx http-server -p 8090 -c-1
# 或双击 启动-本地预览.command
```

浏览器打开 http://localhost:8090 （安全域名已配置 localhost:8090）。

### 上线部署（更新流程）

每次改动确认无误后：

1. **GitHub 保存版本**（SSH，注意本机全局 git 配置会把 `git@github.com:` 重写到 `url.github.com/`，请用 `ssh://git@github.com/...` 完整协议绕过）：

```bash
git add douyin-budget
git commit -m "描述本次改动"
git push origin main
```

2. **CloudBase 部署**：通过 CloudBase MCP `manageApps(deployApp)`，复用 serviceName `douyin-budget`、framework=static、installCmd/buildCmd 留空，触发远端 `tcb hosting deploy . /`，构建成功后即更新线上。

### 版本记录

- v20260820e（2026-08-20）：预估月末余额口径修正（账户余额 − 剩余待花预算）；备注功能（每日汇总/Excel 含备注列）；锁定保护；取消每日填报页合并入日历面板；首次上线。
