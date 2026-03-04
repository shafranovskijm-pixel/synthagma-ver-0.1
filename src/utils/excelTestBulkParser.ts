import { getXLSX } from "./xlsxHelper";

export interface QuestionTags {
  v1000: boolean;
  vAbove1000: boolean;
  gII: boolean;
  gIII: boolean;
  gIV: boolean;
  gV: boolean;
}

export interface ParsedQuestion {
  question: string;
  options: string[];
  tags: QuestionTags;
}

export interface ParsedSection {
  title: string;
  questions: ParsedQuestion[];
  selected: boolean;
  customTitle: string;
  /** True if no voltage/group tags were found – all questions belong to a single course */
  noTags?: boolean;
}

const emptyTags = (): QuestionTags => ({
  v1000: false, vAbove1000: false, gII: false, gIII: false, gIV: false, gV: false,
});

const allTags = (): QuestionTags => ({
  v1000: true, vAbove1000: true, gII: true, gIII: true, gIV: true, gV: true,
});

/**
 * Read "+" markers from columns 1-6 of a row.
 * Col 1 = до 1000 В, Col 2 = до и выше 1000 В,
 * Col 3 = II, Col 4 = III, Col 5 = IV, Col 6 = V
 */
function readTags(row: any[]): QuestionTags {
  const is = (col: number) => String(row[col] || "").trim() === "+";
  return {
    v1000: is(1),
    vAbove1000: is(2),
    gII: is(3),
    gIII: is(4),
    gIV: is(5),
    gV: is(6),
  };
}

function hasSomeTags(tags: QuestionTags): boolean {
  return tags.v1000 || tags.vAbove1000 || tags.gII || tags.gIII || tags.gIV || tags.gV;
}

/**
 * Parse a single sheet's data into sections.
 */
function parseSheetData(data: any[][]): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let currentSectionTitle = "";
  let currentQuestions: ParsedQuestion[] = [];
  let currentQuestionText = "";
  let currentOptions: string[] = [];
  let currentTags: QuestionTags = emptyTags();
  let state: "idle" | "after_marker" | "collecting_options" = "idle";

  const isQuestionMarker = (text: string) => /^Вопрос\s+\d+$/i.test(text.trim());

  const getQuestionNumber = (text: string) => {
    const m = text.trim().match(/^Вопрос\s+(\d+)$/i);
    return m ? parseInt(m[1]) : 0;
  };

  const flushQuestion = () => {
    if (currentQuestionText && currentOptions.length >= 2) {
      currentQuestions.push({
        question: currentQuestionText,
        options: [...currentOptions],
        tags: { ...currentTags },
      });
    }
    currentQuestionText = "";
    currentOptions = [];
    currentTags = emptyTags();
  };

  const flushSection = () => {
    flushQuestion();
    if (currentSectionTitle && currentQuestions.length > 0) {
      // Check if any question has tags
      const anyTagged = currentQuestions.some(q => hasSomeTags(q.tags));
      const noTags = !anyTagged;

      // If no tags found, mark all questions with allTags so they match any filter
      const finalQuestions = noTags
        ? currentQuestions.map(q => ({ ...q, tags: allTags() }))
        : currentQuestions;

      sections.push({
        title: currentSectionTitle,
        questions: [...finalQuestions],
        selected: true,
        customTitle: currentSectionTitle,
        noTags,
      });
    }
    currentQuestions = [];
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const cellText = String(row[0]).trim();
    if (!cellText) continue;

    if (isQuestionMarker(cellText)) {
      const num = getQuestionNumber(cellText);
      const tags = readTags(row);

      if (num === 1) {
        flushSection();
        // Look back for section title
        for (let back = i - 1; back >= Math.max(0, i - 5); back--) {
          const prevRow = data[back];
          if (!prevRow || !prevRow[0]) continue;
          const prevText = String(prevRow[0]).trim();
          if (!prevText || isQuestionMarker(prevText)) break;
          if (prevText.length > 15 && !isQuestionMarker(prevText)) {
            currentSectionTitle = prevText;
            break;
          }
        }
        if (!currentSectionTitle) {
          currentSectionTitle = `Раздел ${sections.length + 1}`;
        }
      } else {
        flushQuestion();
      }

      currentTags = tags;
      state = "after_marker";
      continue;
    }

    if (state === "after_marker") {
      currentQuestionText = cellText;
      state = "collecting_options";
      continue;
    }

    if (state === "collecting_options") {
      currentOptions.push(cellText);
      continue;
    }

    if (state === "idle" && cellText.length > 15) {
      currentSectionTitle = cellText;
    }
  }

  flushSection();
  return sections;
}

/**
 * Parses a bulk Excel file with test questions grouped by normative document sections.
 * Reads ALL sheets in the workbook.
 * Structure: Section header → "Вопрос N" → question text → answer options (3-5)
 * Columns 1-6 contain "+" markers for voltage/group filtering.
 * Sheets without tags create sections marked with noTags=true.
 */
export async function parseExcelBulkTests(file: File): Promise<ParsedSection[]> {
  const XLSX = await getXLSX();
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const allSections: ParsedSection[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
    });

    const sheetSections = parseSheetData(data);
    
    // Deduplicate: skip sections with same title if already present
    for (const section of sheetSections) {
      const isDuplicate = allSections.some(
        existing => existing.title === section.title && 
          Math.abs(existing.questions.length - section.questions.length) < 3
      );
      if (!isDuplicate) {
        allSections.push(section);
      }
    }
  }

  return allSections;
}
