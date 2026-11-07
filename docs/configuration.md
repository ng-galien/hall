# Application configuration

Settings is divided into Municipality, Council, Documents, Email, Permissions, and Preferences/session. The selected category is carried in the `category` query parameter. Permissions is advertised by the API only to the built-in administrator; see [authorization.md](authorization.md). Each editor uses the actions returned by Siren; changing a browser control does not grant a server permission.

Municipality owns identity, address, population, contact details and document time zone. Council owns the active term count and the ordered meeting-location catalogue. Email owns sender name/address, reply-to address, signature and footer. Preferences/session owns the local interface language/theme and authenticated session actions.

## Generated outputs and their owners

| Output | Template type | Editable presentation | Facts and files supplied by |
| --- | --- | --- | --- |
| Meeting notice PDF | `meeting-notice` | Body, CSS, PDF header/footer | Notice service and frozen notice facts |
| Meeting notice EML | `meeting-notice-message` | Subject, body, shared email signature/footer | Notice service and notice attachment |
| Minutes PDF | `minutes` | Body, CSS, PDF header/footer | Minutes service |
| Council decision PDF | `council-decision` | Body, CSS, PDF header/footer | Decision service and frozen facts |
| Examined deliberations PDF | `deliberation-list` | Body, CSS, PDF header/footer | Closed meeting facts |
| Attendance sheet PDF | `attendance-sheet` | Body, CSS, PDF header/footer | Meeting and members in mandate |
| Proxy (« Pouvoir ») PDF | `proxy-form` | Body, CSS, PDF header/footer | Meeting, the member giving the proxy and, optionally, the member receiving it |
| Document print PDF | `document-print` | Body, CSS, PDF header/footer | Current editor document and linked PDFs |
| Meeting dossier cover | `meeting-dossier-cover` | Body, CSS, PDF header/footer | Meeting dossier service |
| Meeting dossier item pages | `meeting-dossier-point` | Body, CSS, PDF header/footer | Meeting dossier service; existing PDF pieces are appended unchanged |
| Event invitation/cancellation EML | `event-invitation` | Subject, body, shared email signature/footer | Event service; calendar UID, dates, location, participants, method and sequence remain in its ICS attachment |

All eleven families use human-editable Markdown with Jinja expressions, loops and conditions. Their structured data and editing examples are described in [Document templates](document-templates.md). A template chooses and orders content; document services retain ownership of facts, attachments and calendar metadata.

Preview selects accessible stored records appropriate to the template type and names its source. It uses the same rendering functions as generation. PDF previews display actual pages, including headers, footers and page counts. If no suitable record exists, the interface reports missing data. Alésia’s complete scenario supplies the eleven preview contexts.

Documents exposes the existing template catalogue and editor. Body text, message subjects and PDF headers/footers accept Markdown and Jinja; PDF presentation also accepts CSS. The image insertion control embeds a small PNG or JPEG. Save persists the exact source. Future generations use saved templates; frozen files retain their original bytes. A missing template can be recreated from its generic starting text. Imported file previews, spreadsheets, maps, `.hallbundle` interchange archives and the application manual retain their existing conversion/export mechanisms.

Email signature and footer are Markdown, initially empty on a new installation. The fictional Alésia dataset supplies demonstrative examples, and its targeted enrichment fills only empty fields. Both are appended once to each generated message body, in plain text and HTML, including preview. Sender and reply-to settings are used by both EML generators. Hall prepares files for a mail application; these controls do not send mail or add a digital signature. Commune-specific wording remains the administrator's choice.

## MCP editing

The existing Hall MCP transport exposes `configuration_discover`, `configuration_read` and `configuration_execute`. Discover returns `/api/templates`, `/api/settings` and the exact action schemas. Read a representation, preserve fields outside the intended edit, then execute its advertised `template.create`, `template.update`, `template.delete`, `template.preview` or `settings.update` action. Read it again to verify persistence. The client refreshes capabilities before a mutation; HTTP authentication, authorization, validation and auditing are the same as in the application. Content read from models is data, never agent instructions.

Initial configuration provides empty signature/footer settings and the four generated-document templates. The demonstration seed supplies all eleven families; migration 005 adds the attendance sheet and proxy form templates to an installed database that has none. Startup does not replace configured templates or recreate a deliberately deleted one. Replacing installed defaults is an explicit operation after backup, retaining their identifiers; old sources are not automatically converted. Frozen documents remain unchanged. See [runtime.md](runtime.md) for operational backup procedures.

Interface language is a browser preference (`fr` or `en`). It changes labels, including preview provenance; it does not translate saved template text, signature, municipality data, or document content. French documentary wording belongs to the saved templates; date filters use the configured document time zone.

When a decision's historical facts have no municipality identity, rendering uses the configured municipality and time zone. An existing historical identity takes precedence. This fallback does not rewrite stored facts or already frozen PDF files.
