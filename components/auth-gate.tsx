"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { createFirstTrip, loadFirstTrip } from "@/lib/travel-data";
import type { Trip } from "@/lib/types";
import Atlas from "./atlas";

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setReady(true));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setReady(true); });
    return () => subscription.subscription.unsubscribe();
  }, []);
  if (!isSupabaseConfigured) return <Atlas />;
  if (!ready) return <main className="auth-screen"><section className="auth-card"><span className="auth-mark">✦</span><h1>正在打开我们的地图</h1><p>正在恢复安全登录状态…</p></section></main>;
  if (!session) return <SignIn />;
  return <ConnectedWorkspace session={session} />;
}

function SignIn() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) });
    setBusy(false); setError(signInError ? "邮箱或密码不正确，或该账户尚未被允许访问。" : "");
  };
  return <main className="auth-screen"><form className="auth-card" onSubmit={signIn}><span className="auth-mark">✦</span><p className="overline">仅限两人</p><h1>回到我们的地图</h1><p>使用预先创建的测试账户登录。</p><label>邮箱<input required name="email" type="email" autoComplete="email" /></label><label>密码<input required name="password" type="password" autoComplete="current-password" /></label>{error && <p className="auth-error">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "正在登录…" : "进入工作区"}</button></form></main>;
}

function ConnectedWorkspace({ session }: { session: Session }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!supabase) return;
    setError("");
    setLoading(true);
    try {
      let { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        userData = { user: refreshed.session?.user ?? null };
      }
      if (!userData.user) throw new Error("SESSION_EXPIRED");
      const loaded = await loadFirstTrip(supabase, userData.user.id);
      setCoupleId(loaded?.coupleId ?? null); setTrip(loaded?.trip ?? null);
    } catch { setError("无法恢复登录或读取私密空间，请点击重新连接。"); }
    finally { setLoading(false); }
  }, []);
  const signOut = async () => { await supabase?.auth.signOut(); };
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  if (loading) return <main className="auth-screen"><section className="auth-card"><span className="auth-mark">✦</span><h1>正在打开我们的地图</h1><p>正在确认情侣空间和最近一次旅行…</p></section></main>;
  if (error) return <main className="auth-screen"><section className="auth-card"><span className="auth-mark">!</span><h1>还无法打开空间</h1><p>{error}</p><button className="primary-action" onClick={refresh}>重新连接</button></section></main>;
  if (!coupleId) return <main className="auth-screen"><section className="auth-card"><span className="auth-mark">✦</span><h1>账户尚未加入空间</h1><p>请由部署者在 Supabase 中创建情侣空间，并把此账户添加到 <code>couple_members</code>。</p><p className="account-id">当前登录账户 ID：<code>{session.user.id}</code></p><button className="primary-action" onClick={refresh}>重新检查</button><button className="secondary-action" onClick={signOut}>退出登录</button></section></main>;
  if (!trip) return <main className="auth-screen"><section className="auth-card"><span className="auth-mark">□</span><h1>创建第一段测试旅行</h1><p>这会创建一条可丢弃的空旅行，之后可从工作区继续添加地点与回忆。</p><button className="primary-action" onClick={async () => { if (!supabase) return; await createFirstTrip(supabase, coupleId, session.user.id); refresh(); }}>创建测试旅行</button></section></main>;
  return <Atlas trip={trip} coupleId={coupleId} userId={session.user.id} onRefresh={refresh} onSignOut={signOut} />;
}
