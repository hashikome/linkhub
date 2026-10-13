import type { CommentThreads, CommentView } from "@ntumie/types";
import type { ReactNode } from "react";
import { AppForm } from "./app-form";
import { CommentFocus } from "./comment-focus";
import { FormNotice } from "./form-notice";
import { ShortTime } from "./local-time";
import { Person } from "./primitives";

// The discussion beside a collection. Everything is a native form posting to
// /forms/comment-*, so it works without JavaScript; the API decides every
// permission and the forms return here with a notice and an anchor.
function ActionForm({
  action,
  id,
  returnTo,
  children,
  className,
}: {
  action: string;
  id: string;
  returnTo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AppForm action={`/forms/${action}`} method="post" className={className}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {children}
    </AppForm>
  );
}

function Composer({
  collectionId,
  parentId,
  returnTo,
  label,
  placeholder,
}: {
  collectionId: string;
  parentId?: string;
  returnTo: string;
  label: string;
  placeholder: string;
}) {
  const field = `comment-body-${parentId ?? "new"}`;
  return (
    <ActionForm
      action="comment-post"
      id={collectionId}
      returnTo={returnTo}
      className="comment-form"
    >
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <label htmlFor={field} className="sr-only">
        {label}
      </label>
      <textarea
        id={field}
        name="body"
        required
        maxLength={2000}
        rows={parentId ? 2 : 3}
        placeholder={placeholder}
      />
      <button type="submit" className="button primary">
        {parentId ? "Reply" : "Post"}
      </button>
    </ActionForm>
  );
}

function Comment({
  comment,
  collectionId,
  returnTo,
  canReply,
}: {
  comment: CommentView;
  collectionId: string;
  returnTo: string;
  canReply: boolean;
}) {
  // Readers only need to know the reply comes from someone who maintains the
  // collection; owner and editors are all contributors to them.
  const role = comment.author?.role ? "Contributor" : null;
  const live = comment.state === "visible";
  return (
    <article
      className={`comment${comment.accepted ? " accepted" : ""}${live ? "" : " muted"}`}
      id={`comment-${comment.id}`}
    >
      <header className="comment-head">
        {comment.author ? (
          <Person person={comment.author} />
        ) : (
          <span className="comment-author">Former member</span>
        )}
        {role && <span className="comment-role">{role}</span>}
        {comment.accepted && <span className="comment-answer">Answer</span>}
      </header>
      {comment.body !== null && comment.state !== "deleted" ? (
        <p className="comment-body">{comment.body}</p>
      ) : (
        <p className="comment-body comment-gone">
          {comment.state === "deleted" ? "This comment was deleted." : "Hidden by a contributor."}
        </p>
      )}
      {comment.state === "hidden" && comment.body !== null && (
        <p className="comment-note">Hidden from readers. Only contributors see it.</p>
      )}
      {/* TikTok-style: the comment's age leads its actions ("53m  Reply"). */}
      <div className="comment-actions">
        <span className="comment-time">
          <ShortTime at={comment.createdAt} />
          {comment.editedAt && " · edited"}
        </span>
        {canReply && !comment.parentId && comment.state !== "deleted" && (
          <details className="comment-more">
            <summary className="text-button">Reply</summary>
            <Composer
              collectionId={collectionId}
              parentId={comment.id}
              returnTo={returnTo}
              label="Your reply"
              placeholder="Write a reply…"
            />
          </details>
        )}
        {comment.canEdit && (
          <details className="comment-more">
            <summary className="text-button">Edit</summary>
            <ActionForm
              action="comment-edit"
              id={comment.id}
              returnTo={returnTo}
              className="comment-form"
            >
              <input type="hidden" name="version" value={comment.version} />
              <label htmlFor={`comment-edit-${comment.id}`} className="sr-only">
                Edit comment
              </label>
              <textarea
                id={`comment-edit-${comment.id}`}
                name="body"
                required
                maxLength={2000}
                rows={3}
                defaultValue={comment.body ?? ""}
              />
              <button type="submit" className="button primary">
                Save
              </button>
            </ActionForm>
          </details>
        )}
        {comment.canEdit && (
          <details className="comment-more">
            <summary className="text-button">Delete</summary>
            <ActionForm action="comment-delete" id={comment.id} returnTo={returnTo}>
              <p className="comment-confirm">Delete this comment?</p>
              <button type="submit" className="button danger">
                Delete comment
              </button>
            </ActionForm>
          </details>
        )}
        {comment.canModerate && comment.parentId && live && (
          <ActionForm
            action={comment.accepted ? "comment-unaccept" : "comment-accept"}
            id={comment.id}
            returnTo={returnTo}
          >
            <button type="submit" className="text-button">
              {comment.accepted ? "Unmark answer" : "Mark as answer"}
            </button>
          </ActionForm>
        )}
        {/* Moderation is for others' comments; authors delete their own. */}
        {comment.canModerate && !comment.canEdit && comment.state !== "deleted" && (
          <ActionForm
            action={comment.state === "hidden" ? "comment-show" : "comment-hide"}
            id={comment.id}
            returnTo={returnTo}
          >
            <button type="submit" className="text-button">
              {comment.state === "hidden" ? "Show" : "Hide"}
            </button>
          </ActionForm>
        )}
      </div>
    </article>
  );
}

export function Comments({
  collectionId,
  threads,
  returnTo,
  signedIn,
  notice,
  olderHref,
  commentCursor,
  composerOpen = false,
}: {
  collectionId: string;
  threads: CommentThreads | null;
  returnTo: string;
  signedIn: boolean;
  notice?: string;
  olderHref?: string;
  commentCursor?: string;
  composerOpen?: boolean;
}) {
  const count = threads
    ? threads.comments.reduce((total, c) => total + 1 + c.replies.length, 0)
    : 0;
  return (
    <section className="comments" id="comments" aria-labelledby="comments-title">
      <CommentFocus />
      <header className="comments-heading">
        <h2 id="comments-title">
          Discussion {count > 0 && <span className="comments-count">{count}</span>}
        </h2>
      </header>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The desktop discussion scrolls independently and needs keyboard focus for scrolling. */}
      <section className="comments-body" aria-label="Discussion comments" tabIndex={0}>
        {notice && <FormNotice code={notice} />}
        {!threads ? (
          <p className="comments-state">The discussion couldn't load. Reload to try again.</p>
        ) : !threads.enabled ? (
          <p className="comments-state">Comments are turned off for this collection.</p>
        ) : threads.canComment ? (
          <details className="comment-compose" id="comment-composer" open={composerOpen}>
            <summary>Add a comment</summary>
            <Composer
              collectionId={collectionId}
              returnTo={returnTo}
              label="Add to the discussion"
              placeholder="Ask a question or add a note…"
            />
          </details>
        ) : signedIn ? (
          <p className="comments-state">
            Comments are paused while this collection is under review.
          </p>
        ) : (
          <p className="comments-state">
            <a
              href={`/sign-in?returnTo=${encodeURIComponent(`${returnTo}${returnTo.includes("?") ? "&" : "?"}compose=comment#comment-composer`)}`}
            >
              Sign in to join the discussion
            </a>
          </p>
        )}
        {threads && threads.comments.length > 0 && (
          <ol className="comment-list">
            {threads.comments.map((comment) => (
              <li key={comment.id}>
                <Comment
                  comment={comment}
                  collectionId={collectionId}
                  returnTo={returnTo}
                  canReply={threads.canComment}
                />
                {comment.replies.length > 0 && (
                  <ol className="comment-replies">
                    {comment.replies.map((reply) => (
                      <li key={reply.id}>
                        <Comment
                          comment={reply}
                          collectionId={collectionId}
                          returnTo={returnTo}
                          canReply={false}
                        />
                      </li>
                    ))}
                  </ol>
                )}
                {comment.repliesNextCursor && (
                  <a
                    className="button comments-older"
                    href={`${returnTo}${returnTo.includes("?") ? "&" : "?"}${new URLSearchParams({ ...(commentCursor ? { cc: commentCursor } : {}), rt: comment.id, rc: comment.repliesNextCursor })}#comment-${comment.id}`}
                  >
                    More replies
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}
        {threads?.enabled && threads.comments.length === 0 && (
          <p className="comments-empty">
            No comments yet. Questions about these links are welcome.
          </p>
        )}
        {olderHref && (
          <a className="button comments-older" href={olderHref}>
            Older comments
          </a>
        )}
      </section>
    </section>
  );
}
