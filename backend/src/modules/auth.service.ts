import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { LoginDto } from '../common/dto';

const SECRET = process.env.API_SECRET || process.env.JWT_SECRET || 'smart_classroom_jwt_secret_2026';

export interface AuthUser {
  id: string;
  username: string;
  role: 'VIEWER' | 'OPERATOR' | 'ADMIN';
  name: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DataSource) {}

  hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  generateToken(user: AuthUser): string {
    const payload = JSON.stringify({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      exp: Date.now() + 24 * 3600 * 1000 // 24h
    });
    const b64 = Buffer.from(payload).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(b64).digest('base64url');
    return `${b64}.${sig}`;
  }

  verifyToken(token: string): AuthUser | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [b64, sig] = parts;
      const expectedSig = createHmac('sha256', SECRET).update(b64).digest('base64url');
      if (sig !== expectedSig) return null;
      const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp < Date.now()) return null;
      return {
        id: payload.id,
        username: payload.username,
        role: payload.role,
        name: payload.name
      };
    } catch {
      return null;
    }
  }

  async login(dto: LoginDto) {
    const hashed = this.hashPassword(dto.password);
    const [user] = await this.db.query(
      `SELECT id, username, role, name FROM users WHERE username = $1 AND password_hash = $2`,
      [dto.username, hashed]
    );

    if (!user) {
      throw new UnauthorizedException('Sai tên đăng nhập hoặc mật khẩu.');
    }

    const token = this.generateToken(user);
    return {
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
      }
    };
  }

  async getProfile(userId: string) {
    const [user] = await this.db.query(
      `SELECT id, username, role, name, created_at FROM users WHERE id = $1`,
      [userId]
    );
    if (!user) throw new UnauthorizedException('Không tìm thấy tài khoản.');
    return user;
  }
}
