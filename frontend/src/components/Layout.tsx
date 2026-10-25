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
  IconFolder,
  IconHeart,
  IconLayoutDashboard,
  IconMoon,
  IconPlayerPlay,
  IconPlus,
  IconSettings,
  IconStack2,
  IconSun,
} from "@tabler/icons-react";
import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCategories } from "@/api/queries";
import { CategoryModal } from "./CategoryModal";
import { RawgAttribution } from "./MetadataModals";

const MAIN_LINKS = [
  { to: "/", label: "Dashboard", icon: IconLayoutDashboard },
  { to: "/now-playing", label: "Now Playing", icon: IconPlayerPlay },
  { to: "/journal", label: "Journal", icon: IconBook },
  { to: "/favorites", label: "Favorites", icon: IconHeart },
  { to: "/wishlist", label: "Wishlist", icon: IconBookmark },
  { to: "/backlog", label: "Backlog", icon: IconStack2 },
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
  const categories = useCategories();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");

  const link = ({ to, label, icon: Icon }: { to: string; label: string; icon: typeof IconBook }) => (
    <NavLink
      key={to}
      component={Link}
      to={to}
      label={label}
      leftSection={<Icon size={18} />}
      active={to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)}
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
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <IconDeviceGamepad2 size={26} />
            <Title order={4}>Is It Worth It?</Title>
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
            link({ to: `/categories/${c.id}`, label: c.name, icon: IconFolder }),
          )}
          <Divider my="xs" />
          {MORE_LINKS.map(link)}
        </AppShell.Section>
      </AppShell.Navbar>
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
