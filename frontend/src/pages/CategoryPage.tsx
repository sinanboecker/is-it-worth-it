import {
  Button,
  Group,
  MultiSelect,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Tabs,
  TextInput,
} from "@mantine/core";
import { IconFileImport, IconLayoutGrid, IconList, IconPlus, IconSearch } from "@tabler/icons-react";
import { FetchMissingModal } from "@/components/MetadataModals";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useCategories, useItems, useMetadataStatus, useSummary } from "@/api/queries";
import type { GameStatus, ItemKind, ItemSummary } from "@/api/types";
import { PageHeader, QueryView, StatTile, ViewLabel } from "@/components/common";
import { CsvImportModal } from "@/components/CsvImportModal";
import { NewItemModal } from "@/components/ItemModals";
import { CoverGrid, GAME_COLUMNS, HARDWARE_COLUMNS, ItemTable } from "@/components/ItemList";
import { euros, hours, perHour, percent } from "@/lib/format";
import { STATUS_OPTIONS } from "@/lib/labels";

type Ownership = "all" | "owned" | "sold";

function filterItems(
  items: ItemSummary[],
  { search, statuses, ownership, worth }: { search: string; statuses: string[]; ownership: Ownership; worth: string },
) {
  const q = search.trim().toLowerCase();
  return items.filter(
    (i) =>
      (!q || i.name.toLowerCase().includes(q)) &&
      (!statuses.length || (i.status && statuses.includes(i.status))) &&
      (ownership === "all" || (ownership === "owned" ? i.copies_summary.owned : i.copies_summary.sold)) &&
      (worth === "all" || (worth === "yes" ? i.value?.worth_it : i.value && !i.value.worth_it)),
  );
}

export function CategoryPage() {
  const id = Number(useParams().id);
  const categories = useCategories();
  const category = categories.data?.find((c) => c.id === id);
  const hardwareOnly = category?.type === "hardware_only";
  const items = useItems({ category: id });
  const summary = useSummary(id);
  const [tab, setTab] = useState<ItemKind>("game");
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [worth, setWorth] = useState("all");
  const [modal, setModal] = useState<"game" | "hardware" | "csv" | "metadata" | null>(null);
  const metadata = useMetadataStatus();
  const activeTab: ItemKind = hardwareOnly ? "hardware" : tab;

  if (!category) return <QueryView query={categories}>{() => "Category not found"}</QueryView>;

  return (
    <Stack>
      <PageHeader title={category.name}>
        {!hardwareOnly && (
          <>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setModal("game")}>
              Game
            </Button>
            <Button variant="light" leftSection={<IconFileImport size={16} />} onClick={() => setModal("csv")}>
              Import CSV
            </Button>
            {metadata.data?.rawg && (
              <Button variant="light" leftSection={<IconSearch size={16} />} onClick={() => setModal("metadata")}>
                Fetch info
              </Button>
            )}
          </>
        )}
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setModal("hardware")}>
          Hardware
        </Button>
      </PageHeader>

      <QueryView query={summary}>
        {(t) => (
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
            <StatTile label="Total cost" value={euros(t.total_cost_cents)} hint={`games ${euros(t.games_cost_cents)} · hardware ${euros(t.hardware_cost_cents)}`} />
            <StatTile label="Hours" value={hours(t.hours)} />
            <StatTile label="All-in €/h" value={perHour(t.all_in_cost_per_hour_cents)} hint="incl. hardware" />
            <StatTile label="Games €/h" value={perHour(t.games_cost_per_hour_cents)} />
            <StatTile label="Games" value={t.games_count} hint={`${t.hardware_count} devices`} />
            <StatTile label="Worth it" value={percent(t.worth_it_rate)} hint={`backlog ${euros(t.backlog_value_cents)}`} />
          </SimpleGrid>
        )}
      </QueryView>

      <Tabs value={activeTab} onChange={(v) => setTab((v as ItemKind) ?? "game")}>
        <Tabs.List>
          {!hardwareOnly && <Tabs.Tab value="game">Games</Tabs.Tab>}
          <Tabs.Tab value="hardware">Hardware</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <Group wrap="wrap" align="flex-end">
        <TextInput placeholder="Search" leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
        {activeTab === "game" && (
          <MultiSelect placeholder="Status" data={STATUS_OPTIONS} value={statuses} onChange={setStatuses} clearable w={260} />
        )}
        <SegmentedControl
          data={[
            { value: "all", label: "All" },
            { value: "owned", label: "Owned" },
            { value: "sold", label: "Sold" },
          ]}
          value={ownership}
          onChange={(v) => setOwnership(v as Ownership)}
        />
        <SegmentedControl
          data={[
            { value: "all", label: "Any value" },
            { value: "yes", label: "Worth it" },
            { value: "no", label: "Not yet" },
          ]}
          value={worth}
          onChange={setWorth}
        />
        {activeTab === "game" && (
          <SegmentedControl
            data={[
              { value: "table", label: <ViewLabel icon={IconList} label="List" /> },
              { value: "grid", label: <ViewLabel icon={IconLayoutGrid} label="Grid" /> },
            ]}
            value={view}
            onChange={(v) => setView(v as "table" | "grid")}
          />
        )}
      </Group>

      <QueryView query={items}>
        {(data) => {
          const visible = filterItems(
            data.filter((i) => i.kind === activeTab),
            { search, statuses: statuses as GameStatus[], ownership, worth },
          );
          if (activeTab === "game" && view === "grid") return <CoverGrid items={visible} />;
          return (
            <ItemTable
              items={visible}
              columns={activeTab === "game" ? GAME_COLUMNS : HARDWARE_COLUMNS}
              empty={activeTab === "game" ? "No games yet. Add one or import a CSV." : "No hardware yet."}
            />
          );
        }}
      </QueryView>

      {(modal === "game" || modal === "hardware") && (
        <NewItemModal opened onClose={() => setModal(null)} categoryId={id} kind={modal} />
      )}
      {modal === "csv" && (
        <CsvImportModal
          category={category}
          opened
          onClose={() => setModal(null)}
          onImported={(r) => r.games_created + r.wishlist_added > 0 && metadata.data?.rawg && setModal("metadata")}
        />
      )}
      {modal === "metadata" && <FetchMissingModal categoryId={id} onClose={() => setModal(null)} />}
    </Stack>
  );
}
