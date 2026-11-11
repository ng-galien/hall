import { expect, it, vi } from "vitest";
import { createEdgeComBinding } from "../../src/infrastructure/mail/outlookEdgeBinding.js";

// @verifies-requirement HALL-FR-EML-070
it("keeps COM object handles across methods, properties, assignment and release", () => {
  const invoke = vi.fn((command) => {
    if (command.operation === "connect") return { comHandle: 1 };
    if (command.operation === "get" && command.member === "Session") return { comHandle: 2 };
    if (command.operation === "get" && command.member === "Accounts") return { comHandle: 3 };
    if (command.operation === "call" && command.member === "Item") return { comHandle: 4 };
    if (command.operation === "call" && command.member === "CreateItem") return { comHandle: 5 };
    if (command.operation === "get" && command.member === "SmtpAddress") return "town@example.org";
    return null;
  });
  const binding = createEdgeComBinding(invoke);
  const app = binding.connect();
  const account = app.Session.Accounts.Item(1);
  const message = app.CreateItem(0);
  expect(account.SmtpAddress).toBe("town@example.org");
  message.SendUsingAccount = account;
  message.Subject = "Été à la mairie";
  message.Send();
  expect(invoke).toHaveBeenCalledWith(
    { operation: "set", handle: 5, member: "SendUsingAccount", arguments: [{ comHandle: 4 }] },
    true,
  );
  expect(invoke).toHaveBeenCalledWith(
    { operation: "set", handle: 5, member: "Subject", arguments: ["Été à la mairie"] },
    true,
  );
  expect(invoke).toHaveBeenCalledWith({ operation: "call", handle: 5, member: "Send", arguments: [] }, true);
  binding.release(message, account, app);
  expect(invoke).toHaveBeenCalledWith({ operation: "release", handle: 5 }, true);
});
