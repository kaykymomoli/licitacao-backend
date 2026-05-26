import { Injectable, Logger } from '@nestjs/common';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

@Injectable()
export class FileExtractionService {
  private readonly logger = new Logger(FileExtractionService.name);

  // Extrai texto de um buffer PDF
  async extractFromPdf(buffer: Buffer): Promise<string> {
    try {
      const data = new Uint8Array(buffer);
      const doc = await (pdfjs as any).getDocument({ data }).promise;
      const pages: string[] = [];

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => item.str)
          .join(' ');
        pages.push(pageText);
      }

      return pages.join('\n');
    } catch (error) {
      this.logger.error(`Erro ao extrair PDF: ${error.message}`);
      throw new Error('Não foi possível extrair o texto do PDF');
    }
  }

  // Extrai texto de um buffer DOCX
  async extractFromDocx(buffer: Buffer): Promise<string> {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      this.logger.error(`Erro ao extrair DOCX: ${error.message}`);
      throw new Error('Não foi possível extrair o texto do DOCX');
    }
  }

  // Detecta o tipo e extrai o texto
  async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      return this.extractFromPdf(buffer);
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      return this.extractFromDocx(buffer);
    }

    throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
  }

  // Divide o texto em chunks para contexto do agente
  async splitIntoChunks(text: string, maxChars = 8000): Promise<string> {
    if (text.length <= maxChars) return text;

    // Se o texto for muito longo, pega as partes mais relevantes
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(text);

    // Retorna os primeiros chunks até o limite
    let result = '';
    for (const chunk of chunks) {
      if ((result + chunk).length > maxChars) break;
      result += chunk + '\n\n';
    }

    return result;
  }
}