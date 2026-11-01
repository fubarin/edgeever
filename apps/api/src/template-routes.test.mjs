import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { listMemoTemplateGallery } from "@edgeever/shared/memo-template-gallery";
import {
  DEFAULT_MEMO_TEMPLATE_SEEDS,
  defaultMemoTemplateId,
} from "@edgeever/shared/memo-template-seeds";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";
import { mapMemoTemplateRow, registerTemplateRoutes } from "./template-routes.ts";

const row = {
  id: "template_1",
  name: "Weekly review",
  description: "Review template",
  title: "Week 1",
  content_json: '{"type":"doc","content":[{"type":"paragraph"}]}',
  content_markdown: "# Week 1",
  tags_json: '["review","weekly"]',
  created_at: "2026-08-08T00:00:00.000Z",
  updated_at: "2026-08-08T01:00:00.000Z",
};

describe("template route mapping", () => {
  test("maps storage rows into the public template contract", () => {
    expect(mapMemoTemplateRow(row)).toEqual({
      id: "template_1",
      name: "Weekly review",
      description: "Review template",
      title: "Week 1",
      contentJson: { type: "doc", content: [{ type: "paragraph" }] },
      contentMarkdown: "# Week 1",
      tags: ["review", "weekly"],
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T01:00:00.000Z",
    });
  });

  test("fails closed to an empty document for damaged stored JSON", () => {
    expect(mapMemoTemplateRow({ ...row, content_json: "damaged" }).contentJson).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});

describe("template gallery route", () => {
  test("lists the gallery in the requested language without touching storage", async () => {
    const app = new Hono();
    registerTemplateRoutes(app, { createMemoRecord: async () => null, getMemoDetail: async () => null });

    const response = await app.request("/api/v1/templates/gallery?locale=pl-PL", {}, {});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.templates).toEqual(listMemoTemplateGallery("pl"));
  });
});

describe("template listing language", () => {
  const auth = {
    kind: "user",
    actorType: "user",
    actorId: "usr_1",
    username: "admin",
    displayName: null,
    scopes: [],
    workspaceId: "ws_1",
    role: "owner",
  };

  const createEnvironment = () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE memo_templates (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        title TEXT,
        content_json TEXT NOT NULL,
        content_markdown TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const [quickNote] = DEFAULT_MEMO_TEMPLATE_SEEDS;
    const seeded = quickNote.translations["zh-CN"];
    sqlite.query("INSERT INTO memo_templates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      defaultMemoTemplateId("ws_1", quickNote.key),
      "ws_1",
      seeded.title,
      seeded.description,
      seeded.title,
      '{"type":"doc","content":[]}',
      seeded.contentMarkdown,
      JSON.stringify(["template", quickNote.tag]),
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
    sqlite.query("INSERT INTO memo_templates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "template_custom",
      "ws_1",
      "Minha ata",
      "Modelo do usuário",
      "Minha ata",
      '{"type":"doc","content":[]}',
      "# Minha ata",
      '["ata"]',
      "2026-01-02T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
    );
    return { storage: { db: createSelfHostedStorageAdapter(sqlite, "/tmp/edgeever-template-routes-unused").db } };
  };

  const listTemplates = async (headers = {}) => {
    const app = new Hono();
    app.use("/api/v1/*", async (context, next) => {
      context.set("auth", auth);
      await next();
    });
    registerTemplateRoutes(app, { createMemoRecord: async () => null, getMemoDetail: async () => null });
    const response = await app.request("/api/v1/templates", { headers }, createEnvironment());
    expect(response.status).toBe(200);
    return (await response.json()).templates;
  };

  test("shows an untouched default template in the requested language", async () => {
    const [custom, quickNote] = await listTemplates({ "Accept-Language": "pl-PL,pl;q=0.9" });
    expect(quickNote.name).toBe("Szybka notatka");
    expect(custom.name).toBe("Minha ata");
  });

  test("defaults to English when the request carries no locale", async () => {
    const [custom, quickNote] = await listTemplates();
    expect(quickNote.name).toBe("Quick Spark");
    expect(custom.name).toBe("Minha ata");
  });
});
