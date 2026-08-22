export interface SectionedNavigationItem<TSection extends string = string> {
  id: string;
  section: TSection;
}

export interface NavigationGroup<
  TSection extends string,
  TItem extends SectionedNavigationItem<TSection>,
> {
  section: TSection;
  items: TItem[];
}

/**
 * Splits the sidebar into favourites and regular sections.
 *
 * A favourite is deliberately removed from its regular section so the same
 * navigation target is never rendered twice. Unknown/stale pinned ids are
 * ignored without changing the user's saved order.
 */
export function splitPinnedNavigation<
  TSection extends string,
  TItem extends SectionedNavigationItem<TSection>,
>(
  items: TItem[],
  pinnedIds: string[],
  sectionOrder: readonly TSection[],
): { pinnedItems: TItem[]; groupedItems: NavigationGroup<TSection, TItem>[] } {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const seenPinned = new Set<string>();
  const pinnedItems: TItem[] = [];

  for (const id of pinnedIds) {
    const item = itemsById.get(id);
    if (!item || seenPinned.has(id)) continue;
    seenPinned.add(id);
    pinnedItems.push(item);
  }

  const groupedItems = sectionOrder
    .map((section) => ({
      section,
      items: items.filter(
        (item) => item.section === section && !seenPinned.has(item.id),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return { pinnedItems, groupedItems };
}
