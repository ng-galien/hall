import type { ApiPrincipal } from "@hall/api-contract";

declare global {
  namespace Express {
    interface Request {
      principal?: ApiPrincipal;
      sessionId?: string;
      requestId: string;
    }
  }
}
