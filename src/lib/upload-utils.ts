import mammoth from 'mammoth';

export type ExtractedManuscript = {
  title: string;
  text: string;
  sourceType: 'pdf' | 'docx' | 'txt';
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim();
}

export function extractTextFromPlainText(raw: string): string {
  return normalizeWhitespace(raw);
}

export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return normalizeWhitespace(result.value || '');
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfModule = await import('pdf-parse');
  const pdfParse = (pdfModule as any).default ?? pdfModule;
  const arrayBuffer = await file.arrayBuffer();
  const result = await pdfParse(Buffer.from(arrayBuffer));
  return normalizeWhitespace(result.text || '');
}

export async function parseUploadedManuscript(file: File): Promise<ExtractedManuscript> {
  const fileName = file.name.toLowerCase();
  const extension = fileName.split('.').pop() ?? 'txt';

  let text = '';

  if (extension === 'pdf') {
    text = await extractTextFromPdf(file);
  } else if (extension === 'docx' || extension === 'doc') {
    text = await extractTextFromDocx(file);
  } else {
    text = extractTextFromPlainText(await file.text());
  }

  const titleFromText = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^abstract|^keywords|^introduction|^methods|^results|^discussion|^references/i.test(line));

  const title = titleFromText ? titleFromText.replace(/^title\s*[:\-]?\s*/i, '') : file.name.replace(/\.[^.]+$/, '');

  return {
    title: title.slice(0, 180),
    text,
    sourceType: extension === 'pdf' ? 'pdf' : extension === 'docx' || extension === 'doc' ? 'docx' : 'txt',
  };
}
