import type { IsoTimestamp, PersonRef } from "./envelope.js";

// Who wrote a comment: the person reference plus their collection role.
export interface CommentAuthor extends PersonRef {
  role: "owner" | "contributor" | null;
}

export interface CommentView {
  id: string;
  parentId: string | null;
  // Null for hidden (to non-moderators) or deleted comments kept for their replies.
  body: string | null;
  state: "visible" | "hidden" | "deleted";
  // A reply the owner or a contributor marked as the answer to its question.
  accepted: boolean;
  author: CommentAuthor | null;
  version: number;
  createdAt: IsoTimestamp;
  editedAt: IsoTimestamp | null;
  canEdit: boolean;
  canModerate: boolean;
  replies: CommentView[];
  // Continue this thread with replyTo=id and replyCursor on the same question page.
  repliesNextCursor: string | null;
}

export interface CommentThreads {
  comments: CommentView[];
  // Comments are switched on for this collection.
  enabled: boolean;
  // The viewer may post (signed in, has access, comments on, not on hold).
  canComment: boolean;
}

export interface CreateCommentRequest {
  body: string;
  parentId?: string;
}

export interface UpdateCommentRequest {
  body: string;
  version: number;
}
