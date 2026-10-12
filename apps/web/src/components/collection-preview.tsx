import type { ReactNode } from "react";
import { CollectionHeading } from "./collection-heading";
import { Tags } from "./primitives";
import type { ResourcePresentation } from "./resource-presentation";
import { ResourceSections } from "./resource-sections";

export function CollectionPreview({
  context,
  title,
  description,
  tags = [],
  metadata,
  example = false,
  items,
  selectedItem,
  itemBase,
}: {
  context: string;
  title: string;
  description: string;
  tags?: string[];
  metadata?: ReactNode;
  example?: boolean;
  items: ResourcePresentation[];
  selectedItem?: ResourcePresentation;
  itemBase?: string | null;
}) {
  const Surface = example ? "figure" : "section";
  return (
    <Surface
      className="collection-example collection-sheet"
      aria-label={example ? "Example collection" : title}
    >
      <div className="sheet-bar">
        <span className="context">{context}</span>
        {example && <span className="example-badge">Example</span>}
      </div>
      <CollectionHeading>
        <h2>{title}</h2>
        <p className="description">{description}</p>
        <Tags tags={tags} limit={3} expandable />
        {metadata}
      </CollectionHeading>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The desktop resource panel supports keyboard scrolling. */}
      <section className="sheet-body" aria-label="Resources" tabIndex={0}>
        <ResourceSections items={items} selectedItem={selectedItem} itemBase={itemBase} preview />
      </section>
    </Surface>
  );
}
