import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MEDIA_POLICY, extensionForType, mediaKindForType, resolveMediaType, validateMediaFiles, type MediaPolicy } from "./media-policy";
import type { MediaAsset, Memory, Place, Trip } from "./types";

type Client = SupabaseClient;

export async function loadFirstTrip(client: Client, userId: string): Promise<{ coupleId: string; trip: Trip | null } | null> {
  const { data: membership, error: membershipError } = await client.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return null;
  const { data: tripRow, error: tripError } = await client.from("trips").select("*").eq("couple_id", membership.couple_id).order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (tripError) throw tripError;
  if (!tripRow) return { coupleId: membership.couple_id, trip: null };
  const { data: links, error: linksError } = await client.from("trip_places").select("position, places(*)").eq("trip_id", tripRow.id).order("position");
  if (linksError) throw linksError;
  const { data: memoryRows, error: memoryError } = await client.from("memories").select("*").eq("trip_id", tripRow.id).order("occurred_on", { ascending: false });
  if (memoryError) throw memoryError;
  const ids = (memoryRows ?? []).map((memory) => memory.id);
  const { data: mediaRows, error: mediaError } = ids.length ? await client.from("media").select("*").in("memory_id", ids) : { data: [], error: null };
  if (mediaError) throw mediaError;
  const signedMedia = await Promise.all((mediaRows ?? []).map(async (media, index) => {
    if (!media.memory_id) return null;
    const { data } = await client.storage.from(media.bucket).createSignedUrl(media.object_key, 60 * 30);
    const kind = mediaKindForType(media.mime_type);
    if (!data?.signedUrl || !kind) return null;
    return {
      memoryId: media.memory_id as string,
      asset: {
        id: media.id as string,
        url: data.signedUrl,
        kind,
        mimeType: media.mime_type as string,
        sizeBytes: Number(media.size_bytes),
        position: Number(media.position ?? index + 1),
      } satisfies MediaAsset,
    };
  }));
  const mediaByMemory = new Map<string, MediaAsset[]>();
  for (const signed of signedMedia) {
    if (!signed) continue;
    const assets = mediaByMemory.get(signed.memoryId) ?? [];
    assets.push(signed.asset);
    mediaByMemory.set(signed.memoryId, assets);
  }
  for (const assets of mediaByMemory.values()) assets.sort((a, b) => a.position - b.position);
  const places: Place[] = (links ?? []).map((link) => {
    const place = link.places as unknown as Omit<Place, "position">;
    return { ...place, position: link.position };
  });
  const memories: Memory[] = (memoryRows ?? []).map((memory) => {
    const media = mediaByMemory.get(memory.id) ?? [];
    const firstMedia = media[0];
    return {
      id: memory.id,
      placeId: memory.place_id ?? undefined,
      visitId: memory.visit_id ?? undefined,
      title: memory.title,
      body: memory.body,
      occurredOn: memory.occurred_on,
      media,
      version: memory.version,
      photoUrl: firstMedia?.kind === "image" ? firstMedia.url : undefined,
      mediaUrl: firstMedia?.url,
      mediaKind: firstMedia?.kind,
    };
  });
  return { coupleId: membership.couple_id, trip: { id: tripRow.id, name: tripRow.name, startDate: tripRow.start_date, endDate: tripRow.end_date, summary: tripRow.summary, version: tripRow.version, places, memories } };
}

export async function createFirstTrip(client: Client, coupleId: string, userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await client.from("trips").insert({ couple_id: coupleId, name: "第一段旅行", summary: "从这里开始记录我们去过的地方。", start_date: today, end_date: today, created_by: userId, updated_by: userId });
  if (error) throw error;
}

export async function loadMediaPolicy(client: Client, coupleId: string): Promise<MediaPolicy> {
  const { data, error } = await client
    .from("couple_settings")
    .select("max_images_per_memory,max_videos_per_memory,max_image_bytes,max_video_bytes")
    .eq("couple_id", coupleId)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return DEFAULT_MEDIA_POLICY;
    throw error;
  }
  if (!data) return DEFAULT_MEDIA_POLICY;
  return {
    maxImages: Number(data.max_images_per_memory),
    maxVideos: Number(data.max_videos_per_memory),
    maxImageBytes: Number(data.max_image_bytes),
    maxVideoBytes: Number(data.max_video_bytes),
  };
}

type UpdateMemoryInput = {
  memoryId: string;
  userId: string;
  title: string;
  body: string;
  occurredOn: string;
  version: number;
};

export async function updateMemoryRecord(client: Client, input: UpdateMemoryInput): Promise<number> {
  const { data, error } = await client
    .from("memories")
    .update({
      title: input.title.trim(),
      body: input.body.trim(),
      occurred_on: input.occurredOn,
      updated_by: input.userId,
      version: input.version + 1,
    })
    .eq("id", input.memoryId)
    .eq("version", input.version)
    .select("version")
    .maybeSingle();

  if (error) {
    if (error.message.includes("STALE_VERSION")) throw new Error("STALE_VERSION");
    throw error;
  }
  if (!data) throw new Error("STALE_VERSION");
  return Number(data.version);
}

export async function deleteMemoryRecord(
  client: Client,
  input: { memoryId: string; version: number },
): Promise<void> {
  const { data: mediaRows, error: mediaReadError } = await client
    .from("media")
    .select("id,bucket,object_key")
    .eq("memory_id", input.memoryId);
  if (mediaReadError) throw mediaReadError;

  const { data: deleted, error: deleteError } = await client
    .from("memories")
    .delete()
    .eq("id", input.memoryId)
    .eq("version", input.version)
    .select("id")
    .maybeSingle();
  if (deleteError) throw deleteError;
  if (!deleted) throw new Error("STALE_VERSION");

  const media = mediaRows ?? [];
  if (media.length === 0) return;

  // The memory is already gone at this point. Cleanup failures should not make
  // the UI claim that deletion failed; they only leave recoverable orphan data.
  const ids = media.map((item) => item.id as string);
  const { error: mediaDeleteError } = await client.from("media").delete().in("id", ids);
  if (mediaDeleteError) console.warn("Deleted memory but could not remove its media rows.", mediaDeleteError);

  const byBucket = new Map<string, string[]>();
  for (const item of media) {
    const bucket = String(item.bucket || "travel-media");
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), String(item.object_key)]);
  }
  for (const [bucket, objectKeys] of byBucket) {
    const { error } = await client.storage.from(bucket).remove(objectKeys);
    if (error) console.warn("Deleted memory but could not remove its private media objects.", error);
  }
}

type SaveVisitMemoryInput = {
  coupleId: string;
  tripId: string;
  placeId?: string;
  userId: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  title: string;
  body: string;
  occurredOn: string;
  files: File[];
  mediaPolicy?: MediaPolicy;
};

type PreparedMedia = {
  id: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  position: number;
  file: File;
};

export async function saveVisitMemory(client: Client, input: SaveVisitMemoryInput): Promise<{ memoryId: string; placeId: string }> {
  validateMediaFiles(input.files, input.mediaPolicy);
  const memoryId = crypto.randomUUID();
  const uploadedKeys: string[] = [];
  const preparedMedia: PreparedMedia[] = input.files.map((file, index) => {
    const mimeType = resolveMediaType(file);
    if (!mimeType) throw new Error("UNSUPPORTED_MEDIA");
    const mediaId = crypto.randomUUID();
    return {
      id: mediaId,
      object_key: `couples/${input.coupleId}/media/${input.occurredOn.slice(0, 4)}/${memoryId}/${mediaId}.${extensionForType(mimeType)}`,
      mime_type: mimeType,
      size_bytes: file.size,
      position: index + 1,
      file,
    };
  });

  try {
    for (const media of preparedMedia) {
      const { error } = await client.storage.from("travel-media").upload(media.object_key, media.file, {
        contentType: media.mime_type,
        upsert: false,
      });
      if (error) throw error;
      uploadedKeys.push(media.object_key);
    }

    const { data, error } = await client.rpc("create_visit_memory", {
      p_memory_id: memoryId,
      p_couple_id: input.coupleId,
      p_trip_id: input.tripId,
      p_place_id: input.placeId ?? null,
      p_country: input.country,
      p_city: input.city,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_title: input.title,
      p_body: input.body,
      p_occurred_on: input.occurredOn,
      p_media: preparedMedia.map((media) => ({
        id: media.id,
        object_key: media.object_key,
        mime_type: media.mime_type,
        size_bytes: media.size_bytes,
        position: media.position,
      })),
    });
    if (error) {
      if (error.code === "PGRST202" || error.message.includes("create_visit_memory")) {
        return await saveVisitMemoryLegacy(client, input, memoryId, preparedMedia);
      }
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.place_id) throw new Error("SAVE_RESULT_MISSING");
    return { memoryId, placeId: row.place_id as string };
  } catch (error) {
    if (uploadedKeys.length) await client.storage.from("travel-media").remove(uploadedKeys);
    throw error;
  }
}

async function saveVisitMemoryLegacy(
  client: Client,
  input: SaveVisitMemoryInput,
  memoryId: string,
  preparedMedia: PreparedMedia[],
): Promise<{ memoryId: string; placeId: string }> {
  let placeId = input.placeId;
  if (!placeId) {
    placeId = await addPlace(client, {
      coupleId: input.coupleId,
      tripId: input.tripId,
      userId: input.userId,
      name: input.city,
      city: input.city,
      country: input.country,
      latitude: input.latitude,
      longitude: input.longitude,
    });
  }

  const { error: memoryError } = await client.from("memories").insert({
    id: memoryId,
    couple_id: input.coupleId,
    trip_id: input.tripId,
    place_id: placeId,
    title: input.title,
    body: input.body,
    occurred_on: input.occurredOn,
    created_by: input.userId,
    updated_by: input.userId,
  });
  if (memoryError) throw memoryError;

  for (const media of preparedMedia) {
    const { error: mediaError } = await client.from("media").insert({
      id: media.id,
      couple_id: input.coupleId,
      memory_id: memoryId,
      object_key: media.object_key,
      mime_type: media.mime_type,
      size_bytes: media.size_bytes,
      created_by: input.userId,
    });
    if (mediaError) {
      await client.from("memories").delete().eq("id", memoryId);
      throw mediaError;
    }
  }

  return { memoryId, placeId };
}

export async function addPlace(client: Client, input: { coupleId: string; tripId: string; userId: string; name: string; city: string; country: string; latitude: number; longitude: number }): Promise<string> {
  const { data: existingPlace, error: existingError } = await client
    .from("places")
    .select("id")
    .eq("couple_id", input.coupleId)
    .eq("country", input.country)
    .eq("city", input.city)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let placeId = existingPlace?.id as string | undefined;
  let createdPlace = false;
  if (!placeId) {
    const { data: place, error: placeError } = await client.from("places").insert({ couple_id: input.coupleId, name: input.name, city: input.city, country: input.country, latitude: input.latitude, longitude: input.longitude, created_by: input.userId, updated_by: input.userId }).select("id").single();
    if (placeError) throw placeError;
    placeId = place.id;
    createdPlace = true;
  }
  if (!placeId) throw new Error("地点创建失败，请再试一次。");
  const resolvedPlaceId: string = placeId;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: lastLink, error: positionError } = await client
      .from("trip_places")
      .select("position")
      .eq("trip_id", input.tripId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (positionError) throw positionError;
    const nextPosition = (lastLink?.position ?? 0) + 1;
    const { error: linkError } = await client.from("trip_places").insert({ trip_id: input.tripId, place_id: resolvedPlaceId, position: nextPosition });
    if (!linkError) return resolvedPlaceId;
    if (linkError.code !== "23505") {
      if (createdPlace) await client.from("places").delete().eq("id", resolvedPlaceId);
      throw linkError;
    }
  }

  if (createdPlace) await client.from("places").delete().eq("id", resolvedPlaceId);
  throw new Error("地点排序发生冲突，请再试一次。");
}
