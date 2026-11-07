import type { NextFunction, Request, Response } from "express";
import { canExecute, requireAction } from "../security/authorization.js";

// @implements-requirement HALL-FR-USR-060
/** Content downloads and generated files are exports; previews and embedded assets are readings. */
export function isExportHref(href: string): boolean {
  const path = new URL(href, "http://hall.invalid").pathname;
  if (path.startsWith("/api/resources/editor-assets/") || path.startsWith("/api/resources/binary-references/"))
    return false;
  return /\/(?:content(?:\.pdf)?|deliberation-list\.pdf|attendance-sheet\.pdf|proxy-form\.pdf|dossier|bundle)$/.test(
    path,
  );
}

export function requireApplicationReading(request: Request, response: Response, next: NextFunction): void {
  if (request.method !== "GET" && request.method !== "HEAD") {
    next();
    return;
  }
  requireAction("application.read")(request, response, () => {
    if (isExportHref(request.originalUrl)) {
      void requireAction("application.export")(request, response, next).catch(next);
    } else next();
  }).catch(next);
}

export function canFollowReadHref(request: Request, href: string): boolean {
  const path = new URL(href, "http://hall.invalid").pathname;
  if (!path.startsWith("/api/") || path.startsWith("/api/auth/") || path === "/api/health") return true;
  if (path.startsWith("/api/roles")) return path === "/api/roles/options" || canExecute(request, "role.list");
  if (path.startsWith("/api/users") || path.startsWith("/api/audit-events")) return true;
  return canExecute(request, "application.read") && (!isExportHref(path) || canExecute(request, "application.export"));
}
