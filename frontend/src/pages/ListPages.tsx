import { Button, SegmentedControl, Stack, Text } from "@mantine/core";
import { IconLayoutGrid, IconList, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useCategories, useItems } from "@/api/queries";
import type { Category } from "@/api/types";
import { PageHeader, QueryView } from "@/components/common";
import { NewItemModal } from "@/components/ItemModals";
import { CoverGrid, ItemTable, type Column } from "@/components/ItemList";

function categoryColumn(categories: Category[] | undefined): Column {
  const names = new Map(categories?.map((c) => [c.id, c.name]));
  return {
    key: "category",
    label: "Category",
    render: (i) => names.get(i.category_id) ?? "",
    sort: (i) => names.get(i.category_id) ?? "",
  };
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
  const [view, setView] = useState<"grid" | "table">("grid");
  return (
    <Stack>
      <PageHeader title="Favorites">
        <SegmentedControl
          data={[
            { value: "grid", label: <IconLayoutGrid size={16} /> },
            { value: "table", label: <IconList size={16} /> },
          ]}
          value={view}
          onChange={(v) => setView(v as "grid" | "table")}
        />
      </PageHeader>
      <QueryView query={items}>
        {(data) =>
          view === "grid" ? (
            <CoverGrid items={data} empty="No favorites yet. Click the heart next to a game's stars." />
          ) : (
            <ItemTable
              items={data}
              columns={["name", categoryColumn(categories.data), "status", "rating", "hours", "cph", "finished"]}
              initialSort="name"
              empty="No favorites yet. Click the heart next to a game's stars."
            />
          )
        }
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
