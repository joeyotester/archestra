import { archestraApiSdk } from "@shared";
import { useQuery } from "@tanstack/react-query";

export function useHostReachability(host: string) {
  return useQuery({
    queryKey: ["reachability", host],
    queryFn: async () => {
      const response = await archestraApiSdk.checkHostReachability({
        query: { host },
      });
      return response.data?.reachable ?? false;
    },
    enabled: !!host,
  });
}
