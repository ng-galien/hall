import type { ApiPrincipal } from "@mairie/api-contract";

declare global {
  namespace Express {
    interface Request {
      principal?: ApiPrincipal;
      sessionId?: string;
      requestId: string;
    }
  }
}
