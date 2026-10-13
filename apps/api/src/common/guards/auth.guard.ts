import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import { Request } from "express";
import { auth } from "src/auth/auth";
import { AuthUser } from "src/common/interfaces/auth-user.interface";
import { markVerifiedReadViewer } from "src/common/verified-viewer";

export async function resolveSessionUser(request: Request): Promise<AuthUser | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session) {
    return null;
  }

  const user = { userId: session.user.id, sessionId: session.session.id };
  // `auth.api.getSession` is the delivery-auth wrapper: it requires accountState
  // from the freshly read user row and returns null unless active (no cookie cache). Only that
  // fresh proof may be reused, and only by reads (see common/verified-viewer.ts).
  if (request.method === "GET" || request.method === "HEAD") markVerifiedReadViewer(user);
  return user;
}

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    const user = await resolveSessionUser(request);
    if (!user) {
      throw new UnauthorizedException();
    }

    request.user = user;
    return true;
  }
}
