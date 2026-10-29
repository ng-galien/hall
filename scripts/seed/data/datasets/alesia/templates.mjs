export async function seedTemplates({ post }) {
  console.log("- Templates PDF et Outlook");
  await post("/templates", {
    kind: "pdf",
    documentType: "meeting-notice",
    name: "Convocation au conseil de l’oppidum",
    bodyMarkdown: "::meeting-notice",
    stylesheet: "h1 { color: #102a83; }",
    headerHtml: '<div style="font-size:10px">Oppidum d’Alésia</div>',
    footerHtml: '<div style="font-size:9px;width:100%;text-align:center">Conseil de l’oppidum</div>',
  });
  await post("/templates", {
    kind: "message",
    documentType: "meeting-notice-message",
    name: "Message de convocation Outlook",
    subject: "Convocation au conseil de l’oppidum du :field{name=meeting.startsAt}",
    bodyMarkdown: "::meeting-notice\n\nLe PDF de la convocation est joint à ce message.",
  });

  await post("/templates", {
    kind: "pdf",
    documentType: "minutes",
    name: "Procès-verbal du conseil",
    bodyMarkdown:
      "# Procès-verbal du conseil\n\n## Séance, présences et pouvoirs\n\n::minutes{section=facts}\n\n## Examen des points\n\n::minutes{section=proceedings}",
    stylesheet: "h1 { color: #102a83; } h2 { break-after: avoid; }",
    headerHtml: '<div style="font-size:10px">Oppidum d’Alésia</div>',
    footerHtml:
      '<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });

  await post("/templates", {
    kind: "pdf",
    documentType: "deliberation-list",
    name: "Liste des délibérations du conseil de l’oppidum",
    bodyMarkdown: "::deliberation-list",
    stylesheet:
      "h1 { color: #102a83; } table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 4px; border-bottom: 1px solid #bbb; }",
    headerHtml: '<div style="font-size:10px">Oppidum d’Alésia</div>',
    footerHtml: "",
  });

  await post("/templates", {
    kind: "pdf",
    documentType: "council-decision",
    name: "Délibération du conseil de l’oppidum",
    bodyMarkdown:
      "::council-decision{section=facts}\n\n::council-decision{section=content}\n\n::council-decision{section=result}",
    stylesheet:
      "body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.28; color: #111; } h1 { font-size: 16pt; text-align: center; text-transform: uppercase; text-decoration: underline; margin: 0 0 6mm; break-after: avoid; } h2 { font-size: 12pt; break-after: avoid; } .decision-facts > h2 { text-align: center; text-decoration: underline; font-size: 15pt; margin: 7mm 0 9mm; } .decision-facts-columns { display: grid; grid-template-columns: 2fr 3fr; gap: 5mm; margin-bottom: 5mm; } .decision-counts { border-right: 1px solid #111; padding-right: 4mm; } .decision-counts dl { display: grid; grid-template-columns: 1fr auto; row-gap: 4mm; margin: 0; } .decision-counts .decision-dates { margin-top: 12mm; } .decision-dates dt { font-weight: normal; } .decision-counts dt, .decision-counts dd { border-top: 1px solid #555; border-bottom: 1px solid #555; margin: 0; padding: 1mm; } .decision-counts dt { border-left: 1px solid #555; font-weight: bold; } .decision-counts dd { border-right: 1px solid #555; text-align: right; min-width: 6mm; } .decision-opening p { margin: 0 0 4mm; orphans: 3; widows: 3; } .decision-number { margin: 0 0 4mm; font-size: 10pt; break-after: avoid; } .decision-content > h2 { text-align: center; text-transform: uppercase; margin: 0 0 6mm; } .decision-content p { margin: 0 0 3mm; orphans: 3; widows: 3; } .decision-content ul, .decision-content ol { padding-left: 6mm; margin: 2mm 0 4mm; } .decision-content li { margin-bottom: 2mm; } .decision-content li:not(:has(ul, ol)) { break-inside: avoid; } .decision-content h3, .decision-content h4 { break-after: avoid; margin-bottom: 2mm; } .decision-content table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; break-inside: avoid; } .decision-content th, .decision-content td { padding: 1.5mm; border-bottom: 1px solid #bbb; } .decision-content th { text-align: left; } .decision-content td:last-child { text-align: right; white-space: nowrap; } .decision-conclusion { break-inside: avoid; margin-top: 5mm; } .decision-result { border-top: 1px solid #777; padding-top: 3mm; margin: 0 0 6mm; font-size: 10pt; } .decision-signatures { display: grid; grid-template-columns: 1fr 1fr; text-align: center; gap: 8mm; min-height: 24mm; } .decision-signatures p { margin: 0; }",
    headerHtml: "",
    footerHtml: "",
  });
}
