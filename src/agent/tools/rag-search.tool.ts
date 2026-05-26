import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { RagService } from '../../rag/rag.service';

export const createRagSearchTool = (ragService: RagService) =>
  tool(
    async ({ query, agentType }) => {
      const results = await ragService.search(query, agentType, 5);
      return ragService.formatForPrompt(results);
    },
    {
      name: 'buscar_legislacao',
      description: 'Busca trechos relevantes da Lei 14.133/2021 e templates de licitação para embasar o documento',
      schema: z.object({
        query: z.string().describe('O que buscar na base de conhecimento'),
        agentType: z
          .enum(['TR', 'ETP', 'EDITAL', 'ALL'])
          .optional()
          .describe('Tipo de agente para filtrar a busca'),
      }),
    },
  );