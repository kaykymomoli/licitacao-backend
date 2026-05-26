import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private supabase: SupabaseService) {}

  // Faz upload de arquivo para o Supabase Storage
  async uploadFile(
    userId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ path: string; url: string }> {
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${userId}/${Date.now()}_${sanitizedName}`;

    const { error } = await this.supabase
      .getAdminClient()
      .storage
      .from('uploads')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      this.logger.error(`Erro ao fazer upload: ${error.message}`);
      throw new Error(`Erro ao salvar arquivo: ${error.message}`);
    }

    const { data } = this.supabase
      .getAdminClient()
      .storage
      .from('uploads')
      .getPublicUrl(filePath);

    return {
      path: filePath,
      url: data.publicUrl,
    };
  }

  // Deleta um arquivo do Storage
  async deleteFile(filePath: string): Promise<void> {
    await this.supabase
      .getAdminClient()
      .storage
      .from('uploads')
      .remove([filePath]);
  }
}