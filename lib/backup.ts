import type { SupabaseClient } from "@supabase/supabase-js";

const BACKUP_FORMAT = "our-atlas-private-backup";
const BACKUP_VERSION = 1;
const MAX_IMPORT_BYTES = 1024 * 1024 * 1024;

type BackupObject = {
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  base64: string;
};

type BackupRecords = {
  couple: Record<string, unknown>[];
  members: Record<string, unknown>[];
  settings: Record<string, unknown>[];
  trips: Record<string, unknown>[];
  places: Record<string, unknown>[];
  tripPlaces: Record<string, unknown>[];
  visits: Record<string, unknown>[];
  memories: Record<string, unknown>[];
  media: Record<string, unknown>[];
  firsts?: Record<string, unknown>[];
  letters?: Record<string, unknown>[];
  checkins?: Record<string, unknown>[];
};

export type AtlasBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  coupleId: string;
  exportedAt: string;
  records: BackupRecords;
  objects: BackupObject[];
};

export type BackupSummary = {
  exportedAt: string;
  trips: number;
  places: number;
  visits: number;
  memories: number;
  media: number;
  sharedArchive: number;
  totalBytes: number;
};

type Progress = (message: string) => void;

async function selectRows(client: SupabaseClient, table: string, coupleId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await client.from(table).select("*").eq(table === "couples" ? "id" : "couple_id", coupleId);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []) as Record<string, unknown>[];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const source = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", source.buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createBackup(
  client: SupabaseClient,
  coupleId: string,
  onProgress: Progress = () => undefined,
): Promise<AtlasBackup> {
  onProgress("正在读取情侣空间记录…");
  const [couple, members, settings, trips, places, visits, memories, media, firsts, letters, checkins] = await Promise.all([
    selectRows(client, "couples", coupleId),
    selectRows(client, "couple_members", coupleId),
    selectRows(client, "couple_settings", coupleId),
    selectRows(client, "trips", coupleId),
    selectRows(client, "places", coupleId),
    selectRows(client, "visits", coupleId),
    selectRows(client, "memories", coupleId),
    selectRows(client, "media", coupleId),
    selectRows(client, "couple_firsts", coupleId),
    selectRows(client, "couple_letters", coupleId),
    selectRows(client, "couple_checkins", coupleId),
  ]);
  const tripIds = trips.map((trip) => String(trip.id));
  let tripPlaces: Record<string, unknown>[] = [];
  if (tripIds.length > 0) {
    const { data, error } = await client.from("trip_places").select("*").in("trip_id", tripIds);
    if (error) throw error;
    tripPlaces = (data ?? []) as Record<string, unknown>[];
  }

  const objects: BackupObject[] = [];
  for (let index = 0; index < media.length; index += 1) {
    const row = media[index];
    const bucket = String(row.bucket ?? "travel-media");
    const objectKey = String(row.object_key);
    onProgress(`正在下载私有媒体 ${index + 1}/${media.length}…`);
    const { data, error } = await client.storage.from(bucket).download(objectKey);
    if (error) throw new Error(`BACKUP_MEDIA_DOWNLOAD_FAILED:${objectKey}:${error.message}`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    objects.push({
      objectKey,
      mimeType: String(row.mime_type),
      sizeBytes: bytes.byteLength,
      sha256: await sha256(bytes),
      base64: bytesToBase64(bytes),
    });
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    coupleId,
    exportedAt: new Date().toISOString(),
    records: { couple, members, settings, trips, places, tripPlaces, visits, memories, media, firsts, letters, checkins },
    objects,
  };
}

export function downloadBackup(backup: AtlasBackup): void {
  const date = backup.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `我们的地图-${date}.atlas-backup.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readAndValidateBackup(file: File, coupleId: string, onProgress: Progress = () => undefined): Promise<{ backup: AtlasBackup; summary: BackupSummary }> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("BACKUP_TOO_LARGE");
  onProgress("正在读取备份文件…");
  const parsed = JSON.parse(await file.text()) as Partial<AtlasBackup>;
  if (parsed.format !== BACKUP_FORMAT || parsed.version !== BACKUP_VERSION) throw new Error("BACKUP_FORMAT_INVALID");
  if (parsed.coupleId !== coupleId) throw new Error("BACKUP_COUPLE_MISMATCH");
  if (!parsed.records || !Array.isArray(parsed.objects)) throw new Error("BACKUP_FORMAT_INVALID");

  let totalBytes = 0;
  for (let index = 0; index < parsed.objects.length; index += 1) {
    const object = parsed.objects[index];
    onProgress(`正在校验媒体 ${index + 1}/${parsed.objects.length}…`);
    const bytes = base64ToBytes(object.base64);
    if (bytes.byteLength !== object.sizeBytes || await sha256(bytes) !== object.sha256) {
      throw new Error(`BACKUP_CHECKSUM_FAILED:${object.objectKey}`);
    }
    totalBytes += bytes.byteLength;
  }

  const backup = parsed as AtlasBackup;
  return {
    backup,
    summary: {
      exportedAt: backup.exportedAt,
      trips: backup.records.trips.length,
      places: backup.records.places.length,
      visits: backup.records.visits.length,
      memories: backup.records.memories.length,
      media: backup.records.media.length,
      sharedArchive: (backup.records.firsts?.length ?? 0) + (backup.records.letters?.length ?? 0) + (backup.records.checkins?.length ?? 0),
      totalBytes,
    },
  };
}

async function restoreRows(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) throw error;
}

export async function restoreBackup(
  client: SupabaseClient,
  backup: AtlasBackup,
  onProgress: Progress = () => undefined,
): Promise<void> {
  for (let index = 0; index < backup.objects.length; index += 1) {
    const object = backup.objects[index];
    onProgress(`正在恢复私有媒体 ${index + 1}/${backup.objects.length}…`);
    const { error } = await client.storage.from("travel-media").upload(
      object.objectKey,
      base64ToBytes(object.base64),
      { contentType: object.mimeType, upsert: true },
    );
    if (error) throw error;
  }

  const records = backup.records;
  onProgress("正在安全恢复缺失记录…");
  await restoreRows(client, "couple_settings", records.settings, "couple_id");
  await restoreRows(client, "trips", records.trips, "id");
  await restoreRows(client, "places", records.places, "id");
  await restoreRows(client, "trip_places", records.tripPlaces, "trip_id,place_id");
  await restoreRows(client, "visits", records.visits, "id");
  await restoreRows(client, "memories", records.memories, "id");
  await restoreRows(client, "media", records.media, "id");
  await restoreRows(client, "couple_firsts", records.firsts ?? [], "id");
  await restoreRows(client, "couple_letters", records.letters ?? [], "id");
  await restoreRows(client, "couple_checkins", records.checkins ?? [], "id");
}
