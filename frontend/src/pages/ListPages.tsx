import { Button, SegmentedControl, Stack, Text } from "@mantine/core";
import { IconLayoutGrid, IconList, IconPlus } from "@tabler/icons-react";
import { useLocalStorage } from "@mantine/hooks";
import { useState } from "react";
import { useCategories, useItems } from "@/api/queries";
import type { Category, ItemSummary } from "@/api/types";
import { PageHeader, QueryView, ViewLabel } from "@/components/common";
import { NewItemModal } from "@/components/ItemModals";
import { CoverGrid, ItemTable, type Column } from "@/components/ItemList";
import { combineGroup, groupSameGames } from "@/lib/titles";

/** The category of each item; `platforms` lists all categories of a game shown once for several platforms. */
function categoryColumn(categories: Category[] | undefined, platforms?: Map<number, number[]>): Column {
  const names = new Map(categories?.map((c) => [c.id, c.name]));
  const order = new Map(categories?.map((c, index) => [c.id, index]));
  const label = (i: ItemSummary) =>
    (platforms?.get(i.id) ?? [i.category_id])
      .toSorted((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map((id) => names.get(id) ?? "")
      .join(" · ");
  return { key: "category", label: "Category", render: label, sort: label };
}

export function WishlistPage() {
  const items = useItems({ status: "wishlist" });
  const categories = useCategories();
  const [adding, setAdding] = useState(false);
  return (
    <Stack>
      <PageHeader title="Wishlist">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>
          Add to wishlist
        </Button>
      </PageHeader>
      <Text size="sm" c="dimmed">
        Current prices from gg.deals (official stores and keyshops) are added in a later milestone.
      </Text>
      <QueryView query={items}>
        {(data) => (
          <ItemTable items={data} columns={["name", categoryColumn(categories.data), "target"]} empty="Your wishlist is empty." />
        )}
      </QueryView>
      {adding && <NewItemModal opened wishlist onClose={() => setAdding(false)} />}
    </Stack>
  );
}

export function FavoritesPage() {
  const items = useItems({ favorite: true });
  const categories = useCategories();
  // grid or list, remembered in the browser
  const [view, setView] = useLocalStorage<"grid" | "table">({ key: "favorites-view", defaultValue: "grid", getInitialValueInEffect: false });
  return (
    <Stack>
      <PageHeader title="Favorites">
        <SegmentedControl
          data={[
            { value: "grid", label: <ViewLabel icon={IconLayoutGrid} label="Grid" /> },
            { value: "table", label: <ViewLabel icon={IconList} label="List" /> },
          ]}
          value={view}
          onChange={(v) => setView(v as "grid" | "table")}
        />
      </PageHeader>
      <QueryView query={items}>
        {(data) => {
          // the same game on several platforms is one favorite, with the hours and cost of all of them
          const groups = groupSameGames(data);
          const games = groups.map(combineGroup);
          const platforms = new Map(games.map((g, index) => [g.id, groups[index].map((i) => i.category_id)]));
          return view === "grid" ? (
            <CoverGrid items={games} empty="No favorites yet. Click the heart next to a game's stars." />
          ) : (
            <ItemTable
              items={games}
              columns={["name", categoryColumn(categories.data, platforms), "released", "status", "rating", "hours", "cph", "finished"]}
              initialSort="name"
              empty="No favorites yet. Click the heart next to a game's stars."
            />
          );
        }}
      </QueryView>
    </Stack>
  );
}

export function BacklogPage() {
  const items = useItems({ status: "backlog", sort: "first_bought" });
  const categories = useCategories();
  return (
    <Stack>
      <PageHeader title="Backlog" />
      <Text size="sm" c="dimmed">
        Bought but not started yet, oldest first.
      </Text>
      <QueryView query={items}>
        {(data) => (
          <ItemTable
            items={data}
            columns={["name", categoryColumn(categories.data), "bought", "cost", "worth", "copies"]}
            initialSort="bought"
            empty="Nothing in your backlog 🎉"
          />
        )}
      </QueryView>
    </Stack>
  );
}
