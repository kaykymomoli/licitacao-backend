import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseService } from './supabase/supabase.service';
import { JwtAuthGuard } from './auth/jwt.guard';
import { CurrentUser } from './auth/current-user.decorator';
import { AuthUser } from './auth/jwt.strategy';

@Controller()
export class AppController {
  constructor(private supabase: SupabaseService) {}

  @Get('health')
  async health() {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('profiles')
      .select('count')
      .limit(1);

    return {
      status: error ? 'error' : 'ok',
      supabase: error ? error.message : 'conectado',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthUser) {
    return {
      message: 'Token válido',
      user,
    };
  }

}