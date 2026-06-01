import {
  Controller,
  Post,
  UseGuards,
  Req,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { StorageService } from './storage.service';
import { FileExtractionService } from './file-extraction.service';
import { MemoryService } from '../agent/memory.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(
    private storageService: StorageService,
    private fileExtraction: FileExtractionService,
    private memoryService: MemoryService,
    private supabase: SupabaseService,
  ) {}

  @Post('file')
  async uploadFile(
    @Req() req: any,
    @CurrentUser() user: AuthUser,
  ) {
    // Ler o arquivo do multipart
    const data = await req.file();

    if (!data) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];

    if (!allowedTypes.includes(data.mimetype)) {
      throw new BadRequestException('Apenas arquivos PDF e DOCX são aceitos');
    }

    // Converter para buffer
    const buffer = await data.toBuffer();

    // Salvar no Storage
    const { path, url } = await this.storageService.uploadFile(
      user.id,
      data.filename,
      buffer,
      data.mimetype,
    );

    // Extrair texto
    const text = await this.fileExtraction.extractText(buffer, data.mimetype);
    const truncatedText = await this.fileExtraction.splitIntoChunks(text);

    return {
      fileName: data.filename,
      fileUrl: url,
      filePath: path,
      extractedText: truncatedText,
      charCount: text.length,
    };
  }

      @Post('file/analyze')
  async uploadAndAnalyze(
    @Req() req: any,
    @CurrentUser() user: AuthUser,
  ) {
    let fileBuffer: Buffer | null = null;
    let fileMimetype = '';
    let fileFilename = '';
    let sessionId = '';
    let instruction = '';

    try {
      // Consumir todos os campos antes de processar
      const chunks: any[] = [];

      await new Promise<void>((resolve, reject) => {
        req.raw.on('data', (chunk: any) => chunks.push(chunk));
        req.raw.on('end', resolve);
        req.raw.on('error', reject);
      });

      const rawBody = Buffer.concat(chunks);
      const boundary = req.headers['content-type']?.split('boundary=')[1];

      if (!boundary) throw new Error('Boundary não encontrado');

      // Parse manual do multipart
      const parts = rawBody
        .toString('binary')
        .split(`--${boundary}`)
        .filter(p => p.includes('Content-Disposition'));

      for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;

        const headers = part.substring(0, headerEnd);
        const body = part.substring(headerEnd + 4).replace(/\r\n$/, '');

        if (headers.includes('filename=')) {
          const filenameMatch = headers.match(/filename="([^"]+)"/);
          const typeMatch = headers.match(/Content-Type: ([^\r\n]+)/);
          fileFilename = filenameMatch?.[1] ?? 'arquivo';
          fileMimetype = typeMatch?.[1]?.trim() ?? '';
          fileBuffer = Buffer.from(body, 'binary');
        } else {
          const nameMatch = headers.match(/name="([^"]+)"/);
          const fieldName = nameMatch?.[1] ?? '';
          const value = body.trim();
          if (fieldName === 'sessionId') sessionId = value;
          if (fieldName === 'instruction') instruction = value;
        }
      }
    } catch (error) {
      throw new BadRequestException(`Erro ao processar multipart: ${error.message}`);
    }

    if (!fileBuffer || !fileFilename) {
      throw new BadRequestException('Nenhum arquivo encontrado no request');
    }

    // Extrair texto
    const text = await this.fileExtraction.extractText(fileBuffer, fileMimetype);
    const truncatedText = await this.fileExtraction.splitIntoChunks(text);

    // Salvar no Storage
    const { url } = await this.storageService.uploadFile(
      user.id,
      fileFilename,
      fileBuffer,
      fileMimetype,
    );

    // Injetar contexto na sessão
    if (sessionId) {
      const currentState = await this.memoryService.loadAgentState(sessionId);

      const updatedState = {
        ...(currentState ?? {}),
        uploadedFileContext: truncatedText,
        uploadedFileName: fileFilename,
        uploadedFileUrl: url,
      };

      await this.memoryService.saveAgentState(sessionId, updatedState);
      await this.memoryService.saveMessage(
        sessionId,
        'assistant',
        `📎 Arquivo **${fileFilename}** recebido e analisado com sucesso.\n\n` +
        `O conteúdo foi extraído e está disponível como contexto.\n\n` +
        (instruction ? `Instrução: "${instruction}"` : 'Pode continuar a conversa normalmente.'),
      );
    }

    return {
      fileName: fileFilename,
      fileUrl: url,
      extractedText: truncatedText,
      charCount: text.length,
      sessionId: sessionId || null,
      message: `Arquivo ${fileFilename} processado. ${text.length} caracteres extraídos.`,
    };
  }
}