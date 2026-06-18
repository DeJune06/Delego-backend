export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/** Send email notification — TODO: Integrate SMTP provider */
export async function sendEmail(_message: EmailMessage): Promise<void> {
  throw new Error("Not implemented — TODO: SMTP integration");
}
