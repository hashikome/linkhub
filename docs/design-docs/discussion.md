# Collection discussion

Status: implemented. Comments, replies, answers and moderation on a
collection; access is the collection's own policy.

## Model and access

`collection_comments` hangs off one collection (cascade on delete): `parent_id`
for one level of replies, `state` visible/hidden/deleted, at most one `accepted`
reply per question (partial unique index), `author_user_id` set null if the
account goes. `collections.comments_enabled` (default true) is the owner's
switch. Access is the collection policy, unchanged: reading the discussion
requires `canRead`; posting additionally requires a session, comments on and no
active hold; hiding and marking answers require `canWriteContent` (owner or
direct contributor); edit/delete require authorship. Replies from the owner or a
contributor carry the role in the API (`author.role`: `owner` | `contributor`) and are
badged **Contributor** in the web — one label for everyone who maintains the
collection ([roles and labels](tenancy-and-access.md#roles-and-labels)). Hide is moderation of
others' comments (spam, abuse, off-topic) — contributors can't delete someone
else's words; on their own comments they see Delete instead. Routes:
`GET|POST /api/v1/collections/:id/comments` (share token accepted, cursor over
questions newest first) and `PATCH|DELETE /api/v1/comments/:id`,
`POST /api/v1/comments/:id/{hide,show,accept,unaccept}`.

## Pagination

`GET /api/v1/collections/:id/comments` paginates questions with `cursor` and
`limit`. Each question includes `repliesNextCursor`; continue one question's
replies by supplying `replyTo=<question id>` and `replyCursor=<cursor>` alongside
the same question-page cursor. Reply cursors are bound to the question and
access is rechecked on every read. Each thread returns at most 100 readable
replies, with its readable accepted answer pinned first; other replies continue
in creation order. The native reader's More replies link preserves the question
page and share token, and works without JavaScript.

The API loads accepted answers for the question page together, then ranks
ordinary readable replies per question in one SQL query. A continuation filters
only its selected question; every other thread retains its first page. These
two reply queries do not grow with the number of questions. Mutation responses
reuse the authorized collection and database-returned comment within the existing
authority transaction; creating a comment also reuses its hold check.
