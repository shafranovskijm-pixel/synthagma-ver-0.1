import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as mammoth from "https://esm.sh/mammoth@1.6.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Limits
const MAX_FILES_PER_REQUEST = 50; // Increased for ZIP support
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file (for ZIP)
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

// Supported file extensions for content extraction
const SUPPORTED_EXTENSIONS = ['.docx', '.doc', '.txt', '.html', '.htm', '.md'];

// Convert plain text to HTML paragraphs
function txtToHtml(text: string): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/\"/g, '&quot;')
     .replace(/'/g, '&#039;');

  const parts = text.split(/\n\s*\n/).filter(p => p.trim());
  return parts.map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('\n');
}

// Split HTML content into sections based on headings or paragraph count
function splitIntoSections(sourceHtml: string, maxChars: number = 8000): Array<{title: string, html: string}> {
  // Check for headings h1-h3
  const headingRegex = /<h[1-3][^>]*>/i;

  if (headingRegex.test(sourceHtml)) {
    // Split by headings
    const chunks = sourceHtml.split(/(?=<h[1-3][^>]*>)/i).filter(c => c.trim());
    const sections: Array<{title: string, html: string}> = [];
    let buffer = '';
    let title: string | null = null;

    const flush = () => {
      if (buffer.trim()) {
        sections.push({ title: title || 'Раздел', html: buffer });
      }
      buffer = '';
      title = null;
    };

    for (const chunk of chunks) {
      const match = chunk.match(/<h([1-3])[^>]*>(.*?)<\/h\1>/is);
      if (match && buffer.trim()) {
        flush();
      }
      if (match) {
        const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
        title = rawTitle || 'Раздел';
        buffer += chunk;
      } else {
        buffer += chunk;
      }

      // Check text length without tags
      const textLength = buffer.replace(/<[^>]+>/g, '').length;
      if (textLength > maxChars * 1.6) {
        flush();
      }
    }
    flush();
    return sections;
  }

  // No headings - split by paragraphs
  const paras = sourceHtml.split(/(?<=<\/p>)/i).filter(p => p.trim());
  const sections: Array<{title: string, html: string}> = [];
  let buffer = '';
  let idx = 1;

  for (const p of paras) {
    const combinedLength = (buffer + p).replace(/<[^>]+>/g, '').length;
    if (combinedLength > maxChars && buffer.trim()) {
      sections.push({ title: `Раздел ${idx}`, html: buffer });
      idx++;
      buffer = p;
    } else {
      buffer += p;
    }
  }

  if (buffer.trim()) {
    sections.push({ title: `Раздел ${idx}`, html: buffer });
  }

  return sections;
}

// Parse DOCX using mammoth (preserves styles, tables, images)
async function parseDocxWithMammoth(buffer: ArrayBuffer): Promise<string> {
  try {
    console.log('Parsing DOCX with mammoth, buffer size:', buffer.byteLength);

    // Convert image to base64 inline
    const convertImage = mammoth.images.imgElement((image: any) => {
      return image.read("base64").then((imageData: string) => {
        const contentType = image.contentType || 'image/png';
        return {
          src: `data:${contentType};base64,${imageData}`
        };
      });
    });

    const result = await mammoth.convertToHtml(
      { arrayBuffer: buffer },
      {
        convertImage: convertImage,
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Заголовок 1'] => h1:fresh",
          "p[style-name='Заголовок 2'] => h2:fresh",
          "p[style-name='Заголовок 3'] => h3:fresh",
          "b => strong",
          "i => em",
          "u => u",
        ]
      }
    );

    let html = (result.value || '').trim();

    // Add classes to tables for styling
    html = html.replace(/<table>/g, '<table class="min-w-full text-sm border border-border">');
    html = html.replace(/<td>/g, '<td class="border border-border px-3 py-2">');
    html = html.replace(/<th>/g, '<th class="border border-border px-3 py-2 bg-muted font-semibold">');

    // Add classes to images
    html = html.replace(/<img([^>]+)>/g, '<img$1 class="rounded-lg max-w-full my-3">');

    console.log('Mammoth conversion complete, messages:', result.messages);

    return html;
  } catch (e) {
    console.error('Mammoth parse error:', e);
    throw new Error('Не удалось распарсить DOCX файл: ' + (e as Error).message);
  }
}

// Fallback DOCX parser using JSZip
async function parseDocxFallback(buffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('string');

    if (!docXml) {
      throw new Error('Не найден document.xml в DOCX');
    }

    // Extract text content and basic formatting
    let html = '';

    // Process paragraphs
    const paragraphs = docXml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/g) || [];

    for (const para of paragraphs) {
      // Check for heading style
      const styleMatch = para.match(/<w:pStyle w:val="([^"]+)"/);
      const style = styleMatch ? styleMatch[1] : '';

      // Extract text runs
      const runs = para.match(/<w:r[^>]*>[\s\S]*?<\/w:r>/g) || [];
      let paraContent = '';

      for (const run of runs) {
        const textMatches = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        for (const t of textMatches) {
          const textMatch = t.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
          if (textMatch) {
            let text = textMatch[1];

            // Check for bold
            if (run.includes('<w:b') || run.includes('<w:b/>')) {
              text = `<strong>${text}</strong>`;
            }
            // Check for italic
            if (run.includes('<w:i') || run.includes('<w:i/>')) {
              text = `<em>${text}</em>`;
            }

            paraContent += text;
          }
        }
      }

      if (paraContent.trim()) {
        // Determine tag based on style
        if (style.includes('Heading1') || style.includes('Заголовок1') || style === 'Title') {
          html += `<h1>${paraContent}</h1>\n`;
        } else if (style.includes('Heading2') || style.includes('Заголовок2')) {
          html += `<h2>${paraContent}</h2>\n`;
        } else if (style.includes('Heading3') || style.includes('Заголовок3')) {
          html += `<h3>${paraContent}</h3>\n`;
        } else {
          html += `<p>${paraContent}</p>\n`;
        }
      }
    }

    return html;
  } catch (e) {
    console.error('JSZip fallback error:', e);
    throw e;
  }
}

// Process single file and return its content
async function processFile(file: File): Promise<{ title: string; html: string; fileName: string; folderPath?: string }> {
  const fileName = file.name.toLowerCase();
  let sourceHtml = '';
  let courseTitle = file.name.replace(/\.[^.]+$/, '');

  console.log(`Processing file: ${fileName}, size: ${file.size}`);

  if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    const text = await file.text();
    sourceHtml = txtToHtml(text);
  } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
    let html = await file.text();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) html = bodyMatch[1];
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) courseTitle = titleMatch[1].trim() || courseTitle;
    sourceHtml = html;
  } else if (fileName.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();
    try {
      sourceHtml = await parseDocxWithMammoth(buffer);
    } catch (mammothError) {
      console.log('Mammoth failed, trying fallback:', mammothError);
      sourceHtml = await parseDocxFallback(buffer);
    }
  } else if (fileName.endsWith('.doc')) {
    const text = await file.text();
    const cleanText = text.replace(/[^\\x20-\\x7E\\u0400-\\u04FF\n\r\t]/g, ' ').replace(/\s+/g, ' ');
    sourceHtml = txtToHtml(cleanText);
  } else {
    throw new Error(`Неподдерживаемый формат: ${file.name}`);
  }

  return { title: courseTitle, html: sourceHtml, fileName: file.name };
}

// Process file from ZIP buffer
async function processZipEntry(
  fileName: string, 
  content: ArrayBuffer | string,
  folderPath: string
): Promise<{ title: string; html: string; fileName: string; folderPath: string }> {
  const lowerName = fileName.toLowerCase();
  let sourceHtml = '';
  let title = fileName.replace(/\.[^.]+$/, '');

  console.log(`Processing ZIP entry: ${folderPath}/${fileName}`);

  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    sourceHtml = txtToHtml(text);
  } else if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
    let html = typeof content === 'string' ? content : new TextDecoder().decode(content);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) html = bodyMatch[1];
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim() || title;
    sourceHtml = html;
  } else if (lowerName.endsWith('.docx')) {
    const buffer = content instanceof ArrayBuffer ? content : new TextEncoder().encode(content as string).buffer;
    try {
      sourceHtml = await parseDocxWithMammoth(buffer);
    } catch (mammothError) {
      console.log('Mammoth failed for ZIP entry, trying fallback:', mammothError);
      sourceHtml = await parseDocxFallback(buffer);
    }
  } else if (lowerName.endsWith('.doc')) {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    const cleanText = text.replace(/[^\x20-\x7E\u0400-\u04FF\n\r\t]/g, ' ').replace(/\s+/g, ' ');
    sourceHtml = txtToHtml(cleanText);
  }

  return { title, html: sourceHtml, fileName, folderPath };
}

// Extract and process ZIP archive
async function processZipArchive(file: File): Promise<Array<{ title: string; html: string; fileName: string; folderPath: string }>> {
  console.log('Processing ZIP archive:', file.name);
  
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  
  const results: Array<{ title: string; html: string; fileName: string; folderPath: string }> = [];
  const entries: Array<{ path: string; file: any }> = [];
  
  // Collect all supported files from ZIP
  zip.forEach((relativePath: string, zipEntry: any) => {
    if (zipEntry.dir) return;
    
    // Skip hidden files and system files
    if (relativePath.startsWith('__MACOSX') || relativePath.startsWith('.')) return;
    
    const fileName = relativePath.split('/').pop() || '';
    if (fileName.startsWith('.')) return;
    
    // Check if file extension is supported
    const ext = '.' + fileName.split('.').pop()?.toLowerCase();
    if (SUPPORTED_EXTENSIONS.includes(ext)) {
      entries.push({ path: relativePath, file: zipEntry });
    }
  });
  
  console.log(`Found ${entries.length} supported files in ZIP`);
  
  // Sort entries by path for consistent ordering
  entries.sort((a, b) => a.path.localeCompare(b.path, 'ru'));
  
  // Process entries sequentially to avoid memory issues
  for (const entry of entries) {
    try {
      const fileName = entry.path.split('/').pop() || '';
      const folderPath = entry.path.split('/').slice(0, -1).join('/');
      
      // Get file content
      const ext = '.' + fileName.split('.').pop()?.toLowerCase();
      let content: ArrayBuffer | string;
      
      if (ext === '.docx') {
        content = await entry.file.async('arraybuffer');
      } else {
        content = await entry.file.async('string');
      }
      
      const result = await processZipEntry(fileName, content, folderPath);
      if (result.html.trim()) {
        results.push(result);
      }
    } catch (e) {
      console.error(`Error processing ZIP entry ${entry.path}:`, e);
    }
  }
  
  return results;
}

// Analyze content structure to suggest optimal organization
function analyzeContentStructure(files: Array<{ title: string; html: string; fileName: string }>) {
  const analysis = files.map(file => {
    const text = file.html.replace(/<[^>]+>/g, '');
    const wordCount = text.split(/\s+/).filter(w => w).length;
    const hasHeadings = /<h[1-3][^>]*>/i.test(file.html);
    const headingCount = (file.html.match(/<h[1-3][^>]*>/gi) || []).length;
    const hasTables = /<table/i.test(file.html);
    const hasImages = /<img/i.test(file.html);
    const hasLists = /<[ou]l/i.test(file.html);

    // Detect content type
    let contentType: 'lecture' | 'reference' | 'summary' | 'mixed' = 'mixed';
    if (wordCount > 2000 && hasHeadings) contentType = 'lecture';
    else if (hasTables && wordCount < 1000) contentType = 'reference';
    else if (wordCount < 500) contentType = 'summary';

    return {
      ...file,
      wordCount,
      hasHeadings,
      headingCount,
      hasTables,
      hasImages,
      hasLists,
      contentType,
    };
  });

  // Sort by: lectures first, then by heading count, then alphabetically
  analysis.sort((a, b) => {
    const typeOrder = { lecture: 0, mixed: 1, reference: 2, summary: 3 };
    if (typeOrder[a.contentType] !== typeOrder[b.contentType]) {
      return typeOrder[a.contentType] - typeOrder[b.contentType];
    }
    // Try to detect numbering in file names
    const numA = a.fileName.match(/(\d+)/)?.[1];
    const numB = b.fileName.match(/(\d+)/)?.[1];
    if (numA && numB) return parseInt(numA) - parseInt(numB);
    return a.title.localeCompare(b.title, 'ru');
  });

  return analysis;
}

// Find common prefix in array of strings
function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];

  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === '') return '';
    }
  }
  // Clean up trailing numbers/punctuation
  return prefix.replace(/[\s\d._-]+$/, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log('Missing authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Требуется авторизация' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user and check role
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.log('Invalid authentication:', authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Неверная авторизация' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has organization or admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData) {
      console.log('Failed to get user role:', roleError?.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Не удалось проверить роль пользователя' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (roleData.role !== 'organization' && roleData.role !== 'admin') {
      console.log('User does not have required role:', roleData.role);
      return new Response(
        JSON.stringify({ success: false, error: 'Недостаточно прав для импорта курсов' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User ${user.id} (${roleData.role}) authenticated for course import`);

    const contentType = req.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Ожидается multipart/form-data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const formData = await req.formData();

    // Collect all files with size validation
    const files: File[] = [];
    let totalSize = 0;

    for (const [key, value] of formData.entries()) {
      if (value instanceof File && value.size > 0) {
        // Check individual file size
        if (value.size > MAX_FILE_SIZE) {
          console.log(`File ${value.name} exceeds size limit: ${value.size} bytes`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Файл "${value.name}" превышает лимит 50МБ (${(value.size / 1024 / 1024).toFixed(1)}МБ)`
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        totalSize += value.size;

        // Check total size limit
        if (totalSize > MAX_TOTAL_SIZE) {
          console.log(`Total upload size exceeds limit: ${totalSize} bytes`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Общий размер файлов превышает лимит 50МБ`
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        files.push(value);
      }
    }

    if (files.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Файлы не загружены' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Files validated: ${files.length} files, total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

    // Check if first file is a ZIP archive
    const firstFile = files[0];
    const isZipArchive = firstFile.name.toLowerCase().endsWith('.zip');
    
    let processedFiles: Array<{ title: string; html: string; fileName: string; folderPath?: string }> = [];
    let folderStructure: Array<{ name: string; files: string[] }> = [];

    if (isZipArchive) {
      console.log('Processing as ZIP archive');
      
      try {
        const zipResults = await processZipArchive(firstFile);
        processedFiles = zipResults;
        
        // Build folder structure for response
        const folderMap = new Map<string, string[]>();
        for (const result of zipResults) {
          const folder = result.folderPath || 'Корень';
          if (!folderMap.has(folder)) {
            folderMap.set(folder, []);
          }
          folderMap.get(folder)!.push(result.fileName);
        }
        
        folderStructure = Array.from(folderMap.entries()).map(([name, files]) => ({
          name,
          files
        }));
        
      } catch (e) {
        console.error('ZIP processing error:', e);
        return new Response(
          JSON.stringify({ success: false, error: 'Не удалось распаковать ZIP-архив: ' + (e as Error).message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Process regular files
      console.log(`Processing ${files.length} regular files`);

      if (files.length > MAX_FILES_PER_REQUEST) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Слишком много файлов за раз (${files.length}). Загрузите максимум ${MAX_FILES_PER_REQUEST} файлов за один импорт.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      for (const file of files) {
        try {
          const result = await processFile(file);
          processedFiles.push(result);
          console.log(`Completed: ${file.name}`);
        } catch (e) {
          console.error(`Error processing ${file.name}:`, e);
        }
      }
    }

    // Filter out empty results
    const validFiles = processedFiles.filter(f => f && f.html.trim());

    if (validFiles.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Не удалось обработать ни один файл' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Analyze and organize content structure
    const analyzedFiles = analyzeContentStructure(validFiles);

    // Create lessons - 1 file = 1 lesson
    const lessons = analyzedFiles.map((file, index) => ({
      id: crypto.randomUUID(),
      type: 'text',
      title: file.title,
      content: file.html,
      order_index: index,
      metadata: {
        wordCount: file.wordCount,
        contentType: file.contentType,
        hasHeadings: file.hasHeadings,
        hasTables: file.hasTables,
        hasImages: file.hasImages,
        fileName: file.fileName,
        folderPath: (file as any).folderPath,
      },
    }));

    // Suggest course title
    let suggestedCourseTitle = '';
    
    // For ZIP: try to use archive name
    if (isZipArchive) {
      suggestedCourseTitle = firstFile.name.replace(/\.zip$/i, '');
    } else if (lessons.length > 1) {
      // Try to find common prefix in file names
      const titles = analyzedFiles.map(f => f.title);
      const prefix = findCommonPrefix(titles);
      if (prefix.length > 3) {
        suggestedCourseTitle = prefix.trim();
      }
    }
    
    if (!suggestedCourseTitle && lessons.length > 0) {
      suggestedCourseTitle = lessons[0].title;
    }

    console.log(`Processed ${lessons.length} lessons from ${isZipArchive ? 'ZIP archive' : files.length + ' files'}`);

    return new Response(
      JSON.stringify({
        success: true,
        courseTitle: suggestedCourseTitle,
        lessons,
        filesCount: isZipArchive ? validFiles.length : files.length,
        sectionsCount: lessons.length,
        folderStructure: folderStructure.length > 0 ? folderStructure : undefined,
        analysis: analyzedFiles.map(f => ({
          fileName: f.fileName,
          title: f.title,
          wordCount: f.wordCount,
          contentType: f.contentType,
          folderPath: (f as any).folderPath,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Ошибка обработки файла'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
