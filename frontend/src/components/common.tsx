import { Alert, Box, Center, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

/** Renders loading / error states of a query, then `children(data)`. */
export function QueryView<T>({
  query,
  children,
}: {
  query: UseQueryResult<T, Error>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  if (query.isError) {
    return (
      <Alert color="red" title="Couldn't load data">
        {query.error.message}
      </Alert>
    );
  }
  return <>{children(query.data)}</>;
}

export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <Group justify="space-between" mb="md" wrap="wrap">
      <Title order={2}>{title}</Title>
      <Group gap="xs">{children}</Group>
    </Group>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="xl" fw={700} mt={4}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed" mt={2}>
          {hint}
        </Text>
      )}
    </Paper>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Stack align="center" p="xl">
      <Text c="dimmed">{children}</Text>
    </Stack>
  );
}

const PLACEHOLDER_COLORS = ["indigo", "teal", "grape", "orange", "cyan", "pink", "lime", "violet"];

/** The image to show: an own upload wins over the RAWG image. */
export const imageOf = (item: { image_path?: string | null; cover_path?: string | null }) =>
  item.image_path ?? item.cover_path ?? null;

/**
 * Wide (16:9) game/device image, like RAWG's artwork; a colored placeholder with initials when there is none.
 * `width` in px, or "100%" to fill the parent.
 */
export function Cover({ name, path, width }: { name: string; path?: string | null; width: number | "100%" }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const color = PLACEHOLDER_COLORS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % PLACEHOLDER_COLORS.length];
  const small = typeof width === "number" && width < 80;
  return (
    <Box
      w={width}
      style={{
        aspectRatio: "16 / 9",
        borderRadius: small ? 4 : 8,
        overflow: "hidden",
        flexShrink: 0,
        background: `var(--mantine-color-${color}-light)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {path ? (
        <img
          src={`/api/v1/media/${path}`}
          alt={name}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <Text fw={700} c={`${color}.6`} size={small ? "xs" : "xl"}>
          {initials}
        </Text>
      )}
    </Box>
  );
}
