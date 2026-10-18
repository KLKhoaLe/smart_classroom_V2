import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
@Injectable()
export class LocalGuard implements CanActivate {
 canActivate(ctx:ExecutionContext){const r=ctx.switchToHttp().getRequest();
  if(r.path==='/api/health')return true;
  const origin=r.headers.origin;
  if(origin&&origin!==(process.env.FRONTEND_ORIGIN||'http://localhost:3000'))throw new ForbiddenException('Origin không được phép.');
  const token=process.env.API_TOKEN;
  if(token){const a=Buffer.from(String(r.headers.authorization||'')),b=Buffer.from('Bearer '+token);if(a.length!==b.length||!timingSafeEqual(a,b))throw new UnauthorizedException('Sai API_TOKEN.');}
  return true;
 }
}
