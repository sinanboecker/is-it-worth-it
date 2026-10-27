/** RAWG metadata: search & pick a match, bulk "fetch missing metadata", attribution. */
import {
  Alert,
  Anchor,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Progress,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation, useMetadataStatus, useRawgSearch } from "@/api/queries";
import type { Candidate, ItemSummary, ReviewItem } from "@/api/types";
import { day } from "@/lib/format";

/** Smaller thumbnails from RAWG's image CDN. It only serves some sizes: resized to a width of 80, 200, 420, 600, 640
 * or 1280 px; anything else (e.g. a crop to 420 × 236) is a 404. */
type RawgWidth = 80 | 200 | 420 | 600 | 640 | 1280;

export function rawgThumb(url: string | null | undefined, width: RawgWidth = 420): string | null {
  if (!url) return null;
  return url.replace(/\/media\/(games|screenshots)\//, `/media/resize/${width}/-/$1/`);
}

export function RawgAttribution() {
  return (
    <Text size="xs" c="dimmed">
      Game data and images from{" "}
      <Anchor href="https://rawg.io" target="_blank" rel="noreferrer" size="xs">
        RAWG
      </Anchor>
    </Text>
  );
}

export function RawgNotConfigured() {
  return (
    <Alert color="yellow" title="RAWG is not set up">
      Game info and images come from rawg.io. Get a free API key at rawg.io (“Get API key”) and set it as{" "}
      <code>RAWG_API_KEY</code> in the server's environment, then restart the server.
    </Alert>
  );
}

export function CandidateRow({ candidate, onPick, disabled }: { candidate: Candidate; onPick: () => void; disabled?: boolean }) {
  return (
    <UnstyledButton onClick={onPick} disabled={disabled} p={6} style={{ borderRadius: 8 }} className="candidate-row">
      <Group wrap="nowrap" align="center">
        <Box
          w={112}
          style={{ aspectRatio: "16 / 9", borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "var(--mantine-color-default-border)" }}
        >
          {candidate.image_url && (
            <img src={rawgThumb(candidate.image_url)!} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </Box>
        <div>
          <Text fw={600} size="sm">
            {candidate.name}
          </Text>
          <Text size="xs" c="dimmed">
            {candidate.released ? day(candidate.released) : "release date unknown"}
            {candidate.platforms.length > 0 && ` · ${candidate.platforms.slice(0, 4).join(", ")}${candidate.platforms.length > 4 ? ", …" : ""}`}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  );
}

const applyMetadata = (itemId: number, rawgId: number, rename = false) =>
  unwrap(
    api.POST("/api/v1/items/{item_id}/metadata", {
      params: { path: { item_id: itemId } },
      body: { rawg_id: rawgId, rename },
    }),
  );

/** Search RAWG and apply the chosen game to an item. */
export function MetadataSearchModal({ game, onClose }: { game: ItemSummary; onClose: () => void }) {
  const status = useMetadataStatus();
  const [query, setQuery] = useState(game.name);
  const [debounced] = useDebouncedValue(query, 350);
  const [rename, setRename] = useState(false);
  const results = useRawgSearch(debounced, status.data?.rawg ?? false);
  const apply = useApiMutation((rawgId: number) => applyMetadata(game.id, rawgId, rename), {
    success: (item) => `Info for ${item.name} loaded from RAWG`,
    onSuccess: onClose,
  });
  return (
    <Modal opened onClose={onClose} title="Find game info (RAWG)" size="lg">
      <Stack>
        {status.data && !status.data.rawg ? (
          <RawgNotConfigured />
        ) : (
          <>
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              leftSection={<IconSearch size={16} />}
              rightSection={results.isFetching ? <Loader size="xs" /> : null}
              data-autofocus
            />
            <Checkbox label="Also use RAWG's name for this game" checked={rename} onChange={(e) => setRename(e.currentTarget.checked)} />
            {results.isError && <Alert color="red">{results.error.message}</Alert>}
            <ScrollArea.Autosize mah={460}>
              <Stack gap={2}>
                {results.data?.map((c) => (
                  <CandidateRow key={c.rawg_id} candidate={c} onPick={() => apply.mutate(c.rawg_id)} disabled={apply.isPending} />
                ))}
                {results.data?.length === 0 && (
                  <Text c="dimmed" size="sm">
                    Nothing found. Try another spelling or a shorter name.
                  </Text>
                )}
              </Stack>
            </ScrollArea.Autosize>
            <RawgAttribution />
          </>
        )}
      </Stack>
    </Modal>
  );
}

/** One game to review: the candidates found for its name, or a search with a name you edit. */
function ReviewStep({
  item,
  left,
  onPick,
  picking,
  onSkip,
}: {
  item: ReviewItem;
  left: number;
  onPick: (rawgId: number, rename: boolean) => void;
  picking: boolean;
  onSkip: () => void;
}) {
  const [query, setQuery] = useState(item.name);
  const [debounced] = useDebouncedValue(query, 350);
  const [rename, setRename] = useState(false);
  const edited = debounced.trim() !== item.name.trim();
  const search = useRawgSearch(debounced, edited);
  const candidates = edited ? (search.data ?? []) : item.candidates;
  const searching = edited && (search.isFetching || debounced !== query);
  return (
    <Stack gap="xs">
      <Text fw={600}>
        Which game is “{item.name}”? <Text span c="dimmed" size="sm">({left} to review)</Text>
      </Text>
      {item.note && (
        <Text size="sm" c="orange">
          {item.note}
        </Text>
      )}
      <TextInput
        aria-label="Search RAWG"
        description="Not the right games? Change the name to search again."
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        leftSection={<IconSearch size={16} />}
        rightSection={searching ? <Loader size="xs" /> : null}
      />
      <Checkbox label="Also use RAWG's name for this game" checked={rename} onChange={(e) => setRename(e.currentTarget.checked)} />
      {search.isError && edited && <Alert color="red">{search.error.message}</Alert>}
      <ScrollArea.Autosize mah={360}>
        <Stack gap={2}>
          {candidates.map((c) => (
            <CandidateRow key={c.rawg_id} candidate={c} disabled={picking} onPick={() => onPick(c.rawg_id, rename)} />
          ))}
          {candidates.length === 0 && !searching && (
            <Text c="dimmed" size="sm">
              Nothing found on RAWG. Try another spelling or a shorter name, or skip the game.
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>
      <Group>
        <Button variant="default" onClick={onSkip}>
          Skip
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * Bulk matching for games without info: runs in small batches, applies confident matches automatically and asks
 * about the rest one by one.
 */
export function FetchMissingModal({ categoryId, onClose }: { categoryId?: number; onClose: () => void }) {
  const client = useQueryClient();
  const status = useMetadataStatus();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [applied, setApplied] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const skipped = useRef<number[]>([]);
  const run = async () => {
    setRunning(true);
    setError(null);
    const skip = skipped.current; // kept between runs: "Continue" after an error goes on where it stopped
    try {
      for (;;) {
        const result = await unwrap(
          api.POST("/api/v1/metadata/fetch-missing", { body: { category_id: categoryId ?? null, limit: 8, skip } }),
        );
        skip.push(...result.review.map((r) => r.item_id));
        setApplied((n) => n + result.applied.length);
        setProcessed((n) => n + result.applied.length + result.review.length);
        setReview((r) => [...r, ...result.review]);
        setRemaining(result.remaining);
        if (result.remaining === 0) break;
      }
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      await client.invalidateQueries();
    }
  };

  const pick = useApiMutation(
    ({ itemId, rawgId, rename }: { itemId: number; rawgId: number; rename: boolean }) => applyMetadata(itemId, rawgId, rename),
    { onSuccess: () => setReview((r) => r.slice(1)) },
  );
  const current = review[0];
  const total = remaining === null ? null : processed + remaining;

  return (
    <Modal opened onClose={onClose} title="Fetch missing game info (RAWG)" size="lg">
      <Stack>
        {status.data && !status.data.rawg ? (
          <RawgNotConfigured />
        ) : (
          <>
            <Text size="sm">
              Looks up every game without info on RAWG. Clear matches are applied automatically; for the others you pick
              the right game (or skip it).
            </Text>
            {!running && !done && (
              <Group>
                <Button onClick={run}>{error ? "Continue" : "Start"}</Button>
              </Group>
            )}
            {(running || done) && (
              <Stack gap={4}>
                <Progress value={total ? (processed / total) * 100 : 0} animated={running} />
                <Text size="sm">
                  {processed}
                  {total !== null && ` / ${total}`} checked · {applied} matched automatically
                  {done && ` · ${review.length} left to review`}
                </Text>
              </Stack>
            )}
            {error && <Alert color="red">{error}</Alert>}
            {current && (
              <ReviewStep
                key={current.item_id}
                item={current}
                left={review.length}
                picking={pick.isPending}
                onPick={(rawgId, rename) => pick.mutate({ itemId: current.item_id, rawgId, rename })}
                onSkip={() => setReview((r) => r.slice(1))}
              />
            )}
            {done && !current && (
              <Alert color="green">
                Done. {applied} games matched automatically. Games you skipped can be matched on their own page (“Find
                info”).
              </Alert>
            )}
            <RawgAttribution />
          </>
        )}
      </Stack>
    </Modal>
  );
}
