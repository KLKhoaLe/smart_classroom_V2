import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { ROLES_KEY } from './roles.decorator';
import { AuthService, AuthUser } from '../modules/auth.service';

const ROLE_HIERARCHY: Record<string, number> = {
  VIEWER: 1,
  OPERATOR: 2,
  ADMIN: 3
};

@Injectable()
export class LocalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly auth?: AuthService
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const r = ctx.switchToHttp().getRequest();
    const path = r.path || '';

    // 1. Public endpoints
    if (path === '/api/health' || path === '/api/auth/login' || path.startsWith('/api/docs')) {
      return true;
    }

    // 2. Origin check
    const origin = r.headers.origin;
    const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
    if (origin && origin !== allowedOrigin) {
      throw new ForbiddenException('Origin không được phép.');
    }

    const authHeader = String(r.headers.authorization || '');
    const serviceToken = process.env.API_TOKEN;

    // 3. Service Token check (dành cho simulator, n8n, worker)
    if (serviceToken && authHeader === 'Bearer ' + serviceToken) {
      r.user = { id: 'service', username: 'service', role: 'ADMIN', name: 'Service Token' };
      return true;
    }

    // 4. User Token check (dành cho người dùng web có login)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const user = this.auth ? this.auth.verifyToken(token) : null;
      if (user) {
        r.user = user;
      } else if (serviceToken) {
        // Có header nhưng sai token và backend yêu cầu service token
        throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn.');
      }
    }

    // 5. Nếu backend cấu hình API_TOKEN bắt buộc nhưng client không gửi bất kỳ token hợp lệ nào
    if (serviceToken && !r.user) {
      throw new UnauthorizedException('Yêu cầu Authorization header hợp lệ.');
    }

    // 6. Mặc định cho dev local nếu không cấu hình API_TOKEN
    if (!r.user) {
      r.user = { id: 'local-dev', username: 'local', role: 'ADMIN', name: 'Local Dev User' };
    }

    // 7. RBAC Check qua @Roles()
    const requiredRoles = this.reflector.getAllAndOverride<('VIEWER' | 'OPERATOR' | 'ADMIN')[]>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()]
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const userRole = r.user?.role || 'VIEWER';
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;

    // Cho phép nếu role người dùng có cấp bậc >= role tối thiểu được yêu cầu
    const hasPermission = requiredRoles.some(reqRole => {
      const requiredLevel = ROLE_HIERARCHY[reqRole] ?? 99;
      return userLevel >= requiredLevel;
    });

    if (!hasPermission) {
      throw new ForbiddenException(`Quyền truy cập không đủ. Yêu cầu một trong các quyền: ${requiredRoles.join(', ')}.`);
    }

    return true;
  }
}
