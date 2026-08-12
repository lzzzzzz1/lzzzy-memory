"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { DEFAULT_MEDIA_POLICY, mediaKindForType, resolveMediaType, validateMediaFiles, type MediaPolicy } from "@/lib/media-policy";
import type { Memory } from "@/lib/types";

export type MemoryEditDraft = {
  title: string;
  body: string;
  occurredOn: string;
  files: File[];
  removedMediaIds: string[];
};

type MemoryActionsProps = {
  memory: Memory;
  mediaPolicy?: MediaPolicy;
  onEdit: (memory: Memory, draft: MemoryEditDraft) => Promise<void>;
  onDelete: (memory: Memory) => Promise<void>;
  compact?: boolean;
};

export default function MemoryActions({ memory, mediaPolicy = DEFAULT_MEDIA_POLICY, onEdit, onDelete, compact = false }: MemoryActionsProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setEditing(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [busy, editing]);

  const openEditor = () => {
    setFiles([]);
    setRemovedMediaIds([]);
    setError("");
    setEditing(true);
  };

  const keptMedia = memory.media.filter((asset) => !removedMediaIds.includes(asset.id));

  const addFiles = (selected: File[]) => {
    const next = [...files, ...selected];
    try {
      validateMediaFiles(next, {
        ...mediaPolicy,
        maxImages: Math.max(0, mediaPolicy.maxImages - keptMedia.filter((asset) => asset.kind === "image").length),
        maxVideos: Math.max(0, mediaPolicy.maxVideos - keptMedia.filter((asset) => asset.kind === "video").length),
      });
      setFiles(next);
      setError("");
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "UNSUPPORTED_MEDIA";
      const messages: Record<string, string> = {
        UNSUPPORTED_MEDIA: "仅支持 JPG、PNG、WebP、MP4、WebM 和 MOV。",
        IMAGE_LIMIT_EXCEEDED: `一段回忆最多保存 ${mediaPolicy.maxImages} 张照片。`,
        VIDEO_LIMIT_EXCEEDED: `一段回忆最多保存 ${mediaPolicy.maxVideos} 个视频。`,
        IMAGE_TOO_LARGE: `单张照片不能超过 ${Math.round(mediaPolicy.maxImageBytes / 1024 / 1024)} MB。`,
        VIDEO_TOO_LARGE: `单个视频不能超过 ${Math.round(mediaPolicy.maxVideoBytes / 1024 / 1024)} MB。`,
      };
      setError(messages[code] ?? "无法添加这些文件。");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const draft: MemoryEditDraft = {
      title: String(form.get("title") ?? "").trim(),
      body: String(form.get("body") ?? "").trim(),
      occurredOn: String(form.get("occurredOn") ?? ""),
      files,
      removedMediaIds,
    };
    if (!draft.title || !draft.occurredOn) return;
    setBusy(true);
    setError("");
    try {
      await onEdit(memory, draft);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请再试一次。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`确定删除“${memory.title}”吗？照片和视频也会从私密空间移除。`)) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(memory);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败，请再试一次。");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <div className={`memory-actions ${compact ? "compact" : ""}`}>
      <button type="button" onClick={openEditor} disabled={busy} aria-label={`编辑${memory.title}`}>
        <span aria-hidden="true">✎</span> 编辑
      </button>
      <button className="danger" type="button" onClick={() => void remove()} disabled={busy} aria-label={`删除${memory.title}`}>
        <span aria-hidden="true">⌫</span> 删除
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
    {editing && <div className="memory-editor-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) setEditing(false);
    }}>
      <form className="memory-editor" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby={`edit-${memory.id}`}>
        <button className="memory-editor-close" type="button" onClick={() => setEditing(false)} disabled={busy} aria-label="关闭">×</button>
        <p className="overline">EDIT MEMORY</p>
        <h2 id={`edit-${memory.id}`}>整理这段回忆</h2>
        <p>可以修改文字、日期，并继续添加或移除照片和视频。</p>
        <label>标题<input name="title" defaultValue={memory.title} required maxLength={120} /></label>
        <label>日期<input name="occurredOn" type="date" defaultValue={memory.occurredOn} required /></label>
        <label>文字<textarea name="body" defaultValue={memory.body} rows={6} maxLength={4000} /></label>

        <fieldset className="memory-editor-media">
          <legend>照片与视频</legend>
          {memory.media.length > 0 && <div className="memory-editor-existing">
            {memory.media.map((asset) => {
              const removed = removedMediaIds.includes(asset.id);
              return <div className={removed ? "removed" : ""} key={asset.id}>
                {asset.kind === "image"
                  ? <Image src={asset.url} alt="已有照片" width={160} height={160} unoptimized />
                  : <video src={asset.url} preload="metadata" />}
                <button type="button" disabled={busy} onClick={() => setRemovedMediaIds((current) => removed ? current.filter((id) => id !== asset.id) : [...current, asset.id])}>
                  {removed ? "撤销" : "移除"}
                </button>
              </div>;
            })}
          </div>}
          <input ref={fileInputRef} className="memory-editor-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
          <div className="memory-editor-file-list">
            {files.map((file, index) => {
              const mime = resolveMediaType(file);
              const kind = mime ? mediaKindForType(mime) : null;
              return <span key={`${file.name}-${file.lastModified}-${index}`}><b>{kind === "video" ? "视频" : "照片"}</b>{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除${file.name}`}>×</button></span>;
            })}
          </div>
          <button className="memory-editor-add-media" type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>＋ 添加照片或视频</button>
          <small>最多 {mediaPolicy.maxImages} 张照片、{mediaPolicy.maxVideos} 个视频。</small>
        </fieldset>

        {error && <p className="memory-editor-error" role="alert">{error}</p>}
        <div className="memory-editor-footer">
          <button type="button" onClick={() => setEditing(false)} disabled={busy}>取消</button>
          <button className="primary" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存修改"}</button>
        </div>
      </form>
    </div>}
  </>;
}
