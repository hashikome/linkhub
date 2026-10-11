import type { Metadata } from "next";

export const metadata: Metadata = { title: "Import guide · Support" };

export default function Page() {
  return (
    <section className="reader account-flow support-page">
      <a href="/support">← Support</a>
      <h1>Import your links</h1>
      <p>
        Upload a file in <a href="/manage/import-export">Import → New import</a>. Review each
        collection before saving; unfinished collection drafts stay in Review.
      </p>
      <h2>Browser bookmarks</h2>
      <p>
        Export your bookmarks as HTML from your browser. Browser wrappers such as Bookmarks bar are
        ignored. Meaningful folders become collections; leaf folders become sections. Collection
        references preserve larger branches, and folders containing only one collection reference
        are collapsed.
      </p>
      <p>
        Links outside these folders need a collection. Select the unfiled links in the review and
        use Set collection, or edit a row’s collection individually.
      </p>
      <h2>CSV</h2>
      <p>
        Use the header <code>collection,section,url,tags</code>. Each named collection becomes a new
        collection; existing collections are never matched or updated. Section and tags are
        optional.
      </p>
      <p>
        Keep each collection and section together in consecutive rows, repeating their values.
        Separate tags with semicolons and quote cells containing commas or line breaks. Add
        collection and section descriptions after import.
      </p>
      <p>
        <a href="/import-template.csv" download>
          Download the CSV template
        </a>
      </p>
      <h2>Text files</h2>
      <p>
        Use a UTF-8 .txt file with one URL per line and no header. Blank lines are ignored. Select
        the links in your draft to assign a collection.
      </p>
      <h2>Review and save</h2>
      <p>
        Titles come from the linked pages. Use Edit to fix an address or tags in place. Select
        unreachable links to revalidate, or unwanted links to remove. Each action shows how many
        links it affects. You can select up to 50 links at a time.
      </p>
      <p>
        Each collection defaults to published. Turn off Publish when imported to keep it
        unpublished. Import saves all its ready links in the background; links needing attention
        stay for repair. You can review another collection while it finishes, then use View
        collection to see the result.
      </p>
      <p>Imported links stay saved when you discard a collection draft.</p>
      <h2>Limits</h2>
      <p>
        Each file can contain up to 5,000 links and be up to 10 MB. You can keep three open drafts;
        drafts expire after 30 days without changes.
      </p>
    </section>
  );
}
