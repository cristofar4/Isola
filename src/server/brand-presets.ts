import "server-only";

import { MAX_PRESETS, type BrandPreset, type BrandPresetInput } from "@/lib/brand-presets";
import { getAuth } from "./auth";

interface PresetRow {
  id: string;
  userId: string;
  name: string;
  data: string;
  isDefault: boolean | number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export class PresetError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

async function db() {
  return (await (await getAuth()).$context).adapter;
}

function toPreset(row: PresetRow): BrandPreset | null {
  try {
    const data = JSON.parse(row.data) as Pick<BrandPresetInput, "colors" | "layout">;
    return {
      id: row.id,
      name: row.name,
      colors: data.colors,
      layout: data.layout,
      isDefault: Boolean(row.isDefault),
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  } catch {
    return null; // A row that can't be read is skipped rather than breaking the list.
  }
}

async function rows(userId: string) {
  return (await db()).findMany<PresetRow>({ model: "brandPreset", where: [{ field: "userId", value: userId }], sortBy: { field: "createdAt", direction: "asc" } });
}

/** The account's presets, the default first. */
export async function listPresets(userId: string): Promise<BrandPreset[]> {
  const list = (await rows(userId)).map(toPreset).filter((p): p is BrandPreset => p !== null);
  return list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

async function clearDefault(userId: string, except: string) {
  const adapter = await db();
  for (const row of await rows(userId)) {
    if (row.id !== except && row.isDefault) {
      await adapter.update({ model: "brandPreset", where: [{ field: "id", value: row.id }], update: { isDefault: false } });
    }
  }
}

export async function createPreset(userId: string, input: BrandPresetInput): Promise<BrandPreset> {
  const adapter = await db();
  const existing = await rows(userId);
  if (existing.length >= MAX_PRESETS) throw new PresetError(`An account can have up to ${MAX_PRESETS} presets. Delete one you no longer use.`, 409, "too_many_presets");
  const now = new Date();
  // The first preset is the default; later ones only when asked.
  const isDefault = existing.length === 0 || input.isDefault === true;
  const row = await adapter.create<Omit<PresetRow, "id">, PresetRow>({
    model: "brandPreset",
    data: { userId, name: input.name, data: JSON.stringify({ colors: input.colors, layout: input.layout }), isDefault, createdAt: now, updatedAt: now },
  });
  if (isDefault) await clearDefault(userId, row.id);
  return toPreset(row)!;
}

async function owned(userId: string, id: string) {
  const row = await (await db()).findOne<PresetRow>({ model: "brandPreset", where: [{ field: "id", value: id }] });
  return row && row.userId === userId ? row : null;
}

export async function updatePreset(userId: string, id: string, input: BrandPresetInput): Promise<BrandPreset | null> {
  const row = await owned(userId, id);
  if (!row) return null;
  const isDefault = input.isDefault === true || Boolean(row.isDefault);
  const updated = await (await db()).update<PresetRow>({
    model: "brandPreset",
    where: [{ field: "id", value: id }],
    update: { name: input.name, data: JSON.stringify({ colors: input.colors, layout: input.layout }), isDefault, updatedAt: new Date() },
  });
  if (input.isDefault === true) await clearDefault(userId, id);
  return updated ? toPreset(updated) : null;
}

export async function deletePreset(userId: string, id: string): Promise<boolean> {
  const row = await owned(userId, id);
  if (!row) return false;
  const adapter = await db();
  await adapter.delete({ model: "brandPreset", where: [{ field: "id", value: id }] });
  if (row.isDefault) {
    // Keep a default while any preset is left: the most recently created one.
    const rest = await rows(userId);
    const next = rest[rest.length - 1];
    if (next) await adapter.update({ model: "brandPreset", where: [{ field: "id", value: next.id }], update: { isDefault: true } });
  }
  return true;
}

export async function deleteAllPresets(userId: string): Promise<void> {
  await (await db()).deleteMany({ model: "brandPreset", where: [{ field: "userId", value: userId }] });
}
