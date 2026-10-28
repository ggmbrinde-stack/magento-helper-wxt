/**
 * The message envelope — the ONE shape every lane router and every surface
 * agrees on.
 *
 * Request/response payloads do NOT live here. They live in the lane contract
 * beside this file, and a new message type is added to the lane that produces
 * the data:
 *
 *   ui.ts         page + panel: form state, config groups, SKU, tab groups
 *   audit.ts      resolver, image/text audit, Notion read/write, error markup
 *   automation.ts batch pipeline + model bridge
 *
 * That split is deliberate: adding an audit message must not touch the file an
 * automation change is editing.
 */

/**
 * The runtime message as received.
 *
 * Chrome hands us untyped data from another context, so the envelope stays
 * permissive at the boundary; each router narrows the fields it reads, and the
 * request interfaces in the lane contracts are the documented allowed shape.
 */
export interface MessageShape {
  type?: string;
  [key: string]: any;
}

export type MessageResponder = (response: unknown) => void;

export interface RouterContext {
  /** Tab that sent the message, when the sender was a content script. */
  senderTabId?: number;
  sendResponse: MessageResponder;
}

/**
 * A lane router owns a set of message types. It returns `true` when it handled
 * the message (which keeps the channel open for the async reply) and `false` to
 * let the next lane try — the same contract the single listener used to have.
 */
export type LaneRouter = (message: MessageShape, ctx: RouterContext) => boolean;
