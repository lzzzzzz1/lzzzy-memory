"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBackup, downloadBackup, readAndValidateBackup, restoreBackup, type AtlasBackup, type BackupSummary } from "@/lib/backup";

type BackupCenterProps = {
  client: SupabaseClient;
  coupleId: string;
  onBack: () => void;
  onRestored: () => Promise<void>;
};

export default function BackupCenter({ client, coupleId, onBack, onRestored }: BackupCenterProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState<AtlasBackup | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);

  const exportAll = async () => {
    setBusy(true);
    setError("");
    try {
      const backup = await createBackup(client, coupleId, setProgress);
      setProgress("备份已完成，正在保存到本机…");
      downloadBackup(backup);
      setProgress("完整备份已下载，请将文件保存在安全位置。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "备份失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const inspectFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setCandidate(null);
    setSummary(null);
    try {
      const validated = await readAndValidateBackup(file, coupleId, setProgress);
      setCandidate(validated.backup);
      setSummary(validated.summary);
      setProgress("校验通过。恢复操作只补回缺失记录，不覆盖现有记录。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取这个备份文件。");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!candidate) return;
    setBusy(true);
    setError("");
    try {
      await restoreBackup(client, candidate, setProgress);
      await onRestored();
      setCandidate(null);
      setSummary(null);
      setProgress("恢复完成。缺失的旅行、城市、回忆、共同档案和媒体已补回。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "恢复失败，请保留备份文件后重试。");
    } finally {
      setBusy(false);
    }
  };

  return <section className="backup-center">
    <header>
      <button type="button" className="city-back" onClick={onBack}>← 返回地球</button>
      <p className="overline">设置与数据</p>
      <h1>把共同记忆握在自己手里</h1>
      <p>备份包含旅行、城市、每次到访、文字、共同档案以及私有照片和视频。导出的文件未经云端中转，请像保管珍贵照片一样妥善保存。</p>
    </header>

    <div className="backup-grid">
      <article className="backup-card">
        <span className="backup-icon">↓</span>
        <p className="overline">完整导出</p>
        <h2>下载本地备份</h2>
        <p>生成一个带版本号和 SHA-256 完整性校验的私密备份文件。</p>
        <button type="button" onClick={exportAll} disabled={busy}>{busy ? "正在处理…" : "导出全部数据与媒体"}</button>
      </article>

      <article className="backup-card">
        <span className="backup-icon">↺</span>
        <p className="overline">校验后恢复</p>
        <h2>检查备份文件</h2>
        <p>先验证文件版本、情侣空间和所有媒体校验值，再允许恢复。</p>
        <label className="backup-file">
          选择 .atlas-backup.json
          <input type="file" accept=".json,.atlas-backup.json,application/json" disabled={busy} onChange={(event) => void inspectFile(event.currentTarget.files?.[0])} />
        </label>
      </article>
    </div>

    {summary && <section className="backup-preview">
      <div>
        <p className="overline">校验通过 · {new Date(summary.exportedAt).toLocaleString("zh-CN")}</p>
        <h2>可以安全恢复</h2>
        <p>现有数据库记录不会被覆盖，情侣成员权限也不会被备份文件修改。</p>
      </div>
      <dl>
        <div><dt>旅行</dt><dd>{summary.trips}</dd></div>
        <div><dt>城市</dt><dd>{summary.places}</dd></div>
        <div><dt>到访</dt><dd>{summary.visits}</dd></div>
        <div><dt>回忆</dt><dd>{summary.memories}</dd></div>
        <div><dt>媒体</dt><dd>{summary.media}</dd></div>
        <div><dt>共同档案</dt><dd>{summary.sharedArchive}</dd></div>
        <div><dt>大小</dt><dd>{(summary.totalBytes / 1024 / 1024).toFixed(1)} MB</dd></div>
      </dl>
      <button type="button" onClick={restore} disabled={busy}>{busy ? "正在恢复…" : "安全恢复缺失内容"}</button>
    </section>}

    {(progress || error) && <p className={error ? "backup-status error" : "backup-status"} role="status">{error || progress}</p>}
  </section>;
}
