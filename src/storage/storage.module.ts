import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { FileExtractionService } from './file-extraction.service';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [AgentModule],
  providers: [StorageService, FileExtractionService],
  controllers: [StorageController],
  exports: [StorageService, FileExtractionService],
})
export class StorageModule {}