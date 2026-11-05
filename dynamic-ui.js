import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

// Reuse the Firebase app initialized by app.js.
const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

// Existing PicShare Supabase configuration.
const SUPABASE_URL = "https://rcfyzegwkopysdmrqiei.supabase.co";
const SUPABASE_KEY = "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";

let currentUser = null;
let stories = [];
let stopStories = null;
let activeStoryItems = [];
let selectedStory = 0;
let storyTimer = null;

const STORY_DURATION = 5000;
const STORY_LIFETIME = 24 * 60 * 60 * 1000;

// Find or create the Stories section.
let moments = document.getElementById("dynamicMoments");

if (!moments) {
  const appArea = document.getElementById("appArea");

  if (appArea) {
    const section = document.createElement("section");
    section.id = "momentsSection";
    section.innerHTML = `
      <h2>Community Stories</h2>
      <div id="dynamicMoments" class="moments-row"></div>
    `;

    appArea.prepend(section);
    moments = section.querySelector("#dynamicMoments");
  }
}

if (!moments) {
  console.error("PicShare Stories: Could not find the app area.");
} else {
  initializeStories();
}

function initializeStories() {
  const storySection =
    moments.closest("#momentsSection") || moments.parentElement;

  // Create the upload controls.
  const createArea = document.createElement("div");
  createArea.className = "story-create-area";
  createArea.innerHTML = `
    <button id="addStoryBtn" class="story-create-button" type="button">
      <span>＋</span>
      <strong>Add your story</strong>
    </button>

    <input
      id="storyFile"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      hidden
    >

    <p id="storyStatus" aria-live="polite"></p>
  `;

  storySection.appendChild(createArea);

  // Create the full-screen viewer.
  const viewer = document.createElement("div");
  viewer.id = "storyViewer";
  viewer.className = "story-viewer";
  viewer.hidden = true;

  viewer.innerHTML = `
    <button
      id="storyClose"
      class="story-close"
      type="button"
      aria-label="Close story"
    >×</button>

    <div class="story-viewer-card">
      <div class="story-progress">
        <span id="storyProgress"></span>
      </div>

      <div class="story-owner" id="storyOwner"></div>

      <img id="storyImage" alt="PicShare story">

      <div class="story-controls">
        <button id="storyPrevious" type="button" aria-label="Previous story">‹</button>
        <button id="storyNext" type="button" aria-label="Next story">›</button>
      </div>

      <button
        id="deleteStoryBtn"
        class="story-delete"
        type="button"
        hidden
      >Delete my story</button>
    </div>
  `;

  document.body.appendChild(viewer);

  addStoryStyles();
  connectStoryButtons();
  watchAuthentication();
}

// Add the Stories design.
function addStoryStyles() {
  if (document.getElementById("picShareStoryStyles")) return;

  const style = document.createElement("style");
  style.id = "picShareStoryStyles";

  style.textContent = `
    .moments-row {
      display: flex;
      gap: 14px;
      overflow-x: auto;
      padding: 8px 2px 16px;
    }

    .story-person {
      flex: 0 0 78px;
      text-align: center;
      border: 0;
      background: none;
      cursor: pointer;
      color: inherit;
    }

    .story-ring {
      width: 70px;
      height: 70px;
      padding: 3px;
      margin: auto;
      border-radius: 50%;
      background: linear-gradient(135deg,#20b8a4,#8165ef,#ff9d54);
    }

    .story-ring img,
    .story-initial {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
      border: 3px solid white;
    }

    .story-initial {
      display: grid;
      place-items: center;
      background: #e3f8f4;
      color: #101b2d;
      font-weight: 800;
      font-size: 23px;
    }

    .story-person-name {
      display: block;
      margin-top: 7px;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .story-create-area {
      margin: 8px 0 15px;
    }

    .story-create-button {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #e3f8f4;
      border: 1px solid #bcebe3;
      border-radius: 13px;
      padding: 10px 14px;
      color: #101b2d;
      cursor: pointer;
    }

    .story-create-button:disabled {
      opacity: .6;
      cursor: not-allowed;
    }

    .story-create-button span {
      font-size: 24px;
      color: #159e8e;
    }

    #storyStatus {
      font-size: 12px;
      color: #788596;
    }

    .story-viewer {
      position: fixed;
      inset: 0;
      background: #080d16f5;
      z-index: 2000;
      display: grid;
      place-items: center;
      padding: 15px;
    }

    .story-viewer[hidden] {
      display: none;
    }

    .story-viewer-card {
      position: relative;
      width: min(420px,100%);
      height: min(760px,90dvh);
      background: #101b2d;
      border-radius: 18px;
      overflow: hidden;
    }

    .story-viewer-card > img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .story-progress {
      position: absolute;
      top: 12px;
      left: 12px;
      right: 12px;
      height: 3px;
      background: #ffffff55;
      z-index: 2;
    }

    .story-progress span {
      display: block;
      width: 0;
      height: 100%;
      background: white;
    }

    .story-owner {
      position: absolute;
      top: 25px;
      left: 15px;
      right: 55px;
      color: white;
      z-index: 2;
      font-weight: 700;
      text-shadow: 0 1px 5px #000;
    }

    .story-close {
      position: absolute;
      top: 15px;
      right: 20px;
      z-index: 3;
      border: 0;
      background: #ffffff22;
      color: white;
      border-radius: 50%;
      width: 42px;
      height: 42px;
      font-size: 28px;
      cursor: pointer;
    }

    .story-controls {
      position: absolute;
      inset: 55px 0 55px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .story-controls button {
      width: 45px;
      height: 100%;
      border: 0;
      background: transparent;
      color: white;
      font-size: 42px;
      text-shadow: 0 1px 5px #000;
      cursor: pointer;
    }

    .story-delete {
      position: absolute;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      border: 0;
      border-radius: 10px;
      padding: 10px 15px;
      background: #d94040;
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    @media(max-width:600px) {
      .story-viewer {
        padding: 0;
      }

      .story-viewer-card {
        height: 100%;
        width: 100%;
        border-radius: 0;
        max-height: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// Upload a story image through the existing Supabase function.
async function uploadStoryImage(user, file) {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Choose a JPG, PNG or WEBP image.");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Your story image must be smaller than 2 MB.");
  }

  const token = await user.getIdToken();
  const form = new FormData();

  form.append("file", file, file.name);

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/dynamic-function`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "x-firebase-token": token
      },
      body: form
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.publicUrl) {
    throw new Error(result.error || "Story upload failed.");
  }

  return result.publicUrl;
}

// Group stories by their owners and display them.
function renderStories() {
  const now = Date.now();

  const activeStories = stories.filter(story => {
    const expiry = story.expiresAt?.toMillis?.() || 0;
    return story.imageUrl && expiry > now;
  });

  const grouped = new Map();

  activeStories.forEach(story => {
    if (!grouped.has(story.uid)) {
      grouped.set(story.uid, []);
    }

    grouped.get(story.uid).push(story);
  });

  moments.replaceChildren();

  if (grouped.size === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No active stories yet. Share the first one!";
    moments.appendChild(empty);
    return;
  }

  grouped.forEach((items, uid) => {
    const latest = items[0];

    const button = document.createElement("button");
    button.className = "story-person";
    button.type = "button";

    const ring = document.createElement("div");
    ring.className = "story-ring";

    if (latest.photoURL) {
      const avatar = document.createElement("img");
      avatar.src = latest.photoURL;
      avatar.alt = "";
      ring.appendChild(avatar);
    } else {
      const initial = document.createElement("span");
      initial.className = "story-initial";
      initial.textContent =
        (latest.name || "P").charAt(0).toUpperCase();

      ring.appendChild(initial);
    }

    const name = document.createElement("span");
    name.className = "story-person-name";
    name.textContent = latest.name || "Member";

    button.append(ring, name);

    button.addEventListener("click", () => {
      const userStories = activeStories.filter(
        item => item.uid === uid
      );

      openStory(userStories, 0);
    });

    moments.appendChild(button);
  });
}

// Open a user's stories.
function openStory(items, index) {
  if (!items.length || index < 0 || index >= items.length) return;

  activeStoryItems = items;
  selectedStory = index;

  const item = activeStoryItems[selectedStory];

  const viewer = document.getElementById("storyViewer");
  const image = document.getElementById("storyImage");
  const owner = document.getElementById("storyOwner");
  const deleteButton = document.getElementById("deleteStoryBtn");
  const progress = document.getElementById("storyProgress");

  clearTimeout(storyTimer);

  image.src = item.imageUrl;
  owner.textContent = item.name || "PicShare member";

  deleteButton.hidden = !(
    currentUser && currentUser.uid === item.uid
  );

  progress.style.transition = "none";
  progress.style.width = "0%";

  viewer.hidden = false;

  requestAnimationFrame(() => {
    progress.style.transition = `width ${STORY_DURATION}ms linear`;
    progress.style.width = "100%";
  });

  storyTimer = setTimeout(() => {
    showNextStory();
  }, STORY_DURATION);
}

function showNextStory() {
  if (selectedStory < activeStoryItems.length - 1) {
    openStory(activeStoryItems, selectedStory + 1);
  } else {
    closeStory();
  }
}

function showPreviousStory() {
  if (selectedStory > 0) {
    openStory(activeStoryItems, selectedStory - 1);
  } else {
    closeStory();
  }
}

function closeStory() {
  clearTimeout(storyTimer);

  const viewer = document.getElementById("storyViewer");
  const image = document.getElementById("storyImage");

  viewer.hidden = true;
  image.src = "";

  activeStoryItems = [];
  selectedStory = 0;
}

// Connect all buttons and upload controls.
function connectStoryButtons() {
  document.getElementById("storyClose")
    .addEventListener("click", closeStory);

  document.getElementById("storyNext")
    .addEventListener("click", showNextStory);

  document.getElementById("storyPrevious")
    .addEventListener("click", showPreviousStory);

  document.getElementById("addStoryBtn")
    .addEventListener("click", () => {
      if (!currentUser) {
        alert("Please sign in first.");
        return;
      }

      document.getElementById("storyFile").click();
    });

  document.getElementById("deleteStoryBtn")
    .addEventListener("click", deleteCurrentStory);

  document.getElementById("storyFile")
    .addEventListener("change", uploadSelectedStory);

  // Close viewer with Escape.
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeStory();
  });
}

// Delete the currently displayed story.
async function deleteCurrentStory() {
  const item = activeStoryItems[selectedStory];

  if (!item || !currentUser || item.uid !== currentUser.uid) {
    return;
  }

  if (!confirm("Delete this story?")) return;

  try {
    await deleteDoc(doc(db, "stories", item.id));
    closeStory();

    document.getElementById("storyStatus").textContent =
      "Story deleted.";
  } catch (error) {
    alert("Could not delete story: " + error.message);
  }
}

// Upload and publish a selected image.
async function uploadSelectedStory(event) {
  const file = event.target.files?.[0];
  const status = document.getElementById("storyStatus");
  const button = document.getElementById("addStoryBtn");

  if (!file) return;

  if (!currentUser) {
    status.textContent = "Please sign in first.";
    event.target.value = "";
    return;
  }

  button.disabled = true;
  status.textContent = "Uploading your story...";

  try {
    const imageUrl = await uploadStoryImage(currentUser, file);

    const expiry = Timestamp.fromMillis(
      Date.now() + STORY_LIFETIME
    );

    await addDoc(collection(db, "stories"), {
      uid: currentUser.uid,
      name: currentUser.displayName || "PicShare member",
      photoURL: currentUser.photoURL || "",
      imageUrl,
      createdAt: serverTimestamp(),
      expiresAt: expiry
    });

    status.textContent = "Your story is live for 24 hours!";
  } catch (error) {
    console.error("Story upload error:", error);
    status.textContent = error.message || "Could not upload story.";
  } finally {
    button.disabled = !currentUser;
    event.target.value = "";
  }
}

// Listen for sign-in and sign-out.
function watchAuthentication() {
  onAuthStateChanged(auth, user => {
    currentUser = user;

    const button = document.getElementById("addStoryBtn");
    button.disabled = !user;

    if (stopStories) {
      stopStories();
      stopStories = null;
    }

    if (!user) {
      stories = [];
      renderStories();
      closeStory();
      return;
    }

    const storiesQuery = query(
      collection(db, "stories"),
      orderBy("createdAt", "desc")
    );

    stopStories = onSnapshot(
      storiesQuery,
      snapshot => {
        stories = snapshot.docs.map(item => ({
          id: item.id,
          ...item.data()
        }));

        renderStories();
      },
      error => {
        console.error("Stories loading error:", error);

        document.getElementById("storyStatus").textContent =
          "Stories could not load: " + error.message;
      }
    );
  });
}
