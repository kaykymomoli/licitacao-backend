import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
} from 'docx';
import { SupabaseService } from '../../supabase/supabase.service';

export const createGenerateDocxTool = (
  supabaseService: SupabaseService,
  userId: string,
  documentId: string,
) =>
  tool(
    async ({ title, sections }) => {
      // Montar o documento DOCX
      const children: Paragraph[] = [
        new Paragraph({
          text: title,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
      ];

      for (const section of sections) {
        children.push(
          new Paragraph({
            text: section.title,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),
        );

        const paragraphs = section.content.split('\n').filter(p => p.trim());
        for (const para of paragraphs) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: para, size: 24 })],
              spacing: { after: 200 },
              alignment: AlignmentType.JUSTIFIED,
            }),
          );
        }
      }

      const doc = new Document({ sections: [{ children }] });
      const buffer = await Packer.toBuffer(doc);

      // Salvar no Supabase Storage
      const fileName = `${userId}/${documentId}.docx`;
      const { error: uploadError } = await supabaseService
        .getAdminClient()
        .storage
        .from('documents')
        .upload(fileName, buffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true,
        });

      if (uploadError) {
        return `Erro ao salvar arquivo: ${uploadError.message}`;
      }

      // Gerar URL pública
      const { data } = supabaseService
        .getAdminClient()
        .storage
        .from('documents')
        .getPublicUrl(fileName);

      // Atualizar status do documento
      await supabaseService
        .getAdminClient()
        .from('documents')
        .update({
          status: 'completed',
          file_path: fileName,
          file_url: data.publicUrl,
        })
        .eq('id', documentId);

      return `Documento gerado com sucesso! URL: ${data.publicUrl}`;
    },
    {
      name: 'gerar_docx',
      description: 'Gera o arquivo DOCX final do documento e salva no storage',
      schema: z.object({
        title: z.string().describe('Título do documento'),
        sections: z
          .array(
            z.object({
              title: z.string(),
              content: z.string(),
            }),
          )
          .describe('Seções do documento com título e conteúdo'),
      }),
    },
  );