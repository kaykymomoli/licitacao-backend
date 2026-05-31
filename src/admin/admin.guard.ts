import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) throw new ForbiddenException('Token não fornecido');
    const { data, error } = await this.supabase.getAdminClient().auth.getUser(token);
    if (error || !data.user) throw new ForbiddenException('Token inválido');
    if (data.user.user_metadata?.role !== 'admin') throw new ForbiddenException('Acesso restrito a administradores');
    return true;
  }
}