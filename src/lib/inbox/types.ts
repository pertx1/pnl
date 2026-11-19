export type InboxTokenSet = {
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt?: Date;
  grantedScopes: string[];
};

export type SyncedMessage = {
  externalId: string;
  direction: "in" | "out";
  senderName: string | null;
  body: string;
  sentAt: Date;
  /** Datos técnicos para responder en el hilo (Message-ID, References, Reply-To…). Nunca tokens. */
  metadata?: Record<string, string | null>;
};

export type SyncedThread = {
  externalThreadId: string;
  subject: string | null;
  counterpartName: string | null;
  counterpartHandle: string | null;
  unread: boolean;
  messages: SyncedMessage[];
  metadata?: Record<string, string | null>;
};

/** Datos mínimos para responder (derivados del hilo existente: no se puede escribir a destinatarios nuevos). */
export type ReplyTarget = {
  threadExternalId: string;
  to: string | null;
  subject: string | null;
  lastInboundExternalId: string | null;
  inReplyTo: string | null;
  references: string | null;
};
