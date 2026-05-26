import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { MemoryService } from './memory.service';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [RagModule],
  providers: [AiService, AgentService, MemoryService],
  controllers: [AgentController],
  exports: [AiService, AgentService, MemoryService],
})
export class AgentModule {}