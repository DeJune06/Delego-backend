export interface PushMessage {
  userId: string;
  title: string;
  body: string;
}

/** Send push notification — TODO: Integrate push provider */
export async function sendPush(_message: PushMessage): Promise<void> {
  throw new Error("Not implemented — TODO: push provider");
}
