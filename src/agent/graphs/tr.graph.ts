import { StateGraph, END, START } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { TrAgentState, TrAgentStateType } from './tr.state';
import { AiService } from '../ai.service';
import { RagService } from '../../rag/rag.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { TR_SYSTEM_PROMPT, TR_GENERATION_PROMPT, TR_VALIDATION_PROMPT } from '../prompts/tr.prompt';
import { createGenerateDocxTool } from '../tools';

// Grafo 1: Iniciar sessão e fazer primeira pergunta
export const createTrStartGraph = (
  supabaseService: SupabaseService,
) => {
  return new StateGraph(TrAgentState)

    .addNode('load_template', async (state: TrAgentStateType) => {
      const { data } = await supabaseService
        .getAdminClient()
        .from('templates')
        .select('*')
        .eq('agent_type', 'TR')
        .eq('is_active', true)
        .single();
      return { template: data };
    })

    .addNode('ask_first_question', async (state: TrAgentStateType) => {
      if (!state.template) return {};
      const sections = state.template.sections.filter((s: any) => s.required);
      const firstSection = sections[0];
      if (!firstSection) return {};

      const message = new AIMessage(
        `Olá! Vou te ajudar a criar um **Termo de Referência** completo e em conformidade com a Lei 14.133/2021.\n\n` +
        `Vamos preencher as ${sections.length} seções obrigatórias uma por vez.\n\n` +
        `**Seção 1/${sections.length} — ${firstSection.title}**\n\n` +
        `${firstSection.description}\n\n` +
        `${firstSection.questions[0]}`,
      );

      return {
        messages: [message],
        currentSectionIndex: 0,
        allSectionsCollected: false,
      };
    })

    .addEdge(START, 'load_template')
    .addEdge('load_template', 'ask_first_question')
    .addEdge('ask_first_question', END)
    .compile();
};

// Grafo 2: Processar resposta e decidir próximo passo
export const createTrReplyGraph = (
  aiService: AiService,
  ragService: RagService,
  supabaseService: SupabaseService,
) => {
  return new StateGraph(TrAgentState)

    .addNode('process_response', async (state: TrAgentStateType) => {
      const sections = state.template.sections.filter((s: any) => s.required);
      const currentSection = sections[state.currentSectionIndex];
      const lastMessage = state.messages[state.messages.length - 1];
      const userResponse = lastMessage.content as string;

      if (!currentSection || !userResponse) return {};

      const autoFillKeywords = ['preencha', 'preencher', 'automático', 'automaticamente', 'use o', 'usar o', 'com base no', 'baseado no'];
      const isAutoFill = autoFillKeywords.some(k => userResponse.toLowerCase().includes(k));

      if (isAutoFill && state.uploadedFileContext) {
        const ragResults = await ragService.search('Termo de Referência seções obrigatórias', 'TR', 5);
        const ragContext = ragService.formatForPrompt(ragResults);

        const autoFillPrompt = `Com base no documento enviado pelo usuário, extraia as informações e preencha as seções do Termo de Referência.

DOCUMENTO DE REFERÊNCIA:
${state.uploadedFileContext}

BASE LEGAL:
${ragContext}

SEÇÕES QUE PRECISAM SER PREENCHIDAS:
${sections
  .filter((s: any) => !state.collectedSections[s.key])
  .map((s: any) => `- ${s.key}: ${s.title} (${s.description})`)
  .join('\n')}

Retorne um JSON com as seções preenchidas:
{
  "sections": {
    "objeto": "...",
    "justificativa": "...",
    "enquadramento_legal": "...",
    "especificacoes": "...",
    "modelo_execucao": "...",
    "cronograma": "...",
    "requisitos_contratacao": "...",
    "sancoes": "...",
    "acompanhamento_fiscalizacao": "...",
    "pagamento": "...",
    "vigencia": "..."
  }
}

Retorne APENAS o JSON, sem texto adicional.`;

        const aiResponse = await aiService.invoke(TR_SYSTEM_PROMPT, autoFillPrompt);

        try {
          const clean = aiResponse.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(clean);
          const autoFilledSections = parsed.sections ?? {};

          const confirmMessage = new AIMessage(
            `✅ Analisei o documento **${state.uploadedFileName}** e preenchi automaticamente todas as seções.\n\nVou gerar o documento agora.`,
          );

          return {
            collectedSections: { ...state.collectedSections, ...autoFilledSections },
            messages: [confirmMessage],
            allSectionsCollected: true,
            validationPassed: true,
          };
        } catch {
          // continua fluxo normal
        }
      }

      return {
        collectedSections: { [currentSection.key]: userResponse },
        validationPassed: false,
      };
    })

    .addNode('validate_response', async (state: TrAgentStateType) => {
  const sections = state.template.sections.filter((s: any) => s.required);
  const currentSection = sections[state.currentSectionIndex];

  if (!currentSection) return { validationPassed: true };

  const lastUserMessage = [...state.messages]
    .reverse()
    .find((m: any) => m._getType() === 'human');

  const userResponse = lastUserMessage?.content as string ?? '';

  const validationPrompt = TR_VALIDATION_PROMPT(
    currentSection.title,
    currentSection.description,
    userResponse,
  );

  const validationResponse = await aiService.invoke(
    'Você é um validador de respostas para documentos de licitação. Retorne apenas JSON.',
    validationPrompt,
  );

  try {
    const clean = validationResponse.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    // Caso 1 — Fora do contexto
    if (result.case === 1) {
      const feedbackMessage = new AIMessage(
        `⚠️ ${result.message}\n\n` +
        `Estamos preenchendo a seção **${currentSection.title}** do Termo de Referência.\n\n` +
        `${currentSection.questions[0]}`,
      );
      return {
        validationPassed: false,
        messages: [feedbackMessage],
        collectedSections: (() => {
          const updated = { ...state.collectedSections };
          delete updated[currentSection.key];
          return updated;
        })(),
      };
    }

    // Caso 2 — Resposta insuficiente
    if (result.case === 2) {
      const feedbackMessage = new AIMessage(
        `⚠️ ${result.message}`,
      );
      return {
        validationPassed: false,
        messages: [feedbackMessage],
        collectedSections: (() => {
          const updated = { ...state.collectedSections };
          delete updated[currentSection.key];
          return updated;
        })(),
      };
    }

    // Caso 3 — Pedido de ajuda
    if (result.case === 3) {
      const helpMessage = new AIMessage(
        `💡 ${result.message}`,
      );
      return {
        validationPassed: false,
        messages: [helpMessage],
        collectedSections: (() => {
          const updated = { ...state.collectedSections };
          delete updated[currentSection.key];
          return updated;
        })(),
      };
    }

      // Caso 4 — Resposta válida
    return { validationPassed: true };

    } catch {
      return { validationPassed: true };
    }
  })

    .addNode('identify_section', async (state: TrAgentStateType) => {
      if (!state.template) return { allSectionsCollected: true };
      const sections = state.template.sections.filter((s: any) => s.required);

      for (let i = 0; i < sections.length; i++) {
        if (!state.collectedSections[sections[i].key]) {
          return { currentSectionIndex: i, allSectionsCollected: false };
        }
      }

      return { allSectionsCollected: true };
    })

    .addNode('ask_question', async (state: TrAgentStateType) => {
      const sections = state.template.sections.filter((s: any) => s.required);
      const currentSection = sections[state.currentSectionIndex];
      if (!currentSection) return {};

      const sectionNumber = state.currentSectionIndex + 1;
      const totalSections = sections.length;

      const message = new AIMessage(
        `**Seção ${sectionNumber}/${totalSections} — ${currentSection.title}**\n\n` +
        `${currentSection.description}\n\n` +
        `${currentSection.questions[0]}`,
      );

      return { messages: [message] };
    })

    .addNode('generate_document', async (state: TrAgentStateType) => {
      const ragResults = await ragService.search(
        'Termo de Referência Lei 14.133 requisitos obrigatórios',
        'TR',
        8,
      );
      const ragContext = ragService.formatForPrompt(ragResults);
      const generationPrompt = TR_GENERATION_PROMPT(state.collectedSections, ragContext);
      const response = await aiService.invoke(TR_SYSTEM_PROMPT, generationPrompt);

      let documentData: { title: string; sections: any[] };
      try {
        const clean = response.replace(/```json|```/g, '').trim();
        documentData = JSON.parse(clean);
      } catch {
        documentData = {
          title: 'TERMO DE REFERÊNCIA',
          sections: [{ title: 'Conteúdo', content: response }],
        };
      }

      const { data: doc } = await supabaseService
        .getAdminClient()
        .from('documents')
        .insert({
          user_id: state.userId,
          session_id: state.sessionId,
          agent_type: 'TR',
          title: documentData.title,
          status: 'draft',
          metadata: { sections: documentData.sections },
        })
        .select()
        .single();

      if (!doc) return {};

      const generateDocx = createGenerateDocxTool(
        supabaseService,
        state.userId,
        doc.id,
      );

      const result = await generateDocx.invoke({
        title: documentData.title,
        sections: documentData.sections,
      });

      const urlMatch = result.match(/URL: (.+)/);
      const documentUrl = urlMatch ? urlMatch[1].trim() : '';

      const finalMessage = new AIMessage(
        `✅ **Termo de Referência gerado com sucesso!**\n\n` +
        `Seu documento foi criado com ${documentData.sections.length} seções ` +
        `e está disponível para download.\n\n` +
        `📄 [Clique aqui para baixar o documento](${documentUrl})`,
      );

      return {
        documentId: doc.id,
        documentUrl,
        messages: [finalMessage],
      };
    })

    // ARESTAS
    .addEdge(START, 'process_response')
    .addEdge('process_response', 'validate_response')
    .addConditionalEdges(
      'validate_response',
      (state: TrAgentStateType) => {
        if (state.allSectionsCollected) return 'generate';
        return state.validationPassed ? 'identify' : 'end';
      },
      {
        generate: 'generate_document',
        identify: 'identify_section',
        end: END,
      },
    )
    .addConditionalEdges(
      'identify_section',
      (state: TrAgentStateType) =>
        state.allSectionsCollected ? 'generate' : 'ask',
      {
        ask: 'ask_question',
        generate: 'generate_document',
      },
    )
    .addEdge('ask_question', END)
    .addEdge('generate_document', END)
    .compile();
};