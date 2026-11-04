import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const SUPABASE_URL = "https://rcfyzegwkopysdmrqiei.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

const safe = value =>
  String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

let stopFeed = null;
let stopLikes = [];

// MESSAGES
function showMessage(message, error = false) {
  $("authMessage").textContent = message;
  $("authMessage").style.color = error ? "#b42318" : "";
}

function getInputs() {
  return {
    email: $("email").value.trim(),
    password: $("password").value,
    name: $("displayName").value.trim()
  };
}

// SIGN UP
$("signUpBtn").addEventListener("click", async () => {
  const { email, password, name } = getInputs();

  if (!email || password.length < 6 || !name) {
    return showMessage(
      "Enter an email, a password of at least 6 characters, and a display name.",
      true
    );
  }

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await updateProfile(credential.user, {
      displayName: name
    });

    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid,
      name,
      createdAt: serverTimestamp()
    }, { merge: true });

    showMessage("Account created.");

  } catch (e) {
    showMessage(e.message, true);
  }
});

// SIGN IN
$("signInBtn").addEventListener("click", async () => {
  const { email, password } = getInputs();

  if (!email || !password) {
    return showMessage("Enter your email and password.", true);
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showMessage("");

  } catch (e) {
    showMessage(e.message, true);
  }
});

// SIGN OUT
$("signOutBtn").addEventListener("click", () => signOut(auth));

// PHOTO UPLOAD
$("uploadPhotoBtn")?.addEventListener("click", async () => {
  const user = auth.currentUser;
  const file = $("photoFile").files?.[0];

  if (!user) return alert("Please sign in first.");
  if (!file) return alert("Choose a photo first.");

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return alert("Choose a JPG, PNG, or WEBP image.");
  }

  if (file.size > 2 * 1024 * 1024) {
    return alert("Please choose an image smaller than 2 MB.");
  }

  const button = $("uploadPhotoBtn");
  button.disabled = true;
  $("photoUploadStatus").textContent = "Uploading…";

  try {
    const token = await user.getIdToken();
    const form = new FormData();

    form.append("file", file, file.name);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/dynamic-function`,
      {
        method: "POST",
        headers: {
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "x-firebase-token": token
        },
        body: form
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `Upload failed (${response.status})`);
    }

    await addDoc(collection(db, "posts"), {
      uid: user.uid,
      name: user.displayName || "PicShare member",
      caption: $("caption").value.trim(),
      imageUrl: result.publicUrl,
      storagePath: result.path,
      createdAt: serverTimestamp()
    });

    $("photoUploadStatus").textContent =
      "Photo uploaded and shared to your feed!";

    $("photoPreview").src = result.publicUrl;
    $("photoPreview").hidden = false;
    $("photoFile").value = "";
    $("caption").value = "";
    $("charCount").textContent = "0 / 220";

  } catch (error) {
    $("photoUploadStatus").textContent =
      "Upload failed: " + error.message;

  } finally {
    button.disabled = false;
  }
});

// CAPTION COUNTER
$("caption").addEventListener("input", () => {
  $("charCount").textContent =
    `${$("caption").value.length} / 220`;
});

// TEXT POSTS
$("publishBtn").addEventListener("click", async () => {
  const user = auth.currentUser;
  const caption = $("caption").value.trim();

  if (!user) return;
  if (!caption) return alert("Write a message first.");

  $("publishBtn").disabled = true;

  try {
    await addDoc(collection(db, "posts"), {
      uid: user.uid,
      name: user.displayName || "PicShare member",
      caption,
      createdAt: serverTimestamp()
    });

    $("caption").value = "";
    $("charCount").textContent = "0 / 220";

  } catch (e) {
    alert("Could not publish: " + e.message);

  } finally {
    $("publishBtn").disabled = false;
  }
});

// LIKE AND UNLIKE
async function toggleLike(postId, button) {
  const user = auth.currentUser;

  if (!user) {
    return alert("Please sign in to like posts.");
  }

  button.disabled = true;

  try {
    const likeRef = doc(
      db,
      "posts",
      postId,
      "likes",
      user.uid
    );

    if (button.dataset.liked === "true") {
      await deleteDoc(likeRef);

    } else {
      await setDoc(likeRef, {
        uid: user.uid,
        createdAt: serverTimestamp()
      });
    }

  } catch (error) {
    alert("Could not update like: " + error.message);

  } finally {
    button.disabled = false;
  }
}

// FEED
function startFeed() {
  if (stopFeed) stopFeed();

  stopLikes.forEach(stop => stop());
  stopLikes = [];

  const q = query(
    collection(db, "posts"),
    orderBy("createdAt", "desc")
  );

  stopFeed = onSnapshot(q, snapshot => {
    stopLikes.forEach(stop => stop());
    stopLikes = [];

    const posts = snapshot.docs;

    $("postCount").textContent =
      `${posts.length} ${posts.length === 1 ? "post" : "posts"}`;

    if (!posts.length) {
      $("feed").innerHTML =
        '<div class="card empty"><b>Your feed is waiting.</b> Be the first to share a message.</div>';
      return;
    }

    $("feed").innerHTML = posts.map(postDoc => {
      const p = postDoc.data();
      const postId = postDoc.id;

      const date = p.createdAt?.toDate
        ? p.createdAt.toDate().toLocaleString()
        : "Just now";

      const photo = p.imageUrl
        ? `<img class="post-image" src="${safe(p.imageUrl)}" alt="Photo shared by ${safe(p.name || "PicShare member")}" loading="lazy">`
        : "";

      const caption = p.caption
        ? `<div class="post-caption">${safe(p.caption)}</div>`
        : "";

      return `
        <article class="card post">

          <div class="post-head">
            <span class="mini-avatar">
              ${safe((p.name || "P").slice(0, 1).toUpperCase())}
            </span>

            <div>
              <div class="post-author">
                ${safe(p.name || "PicShare member")}
              </div>

              <div class="post-date">
                ${safe(date)}
              </div>
            </div>
          </div>

          ${photo}
          ${caption}

          <div class="post-actions" style="margin-top:12px;">
            <button
              type="button"
              class="like-button"
              data-post-id="${safe(postId)}"
              data-liked="false"
              style="border:0;background:transparent;padding:8px 12px;border-radius:20px;cursor:pointer;font-size:15px;"
            >
              🤍 Like <span class="like-count">0</span>
            </button>
          </div>

        </article>
      `;
    }).join("");

    // CONNECT LIKE BUTTONS
    document.querySelectorAll(".like-button").forEach(button => {
      button.addEventListener("click", () => {
        toggleLike(button.dataset.postId, button);
      });
    });

    // LIVE LIKE COUNTS
    posts.forEach(postDoc => {
      const postId = postDoc.id;

      const likesRef = collection(
        db,
        "posts",
        postId,
        "likes"
      );

      const stop = onSnapshot(
        likesRef,
        likesSnapshot => {
          const button = [...document.querySelectorAll(".like-button")]
            .find(item => item.dataset.postId === postId);

          if (!button) return;

          const user = auth.currentUser;

          const liked = user
            ? likesSnapshot.docs.some(
                like => like.id === user.uid
              )
            : false;

          button.dataset.liked = String(liked);

          button.innerHTML =
            `${liked ? "❤️ Unlike" : "🤍 Like"} <span class="like-count">${likesSnapshot.size}</span>`;
        },
        error => {
          console.error("Likes could not load:", error);
        }
      );

      stopLikes.push(stop);
    });

  }, error => {
    $("feed").textContent =
      "Could not load posts: " + error.message;
  });
}

// AUTHENTICATION STATE
onAuthStateChanged(auth, async user => {
  $("authCard").hidden = !!user;
  $("appArea").hidden = !user;
  $("signOutBtn").hidden = !user;

  $("profileName").textContent = user
    ? (user.displayName || user.email)
    : "Not signed in";

  $("profileInitial").textContent = user
    ? (user.displayName || user.email || "P").slice(0, 1).toUpperCase()
    : "P";

  if (user) {
    try {
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: user.displayName || "PicShare member"
      }, { merge: true });

      startFeed();

    } catch (error) {
      console.error("Could not load user profile:", error);
      $("feed").textContent = "Could not load your profile.";
    }

  } else {
    if (stopFeed) {
      stopFeed();
      stopFeed = null;
    }

    stopLikes.forEach(stop => stop());
    stopLikes = [];
  }
});

After pasting

1. Commit the changes in GitHub.
2. Wait for deployment.
3. Open PicShare and sign in.
4. Test liking and unliking a post.

Important: This code assumes the Firestore Likes rules we added earlier are published. I haven't independently run this code against your Firebase project, so keep your backup until all tests pass.
