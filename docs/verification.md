# 本地验证记录

## 验证范围

2026 年 11 月 3 日，在 Windows、Node.js 22 环境对仓库基线 `4ae2d23` 执行离线逻辑测试和类型检查。未连接业务后端或模型服务，未执行微信开发者工具、真机、相机、文件分享或生产环境联调。

## 测试结果与修正

首次执行 `npm test`：320 项测试，303 项通过、17 项失败。`npm run typecheck` 通过。

其中 16 项失败来自测试代码对文件换行格式的假设：Windows Git 的 `core.autocrlf=true` 将源码检出为 CRLF，而结构测试使用包含固定 LF 分隔符的正则截取函数，得到空字符串后断言失败。对应实现仍存在于源码中。现仅在以下测试的源码读取入口把 CRLF 转为 LF，未删除测试、未改变断言、未改动业务实现：

- `tests/document-camera-page.test.ts`
- `tests/inspection-workbench-modal.test.ts`
- `tests/inspection-workbench-page.test.ts`
- `tests/ui-consistency.test.ts`

修正读取方式后执行 `npm test`：320 项测试，319 项通过、1 项失败。

剩余失败是 `opening an order uses a fixed expansion layer so list layout never animates`：测试要求子卡片入场延迟为 `500 + taskItemIndex * 60` 毫秒，而当前 WXML 使用 `250 + taskItemIndex * 60` 毫秒。这是测试期望与当前动画参数不一致；没有真机确认预期体验，故本次不修改该断言或业务动画，也不宣称完整测试通过。

README 已按源码修正后端识别代理、5 MB 图片上传与压缩策略、最多 2 个并发识别任务的说明。`tests/readme.test.ts` 保留文档契约检查。

## 公开版本配置验证

随后按当前版本隐私清理要求，将真实业务地址、AppID、企业标识与开发机路径替换为安全模板，并停止跟踪开发者私有配置及目录元数据。对应地址测试仍执行相同业务断言，只将环境值改为保留域名。

新增 `tests/public-config.test.ts` 的 2 项检查，要求公开默认地址为 `https://example.invalid`、识别接口路径保持不变、AppID 为游客值，并忽略开发者私有配置。最终执行 `npm test`：322 项测试，321 项通过、1 项失败；仍为前述 500/250 毫秒动画参数差异，没有新增失败。`npm run typecheck` 通过。

静态扫描覆盖当前跟踪的业务文件、文档、配置与测试，未发现已识别的真实业务域名、注册 AppID、个人开发机绝对路径、私网服务 URL 或常见格式的访问令牌。官方 SDK 类型声明的链接与样例不视为运行配置。此检查不包含完整历史，也不等于证明没有任何未识别敏感信息；边界见 [安全说明](../SECURITY.md)。

## 运行方式

```bash
npm ci
npm test
npm run typecheck
```

微信原生 API 相关体验必须另行验证：会话失效、相机授权、图像旋转、上传失败重试、待检工作台编辑、JSON 文件分享，以及手机安全区和减少动态效果偏好。Node 测试与类型检查不能替代这些验证，也不能证明线上识别或业务保存成功。
