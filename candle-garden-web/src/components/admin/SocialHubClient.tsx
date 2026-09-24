"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

type Platform = "instagram" | "facebook" | "x" | "linkedin";
type MediaAttachment = { kind: "image" | "video"; name: string; assetUrn: string };
type Post = { id: string; createdAt: string; createdBy: string; body: string; mediaUrl?: string; media?: MediaAttachment; platforms: Platform[]; status: string; results: Record<string, { status: string; note?: string }> };
const labels: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook Page", x: "X", linkedin: "LinkedIn" };

export function SocialHubClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [configured, setConfigured] = useState<Record<Platform, boolean>>({ instagram: false, facebook: false, x: false, linkedin: false });
  const [connected, setConnected] = useState<Record<Platform, boolean>>({ instagram: false, facebook: false, x: false, linkedin: false });
  const [selected, setSelected] = useState<Platform[]>(["linkedin"]);
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [setupPlatform, setSetupPlatform] = useState<Platform | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [setupMessage, setSetupMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/social", { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    setPosts(data.posts || []);
    setConfigured(data.platforms || {});
    const nextConnected = data.connected || {};
    setConnected(nextConnected);
    setSelected((current) => {
      const live = (Object.keys(labels) as Platform[]).filter((p) => nextConnected[p]);
      if (!live.length) return current.filter((p) => p === "linkedin");
      if (current.some((p) => nextConnected[p])) return current;
      return live;
    });
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!mediaFile) { setMediaPreview(""); return; }
    const next = URL.createObjectURL(mediaFile);
    setMediaPreview(next);
    return () => URL.revokeObjectURL(next);
  }, [mediaFile]);

  async function saveSetup(event: React.FormEvent) {
    event.preventDefault();
    if (!setupPlatform) return;
    setSetupMessage("");
    const response = await fetch("/api/admin/social/settings", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: setupPlatform, clientId, clientSecret }) });
    const data = await response.json();
    if (!response.ok) { setSetupMessage(data.error || "Could not save setup"); return; }
    setSetupMessage(`${labels[setupPlatform]} developer setup saved securely.`); setClientId(""); setClientSecret(""); setSetupPlatform(null); await load();
  }

  function toggle(platform: Platform) {
    setSelected((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
  }

  function chooseMedia(file?: File) {
    setMessage("");
    if (!file) { setMediaFile(null); return; }
    const isImage = ["image/jpeg", "image/png", "image/gif"].includes(file.type);
    const isVideo = file.type === "video/mp4";
    if (!isImage && !isVideo) {
      setMessage("Choose a JPG, PNG, GIF, or MP4 file.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (isImage && file.size > 20 * 1024 * 1024) {
      setMessage("Images must be 20 MB or smaller.");
      return;
    }
    if (isVideo && (file.size < 75 * 1024 || file.size > 500 * 1024 * 1024)) {
      setMessage("MP4 videos must be between 75 KB and 500 MB.");
      return;
    }
    setMediaFile(file);
    setMediaUrl("");
  }

  async function uploadLinkedInMedia(file: File): Promise<MediaAttachment> {
    const kind = file.type.startsWith("image/") ? "image" : "video";
    setUploadProgress(1);
    const pathname = `social-staging/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
    const staged = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/admin/social/media/blob",
      clientPayload: JSON.stringify({ kind }),
      contentType: file.type,
      multipart: file.size > 4 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => setUploadProgress(Math.max(1, Math.round(percentage * 0.8))),
    });
    setUploadProgress(85);
    const transfer = await fetch("/api/admin/social/media/linkedin", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transfer", blobUrl: staged.url, name: file.name }),
    });
    const result = await transfer.json();
    if (!transfer.ok) throw new Error(result.error || "Could not send media to LinkedIn.");
    setUploadProgress(100);
    return result.media as MediaAttachment;
  }

  async function savePost(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage("");
    setUploadProgress(0);
    try {
      if (mediaFile && (!selected.includes("linkedin") || !connected.linkedin)) {
        throw new Error("Connect and select LinkedIn to publish an uploaded photo or video.");
      }
      const media = mediaFile ? await uploadLinkedInMedia(mediaFile) : undefined;
      const response = await fetch("/api/admin/social", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, mediaUrl, media, platforms: selected }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not publish post");
      const results = data.post?.results || {};
      const notes = Object.entries(results).map(([platform, result]) => `${labels[platform as Platform] || platform}: ${(result as { note?: string; status?: string })?.note || (result as { status?: string })?.status}`);
      setMessage(notes.join(" ") || (data.post?.status === "published" ? "Published." : "Saved."));
      if (data.post?.status === "published" || data.post?.status === "partial") {
        setBody(""); setMediaUrl(""); setMediaFile(null);
        if (fileInput.current) fileInput.current.value = "";
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not publish post");
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  }

  return (
    <main className="social-hub">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Social Media</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Share one update</h1>
        <p className="mt-1 text-sm text-slate-500">Write once, send to the networks you have connected, and keep the publishing trail.</p>
      </header>
      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form onSubmit={savePost} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">New post</h2>
          <label className="mt-4 block text-sm font-medium text-slate-700">Post text<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="Share an update from The Candle Garden…" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" required /></label>
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">Photo or video <span className="font-normal text-slate-400">(optional)</span></p>
            <input ref={fileInput} onChange={(event) => chooseMedia(event.target.files?.[0])} type="file" accept="image/jpeg,image/png,image/gif,video/mp4" className="sr-only" id="social-media-upload" />
            {!mediaFile ? (
              <button type="button" onClick={() => fileInput.current?.click()} className="mt-1.5 w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 hover:border-teal-500 hover:bg-teal-50">
                <span className="block font-semibold text-teal-700">Choose a photo or MP4 video</span>
                <span className="mt-1 block text-xs text-slate-500">JPG, PNG, GIF up to 20 MB · MP4 up to 500 MB</span>
              </button>
            ) : (
              <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {mediaFile.type.startsWith("image/") ? <img src={mediaPreview} alt="Selected upload preview" className="max-h-72 w-full object-contain bg-slate-100" /> : <video src={mediaPreview} controls preload="metadata" className="max-h-72 w-full bg-black" />}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                  <span className="min-w-0 truncate text-slate-600">{mediaFile.name} · {(mediaFile.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button type="button" onClick={() => { setMediaFile(null); if (fileInput.current) fileInput.current.value = ""; }} className="shrink-0 font-semibold text-rose-600 hover:text-rose-500">Remove</button>
                </div>
              </div>
            )}
            {!mediaFile && <label className="mt-3 block text-xs font-medium text-slate-500">Or use a public media link {selected.includes("instagram") && <span className="font-semibold text-amber-700">(required for Instagram)</span>}<input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} type="url" placeholder="https://…" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" /></label>}
          </div>
          <fieldset className="mt-5"><legend className="text-sm font-medium text-slate-700">Publish to</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{(Object.keys(labels) as Platform[]).map((platform) => <label key={platform} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><span className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(platform)} onChange={() => toggle(platform)} className="h-4 w-4 accent-teal-600" />{labels[platform]}</span><span className={`text-[11px] font-semibold ${configured[platform] ? "text-emerald-600" : "text-amber-600"}`}>{configured[platform] ? "Configured" : "Needs setup"}</span></label>)}</div></fieldset>
          {saving && mediaFile && uploadProgress > 0 && <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>Uploading media to LinkedIn</span><span>{uploadProgress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${uploadProgress}%` }} /></div></div>}
          {message && <p className="mt-4 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{message}</p>}
          <button disabled={saving || !selected.length} className="mt-5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50">{saving ? mediaFile && uploadProgress < 100 ? "Uploading…" : "Publishing…" : selected.includes("linkedin") && connected.linkedin ? mediaFile ? "Upload & post to LinkedIn" : "Post to LinkedIn" : "Publish"}</button>
        </form>
        <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h2 className="text-base font-semibold text-slate-900">Account connections</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Set up each developer app once, then connect the account by signing in on the platform. Passwords never enter this site.</p><div className="mt-4 space-y-2">{(Object.keys(labels) as Platform[]).map((platform) => <div key={platform} className="rounded-lg bg-white px-3 py-2.5 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">{labels[platform]}</span><span className={connected[platform] ? "text-emerald-600" : configured[platform] ? "text-amber-600" : "text-slate-400"}>{connected[platform] ? "Connected" : configured[platform] ? "Ready to connect" : "Setup needed"}</span></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">{connected[platform] ? "Authorization saved securely." : configured[platform] ? "The account owner can authorize access." : "Enter developer app credentials."}</p><div className="flex gap-2">{configured[platform] && <button type="button" onClick={() => { window.location.href = `/api/admin/social/connect?platform=${platform}`; }} className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-500">{connected[platform] ? "Reconnect" : "Connect"}</button>}<button type="button" onClick={() => { setSetupPlatform(platform); setSetupMessage(""); }} className="rounded-lg border border-teal-200 px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">{configured[platform] ? "Update" : "Set up"}</button></div></div></div>)}</div><div className="mt-4 rounded-xl border border-teal-100 bg-teal-50 px-3 py-3 text-xs leading-relaxed text-teal-900"><strong>Account owner:</strong> click Connect, sign in on the platform, and approve access. The owner’s password is never shared with us.</div></aside>
      </section>
      {setupPlatform && <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4"><form onSubmit={saveSetup} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-900">Set up {labels[setupPlatform]}</h2><p className="mt-1 text-sm text-slate-600">Enter the developer App ID/Client ID and Secret. These are encrypted before storage.</p>{(setupPlatform === "linkedin" || setupPlatform === "facebook" || setupPlatform === "instagram") && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">Redirect URI Meta/LinkedIn must whitelist:<br /><code className="break-all text-[11px] text-slate-800">{`https://candle-garden-web.vercel.app/api/admin/social/${setupPlatform}/callback`}</code></p>}</div><button type="button" onClick={() => setSetupPlatform(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close">×</button></div><label className="mt-5 block text-sm font-medium text-slate-700">App ID / Client ID<input value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" required /></label><label className="mt-4 block text-sm font-medium text-slate-700">App Secret / Client Secret<input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" required /></label>{setupMessage && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{setupMessage}</p>}<button className="mt-5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500">Save encrypted setup</button></form></div>}
      <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Post history</h2><span className="text-xs text-slate-500">{posts.length} saved</span></div><div className="mt-3 space-y-3">{posts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No posts yet.</div> : posts.map((post) => <article key={post.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5">{post.platforms.map((platform) => <span key={platform} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{labels[platform]}</span>)}</div><span className="text-xs text-slate-500">{new Date(post.createdAt).toLocaleString()}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{post.body}</p>{post.media && <p className="mt-2 inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800">{post.media.kind === "image" ? "Photo" : "Video"}: {post.media.name}</p>}<p className="mt-3 text-xs font-semibold uppercase tracking-wide text-teal-700">{post.status}</p>{post.results && Object.keys(post.results).length > 0 ? <ul className="mt-2 space-y-1 text-xs text-slate-600">{Object.entries(post.results).map(([platform, result]) => <li key={platform}>{labels[platform as Platform] || platform}: {result.note || result.status}</li>)}</ul> : null}</article>)}</div></section>
    </main>
  );
}
