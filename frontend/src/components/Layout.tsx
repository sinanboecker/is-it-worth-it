import {
  ActionIcon,
  AppShell,
  Box,
  Burger,
  Divider,
  Group,
  NavLink,
  ScrollArea,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBook,
  IconBookmark,
  IconChartBar,
  IconDeviceGamepad2,
  IconHeart,
  IconLayoutDashboard,
  IconMoon,
  IconPackage,
  IconPlayerPlay,
  IconPlus,
  IconSettings,
  IconStack2,
  IconSun,
} from "@tabler/icons-react";
import { useState, type ComponentType } from "react";
import { Link, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { useCategories } from "@/api/queries";
import { categoryIcon } from "./CategoryIcon";
import { CategoryModal } from "./CategoryModal";
import { NewItemModal } from "./ItemModals";
import { RawgAttribution } from "./MetadataModals";
import { SearchBar } from "./SearchBar";

const MAIN_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: IconLayoutDashboard },
  { to: "/now-playing", label: "Now Playing", icon: IconPlayerPlay },
  { to: "/journal", label: "Journal", icon: IconBook },
  { to: "/favorites", label: "Favorites", icon: IconHeart },
  { to: "/wishlist", label: "Wishlist", icon: IconBookmark },
  { to: "/backlog", label: "Backlog", icon: IconStack2 },
  { to: "/bundles", label: "Bundles", icon: IconPackage },
];

const MORE_LINKS = [
  { to: "/stats", label: "Stats", icon: IconChartBar },
  { to: "/settings", label: "Settings", icon: IconSettings },
];

export function Layout() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingGame, setAddingGame] = useState(false);
  const categoryPage = useMatch("/categories/:id");
  const categories = useCategories();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");

  const link = ({ to, label, icon: Icon }: { to: string; label: string; icon: ComponentType<{ size?: number | string }> }) => (
    <NavLink
      key={to}
      component={Link}
      to={to}
      label={label}
      leftSection={<Icon size={18} />}
      active={location.pathname.startsWith(to)}
      onClick={close}
    />
  );

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="md">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <IconDeviceGamepad2 size={26} />
            <Title order={4} visibleFrom="xs" style={{ whiteSpace: "nowrap" }}>
              Is It Worth It?
            </Title>
          </Group>
          <Group flex={1} justify="center" gap="xs" wrap="nowrap">
            <SearchBar />
            <ActionIcon variant="filled" size="lg" aria-label="Add game" title="Add game" onClick={() => setAddingGame(true)}>
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Toggle color scheme"
            onClick={() => setColorScheme(scheme === "light" ? "dark" : "light")}
          >
            {scheme === "light" ? <IconMoon size={18} /> : <IconSun size={18} />}
          </ActionIcon>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea}>
          {MAIN_LINKS.map(link)}
          <Divider my="xs" />
          <Group justify="space-between" px="sm" mb={4}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Categories
            </Text>
            <ActionIcon variant="subtle" size="sm" aria-label="New category" onClick={() => setAddingCategory(true)}>
              <IconPlus size={14} />
            </ActionIcon>
          </Group>
          {categories.data?.map((c) =>
            link({ to: `/categories/${c.id}`, label: c.name, icon: categoryIcon(c) }),
          )}
          <Divider my="xs" />
          {MORE_LINKS.map(link)}
        </AppShell.Section>
      </AppShell.Navbar>
      {addingGame && (
        <NewItemModal
          opened
          defaultCategoryId={categoryPage ? Number(categoryPage.params.id) : undefined}
          onClose={() => setAddingGame(false)}
          onCreated={(item) => navigate(`/items/${item.id}`)}
        />
      )}
      {addingCategory && (
        <CategoryModal
          onClose={(saved) => {
            setAddingCategory(false);
            if (saved) {
              close();
              navigate(`/categories/${saved.id}`);
            }
          }}
        />
      )}

      <AppShell.Main>
        <Outlet />
        <Box mt="xl" pt="md" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
          <RawgAttribution />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
