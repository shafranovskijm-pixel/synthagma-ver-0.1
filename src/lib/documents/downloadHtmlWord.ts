import { captureDocumentOutputFence } from "@/lib/documents/outputFence";
import { toast } from 'sonner';
import { htmlToDocxBlob, downloadBlob, sanitizeFileName } from '@/lib/docx/htmlToDocx';
/** A successful handoff does not confirm the browser actually saved a physical file. */
export async function downloadHtmlWord(html: string, fileName: string): Promise<boolean> {
    const current = captureDocumentOutputFence();
    try {
        current();
        const blob = await htmlToDocxBlob(html);
        current();
        downloadBlob(blob, sanitizeFileName(fileName.replace(/\.docx?$/i, ''), 'docx'));
        return true;
    }
    catch (error) {
        toast.error('Не удалось подготовить Word', { description: error instanceof Error ? error.message : 'Повторите выгрузку существующего документа' });
        return false;
    }
}
