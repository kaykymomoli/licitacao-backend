import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SupabaseService } from '../../supabase/supabase.service';

export const createSaveDraftTool = (
  supabaseService: SupabaseService,
  userId: string,
  sessionId: string,
) =>
  tool(
    async ({ agentType, title, content }) => {
      const { data, error } = await supabaseService
        .getAdminClient()
        .from('documents')
        .upsert({
          user_id: userId,
          session_id: sessionId,
          agent_type: agentType,
          title,
          status: 'draft',
          metadata: { content },
        })
        .select()
        .single();

      if (error) {
        return `Erro ao salvar rascunho: ${error.message}`;
      }

      return `Rascunho salvo com ID: ${data.id}`;
    },
    {
      name: 'salvar_rascunho',
      description: 'Salva o rascunho do documento em andamento no banco de dados',
      schema: z.object({
        agentType: z.enum(['TR', 'ETP', 'EDITAL']),
        title: z.string().describe('Título do documento'),
        content: z.string().describe('Conteúdo gerado até o momento'),
      }),
    },
  );