import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

export function useHealthQuery() {
  return useQuery({
    queryFn: apiClient.getHealth,
    queryKey: ["system", "health"],
    refetchInterval: 30_000,
  });
}
