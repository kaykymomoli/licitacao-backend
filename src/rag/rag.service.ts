import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { SupabaseService } from '../supabase/supabase.service';

export interface SearchResult {
  id: string;
  content: string;
  source: string;
  title: string;
  metadata: Record<string, any>;
  similarity: number;
}

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private embeddings: OpenAIEmbeddings;

  constructor(
    private config: ConfigService,
    private supabase: SupabaseService,
  ) {}

  onModuleInit() {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
      model: 'text-embedding-3-small',
    });

    this.logger.log('Serviço de RAG inicializado');
  }

  // Busca semântica na base de conhecimento
  async search(
    query: string,
    agentType?: 'TR' | 'ETP' | 'EDITAL' | 'ALL',
    limit = 5,
  ): Promise<SearchResult[]> {
    this.logger.log(`Buscando: "${query}" para agente: ${agentType ?? 'ALL'}`);

    // Gerar embedding da query
    const queryEmbedding = await this.embeddings.embedQuery(query);

    // Buscar no pgvector via função SQL
    const { data, error } = await this.supabase
      .getAdminClient()
      .rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: limit,
        filter_agent_type: agentType ?? null,
      });

    if (error) {
      this.logger.error(`Erro na busca semântica: ${error.message}`);
      return [];
    }

    return data as SearchResult[];
  }

  // Gerar embedding de um texto
  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(text);
  }

  // Formatar resultados para injetar no prompt
  formatForPrompt(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'Nenhum trecho relevante encontrado na base de conhecimento.';
    }

    return results
      .map((r, i) => `[Trecho ${i + 1} — ${r.source}]\n${r.content}`)
      .join('\n\n---\n\n');
  }
}