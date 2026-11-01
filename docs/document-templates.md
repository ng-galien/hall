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
| All | `hall`, and `meeting` when a meeting is available |
| Meeting notice and message | `notice.hall`, `notice.meeting.agenda`, `notice.issuedOn` |
| Minutes | `minutes.meeting`, `minutes.attendance`, `minutes.conduct`, `minutes.points` |
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

## Default models

The nine generic defaults are shared by the creation screen and the demonstration seed.
They use the municipality and meeting data supplied by Hall, without an embedded place name,
person or meeting identifier. A municipality changes and saves its own template source.
The API field `bodyMarkdown` stores Markdown/Jinja; no database format field is introduced.
There is no automatic conversion of old template sources. Replacing the configured defaults
is an explicit deployment operation, after backup, preserving their existing identifiers.

Current open-question text has `subjectSource: currentResource`; proposals captured in
minutes retain `closureSnapshot`. Missing historical text is not reconstructed. Templates
control presentation and never update facts, dates, votes or narratives.
