import { StateGraph, END, START } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { EtpAgentState, EtpAgentStateType } from './etp.state';
import { AiService } from '../ai.service';
import { RagService } from '../../rag/rag.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { ETP_SYSTEM_PROMPT, ETP_GENERATION_PROMPT } from '../prompts/etp.prompt';
import { createGenerateDocxTool } from '../tools';

export const createEtpStartGraph = (supabaseService: SupabaseService) => {
  return new StateGraph(EtpAgentState)
    .addNode('load_template', async (state: EtpAgentStateType) => {
      const { data } = await supabaseService.getAdminClient()
        .from('templates').select('*')
        .eq('agent_type', 'ETP').eq('is_active', true).single();
      return { template: data };
    })
    .addNode('welcome', async (state: EtpAgentStateType) => {
      if (!state.template) return {};
      const sections = state.template.sections.filter((s: any) => s.required);
      const message = new AIMessage(
        `Olá! Vou te ajudar a criar um **Estudo Técnico Preliminar (ETP)** completo em conformidade com o Art. 18 da Lei 14.133/2021.\n\n` +
        `Me fale sobre a necessidade de contratação. Pode incluir a descrição do problema, a solução pretendida, ` +
        `estimativas de custo e quantidade — qualquer informação que tiver.\n\n` +
        `Se preferir, você pode enviar um arquivo de referência (PDF ou DOCX) que eu extraio as informações automaticamente e preencho as ${sections.length} seções necessárias.`,
      );
      return { messages: [message], currentSectionIndex: 0, allSectionsCollected: false };
    })
    .addEdge(START, 'load_template')
    .addEdge('load_template', 'welcome')
    .addEdge('welcome', END)
    .compile();
};

export const createEtpReplyGraph = (
  aiService: AiService,
  ragService: RagService,
  supabaseService: SupabaseService,
) => {
  return new StateGraph(EtpAgentState)

    .addNode('process_message', async (state: EtpAgentStateType) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const userMessage = lastMessage?.content as string ?? '';

      // Documento já gerado — responde naturalmente sem tocar no grafo de geração
      if (state.documentUrl) {
        const aiResponse = await aiService.invoke(
          `Você é um assistente especializado em licitações públicas brasileiras.
O Estudo Técnico Preliminar já foi gerado com sucesso e está disponível para download.
Responda à mensagem do usuário de forma natural e conversacional.
Se pedir alterações no documento, sugira iniciar uma nova sessão.
Seja humano e prestativo.`,
          userMessage,
        );
        const content = typeof aiResponse === 'string' ? aiResponse : String(aiResponse);
        return { messages: [new AIMessage(content)], allSectionsCollected: false };
      }

      if (!state.template) {
        return {
          messages: [new AIMessage('Ocorreu um erro ao carregar o template. Por favor, inicie uma nova sessão.')],
        };
      }

      const sections = state.template.sections.filter((s: any) => s.required);
      const collectedSections = state.collectedSections ?? {};
      const missingSections = sections.filter((s: any) => !collectedSections[s.key]);

      const collectedList = Object.entries(collectedSections)
        .map(([k, v]) => `- ${k}: ${String(v).substring(0, 200)}`)
        .join('\n') || 'Nenhuma seção coletada ainda';

      const missingList = missingSections
        .map((s: any) => `- ${s.key}: ${s.title} — ${s.description}`)
        .join('\n') || 'Todas as seções já foram coletadas';

      const fileContextBlock = state.uploadedFileContext
        ? `\n\nDOCUMENTO DE REFERÊNCIA ENVIADO PELO USUÁRIO (${state.uploadedFileName}):\n${state.uploadedFileContext}`
        : '';

      const extractionPrompt = `Você está coletando informações para elaborar um Estudo Técnico Preliminar conforme o Art. 18 da Lei 14.133/2021.

SEÇÕES JÁ COLETADAS:
${collectedList}

SEÇÕES QUE AINDA PRECISAM DE INFORMAÇÃO:
${missingList}
${fileContextBlock}

MENSAGEM DO USUÁRIO:
${userMessage}

TAREFA:
1. Extraia qualquer informação relevante da mensagem do usuário (e do documento, se disponível) para preencher as seções que ainda faltam.
2. Se o usuário pedir para preencher com base no arquivo ou documento enviado, extraia o máximo de informações possíveis do documento de referência para TODAS as seções faltantes.
3. Informações parciais são válidas — extraia tudo que for aproveitável.
4. Se a mensagem não tiver relação com licitações ou contratos públicos, gentilmente redirecione para o contexto.
5. Gere uma resposta natural confirmando o que foi extraído. Se ainda houver seções faltando, pergunte sobre o ponto mais relevante de forma conversacional (não liste tudo de uma vez).
6. Se todas as seções estiverem coletadas (as já existentes + as novas), informe que vai gerar o documento agora.

Retorne APENAS um JSON válido:
{
  "extracted": { "section_key": "valor extraído" },
  "response": "Resposta natural ao usuário",
  "all_collected": true | false
}

REGRAS:
- "extracted" deve conter apenas seções com informação concreta extraída desta interação.
- "all_collected" deve ser true somente se TODAS as seções obrigatórias tiverem informação suficiente (já coletadas anteriormente + as novas extraídas agora).
- Nunca invente informações — baseie-se apenas no que o usuário forneceu ou está no documento.`;

      const aiResponse = await aiService.invoke(ETP_SYSTEM_PROMPT, extractionPrompt);

      let extracted: Record<string, string> = {};
      let response = '';

      try {
        const clean = aiResponse.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        extracted = parsed.extracted ?? {};
        response = parsed.response ?? '';
      } catch {
        response = aiResponse;
      }

      // Verificação própria de completude (não depende apenas da IA)
      const updatedSections = { ...collectedSections, ...extracted };
      const remaining = sections.filter((s: any) => !updatedSections[s.key]);
      const allSectionsCollected = remaining.length === 0;

      if (!response) {
        if (allSectionsCollected) {
          response = 'Ótimo! Coletei todas as informações necessárias. Vou gerar o Estudo Técnico Preliminar agora.';
        } else {
          const next = remaining[0];
          const extractedCount = Object.keys(extracted).length;
          response = next
            ? `${extractedCount > 0 ? 'Registrei as informações. ' : ''}Preciso ainda de informações sobre **${next.title}**: ${next.description}`
            : 'Pode continuar me contando sobre a necessidade de contratação.';
        }
      }

      return {
        collectedSections: extracted,
        messages: [new AIMessage(response)],
        allSectionsCollected,
        validationPassed: allSectionsCollected,
      };
    })

    .addNode('generate_document', async (state: EtpAgentStateType) => {
      const ragResults = await ragService.search('Estudo Técnico Preliminar Lei 14.133 Art. 18 requisitos', 'ETP', 8);
      const ragContext = ragService.formatForPrompt(ragResults);
      const generationPrompt = ETP_GENERATION_PROMPT(state.collectedSections, ragContext);
      const response = await aiService.invoke(ETP_SYSTEM_PROMPT, generationPrompt);

      let documentData: { title: string; sections: any[] };
      try {
        const clean = response.replace(/```json|```/g, '').trim();
        documentData = JSON.parse(clean);
      } catch {
        documentData = { title: 'ESTUDO TÉCNICO PRELIMINAR', sections: [{ title: 'Conteúdo', content: response }] };
      }

      const { data: doc } = await supabaseService.getAdminClient()
        .from('documents').insert({
          user_id: state.userId, session_id: state.sessionId,
          agent_type: 'ETP', title: documentData.title,
          status: 'draft', metadata: { sections: documentData.sections },
        }).select().single();

      if (!doc) return {};

      const generateDocx = createGenerateDocxTool(supabaseService, state.userId, doc.id);
      const result = await generateDocx.invoke({ title: documentData.title, sections: documentData.sections });
      const urlMatch = result.match(/URL: (.+)/);
      const documentUrl = urlMatch ? urlMatch[1].trim() : '';

      const finalMessage = new AIMessage(
        `**Estudo Técnico Preliminar gerado com sucesso!**\n\n` +
        `Seu documento foi criado com ${documentData.sections.length} seções e está disponível para download.\n\n` +
        `[Clique aqui para baixar o documento](${documentUrl})`,
      );

      return { documentId: doc.id, documentUrl, messages: [finalMessage] };
    })

    .addEdge(START, 'process_message')
    .addConditionalEdges(
      'process_message',
      (state: EtpAgentStateType) =>
        (state.allSectionsCollected && !state.documentUrl) ? 'generate' : 'end',
      { generate: 'generate_document', end: END },
    )
    .addEdge('generate_document', END)
    .compile();
};
