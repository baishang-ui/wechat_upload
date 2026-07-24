# 手机拍照自动跟踪优化实施计划

**设计文档：** `docs/superpowers/specs/2026-07-24-document-camera-auto-tracking-design.md`

## 任务 1：定义跟踪状态与纯函数测试

- 修改 `tests/document-framing.test.ts`，先增加倾斜检测、平滑、丢帧保持、稳定进度、坐标映射和输出尺寸测试。
- 运行测试确认新增测试按预期失败。
- 扩展 `miniprogram/domain/document-framing.ts` 的检测、跟踪和几何 API。
- 运行纯函数测试确认通过。

## 任务 2：实现自动倒计时状态机

- 在纯函数层增加自动拍摄状态转换与倒计时取消规则。
- 先写时间推进、移动取消、模式切换取消和一次性触发测试。
- 页面只消费状态机输出，不在多个回调中分散判断。

## 任务 3：升级相机页面覆盖层与模式切换

- 先更新 `tests/document-camera-page.test.ts`，约束默认自动模式、Canvas 覆盖层、分段模式开关、倒计时和清理行为。
- 修改 `document-camera.ts/.wxml/.scss`。
- 保留手动快门和拍后确认流程。

## 任务 4：实现本地透视校正与降级

- 添加预览到照片坐标映射及目标尺寸测试。
- 使用 Canvas 网格变换实现透视拉正。
- 失败时调用现有矩形裁切，再失败时保留原图。

## 任务 5：回归验证

- 运行 `tests/document-framing.test.ts` 和 `tests/document-camera-page.test.ts`。
- 运行 TypeScript 类型检查。
- 运行除已知本地配置冲突测试外的全量测试。
- 运行 `git diff --check` 并审查相关文件差异。
