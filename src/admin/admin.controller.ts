import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AdminGuard } from './admin.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private supabase: SupabaseService) {}

  @Post('users')
  async createUser(@Body() body: { email: string; password: string; nome: string; role?: string }) {
    const { data, error } = await this.supabase.getAdminClient().auth.admin.createUser({
      email: body.email,
      password: body.password,
      user_metadata: { full_name: body.nome, role: body.role || 'user' },
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  @Get('users')
  async listUsers() {
    const { data, error } = await this.supabase.getAdminClient().auth.admin.listUsers();
    if (error) throw new Error(error.message);
    return data.users.map(u => ({
      id: u.id,
      email: u.email,
      nome: u.user_metadata?.full_name || '',
      role: u.user_metadata?.role || 'user',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }));
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    const { error } = await this.supabase.getAdminClient().auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    return { success: true };
  }
}