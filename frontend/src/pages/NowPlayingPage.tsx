import { Anchor, Button, Card, Collapse, Group, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconCheck, IconPlayerPause, IconPlayerPlay, IconPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, unwrap } from "@/api/client";
import { useApiMutation, useNowPlaying } from "@/api/queries";
import type { GameStatus, ItemSummary, NowPlayingCard } from "@/api/types";
import { Cover, Empty, imageOf, PageHeader, QueryView } from "@/components/common";
import { Stars } from "@/components/inputs";
import { AddHoursModal, FinishModal } from "@/components/ItemModals";
import { day, hours } from "@/lib/format";

function useSetStatus(game: ItemSummary) {
  return useApiMutation(
    (status: GameStatus) =>
      unwrap(api.PATCH("/api/v1/items/{item_id}", { params: { path: { item_id: game.id } }, body: { status } })),
    { success: "Status changed" },
  );
}

function PlayingCard({ card }: { card: NowPlayingCard }) {
  const game = card.item;
  const [modal, setModal] = useState<"hours" | "finish" | null>(null);
  const setStatus = useSetStatus(game);
  const be = card.break_even;
  const played = game.devices.filter((d) => d.hours > 0);

  return (
    <Card withBorder padding="md">
      <Group align="flex-start" wrap="nowrap">
        <Cover name={game.name} path={imageOf(game)} width={140} />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Anchor component={Link} to={`/items/${game.id}`} fw={600} lineClamp={2}>
            {game.name}
          </Anchor>
          <Text size="sm">
            {hours(game.value?.hours)}
            {played.length > 1 && (
              <Text span size="xs" c="dimmed">
                {" "}
                ({played.map((d) => `${d.hardware_name} ${hours(d.hours)}`).join(", ")})
              </Text>
            )}
          </Text>
          <Text size="xs" c="dimmed">
            {game.last_played_on ? `Last played ${day(game.last_played_on)}` : "Not played yet"}
            {card.days_since_start !== null && ` · started ${card.days_since_start} days ago`}
          </Text>
          {game.rating !== null && <Stars value={game.rating} size="xs" />}
        </Stack>
      </Group>
      {be && (
        <Stack gap={2} mt="sm">
          <Progress value={be.progress * 100} color={be.progress >= 1 ? "green" : "indigo"} />
          <Text size="xs" c="dimmed">
            {be.progress >= 1
              ? "Worth it ✔"
              : `${hours(be.hours)} / ${hours(be.target_hours)} · ${hours(be.hours_left)} left until it's worth it`}
          </Text>
        </Stack>
      )}
      <Group gap="xs" mt="sm">
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setModal("hours")}>
          Hours
        </Button>
        <Button size="xs" variant="light" color="green" leftSection={<IconCheck size={14} />} onClick={() => setModal("finish")}>
          Finished
        </Button>
        <Button size="xs" variant="subtle" color="yellow" leftSection={<IconPlayerPause size={14} />} onClick={() => setStatus.mutate("on_hold")}>
          On hold
        </Button>
        <Button size="xs" variant="subtle" color="red" leftSection={<IconX size={14} />} onClick={() => setStatus.mutate("abandoned")}>
          Abandon
        </Button>
      </Group>
      {modal === "hours" && <AddHoursModal game={game} opened onClose={() => setModal(null)} />}
      {modal === "finish" && <FinishModal game={game} opened onClose={() => setModal(null)} />}
    </Card>
  );
}

function OnHoldRow({ card }: { card: NowPlayingCard }) {
  const setStatus = useSetStatus(card.item);
  return (
    <Group justify="space-between" wrap="nowrap">
      <Group gap="sm" wrap="nowrap">
        <Cover name={card.item.name} path={imageOf(card.item)} width={56} />
        <Anchor component={Link} to={`/items/${card.item.id}`} size="sm">
          {card.item.name}
        </Anchor>
        <Text size="xs" c="dimmed">
          {hours(card.item.value?.hours)}
        </Text>
      </Group>
      <Button size="xs" variant="light" leftSection={<IconPlayerPlay size={14} />} onClick={() => setStatus.mutate("playing")}>
        Continue
      </Button>
    </Group>
  );
}

function UpNextCard({ game }: { game: ItemSummary }) {
  const setStatus = useSetStatus(game);
  return (
    <Card withBorder padding="xs">
      <Stack gap={6} align="center">
        <Cover name={game.name} path={imageOf(game)} width="100%" />
        <Anchor component={Link} to={`/items/${game.id}`} size="sm" ta="center" lineClamp={2}>
          {game.name}
        </Anchor>
        <Text size="xs" c="dimmed">
          bought {day(game.copies_summary.first_bought_on)}
        </Text>
        <Button size="compact-xs" variant="light" onClick={() => setStatus.mutate("playing")}>
          Start playing
        </Button>
      </Stack>
    </Card>
  );
}

export function NowPlayingPage() {
  const query = useNowPlaying();
  const [onHoldOpen, { toggle }] = useDisclosure(true);
  return (
    <QueryView query={query}>
      {(data) => (
        <Stack gap="xl">
          <div>
            <PageHeader title="Now Playing" />
            {data.playing.length ? (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {data.playing.map((card) => (
                  <PlayingCard key={card.item.id} card={card} />
                ))}
              </SimpleGrid>
            ) : (
              <Empty>Nothing in progress. Pick something from “Up next” below or from your backlog.</Empty>
            )}
          </div>

          {data.on_hold.length > 0 && (
            <div>
              <Title order={4} mb="xs" style={{ cursor: "pointer" }} onClick={toggle}>
                On hold ({data.on_hold.length}) {onHoldOpen ? "▾" : "▸"}
              </Title>
              <Collapse in={onHoldOpen}>
                <Stack gap="xs">
                  {data.on_hold.map((card) => (
                    <OnHoldRow key={card.item.id} card={card} />
                  ))}
                </Stack>
              </Collapse>
            </div>
          )}

          {data.up_next.length > 0 && (
            <div>
              <Title order={4} mb="xs">
                Up next <Text span c="dimmed" size="sm">(oldest in your backlog)</Text>
              </Title>
              <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }}>
                {data.up_next.map((game) => (
                  <UpNextCard key={game.id} game={game} />
                ))}
              </SimpleGrid>
            </div>
          )}
        </Stack>
      )}
    </QueryView>
  );
}
