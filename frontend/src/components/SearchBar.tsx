import { Group, Select, Text } from "@mantine/core";
import { useDebouncedValue, useHotkeys } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCategories, useItems } from "@/api/queries";
import { STATUS } from "@/lib/labels";
import { groupSameGames, mainEntry } from "@/lib/titles";

const MAX_RESULTS = 10;

/** Header search over all games and hardware by name; picking a result opens it. Ctrl+K focuses it. The same game on
 * several platforms is one result listing its platforms; it opens the most played one (the game page links the others). */
export function SearchBar() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search.trim(), 200);
  const items = useItems({ q: debounced }, debounced.length > 0);
  const categories = useCategories();
  useHotkeys([["mod+K", () => input.current?.focus()]]);

  const categoryName = (id: number) => categories.data?.find((c) => c.id === id)?.name ?? "";
  const categoryOrder = (id: number) => categories.data?.findIndex((c) => c.id === id) ?? 0;
  const groups = debounced ? groupSameGames(items.data ?? []).slice(0, MAX_RESULTS) : [];
  const results = groups.map((group) => ({ item: mainEntry(group), group }));
  const byId = new Map(results.map((r) => [String(r.item.id), r]));

  return (
    <Select
      ref={input}
      aria-label="Search"
      placeholder="Search games and hardware"
      leftSection={<IconSearch size={16} />}
      rightSection={<span />}
      w="100%"
      maw={420}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      value={null}
      onChange={(id) => {
        if (!id) return;
        navigate(`/items/${id}`);
        setSearch("");
        input.current?.blur();
      }}
      data={results.map(({ item }) => ({ value: String(item.id), label: item.name }))}
      filter={({ options }) => options}  // the server already filtered by name
      nothingFoundMessage={debounced && items.isSuccess ? "Nothing found" : undefined}
      withCheckIcon={false}
      // the autosized dropdown would grow to the longest name; keep it at the input width so names truncate
      scrollAreaProps={{ styles: { content: { minWidth: 0 } } }}
      renderOption={({ option }) => {
        const { item, group = [] } = byId.get(option.value) ?? {};
        const detail = item?.kind === "hardware" ? "Hardware" : item?.status ? STATUS[item.status].label : "";
        const platforms = [...group].sort((a, b) => categoryOrder(a.category_id) - categoryOrder(b.category_id));
        return (
          <Group justify="space-between" wrap="nowrap" w="100%" gap="sm">
            <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
              {option.label}
            </Text>
            <Text size="xs" c="dimmed" truncate maw="45%" style={{ flexShrink: 0 }}>
              {group.length > 1
                ? platforms.map((i) => categoryName(i.category_id)).join(" · ")
                : [item && categoryName(item.category_id), detail].filter(Boolean).join(" · ")}
            </Text>
          </Group>
        );
      }}
    />
  );
}
