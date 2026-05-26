import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SupabaseService } from '../../supabase/supabase.service';

export const createGetTemplateTool = (supabaseService: SupabaseService) =>
  tool(
    async ({ agentType }) => {
      const { data, error } = await supabaseService
        .getAdminClient()
        .from('templates')
        .select('*')
        .eq('agent_type', agentType)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return `Template não encontrado para ${agentType}`;
      }

      return JSON.stringify(data);
    },
    {
      name: 'buscar_template',
      description: 'Busca o template oficial de um documento de licitação (TR, ETP ou EDITAL)',
      schema: z.object({
        agentType: z
          .enum(['TR', 'ETP', 'EDITAL'])
          .describe('Tipo do documento'),
      }),
    },
  );