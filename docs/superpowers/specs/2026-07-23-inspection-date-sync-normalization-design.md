# Inspection Date Sync Normalization Design

**Date:** 2026-07-23

## Problem

A locally recognized standalone inspection cannot be synchronized when OCR returns a human-readable date such as `2016.6.24`. The mini-program currently checks only that `inspectionDate` is non-empty and sends the value unchanged. The backend standalone creation schema uses a strict date type and therefore returns HTTP 422.

The confirmed simulator record contains:

- `inspectionDate`: `2016.6.24`
- sync error: `Input should be a valid date or datetime, input is too short`

## Scope

Normalize inspection dates in the mini-program before data crosses the backend API boundary. Existing failed local records must become retryable without deletion or manual re-entry.

Supported input forms:

- ISO: `YYYY-MM-DD`
- Dotted: `YYYY.M.D`
- Slashed: `YYYY/M/D`
- Chinese: `YYYY年M月D日`

All supported forms are converted to zero-padded `YYYY-MM-DD`. Invalid calendar dates and unsupported formats are rejected locally with a readable validation error.

## Design

Add a pure date-normalization helper in the inspection-record domain. It will:

1. trim whitespace;
2. match only the supported full-string formats;
3. parse year, month, and day numerically;
4. validate the calendar date without relying on permissive `Date.parse` behavior;
5. return `YYYY-MM-DD` or an empty result when invalid.

Use the helper at both outbound persistence boundaries:

- standalone task creation payload;
- inspection draft metadata.

Update record validation so a non-empty but invalid date reports `检验日期格式（YYYY-MM-DD）`. This prevents new invalid submissions while outbound normalization allows existing dotted/slashed/Chinese-form local records to retry successfully.

The local display value is not rewritten as part of synchronization. This avoids an unrelated storage migration while guaranteeing database-facing values are canonical.

## Error Handling

If the date cannot be normalized, synchronization must fail locally before issuing the standalone POST, using a Chinese message that explains the required format. The existing sync state machinery will preserve this message on the local history record.

## Tests

Regression tests will prove that:

1. dotted, slashed, Chinese, and ISO dates normalize to `YYYY-MM-DD`;
2. impossible dates such as `2026-02-30` are rejected;
3. standalone creation sends the normalized date;
4. draft serialization stores the normalized date;
5. record validation reports an invalid non-empty date.

## Non-goals

- Changing the backend schema to accept arbitrary date strings.
- Migrating or rewriting all saved local history records.
- Changing OCR confidence behavior or unrelated recognition fields.
