import { BaseMessage } from '@langchain/core/messages';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';

export const EtpAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  sessionId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  template: Annotation<any>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  collectedSections: Annotation<Record<string, string>>({
    reducer: (current, next) => ({ ...current, ...next }),
    default: () => ({}),
  }),
  currentSectionIndex: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  allSectionsCollected: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  documentId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  documentUrl: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
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

export type EtpAgentStateType = typeof EtpAgentState.State;