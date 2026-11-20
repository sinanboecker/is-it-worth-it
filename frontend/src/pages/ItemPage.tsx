import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Menu,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconCheck,
  IconDots,
  IconExternalLink,
  IconEdit,
  IconPhoto,
  IconPhotoOff,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUnlink,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, unwrap, upload } from "@/api/client";
import { useApiMutation, useCategories, useItem } from "@/api/queries";
import type { GameStatus, ItemRead } from "@/api/types";
import { CopyBadges, StatusBadge, WorthItBadge } from "@/components/badges";
import { confirmDelete, Cover, imageOf, QueryView } from "@/components/common";
import { FavoriteHeart, Stars, StatusSelect } from "@/components/inputs";
import { CopyModal } from "@/components/CopyModal";
import { AddHoursModal, FinishModal } from "@/components/ItemModals";
import { MetadataSearchModal } from "@/components/MetadataModals";
import { hours } from "@/lib/format";
import { STATUS } from "@/lib/labels";
import { useCategoryLookup } from "@/lib/categories";
import { ggDealsUrl, steamUrl } from "@/lib/links";
import {
  AboutSection,
  CompletionsSection,
  CopiesSection,
  DevicesSection,
  DlcSection,
  EditItemModal,
  NotesSection,
  patchItem,
  PlayedGames,
  ValueTiles,
  WishlistSection,
} from "./ItemSections";

/** Links to the game on Steam (when its Steam app ID is known) and, for wishlist games, its prices on gg.deals. */
function StoreLinks({ item, wishlist }: { item: ItemRead; wishlist: boolean }) {
  const steam = steamUrl(item.steam_app_id);
  if (!steam && !wishlist) return null;
  const link = (href: string, label: string) => (
    <Anchor href={href} target="_blank" rel="noreferrer" size="sm">
      <Group gap={4} wrap="nowrap">
        {label}
        <IconExternalLink size={14} />
      </Group>
    </Anchor>
  );
  return (
    <Group gap="md">
      {steam && link(steam, "Steam")}
      {wishlist && link(ggDealsUrl(item), "gg.deals")}
    </Group>
  );
}

/** The same game on other platforms (separate entries, see app/titles.py): switch between them. */
function PlatformSwitch({ item }: { item: ItemRead }) {
  const navigate = useNavigate();
  const categories = useCategoryLookup();
  const entries = [
    { id: item.id, category_id: item.category_id, category_name: categories.name(item.category_id), status: item.status, hours: item.value?.hours ?? 0 },
    ...item.other_platforms,
  ].sort((a, b) => categories.compare(a.category_id, b.category_id));
  return (
    <SegmentedControl
      size="xs"
      aria-label="Platform"
      data={entries.map((e) => ({
        value: String(e.id),
        label: (
          <span title={e.status ? STATUS[e.status].label : undefined}>
            {e.category_name}
            {e.hours > 0 && <Text span size="xs" c="dimmed">{` · ${hours(e.hours)}`}</Text>}
          </span>
        ),
      }))}
      value={String(item.id)}
      onChange={(id) => navigate(`/items/${id}`)}
    />
  );
}

function ItemView({ item }: { item: ItemRead }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const fileInput = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<"hours" | "finish" | "edit" | "copy" | "metadata" | null>(null);
  const unlink = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/items/{item_id}/metadata", { params: { path: { item_id: item.id } } })),
    { success: "Unlinked from RAWG" },
  );
  const uploadImage = useApiMutation(
    (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return upload<ItemRead>(`/api/v1/items/${item.id}/image`, form);
    },
    { success: "Image saved" },
  );
  const removeImage = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/items/{item_id}/image", { params: { path: { item_id: item.id } } })),
    { success: "Own image removed" },
  );
  const setStatus = useApiMutation((status: GameStatus) => patchItem(item.id, { status }), { success: "Status changed" });
  const setRating = useApiMutation((rating: number | null) => patchItem(item.id, { rating }), {});
  const setFavorite = useApiMutation((favorite: boolean) => patchItem(item.id, { favorite }), {
    success: (updated) => (updated.favorite ? `${updated.name} is a favorite ❤` : `${updated.name} removed from favorites`),
  });
  const remove = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/items/{item_id}", { params: { path: { item_id: item.id } } })),
    { success: `${item.name} deleted`, onSuccess: () => navigate(`/categories/${item.category_id}`) },
  );
  const category = categories.data?.find((c) => c.id === item.category_id);
  const isGame = item.kind === "game";
  const wishlist = item.status === "wishlist";

  return (
    <Stack>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) uploadImage.mutate(file);
          e.currentTarget.value = "";
        }}
      />
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Group align="flex-start" wrap="wrap">
          <Cover name={item.name} path={imageOf(item)} width={280} />
          <Stack gap={6}>
            <Title order={2}>{item.name}</Title>
            {item.other_platforms.length > 0 && <PlatformSwitch item={item} />}
            <Group gap="xs">
              {category && (
                <Anchor component={Link} to={`/categories/${category.id}`} size="sm">
                  {category.name}
                </Anchor>
              )}
              <StatusBadge status={item.status} />
              <WorthItBadge value={item.value} />
              <CopyBadges item={item} />
            </Group>
            {isGame && <StoreLinks item={item} wishlist={wishlist} />}
            {isGame && (
              <Group gap={6}>
                {!wishlist && <Stars value={item.rating} onChange={(r) => setRating.mutate(r)} size="md" />}
                <FavoriteHeart value={item.favorite} onChange={(f) => setFavorite.mutate(f)} />
              </Group>
            )}
          </Stack>
        </Group>
        <Group gap="xs">
          {isGame && !item.rawg_id && (
            <Button variant="light" leftSection={<IconSearch size={16} />} onClick={() => setModal("metadata")}>
              Find info
            </Button>
          )}
          {isGame && !wishlist && (
            <>
              <Button leftSection={<IconPlus size={16} />} onClick={() => setModal("hours")}>
                Hours
              </Button>
              <Button variant="light" color="green" leftSection={<IconCheck size={16} />} onClick={() => setModal("finish")}>
                Finished
              </Button>
            </>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="More">
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => setModal("edit")}>
                Rename / move
              </Menu.Item>
              {isGame && (
                <Menu.Item leftSection={<IconSearch size={14} />} onClick={() => setModal("metadata")}>
                  {item.rawg_id ? "Change RAWG match" : "Find info on RAWG"}
                </Menu.Item>
              )}
              {item.rawg_id && (
                <Menu.Item leftSection={<IconUnlink size={14} />} onClick={() => unlink.mutate(undefined)}>
                  Unlink from RAWG
                </Menu.Item>
              )}
              <Menu.Item leftSection={<IconPhoto size={14} />} onClick={() => fileInput.current?.click()}>
                Upload own image
              </Menu.Item>
              {item.image_path && (
                <Menu.Item leftSection={<IconPhotoOff size={14} />} onClick={() => removeImage.mutate(undefined)}>
                  Remove own image
                </Menu.Item>
              )}
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() =>
                  confirmDelete(`Delete ${item.name}?`, "Copies, hours, DLC and finishes are deleted too.", () => remove.mutate(undefined))
                }
              >
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {isGame && !wishlist && (
        <Group>
          <StatusSelect
            value={item.status}
            onChange={(s) => (s === "finished" ? setModal("finish") : setStatus.mutate(s))}
            allowWishlist={false}
          />
        </Group>
      )}

      <ValueTiles item={item} />
      {isGame && (item.rawg_id || item.summary) && <AboutSection game={item} onChangeMatch={() => setModal("metadata")} />}

      {wishlist ? (
        <WishlistSection game={item} onBought={() => setModal("copy")} />
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          {isGame && <DevicesSection game={item} />}
          {isGame && <CompletionsSection game={item} onFinish={() => setModal("finish")} />}
          {!isGame && <PlayedGames item={item} />}
          {isGame && <DlcSection game={item} />}
        </SimpleGrid>
      )}
      {!wishlist && <CopiesSection item={item} />}
      <NotesSection key={item.notes ?? ""} item={item} />

      {modal === "hours" && <AddHoursModal game={item} opened onClose={() => setModal(null)} />}
      {modal === "finish" && <FinishModal game={item} opened onClose={() => setModal(null)} />}
      {modal === "edit" && <EditItemModal item={item} onClose={() => setModal(null)} />}
      {modal === "copy" && <CopyModal item={item} opened onClose={() => setModal(null)} />}
      {modal === "metadata" && <MetadataSearchModal game={item} onClose={() => setModal(null)} />}
    </Stack>
  );
}

export function ItemPage() {
  const id = Number(useParams().id);
  const query = useItem(id);
  return <QueryView query={query}>{(item) => <ItemView key={item.id} item={item} />}</QueryView>;
}
