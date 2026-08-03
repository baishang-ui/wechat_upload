# Taro 4 + React 18 + HeroUI 渐进迁移设计

## 目标

将智能质检报告微信小程序从原生 WXML 页面渐进迁移到 Taro 4 和 React 18，同时保留既有识别、十样本表格、Session Cookie、本地历史、同步与导出契约。H5 端使用 React 18 兼容的 HeroUI，微信小程序端提供视觉和交互语义一致的 Taro 组件实现。

## 版本决策

- Taro 固定为 `4.2.1`，其 React 渲染器要求 React `^18`。
- React 与 React DOM 固定为 `18.3.1`。
- HeroUI 固定为 `2.8.10`。HeroUI 3 要求 React 19，不符合本次 React 18 约束。
- HeroUI 2 的动画依赖固定为 `framer-motion@11.18.2`。
- HeroUI 是 DOM 组件库，不能直接编译为微信原生组件，因此只允许在 `.h5.tsx` 平台文件中导入。

## 双平台组件边界

业务页面只依赖 `src/ui` 暴露的统一接口，不直接依赖 `@heroui/react`：

```text
业务 React 页面
  -> src/ui/button.tsx       -> @tarojs/components（WEAPP）
  -> src/ui/button.h5.tsx    -> @heroui/react（H5）
```

Provider、Button、Card、Field 等基础组件均采用该模式。平台文件必须保持相同 props 语义，禁止在业务页面中使用 `process.env.TARO_ENV` 分支拼装两套 UI。

## 迁移边界

本次建立独立的 `src/` Taro 源码和 `dist/` 输出目录。迁移期间保留 `miniprogram/` 原生实现作为生产基线，并继续运行原有 Node 测试。纯领域逻辑通过 `@legacy` 别名复用；微信 API 副作用通过 Taro adapter 注入现有服务的公开依赖接口。

在登录、任务列表、历史、识别队列、审核编辑器、检验工作台、相机和导出分享均达到功能一致，且通过微信开发者工具与真机验证之前，不修改 `project.config.json` 的 `miniprogramRoot`。切换入口是单独的发布步骤，不与页面迁移混在同一补丁中。

## 业务契约

- `MEASUREMENT_COUNT` 仍固定为 10。
- Session Cookie 使用原有存储键，401 清理 Session 并回到登录页。
- 本地历史继续使用 `inspectionHistory:v2` 并保留旧版迁移。
- 同步状态仍为 `local`、`syncing`、`synced`、`failed`。
- 导出 schema 仍为 `inspection-table/v1`。
- 识别队列继续由 `domain/recognition-queue.ts` 管理。
- 页面不得生成替代 `rowKey`；草稿合并仍同时校验项目语义。

## 验证与切换门槛

每批迁移都运行原有测试、原生 TypeScript 类型检查、Taro 类型检查及 WEAPP/H5 构建。涉及相机、图片、文件分享、安全区、Cookie 与触摸动画时，必须补充微信开发者工具和真机验证。只有全部核心流程达到一致后，才将开发者工具入口从 `miniprogram/` 切换到 `dist/`。
