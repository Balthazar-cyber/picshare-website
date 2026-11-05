import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy,
  Timestamp, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const SUPABASE_URL = "https://rcfyzegwkopysdmrqiei.supabase.co";
const SUPABASE_KEY = "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";
const DAY = 24 * 60 * 60 * 1000;
const DURATION = 5000;

const moments = document.getElementById("dynamicMoments");
if (!moments) {
  console.error("PicShare: #dynamicMoments is missing from index.html");
} else {
  let user = null;
  let allStories = [];
  let stopListening = null;
  let shownStories = [];
  let shownIndex = 0;
  let timer = null;

  const $ = id => document.getElementById(id);

  function addStyles() {
    if ($("picShareStoryStyles")) return;
    const style = document.createElement("style");
    style.id = "picShareStoryStyles";
    style.textContent = `
      .story-create-area{margin:12px 0}
      .story-create-button{display:inline-flex;gap:10px;align-items:center;padding:11px 16px;border:1px solid #bcebe3;border-radius:13px;background:#e3f8f4;color:#101b2d;font-weight:700;cursor:pointer}
      .story-create-button span{font-size:24px;color:#159e8e}
      .story-create-button:disabled{opacity:.55}
      #storyStatus{font-size:13px;margin:8px 0}
      .moments-row{display:flex;gap:14px;overflow-x:auto;padding:8px 2px 16px}
      .story-person{flex:0 0 78px;text-align:center;border:0;background:none;cursor:pointer;color:inherit;padding:0}
      .story-ring{width:70px;height:70px;padding:3px;margin:auto;border-radius:50%;background:linear-gradient(135deg,#20b8a4,#8165ef,#ff9d54)}
      .story-ring img,.story-initial{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%;border:3px solid white;box-sizing:border-box}
      .story-initial{display:grid;place-items:center;background:#e3f8f4;color:#101b2d;font-weight:800;font-size:23px}
      .story-person-name{display:block;margin-top:7px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .story-viewer{position:fixed;inset:0;background:#080d16f5;z-index:99999;display:grid;place-items:center;padding:15px}
      .story-viewer[hidden]{display:none}
      .story-viewer-card{position:relative;width:min(420px,100%);height:min(760px,90vh);background:#101b2d;border-radius:18px;overflow:hidden}
      .story-viewer-card>img{width:100%;height:100%;object-fit:contain}
      .story-progress{position:absolute;top:12px;left:12px;right:12px;height:3px;background:#ffffff55;z-index:2}
      .story-progress span{display:block;width:0;height:100%;background:white}
      .story-owner{position:absolute;top:25px;left:15px;right:60px;color:white;z-index:2;font-weight:700;text-shadow:0 1px 5px #000}
      .story-close{position:absolute;top:14px;right:14px;z-index:4;border:0;background:#ffffff33;color:white;border-radius:50%;width:42px;height:42px;font-size:28px}
      .story-controls{position:absolute;inset:55px 0 55px;display:flex;justify-content:space-between;align-items:center}
      .story-controls button{width:48px;height:100%;border:0;background:transparent;color:white;font-size:42px}
      .story-delete{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);border:0;border-radius:10px;padding:10px 15px;background:#d94040;color:white;font-weight:700}
      @media(max-width:600px){.story-viewer{padding:0}.story-viewer-card{height:100%;width:100%;border-radius:0}}
    `;
    document.head.appendChild(style);
  }

  function buildControls() {
    if (!$("addStoryBtn")) {
      const area = document.createElement("div");
      area.className = "story-create-area";
      area.innerHTML = `
        <button id="addStoryBtn" class="story-create-button" type="button"><span>＋</span><strong>Add your story</strong></button>
        <input id="storyFile" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <p id="storyStatus" aria-live="polite"></p>`;
      (moments.closest("#momentsSection") || moments.parentElement).appendChild(area);
    }
    if (!$("storyViewer")) {
      const viewer = document.createElement("div");
      viewer.id = "storyViewer";
      viewer.className = "story-viewer";
      viewer.hidden = true;
      viewer.innerHTML = `
        <div class="story-viewer-card">
          <button id="storyClose" class="story-close" type="button" aria-label="Close">×</button>
          <div class="story-progress"><span id="storyProgress"></span></div>
          <div id="storyOwner" class="story-owner"></div>
          <img id="storyImage" alt="PicShare story">
          <div class="story-controls">
            <button id="storyPrevious" type="button" aria-label="Previous">‹</button>
            <button id="storyNext" type="button" aria-label="Next">›</button>
          </div>
          <button id="deleteStoryBtn" class="story-delete" type="button" hidden>Delete my story</button>
        </div>`;
      document.body.appendChild(viewer);
    }
  }

  function expiry(story) {
    if (story.expiresAt?.toMillis) return story.expiresAt.toMillis();
    if (story.expiresAt instanceof Date) return story.expiresAt.getTime();
    return 0;
  }

  function render() {
    const active = allStories.filter(s => s.imageUrl && expiry(s) > Date.now());
    const groups = new Map();
    active.forEach(s => {
      if (!groups.has(s.uid)) groups.set(s.uid, []);
      groups.get(s.uid).push(s);
    });

    moments.replaceChildren();
    if (!groups.size) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No active stories yet. Be the first to share one!";
      moments.appendChild(p);
      return;
    }

    groups.forEach((items, uid) => {
      const latest = items[0];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "story-person";
      const ring = document.createElement("div");
      ring.className = "story-ring";
      if (latest.photoURL) {
        const img = document.createElement("img");
        img.src = latest.photoURL;
        img.alt = "";
        ring.appendChild(img);
      } else {
        const initial = document.createElement("span");
        initial.className = "story-initial";
        initial.textContent = (latest.name || "P").charAt(0).toUpperCase();
        ring.appendChild(initial);
      }
      const name = document.createElement("span");
      name.className = "story-person-name";
      name.textContent = latest.name || "Member";
      button.append(ring, name);
      button.addEventListener("click", () => openViewer(active.filter(s => s.uid === uid), 0));
      moments.appendChild(button);
    });
  }

  async function uploadImage(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WEBP image.");
    if (file.size > 2 * 1024 * 1024) throw new Error("Choose an image smaller than 2 MB.");
    const form = new FormData();
    form.append("file", file, file.name);
    const token = await user.getIdToken();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/dynamic-function`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "x-firebase-token": token },
      body: form
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.publicUrl) throw new Error(result.error || `Upload failed (${response.status}).`);
    return result.publicUrl;
  }

  function openViewer(items, index) {
    if (!items.length || index < 0 || index >= items.length) return;
    clearTimeout(timer);
    shownStories = items;
    shownIndex = index;
    const story = shownStories[shownIndex];
    $("storyImage").src = story.imageUrl;
    $("storyOwner").textContent = story.name || "PicShare member";
    $("deleteStoryBtn").hidden = !user || user.uid !== story.uid;
    $("storyViewer").hidden = false;
    const bar = $("storyProgress");
    bar.style.transition = "none";
    bar.style.width = "0%";
    requestAnimationFrame(() => {
      bar.style.transition = `width ${DURATION}ms linear`;
      bar.style.width = "100%";
    });
    timer = setTimeout(next, DURATION);
  }

  function next() {
    if (shownIndex < shownStories.length - 1) openViewer(shownStories, shownIndex + 1);
    else closeViewer();
  }

  function previous() {
    if (shownIndex > 0) openViewer(shownStories, shownIndex - 1);
  }

  function closeViewer() {
    clearTimeout(timer);
    $("storyViewer").hidden = true;
    $("storyImage").removeAttribute("src");
    shownStories = [];
    shownIndex = 0;
  }

  async function deleteStory() {
    const story = shownStories[shownIndex];
    if (!story || !user || story.uid !== user.uid || !confirm("Delete this story?")) return;
    try {
      await deleteDoc(doc(db, "stories", story.id));
      closeViewer();
    } catch (error) {
      $("storyStatus").textContent = `Could not delete story: ${error.message}`;
    }
  }

  async function uploadSelected(event) {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    $("addStoryBtn").disabled = true;
    $("storyStatus").textContent = "Uploading your story...";
    try {
      const imageUrl = await uploadImage(file);
      await addDoc(collection(db, "stories"), {
        uid: user.uid,
        name: user.displayName || "PicShare member",
        photoURL: user.photoURL || "",
        imageUrl,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + DAY)
      });
      $("storyStatus").textContent = "Your story is live for 24 hours!";
    } catch (error) {
      console.error("PicShare story upload failed:", error);
      $("storyStatus").textContent = error.message || "Could not upload story.";
    } finally {
      $("addStoryBtn").disabled = !user;
      event.target.value = "";
    }
  }

  function bind() {
    $("addStoryBtn").addEventListener("click", () => {
      if (!user) {
        $("storyStatus").textContent = "Sign in to add a story.";
        return;
      }
      $("storyFile").click();
    });
    $("storyFile").addEventListener("change", uploadSelected);
    $("storyClose").addEventListener("click", closeViewer);
    $("storyNext").addEventListener("click", next);
    $("storyPrevious").addEventListener("click", previous);
    $("deleteStoryBtn").addEventListener("click", deleteStory);
    document.addEventListener("keydown", e => {
      if ($("storyViewer").hidden) return;
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") previous();
    });
  }

  function listen(userNow) {
    if (stopListening) {
      stopListening();
      stopListening = null;
    }
    if (!userNow) {
      allStories = [];
      render();
      closeViewer();
      return;
    }
    const q = query(collection(db, "stories"), orderBy("createdAt", "desc"));
    stopListening = onSnapshot(q, snap => {
      allStories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    }, error => {
      console.error("PicShare Stories Firestore error:", error);
      $("storyStatus").textContent = `Stories could not load: ${error.message}`;
      moments.textContent = `Stories could not load: ${error.message}`;
    });
  }

  addStyles();
  buildControls();
  bind();
  onAuthStateChanged(auth, nextUser => {
    user = nextUser;
    $("addStoryBtn").disabled = !user;
    listen(user);
  });
}
