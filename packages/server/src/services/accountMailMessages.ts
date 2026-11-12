import type { AccountMailKind } from "@hall/api-contract";

export interface AccountMailContent {
  subject: string;
  html: string;
  text: string;
}

export interface AccountMailContext {
  displayName: string;
  email: string;
  communeName: string;
  timeZone: string;
}

type LinkContext = AccountMailContext & { link: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

const paragraphs = (lines: readonly string[]) =>
  lines.map((line) => `<p style="margin:0 0 16px">${escapeHtml(line)}</p>`).join("");

const button = (label: string, link: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;` +
  `background:#1d4ed8;color:#ffffff;border-radius:4px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;

const document = (body: string) =>
  `<!doctype html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;` +
  `line-height:1.5;color:#1f2937">${body}</body></html>`;

function linkMessage(
  subject: string,
  label: string,
  before: readonly string[],
  after: readonly string[],
  link: string,
): AccountMailContent {
  const fallback = "Si le bouton ne s’ouvre pas, copiez cette adresse dans votre navigateur :";
  return {
    subject,
    html: document(
      `${paragraphs(before)}${button(label, link)}${paragraphs([fallback])}` +
        `<p style="margin:0 0 16px;word-break:break-all">${escapeHtml(link)}</p>${paragraphs(after)}`,
    ),
    text: [...before, `${label} : ${link}`, ...after].join("\n\n"),
  };
}

// @implements-requirement HALL-FR-USR-080
/** The three account emails, in French. Only the two link emails carry a link; none carries a password. */
export const accountMailMessages = {
  invitation: (context: LinkContext) =>
    linkMessage(
      "Votre accès à Hall",
      "Choisir mon mot de passe",
      [
        `Bonjour ${context.displayName},`,
        `Un compte Hall a été créé pour vous${context.communeName ? ` par la commune de ${context.communeName}` : ""}. Votre adresse de connexion est ${context.email}.`,
        "Pour choisir votre mot de passe, ouvrez le lien ci-dessous.",
      ],
      [
        "Ce lien est valable sept jours et sert une seule fois. Après ce délai, demandez un nouveau lien depuis la page de connexion de Hall, avec « Mot de passe oublié ? ».",
        "Si vous n’attendiez pas ce message, ignorez-le.",
      ],
      context.link,
    ),
  recovery: (context: LinkContext) =>
    linkMessage(
      "Réinitialiser votre mot de passe Hall",
      "Choisir un nouveau mot de passe",
      [
        `Bonjour ${context.displayName},`,
        `Un nouveau mot de passe a été demandé pour votre compte Hall (${context.email}).`,
      ],
      [
        "Ce lien est valable une heure et sert une seule fois. Votre mot de passe actuel reste valable tant que vous n’en avez pas choisi un nouveau.",
        "Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.",
      ],
      context.link,
    ),
  "password-changed": (context: AccountMailContext & { changedAt: Date }) => {
    const moment = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: context.timeZone,
    }).format(context.changedAt);
    const lines = [
      `Bonjour ${context.displayName},`,
      `Le mot de passe de votre compte Hall (${context.email}) a été modifié le ${moment}. Les sessions ouvertes avec l’ancien mot de passe sont fermées.`,
      "Si vous n’êtes pas à l’origine de ce changement, prévenez le secrétariat de la mairie.",
    ];
    return {
      subject: "Votre mot de passe Hall a été modifié",
      html: document(paragraphs(lines)),
      text: lines.join("\n\n"),
    };
  },
} satisfies Record<AccountMailKind, (context: never) => AccountMailContent>;
