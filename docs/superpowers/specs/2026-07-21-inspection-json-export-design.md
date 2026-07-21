# 检验表 JSON 导出设计

## 目标

为单份已识别检验报告提供本地 JSON 导出能力。导出文件直接表达一张检验表，可从当前识别结果和历史记录详情中生成。上传功能本轮不实现；未来上传层将完整 JSON 文本按 UTF-8 转为 Base64 后发送。

## 导出范围

- 一次只导出一份检验报告。
- 当前识别结果允许在保存前导出，`record_id` 为 `null`。
- 已保存结果与历史记录使用本地记录编号作为 `record_id`。
- 不导出本地图片路径、模型原始响应、低置信度内部标记或本地同步状态。
- 不包含图片 Base64；未来仅对完整 JSON 文本做 Base64 编码。

## JSON 契约

顶层结构固定为：

```json
{
  "schema": "inspection-table/v1",
  "record_id": "IR-1760000000000",
  "exported_at": "2026-07-21T10:30:00.000Z",
  "meta": {},
  "table": {
    "columns": [],
    "rows": []
  }
}
```

`meta` 包含 `product_type`、`customer`、`supplier`、`trademark`、`order_number`、`model`、`arrival_quantity`、`inspection_date`、`notes`、`reviewer` 和 `inspector`。

`table.columns` 固定为 `item`、`requirement`、`specification` 和 `sample_1` 至 `sample_10`。`table.rows` 先按原始顺序输出全部检验项目，最后追加一行 `item` 为“判定”的数据。每行始终包含全部十三个字段，缺失值使用空字符串。

## 文件格式

- 文件编码：UTF-8。
- JSON 缩进：2 个空格，便于人工检查和版本比较。
- 文件名：`inspection-<record-id>.json`；未保存记录使用导出时间戳。
- 导出时写入微信用户数据目录，然后调用微信文件分享能力。
- 首次文件分享失败时等待 150ms 后自动重试一次；不使用剪贴板降级。
- 当前基础库缺少文件分享能力时提示用户升级微信。

## 页面入口

- 识别结果核对页：在现有“重新识别 / 确认保存”操作下方增加“导出 JSON”。
- 保存成功页：增加“导出 JSON”，复用当前记录编号和编辑后的数据。
- 历史记录编辑弹窗：在底部操作区增加“导出 JSON”，导出弹窗中的当前编辑值。

导出进行中禁用重复操作。成功后提示文件已生成；失败时保留页面数据并显示错误原因。

## 模块边界

- `inspection-export.ts` 只负责稳定的 JSON 契约、表格行转换和序列化，不访问微信 API。
- `export-service.ts` 只负责写文件、重试并打开微信文件分享。
- 页面负责选择当前记录、显示状态和错误提示，不拼装 JSON 字段。

## 测试

- 验证固定列顺序和十个样本列。
- 验证检验行顺序、空值补齐和末尾判定行。
- 验证内部字段和本地图片路径不会进入 JSON。
- 验证文件名、UTF-8 JSON 内容、分享调用、单次重试和不支持提示。
- 运行全部单元测试、TypeScript 检查、SCSS 编译和 WXML 标签平衡检查。

## 非本轮范围

- 网络上传接口。
- JSON Base64 编码与传输。
- 多选或批量导出。
- 报告图片嵌入 JSON。
