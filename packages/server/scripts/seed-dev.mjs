/**
 * Development seed for the fictional Hall instance of Saint-Aubin.
 *
 * Populates the currently migrated PostgreSQL surfaces through their HTTP APIs, never
 * through direct SQL: contacts, members, classified resources and council business.
 *
 * The default scenario has two closed meetings and one meeting in progress.
 * SEED_MEETING_SCENARIO=preparation leaves the initial meeting untouched for isolated UI tests.
 * SEED_MEETING_SCENARIO=minutes closes the third meeting but leaves its minutes editable, without generating a PDF.
 * Requires a running development server backed by an empty database.
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const API = process.env.SEED_API ?? "http://127.0.0.1:3100/api";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Hall-demo-2026!";

function unwrapRepresentation(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.class)) return payload;
  if (Array.isArray(payload.properties?.items)) return payload.properties.items;
  if (payload.class.some((name) => name.endsWith("-collection")) && Array.isArray(payload.entities)) {
    return payload.entities.map((entity) => entity.properties);
  }
  return payload.properties ?? payload;
}

async function request(method, path, body) {
  const init = { method };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${API}${path}`, init);
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : unwrapRepresentation(await response.json());
}
const get = (path) => request("GET", path);
const post = (path, body) => request("POST", path, body);
const put = (path, body) => request("PUT", path, body);
const patch = (path, body) => request("PATCH", path, body);

async function setResourceTags(resource, tags) {
  if (tags.length === 0) return resource;
  const editable = ["text", "remote", "spreadsheet", "geographic"].includes(resource.kind);
  return patch(`/resources/${resource.id}/metadata`, {
    path: resource.path,
    name: resource.name,
    tags,
    editing: editable ? { kind: "autosave", enabled: resource.autosaveEnabled } : { kind: "fixed" },
  });
}

async function createWorkspaceResource(input, tags = []) {
  return setResourceTags(await post("/resources", input), tags);
}

async function createGeographicResource({ name, path, tags = [], view, layers, hallLayer }) {
  const created = await createWorkspaceResource({ kind: "geographic", name, path }, tags);
  if (!view && !layers && !hallLayer) return created;
  return put(`/resources/${created.id}/content`, {
    kind: "geographic",
    expectedVersion: created.version,
    document: {
      ...created.document,
      ...(view ? { view } : {}),
      ...(layers ? { layers } : {}),
      ...(hallLayer ? { hallLayer } : {}),
    },
  });
}

/** Generates a dependency-free, single-page A4 PDF using Helvetica and WinAnsi. */
function makePdf(title, lines) {
  const esc = (text) =>
    text
      .replace(/\u2014/g, "-")
      .replace(/’/g, "'")
      .replace(/œ/g, "oe")
      .replace(/…/g, "...")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  let y = 760;
  const ops = [`BT /F1 16 Tf 56 792 Td (${esc(title)}) Tj ET`];
  for (const line of lines) {
    ops.push(`BT /F1 11 Tf 56 ${y} Td (${esc(line)}) Tj ET`);
    y -= 18;
  }
  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(entries) {
  const localEntries = [];
  const centralEntries = [];
  let localOffset = 0;
  for (const [name, rawContent] of entries) {
    const nameBytes = Buffer.from(name);
    const content = Buffer.from(rawContent);
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([localHeader, nameBytes, content]);
    localEntries.push(localEntry);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralEntries.push(Buffer.concat([centralHeader, nameBytes]));
    localOffset += localEntry.length;
  }
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localEntries, centralDirectory, end]);
}

function makeDocx(text) {
  const mainType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  return makeStoredZip([
    [
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${mainType}"/></Types>`,
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ],
  ]);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function spreadsheetColumn(index) {
  let value = index + 1;
  let column = "";
  while (value > 0) {
    value -= 1;
    column = String.fromCharCode(65 + (value % 26)) + column;
    value = Math.floor(value / 26);
  }
  return column;
}

export function makeXlsx(rows) {
  const worksheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${spreadsheetColumn(columnIndex)}${rowIndex + 1}`;
          if (typeof value === "number") return `<c r="${reference}"><v>${value}</v></c>`;
          const style = rowIndex === 0 ? ' s="1"' : "";
          return `<c r="${reference}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const lastColumn = spreadsheetColumn(
    Math.max(0, rows.reduce((maximum, row) => Math.max(maximum, row.length), 1) - 1),
  );
  const lastRow = Math.max(1, rows.length);
  return makeStoredZip([
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      "xl/workbook.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Subventions 2026" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    [
      "xl/styles.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ],
    [
      "xl/worksheets/sheet1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="45" customWidth="1"/></cols><sheetData>${worksheetRows}</sheetData><pageSetup orientation="landscape" paperSize="9"/></worksheet>`,
    ],
  ]);
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function makePng() {
  const width = 320;
  const height = 180;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const pixel = row + 1 + x * 3;
      scanlines[pixel] = 30 + Math.round((x / width) * 50);
      scanlines[pixel + 1] = 90 + Math.round((y / height) * 80);
      scanlines[pixel + 2] = 150;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function uploadDocument({ title, fileName, folderPath = "", tags = [], content, mediaType }) {
  const form = new FormData();
  form.set("name", title);
  form.set("path", folderPath);
  form.set("file", new File([content], fileName, { type: mediaType }));
  return setResourceTags(await request("POST", "/resources/documents", form), tags);
}

async function importSpreadsheet({ title, fileName, folderPath = "", content, mediaType }) {
  const form = new FormData();
  form.set("name", title);
  form.set("path", folderPath);
  form.set("file", new File([content], fileName, { type: mediaType }));
  return request("POST", "/resources/spreadsheets/import", form);
}

async function uploadPdf({ title, fileName, folderPath = "", tags = [], lines }) {
  return uploadDocument({
    title,
    fileName,
    folderPath,
    tags,
    content: makePdf(title, lines),
    mediaType: "application/pdf",
  });
}

const daysFromNow = (days, hour = 18, minute = 30) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

async function seedCouncilMeetings(members, businesses) {
  const memberList = Object.values(members);
  const chairMemberId = members.Delcourt.id;
  const secretaryMemberId = members.Charpentier.id;
  const at = (base, minutes) => new Date(new Date(base).getTime() + minutes * 60_000).toISOString();
  const proxy = await uploadPdf({
    title: "Pouvoir de démonstration - conseil municipal",
    fileName: "pouvoir-demo.pdf",
    folderPath: "seed",
    lines: [
      "DONNEES FICTIVES - DEMONSTRATION",
      "Catherine Petit donne pouvoir a Bernard Lefevre pour la seance de demonstration.",
      "Ce document sert uniquement aux essais de l'interface.",
    ],
  });
  async function schedule(meeting, business, position, kind = "councilDecisionProposal") {
    const item = await post(`/council-meetings/${meeting.id}/agenda-items`, {
      councilBusinessId: business.id,
      position,
      kind,
    });
    if (kind === "councilDecisionProposal") {
      const resource = await get(`/resources/${item.subject.textResourceId}`);
      await put(`/resources/${resource.id}/content`, {
        kind: "text",
        expectedVersion: resource.version,
        content: `## Projet de délibération\n\n### ${business.name}\n\nAprès examen du rapport et des pièces jointes, le conseil municipal est invité à :\n\n1. Approuver les orientations présentées dans le rapport.\n2. Autoriser le maire à mettre en œuvre les démarches correspondantes.\n3. Prévoir un bilan lors d'une prochaine séance.\n\n*Exemple fictif destiné à tester l'interface.*`,
      });
    }
    return item;
  }
  async function open(meeting, date) {
    await put(`/council-meetings/${meeting.id}/prepare`, {
      scheduledAt: date,
      location: "Salle du conseil",
      chairMemberId,
      secretaryMemberId,
    });
    const attendance = await post(`/council-meetings/${meeting.id}/attendance`, {
      attendance: memberList.map((member) => {
        if (member.id === members.Petit.id)
          return {
            councilMemberId: member.id,
            status: "represented",
            proxyHolderCouncilMemberId: members.Lefèvre.id,
            proxyDocumentId: proxy.id,
          };
        if (member.id === members.Fontaine.id) return { councilMemberId: member.id, status: "excused" };
        if (member.id === members.Garnier.id) return { councilMemberId: member.id, status: "absent" };
        return { councilMemberId: member.id, status: "present" };
      }),
    });
    await post(`/council-meetings/${meeting.id}/start`, { startedAt: date });
    return attendance.filter((entry) => entry.status === "present" || entry.status === "represented");
  }
  async function vote(meeting, item, attendance, date, minute, mode, approve, reject) {
    await post(`/council-meetings/${meeting.id}/agenda-items/${item.id}/start`, { startedAt: at(date, minute) });
    await patch(`/council-meetings/${meeting.id}/agenda-items/${item.id}/notes`, {
      discussionSummary: "Le rapport est présenté au conseil. Les conseillers échangent sur les modalités de mise en œuvre et demandent un bilan lors d’une prochaine séance.",
    });
    const ballot = await post("/ballots", {
      agendaItemId: item.id,
      mode,
      participantAttendanceIds: attendance.map((entry) => entry.id),
      chairmanAttendanceId: attendance.find((entry) => entry.councilMemberId === chairMemberId).id,
    });
    const abstain = attendance.length - approve - reject;
    if (mode === "public") {
      const participation = await get(`/ballots/${ballot.id}/participations`);
      await post(`/ballots/${ballot.id}/votes`, {
        mode,
        votes: participation.map((entry, index) => ({
          ballotParticipationId: entry.id,
          choice: index < approve ? "approve" : index < approve + reject ? "reject" : "abstain",
        })),
      });
    } else {
      await post(`/ballots/${ballot.id}/votes`, { mode, totals: { approve, reject, abstain } });
    }
    await post(`/ballots/${ballot.id}/complete`, { completedAt: at(date, minute + 8) });
  }
  async function close(meeting, date) {
    const closure = await post(`/council-meetings/${meeting.id}/close`, { closedAt: at(date, 60) });
    const draft = await get(`/minutes/${closure.minutes.id}`);
    await post(`/minutes/${draft.id}/generate`, { expectedVersion: draft.version });
    return closure;
  }
  const first = await post("/council-meetings", { quorum: 8 });
  const firstItems = [
    await schedule(first, businesses[1], 1),
    await schedule(first, businesses[2], 2),
    await schedule(first, businesses[6], 3, "openQuestion"),
  ];
  const firstDate = daysFromNow(-60);
  const firstAttendance = await open(first, firstDate);
  await vote(first, firstItems[0], firstAttendance, firstDate, 5, "public", 10, 2);
  await vote(first, firstItems[1], firstAttendance, firstDate, 20, "public", 4, 8);
  await post(`/council-meetings/${first.id}/agenda-items/${firstItems[2].id}/start`, { startedAt: at(firstDate, 35) });
  await post(`/council-meetings/${first.id}/agenda-items/${firstItems[2].id}/complete`, {
    completedAt: at(firstDate, 45),
  });
  const { nextMeeting: second } = await close(first, firstDate);

  const approval1 = (await get(`/council-meetings/${second.id}/agenda-items`))[0];
  const grants = await schedule(second, businesses[5], 2);
  const motion = await schedule(second, businesses[3], 3);
  const deferred = await schedule(second, businesses[7], 4, "openQuestion");
  const secondDate = daysFromNow(-28);
  const secondAttendance = await open(second, secondDate);
  await vote(second, approval1, secondAttendance, secondDate, 2, "public", 13, 0);
  await vote(second, grants, secondAttendance, secondDate, 15, "public", 11, 1);
  await vote(second, motion, secondAttendance, secondDate, 30, "secret", 7, 4);
  await post(`/council-meetings/${second.id}/agenda-items/${deferred.id}/adjourn`, { adjournedAt: at(secondDate, 45) });
  const { nextMeeting: current } = await close(second, secondDate);

  const currentAgenda = await get(`/council-meetings/${current.id}/agenda-items`);
  const lighting = await schedule(current, businesses[4], 3);
  const parking = await schedule(current, businesses[8], 4, "openQuestion");
  await put(`/council-meetings/${current.id}/agenda-order`, {
    agendaItemIds: [currentAgenda[0].id, lighting.id, currentAgenda[1].id, parking.id],
  });
  const currentDate = new Date(Date.now() - 75 * 60_000).toISOString();
  const currentAttendance = await open(current, currentDate);
  await vote(current, currentAgenda[0], currentAttendance, currentDate, 2, "public", 12, 0);
  await vote(current, lighting, currentAttendance, currentDate, 15, "public", 9, 3);
  await post(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/start`, {
    startedAt: at(currentDate, 30),
  });
  if (process.env.SEED_MEETING_SCENARIO === "minutes") {
    await patch(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/notes`, {
      discussionSummary: "## Échanges sur le projet\n\nLe conseil examine les observations recueillies auprès des habitants. Une visite sur place est proposée avant la prochaine réunion.\n\nLa commission présentera ses conclusion lors de la prochaine séance.\n\n*Données fictives. Corriger « conclusion » en « conclusions » pour essayer l’enregistrement automatique avant génération.*",
    });
    await post(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/complete`, {
      completedAt: at(currentDate, 45),
    });
    const closure = await post(`/council-meetings/${current.id}/close`, { closedAt: at(currentDate, 60) });
    const draft = await get(`/minutes/${closure.minutes.id}`);
    if (draft.generatedAt !== null || draft.documentId !== null || !draft.sections.some((section) => section.content.includes("ses conclusion"))) {
      throw new Error("Minutes seed must provide an editable draft containing the recorded discussion");
    }
    console.log(`  PV à corriger puis générer : /app/minutes/${draft.id}`);
    console.log("  Deux PV historiques générés ; le troisième reste en brouillon, avec présences et résultats figés.");
    return;
  }
  console.log(
    `  Deux séances clôturées, sept scrutins terminés, une séance en cours : /app/meetings/${current.id}/live`,
  );
}

async function main() {
  const inspectedCollections = await Promise.all([
    get("/contacts"),
    get("/council-members"),
    get("/council-committees"),
    get("/users"),
    get("/resources"),
    get("/council-business"),
    get("/council-decisions"),
    get("/council-meetings"),
    get("/templates"),
  ]);
  if (inspectedCollections.some((items) => items.length > 0)) {
    console.error("La base n'est pas vide : seed annulé. Supprimez packages/server/data/hall.sqlite et relancez.");
    process.exit(1);
  }

  console.log("- Configuration de la commune");
  await put("/settings", {
    name: "Saint-Aubin",
    inseeCode: "12345",
    siren: "123456789",
    population: 2_500,
    populationReferenceDate: "2026-01-01",
    addressLine1: "1 place de la Mairie",
    addressLine2: "",
    postalCode: "12345",
    city: "Saint-Aubin",
    geographicPosition: [2.1402, 48.7152],
    phone: "+33 1 23 45 67 89",
    email: "contact@saint-aubin.fr",
    website: "https://saint-aubin.fr",
    defaultMeetingLocation: "Salle du conseil",
    timeZone: "Europe/Paris",
    outboundEmailSenderName: "Conseil municipal de Saint-Aubin",
    outboundEmailSenderAddress: "conseil@saint-aubin.fr",
    outboundEmailReplyToAddress: "secretariat@saint-aubin.fr",
  });

  await put("/council-terms", { expectedMemberCount: 15 });

  console.log("- Contacts et membres du conseil");
  const membersSpec = [
    ["Martine", "Delcourt", "mayor"],
    ["Bernard", "Lefèvre", "deputyMayor"],
    ["Sophie", "Renaud", "deputyMayor"],
    ["Patrick", "Morel", "deputyMayor"],
    ["Isabelle", "Charpentier", "councillor"],
    ["Jean-Marc", "Baudry", "councillor"],
    ["Claire", "Vasseur", "councillor"],
    ["Thierry", "Lambert", "councillor"],
    ["Nadia", "Benali", "councillor"],
    ["François", "Guérin", "councillor"],
    ["Élodie", "Marchand", "councillor"],
    ["Didier", "Rousseau", "councillor"],
    ["Catherine", "Petit", "councillor"],
    ["Olivier", "Fontaine", "councillor"],
    ["Sylvie", "Garnier", "councillor"],
  ];
  const members = {};
  for (const [memberIndex, [firstName, lastName, role]] of membersSpec.entries()) {
    const contact = await post("/contacts", {
      firstName,
      lastName,
      email: `${firstName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z-]/g, "")}.${lastName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z-]/g, "")}@saint-aubin.fr`,
      phone: `+33 6 10 20 30 ${String(memberIndex + 1).padStart(2, "0")}`,
      organizationName: "Commune de Saint-Aubin",
      jobTitle: role === "mayor" ? "Maire" : role === "deputyMayor" ? "Adjoint au maire" : "Conseiller municipal",
      notes: "",
    });
    members[lastName] = await post("/council-members", {
      contactId: contact.id,
      role,
      termStartedOn: "2026-03-15",
    });
  }

  await post("/contacts", {
    firstName: "Camille",
    lastName: "Perrin",
    organizationName: "Préfecture",
    jobTitle: "Référente contrôle de légalité",
    email: "camille.perrin@prefecture.example",
    phone: "+33 1 40 00 00 01",
    notes: "Interlocutrice pour les transmissions des actes.",
  });
  await post("/contacts", {
    firstName: "Hugo",
    lastName: "Roy",
    organizationName: "Association des commerçants",
    jobTitle: "Président",
    email: "hugo.roy@example.fr",
    phone: null,
    notes: "",
  });

  console.log("- Commissions municipales");
  const schoolCommittee = await post("/council-committees", {
    name: "Commission affaires scolaires",
    description: "Prépare les sujets relatifs aux écoles et à la restauration scolaire.",
  });
  const communityLifeCommittee = await post("/council-committees", {
    name: "Commission vie associative",
    description: "Examine les demandes des associations et prépare les propositions de soutien.",
  });
  await post(`/council-committees/${schoolCommittee.id}/memberships`, {
    councilMemberId: members.Renaud.id,
    role: "chair",
    startedOn: "2026-03-15",
  });
  await post(`/council-committees/${schoolCommittee.id}/memberships`, {
    councilMemberId: members.Charpentier.id,
    role: "member",
    startedOn: "2026-03-15",
  });
  await post(`/council-committees/${communityLifeCommittee.id}/memberships`, {
    councilMemberId: members.Morel.id,
    role: "chair",
    startedOn: "2026-03-15",
  });
  await post(`/council-committees/${communityLifeCommittee.id}/memberships`, {
    councilMemberId: members.Baudry.id,
    role: "member",
    startedOn: "2026-03-15",
  });

  console.log("- Utilisateurs, rôles et rattachements au conseil");
  const usersSpec = [
    {
      email: "martine.delcourt@saint-aubin.fr",
      displayName: "Martine Delcourt",
      roles: ["administrator"],
      councilMemberId: null,
    },
    {
      email: "secretariat@saint-aubin.fr",
      displayName: "Secrétariat de mairie",
      roles: ["clerk"],
      councilMemberId: null,
    },
    {
      email: "jean-marc.baudry@saint-aubin.fr",
      displayName: "Jean-Marc Baudry",
      roles: ["contributor"],
      councilMemberId: null,
    },
    {
      email: "bernard.lefevre@saint-aubin.fr",
      displayName: "Bernard Lefèvre",
      roles: ["meetingConductor"],
      councilMemberId: null,
    },
    {
      email: "claire.vasseur@saint-aubin.fr",
      displayName: "Claire Vasseur",
      roles: ["reader"],
      councilMemberId: null,
    },
  ];
  for (const user of usersSpec) await post("/users", { ...user, password: DEMO_PASSWORD });
  for (const user of usersSpec) {
    const authenticated = await post("/auth/login", { email: user.email, password: DEMO_PASSWORD });
    if (authenticated.email !== user.email || user.roles.some((role) => !authenticated.roles.includes(role))) {
      throw new Error(`Le compte de démonstration ${user.email} ne restitue pas les rôles attendus`);
    }
  }
  console.log(`  Mot de passe de démonstration : ${DEMO_PASSWORD}`);

  console.log("- Ressources (textes, documents, carte et liens web)");
  await createWorkspaceResource(
    {
      kind: "remote",
      name: "Code général des collectivités territoriales",
      path: "administration/conseil-municipal",
      target: { kind: "url", url: "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070633/" },
    },
    ["droit", "conseil municipal", "référence"],
  );
  await createGeographicResource({
    name: "Repérage de la rénovation de l'éclairage public",
    path: "travaux/eclairage",
    tags: ["travaux", "éclairage", "repérage"],
    layers: [
      { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 },
      { id: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS", visible: true, opacity: 0.65 },
    ],
    hallLayer: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: randomUUID(),
          properties: {
            kind: "marker",
            visible: true,
            label: "Départ de la tranche 2",
            style: { color: "#1b2a78", size: "medium" },
          },
          geometry: { type: "Point", coordinates: [2.3508, 48.8572] },
        },
        {
          type: "Feature",
          id: randomUUID(),
          properties: {
            kind: "line",
            visible: true,
            label: "Secteur à rénover",
            style: { color: "#a2620b", width: 3 },
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [2.3508, 48.8572],
              [2.353, 48.8568],
              [2.3541, 48.8557],
            ],
          },
        },
      ],
    },
  });

  console.log("- Dossier seed de repérage des types de ressources");
  const seedFolderPath = "seed";
  await createWorkspaceResource({ kind: "folder", path: "", name: seedFolderPath });
  await createWorkspaceResource({ kind: "folder", path: seedFolderPath, name: "dossier-vide" });
  await createWorkspaceResource(
    {
      kind: "text",
      name: "Ressource texte",
      path: seedFolderPath,
      content: "Cette note éditable sert de repère pour la ressource texte dans l’espace de travail.",
    },
    ["seed", "texte"],
  );
  await createWorkspaceResource(
    {
      kind: "spreadsheet",
      name: "Ressource tableur",
      path: seedFolderPath,
      document: {
        schemaVersion: 2,
        workbook: {
          id: "seed-budget-workbook",
          name: "Ressource tableur",
          appVersion: "0.25.1",
          locale: "frFR",
          styles: {},
          sheetOrder: ["budget", "hypotheses"],
          sheets: {
            budget: {
              id: "budget",
              name: "Budget",
              rowCount: 20,
              columnCount: 8,
              cellData: {
                0: {
                  0: { v: "Poste", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  1: { v: "Quantité", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  2: { v: "Prix unitaire HT", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  3: { v: "Total HT", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  4: { v: "TVA", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  5: { v: "Date prévisionnelle", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                },
                1: {
                  0: { v: "Tables pliantes" },
                  1: { v: 12, s: { n: { pattern: "#,##0.00" } } },
                  2: { v: 89.9, s: { n: { pattern: "#,##0.00 [$€-fr-FR]" } } },
                  3: { f: "=ROUND(B2*C2,2)", s: { n: { pattern: "#,##0.00 [$€-fr-FR]" } } },
                  4: { v: 0.2, s: { n: { pattern: "0.00%" } } },
                  5: { v: "2026-10-15" },
                },
                2: {
                  0: { v: "Chaises" },
                  1: { v: 48, s: { n: { pattern: "#,##0.00" } } },
                  2: { v: 34.5, s: { n: { pattern: "#,##0.00 [$€-fr-FR]" } } },
                  3: { f: "=ROUND(B3*C3,2)", s: { n: { pattern: "#,##0.00 [$€-fr-FR]" } } },
                  4: { v: 0.2, s: { n: { pattern: "0.00%" } } },
                  5: { v: "2026-10-15" },
                },
                3: {
                  0: { v: "Chariot de rangement" },
                  1: { v: 2, s: { n: { pattern: "#,##0.00" } } },
                  2: { v: 279, s: { n: { pattern: "#,##0.00 [$€-fr-FR]" } } },
                  3: { f: "=ROUND(B4*C4,2)", s: { n: { pattern: "#,##0.00 [$€-fr-FR]" } } },
                  4: { v: 0.2, s: { n: { pattern: "0.00%" } } },
                  5: { v: "2026-11-02" },
                },
                4: {
                  0: { v: "Total", s: { bl: 1 } },
                  3: { f: "=ROUND(SUM(D2:D4),2)", s: { bl: 1, n: { pattern: "#,##0.00 [$€-fr-FR]" } } },
                },
              },
              rowData: { 0: { h: 30 }, 1: { h: 24 }, 2: { h: 24 }, 3: { h: 24 }, 4: { h: 26 } },
              columnData: {
                0: { w: 210 },
                1: { w: 90 },
                2: { w: 140 },
                3: { w: 140 },
                4: { w: 90 },
                5: { w: 150 },
              },
              mergeData: [{ startRow: 4, startColumn: 0, endRow: 4, endColumn: 2 }],
              showGridlines: 1,
            },
            hypotheses: {
              id: "hypotheses",
              name: "Hypothèses",
              rowCount: 20,
              columnCount: 8,
              cellData: {
                0: {
                  0: { v: "Hypothèse", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  1: { v: "Valeur", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                },
                1: { 0: { v: "Taux de TVA" }, 1: { v: 0.2, s: { n: { pattern: "0.00%" } } } },
              },
              rowData: {},
              columnData: { 0: { w: 210 }, 1: { w: 120 } },
              mergeData: [],
              showGridlines: 1,
            },
          },
        },
      },
    },
    ["seed", "tableur", "budget"],
  );
  await uploadPdf({
    title: "Document PDF",
    fileName: "document-seed.pdf",
    folderPath: seedFolderPath,
    tags: ["seed", "document"],
    lines: ["Document de démonstration Hall", "Repère du type document PDF dans l'espace de travail."],
  });
  await createWorkspaceResource(
    {
      kind: "remote",
      name: "Ressource web",
      path: seedFolderPath,
      target: { kind: "url", url: "https://www.collectivites-locales.gouv.fr/" },
    },
    ["seed", "web"],
  );
  await createGeographicResource({
    name: "Ressource cartographique",
    path: seedFolderPath,
    tags: ["seed", "carte"],
    layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
    view: { kind: "center", center: [2.1402, 48.7152], zoom: 15 },
    hallLayer: { type: "FeatureCollection", features: [] },
  });
  try {
    const legalMatches = await post("/resources/legal-references/search", {
      query: "L2121-10",
      effectiveAt: null,
    });
    const legalMatch = legalMatches[0];
    if (!legalMatch) throw new Error("Aucun résultat Légifrance pour L2121-10");
    const legalDraft = await createWorkspaceResource(
      { kind: "legalReference", name: legalMatch.title, path: seedFolderPath },
      ["seed", "droit"],
    );
    await post(`/resources/${legalDraft.id}/legal-reference/resolve`, {
      title: legalMatch.title,
      provider: legalMatch.provider,
      referenceKind: legalMatch.referenceKind,
      fund: legalMatch.fund,
      versionId: legalMatch.versionId,
      effectiveAt: legalMatch.effectiveAt,
    });
  } catch (error) {
    console.warn(`  Référence juridique non créée : ${error instanceof Error ? error.message : String(error)}`);
  }
  await createWorkspaceResource({ kind: "folder", path: "travaux", name: "a-classer" });
  await createWorkspaceResource(
    {
      kind: "text",
      name: "Note de cadrage - éclairage public",
      path: "travaux/eclairage",
      content:
        "## Objectif\n\nRemplacer les 240 luminaires restants par des LED d'ici fin 2027.\n\n- Tranche 2 : centre-bourg et abords de l'école\n- Économie attendue : **38 %** sur la consommation\n- Subvention SDE sollicitée : 40 % du montant HT",
    },
    ["travaux", "éclairage"],
  );
  await createWorkspaceResource(
    {
      kind: "text",
      name: "Règlement intérieur de la cantine",
      path: "ecole/cantine",
      content:
        "## Inscription\n\nL'inscription se fait au trimestre via le portail famille.\n\n## Tarification\n\nLes tarifs sont fixés par délibération du conseil municipal selon le quotient familial.",
    },
    ["école", "cantine"],
  );
  await uploadPdf({
    title: "Rapport - éclairage public tranche 2",
    fileName: "rapport-eclairage-tranche2.pdf",
    folderPath: "travaux/eclairage",
    lines: [
      "Commune de Saint-Aubin - Services techniques",
      "",
      "La tranche 2 couvre le centre-bourg et les abords de l'ecole :",
      "240 luminaires a remplacer par des LED 3000 K.",
      "",
      "Montant estime : 186 000 EUR HT.",
      "Subvention attendue du SDE : 74 400 EUR.",
      "Duree des travaux : 4 mois a compter de novembre 2026.",
    ],
  });
  await uploadPdf({
    title: "Plan de financement - éclairage",
    fileName: "plan-financement-eclairage.pdf",
    folderPath: "travaux/eclairage",
    lines: [
      "Depenses : 186 000 EUR HT",
      "Subvention SDE (40 %) : 74 400 EUR",
      "FCTVA : 30 512 EUR",
      "Autofinancement : 81 088 EUR",
    ],
  });
  await uploadPdf({
    title: "Tableau des subventions 2026",
    fileName: "tableau-subventions-2026.pdf",
    folderPath: "finances/subventions",
    lines: [
      "Association sportive de Saint-Aubin : 3 200 EUR",
      "Comite des fetes : 2 500 EUR",
      "Club des aines : 900 EUR",
      "Cooperative scolaire : 1 400 EUR",
      "Harmonie municipale : 1 800 EUR",
    ],
  });
  await uploadPdf({
    title: "Avis des Domaines - parcelle AB 127",
    fileName: "avis-domaines-AB127.pdf",
    folderPath: "urbanisme/cessions",
    lines: [
      "Direction de l'immobilier de l'Etat",
      "",
      "Parcelle AB 127 - 1 240 m2 - zone UB du PLU.",
      "Valeur venale estimee : 62 000 EUR,",
      "assortie d'une marge de negociation de 10 %.",
    ],
  });
  await uploadPdf({
    title: "Note sur les tarifs 2026-2027",
    fileName: "note-tarifs-cantine.pdf",
    folderPath: "ecole/cantine",
    lines: [
      "Le prestataire applique une hausse de 4,1 % au 1er septembre.",
      "Proposition : repercuter 2 % sur les tranches QF superieures,",
      "geler le tarif de la premiere tranche.",
      "Cout residuel pour la commune : 6 300 EUR/an.",
    ],
  });

  console.log("- Affaires du conseil et rapports principaux");
  const councilBusinesses = [
    {
      path: seedFolderPath,
      name: "Affaire de démonstration",
      reportContent:
        "Cette affaire sert de repère pour distinguer une affaire du conseil des ressources du dossier seed.",
    },
    {
      path: "urbanisme/cessions",
      name: "Cession de la parcelle AB 127",
      reportContent:
        "La commune n'a pas d'usage de cette parcelle enclavée. Un riverain s'est porté acquéreur au prix de l'avis des Domaines.",
    },
    {
      path: "ecole/cantine",
      name: "Tarifs de la restauration scolaire 2026-2027",
      reportContent:
        "Le prestataire augmente ses prix de 4,1 %. La commission scolaire propose de ne répercuter qu'une partie de la hausse.",
    },
    {
      path: "",
      name: "Motion de soutien au commerce de proximité",
      reportContent:
        "Suite à la fermeture annoncée du dernier commerce alimentaire, il est proposé au conseil d'adopter une motion de soutien.",
    },
    {
      path: "travaux/eclairage",
      name: "Éclairage public - engagement de la tranche 2",
      reportContent:
        "Après la tranche 1 achevée au printemps, la tranche 2 couvre le centre-bourg et les abords de l'école. Le plan de financement intègre la subvention du SDE.",
    },
    {
      path: "finances/subventions",
      name: "Subventions aux associations 2026",
      reportContent: "La commission vie associative a examiné les huit dossiers reçus. Cinq demandes sont retenues.",
    },
    {
      path: "ecole",
      name: "Rentrée scolaire - bilan et effectifs",
      reportContent: "Point d'information : 142 élèves inscrits (+6), ouverture d'un poste d'ATSEM à mi-temps.",
    },
    {
      path: "travaux/salle-des-fetes",
      name: "Rénovation de la salle des fêtes - étude préalable",
      reportContent: "Lancement d'une étude de programmation (toiture, chauffage, accessibilité).",
    },
    {
      path: "voirie",
      name: "Stationnement rue des Tilleuls",
      reportContent:
        "Les riverains signalent des difficultés de stationnement aux heures d’entrée et de sortie de l’école. Deux options sont à discuter : créer une zone de courte durée ou déplacer les places réservées aux livraisons.",
    },
  ];
  const seededBusinesses = [];
  for (const business of councilBusinesses) {
    const created = await post("/council-business", {
      ...business,
      reportName: "Rapport principal",
    });
    seededBusinesses.push({ ...business, ...created });
    const annex = await createWorkspaceResource({ kind: "text", path: "seed", name: `Annexe - ${business.name}`, content: "" });
    await put(`/resources/${annex.id}/content`, {
      kind: "text",
      expectedVersion: annex.version,
      content: `## Éléments préparatoires

${business.name}

- Étude du dossier par les services municipaux.
- Présentation des options et des observations des habitants.
- Point de suivi prévu après la décision du conseil.

*Données fictives de démonstration.*`,
    });
    await post(`/council-business/${created.id}/resources`, { resourceId: annex.id });
  }

  console.log("- Fonds documentaire (plan de classement complet)");
  const libraryTexts = [
    [
      "administration/arretes",
      "Arrêté de voirie - rue des Écoles",
      ["arrêté", "voirie"],
      "Le stationnement est interdit rue des Écoles du 3 au 14 mars pour permettre la réfection du trottoir.\n\nUne déviation piétonne est mise en place par la place de la Mairie.",
    ],
    [
      "administration/arretes",
      "Arrêté d'ouverture de la bibliothèque",
      ["arrêté", "culture"],
      "Horaires d'ouverture au public à compter du 1er septembre : mardi et jeudi de 16 h à 18 h 30, samedi de 10 h à 12 h 30.",
    ],
    [
      "administration/personnel",
      "Tableau des effectifs communaux",
      ["personnel"],
      "## Effectifs au 1er janvier\n\n- Filière administrative : 4 agents\n- Filière technique : 6 agents\n- Filière animation : 3 agents",
    ],
    [
      "administration/personnel",
      "Régime indemnitaire - note de cadrage",
      ["personnel", "finances"],
      "La refonte du régime indemnitaire doit être délibérée avant le vote du budget primitif, après avis du comité social territorial.",
    ],
    [
      "administration/courriers",
      "Modèle de réponse à réclamation",
      ["courrier"],
      "Réponse type aux réclamations relatives à la voirie communale, à adapter au cas signalé et à viser par le maire.",
    ],
    [
      "etat-civil",
      "Procédure de délivrance des actes",
      ["état civil"],
      "Les actes de naissance et de mariage de moins de cent ans sont délivrés aux seuls intéressés, ascendants et descendants, sur justification d'identité.",
    ],
    [
      "elections",
      "Organisation du bureau de vote",
      ["élections"],
      "## Composition\n\nLe bureau comprend un président, au moins deux assesseurs et un secrétaire.\n\n## Ouverture\n\nScrutin ouvert de 8 h à 18 h, salle du conseil.",
    ],
    [
      "elections",
      "Tableau des assesseurs",
      ["élections"],
      "Répartition des permanences sur les deux tours, à confirmer par les conseillers un mois avant le scrutin.",
    ],
    [
      "finances/budget",
      "Rapport d'orientation budgétaire 2027",
      ["budget"],
      "## Contexte\n\nLa capacité d'autofinancement se maintient malgré la hausse des charges d'énergie.\n\n## Priorités\n\n- Achèvement de l'éclairage public\n- Réfection de la voirie du centre-bourg",
    ],
    [
      "finances/budget",
      "Note de synthèse - budget primitif",
      ["budget"],
      "Le budget primitif est présenté en équilibre réel, sections de fonctionnement et d'investissement, conformément au cadre M57.",
    ],
    [
      "finances/budget/2026/preparation",
      "Calendrier de préparation budgétaire 2026",
      ["budget", "préparation"],
      "## Jalons\n\n- 15 janvier : remontée des besoins des services\n- 12 février : arbitrages de l'exécutif\n- 5 mars : finalisation des annexes\n- 26 mars : vote du budget primitif",
    ],
    [
      "finances/budget/2026/preparation/arbitrages",
      "Synthèse des arbitrages de fonctionnement",
      ["budget", "arbitrages"],
      "Les arbitrages retiennent la maîtrise des charges courantes, le maintien des services aux habitants et une réserve pour l'évolution des coûts de l'énergie.",
    ],
    [
      "finances/budget/2026/investissement/programmes/voirie",
      "Programmation pluriannuelle de la voirie",
      ["budget", "investissement", "voirie"],
      "## Programmation\n\n- 2026 : chemin de la Fontaine\n- 2027 : rue des Écoles\n- 2028 : route du Moulin\n\nLes montants seront actualisés après réception des études et des offres.",
    ],
    [
      "finances/subventions",
      "Critères d'attribution des subventions",
      ["subventions"],
      "## Recevabilité\n\nDossier complet déposé avant le 31 janvier, comptes de l'exercice précédent joints.\n\n## Instruction\n\nAvis de la commission vie associative, puis délibération du conseil.",
    ],
    [
      "finances/subventions",
      "Bilan des subventions 2025",
      ["subventions"],
      "Quatorze associations ont été soutenues pour un montant total de 21 400 €, dont 9 800 € au titre du sport.\n\n| Association | Objet | Montant |\n| --- | --- | ---: |\n| Les Tilleuls | Animation seniors | 2 400 € |\n| Club sportif | Encadrement jeunes | 4 800 € |\n| Comité des fêtes | Fête communale | 3 200 € |\n| Bibliothèque pour tous | Achat de livres | 1 500 € |",
    ],
    [
      "finances/subventions/2026/instruction/sport",
      "Note d'instruction - Club sportif",
      ["subventions", "sport", "instruction"],
      "Le dossier est complet. La demande porte sur l'encadrement des jeunes et les déplacements en compétition. Proposition : 4 800 €.",
    ],
    [
      "finances/subventions/2026/instruction/culture",
      "Note d'instruction - Harmonie municipale",
      ["subventions", "culture", "instruction"],
      "Le dossier est complet. La demande porte sur les concerts publics et le renouvellement des partitions. Proposition : 1 800 €.",
    ],
    [
      "finances/emprunts",
      "État de la dette au 31 décembre",
      ["dette"],
      "Encours de 412 000 € réparti sur trois emprunts à taux fixe, extinction du plus ancien prévue en 2029.",
    ],
    [
      "finances/marches",
      "Procédure adaptée - seuils applicables",
      ["marchés"],
      "En deçà du seuil de procédure formalisée, la commune retient une procédure adaptée avec publicité sur le profil d'acheteur.",
    ],
    [
      "finances/marches",
      "Grille d'analyse des offres",
      ["marchés"],
      "Prix 40 %, valeur technique 40 %, délai 20 %. La grille est annexée au règlement de consultation.",
    ],
    [
      "urbanisme/plu",
      "Orientations d'aménagement - secteur nord",
      ["urbanisme", "PLU"],
      "Le secteur nord est destiné à une opération d'ensemble à dominante d'habitat, avec maintien d'une frange plantée le long du chemin rural.",
    ],
    [
      "urbanisme/plu",
      "Note sur la modification simplifiée du PLU",
      ["urbanisme", "PLU"],
      "La modification simplifiée permet de rectifier une erreur matérielle sans enquête publique, après mise à disposition du dossier pendant un mois.",
    ],
    [
      "urbanisme/permis",
      "Instruction des permis - circuit interne",
      ["urbanisme"],
      "Dépôt en mairie, complétude sous un mois, instruction par le service mutualisé, décision signée par le maire.",
    ],
    [
      "urbanisme/cessions",
      "Note sur la cession de la parcelle AB 127",
      ["urbanisme", "cession"],
      "La parcelle, classée en zone UB, n'est plus affectée à l'usage du public. Sa cession suppose un déclassement préalable.",
    ],
    [
      "travaux/eclairage",
      "Diagnostic des points lumineux",
      ["travaux", "éclairage"],
      "Sur 612 points recensés, 240 restent équipés de lampes à vapeur de sodium, dont 96 dans le périmètre de la tranche 2.",
    ],
    [
      "travaux/voirie",
      "Programme de réfection 2027",
      ["travaux", "voirie"],
      "## Priorités\n\n1. Chemin de la Fontaine\n2. Rue des Écoles\n3. Place du Marché",
    ],
    [
      "travaux/batiments",
      "Diagnostic énergétique de la mairie",
      ["travaux", "énergie"],
      "L'isolation des combles et le remplacement de la chaudière réduiraient la consommation de près de moitié.",
    ],
    [
      "travaux/salle-des-fetes",
      "Règlement de mise à disposition",
      ["salle des fêtes"],
      "La salle est mise à disposition des associations communales à titre gratuit une fois par an, puis selon le tarif voté.",
    ],
    [
      "ecole/cantine",
      "Tarifs de la restauration scolaire",
      ["école", "cantine"],
      "Les tarifs sont établis selon le quotient familial, de 2,10 € à 4,60 € le repas, révisés chaque année en juin.",
    ],
    [
      "ecole/periscolaire",
      "Organisation des temps périscolaires",
      ["école"],
      "Accueil de 7 h 30 à 8 h 30 et de 16 h 30 à 18 h 30, encadrement assuré par trois agents d'animation.",
    ],
    [
      "ecole/effectifs",
      "Prévision des effectifs - rentrée 2027",
      ["école"],
      "Cent trente-huit élèves attendus sur six classes, soit une hausse de quatre élèves qui ne remet pas en cause la carte scolaire.",
    ],
    [
      "social/ccas",
      "Rapport d'activité du CCAS",
      ["CCAS", "social"],
      "## Aides accordées\n\nQuarante-deux dossiers instruits, dont vingt-huit aides énergie et neuf aides alimentaires.",
    ],
    [
      "social/ccas",
      "Aide facultative - barème",
      ["CCAS", "social"],
      "L'aide facultative est plafonnée à 300 € par foyer et par année civile, sur décision du conseil d'administration.",
    ],
    [
      "social/logement",
      "Attribution des logements communaux",
      ["logement"],
      "Trois logements communaux sont attribués sur critères de ressources, après examen en commission.",
    ],
    [
      "culture/bibliotheque",
      "Charte des collections",
      ["bibliothèque"],
      "La bibliothèque acquiert chaque année environ trois cents titres, avec une attention particulière au fonds local.",
    ],
    [
      "culture/bibliotheque",
      "Programme d'animations",
      ["bibliothèque"],
      "Heure du conte mensuelle, deux rencontres d'auteurs et une exposition estivale consacrée au patrimoine communal.",
    ],
    [
      "culture/associations",
      "Convention type d'objectifs",
      ["associations"],
      "Toute subvention supérieure à 23 000 € donne lieu à une convention précisant l'objet, le montant et les conditions d'utilisation.",
    ],
    [
      "culture/festivites",
      "Organisation de la fête communale",
      ["festivités"],
      "Le comité des fêtes assure l'organisation ; la commune met à disposition le matériel et prend en charge la sécurité.",
    ],
    [
      "environnement/dechets",
      "Collecte des déchets - nouveaux horaires",
      ["déchets"],
      "La collecte des ordures ménagères passe au mardi matin ; les emballages restent collectés le vendredi des semaines paires.",
    ],
    [
      "environnement/espaces-verts",
      "Plan de gestion différenciée",
      ["espaces verts"],
      "Trois niveaux d'entretien sont définis, du fauchage tardif des abords à la tonte régulière des espaces de centre-bourg.",
    ],
    [
      "environnement/eau",
      "Rapport annuel sur le prix de l'eau",
      ["eau"],
      "Le rapport annuel est présenté au conseil avant le 30 septembre et mis à disposition du public en mairie.",
    ],
    [
      "securite/police-municipale",
      "Convention de coordination",
      ["sécurité"],
      "La convention précise la répartition des missions entre la police municipale et la brigade de gendarmerie.",
    ],
    [
      "securite/risques",
      "Plan communal de sauvegarde - synthèse",
      ["sécurité", "risques"],
      "Le plan recense les risques d'inondation et de tempête, et désigne les responsables de chaque cellule de crise.",
    ],
    [
      "sport/equipements",
      "Planning d'occupation du gymnase",
      ["sport"],
      "Créneaux scolaires en journée, créneaux associatifs en soirée et le samedi matin.",
    ],
    [
      "sport/clubs",
      "Conventions avec les clubs",
      ["sport", "associations"],
      "Chaque club signataire s'engage à accueillir les scolaires sur au moins deux créneaux hebdomadaires.",
    ],
    [
      "cimetiere",
      "Règlement du cimetière",
      ["cimetière"],
      "Les concessions sont accordées pour quinze, trente ou cinquante ans, renouvelables dans l'année suivant leur échéance.",
    ],
    [
      "voirie",
      "Recensement de la voirie communale",
      ["voirie"],
      "La voirie communale représente 27,4 km, dont 6,1 km de chemins ruraux entretenus par la commune.",
    ],
  ];
  for (const [folderPath, title, tags, content] of libraryTexts) {
    await createWorkspaceResource({ kind: "text", name: title, path: folderPath, content }, tags);
  }
  console.log(`  ${libraryTexts.length} textes classés`);

  const libraryPdfs = [
    [
      "administration/arretes",
      "Arrêté n° 2026-014",
      "arrete-2026-014.pdf",
      [
        "Commune de Saint-Aubin",
        "Arrete portant reglementation temporaire de la circulation",
        "rue des Ecoles, du 3 au 14 mars.",
      ],
    ],
    [
      "elections",
      "Liste électorale - extrait",
      "liste-electorale-extrait.pdf",
      ["Extrait de la liste electorale generale", "Arrete au 28 fevrier - 1 842 electeurs inscrits."],
    ],
    [
      "finances/budget",
      "Budget primitif 2026 - annexes",
      "budget-primitif-2026-annexes.pdf",
      [
        "Annexes au budget primitif 2026",
        "Etat de la dette, personnel, subventions versees,",
        "engagements hors bilan.",
      ],
    ],
    [
      "finances/budget",
      "Compte administratif 2025",
      "compte-administratif-2025.pdf",
      [
        "Compte administratif de l'exercice 2025",
        "Fonctionnement : excedent de 118 400 EUR",
        "Investissement : deficit de 42 900 EUR",
      ],
    ],
    [
      "finances/budget/2026/preparation/annexes",
      "État prévisionnel de la dette 2026",
      "etat-previsionnel-dette-2026.pdf",
      [
        "Etat previsionnel de la dette 2026",
        "Capital restant du au 1er janvier : 412 000 EUR",
        "Annuites prevues sur l'exercice : 58 600 EUR.",
      ],
    ],
    [
      "finances/budget/2026/investissement/programmes/batiments",
      "Plan de financement - rénovation de la mairie",
      "plan-financement-mairie-2026.pdf",
      [
        "Renovation energetique de la mairie",
        "Montant previsionnel : 284 000 EUR HT",
        "Subventions sollicitees : DETR et Fonds vert.",
      ],
    ],
    [
      "finances/subventions",
      "Dossiers de demande 2026",
      "dossiers-subventions-2026.pdf",
      ["Recueil des demandes de subvention", "Quatorze associations, montant sollicite : 26 300 EUR."],
    ],
    [
      "finances/subventions/2026/instruction/sport/pieces",
      "Budget prévisionnel - Club sportif",
      "budget-club-sportif-2026.pdf",
      ["Club sportif de Saint-Aubin", "Budget previsionnel 2026", "Demande de subvention communale : 6 000 EUR."],
    ],
    [
      "finances/marches",
      "Avis d'appel public à la concurrence",
      "aapc-eclairage.pdf",
      [
        "Avis d'appel public a la concurrence",
        "Objet : renovation de l'eclairage public, tranche 2",
        "Remise des offres : 15 avril, 12 h.",
      ],
    ],
    [
      "urbanisme/plu",
      "Règlement graphique - extrait",
      "plu-reglement-graphique.pdf",
      ["Plan local d'urbanisme", "Extrait du reglement graphique, secteur nord."],
    ],
    [
      "urbanisme/permis",
      "Recueil des avis ABF",
      "avis-abf.pdf",
      ["Avis de l'architecte des Batiments de France", "Trois dossiers situes dans le perimetre protege."],
    ],
    [
      "travaux/voirie",
      "Devis - chemin de la Fontaine",
      "devis-chemin-fontaine.pdf",
      ["Devis de refection de chaussee", "Chemin de la Fontaine - 620 metres lineaires", "Montant : 48 200 EUR HT"],
    ],
    [
      "travaux/batiments",
      "Audit énergétique - mairie",
      "audit-energetique-mairie.pdf",
      [
        "Audit energetique du batiment de la mairie",
        "Consommation actuelle : 218 kWh/m2/an",
        "Objectif apres travaux : 112 kWh/m2/an",
      ],
    ],
    [
      "ecole/effectifs",
      "Constat de rentrée",
      "constat-rentree.pdf",
      ["Constat de rentree scolaire", "134 eleves repartis sur six classes."],
    ],
    [
      "social/ccas",
      "Compte de gestion du CCAS",
      "compte-gestion-ccas.pdf",
      ["Compte de gestion du centre communal d'action sociale", "Exercice clos au 31 decembre."],
    ],
    [
      "culture/bibliotheque",
      "Statistiques de fréquentation",
      "statistiques-bibliotheque.pdf",
      ["Frequentation de la bibliotheque municipale", "4 120 prets, 318 inscrits actifs."],
    ],
    [
      "environnement/dechets",
      "Rapport du SICTOM",
      "rapport-sictom.pdf",
      ["Rapport annuel du syndicat de collecte", "Tonnage collecte et cout du service par habitant."],
    ],
    [
      "environnement/eau",
      "Analyse sanitaire du réseau",
      "analyse-sanitaire-eau.pdf",
      ["Controle sanitaire des eaux destinees", "a la consommation humaine - conforme."],
    ],
    [
      "securite/risques",
      "Plan communal de sauvegarde",
      "plan-communal-sauvegarde.pdf",
      ["Plan communal de sauvegarde", "Recensement des risques et organisation de crise."],
    ],
    [
      "sport/equipements",
      "Diagnostic du gymnase",
      "diagnostic-gymnase.pdf",
      ["Diagnostic technique du gymnase municipal", "Charpente et couverture a reprendre sous cinq ans."],
    ],
    [
      "cimetiere",
      "Plan du cimetière",
      "plan-cimetiere.pdf",
      ["Plan de reperage des concessions", "Trois carres, 412 emplacements."],
    ],
  ];
  for (const [folderPath, title, fileName, lines] of libraryPdfs) {
    await uploadPdf({ title, fileName, folderPath, lines });
  }
  console.log(`  ${libraryPdfs.length} documents PDF classés`);

  await uploadDocument({
    title: "Esquisse du plan de circulation",
    fileName: "plan-circulation.png",
    folderPath: "travaux/voirie",
    content: makePng(),
    mediaType: "image/png",
  });
  await uploadDocument({
    title: "Convention de mise à disposition",
    fileName: "convention-mise-a-disposition.docx",
    folderPath: "culture/associations",
    content: makeDocx("Convention de mise à disposition - document de démonstration Hall"),
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  await importSpreadsheet({
    title: "Export des subventions 2026",
    fileName: "subventions-2026.csv",
    folderPath: "seed",
    content: Buffer.from("association;montant\nClub sportif;4800\nComité des fêtes;3200\n"),
    mediaType: "text/csv",
  });
  await importSpreadsheet({
    title: "Suivi détaillé des subventions 2026",
    fileName: "suivi-subventions-2026.xlsx",
    folderPath: "seed",
    content: makeXlsx([
      ["Association", "Montant accordé (€)", "Objet"],
      ["Club sportif", 4800, "École de sport et déplacements"],
      ["Comité des fêtes", 3200, "Fête communale"],
      ["Harmonie municipale", 1800, "Concerts et renouvellement des partitions"],
    ]),
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  console.log("  2 documents multi-formats classés (PNG, DOCX) et 2 tableurs importés (CSV, XLSX)");

  console.log("- Templates PDF et Outlook");
  await post("/templates", {
    kind: "pdf",
    documentType: "meeting-notice",
    name: "Convocation au conseil municipal",
    bodyMarkdown:
      "# Convocation\n\nLe conseil municipal de **:field{name=hall.name}** se réunira le :field{name=meeting.startsAt}, à :field{name=meeting.location}.\n\n## Ordre du jour\n\nLes documents préparatoires sont joints à la présente convocation.",
    stylesheet: "h1 { color: #102a83; }",
    headerHtml: '<div style="font-size:10px">Commune de Saint-Aubin</div>',
    footerHtml: '<div style="font-size:9px;width:100%;text-align:center">Conseil municipal</div>',
  });
  await post("/templates", {
    kind: "message",
    documentType: "meeting-notice-message",
    name: "Message de convocation Outlook",
    subject: "Convocation au conseil municipal",
    bodyMarkdown:
      "Bonjour,\n\nVous êtes convoqué au **conseil municipal**, le :field{name=meeting.startsAt}, à :field{name=meeting.location}.\n\nLa convocation et les pièces préparatoires sont jointes à ce message.",
  });

  await post("/templates", {
    kind: "pdf",
    documentType: "minutes",
    name: "Procès-verbal du conseil",
    bodyMarkdown: "# Procès-verbal du conseil\n\n## Séance, présences et pouvoirs\n\n::minutes{section=facts}\n\n## Examen des points\n\n::minutes{section=proceedings}",
    stylesheet: "h1 { color: #102a83; } h2 { break-after: avoid; }",
    headerHtml: '<div style="font-size:10px">Commune de Saint-Aubin</div>',
    footerHtml: '<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });

  if (process.env.SEED_MEETING_SCENARIO === "preparation") {
    console.log("- Séance en préparation");
    const meeting = await post("/council-meetings", {
      quorum: 8,
    });
    await put(`/council-meetings/${meeting.id}/schedule`, {
      scheduledAt: daysFromNow(65),
      location: "Salle du conseil",
    });
  } else {
    console.log("- Historique des séances et séance en cours");
    await seedCouncilMeetings(members, seededBusinesses);
  }

  console.log("Seed terminé.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
