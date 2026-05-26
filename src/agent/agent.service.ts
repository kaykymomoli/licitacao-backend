import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { HumanMessage } from '@langchain/core/messages';
import { AiService } from './ai.service';
import { RagService } from '../rag/rag.service';
import { SupabaseService } from '../supabase/supabase.service';
import { createTrStartGraph, createTrReplyGraph } from './graphs/tr.graph';
import { createEtpStartGraph, createEtpReplyGraph } from './graphs/etp.graph';

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private trStartGraph: any;
  private trReplyGraph: any;
  private etpStartGraph: any;
  private etpReplyGraph: any;

  constructor(
    private ai: AiService,
    private rag: RagService,
    private supabase: SupabaseService,
  ) {}

  onModuleInit() {
    this.trStartGraph = createTrStartGraph(this.supabase);
    this.trReplyGraph = createTrReplyGraph(this.ai, this.rag, this.supabase);
    this.etpStartGraph = createEtpStartGraph(this.supabase);
    this.etpReplyGraph = createEtpReplyGraph(this.ai, this.rag, this.supabase);
    this.logger.log('Agentes TR e ETP inicializados');
  }

  // ── TR ──────────────────────────────────────────

  async startTrSession(
    userId: string,
    sessionId: string,
  ): Promise<{ message: string; state: Record<string, any> }> {
    const result = await this.trStartGraph.invoke({
      userId,
      sessionId,
      messages: [],
      collectedSections: {},
      currentSectionIndex: 0,
      allSectionsCollected: false,
      template: null,
      documentId: '',
      documentUrl: '',
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const state: Record<string, any> = {
      userId: result.userId,
      sessionId: result.sessionId,
      messages: [],
      collectedSections: result.collectedSections ?? {},
      currentSectionIndex: result.currentSectionIndex ?? 0,
      allSectionsCollected: result.allSectionsCollected ?? false,
      template: result.template,
      documentId: '',
      documentUrl: '',
    };

    return {
      message: (lastMessage?.content as string) ?? 'Olá! Vou te ajudar a criar um Termo de Referência.',
      state,
    };
  }

  async sendMessageToTr(
  userId: string,
  sessionId: string,
  userMessage: string,
  currentState: any,
): Promise<{ response: string; state: any; documentUrl?: string }> {
  const newMessage = new HumanMessage(userMessage);

  const result = await this.trReplyGraph.invoke(
    {
      ...currentState,
      userId,
      sessionId,
      messages: [...(currentState.messages ?? []), newMessage],
    },
    {
      recursionLimit: 10,
      runName: 'agente-tr',
      tags: ['TR', 'licitacao'],
      metadata: {
        userId,
        sessionId,
        agentType: 'TR',
      },
    },
  );

    const lastAiMessage = [...result.messages]
      .reverse()
      .find((m: any) => m._getType() === 'ai');

    return {
      response: lastAiMessage?.content ?? '',
      state: result,
      documentUrl: result.documentUrl,
    };
  }

  // ── ETP ─────────────────────────────────────────

  async startEtpSession(
    userId: string,
    sessionId: string,
  ): Promise<{ message: string; state: Record<string, any> }> {
    const result = await this.etpStartGraph.invoke({
      userId,
      sessionId,
      messages: [],
      collectedSections: {},
      currentSectionIndex: 0,
      allSectionsCollected: false,
      template: null,
      documentId: '',
      documentUrl: '',
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const state: Record<string, any> = {
      userId: result.userId,
      sessionId: result.sessionId,
      messages: [],
      collectedSections: result.collectedSections ?? {},
      currentSectionIndex: result.currentSectionIndex ?? 0,
      allSectionsCollected: result.allSectionsCollected ?? false,
      template: result.template,
      documentId: '',
      documentUrl: '',
    };

    return {
      message: (lastMessage?.content as string) ?? 'Olá! Vou te ajudar a criar um Estudo Técnico Preliminar.',
      state,
    };
  }

  async sendMessageToEtp(
  userId: string,
  sessionId: string,
  userMessage: string,
  currentState: any,
): Promise<{ response: string; state: any; documentUrl?: string }> {
  const newMessage = new HumanMessage(userMessage);

  const result = await this.etpReplyGraph.invoke(
    {
      ...currentState,
      userId,
      sessionId,
      messages: [...(currentState.messages ?? []), newMessage],
    },
    {
      recursionLimit: 10,
      runName: 'agente-etp',
      tags: ['ETP', 'licitacao'],
      metadata: {
        userId,
        sessionId,
        agentType: 'ETP',
      },
    },
  );

    const lastAiMessage = [...result.messages]
      .reverse()
      .find((m: any) => m._getType() === 'ai');

    return {
      response: lastAiMessage?.content ?? '',
      state: result,
      documentUrl: result.documentUrl,
    };
  }

  // ── Memória (compatibilidade) ────────────────────

  async saveSessionState(sessionId: string, state: any): Promise<void> {
    await this.supabase
      .getAdminClient()
      .from('sessions')
      .update({ agent_state: state })
      .eq('id', sessionId);
  }

  async loadSessionState(sessionId: string): Promise<any> {
    const { data } = await this.supabase
      .getAdminClient()
      .from('sessions')
      .select('agent_state')
      .eq('id', sessionId)
      .single();

    return data?.agent_state ?? null;
  }
}