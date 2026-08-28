# `@hall/templating`

Shared, isomorphic Markdown grammar for Hall's template editor and authoritative server renderer.

The initial contract deliberately stays small:

```markdown
:member[Martine Delcourt]{#uuid}
:resource[Rapport préparatoire]{#uuid}
:topic[Subventions]{#uuid}
:decision[Délibération budgétaire]{#uuid}
:meeting[Conseil de septembre]{#uuid}
:field{name="meeting.startsAt"}
```

`field` accepts only names exported by `fieldNames`; it is not a dynamic object path or expression. Reusable snippets,
includes, functions and nested indirections are outside this scope. Unknown directives survive `parse`/`serialize`
unchanged but produce an error diagnostic and cannot be rendered definitively by the server.

Both consumers must use `parse`, `serialize`, `collectDirectives`, `validateStructure`, `directiveSpecs` and
`fieldNames` from this package. `baseRenderStylesheet` is the shared visual baseline for editor preview and PDF output;
styles stored with a particular PDF template are applied after it.
