import type { EmailPayload, EmailTransport, EmailTransportResult } from "../../src/services/emailTransport.js";

/** Explicitly injected by tests; never registered as a production or development fallback. */
export class RecordingEmailTransport implements EmailTransport {
  readonly calls: EmailPayload[] = [];
  readonly outcomes: Array<EmailTransportResult | Promise<EmailTransportResult>> = [];

  async send(payload: EmailPayload): Promise<EmailTransportResult> {
    this.calls.push(structuredClone(payload));
    const outcome = this.outcomes.shift();
    if (!outcome) throw new Error("The test must declare a transport outcome before sending");
    return outcome;
  }
}
