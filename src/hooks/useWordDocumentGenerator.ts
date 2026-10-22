import { captureDocumentOutputFence } from "@/lib/documents/outputFence";
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { htmlToDocxBlob, downloadBlob } from '@/lib/docx/htmlToDocx';
import { buildWordDocument, type GeneratorOptions } from '@/lib/documents/wordDocument';
export function useWordDocumentGenerator() {
    const [isGenerating, setIsGenerating] = useState(false);
    const generating = useRef(false);
    const generateDocument = async (options: GeneratorOptions): Promise<boolean> => {
        if (generating.current)
            return false;
        if (!options.persons.length) {
            toast.error('Выберите людей для формирования документа');
            return false;
        }
        generating.current = true;
        setIsGenerating(true);
        const current = captureDocumentOutputFence();
        try {
            current();
            const document = buildWordDocument(options);
            const blob = await htmlToDocxBlob(document.html);
            current();
            downloadBlob(blob, document.fileName);
            toast.success('Подготовлен редактируемый DOCX', { description: 'Проект документа. Проверьте основания, состав комиссии и результаты перед утверждением.' });
            return true;
        }
        catch (error) {
            toast.error('Не удалось сформировать DOCX', { description: error instanceof Error ? error.message : 'Повторите выгрузку' });
            return false;
        }
        finally {
            generating.current = false;
            setIsGenerating(false);
        }
    };
    return { generateDocument, isGenerating };
}
