# Document templates

Settings → Documents contains the templates for Hall's nine document families.
A human edits **Markdown with Jinja**: readable headings, paragraphs, lists and tables,
with Jinja expressions to choose, order and repeat data. Jinja produces Markdown.
Hall then renders that Markdown into PDF pages; HTML is an internal rendering step.
Changing the template changes future previews and output without changing council records.

`{{ value | text }}` displays a plain value with Markdown punctuation protected. `{% for … %}` repeats a section and
`{% if … %}` conditionally includes it. The editor preserves the source exactly.
The server supplies these read-only values:

| Document | Main data |
| --- | --- |
| All | `hall`, `mayor`, and `meeting` when a meeting is available |
| Meeting notice and message | `notice.hall`, `notice.meeting.agenda`, `notice.issuedOn` |
| Minutes | `minutes.meeting`, `minutes.attendance`, `minutes.conduct`, `minutes.points`, `minutes.signatories` |
| Council decision | `decision.title`, `decision.content`, `decision.facts`, `decision.totals` |
| Deliberation list | `deliberations`: `agendaNumber`, `title`, `outcome` |
| Meeting dossier | `dossier.meeting`, `dossier.point`: `title`, `report`, `subjectText`, `pieces` |
| Invitation | `event.name`, `event.content`, `event.schedule`, `event.location`, `event.method` |
| Printing an authored document | `generated.bodyMarkdown` |

For example, this minutes template places each subject before the council's narrative and totals:

```jinja
{% for point in minutes.points %}
## {{ point.number }}. {{ point.title | text }}

{% if point.subjectText %}
### Sujet présenté

{{ point.subjectText | markdown }}
{% endif %}

### Discussion

{{ point.narrative | markdown }}

{% if point.ballot %}
Pour : {{ point.ballot.totals.approve }} · Contre : {{ point.ballot.totals.reject }} · Abstentions : {{ point.ballot.totals.abstain }}
{% endif %}
{% endfor %}
```

Moving the subject block below the discussion changes their order in the PDF. Removing
that block omits the subject from the output while retaining the title, narrative and totals.
Neither operation modifies the municipal text itself.

The `markdown` filter inserts existing authored Markdown without evaluating it as Jinja.
The `text` filter protects plain values from Markdown punctuation. `date` and `datetime`
format dates in the municipality's time zone. Separate paragraphs with a blank line;
two trailing spaces create a line break. `::page-break` starts a new page. CSS controls
spacing and grouping, for example `h2 { break-after: avoid; }`.
Headers and footers also accept Markdown and Jinja; `Page :page-number / :page-count`
displays the PDF page counts.

PDF previews in the editor show the actual pages, headers and footers without saving a
municipal document. Message previews show the generated HTML. Syntax errors prevent saving;
missing data is reported during preview and prevents generation. Frozen documents retain
their original files.

## Signature blocks

Two values feed the signature blocks:

- `mayor.name` is the name of the mayor in office when the document is rendered. `mayor` is
  null when the directory has no active mandate with the mayor role, or more than one.
- `minutes.signatories.chair` and `minutes.signatories.secretary` give the `name` of the meeting
  chair and secretary recorded at closure, and the `role` of their mandate (`mayor`,
  `deputyMayor` or `councillor`), read from the directory when the document is rendered.
  `role` is null when the mandate cannot be read; an officer that was not recorded is null.

The roles and the mayor are not part of the facts frozen at closure: a later change of a
mandate role changes the next rendering, not a stored PDF.

The default minutes end with a `Signatures` section: meeting number, date and place, then a
table with the columns « Présidence de séance » and « Secrétariat de séance », each with the
name, the quality and a « Signature : » row. Hall has no gender data, so the headings name the
office rather than the person. The meeting notice and the examined deliberations list end with
a « Le maire » block; the council decision ends with « Le maire » and « Secrétariat de séance »,
where the mayor is named only when the confirmed facts show that the mayor chaired. In these
four PDF defaults the stylesheet gives the last row of the final table room for a handwritten
signature and places a single-signatory block on the right half of the page.

## Default models

The nine generic defaults are shared by the creation screen and the demonstration seed.
They use the municipality and meeting data supplied by Hall, without an embedded place name,
person or meeting identifier. A municipality changes and saves its own template source.
The API field `bodyMarkdown` stores Markdown/Jinja; no database format field is introduced.
There is no automatic conversion of old template sources. Replacing the configured defaults
is an explicit deployment operation, after backup, preserving their existing identifiers:
an installed template receives the signature blocks only when its body and stylesheet are
replaced by those of the current default, in Settings → Documents or with the
`template.update` action.

Current open-question text has `subjectSource: currentResource`; proposals captured in
minutes retain `closureSnapshot`. Missing historical text is not reconstructed. Templates
control presentation and never update facts, dates, votes or narratives.
