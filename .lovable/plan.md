

# Plan: Voltage/Group filtering + visual processing UI for bulk import

## What the file contains

The Excel has 7 columns per row:
- **Col 0**: Text (section header / "Вопрос N" / question / option)
- **Col 1**: до 1000 В ("+"/empty)
- **Col 2**: до и выше 1000 В ("+"/empty)
- **Col 3**: Group II ("+"/empty)
- **Col 4**: Group III ("+"/empty)
- **Col 5**: Group IV ("+"/empty)
- **Col 6**: Group V ("+"/empty)

A "+" on the "Вопрос N" row means this question belongs to that voltage/group combination. Empty = exclude.

## How courses will be created

Instead of one course per section, each section gets split into multiple courses based on **voltage × group** combinations. For example, section "ПУЭ" with questions tagged for (до 1000 В, Group II) and (до и выше 1000 В, Group III-V) would generate separate courses:
- "ПУЭ — до 1000 В — Группа II"
- "ПУЭ — до 1000 В — Группа III"
- etc.

The user will choose which voltage + group combinations to generate in the UI.

## Changes

### 1. Update parser (`src/utils/excelTestBulkParser.ts`)

- Add `tags` field to `ParsedQuestion`: `{ voltage1000: boolean, voltageAbove1000: boolean, groupII: boolean, groupIII: boolean, groupIV: boolean, groupV: boolean }`
- Read columns 1-6 on "Вопрос N" rows to capture the "+" markers
- Expose these tags so the UI can filter questions per voltage/group

### 2. Redesign UI (`src/components/admin/BulkCourseImporter.tsx`)

**Step 1 — Upload & Parse** (with processing animation):
- Animated progress showing file parsing stages
- Stats: total sections found, total questions, tag distribution

**Step 2 — Configure Generation**:
- Voltage selector: checkboxes for "до 1000 В" and "до и выше 1000 В"
- Group selector: checkboxes for II, III, IV, V
- "Generate courses for each combination" toggle vs "One course per section with all questions"
- Preview table showing which courses will be created, how many questions each will have
- Section list with expand/collapse to see questions and their tags

**Step 3 — Create** (with visual progress):
- Animated progress bar with current course name
- Counter: "Created 5 of 24 courses"

### 3. Course naming convention

Auto-generated title pattern: `"{Section} — {Voltage} — Группа {N}"`

Example: "Правила устройства электроустановок — до 1000 В — Группа III"

User can edit titles before creation.

## Technical details

### Parser changes

```text
ParsedQuestion {
  question: string
  options: string[]
  tags: { v1000, vAbove1000, gII, gIII, gIV, gV }  // booleans from cols 1-6
}
```

On "Вопрос N" row, read cols 1-6. A cell value of "+" = true, anything else = false. These tags are then applied to the question and all its options that follow.

### UI component structure

```text
BulkCourseImporter
├── Step 1: FileUploadZone (drag-drop, processing animation)
├── Step 2: ConfigPanel
│   ├── VoltageGroupSelector (checkboxes grid matching the Excel header)
│   ├── SectionsList (expandable cards with question counts per tag)
│   └── GeneratedCoursesPreview (table of courses to be created)
└── Step 3: CreationProgress (animated, per-course status)
```

### Files to modify

1. **`src/utils/excelTestBulkParser.ts`** — Add `tags` to `ParsedQuestion`, read cols 1-6 on question marker rows
2. **`src/components/admin/BulkCourseImporter.tsx`** — Complete redesign with 3-step wizard, voltage/group selectors, visual processing feedback, and filtered course generation

No database changes needed. The same `courses` → `lessons` → `test_questions` → `marketplace_courses` creation logic is used, just with filtered question sets.

