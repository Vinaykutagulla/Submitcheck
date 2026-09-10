import mammoth from 'mammoth';

export type ExtractedManuscript = {
  title: string;
  text: string;
  sourceType: 'pdf' | 'docx' | 'txt';
  visualHtml?: string;
};

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, lines) => line || lines[index - 1])
    .join('\n')
    .trim();
}

export function extractTextFromPlainText(raw: string): string {
  return normalizeWhitespace(raw);
}

export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return normalizeWhitespace(result.value || '');
}

export async function extractVisualHtmlFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement((image) => image.read('base64').then((value) => ({
        src: `data:${image.contentType};base64,${value}`,
        alt: 'Embedded manuscript figure',
      }))),
    },
  );
  return result.value || '';
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const arrayBuffer = await file.arrayBuffer();
  const parser = new PDFParse({ data: arrayBuffer });
  try {
    const result = await parser.getText();
    return normalizeWhitespace(result.text || '');
  } finally {
    await parser.destroy();
  }
}

export async function parseUploadedManuscript(file: File): Promise<ExtractedManuscript> {
  const fileName = file.name.toLowerCase();
  const extension = fileName.split('.').pop() ?? 'txt';

  let text = '';
  let visualHtml: string | undefined;

  if (extension === 'pdf') {
    text = await extractTextFromPdf(file);
  } else if (extension === 'docx' || extension === 'doc') {
    text = await extractTextFromDocx(file);
    visualHtml = await extractVisualHtmlFromDocx(file);
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
    visualHtml,
  };
}
