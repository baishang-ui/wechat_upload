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
    'http://localhost:7875',
    'http://www.binictools.cn:8865/api/llm/v1/chat/completions',
    "MODEL_NAME = 'qwen35'",
    "MODEL_TOKEN_STORAGE_KEY = 'llmApiToken'",
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

test('README documents temporary direct-model guidance without hardcoded credentials', () => {
  assert.doesNotMatch(readme, /wx\.setStorageSync\(['"]llmApiToken/)
  assert.match(readme, /8865\/api\/llm\/v1\/chat\/completions/)
  assert.match(readme, /模型令牌不得硬编码/)
  assert.doesNotMatch(readme, /上传功能尚未实现/)
  assert.doesNotMatch(readme, /增加服务器端检验记录保存接口/)
})
