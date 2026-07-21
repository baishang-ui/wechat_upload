import test from 'node:test'
import assert from 'node:assert/strict'

import {
  exportInspectionJson,
  InspectionJsonExportAdapter,
} from '../miniprogram/services/export-service'
import { createMockRecord } from '../miniprogram/domain/inspection-record'

function createAdapter(withShare = true) {
  const writes: Array<{ filePath: string; data: string }> = []
  const shares: Array<{ filePath: string; fileName: string }> = []
  const waits: number[] = []
  const adapter: InspectionJsonExportAdapter = {
    userDataPath: '/user-data',
    writeFile: async (filePath, data) => { writes.push({ filePath, data }) },
    wait: async (milliseconds) => { waits.push(milliseconds) },
    shareFile: withShare
      ? async (filePath, fileName) => { shares.push({ filePath, fileName }) }
      : undefined,
  }
  return { adapter, writes, shares, waits }
}

test('exportInspectionJson writes and shares a deterministic JSON file', async () => {
  const harness = createAdapter()
  const result = await exportInspectionJson({
    recordId: 'IR-1000',
    record: { ...createMockRecord(), customer: '客户A' },
  }, harness.adapter, Date.parse('2026-07-21T02:30:00.000Z'))

  assert.deepEqual(result, {
    fileName: 'inspection-IR-1000.json',
    filePath: '/user-data/inspection-IR-1000.json',
    delivery: 'shared',
  })
  assert.equal(harness.writes.length, 1)
  assert.equal(harness.writes[0].filePath, result.filePath)
  assert.equal(JSON.parse(harness.writes[0].data).exported_at, '2026-07-21T02:30:00.000Z')
  assert.deepEqual(harness.shares, [{ filePath: result.filePath, fileName: result.fileName }])
  assert.deepEqual(harness.waits, [])
})

test('exportInspectionJson rejects when file sharing is unavailable', async () => {
  const harness = createAdapter(false)

  await assert.rejects(
    () => exportInspectionJson({ record: createMockRecord() }, harness.adapter, 1000),
    /当前微信版本不支持文件分享/,
  )
  assert.equal(harness.shares.length, 0)
})

test('exportInspectionJson retries file sharing once after a short delay', async () => {
  const harness = createAdapter()
  let attempts = 0
  harness.adapter.shareFile = async (filePath, fileName) => {
    attempts += 1
    if (attempts === 1) throw new Error('share unavailable')
    harness.shares.push({ filePath, fileName })
  }

  const result = await exportInspectionJson({
    recordId: 'IR-1000',
    record: createMockRecord(),
  }, harness.adapter, 1000)

  assert.equal(result.delivery, 'shared')
  assert.equal(attempts, 2)
  assert.deepEqual(harness.waits, [150])
  assert.equal(harness.shares.length, 1)
})
