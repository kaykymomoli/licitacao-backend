import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private model: ChatAnthropic;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.model = new ChatAnthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4048,
      temperature: 0.3, // baixo para documentos jurídicos — menos criatividade, mais precisão
    });

    this.logger.log('Cliente Anthropic inicializado');
  }

  getModel(): ChatAnthropic {
    return this.model;
  }

  // Chamada simples — para testes e casos sem LangGraph
  async invoke(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.model.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
    ]);

  return response.content as string;
}
}