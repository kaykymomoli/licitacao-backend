import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient;
  private adminClient: SupabaseClient;

  constructor(private config: ConfigService) {
  }

onModuleInit() {
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL');
    const anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');
    const serviceRoleKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.client = createClient(supabaseUrl, anonKey);
    this.adminClient = createClient(supabaseUrl, serviceRoleKey);
  }
  
  // Retorna client autenticado com o JWT do usuário
  getClient(accessToken?: string): SupabaseClient {
    if (accessToken) {
      this.client.auth.setSession({
        access_token: accessToken,
        refresh_token: '',
      });
    }
    return this.client;
  }

  // Retorna client admin (operações internas do backend)
  getAdminClient(): SupabaseClient {
    return this.adminClient;
  }
}