# Taro 4 + React 18 + HeroUI 迁移计划

1. 搭建 Taro 4、React 18、WEAPP/H5 平台插件、独立类型检查与构建脚本。
2. 建立 `src/ui` 双平台适配层；WEAPP 使用 Taro 组件，H5 使用 HeroUI 2.8.10。
3. 迁移应用入口、登录页、工作区外壳与带阻尼连续滑动的底栏。
4. 迁移任务和历史列表，并通过 Taro transport 注入复用领域与服务契约。
5. 迁移识别队列、审核编辑器及保存、同步、导出流程。
6. 迁移采购检验工作台和相机页面，补齐真机专属能力验证。
7. 完成功能对照测试后，将 `project.config.json` 入口切换至 `dist/`，保留一个发布周期的原生回退方案。

每一步都应保持 `npm test`、`npm run typecheck`、`npm run typecheck:taro`、`npm run build:weapp` 和 `npm run build:h5` 可通过。第 5、6 步完成前不得宣称迁移完成。
