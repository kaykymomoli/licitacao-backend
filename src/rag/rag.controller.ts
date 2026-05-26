import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RagService } from './rag.service';

@Controller('rag')
@UseGuards(JwtAuthGuard)
export class RagController {
  constructor(private rag: RagService) {}

  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('agent') agent?: 'TR' | 'ETP' | 'EDITAL',
    @Query('limit') limit?: string,
  ) {
    const results = await this.rag.search(
      query,
      agent,
      limit ? parseInt(limit) : 5,
    );

    return {
      query,
      agent: agent ?? 'ALL',
      total: results.length,
      results: results.map(r => ({
        source: r.source,
        similarity: Math.round(r.similarity * 100) / 100,
        preview: r.content.substring(0, 200) + '...',
      })),
    };
  }

  @Get('search/full')
  async searchFull(
    @Query('q') query: string,
    @Query('agent') agent?: 'TR' | 'ETP' | 'EDITAL',
  ) {
    const results = await this.rag.search(query, agent);
    const formatted = this.rag.formatForPrompt(results);

    return {
      query,
      total: results.length,
      formatted,
    };
  }
}