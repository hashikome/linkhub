import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { environment, migrationState, promote, type Release, validateRelease } from "./release";

const release: Release = {
  revision: "a".repeat(40),
  attempt: "123-2",
  apiImage: `ghcr.io/hashikome/ntumie/api:${"a".repeat(40)}@sha256:${"b".repeat(64)}`,
  webImage: `ghcr.io/hashikome/ntumie/web:${"a".repeat(40)}@sha256:${"c".repeat(64)}`,
  application: "application",
  migration: "migration",
  registry: "registry",
};
const inputs = readFileSync(
  new URL("../deploy/production.env.example", import.meta.url),
  "utf8",
).replace(/SET_[A-Z_]+/g, "fixture");
const target = (migration: boolean) => ({
  composeId: migration ? release.migration : release.application,
  appName: migration ? "ntumie-migrate-fixture" : "ntumie-app-fixture",
  composeType: "stack",
  sourceType: "raw",
  autoDeploy: false,
  serverId: null,
  env: inputs,
});
const migration = () => ({
  Config: {
    Image: release.apiImage,
    Env: [`RELEASE_ATTEMPT=${release.attempt}`],
    Cmd: ["--tsconfig-override", "tsconfig.runtime.json", "dist/src/operations/migrate-release.js"],
    Labels: {
      "com.docker.swarm.service.name": "ntumie-migrate-fixture_migrate",
      "com.docker.swarm.task.id": "task",
    },
  },
  State: { Status: "exited", ExitCode: 0, OOMKilled: false },
});

test("rejects mutable, foreign, mismatched-revision and reused targets before promotion", () => {
  for (const apiImage of [
    "latest",
    release.apiImage.replace("hashikome/ntumie", "other/product"),
    release.apiImage.replace("a".repeat(40), "d".repeat(40)),
  ])
    expect(() => validateRelease({ ...release, apiImage })).toThrow();
  expect(() => validateRelease({ ...release, migration: release.application })).toThrow();
  expect(() => validateRelease(release)).not.toThrow();
});

test("refuses unresolved, duplicate and secret-bearing environment keys", () => {
  expect(() => environment(`${inputs}\nDATABASE_URL=postgresql://private\n`, release)).toThrow();
  expect(() => environment(`${inputs}\nSUPPORT_EMAIL=duplicate\n`, release)).toThrow();
  expect(() =>
    environment(inputs.replace("BACKEND_NETWORK=fixture", "BACKEND_NETWORK=SET_NETWORK"), release),
  ).toThrow();
  expect(environment(inputs, release)).toContain(
    "EMAIL_FROM_ADDRESS=ntumie. <no-reply@notify.ntumie.link>",
  );
});

test("only the exact attempt and entrypoint at exit zero proves migration acceptance", () => {
  expect(migrationState(migration(), target(true).appName, release)).toBe("complete");
  const stale = migration();
  stale.Config.Env = ["RELEASE_ATTEMPT=123-1"];
  expect(migrationState(stale, target(true).appName, release)).toBe("stale");
  const running = migration();
  running.State.Status = "running";
  expect(migrationState(running, target(true).appName, release)).toBe("pending");
  const failed = migration();
  failed.State.ExitCode = 1;
  expect(() => migrationState(failed, target(true).appName, release)).toThrow();
  const bypass = migration();
  bypass.Config.Cmd = ["-e", "process.exit(0)"];
  expect(() => migrationState(bypass, target(true).appName, release)).toThrow();
});

function harness(outcome: "complete" | "failed" | "stale" | "pending") {
  const calls: string[] = [];
  const titles = new Map<string, string>();
  const api = async (
    operation: string,
    payload?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<unknown> => {
    calls.push(`${operation}:${payload?.composeId ?? query?.composeId ?? ""}`);
    if (operation === "compose.one") return target(query?.composeId === release.migration);
    if (operation === "compose.deploy") {
      titles.set(payload?.composeId as string, payload?.title as string);
      return {};
    }
    if (operation === "deployment.allByCompose")
      return [{ title: titles.get(query?.composeId ?? ""), status: "done" }];
    if (operation === "docker.getContainersByAppNameMatch") {
      if (query?.appName === target(true).appName) {
        expect(query.appType).toBeUndefined(); // Include completed containers.
        return [{ containerId: "a".repeat(12), state: "exited" }];
      }
      return ["b", "c", "d"].map((id) => ({ containerId: id.repeat(12), state: "running" }));
    }
    if (operation === "docker.getConfig") {
      if (query?.containerId === "a".repeat(12)) {
        const container = migration();
        if (outcome === "failed") container.State.ExitCode = 1;
        if (outcome === "stale") container.Config.Env = ["RELEASE_ATTEMPT=123-1"];
        if (outcome === "pending") container.State.Status = "running";
        return container;
      }
      const service = { b: "api", c: "web", d: "email_worker" }[query?.containerId[0] ?? ""];
      return {
        Config: {
          Image: service === "web" ? release.webImage : release.apiImage,
          Env: [`RELEASE_ATTEMPT=${release.attempt}`],
          Labels: { "com.docker.swarm.service.name": `${target(false).appName}_${service}` },
        },
        State: { Status: "running", Health: { Status: "healthy" } },
      };
    }
    return {};
  };
  return { api, calls };
}

test("migration failure, stale success or timeout never mutates the application", async () => {
  for (const outcome of ["failed", "stale", "pending"] as const) {
    const { api, calls } = harness(outcome);
    await expect(promote(api, release, async () => {}, 1)).rejects.toThrow();
    expect(calls).not.toContain("compose.update:application");
    expect(calls).not.toContain("compose.deploy:application");
  }
});

test("successful migration precedes application mutation and exact-image convergence", async () => {
  const { api, calls } = harness("complete");
  await promote(api, release, async () => {}, 1);
  expect(calls.indexOf("compose.deploy:migration")).toBeLessThan(
    calls.indexOf("compose.update:application"),
  );
  expect(calls.filter((call) => call.startsWith("compose.deploy:"))).toEqual([
    "compose.deploy:migration",
    "compose.deploy:application",
  ]);
});

test("Docker resolves the exact external names, images and sender before Dokploy promotion", () => {
  for (const migration of [false, true]) {
    const values = Object.fromEntries(
      environment(inputs, release, migration)
        .trim()
        .split("\n")
        .map((line) => {
          const split = line.indexOf("=");
          return [line.slice(0, split), line.slice(split + 1)];
        }),
    );
    const path = new URL(
      migration ? "../docker-stack.migrate.yml" : "../docker-stack.prod.yml",
      import.meta.url,
    ).pathname;
    const result = spawnSync("docker", ["stack", "config", "-c", path], {
      encoding: "utf8",
      env: { ...process.env, ...values },
    });
    expect(result.status).toBe(0);
    const rendered = Bun.YAML.parse(result.stdout) as {
      services: Record<string, { image: string; environment: Record<string, string> }>;
      networks: Record<string, { name: string }>;
      secrets: Record<string, { name: string }>;
    };
    expect(rendered.networks.backend.name).toBe(values.BACKEND_NETWORK);
    expect(rendered.services[migration ? "migrate" : "api"].image).toBe(release.apiImage);
    expect(rendered.secrets.database_url.name).toBe(
      values[migration ? "MIGRATION_DATABASE_URL_SECRET" : "DATABASE_URL_SECRET"],
    );
    if (!migration) {
      expect(rendered.networks.ingress.name).toBe(values.INGRESS_NETWORK);
      expect(rendered.services.web.image).toBe(release.webImage);
      expect(rendered.services.email_worker.environment.EMAIL_FROM_ADDRESS).toBe(
        values.EMAIL_FROM_ADDRESS,
      );
    }
  }
});
