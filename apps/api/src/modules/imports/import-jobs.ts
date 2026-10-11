import { PrismaService } from "../../database/prisma.service";
import { CollectionsService } from "../collections/collections.service";
import { CollectionPolicyService } from "../hubs/collection-policy.service";
import { HubsService } from "../hubs/hubs.service";
import { ResourcesService } from "../resources/resources.service";
import { ImportsService } from "./imports.service";

// The worker uses the same domain services and authority transaction as HTTP
// commands. Durable folder jobs survive worker restarts; each tick commits at
// most one bounded batch, atomically with its receipts and continuation state.
export function importJobService(prisma: PrismaService) {
  const policy = new CollectionPolicyService(prisma);
  return new ImportsService(
    prisma,
    policy,
    new CollectionsService(prisma, new HubsService(prisma), policy),
    new ResourcesService(prisma, policy),
  );
}
