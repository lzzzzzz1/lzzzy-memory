import type { SupabaseClient } from "@supabase/supabase-js";

export type SharedFirst = {
  id: string;
  title: string;
  body: string;
  happenedOn: string;
  category: string;
  version: number;
};

export type SharedLetter = {
  id: string;
  title: string;
  content: string;
  letterDate: string;
  status: "draft" | "sealed";
  version: number;
};

export type SharedCheckin = {
  id: string;
  userId: string;
  checkinDate: string;
  mood: number;
  keyword: string;
  note: string;
  version: number;
};

export type SharedArchiveData = {
  firsts: SharedFirst[];
  letters: SharedLetter[];
  checkins: SharedCheckin[];
};

type FirstRow = {
  id: string;
  title: string;
  body: string;
  happened_on: string;
  category: string;
  version: number;
};

type LetterRow = {
  id: string;
  title: string;
  content: string;
  letter_date: string;
  status: "draft" | "sealed";
  version: number;
};

type CheckinRow = {
  id: string;
  user_id: string;
  checkin_date: string;
  mood: number;
  keyword: string;
  note: string;
  version: number;
};

function firstFromRow(row: FirstRow): SharedFirst {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    happenedOn: row.happened_on,
    category: row.category,
    version: row.version,
  };
}

function letterFromRow(row: LetterRow): SharedLetter {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    letterDate: row.letter_date,
    status: row.status,
    version: row.version,
  };
}

function checkinFromRow(row: CheckinRow): SharedCheckin {
  return {
    id: row.id,
    userId: row.user_id,
    checkinDate: row.checkin_date,
    mood: row.mood,
    keyword: row.keyword,
    note: row.note,
    version: row.version,
  };
}

export async function loadSharedArchive(
  client: SupabaseClient,
  coupleId: string,
): Promise<SharedArchiveData> {
  const [firstsResult, lettersResult, checkinsResult] = await Promise.all([
    client.from("couple_firsts").select("*").eq("couple_id", coupleId).order("happened_on", { ascending: false }),
    client.from("couple_letters").select("*").eq("couple_id", coupleId).order("letter_date", { ascending: false }),
    client.from("couple_checkins").select("*").eq("couple_id", coupleId).order("checkin_date", { ascending: false }).limit(60),
  ]);

  const error = firstsResult.error ?? lettersResult.error ?? checkinsResult.error;
  if (error) throw error;

  return {
    firsts: ((firstsResult.data ?? []) as FirstRow[]).map(firstFromRow),
    letters: ((lettersResult.data ?? []) as LetterRow[]).map(letterFromRow),
    checkins: ((checkinsResult.data ?? []) as CheckinRow[]).map(checkinFromRow),
  };
}

export async function createFirst(
  client: SupabaseClient,
  input: {
    coupleId: string;
    userId: string;
    title: string;
    body: string;
    happenedOn: string;
    category: string;
  },
): Promise<SharedFirst> {
  const { data, error } = await client.from("couple_firsts").insert({
    couple_id: input.coupleId,
    title: input.title.trim(),
    body: input.body.trim(),
    happened_on: input.happenedOn,
    category: input.category.trim() || "旅行",
    created_by: input.userId,
    updated_by: input.userId,
  }).select("*").single();
  if (error) throw error;
  return firstFromRow(data as FirstRow);
}

export async function createLetter(
  client: SupabaseClient,
  input: {
    coupleId: string;
    userId: string;
    title: string;
    content: string;
    letterDate: string;
    status: "draft" | "sealed";
  },
): Promise<SharedLetter> {
  const { data, error } = await client.from("couple_letters").insert({
    couple_id: input.coupleId,
    title: input.title.trim(),
    content: input.content.trim(),
    letter_date: input.letterDate,
    status: input.status,
    created_by: input.userId,
    updated_by: input.userId,
  }).select("*").single();
  if (error) throw error;
  return letterFromRow(data as LetterRow);
}

export async function saveCheckin(
  client: SupabaseClient,
  input: {
    coupleId: string;
    userId: string;
    checkinDate: string;
    mood: number;
    keyword: string;
    note: string;
  },
): Promise<SharedCheckin> {
  const { data: existing, error: existingError } = await client
    .from("couple_checkins")
    .select("id,version")
    .eq("couple_id", input.coupleId)
    .eq("user_id", input.userId)
    .eq("checkin_date", input.checkinDate)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { data, error } = await client.from("couple_checkins").update({
      mood: input.mood,
      keyword: input.keyword.trim(),
      note: input.note.trim(),
      updated_by: input.userId,
      version: Number(existing.version) + 1,
    }).eq("id", existing.id).eq("version", existing.version).select("*").single();
    if (error) {
      if (error.code === "PGRST116") throw new Error("STALE_VERSION");
      throw error;
    }
    return checkinFromRow(data as CheckinRow);
  }

  const { data, error } = await client.from("couple_checkins").insert({
    couple_id: input.coupleId,
    user_id: input.userId,
    checkin_date: input.checkinDate,
    mood: input.mood,
    keyword: input.keyword.trim(),
    note: input.note.trim(),
    created_by: input.userId,
    updated_by: input.userId,
  }).select("*").single();
  if (error) throw error;
  return checkinFromRow(data as CheckinRow);
}
