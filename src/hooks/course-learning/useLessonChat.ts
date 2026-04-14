import { useState, useRef, useEffect } from "react";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import type { ContentBlock } from "@/components/course-builder/BlockEditor";
import type { Course, Lesson } from "./types";

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UseLessonChatParams {
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

export function useLessonChat({ course, currentLesson, contentBlocks }: UseLessonChatParams) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
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
      if (error) throw error;
      if (data?.content) setChatMessages(prev => [...prev, { role: 'assistant', content: data.content! }]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Ошибка отправки сообщения');
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Извините, произошла ошибка. Попробуйте позже.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return {
    isChatOpen, setIsChatOpen,
    chatMessages, chatInput, setChatInput,
    isChatLoading, sendChatMessage, chatScrollRef,
  };
}
