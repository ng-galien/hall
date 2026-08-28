# API contract

`@hall/api-contract` is the runtime-neutral HTTP vocabulary shared by the server and clients.

- Success representations use Siren (`application/vnd.siren+json`).
- Errors use RFC 9457 Problem Details (`application/problem+json`).
- `links` expose navigation; `actions` expose only currently authorized commands.
- Roles grant coarse permissions on the server. Domain state further restricts advertised actions.

The React client has two consumption levels in `services/apiClient.ts`:

- `apiRequest<T>` decodes Siren to domain-shaped data for existing screens;
- `apiSirenRequest<T>` returns both decoded data and the original representation;
- `followSirenLink` and `submitSirenAction` navigate and mutate through advertised capabilities.

New UI code should retain the representation whenever it needs to show or hide a command. It must not copy the role
matrix or infer an allowed transition from a status value. An absent action means that the command is unavailable in
the current identity and domain context.
