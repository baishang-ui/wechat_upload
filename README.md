# 检验报告 OCR 微信小程序

一个使用 TypeScript 和 SCSS 构建的微信小程序，用于拍摄或选择工业检验报告图片，通过视觉大模型识别表格，并在小程序中校对、编辑和保存识别结果。

## 功能

- 相机拍摄或从相册选择一张检验报告。
- 上传前自动压缩图片，避免模型网关返回 `413 Request Entity Too Large`。
- 调用 OpenAI 兼容的 `qwen35` 视觉模型接口。
- 自动处理横向或旋转的检验报告。
- 显示模型返回的原始 JSON。
- 将识别结果转换为可编辑的十列表格。
- 支持六类报告：钢丝刷、拉绒片、树脂砂轮、百叶轮、网格砂和金刚石锯片。
- 使用本地文件与本地存储保存最近 30 条识别记录。
- 在记录页通过底部弹窗重新打开并编辑历史表格。
- 毛玻璃胶囊底栏、滑块位移动画、列表入场动画和安全区适配。

## 技术栈

- 微信小程序
- TypeScript
- WXML
- SCSS
- Node.js 测试运行器
- `tsx`

## 项目结构

```text
miniprogram/
  domain/
    inspection-record.ts     OCR 数据归一化与表格更新
    inspection-history.ts    本地历史排序、更新和数量限制
  services/
    inspection-service.ts    图片压缩、视觉模型调用与 JSON 解析
    history-service.ts       微信本地存储与持久图片管理
  pages/index/
    index.ts                 页面状态与交互
    index.wxml               识别、历史和编辑弹窗
    index.scss               页面、动画和毛玻璃样式
tests/
  *.test.ts                  数据、压缩和本地历史测试
```

## 安装

需要 Node.js 18 或更高版本。

```bash
npm install
```

## 运行

1. 打开微信开发者工具。
2. 导入本项目目录。
3. 确认小程序根目录为 `miniprogram/`。
4. 开发阶段关闭“校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。
5. 编译并在模拟器或真机中测试拍照和相册权限。

当前模型接口：

```text
POST http://www.binictools.cn:8865/api/llm/v1/chat/completions
```

模型名称为 `qwen35`。图片以 OpenAI 兼容的 `image_url` Base64 数据发送。

## API Token

项目不会在源码中保存真实 API Token。若服务端启用 Bearer Token 校验，可在微信开发者工具控制台中临时设置：

```js
wx.setStorageSync('llmApiToken', 'YOUR_API_TOKEN')
```

清除本地 Token：

```js
wx.removeStorageSync('llmApiToken')
```

小程序客户端无法安全保存长期密钥。正式发布时应由业务后端代理模型请求。

## 图片压缩

模型网关的请求体上限约为 1 MB，而 Base64 会使图片体积增加约 33%。小程序在请求前将图片压缩到不超过 600 KB，压缩质量依次尝试：

```text
70 -> 50 -> 35 -> 20
```

若压缩后仍超过限制，会提示用户靠近报告重新拍摄。

## 本地记录

- 存储键：`inspectionHistory:v1`
- 最多保存：30 条
- 排序方式：最近更新时间倒序
- 新记录会通过 `saveFile` 保存报告图片。
- 更新记录会复用原图片，不会重复保存。
- 删除或超出数量限制时会清理对应本地图片。
- 本地记录不会跨设备同步。

## 测试

运行全部单元测试：

```bash
npm test
```

运行 TypeScript 严格检查：

```bash
npm run typecheck
```

## 正式发布注意事项

当前接口使用 HTTP，只适合开发环境。正式微信小程序需要：

- 使用已备案并配置到微信公众平台的 HTTPS 域名。
- 将模型 Token 保存在业务后端，而不是小程序中。
- 由业务后端代理视觉模型请求。
- 增加服务器端检验记录保存接口，实现跨设备同步和权限控制。
- 根据业务要求增加用户登录、审计和数据保留策略。
