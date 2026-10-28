import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, unwrap } from "./client";
import type { paths } from "./schema";

type ItemsQuery = NonNullable<paths["/api/v1/items"]["get"]["parameters"]["query"]>;
type JournalQuery = NonNullable<paths["/api/v1/journal"]["get"]["parameters"]["query"]>;
type TopQuery = NonNullable<paths["/api/v1/stats/top"]["get"]["parameters"]["query"]>;

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => unwrap(api.GET("/api/v1/settings")) });

export const useCategories = () =>
  useQuery({ queryKey: ["categories"], queryFn: () => unwrap(api.GET("/api/v1/categories")) });

export const useItems = (query: ItemsQuery = {}, enabled = true) =>
  useQuery({
    queryKey: ["items", query],
    queryFn: () => unwrap(api.GET("/api/v1/items", { params: { query } })),
    enabled,
  });

export const useItem = (id: number) =>
  useQuery({
    queryKey: ["item", id],
    queryFn: () => unwrap(api.GET("/api/v1/items/{item_id}", { params: { path: { item_id: id } } })),
  });

export const useHardware = () =>
  useQuery({ queryKey: ["hardware"], queryFn: () => unwrap(api.GET("/api/v1/hardware")) });

export const useStores = () =>
  useQuery({ queryKey: ["stores"], queryFn: () => unwrap(api.GET("/api/v1/stores")) });

export const useNowPlaying = () =>
  useQuery({ queryKey: ["now-playing"], queryFn: () => unwrap(api.GET("/api/v1/now-playing")) });

export const useJournal = (query: JournalQuery) =>
  useQuery({
    queryKey: ["journal", query],
    queryFn: () => unwrap(api.GET("/api/v1/journal", { params: { query } })),
  });

export const useSummary = (category?: number) =>
  useQuery({
    queryKey: ["stats", "summary", category],
    queryFn: () => unwrap(api.GET("/api/v1/stats/summary", { params: { query: { category } } })),
  });

export const useCategoryTotals = () =>
  useQuery({
    queryKey: ["stats", "categories"],
    queryFn: () => unwrap(api.GET("/api/v1/stats/categories")),
  });

export const useYearly = (category?: number) =>
  useQuery({
    queryKey: ["stats", "yearly", category],
    queryFn: () => unwrap(api.GET("/api/v1/stats/yearly", { params: { query: { category } } })),
  });

export const useTop = (query: TopQuery) =>
  useQuery({
    queryKey: ["stats", "top", query],
    queryFn: () => unwrap(api.GET("/api/v1/stats/top", { params: { query } })),
  });

export const usePcBuilds = () =>
  useQuery({ queryKey: ["pc", "builds"], queryFn: () => unwrap(api.GET("/api/v1/pc/builds")) });

export const usePcPurchases = () =>
  useQuery({ queryKey: ["pc", "purchases"], queryFn: () => unwrap(api.GET("/api/v1/pc/purchases")) });

export const usePcSale = (saleId: number) =>
  useQuery({
    queryKey: ["pc", "sales", saleId],
    queryFn: () => unwrap(api.GET("/api/v1/pc/sales/{sale_id}", { params: { path: { sale_id: saleId } } })),
  });

export const usePcParts = () => useQuery({ queryKey: ["pc", "parts"], queryFn: () => unwrap(api.GET("/api/v1/pc/parts")) });

export const useBundles = () =>
  useQuery({ queryKey: ["bundles"], queryFn: () => unwrap(api.GET("/api/v1/bundles")) });

export const useHardwareStats = () =>
  useQuery({ queryKey: ["stats", "hardware"], queryFn: () => unwrap(api.GET("/api/v1/stats/hardware")) });

export const useStoreStats = (category?: number) =>
  useQuery({
    queryKey: ["stats", "stores", category],
    queryFn: () => unwrap(api.GET("/api/v1/stats/stores", { params: { query: { category } } })),
  });

export const useFormatStats = (category?: number) =>
  useQuery({
    queryKey: ["stats", "format", category],
    queryFn: () => unwrap(api.GET("/api/v1/stats/format", { params: { query: { category } } })),
  });

export const useResaleStats = (category?: number) =>
  useQuery({
    queryKey: ["stats", "resale", category],
    queryFn: () => unwrap(api.GET("/api/v1/stats/resale", { params: { query: { category } } })),
  });

export const useRatingStats = (category?: number) =>
  useQuery({
    queryKey: ["stats", "ratings", category],
    queryFn: () => unwrap(api.GET("/api/v1/stats/ratings", { params: { query: { category } } })),
  });

export const useDlcStats = (category?: number) =>
  useQuery({
    queryKey: ["stats", "dlc", category],
    queryFn: () => unwrap(api.GET("/api/v1/stats/dlc", { params: { query: { category } } })),
  });

export const useMetadataStatus = () =>
  useQuery({
    queryKey: ["metadata-status"],
    queryFn: () => unwrap(api.GET("/api/v1/metadata/status")),
    staleTime: 5 * 60_000,
  });

export const useRawgSearch = (q: string, enabled = true) =>
  useQuery({
    queryKey: ["rawg-search", q],
    queryFn: () => unwrap(api.GET("/api/v1/metadata/search", { params: { query: { q } } })),
    enabled: enabled && q.trim().length >= 2,
    staleTime: 60 * 60_000,
    retry: false,
  });

export const useDlcSuggestions = (itemId: number, enabled = true) =>
  useQuery({
    queryKey: ["dlc-suggestions", itemId],
    queryFn: () =>
      unwrap(api.GET("/api/v1/items/{item_id}/dlc/available", { params: { path: { item_id: itemId } } })),
    enabled,
    staleTime: 60 * 60_000,
    retry: false,
  });

/**
 * Mutation that refreshes all cached data afterwards (every change can affect totals, stats, journal, …;
 * the dataset is small, so refetching is cheap) and shows errors as notifications.
 */
export function useApiMutation<TVariables, TResult>(
  fn: (variables: TVariables) => Promise<TResult>,
  options: { success?: string | ((result: TResult) => string); onSuccess?: (result: TResult) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await client.invalidateQueries();
      const message = typeof options.success === "function" ? options.success(result) : options.success;
      if (message) notifications.show({ message, color: "green" });
      options.onSuccess?.(result);
    },
    onError: (error: Error) => {
      notifications.show({ title: "Not saved", message: error.message, color: "red", autoClose: 8000 });
    },
  });
}

/** A result loaded on demand, e.g. an import preview: run(task) keeps the last result if the task fails. */
export function usePreviewRequest<T>() {
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async (task: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await task());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return { result, setResult, error, loading, run };
}
