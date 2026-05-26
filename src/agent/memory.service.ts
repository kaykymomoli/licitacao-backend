import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private supabase: SupabaseService) {}

  // Salvar mensagem no histórico
  async saveMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .getAdminClient()
      .from('messages')
      .insert({
        session_id: sessionId,
        role,
        content,
        metadata: {},
      });

    if (error) {
      this.logger.error(`Erro ao salvar mensagem: ${error.message}`);
    }
  }

  // Carregar histórico de mensagens de uma sessão
  async loadMessages(sessionId: string): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Erro ao carregar mensagens: ${error.message}`);
      return [];
    }

    return (data ?? []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      createdAt: m.created_at,
    }));
  }

  // Salvar estado completo do agente na sessão
  async saveAgentState(sessionId: string, state: any): Promise<void> {
    // Limpar mensagens do estado antes de salvar — elas ficam na tabela messages
    const stateToSave = { ...state, messages: [] };

    const { error } = await this.supabase
      .getAdminClient()
      .from('sessions')
      .update({ agent_state: stateToSave })
      .eq('id', sessionId);

    if (error) {
      this.logger.error(`Erro ao salvar estado: ${error.message}`);
    }
  }

  // Carregar estado completo do agente
  async loadAgentState(sessionId: string): Promise<any | null> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('sessions')
      .select('agent_state, agent_type')
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      this.logger.error(`Sessão não encontrada: ${sessionId}`);
      return null;
    }

    return data.agent_state ?? null;
  }

  // Carregar sessão completa com histórico
  async loadFullSession(sessionId: string): Promise<{
    state: any;
    messages: ChatMessage[];
  } | null> {
    const [state, messages] = await Promise.all([
      this.loadAgentState(sessionId),
      this.loadMessages(sessionId),
    ]);

    if (!state) return null;

    return { state, messages };
  }

  // Marcar sessão como concluída
  async completeSession(sessionId: string): Promise<void> {
    await this.supabase
      .getAdminClient()
      .from('sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId);
  }

  // Listar sessões ativas do usuário com última mensagem
  async listUserSessions(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('sessions')
      .select(`
        id,
        agent_type,
        title,
        status,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      this.logger.error(`Erro ao listar sessões: ${error.message}`);
      return [];
    }

    return data ?? [];
  }
}