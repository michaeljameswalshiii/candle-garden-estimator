"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

type Platform = "instagram" | "facebook" | "x" | "linkedin";
type MediaAttachment = { kind: "image" | "video"; name: string; assetUrn: string };
type Post = {
  id: string;
  createdAt: string;
  createdBy: string;
  body: string;
  mediaUrl?: string;
  media?: MediaAttachment;
  platforms: Platform[];
  status: string;
  results: Record<string, { status: string; note?: string }>;
};

const labels: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook Page",
  x: "X",
  linkedin: "LinkedIn",
};

const order: Platform[] = ["instagram", "facebook", "linkedin", "x"];

export function SocialHubClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [configured, setConfigured] = useState<Record<Platform, boolean>>({
    instagram: false,
    facebook: false,
    x: false,
    linkedin: false,
  });
  const [connected, setConnected] = useState<Record<Platform, boolean>>({
    instagram: false,
    facebook: false,
    x: false,
    linkedin: false,
  });
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
      const live = order.filter((p) => nextConnected[p]);
      if (!live.length) return current.filter((p) => p === "linkedin");
      if (current.some((p) => nextConnected[p])) return current;
      return live;
    });
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!mediaFile) {
      setMediaPreview("");
      return;
    }
    const next = URL.createObjectURL(mediaFile);
    setMediaPreview(next);
    return () => URL.revokeObjectURL(next);
  }, [mediaFile]);

  async function saveSetup(event: React.FormEvent) {
    event.preventDefault();
    if (!setupPlatform) return;
    setSetupMessage("");
    const response = await fetch("/api/admin/social/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: setupPlatform, clientId, clientSecret }),
    });
    const data = await response.json();
    if (!response.ok) {
      setSetupMessage(data.error || "Could not save setup");
      return;
    }
    setSetupMessage("");
    setClientId("");
    setClientSecret("");
    setSetupPlatform(null);
    await load();
  }

  function toggle(platform: Platform) {
    setSelected((current) =>
      current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform],
    );
  }

  function chooseMedia(file?: File) {
    setMessage("");
    if (!file) {
      setMediaFile(null);
      return;
    }
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
    setSaving(true);
    setMessage("");
    setUploadProgress(0);
    try {
      if (mediaFile && (!selected.includes("linkedin") || !connected.linkedin)) {
        throw new Error("Connect and select LinkedIn to publish an uploaded photo or video.");
      }
      const media = mediaFile ? await uploadLinkedInMedia(mediaFile) : undefined;
      const response = await fetch("/api/admin/social", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, mediaUrl, media, platforms: selected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not publish post");
      const results = data.post?.results || {};
      const notes = Object.entries(results).map(
        ([platform, result]) =>
          `${labels[platform as Platform] || platform}: ${(result as { note?: string; status?: string })?.note || (result as { status?: string })?.status}`,
      );
      setMessage(notes.join(" · ") || (data.post?.status === "published" ? "Published." : "Saved."));
      if (data.post?.status === "published" || data.post?.status === "partial") {
        setBody("");
        setMediaUrl("");
        setMediaFile(null);
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

  function statusClass(platform: Platform) {
    if (connected[platform]) return "is-connected";
    if (configured[platform]) return "is-ready";
    return "is-needed";
  }

  function statusLabel(platform: Platform) {
    if (connected[platform]) return "Connected";
    if (configured[platform]) return "Ready to connect";
    return "Setup needed";
  }

  return (
    <div className="social-hub">
      <header className="admin-page-head">
        <p className="eyebrow">Website</p>
        <h1>Social Media</h1>
        <p className="admin-lede">
          Write once for The Candle Garden, then send it to the networks you have connected. App passwords never enter this desk.
        </p>
      </header>

      <div className="social-layout">
        <form className="social-composer" onSubmit={savePost}>
          <div className="social-card-head">
            <p className="eyebrow">Compose</p>
            <h2>New post</h2>
          </div>
          <label className="admin-full">
            Post text
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              placeholder="Share an update from The Candle Garden…"
              required
            />
          </label>

          <div className="social-media">
            <p className="social-label">
              Photo or video <span>optional · required for Instagram</span>
            </p>
            <input
              ref={fileInput}
              onChange={(event) => chooseMedia(event.target.files?.[0])}
              type="file"
              accept="image/jpeg,image/png,image/gif,video/mp4"
              className="sr-only"
              id="social-media-upload"
            />
            {!mediaFile ? (
              <button type="button" className="social-dropzone" onClick={() => fileInput.current?.click()}>
                <strong>Choose a photo or MP4</strong>
                <span>JPG, PNG, GIF up to 20 MB · MP4 up to 500 MB</span>
              </button>
            ) : (
              <div className="social-preview">
                {mediaFile.type.startsWith("image/") ? (
                  <img src={mediaPreview} alt="Selected upload preview" />
                ) : (
                  <video src={mediaPreview} controls preload="metadata" />
                )}
                <div className="social-preview-meta">
                  <span>
                    {mediaFile.name} · {(mediaFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    className="social-text-btn"
                    onClick={() => {
                      setMediaFile(null);
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
            {!mediaFile ? (
              <label className="admin-full">
                Or a public media URL
                <input
                  value={mediaUrl}
                  onChange={(event) => setMediaUrl(event.target.value)}
                  type="url"
                  placeholder="https://"
                />
              </label>
            ) : null}
          </div>

          <fieldset className="social-platforms">
            <legend>Publish to</legend>
            <div className="social-platform-grid">
              {order.map((platform) => (
                <label key={platform} className={selected.includes(platform) ? "is-on" : undefined}>
                  <input type="checkbox" checked={selected.includes(platform)} onChange={() => toggle(platform)} />
                  <span>
                    <strong>{labels[platform]}</strong>
                    <small className={statusClass(platform)}>{configured[platform] ? "Configured" : "Needs setup"}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {saving && mediaFile && uploadProgress > 0 ? (
            <div className="social-progress">
              <div>
                <span>Uploading media</span>
                <span>{uploadProgress}%</span>
              </div>
              <i>
                <b style={{ width: `${uploadProgress}%` }} />
              </i>
            </div>
          ) : null}

          {message ? <p className="social-notice">{message}</p> : null}

          <button className="button button-dark" disabled={saving || !selected.length} type="submit">
            {saving
              ? mediaFile && uploadProgress < 100
                ? "Uploading…"
                : "Publishing…"
              : "Publish"}
          </button>
        </form>

        <aside className="social-accounts">
          <div className="social-card-head">
            <p className="eyebrow">Accounts</p>
            <h2>Connections</h2>
          </div>
          <p className="social-aside-copy">
            Set up each developer app once, then connect by signing in. The account owner’s password never comes here.
          </p>
          <ul>
            {order.map((platform) => (
              <li key={platform}>
                <div>
                  <strong>{labels[platform]}</strong>
                  <em className={statusClass(platform)}>{statusLabel(platform)}</em>
                </div>
                <p>
                  {connected[platform]
                    ? "Authorization saved securely."
                    : configured[platform]
                      ? "The account owner can authorize access."
                      : "Enter developer app credentials first."}
                </p>
                <div className="social-account-actions">
                  {configured[platform] ? (
                    <button
                      type="button"
                      className="button button-dark"
                      onClick={() => {
                        window.location.href = `/api/admin/social/connect?platform=${platform}`;
                      }}
                    >
                      {connected[platform] ? "Reconnect" : "Connect"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => {
                      setSetupPlatform(platform);
                      setSetupMessage("");
                    }}
                  >
                    {configured[platform] ? "Update" : "Set up"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <section className="social-history">
        <div className="social-history-head">
          <h2>Post history</h2>
          <span>{posts.length} saved</span>
        </div>
        {posts.length === 0 ? (
          <div className="social-empty">No posts yet. Publish the first update from the composer.</div>
        ) : (
          <div className="social-history-list">
            {posts.map((post) => (
              <article key={post.id}>
                <header>
                  <div>
                    {post.platforms.map((platform) => (
                      <span key={platform}>{labels[platform]}</span>
                    ))}
                  </div>
                  <time>{new Date(post.createdAt).toLocaleString()}</time>
                </header>
                <p>{post.body}</p>
                {post.media ? (
                  <small>
                    {post.media.kind === "image" ? "Photo" : "Video"} · {post.media.name}
                  </small>
                ) : null}
                <em>{post.status}</em>
                {post.results && Object.keys(post.results).length > 0 ? (
                  <ul>
                    {Object.entries(post.results).map(([platform, result]) => (
                      <li key={platform}>
                        {labels[platform as Platform] || platform}: {result.note || result.status}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {setupPlatform ? (
        <div className="social-modal" role="dialog" aria-modal="true">
          <form className="social-modal-card" onSubmit={saveSetup}>
            <div className="social-modal-head">
              <div>
                <p className="eyebrow">Developer setup</p>
                <h2>Set up {labels[setupPlatform]}</h2>
              </div>
              <button type="button" className="social-text-btn" onClick={() => setSetupPlatform(null)} aria-label="Close">
                Close
              </button>
            </div>
            <p>
              Enter the App ID / Client ID and Secret. These are encrypted before they are stored.
            </p>
            {(setupPlatform === "linkedin" || setupPlatform === "facebook" || setupPlatform === "instagram") ? (
              <p className="social-uri">
                Redirect URI to whitelist
                <code>{`https://candle-garden-web.vercel.app/api/admin/social/${setupPlatform}/callback`}</code>
              </p>
            ) : null}
            <label className="admin-full">
              App ID / Client ID
              <input value={clientId} onChange={(event) => setClientId(event.target.value)} required />
            </label>
            <label className="admin-full">
              App Secret / Client Secret
              <input
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            {setupMessage ? <p className="admin-error">{setupMessage}</p> : null}
            <button className="button button-dark" type="submit">
              Save encrypted setup
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
