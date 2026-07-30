"use client";

import { FormEvent, useMemo, useState } from "react";
import { mediaKindForType, resolveMediaType, validateMediaFiles, type MediaPolicy } from "@/lib/media-policy";
import type { Place } from "@/lib/types";

export type VisitDraft = {
  country: string;
  city: string;
  title: string;
  body: string;
  occurredOn: string;
  files: File[];
};

type VisitComposerProps = {
  place: Place | null;
  mediaPolicy: MediaPolicy;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: VisitDraft) => Promise<void>;
};

export default function VisitComposer({ place, mediaPolicy, saving, onClose, onSave }: VisitComposerProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [formError, setFormError] = useState("");
  const counts = useMemo(() => {
    let images = 0;
    let videos = 0;
    for (const file of files) {
      const type = resolveMediaType(file);
      const kind = type ? mediaKindForType(type) : null;
      if (kind === "image") images += 1;
      if (kind === "video") videos += 1;
    }
    return { images, videos };
  }, [files]);

  const selectFiles = (nextFiles: File[]) => {
    try {
      validateMediaFiles(nextFiles, mediaPolicy);
      setFiles(nextFiles);
      setFileError("");
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNSUPPORTED_MEDIA";
      const messages: Record<string, string> = {
        UNSUPPORTED_MEDIA: "包含不支持的文件格式。",
        IMAGE_LIMIT_EXCEEDED: `一段回忆最多 ${mediaPolicy.maxImages} 张照片。`,
        VIDEO_LIMIT_EXCEEDED: `一段回忆最多 ${mediaPolicy.maxVideos} 个视频。`,
        IMAGE_TOO_LARGE: `单张照片不能超过 ${Math.round(mediaPolicy.maxImageBytes / 1024 / 1024)} MB。`,
        VIDEO_TOO_LARGE: `单个视频不能超过 ${Math.round(mediaPolicy.maxVideoBytes / 1024 / 1024)} MB。`,
      };
      setFiles([]);
      setFileError(messages[code] ?? "无法读取这些文件。");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (fileError) return;
    const data = new FormData(event.currentTarget);
    const country = String(data.get("country") || "").trim();
    const city = String(data.get("city") || "").trim();
    const hasName = (value: string) => /[\p{L}\p{Script=Han}]/u.test(value);
    if (!hasName(country) || !hasName(city)) {
      setFormError("国家和城市请输入真实名称，例如“中国 / 上海”，不能只填写数字。");
      return;
    }
    setFormError("");
    await onSave({
      country,
      city,
      title: String(data.get("title") || "").trim(),
      body: String(data.get("body") || ""),
      occurredOn: String(data.get("date") || ""),
      files,
    });
  };

  return <div className="modal-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !saving) onClose();
  }}>
    <form className="memory-form visit-form" onSubmit={submit}>
      <button type="button" className="close" onClick={onClose} disabled={saving} aria-label="关闭记录窗口">×</button>
      <p className="overline">{place ? `再次到访 · ${place.city || place.name}` : "点亮一座城市"}</p>
      <h2>{place ? "把这次重逢也留下来" : "把这次出发留在地球上"}</h2>
      <div className="city-fields">
        <label>国家或地区<input name="country" required defaultValue={place?.country} placeholder="例如：中国" /></label>
        <label>城市<input name="city" required defaultValue={place?.city} placeholder="例如：上海" /></label>
      </div>
      <p className="privacy-hint">只会向地图服务发送国家和城市名称，不会发送照片、视频或回忆文字。</p>
      {formError && <p className="composer-error" role="alert">{formError}</p>}
      <div className="memory-divider"><span>这次的回忆</span></div>
      <label>标题<input name="title" required placeholder="例如：第一次一起看外滩夜景" /></label>
      <label>日期<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      <label>文字<textarea name="body" placeholder="今天发生了什么？也可以只留下照片或视频。" rows={4} /></label>
      <label className="media-picker">
        照片或视频
        <input
          name="media"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          onChange={(event) => selectFiles(Array.from(event.currentTarget.files ?? []))}
        />
        <span className="media-policy">
          <b>{counts.images}/{mediaPolicy.maxImages}</b> 张照片
          <b>{counts.videos}/{mediaPolicy.maxVideos}</b> 个视频
        </span>
        {files.length > 0 && <small className="selected-files">{files.map((file) => file.name).join(" · ")}</small>}
        {fileError && <small className="field-error">{fileError}</small>}
        {!fileError && <small className="field-hint">支持 JPG、PNG、WebP、MP4、WebM、MOV；上限以后可在情侣空间设置中提高。</small>}
      </label>
      <button className="primary-action visit-save" type="submit" disabled={saving || Boolean(fileError)}>
        {saving ? `正在保存 ${files.length || 1} 项内容…` : "点亮城市并保存回忆"}
      </button>
    </form>
  </div>;
}
