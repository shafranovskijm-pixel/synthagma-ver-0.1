import { useQuery } from "@tanstack/react-query";
import { fetchPostpaidAccessProfile } from "@/lib/postpaidAccess";

export function usePostpaidAccessProfile(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: ["postpaid-access", organizationId],
    enabled: !!organizationId,
    queryFn: () => fetchPostpaidAccessProfile(organizationId!),
    staleTime: 30_000,
    retry: 1,
  });
}
