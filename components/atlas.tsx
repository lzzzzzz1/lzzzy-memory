"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { demoTrip } from "@/lib/demo-data";
import { DEFAULT_MEDIA_POLICY, mediaKindForType, resolveMediaType, type MediaPolicy } from "@/lib/media-policy";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { deleteMemoryRecord, loadMediaPolicy, saveVisitMemory, updateMemoryRecord } from "@/lib/travel-data";
import type { Memory, Place, Trip } from "@/lib/types";
import BackupCenter from "./backup-center";
import CityDetail from "./city-detail";
import CityMemoryPanel from "./city-memory-panel";
import MemoryActions, { type MemoryEditDraft } from "./memory-actions";
import MemoryArchive from "./memory-archive";
import MemoryMedia from "./memory-media";
import TowhereFusion, { type ArchiveSection } from "./towhere-fusion";
import VisitComposer, { type VisitDraft } from "./visit-composer";

const Globe = dynamic(() => import("./globe"), { ssr: false, loading: () => <div className="globe-loading">正在加载地图…</div> });

type AtlasProps = {
  trip?: Trip;
  coupleId?: string;
  userId?: string;
  onRefresh?: () => Promise<void>;
  onSignOut?: () => Promise<void>;
};
type AtlasView = "timeline" | "trip" | "archive" | "city" | "backup" | ArchiveSection;

function HeaderIcon({ name }: { name: "archive" | "timeline" }) {
  if (name === "archive") {
    return <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle className="header-nav-core" cx="10" cy="10" r="2.2" />
      <ellipse cx="10" cy="10" rx="7.2" ry="3.7" />
      <ellipse cx="10" cy="10" rx="3.7" ry="7.2" transform="rotate(35 10 10)" />
    </svg>;
  }
  return <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="7" />
    <path d="M10 5.7v4.7l3 1.8" />
  </svg>;
}

export default function Atlas({ trip: initialTrip = demoTrip, coupleId, userId, onRefresh, onSignOut }: AtlasProps) {
  const [localTrip, setLocalTrip] = useState<Trip>(initialTrip);
  const trip = coupleId ? initialTrip : localTrip;
  const [selectedPlace, setSelectedPlace] = useState<Place>(initialTrip.places[0] ?? { id: "pending", name: "等待添加地点", city: "", country: "", longitude: 0, latitude: 0, position: 1 });
  const [view, setView] = useState<AtlasView>("trip");
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [formPlace, setFormPlace] = useState<Place | null>(null);
  const [showCityPanel, setShowCityPanel] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [mediaPolicy, setMediaPolicy] = useState<MediaPolicy>(DEFAULT_MEDIA_POLICY);
  const memories = useMemo(() => trip.memories, [trip.memories]);
  const selectedMemories = useMemo(() => memories.filter((memory) => memory.placeId === selectedPlace.id), [memories, selectedPlace.id]);
  const imageCount = useMemo(() => memories.reduce((total, memory) => total + (memory.media.filter((item) => item.kind === "image").length || (memory.photoUrl ? 1 : 0)), 0), [memories]);
  const videoCount = useMemo(() => memories.reduce((total, memory) => total + (memory.media.filter((item) => item.kind === "video").length || (memory.mediaKind === "video" ? 1 : 0)), 0), [memories]);
  const archiveSection = (["universe", "firsts"] as const).includes(view as ArchiveSection)
    ? view as ArchiveSection
    : null;
  const viewLabel: Record<AtlasView, string> = {
    trip: "旅行地球",
    archive: "城市档案",
    timeline: "时间轴",
    city: selectedPlace.city || selectedPlace.name,
    backup: "数据与备份",
    universe: "回忆宇宙",
    firsts: "我们的第一次",
  };
  const selectPlace = useCallback((place: Place) => {
    setSelectedPlace(place);
    setShowCityPanel(true);
  }, []);

  const openVisitForm = useCallback((place?: Place) => {
    setFormPlace(place?.id === "pending" ? null : place ?? null);
    setShowVisitForm(true);
  }, []);

  const openBackup = () => {
    if (!supabase || !coupleId) {
      setNotice("连接私密情侣空间后才能导出完整备份。");
      return;
    }
    setShowCityPanel(false);
    setView("backup");
  };

  useEffect(() => {
    if (!supabase || !coupleId) return;
    let cancelled = false;
    void loadMediaPolicy(supabase, coupleId)
      .then((policy) => { if (!cancelled) setMediaPolicy(policy); })
      .catch(() => { if (!cancelled) setMediaPolicy(DEFAULT_MEDIA_POLICY); });
    return () => { cancelled = true; };
  }, [coupleId]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (event.key === "Escape") {
        if (showVisitForm) setShowVisitForm(false);
        else if (showCityPanel) setShowCityPanel(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !isEditing) {
        event.preventDefault();
        openVisitForm();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [openVisitForm, showCityPanel, showVisitForm]);

  const saveVisit = async (draft: VisitDraft) => {
    if (saving) return;
    setSaving(true);
    const { country, city, title, body, occurredOn, files } = draft;
    try {
      let place = trip.places.find((item) => item.country.toLowerCase() === country.toLowerCase() && item.city.toLowerCase() === city.toLowerCase());
      let coordinates = place ? { latitude: place.latitude, longitude: place.longitude } : null;
      if (!place) {
        const response = await fetch(`/api/geocode?country=${encodeURIComponent(country)}&city=${encodeURIComponent(city)}`);
        if (!response.ok) throw new Error(response.status === 404 ? "CITY_NOT_FOUND" : "GEOCODER_UNAVAILABLE");
        coordinates = await response.json() as { latitude: number; longitude: number };
      }
      if (!coordinates) throw new Error("CITY_NOT_FOUND");
      const base = { name: city, city, country, latitude: coordinates.latitude, longitude: coordinates.longitude, position: trip.places.length + 1 };
      if (supabase && coupleId && userId) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !refreshed.session?.user) throw new Error("登录状态已失效，请重新登录");
        }
        const activeUserId = (await supabase.auth.getUser()).data.user?.id ?? userId;
        const saved = await saveVisitMemory(supabase, {
          coupleId,
          tripId: trip.id,
          placeId: place?.id,
          userId: activeUserId,
          country,
          city,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          title,
          body,
          occurredOn,
          files,
          mediaPolicy,
        });
        place = place ?? { id: saved.placeId, ...base };
        await onRefresh?.();
        setNotice(`${city}已点亮，回忆已保存。`);
      } else {
        place = place ?? { id: crypto.randomUUID(), ...base };
        if (!trip.places.some((item) => item.id === place!.id)) {
          setLocalTrip((current) => ({ ...current, places: [...current.places, place!] }));
        }
        const media = files.map((file, index) => {
          const mimeType = resolveMediaType(file);
          const kind = mimeType ? mediaKindForType(mimeType) : null;
          if (!mimeType || !kind) throw new Error("UNSUPPORTED_MEDIA");
          return { id: crypto.randomUUID(), url: URL.createObjectURL(file), kind, mimeType, sizeBytes: file.size, position: index + 1 };
        });
        const memory: Memory = {
          id: crypto.randomUUID(),
          placeId: place.id,
          visitId: crypto.randomUUID(),
          title,
          body,
          occurredOn,
          media,
          photoUrl: media.find((item) => item.kind === "image")?.url,
          mediaUrl: media[0]?.url,
          mediaKind: media[0]?.kind,
          version: 1,
        };
        setLocalTrip((current) => ({ ...current, memories: [memory, ...current.memories] }));
        setNotice(`${city}已点亮，演示回忆已保存。`);
      }
      setSelectedPlace(place);
      setShowVisitForm(false);
      setShowCityPanel(true);
      setView("trip");
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "未知错误";
      const friendlyMessage: Record<string, string> = {
        CITY_NOT_FOUND: "没有找到这个城市，请检查国家和城市名称。",
        GEOCODER_UNAVAILABLE: "城市查询服务暂时不可用，请稍后再试。",
        UNSUPPORTED_MEDIA: "文件格式不支持。请选择 JPG、PNG、WebP、MP4、WebM 或 MOV。",
        IMAGE_LIMIT_EXCEEDED: `一段回忆最多可以保存 ${mediaPolicy.maxImages} 张照片。`,
        VIDEO_LIMIT_EXCEEDED: `一段回忆最多可以保存 ${mediaPolicy.maxVideos} 个视频。`,
        IMAGE_TOO_LARGE: `单张照片不能超过 ${Math.round(mediaPolicy.maxImageBytes / 1024 / 1024)} MB。`,
        VIDEO_TOO_LARGE: `单个视频不能超过 ${Math.round(mediaPolicy.maxVideoBytes / 1024 / 1024)} MB。`,
      };
      const message = detail.includes("place_id") && detail.includes("ambiguous")
        ? "数据库函数需要运行 202607290003_fix_rpc_place_id.sql 修复迁移。"
        : friendlyMessage[detail] ?? `保存失败：${detail}`;
      setNotice(message);
    } finally {
      setSaving(false);
    }
  };

  const editMemory = async (memory: Memory, draft: MemoryEditDraft) => {
    try {
      if (supabase && coupleId && userId) {
        await updateMemoryRecord(supabase, {
          memoryId: memory.id,
          userId,
          title: draft.title,
          body: draft.body,
          occurredOn: draft.occurredOn,
          version: memory.version,
        });
        await onRefresh?.();
      } else {
        setLocalTrip((current) => ({
          ...current,
          memories: current.memories.map((item) => item.id === memory.id
            ? { ...item, ...draft, version: item.version + 1 }
            : item),
        }));
      }
      setNotice("回忆已更新。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "保存失败，请再试一次。";
      const message = detail.includes("STALE_VERSION")
        ? "内容已被另一台设备修改，请刷新后再编辑。"
        : `修改失败：${detail}`;
      setNotice(message);
      throw new Error(message);
    }
  };

  const deleteMemory = async (memory: Memory) => {
    try {
      if (supabase && coupleId) {
        await deleteMemoryRecord(supabase, { memoryId: memory.id, version: memory.version });
        await onRefresh?.();
      } else {
        setLocalTrip((current) => ({
          ...current,
          memories: current.memories.filter((item) => item.id !== memory.id),
        }));
      }
      setNotice("这段回忆已删除。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "删除失败，请再试一次。";
      const message = detail.includes("STALE_VERSION")
        ? "内容已被另一台设备修改，请刷新后再删除。"
        : `删除失败：${detail}`;
      setNotice(message);
      throw new Error(message);
    }
  };

  return <main className={`workspace-shell ${view === "trip" ? "earth-mode" : ""}`}>
    <aside className="sidebar">
      <div className="workspace-switcher"><span className="avatar">我</span><span>我们的小世界</span><button aria-label="切换空间">⌄</button></div>
      <button className="new-button" onClick={() => openVisitForm()}><span>＋</span> 点亮一座城市 <kbd>Ctrl K</kbd></button>
      <nav className="side-nav" aria-label="工作区导航">
        <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}><i>◷</i> 时间轴</button>
        <button className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}><i>◫</i> 城市档案</button>
      </nav>
      <p className="side-label">空间</p>
      <button className={`document-link ${view === "trip" ? "active" : ""}`} onClick={() => setView("trip")}><span className="doc-icon">✦</span> 开始我们的地图</button>
      <button className={`document-link ${view === "timeline" ? "active" : ""}`} onClick={() => setView("timeline")}><span className="doc-icon">□</span> {trip.name}</button>
      <p className="side-label">共同档案</p>
      <button className={`document-link ${view === "universe" ? "active" : ""}`} onClick={() => setView("universe")}><span className="doc-icon">✺</span> 回忆宇宙</button>
      <button className={`document-link ${view === "firsts" ? "active" : ""}`} onClick={() => setView("firsts")}><span className="doc-icon">01</span> 我们的第一次</button>
      <div className="sidebar-bottom"><button><span className={isSupabaseConfigured ? "connection connected" : "connection"} />{isSupabaseConfigured ? "私密空间已连接" : "演示工作区"}</button><button onClick={openBackup}>⇩ 数据与备份</button>{onSignOut && <button onClick={() => void onSignOut()}>↪ 退出登录</button>}</div>
    </aside>
    <section className={`canvas ${view === "trip" ? "earth-canvas" : ""}`}>
      <header className="canvas-header"><div className="breadcrumb"><span>我们的小世界</span><b>/</b><span>{viewLabel[view]}</span></div><div className="header-actions"><button className="header-section-link" onClick={() => setView("archive")} aria-label="共同档案" title="共同档案"><span className="header-nav-icon"><HeaderIcon name="archive" /></span><span className="header-nav-label">共同档案</span></button><button className="header-section-link" onClick={() => setView("timeline")} aria-label="时间轴" title="时间轴"><span className="header-nav-icon"><HeaderIcon name="timeline" /></span><span className="header-nav-label">时间轴</span></button><button className="header-icon-button search-button" aria-label="搜索" title="搜索">⌕</button><button className="header-icon-button backup-menu-button" aria-label="数据与备份" title="数据与备份" onClick={openBackup}>•••</button>{onSignOut ? <button className="avatar small sign-out-avatar" onClick={() => void onSignOut()} aria-label="退出登录" title="退出登录">我</button> : <span className="avatar small">我</span>}</div></header>
      {view === "trip" && <section className="trip-canvas earth-workspace">
        <div className="globe-frame globe-immersive">
          <Globe places={trip.places} onPick={selectPlace} />
          <div className="earth-title">
            <p className="overline">OUR PRIVATE UNIVERSE · {trip.startDate}</p>
            <h1>{trip.name}</h1>
            <p>一起去过的地方，会在这颗地球上永远亮着。</p>
          </div>
          <div className="earth-metrics" aria-label="旅行统计">
            <span><b>{trip.places.length}</b> 城市</span>
            <span><b>{memories.length}</b> 回忆</span>
            <span><b>{imageCount}</b> 照片</span>
            <span><b>{videoCount}</b> 视频</span>
          </div>
          <button className="earth-add" type="button" onClick={() => openVisitForm()}>
            <span>＋</span>
            <span><b>点亮一座城市</b><small>添加地点、文字、照片或视频</small></span>
          </button>
          <div className="globe-status"><i /> LIVE EARTH <span>{trip.places.length} LIGHTS</span></div>
          <div className="globe-hint">拖动旋转 · 缓慢滚动缩放 · 点击城市光点</div>
          <div className="map-caption">
            <p className="overline">{selectedPlace.id === "pending" ? "等待第一束光" : `${selectedPlace.country} · 已点亮`}</p>
            <h2>{selectedPlace.city || selectedPlace.name}</h2>
            <p>{selectedPlace.id === "pending" ? "从你们的第一次共同出发开始。" : `${selectedMemories.length} 段共同回忆`}</p>
            <button type="button" onClick={() => selectedPlace.id === "pending" ? openVisitForm() : setShowCityPanel(true)}>
              {selectedPlace.id === "pending" ? "点亮第一座城市" : "打开这座城市的记忆 →"}
            </button>
          </div>
          <div className="place-row earth-place-row">
            {trip.places.map((place) => <button key={place.id} onClick={() => selectPlace(place)} className={selectedPlace.id === place.id ? "selected" : ""}>
              <small>{place.position.toString().padStart(2, "0")}</small>{place.city || place.name}
            </button>)}
          </div>
        </div>
      </section>}
      {view === "archive" && <section className="city-archive-page">
        <header className="city-archive-hero">
          <div>
            <p className="overline">CITY ARCHIVE · {trip.places.length} LIGHTS</p>
            <h1>城市成为章节，回忆自然成册</h1>
            <p>按城市重新翻开照片、视频与文字；新增记录仍会同步点亮地球。</p>
          </div>
          <button type="button" onClick={() => openVisitForm()}><span>＋</span><span><b>记录一次出发</b><small>国家、城市、文字与媒体</small></span></button>
        </header>
        <MemoryArchive places={trip.places} memories={memories} onOpenCity={(place) => { setSelectedPlace(place); setView("city"); }} onAdd={() => openVisitForm()} />
      </section>}
      {view === "timeline" && <section className="timeline-canvas"><div className="canvas-title"><div><p className="page-icon">◷</p><h1>共同时间轴</h1><p>{trip.name} · 所有值得重看的小事</p></div><button className="subtle-action" onClick={() => openVisitForm()}>＋ 点亮并记录</button></div><div className="memory-stream">{memories.length === 0 && <button className="empty-memory" onClick={() => openVisitForm()}><span>✦</span><strong>留下第一段共同回忆</strong><small>选择一座城市，写几句话，或放入照片与视频。</small></button>}{memories.map((memory) => <article key={memory.id} className="memory-row"><time>{memory.occurredOn}</time><div><h2>{memory.title}</h2><p>{memory.body}</p><MemoryMedia memory={memory} /><MemoryActions memory={memory} onEdit={editMemory} onDelete={deleteMemory} /></div></article>)}</div></section>}
      {view === "city" && selectedPlace.id !== "pending" && <CityDetail place={selectedPlace} memories={selectedMemories} onBack={() => setView("archive")} onAdd={() => openVisitForm(selectedPlace)} onEdit={editMemory} onDelete={deleteMemory} />}
      {view === "backup" && supabase && coupleId && <BackupCenter client={supabase} coupleId={coupleId} onBack={() => setView("trip")} onRestored={onRefresh ?? (async () => undefined)} />}
      {archiveSection && <TowhereFusion key={archiveSection} section={archiveSection} trip={trip} coupleId={coupleId} userId={userId} />}
    </section>
    <nav className="mobile-nav" aria-label="移动端导航">
      <button className={view === "trip" ? "active" : ""} onClick={() => setView("trip")}><span>◉</span><small>地球</small></button>
      <button className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}><span>◫</span><small>城市</small></button>
      <button className="mobile-add" onClick={() => openVisitForm()}><span>＋</span><small>记录</small></button>
      <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}><span>◷</span><small>时间轴</small></button>
    </nav>
    {showCityPanel && selectedPlace.id !== "pending" && <CityMemoryPanel place={selectedPlace} memories={selectedMemories} onClose={() => setShowCityPanel(false)} onAdd={() => { setShowCityPanel(false); openVisitForm(selectedPlace); }} onOpenFull={() => { setShowCityPanel(false); setView("city"); }} onEdit={editMemory} onDelete={deleteMemory} />}
    {showVisitForm && <VisitComposer place={formPlace} mediaPolicy={mediaPolicy} saving={saving} onClose={() => setShowVisitForm(false)} onSave={saveVisit} />}
    {notice && <p className="notice" role="status">{notice}</p>}
  </main>;
}
