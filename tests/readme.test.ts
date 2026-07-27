import test from 'node:test'
import strictAssert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assert: typeof strictAssert = strictAssert
const readme = readFileSync(resolve(__dirname, '..', 'README.md'), 'utf8')

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('README documents the current authenticated inspection workflow', () => {
  const required = [
    'https://www.binictools.cn:7876',
    'POST /api/miniprogram/quality-inspections/recognize',
    'smartSalesSession:v1',
    '最多 10 个未完成任务',
    'inspectionHistory:v2',
    '最多保存 30 条',
    'POST /customer-orders/api/quality-inspections/standalone',
    'npm test',
    'npm run typecheck',
  ]
  required.forEach((value) => assert.match(readme, new RegExp(escapeRegExp(value))))
})

test('README documents backend-proxied recognition without client model credentials', () => {
  assert.doesNotMatch(readme, /MODEL_API_URL|MODEL_TOKEN_STORAGE_KEY|8865\/api\/llm/)
  assert.match(readme, /识别请求通过业务后端代理/)
  assert.match(readme, /小程序不保存模型地址或模型令牌/)
  assert.doesNotMatch(readme, /上传功能尚未实现/)
  assert.doesNotMatch(readme, /增加服务器端检验记录保存接口/)
})
