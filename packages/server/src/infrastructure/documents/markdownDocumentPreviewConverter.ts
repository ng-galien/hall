import { fileTypeFromBuffer } from "file-type";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import TurndownService from "turndown";
import {
  type DocumentPreviewConverter,
  DocumentPreviewConverterFailedError,
} from "../../services/documentPreviewConverter.js";

const rasterImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function createMarkdownDocumentPreviewConverter(): DocumentPreviewConverter {
  return {
    async convertToMarkdown(input) {
      try {
        const result = await mammoth.convertToHtml(
          { buffer: input.content },
          {
            externalFileAccess: false,
            convertImage: mammoth.images.imgElement(async (image) => {
              if (!rasterImageTypes.has(image.contentType)) return { src: "" };
              const content = await image.readAsBuffer();
              const detected = await fileTypeFromBuffer(content);
              if (detected?.mime !== image.contentType) return { src: "" };
              return { src: `data:${image.contentType};base64,${content.toString("base64")}` };
            }),
          },
        );
        const html = sanitizeHtml(result.value, {
          allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
          allowedAttributes: {
            a: ["href", "title"],
            img: ["src", "alt", "title"],
            td: ["colspan", "rowspan"],
            th: ["colspan", "rowspan"],
          },
          allowedSchemes: ["http", "https", "mailto"],
          allowedSchemesByTag: { img: ["data"] },
          allowProtocolRelative: false,
          exclusiveFilter: (frame) =>
            frame.tag === "img" &&
            !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(frame.attribs.src ?? ""),
        });
        const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
        turndown.keep("table");
        return Buffer.from(turndown.turndown(html), "utf8");
      } catch {
        throw new DocumentPreviewConverterFailedError();
      }
    },
  };
}
