import { BaseMessage } from '@langchain/core/messages';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';

export const TrAgentState = Annotation.Root({
  // Histórico de mensagens da conversa
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // Dados do usuário e sessão
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  sessionId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Template carregado do banco
  template: Annotation<any>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Seções preenchidas pelo usuário
  collectedSections: Annotation<Record<string, string>>({
    reducer: (current, next) => ({ ...current, ...next }),
    default: () => ({}),
  }),

  // Índice da seção atual sendo coletada
  currentSectionIndex: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Se todas as seções foram coletadas
  allSectionsCollected: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // ID do documento em andamento
  documentId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // URL do documento gerado
  documentUrl: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Adicione estes campos ao TrAgentState
  uploadedFileContext: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  uploadedFileName: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  
  validationPassed: Annotation<boolean>({
  reducer: (_, next) => next,
  default: () => false,
  }),
});

export type TrAgentStateType = typeof TrAgentState.State;