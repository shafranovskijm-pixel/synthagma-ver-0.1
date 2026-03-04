import { getXLSX } from "./xlsxHelper";

export interface ParsedQuestion {
  question: string;
  options: string[];
}

export interface ParsedSection {
  title: string;
  questions: ParsedQuestion[];
  selected: boolean;
  customTitle: string;
}

/**
 * Parses a bulk Excel file with test questions grouped by normative document sections.
 * Structure: Section header → "Вопрос N" → question text → answer options (3-5)
 */
export async function parseExcelBulkTests(file: File): Promise<ParsedSection[]> {
  const XLSX = await getXLSX();
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
  });

  const sections: ParsedSection[] = [];
  let currentSectionTitle = "";
  let currentQuestions: ParsedQuestion[] = [];
  let currentQuestionText = "";
  let currentOptions: string[] = [];
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
      });
    }
    currentQuestionText = "";
    currentOptions = [];
  };

  const flushSection = () => {
    flushQuestion();
    if (currentSectionTitle && currentQuestions.length > 0) {
      sections.push({
        title: currentSectionTitle,
        questions: [...currentQuestions],
        selected: true,
        customTitle: currentSectionTitle,
      });
    }
    currentQuestions = [];
  };

  // Determine if a row is likely a section header:
  // - col 0 has text, doesn't match "Вопрос N"
  // - other columns (1-6) are mostly empty
  const isSectionHeader = (row: any[]): boolean => {
    const text = String(row[0] || "").trim();
    if (!text || text.length < 10) return false;
    if (isQuestionMarker(text)) return false;

    // Check if cols 1-6 are mostly empty
    let emptyCount = 0;
    for (let j = 1; j <= 6 && j < row.length; j++) {
      const val = String(row[j] || "").trim();
      if (!val || val === "+" || val === "-") emptyCount++;
    }
    return emptyCount >= Math.min(6, row.length - 1) - 1;
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const cellText = String(row[0]).trim();
    if (!cellText) continue;

    if (isQuestionMarker(cellText)) {
      const num = getQuestionNumber(cellText);

      // If question number is 1 and we need to find section header
      if (num === 1) {
        // Look backwards for section header
        flushSection();

        // Find section header: look at rows before this "Вопрос 1"
        // Check the row immediately before, or 2-3 rows before
        for (let back = i - 1; back >= Math.max(0, i - 5); back--) {
          const prevRow = data[back];
          if (!prevRow || !prevRow[0]) continue;
          const prevText = String(prevRow[0]).trim();
          if (!prevText || isQuestionMarker(prevText)) break;

          // This could be the section header or an option from previous section
          // If it's relatively long and not a short answer, it's likely a section header
          if (prevText.length > 15 && !isQuestionMarker(prevText)) {
            currentSectionTitle = prevText;
            break;
          }
        }

        // Fallback: if no section title found, use a default
        if (!currentSectionTitle) {
          currentSectionTitle = `Раздел ${sections.length + 1}`;
        }
      } else {
        flushQuestion();
      }

      state = "after_marker";
      continue;
    }

    if (state === "after_marker") {
      // This row is the question text
      currentQuestionText = cellText;
      state = "collecting_options";
      continue;
    }

    if (state === "collecting_options") {
      // Check if this might be a section header for the next section
      // (appears between questions when not preceded by "Вопрос N")
      if (isSectionHeader(row) && currentOptions.length >= 2) {
        // This is likely a section header, not an option
        // Don't consume it here; it will be picked up by the "Вопрос 1" logic
        continue;
      }

      currentOptions.push(cellText);
      continue;
    }

    // If we're idle and see a potential section header, save it
    if (state === "idle" && cellText.length > 15) {
      currentSectionTitle = cellText;
    }
  }

  // Flush remaining
  flushSection();

  return sections;
}
