import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { passportJwtSecret } from 'jwks-rsa';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private supabase: SupabaseService,
  ) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
      algorithms: ['ES256', 'RS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    this.logger.log(`Token recebido para usuário: ${payload.sub}`);

    const { data, error } = await this.supabase
      .getAdminClient()
      .auth.admin.getUserById(payload.sub);

    if (error || !data.user) {
      this.logger.error(`Usuário não encontrado: ${error?.message}`);
      throw new UnauthorizedException('Usuário não encontrado');
    }

    this.logger.log(`Autenticado: ${payload.email}`);

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}