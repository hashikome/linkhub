# Exports

Status: implemented in the API; the web export screen is pending.

## Rendering and authorization

Export one or more collections as Markdown, PDF, or Word — synchronously.
`POST /exports { format, collectionIds[], expand? }` authorizes every id up
front and responds with the file itself (a zip when several collections are
selected, one document per collection). By default (`expand: false`), references
stay immutable `/c/<id>` hyperlinks using the configured web origin. The title
is H1 with its description below, and ordered heading resources become H2.
Explicit `expand: true` includes readable referenced collections as H2 sections;
headings inside them become H3. Their references, and self references, stay links.
Every destination is individually authorized without propagating source tokens.
Unreadable or deleted targets produce a generic unavailable notice, not private
metadata or silent omission. External links remain hyperlinks without fetched content.

All three renderers are programmatic (markdown string-building, `pdfkit`,
`docx`), so no format uses a job queue, no artifacts are stored server-side, and there is nothing to retain or
clean up. BullMQ/Redis dispatch email delivery from the PostgreSQL outbox to a
separate worker; exports do not use that queue.

## Planned web download controls

Word, Markdown and PDF are all offered (the API already renders all three). A
collection page offers **Download**; exporting several collections at once is
from a selection in Manage › Collections.
