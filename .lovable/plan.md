

# Fix: Parser drops answer options

## Root cause

In `isSectionHeader()` (line 104-114), the check counts columns with "+", "-" or empty as "empty". Since **every row** in the Excel file (including answer options) has "+" in columns 1-6, any option text longer than 10 characters matches `isSectionHeader() === true`.

On line 160, during `collecting_options` state, when `isSectionHeader(row) && currentOptions.length >= 2`, the row is skipped with `continue`. This means after collecting the first 2 options, all subsequent options with long text are dropped.

## Fix in `src/utils/excelTestBulkParser.ts`

**Remove the `isSectionHeader` guard from the `collecting_options` state entirely.** The question marker ("Вопрос N") and `flushQuestion`/`flushSection` already handle transitions correctly — there's no need to check for section headers while collecting options.

Lines 159-165, change from:
```typescript
if (state === "collecting_options") {
  if (isSectionHeader(row) && currentOptions.length >= 2) {
    continue;
  }
  currentOptions.push(cellText);
  continue;
}
```

To:
```typescript
if (state === "collecting_options") {
  currentOptions.push(cellText);
  continue;
}
```

This single change ensures all 3-5 answer options per question are collected properly.

## Expected result

Questions that currently have 2 options will have their full 4-5 options after re-import.

