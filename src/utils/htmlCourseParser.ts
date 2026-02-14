/**
 * Parses HTML course files (like Синтагма standalone courses) into lessons.
 * Extracts: text sections, embedded videos, and final tests with questions.
 */

import { type LessonType, type TestQuestionLocal } from "@/components/course-builder/LessonTypeConfig";
import { htmlToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";

export interface ParsedLesson {
  id: string;
  type: LessonType;
  title: string;
  content: string;
  blocks?: any[];
  questions?: TestQuestionLocal[];
  testPassingScore?: number;
}

export interface ParsedCourse {
  title: string;
  description: string;
  lessons: ParsedLesson[];
}

export function isHtmlContent(text: string): boolean {
  return /<!DOCTYPE\s+html|<html[\s>]/i.test(text.slice(0, 500));
}

export function parseHtmlCourse(html: string): ParsedCourse {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Extract course title
  const h1 = doc.querySelector("h1");
  const titleTag = doc.querySelector("title");
  let courseTitle = h1?.textContent?.trim() || titleTag?.textContent?.trim() || "Импортированный курс";
  // Clean up title prefixes like "СИНТАГМА · "
  courseTitle = courseTitle.replace(/^[^·]*·\s*/, "").trim();

  // Extract description
  const descP = h1?.parentElement?.querySelector("p");
  const description = descP?.textContent?.trim() || "";

  const lessons: ParsedLesson[] = [];

  // 1. Extract text sections (articles with id="sectionN")
  const articles = doc.querySelectorAll("article[id]");
  articles.forEach((article) => {
    const articleId = article.getAttribute("id") || "";
    
    // Skip final test — handle separately
    if (articleId === "final-test" || articleId === "mini-tests") return;

    const h2 = article.querySelector("h2");
    if (!h2) return;

    const title = h2.textContent?.trim() || "Раздел";

    // Check for embedded videos in this section
    const iframes = article.querySelectorAll("iframe");
    
    // Build text content (excluding quiz forms and checkboxes)
    const contentClone = article.cloneNode(true) as HTMLElement;
    // Remove decorative elements
    contentClone.querySelectorAll(".aura, form, label:has(input[type='checkbox'][data-done])").forEach(el => el.remove());
    contentClone.querySelectorAll("button").forEach(el => el.remove());
    contentClone.querySelectorAll("[id^='result']").forEach(el => el.remove());
    
    // Extract inline quiz questions from the section
    const quizForms = article.querySelectorAll("form[id]");
    
    // Build clean HTML content
    const cleanContent = contentClone.innerHTML
      .replace(/<div class="aura[^"]*"><\/div>/g, "")
      .replace(/class="[^"]*"/g, "")
      .trim();

    // Create text lesson
    const blocks = htmlToBlocks(cleanContent);
    lessons.push({
      id: crypto.randomUUID(),
      type: "text",
      title,
      content: blocksToJson(blocks),
      blocks,
    });

    // Create separate video lessons for each iframe
    iframes.forEach((iframe) => {
      const src = iframe.getAttribute("src") || "";
      const videoTitle = iframe.getAttribute("title") || `Видео: ${title}`;
      if (src) {
        lessons.push({
          id: crypto.randomUUID(),
          type: "video",
          title: videoTitle,
          content: src,
        });
      }
    });
  });

  // 2. Extract standalone video (outside articles, in the header area)
  const headerIframes = doc.querySelectorAll("section:first-of-type iframe, header iframe");
  headerIframes.forEach((iframe) => {
    const src = iframe.getAttribute("src") || "";
    const videoTitle = iframe.getAttribute("title") || "Видеолекция";
    if (src) {
      lessons.splice(0, 0, {
        id: crypto.randomUUID(),
        type: "video",
        title: videoTitle,
        content: src,
      });
    }
  });

  // 3. Extract mini-tests article
  const miniTestsArticle = doc.querySelector("article#mini-tests");
  if (miniTestsArticle) {
    const miniQuizForms = miniTestsArticle.querySelectorAll("form[id]");
    if (miniQuizForms.length > 0) {
      const allMiniQuestions: TestQuestionLocal[] = [];
      miniQuizForms.forEach((form) => {
        const questions = extractQuestionsFromForm(form, doc);
        allMiniQuestions.push(...questions);
      });
      if (allMiniQuestions.length > 0) {
        lessons.push({
          id: crypto.randomUUID(),
          type: "test",
          title: "Мини-тесты по темам",
          content: "",
          questions: allMiniQuestions,
          testPassingScore: 60,
        });
      }
    }
  }

  // 4. Extract final test
  const finalTestArticle = doc.querySelector("article#final-test");
  if (finalTestArticle) {
    const finalForm = finalTestArticle.querySelector("form#finalQuiz");
    if (finalForm) {
      // Try to find correct answers from the script
      const correctAnswers = extractCorrectAnswersFromScript(doc);
      const questions = extractFinalTestQuestions(finalForm, correctAnswers);
      
      if (questions.length > 0) {
        // Extract passing score from the article text
        const articleText = finalTestArticle.textContent || "";
        const scoreMatch = articleText.match(/(\d+)\s*\/\s*(\d+)/);
        const passingScore = scoreMatch 
          ? Math.round((parseInt(scoreMatch[1]) / parseInt(scoreMatch[2])) * 100) 
          : 60;

        lessons.push({
          id: crypto.randomUUID(),
          type: "test",
          title: "Финальный тест по курсу",
          content: "",
          questions,
          testPassingScore: passingScore,
        });
      }
    }
  }

  // 5. Also extract inline quizzes from text sections
  articles.forEach((article) => {
    const articleId = article.getAttribute("id") || "";
    if (articleId === "final-test" || articleId === "mini-tests" || articleId === "materials") return;
    
    const quizForms = article.querySelectorAll("form[id]");
    if (quizForms.length === 0) return;

    const questions: TestQuestionLocal[] = [];
    quizForms.forEach((form) => {
      const extracted = extractQuestionsFromForm(form, doc);
      questions.push(...extracted);
    });

    if (questions.length > 0) {
      const h2 = article.querySelector("h2");
      const sectionTitle = h2?.textContent?.trim() || "Раздел";
      lessons.push({
        id: crypto.randomUUID(),
        type: "test",
        title: `Тест: ${sectionTitle}`,
        content: "",
        questions,
        testPassingScore: 60,
      });
    }
  });

  return { title: courseTitle, description, lessons };
}

function extractQuestionsFromForm(form: Element, doc: Document): TestQuestionLocal[] {
  const questions: TestQuestionLocal[] = [];
  const formId = form.getAttribute("id") || "";
  
  // Find correct answers from inline script checkMini or checkQuizN calls
  const correctAnswers = extractQuizAnswersFromScript(doc, formId);
  
  // Parse questions from the form
  const questionTexts = form.querySelectorAll("p");
  let currentQuestion = "";
  let currentOptions: { text: string }[] = [];
  let currentName = "";
  let qIndex = 0;

  const flushQuestion = () => {
    if (currentQuestion && currentOptions.length > 0) {
      const correctValue = correctAnswers[currentName];
      const correctIndex = correctValue 
        ? currentOptions.findIndex((_, i) => String.fromCharCode(97 + i) === correctValue)
        : 0;
      
      questions.push({
        id: crypto.randomUUID(),
        question: currentQuestion,
        options: currentOptions,
        correct_answer: correctIndex >= 0 ? correctIndex : 0,
        order_index: qIndex++,
        explanation: "",
        image_url: null,
        isNew: true,
        isDeleted: false,
      });
    }
    currentQuestion = "";
    currentOptions = [];
    currentName = "";
  };

  // Walk through form children
  const walker = form.querySelectorAll("p, label");
  walker.forEach((el) => {
    if (el.tagName === "P") {
      flushQuestion();
      currentQuestion = el.textContent?.trim().replace(/^\d+[\.\)]\s*/, "") || "";
    } else if (el.tagName === "LABEL") {
      const input = el.querySelector("input[type='radio']");
      if (input) {
        const name = input.getAttribute("name") || "";
        if (!currentName) currentName = name;
        const text = el.textContent?.trim().replace(/^[a-zа-яA-ZА-Я][\)\.]\s*/, "") || "";
        currentOptions.push({ text });
      }
    }
  });
  flushQuestion();

  return questions;
}

function extractFinalTestQuestions(form: Element, correctAnswers: Record<string, string>): TestQuestionLocal[] {
  const questions: TestQuestionLocal[] = [];
  const listItems = form.querySelectorAll("ol > li");

  listItems.forEach((li, index) => {
    // Get question text (first text node before labels)
    const fullText = li.childNodes[0]?.textContent?.trim() || "";
    const questionText = fullText.replace(/<br\s*\/?>/, "").trim();

    const labels = li.querySelectorAll("label");
    const options: { text: string }[] = [];
    let correctIndex = 0;

    labels.forEach((label, i) => {
      const input = label.querySelector("input[type='radio']");
      const name = input?.getAttribute("name") || "";
      const value = input?.getAttribute("value") || "";
      let text = label.textContent?.trim().replace(/^[a-zа-яA-ZА-Я][\)\.]\s*/, "") || "";
      options.push({ text });

      if (correctAnswers[name] === value) {
        correctIndex = i;
      }
    });

    if (questionText && options.length > 0) {
      questions.push({
        id: crypto.randomUUID(),
        question: questionText,
        options,
        correct_answer: correctIndex,
        order_index: index,
        explanation: "",
        image_url: null,
        isNew: true,
        isDeleted: false,
      });
    }
  });

  return questions;
}

function extractCorrectAnswersFromScript(doc: Document): Record<string, string> {
  const scripts = doc.querySelectorAll("script");
  const answers: Record<string, string> = {};

  for (const script of scripts) {
    const text = script.textContent || "";
    // Match: correctAnswers = { f1:'a', f2:'b', ... }
    const match = text.match(/correctAnswers\s*=\s*\{([^}]+)\}/);
    if (match) {
      const pairs = match[1].matchAll(/(\w+)\s*:\s*['"](\w+)['"]/g);
      for (const p of pairs) {
        answers[p[1]] = p[2];
      }
    }
    // Also match: const answers = { ... } or var answers = { ... }
    const match2 = text.match(/(?:const|var|let)\s+answers\s*=\s*\{([^}]+)\}/);
    if (match2) {
      const pairs = match2[1].matchAll(/(\w+)\s*:\s*['"](\w+)['"]/g);
      for (const p of pairs) {
        answers[p[1]] = p[2];
      }
    }
  }
  return answers;
}

function extractQuizAnswersFromScript(doc: Document, formId: string): Record<string, string> {
  const scripts = doc.querySelectorAll("script");
  const answers: Record<string, string> = {};

  for (const script of scripts) {
    const text = script.textContent || "";
    
    // Match checkMini('formId','resultId',{q1_1:'a',q1_2:'b'})
    const miniMatch = text.match(new RegExp(`checkMini\\s*\\(\\s*['"]${formId}['"]\\s*,\\s*['"][^'"]+['"]\\s*,\\s*\\{([^}]+)\\}`));
    if (miniMatch) {
      const pairs = miniMatch[1].matchAll(/([\w]+)\s*:\s*['"](\w+)['"]/g);
      for (const p of pairs) {
        answers[p[1]] = p[2];
      }
    }
    
    // Match checkQuizN function with individual checks like value==='a'
    const funcName = formId.replace("quiz", "checkQuiz");
    const funcRegex = new RegExp(`${funcName}\\s*=?\\s*function[^{]*\\{([\\s\\S]*?)\\}`, "m");
    const funcMatch = text.match(funcRegex);
    if (funcMatch) {
      const body = funcMatch[1];
      const checks = body.matchAll(/name="(\w+)"[^)]*\)(?:\?\.value)?===?['"](\w+)['"]/g);
      for (const c of checks) {
        answers[c[1]] = c[2];
      }
    }
    
    // Also try: querySelector('input[name="q2_1"]:checked')?.value==='a'
    const valueChecks = text.matchAll(/\[name="(\w+)"\]:checked\S*?\.value\s*===?\s*['"](\w+)['"]/g);
    for (const vc of valueChecks) {
      answers[vc[1]] = vc[2];
    }
  }
  return answers;
}
