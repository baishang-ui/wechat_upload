# 微信小程序 UI 一致性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将登录页和采购待检任务页统一到现有拍照识别/识别记录页面的视觉系统，不改变认证、查询、分页和质检业务行为。

**Architecture:** 新增一个只包含 SCSS 颜色、圆角和阴影变量的共享设计令牌文件，由登录页和内部首页共同导入。通过静态 UI 契约测试锁定共享样式入口和关键结构类名，再分别调整登录页与任务页的 WXML/SCSS；TypeScript 和 API 层保持不变。

**Tech Stack:** 微信小程序 WXML、SCSS、TypeScript、Node.js `node:test`、`tsx`

## Global Constraints

- 页面背景固定使用 `#f3f6f8`，主色固定使用 `#2f6bff`，主文字使用 `#17233d`，次级文字使用 `#77839a`。
- 内容卡片使用白色背景、浅色边框、`24rpx` 圆角和轻量蓝灰阴影。
- 不新增图片、图标库、第三方 UI 框架或后端依赖。
- 不修改登录 API、Session Cookie、服务器地址配置、采购待检 API、分页、搜索、筛选、选择和质检流程。
- 保留用户已有的 `package.json` 修改以及当前未提交的服务器地址和 `tests/server-client.test.ts` 修改；每次提交只暂存本计划明确列出的文件。

---

## File Map

- Create `miniprogram/styles/_design-tokens.scss`: 登录页和内部页面共享的 SCSS 设计令牌。
- Modify `miniprogram/pages/login/login.wxml`: 登录页面的语义化标题、表单和错误提示结构。
- Modify `miniprogram/pages/login/login.scss`: 使用内部页面的背景、卡片、输入框和按钮视觉。
- Modify `miniprogram/pages/index/index.wxml`: 为采购待检工具栏、状态页和任务信息增加稳定的视觉结构类名。
- Modify `miniprogram/pages/index/index.scss`: 使用共享令牌并统一待检页面卡片、筛选和状态样式。
- Create `tests/ui-consistency.test.ts`: 静态读取 WXML/SCSS，验证共享样式入口和关键 UI 契约。

### Task 1: 建立 UI 一致性契约测试

**Files:**
- Create: `tests/ui-consistency.test.ts`

**Interfaces:**
- Consumes: Node.js `readFileSync()` 与当前小程序源码文件。
- Produces: 对共享令牌导入、登录页结构和待检页面结构的自动化契约。

- [ ] **Step 1: 写入失败的静态契约测试**

```ts
import test from 'node:test'
import strictAssert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assert: typeof strictAssert = strictAssert
const root = resolve(__dirname, '..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('login and index pages share the inspection design tokens', () => {
  const loginScss = source('miniprogram/pages/login/login.scss')
  const indexScss = source('miniprogram/pages/index/index.scss')
  assert.match(loginScss, /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
  assert.match(indexScss, /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
})

test('login page uses the internal card and form hierarchy', () => {
  const wxml = source('miniprogram/pages/login/login.wxml')
  const scss = source('miniprogram/pages/login/login.scss')
  assert.match(wxml, /class="login-intro"/)
  assert.match(wxml, /class="login-form-heading"/)
  assert.match(wxml, /class="login-field"/)
  assert.match(wxml, /class="error-message"/)
  assert.doesNotMatch(scss, /linear-gradient/)
})

test('pending inspection page exposes unified toolbar, state and task metadata classes', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  assert.match(wxml, /class="task-toolbar-heading"/)
  assert.match(wxml, /class="task-state-icon/)
  assert.match(wxml, /class="task-card-kicker"/)
  assert.match(wxml, /class="task-card-details"/)
})
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `npx tsx --test tests/ui-consistency.test.ts`

Expected: 3 项测试失败，分别指出共享令牌导入、登录层级和待检结构尚不存在。

- [ ] **Step 3: 提交失败测试**

```bash
git add tests/ui-consistency.test.ts
git commit -m "test: define miniprogram UI consistency contract"
```

### Task 2: 创建共享设计令牌

**Files:**
- Create: `miniprogram/styles/_design-tokens.scss`
- Modify: `miniprogram/pages/login/login.scss:1`
- Modify: `miniprogram/pages/index/index.scss:1`
- Test: `tests/ui-consistency.test.ts`

**Interfaces:**
- Consumes: Sass `@import` 和现有页面 SCSS 编译流程。
- Produces: `$ui-page-background`、`$ui-primary`、`$ui-text-primary`、`$ui-text-secondary`、`$ui-card-*`、`$ui-field-*`、`$ui-success`、`$ui-danger` 变量。

- [ ] **Step 1: 创建共享变量文件**

```scss
$ui-page-background: #f3f6f8;
$ui-primary: #2f6bff;
$ui-primary-pressed: #2458d8;
$ui-text-primary: #17233d;
$ui-text-secondary: #77839a;
$ui-card-background: #fff;
$ui-card-border: #e8edf5;
$ui-card-radius: 24rpx;
$ui-card-shadow: 0 14rpx 40rpx rgba(38, 67, 111, .08);
$ui-field-background: #f6f8fc;
$ui-field-border: #e2e8f2;
$ui-success: #16865f;
$ui-success-background: #e8f8f2;
$ui-danger: #c83d4b;
$ui-danger-background: #fff0f1;
```

- [ ] **Step 2: 在两个页面 SCSS 顶部导入令牌**

```scss
@import '../../styles/design-tokens';
```

- [ ] **Step 3: 运行共享入口测试**

Run: `npx tsx --test tests/ui-consistency.test.ts --test-name-pattern="share the inspection design tokens"`

Expected: PASS。

- [ ] **Step 4: 检查 Sass 文件格式**

Run: `git diff --check -- miniprogram/styles/_design-tokens.scss miniprogram/pages/login/login.scss miniprogram/pages/index/index.scss`

Expected: 无输出，退出码 0。

- [ ] **Step 5: 提交设计令牌**

```bash
git add miniprogram/styles/_design-tokens.scss miniprogram/pages/login/login.scss miniprogram/pages/index/index.scss
git commit -m "style: share miniprogram design tokens"
```

### Task 3: 统一登录页视觉结构

**Files:**
- Modify: `miniprogram/pages/login/login.wxml:1-38`
- Modify: `miniprogram/pages/login/login.scss:1-82`
- Test: `tests/ui-consistency.test.ts`

**Interfaces:**
- Consumes: Task 2 的共享 SCSS 变量；保留 `username`、`password`、`errorMessage`、`submitting` 数据以及原有事件名。
- Produces: `login-intro`、`login-form-heading`、`login-field` 和内部卡片风格登录页面。

- [ ] **Step 1: 将登录 WXML 调整为内部页面层级**

保留所有数据绑定和事件名，结构改为：

```xml
<view class="login-page">
  <view class="login-shell">
    <view class="login-intro">
      <view class="brand-mark">BINIC INSPECTION</view>
      <view class="login-title">质量检验工作台</view>
      <view class="login-subtitle">连接智能销售系统，处理采购待检任务与检验报告。</view>
    </view>

    <view class="login-card">
      <view class="login-form-heading">账号登录</view>
      <view class="login-form-description">使用智能销售系统账号继续</view>

      <view class="login-field">
        <view class="field-label">用户名</view>
        <input class="login-input" value="{{username}}" placeholder="请输入用户名" maxlength="100" bindinput="onUsernameInput" />
      </view>

      <view class="login-field">
        <view class="field-label">密码</view>
        <input class="login-input" value="{{password}}" password placeholder="请输入密码" maxlength="256" bindinput="onPasswordInput" confirm-type="done" bindconfirm="submitLogin" />
      </view>

      <view wx:if="{{errorMessage}}" class="error-message">
        <view class="error-dot"></view>
        <text>{{errorMessage}}</text>
      </view>

      <button class="login-button" loading="{{submitting}}" disabled="{{submitting}}" bindtap="submitLogin">登录</button>
    </view>
  </view>
</view>
```

- [ ] **Step 2: 使用共享变量重写登录 SCSS**

实现以下精确视觉约束：

```scss
page { min-height: 100%; background: $ui-page-background; color: $ui-text-primary; }
.login-page { min-height: 100vh; box-sizing: border-box; padding: calc(120rpx + env(safe-area-inset-top)) 28rpx calc(64rpx + env(safe-area-inset-bottom)); }
.login-shell { width: 100%; max-width: 680rpx; margin: 0 auto; }
.login-intro { margin-bottom: 30rpx; animation: login-rise .38s ease-out both; }
.login-card { padding: 40rpx 34rpx 36rpx; background: $ui-card-background; border: 1rpx solid $ui-card-border; border-radius: $ui-card-radius; box-shadow: $ui-card-shadow; animation: login-rise .38s .04s ease-out both; }
.login-input { height: 88rpx; padding: 0 26rpx; background: $ui-field-background; border: 2rpx solid $ui-field-border; border-radius: 18rpx; }
.error-message { display: flex; align-items: flex-start; gap: 14rpx; margin-top: 22rpx; padding: 18rpx 20rpx; color: $ui-danger; background: $ui-danger-background; border-radius: 16rpx; }
.login-button { height: 92rpx; margin-top: 32rpx; color: #fff; background: $ui-primary; border-radius: 20rpx; }
.login-button:active { background: $ui-primary-pressed; transform: scale(.99); }
.login-button[disabled] { color: rgba(255, 255, 255, .8); background: #8eabf4; }
```

补齐标题、说明、标签、错误圆点和 `@keyframes login-rise`，禁止使用渐变。

- [ ] **Step 3: 运行登录契约测试**

Run: `npx tsx --test tests/ui-consistency.test.ts --test-name-pattern="login page uses"`

Expected: PASS。

- [ ] **Step 4: 运行小程序完整自动化测试和类型检查**

Run: `npm test && npm run typecheck`

Expected: 57 项测试全部通过，TypeScript 无错误。

- [ ] **Step 5: 提交登录页 UI**

```bash
git add miniprogram/pages/login/login.wxml miniprogram/pages/login/login.scss
git commit -m "style: align miniprogram login with internal UI"
```

### Task 4: 统一采购待检页面视觉结构

**Files:**
- Modify: `miniprogram/pages/index/index.wxml:146-210`
- Modify: `miniprogram/pages/index/index.scss:1270-1446`
- Test: `tests/ui-consistency.test.ts`

**Interfaces:**
- Consumes: 现有 `taskSearch`、`taskStatus`、`taskLoading`、`taskItems`、`taskTotal`、`selectedTaskId`、`selectedItemId` 和全部现有事件绑定。
- Produces: `task-toolbar-heading`、`task-state-icon`、`task-card-kicker`、`task-card-details` 视觉结构；不新增 TypeScript 状态。

- [ ] **Step 1: 增加工具栏标题与任务数量结构**

在搜索栏前加入：

```xml
<view class="task-toolbar-heading">
  <view>
    <view class="task-toolbar-eyebrow">PURCHASE INSPECTION</view>
    <view class="task-toolbar-title">采购待检任务</view>
  </view>
  <view class="task-toolbar-count">{{taskTotal}} 项</view>
</view>
```

- [ ] **Step 2: 统一加载与空状态结构**

加载状态使用 `task-state-icon is-loading`，空状态使用 `task-state-icon is-empty`，两者保留当前标题、说明和重新加载按钮。图形仅由 SCSS 边框和伪元素构成，不新增图片资源。

- [ ] **Step 3: 建立任务卡片信息层级**

任务标题区域改为：

```xml
<view class="task-card-main">
  <view class="task-card-kicker">采购合同</view>
  <view class="task-card-title">{{task.contract_no || task.task_no || '采购质检任务'}}</view>
  <view class="task-card-details">
    <view class="task-card-subtitle">{{task.customer_name || '未填写客户'}} · {{task.supplier_name || '未填写供应商'}}</view>
    <view class="task-card-meta">{{task.signed_date || '无日期'}} · {{task.items.length || 0}} 项物料</view>
  </view>
</view>
```

保留状态标签和任务明细循环的原始数据绑定与事件。

- [ ] **Step 4: 使用设计令牌重写待检区域样式**

实现以下约束：

```scss
.task-toolbar { padding: 30rpx; border-radius: $ui-card-radius; }
.task-toolbar-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 26rpx; }
.task-toolbar-eyebrow { color: $ui-primary; font-size: 20rpx; font-weight: 700; letter-spacing: 3rpx; }
.task-toolbar-title { margin-top: 8rpx; color: $ui-text-primary; font-size: 34rpx; font-weight: 700; }
.task-toolbar-count { padding: 10rpx 18rpx; color: $ui-primary; background: #edf3ff; border-radius: 999rpx; font-size: 22rpx; font-weight: 700; }
.task-search-input { background: $ui-field-background; border: 2rpx solid $ui-field-border; }
.task-search-button { background: $ui-primary; }
.task-status-chip { color: $ui-text-secondary; background: $ui-field-background; border: 1rpx solid transparent; }
.task-status-chip.is-active { color: $ui-primary; background: #edf3ff; border-color: #c8d8ff; }
.task-card { overflow: hidden; border-radius: $ui-card-radius; transition: transform .16s ease, box-shadow .16s ease; }
.task-card:active { transform: scale(.992); }
.task-card-kicker { color: $ui-primary; font-size: 20rpx; font-weight: 700; letter-spacing: 2rpx; }
.task-item.is-selected { background: #edf3ff; box-shadow: inset 4rpx 0 0 $ui-primary; }
```

同时统一任务状态、空状态、加载图形、卡片内边距、详情分隔线和列表底部文字颜色。

- [ ] **Step 5: 运行待检契约测试**

Run: `npx tsx --test tests/ui-consistency.test.ts --test-name-pattern="pending inspection page"`

Expected: PASS。

- [ ] **Step 6: 运行完整小程序测试**

Run: `npm test && npm run typecheck && git diff --check`

Expected: 57 项测试全部通过，TypeScript 无错误，diff 检查无输出。

- [ ] **Step 7: 提交待检页面 UI**

```bash
git add miniprogram/pages/index/index.wxml miniprogram/pages/index/index.scss
git commit -m "style: align pending inspection workspace UI"
```

### Task 5: 微信开发者工具视觉验收

**Files:**
- Verify only; no source modification expected.

**Interfaces:**
- Consumes: Tasks 1–4 的已提交页面和当前本地后端。
- Produces: 登录页、待检加载/空状态、待检列表和任务选中状态的视觉验收结果。

- [ ] **Step 1: 确认后端和当前服务器配置可访问**

Run: `curl -sS -m 5 -o /dev/null -w '%{http_code}\n' "$(sed -n "s/export const SERVER_BASE_URL = '\([^']*\)'.*/\1/p" miniprogram/config/server.ts)/openapi.json"`

Expected: `200`。若当前配置为线上地址但线上尚未部署小程序路由，只记录环境限制，不修改 UI 代码。

- [ ] **Step 2: 在微信开发者工具重新编译**

打开 `/Users/landcloud/WeChatProjects/miniprogram-2`，执行“清除编译缓存并重新编译”。

Expected: WXML、SCSS 和 TypeScript 编译无错误。

- [ ] **Step 3: 检查登录页**

确认浅灰背景、内部卡片样式、输入框、主按钮、错误提示、安全区和键盘弹出场景符合设计文档。

- [ ] **Step 4: 检查采购待检页面状态**

依次检查加载状态、空状态、任务列表、展开任务、选中物料和列表底部状态；确认没有文字截断、覆盖或无法点击。

- [ ] **Step 5: 最终自动化验证**

Run: `npm test && npm run typecheck && git diff --check`

Expected: 57 项测试通过、类型检查通过、diff 检查通过。

- [ ] **Step 6: 检查提交与未提交文件边界**

Run: `git status --short && git log --oneline -6`

Expected: UI 文件均已提交；只保留计划开始前已存在的 `miniprogram/config/server.ts`、`package.json`、`tests/server-client.test.ts` 修改，不推送远端。
