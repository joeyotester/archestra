import { promises as dns } from "node:dns";
import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const reachabilityRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/api/reachability-check",
    {
      schema: {
        operationId: RouteId.CheckHostReachability,
        description:
          "Check if a hostname resolves to a public (internet-reachable) IP address",
        tags: ["Features"],
        querystring: z.object({
          host: z.string().min(1),
        }),
        response: {
          200: z.object({
            reachable: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { host } = request.query;
      const reachable = await isPublicHost(host);
      return reply.send({ reachable });
    },
  );
};

export default reachabilityRoutes;

async function isPublicHost(host: string): Promise<boolean> {
  try {
    const addresses = await dns.resolve4(host);
    return addresses.some((ip) => !isPrivateIp(ip));
  } catch {
    return false;
  }
}

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  // Loopback
  if (a === 127) return true;
  // Private ranges
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Link-local
  if (a === 169 && b === 254) return true;
  return false;
}
