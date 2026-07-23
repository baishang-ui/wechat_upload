# Matched Inspection Draft Upload Design

**Date:** 2026-07-23

## Goal

When the mini-program uploads recognized data for a selected purchase-order inspection item, save only OCR inspection projects that correspond to the formal projects for that material. Preserve every database project that was not recognized in the current report, and reject an upload that matches nothing.

This is project-level matching inside an already selected `taskId + itemId`. Automatic routing across multiple purchase items is out of scope.

## Confirmed Current Behavior

The mini-program currently converts every recognized row into `inspection_records`. The backend draft endpoint then replaces the complete saved record list:

```python
meta["inspection_draft"]["records"] = records
```

The Web quality-inspection workbench dynamically builds many formal inspection rows and has client-side canonical label matching, but the backend draft endpoint neither filters incoming mini-program rows nor preserves unmatched saved rows.

## Request Contract

Extend the draft payload with:

```json
{
  "record_merge_mode": "matched_only"
}
```

Allowed values:

- `replace`: existing behavior; replace the complete draft record list.
- `matched_only`: filter and merge records using the selected material template.

Default: `replace`.

Usage:

- mini-program purchase-order report: `matched_only`;
- mini-program standalone report: `replace`;
- Web quality-inspection workbench: omitted, therefore `replace`.

## Product-Type Resolution

The backend resolves the product template in this order:

1. infer from `QualityInspectionItem.material_name`, `material_code`, and `spec_desc`;
2. if item inference fails, use `ai_workbench_result.product_type`;
3. if neither yields one of the six supported mini-program types, return HTTP 422 without mutation.

Supported product types:

- `steel_brush`;
- `velcro_disc`;
- `resin_wheel`;
- `flap_disc`;
- `mesh_abrasive`;
- `diamond_blade`.

## Formal Project Templates

Use backend constants aligned with the Web workbench’s existing product templates.

| Product type | Canonical projects |
| --- | --- |
| `steel_brush` | 材质、丝径、直径、检测转速、柄直径 |
| `velcro_disc` | 材质、粒度、直径、颜色、孔数 |
| `resin_wheel` | 直径、孔径、厚度、芯环字样、端跳、检测转速、单重、切割材料、切割刀数 |
| `flap_disc` | 材质、粒度、直径、孔径、叶片宽度、叶片长度、检测转速、商标 |
| `mesh_abrasive` | 材质、粒度、直径、孔径、颜色 |
| `diamond_blade` | 直径、孔径、刀头厚度、刀头高度、刀头长度、垫圈 |

## Canonical Label Matching

Normalize case, whitespace, Chinese/ASCII punctuation, units in parentheses, and common aliases. Examples:

- `外径(mm)`, `外径(㎜)`, `直径` → `直径`;
- `中孔径`, `内孔`, `孔径(mm)` → `孔径`;
- `粒度号（#）`, `粒度` → `粒度`;
- `回转测试`, `安全转速`, `转速` → `检测转速`;
- `砂面颜色`, `颜色` → `颜色`;
- `圆盘孔数`, `孔型/孔数` → `孔数`;
- `商标是否贴齐`, `商标` → `商标`;
- `是否配置垫圈`, `垫圈` → `垫圈`.

Matching uses canonical equality. The implementation must avoid broad substring matching that would confuse `孔数` with `孔径` or `柄直径` with product `直径`.

Duplicate incoming rows with the same canonical project collapse to one record; the last recognized row wins.

## Matched Merge Algorithm

For `matched_only`:

1. sanitize at most 120 incoming records using the existing draft-record sanitizer;
2. resolve the product type and allowed canonical projects;
3. discard records whose canonical project is not allowed;
4. deduplicate matched incoming records by canonical project, last row wins;
5. canonicalize every existing saved record project;
6. replace an existing matching project in place;
7. append a matched incoming project only when no existing saved project matches it;
8. preserve every unmatched existing saved record in its original order;
9. if no unique incoming project matches, raise HTTP 422 before calling the item metadata setter or committing.

When replacing an existing record, preserve its formal definition:

- `row_key`;
- `group_title`;
- `project`;
- `method`;
- `standard`;
- `measurement_standards`.

Update only recognized execution data:

- `sample_data`;
- `decision`;
- `note`;
- `ai_result`;
- `images` only when the incoming record includes valid images;
- `updated_at`.

If the incoming record contains no valid images, preserve existing row images.

Draft-level AI workbench metadata and valid report images continue to be saved. Existing draft-level images are preserved when the request supplies none.

## Response Contract

On success, add merge information alongside the returned item:

```json
{
  "item": {},
  "merge": {
    "mode": "matched_only",
    "product_type": "diamond_blade",
    "matched_count": 3,
    "ignored_count": 2,
    "ignored_projects": ["客户投诉原因", "其他说明"],
    "preserved_count": 7
  }
}
```

For `replace`, return the same shape with `mode=replace`; counts may describe the saved payload but must not alter existing client behavior.

## Zero-Match Behavior

If `matched_only` yields zero matched projects, return:

```text
HTTP 422
识别结果中没有与所选物料质检项目匹配的数据
```

No original draft record, AI metadata, image, saved time, or task status may change. The mini-program’s existing sync error handling records the message and keeps the local record in `failed` state for correction and retry.

## Mini-program Changes

Extend `QualityInspectionDraftPayload` with optional `record_merge_mode`.

Extend draft serialization to accept a merge-mode argument defaulting to `replace`.

During synchronization:

- `sourceType=purchase_order` serializes with `matched_only`;
- `sourceType=standalone` serializes with `replace`.

Direct callers and existing tests keep `replace` unless explicitly requesting matched-only behavior.

## Compatibility

- Web saves remain full replacement because the new field defaults to `replace`.
- Standalone mini-program reports remain full replacement.
- Existing draft payloads remain valid.
- Existing response consumers that read only `data.item` remain valid.
- No database schema migration is required because the merge mode is request-only and the merged records use the existing JSON metadata structure.

## Testing

Backend tests must cover:

- canonical aliases and non-colliding labels;
- item product-type inference and OCR fallback;
- matched merge preserving formal definitions and unmatched existing rows;
- appending a new allowed matched project when no existing project exists;
- duplicate incoming rows using last-row-wins;
- ignored project statistics;
- zero-match HTTP 422 with no mutation;
- default replace behavior unchanged;
- valid image preservation semantics.

Mini-program tests must cover:

- purchase-order synchronization sends `matched_only`;
- standalone synchronization sends `replace`;
- normal draft serialization defaults to `replace`;
- zero-match 422 remains a failed local sync with the backend message.

## Non-goals

- Automatically selecting a purchase item across one task’s multiple materials.
- Rebuilding the full Web product-template engine in the mini-program.
- Fuzzy semantic or model-based matching.
- Updating task signatures, completion status, or reports.
- Changing the Web workbench’s existing draft-building logic.
