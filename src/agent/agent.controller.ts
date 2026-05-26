import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { AgentService } from './agent.service';
import { MemoryService } from './memory.service';
import { SupabaseService } from '../supabase/supabase.service';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

class StartSessionDto {
  @IsString()
  @IsNotEmpty()
  agentType: 'TR' | 'ETP' | 'EDITAL';
}

class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(
    private agentService: AgentService,
    private memoryService: MemoryService,
    private supabase: SupabaseService,
  ) {}

  @Post('session/start')
  async startSession(
    @Body() body: StartSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const { data: session } = await this.supabase
      .getAdminClient()
      .from('sessions')
      .insert({
        user_id: user.id,
        agent_type: body.agentType,
        title: `${body.agentType} - ${new Date().toLocaleDateString('pt-BR')}`,
        status: 'active',
      })
      .select()
      .single();

    if (!session) throw new Error('Erro ao criar sessão');

    let message = '';
    let initialState: any = {};

    if (body.agentType === 'TR') {
      const result = await this.agentService.startTrSession(user.id, session.id);
      message = result.message;
      initialState = result.state;
    } else if (body.agentType === 'ETP') {
      const result = await this.agentService.startEtpSession(user.id, session.id);
      message = result.message;
      initialState = result.state;
    }

    await Promise.all([
      this.memoryService.saveAgentState(session.id, initialState),
      this.memoryService.saveMessage(session.id, 'assistant', message),
    ]);

    return {
      sessionId: session.id,
      agentType: body.agentType,
      message,
    };
  }

  @Post('message')
  async sendMessage(
    @Body() body: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const state = await this.memoryService.loadAgentState(body.sessionId);
    if (!state) throw new NotFoundException('Sessão não encontrada');

    await this.memoryService.saveMessage(body.sessionId, 'user', body.message);

    // Identificar tipo do agente pela sessão
    const { data: session } = await this.supabase
      .getAdminClient()
      .from('sessions')
      .select('agent_type')
      .eq('id', body.sessionId)
      .single();

    let result: any;

    if (session?.agent_type === 'TR') {
      result = await this.agentService.sendMessageToTr(
        user.id, body.sessionId, body.message, state,
      );
    } else if (session?.agent_type === 'ETP') {
      result = await this.agentService.sendMessageToEtp(
        user.id, body.sessionId, body.message, state,
      );
    } else {
      throw new Error('Tipo de agente não suportado');
    }

    await Promise.all([
      this.memoryService.saveAgentState(body.sessionId, result.state),
      this.memoryService.saveMessage(body.sessionId, 'assistant', result.response),
    ]);

    if (result.documentUrl) {
      await this.memoryService.completeSession(body.sessionId);
    }

    return {
      response: result.response,
      documentUrl: result.documentUrl,
      sessionId: body.sessionId,
    };
  }

  // Retomar sessão existente
  @Get('session/:id/resume')
  async resumeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const session = await this.memoryService.loadFullSession(sessionId);

    if (!session) throw new NotFoundException('Sessão não encontrada');

    return {
      sessionId,
      state: session.state,
      messages: session.messages,
    };
  }

  // Listar sessões do usuário
  @Get('sessions')
  async getSessions(@CurrentUser() user: AuthUser) {
    return this.memoryService.listUserSessions(user.id);
  }

  // Buscar sessão específica
  @Get('session/:id')
  async getSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const { data } = await this.supabase
      .getAdminClient()
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (!data) throw new NotFoundException('Sessão não encontrada');
    return data;
  }
}