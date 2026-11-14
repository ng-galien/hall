import type { RequestHandler } from "express";
import multer from "multer";
import type { RequestContextStore } from "../security/requestContext.js";
import { uploadFileName } from "./uploadFileName.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/** Reads the multipart field `file` in memory, keeps its UTF-8 name and resumes in the request context. */
export function singleFileUpload(requestContext: RequestContextStore): RequestHandler {
  return (request, response, next) => {
    const context = requestContext.current();
    upload.single("file")(request, response, (error) => {
      if (request.file) request.file.originalname = uploadFileName(request.file.originalname);
      const resume = () => (error ? next(error) : next());
      if (context) requestContext.run(context, resume);
      else resume();
    });
  };
}
