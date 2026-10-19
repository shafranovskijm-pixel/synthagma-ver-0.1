import { useState, useRef, useEffect } from "react";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import type { ContentBlock } from "@/components/course-builder/block-editor";
import type { Course, Lesson } from "./types";

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UseLessonChatParams {
  contextKey: string;
  isContextCurrent: () => boolean;
  course: Course | null;
  currentLesson: Lesson | undefined;
  contentBlocks: ContentBlock[];
}

function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case 'paragraph': case 'heading1': case 'heading2': case 'quote':
      case 'callout-info': case 'callout-warning': case 'callout-tip':
        return block.content?.replace(/<[^>]*>/g, '') || '';
      case 'bulletList': case 'numberedList':
        return (block.content || '').split('\n').filter(Boolean).join('. ');
      case 'accordion':
        return `${block.accordionTitle || ''}. ${block.content || ''}`;
      case 'quiz':
        return `Вопрос: ${block.quizQuestion || ''}`;
      default:
        return '';
    }
  }).filter(Boolean).join('. ');
}

export function useLessonChat({ contextKey, isContextCurrent, course, currentLesson, contentBlocks }: UseLessonChatParams) {
  const contextRef = useRef({ key: contextKey, generation: 0 });
  const liveContextRef = useRef(isContextCurrent);
  liveContextRef.current = isContextCurrent;
  if (contextRef.current.key !== contextKey) contextRef.current = { key: contextKey, generation: contextRef.current.generation + 1 };
  const [loadedKey, setLoadedKey] = useState(contextKey);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setChatMessages([]); setChatInput(''); setIsChatLoading(false); setIsChatOpen(false); setLoadedKey(contextKey);
  }, [contextKey]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const sendChatMessage = async () => {
    const generation = contextRef.current.generation;
    const current = () => generation === contextRef.current.generation && liveContextRef.current();
    if (loadedKey !== contextKey || !current() || !chatInput.trim() || isChatLoading) return;
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    let lessonContent = '';
    if (currentLesson) {
      if (currentLesson.type === 'text' && contentBlocks.length > 0) {
        lessonContent = extractTextFromBlocks(contentBlocks);
      } else if (currentLesson.content) {
        lessonContent = currentLesson.content.replace(/<[^>]*>/g, '').substring(0, 3000);
      }
    }

    try {
      const { data, error } = await safeInvoke<{ content?: string }>('student-chat', {
        body: {
          messages: [...chatMessages, { role: 'user', content: userMessage }],
          context: { courseTitle: course?.title || '', lessonTitle: currentLesson?.title || '', lessonType: currentLesson?.type || '', lessonContent }
        }
      });
      if (!current()) return;
      if (error) throw error;
      if (data?.content) setChatMessages(prev => [...prev, { role: 'assistant', content: data.content! }]);
    } catch (error) {
      if (!current()) return;
      console.error('Chat error:', error);
      toast.error('Ошибка отправки сообщения');
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Извините, произошла ошибка. Попробуйте позже.' }]);
    } finally {
      if (current()) setIsChatLoading(false);
    }
  };

  return {
    isChatOpen: loadedKey === contextKey && isContextCurrent() && isChatOpen, setIsChatOpen,
    chatMessages: loadedKey === contextKey && isContextCurrent() ? chatMessages : [],
    chatInput: loadedKey === contextKey && isContextCurrent() ? chatInput : '', setChatInput,
    isChatLoading: loadedKey === contextKey && isContextCurrent() && isChatLoading, sendChatMessage, chatScrollRef,
  };
}
