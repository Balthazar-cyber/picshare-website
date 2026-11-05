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
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const SUPABASE_URL = "https://rcfyzegwkopysdmrqiei.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";

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
let stopComments = [];
let stopNotifications = null;

// PROFILE MENU

const profileMenuBtn = $("profileMenuBtn");
const profileDropdown = $("profileDropdown");
const profileMenuWrap = $("profileMenuWrap");

function closeProfileMenu() {
  if (profileDropdown) profileDropdown.hidden = true;
  profileMenuBtn?.setAttribute("aria-expanded", "false");
}

profileMenuBtn?.addEventListener("click", event => {
  event.stopPropagation();

  if (!profileDropdown) return;

  const opening = profileDropdown.hidden;
  profileDropdown.hidden = !opening;
  profileMenuBtn.setAttribute("aria-expanded", String(opening));
});

document.addEventListener("click", event => {
  if (profileMenuWrap && !profileMenuWrap.contains(event.target)) {
    closeProfileMenu();
  }
});

$("myProfileLink")?.addEventListener("click", () => {
  closeProfileMenu();

  $("profileCard")?.scrollIntoView({
    behavior: "smooth"
  });
});

$("editProfileLink")?.addEventListener("click", () => {
  closeProfileMenu();

  $("editProfileCard")?.scrollIntoView({
    behavior: "smooth"
  });
});

// NOTIFICATIONS

const notificationWrap = $("notificationWrap");
const notificationBtn = $("notificationBtn");
const notificationPanel = $("notificationPanel");
const notificationCount = $("notificationCount");
const notificationList = $("notificationList");
const markAllReadBtn = $("markAllReadBtn");

function closeNotificationPanel() {
  if (notificationPanel) notificationPanel.hidden = true;
}

notificationBtn?.addEventListener("click", event => {
  event.stopPropagation();

  if (!notificationPanel) return;

  notificationPanel.hidden = !notificationPanel.hidden;
});

document.addEventListener("click", event => {
  if (
    notificationWrap &&
    !notificationWrap.contains(event.target)
  ) {
    closeNotificationPanel();
  }
});

function renderNotifications(items) {
  if (!notificationList) return;

  const unread = items.filter(item => !item.read).length;

  if (notificationCount) {
    notificationCount.textContent =
      unread > 99 ? "99+" : String(unread);

    notificationCount.hidden = unread === 0;
  }

  if (!items.length) {
    notificationList.innerHTML =
      '<p class="muted">No notifications yet.</p>';
    return;
  }

  notificationList.innerHTML = items.map(item => {
    const actor = safe(item.actorName || "PicShare member");

    let message = "interacted with your post.";

    if (item.type === "like") {
      message = "liked your post.";
    } else if (item.type === "comment") {
      message = "commented on your post.";
    }

    const comment = item.commentText
      ? `<p>${safe(item.commentText)}</p>`
      : "";

    return `
      <div class="notification-item ${item.read ? "" : "unread"}">
        <strong>${actor}</strong>
        ${message}
        ${comment}
      </div>
    `;
  }).join("");
}

function startNotifications(user) {
  if (stopNotifications) {
    stopNotifications();
    stopNotifications = null;
  }

  const notificationsRef = query(
    collection(db, "users", user.uid, "notifications"),
    orderBy("createdAt", "desc")
  );

  stopNotifications = onSnapshot(
    notificationsRef,
    snapshot => {
      const items = snapshot.docs.map(notificationDoc => ({
        id: notificationDoc.id,
        ...notificationDoc.data()
      }));

      renderNotifications(items);
    },
    error => {
      console.error("Notification error:", error);

      if (notificationList) {
        notificationList.textContent =
          "Notifications could not load.";
      }
    }
  );
}

async function sendNotification(
  recipientUid,
  actorUid,
  actorName,
  postId,
  type,
  commentText = ""
) {
  if (!recipientUid || recipientUid === actorUid) return;

  try {
    await addDoc(
      collection(db, "users", recipientUid, "notifications"),
      {
        actorUid,
        actorName,
        postId,
        type,
        commentText,
        read: false,
        createdAt: serverTimestamp()
      }
    );
  } catch (error) {
    console.error("Could not send notification:", error);
  }
}

markAllReadBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;

  if (!user) return;

  markAllReadBtn.disabled = true;

  try {
    const snapshot = await getDocs(
      collection(db, "users", user.uid, "notifications")
    );

    const updates = snapshot.docs
      .filter(item => !item.data().read)
      .map(item =>
        updateDoc(item.ref, { read: true })
      );

    await Promise.all(updates);
  } catch (error) {
    console.error("Could not mark notifications as read:", error);
  } finally {
    markAllReadBtn.disabled = false;
  }
});

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

// CLEAN UP LISTENERS

function stopAllListeners() {
  stopLikes.forEach(stop => stop());
  stopLikes = [];

  stopComments.forEach(stop => stop());
  stopComments = [];
}

// PHOTO UPLOAD HELPER

async function uploadImage(user, file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG or WEBP image.");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 2 MB.");
  }

  const token = await user.getIdToken();
  const form = new FormData();

  form.append("file", file, file.name);

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/dynamic-function`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "x-firebase-token": token
      },
      body: form
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || `Upload failed (${response.status})`);
  }

  if (!result.publicUrl) {
    throw new Error("The upload did not return a photo URL.");
  }

  return result.publicUrl;
}

// PROFILE DISPLAY

async function loadProfile(user) {
  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);
  const profile = profileSnap.exists() ? profileSnap.data() : {};

  const name = profile.name || user.displayName || "PicShare member";
  const photo = profile.photoURL || user.photoURL || "";

  $("profileName").textContent = name;
  $("profileNameInput").value = name;
  $("profileInitial").textContent = name.charAt(0).toUpperCase();

  let avatar = $("profileDisplayPhoto");

  if (photo) {
    if (!avatar) {
      avatar = document.createElement("img");
      avatar.id = "profileDisplayPhoto";
      avatar.className = "profile-photo";
      avatar.alt = "Profile photo";

      $("profileCard")
        .querySelector(".profile-art")
        .appendChild(avatar);
    }

    avatar.src = photo;
    avatar.hidden = false;
    $("profileInitial").hidden = true;
  } else {
    if (avatar) avatar.remove();
    $("profileInitial").hidden = false;
  }
}

// SAVE PROFILE

$("saveProfileBtn").addEventListener("click", async () => {
  const user = auth.currentUser;

  if (!user) {
    $("profileStatus").textContent = "Please sign in first.";
    return;
  }

  const name = $("profileNameInput").value.trim();
  const file = $("profilePhotoInput").files?.[0];

  if (!name || name.length > 30) {
    $("profileStatus").textContent =
      "Enter a display name of 1–30 characters.";
    return;
  }

  const button = $("saveProfileBtn");
  button.disabled = true;
  $("profileStatus").textContent = "Saving profile...";

  try {
    let photoURL = user.photoURL || "";

    if (file) {
      photoURL = await uploadImage(user, file);
    }

    await updateProfile(user, {
      displayName: name,
      photoURL
    });

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name,
      photoURL
    }, { merge: true });

    $("profilePhotoInput").value = "";
    $("profileStatus").textContent = "Profile saved successfully!";

    await loadProfile(user);
  } catch (error) {
    $("profileStatus").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

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
      photoURL: "",
      createdAt: serverTimestamp()
    }, { merge: true });

    showMessage("Account created.");
  } catch (error) {
    showMessage(error.message, true);
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
  } catch (error) {
    showMessage(error.message, true);
  }
});

// SIGN OUT

$("signOutBtn").addEventListener("click", async () => {
  closeProfileMenu();
  closeNotificationPanel();
  await signOut(auth);
});

// PHOTO UPLOAD FOR POSTS

$("uploadPhotoBtn")?.addEventListener("click", async () => {
  const user = auth.currentUser;
  const file = $("photoFile").files?.[0];

  if (!user) return alert("Please sign in first.");
  if (!file) return alert("Choose a photo first.");

  const button = $("uploadPhotoBtn");
  button.disabled = true;
  $("photoUploadStatus").textContent = "Uploading...";

  try {
    const imageUrl = await uploadImage(user, file);

    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const profile = profileSnap.exists() ? profileSnap.data() : {};

    await addDoc(collection(db, "posts"), {
      uid: user.uid,
      name: profile.name || user.displayName || "PicShare member",
      photoURL: profile.photoURL || user.photoURL || "",
      caption: $("caption").value.trim(),
      imageUrl,
      createdAt: serverTimestamp()
    });

    $("photoUploadStatus").textContent =
      "Photo uploaded and shared to your feed!";

    $("photoPreview").src = imageUrl;
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

  if (!user) return alert("Please sign in first.");
  if (!caption) return alert("Write a message first.");

  if (caption.length > 220) {
    return alert("Posts cannot exceed 220 characters.");
  }

  const button = $("publishBtn");
  button.disabled = true;

  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const profile = profileSnap.exists() ? profileSnap.data() : {};

    await addDoc(collection(db, "posts"), {
      uid: user.uid,
      name: profile.name || user.displayName || "PicShare member",
      photoURL: profile.photoURL || user.photoURL || "",
      caption,
      createdAt: serverTimestamp()
    });

    $("caption").value = "";
    $("charCount").textContent = "0 / 220";
  } catch (error) {
    alert("Could not publish: " + error.message);
  } finally {
    button.disabled = false;
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
    const likeRef = doc(db, "posts", postId, "likes", user.uid);

    if (button.dataset.liked === "true") {
      await deleteDoc(likeRef);
    } else {
      await setDoc(likeRef, {
        uid: user.uid,
        createdAt: serverTimestamp()
      });

      // SEND LIKE NOTIFICATION

      const postSnap = await getDoc(doc(db, "posts", postId));

      if (postSnap.exists()) {
        const post = postSnap.data();

        const profileSnap = await getDoc(
          doc(db, "users", user.uid)
        );

        const profile = profileSnap.exists()
          ? profileSnap.data()
          : {};

        await sendNotification(
          post.uid,
          user.uid,
          profile.name || user.displayName || "PicShare member",
          postId,
          "like"
        );
      }
    }
  } catch (error) {
    alert("Could not update like: " + error.message);
  } finally {
    button.disabled = false;
  }
}

// ADD COMMENT

async function addComment(postId, input, button) {
  const user = auth.currentUser;
  const text = input.value.trim();

  if (!user) return alert("Please sign in to comment.");
  if (!text) return alert("Write a comment first.");

  if (text.length > 500) {
    return alert("Comments cannot exceed 500 characters.");
  }

  button.disabled = true;

  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const profile = profileSnap.exists() ? profileSnap.data() : {};

    await addDoc(
      collection(db, "posts", postId, "comments"),
      {
        uid: user.uid,
        name: profile.name || user.displayName || "PicShare member",
        photoURL: profile.photoURL || user.photoURL || "",
        text,
        createdAt: serverTimestamp()
      }
    );

    // SEND COMMENT NOTIFICATION

    const postSnap = await getDoc(doc(db, "posts", postId));

    if (postSnap.exists()) {
      const post = postSnap.data();

      await sendNotification(
        post.uid,
        user.uid,
        profile.name || user.displayName || "PicShare member",
        postId,
        "comment",
        text
      );
    }

    input.value = "";
  } catch (error) {
    alert("Could not add comment: " + error.message);
  } finally {
    button.disabled = false;
  }
}

// DELETE COMMENT

async function deleteComment(postId, commentId) {
  const user = auth.currentUser;

  if (!user) return;
  if (!confirm("Delete this comment?")) return;

  try {
    await deleteDoc(
      doc(db, "posts", postId, "comments", commentId)
    );
  } catch (error) {
    alert("Could not delete comment: " + error.message);
  }
}

// AVATAR HTML

function avatarHTML(name, photoURL, className) {
  if (photoURL) {
    return `
      <img
        class="${className}"
        src="${safe(photoURL)}"
        alt="${safe(name)}"
        loading="lazy"
      >
    `;
  }

  return `
    <span class="${className}">
      ${safe((name || "P").slice(0, 1).toUpperCase())}
    </span>
  `;
}

// FEED — INCLUDES OLDER POSTS WITHOUT TIMESTAMPS

function startFeed() {
  if (stopFeed) stopFeed();

  stopAllListeners();

  // Do not use orderBy here. It excludes documents without createdAt.
  const q = collection(db, "posts");

  stopFeed = onSnapshot(
    q,

    snapshot => {
      stopAllListeners();

      const posts = [...snapshot.docs].sort((a, b) => {
        const timeA = a.data().createdAt?.toMillis?.() || 0;
        const timeB = b.data().createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

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
          : "Earlier post";

        const photo = p.imageUrl
          ? `<img class="post-image" src="${safe(p.imageUrl)}" alt="Photo shared by ${safe(p.name || "PicShare member")}" loading="lazy">`
          : "";

        const caption = p.caption
          ? `<div class="post-caption">${safe(p.caption)}</div>`
          : "";

        return `
          <article class="card post">

            <div class="post-head">
              ${avatarHTML(p.name, p.photoURL, "mini-avatar")}
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

            <div class="post-actions">
              <button
                type="button"
                class="like-button"
                data-post-id="${safe(postId)}"
                data-liked="false"
              >
                🤍 Like <span class="like-count">0</span>
              </button>
            </div>

            <div class="comments-section">
              <div class="comments-title">💬 Comments</div>

              <div
                class="comments-list"
                data-comments-post="${safe(postId)}"
              >
                <span class="muted">Loading comments...</span>
              </div>

              <form
                class="comment-form"
                data-comment-form="${safe(postId)}"
              >
                <input
                  type="text"
                  maxlength="500"
                  placeholder="Write a comment..."
                  aria-label="Write a comment"
                  required
                >

                <button type="submit">Send</button>
              </form>
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

      // CONNECT COMMENT FORMS

      document.querySelectorAll(".comment-form").forEach(form => {
        form.addEventListener("submit", event => {
          event.preventDefault();

          addComment(
            form.dataset.commentForm,
            form.querySelector("input"),
            form.querySelector("button")
          );
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
              ? likesSnapshot.docs.some(like => like.id === user.uid)
              : false;

            button.dataset.liked = String(liked);

            button.innerHTML =
              `${liked ? "❤️ Unlike" : "🤍 Like"} <span class="like-count">${likesSnapshot.size}</span>`;
          },

          error => console.error("Likes could not load:", error)
        );

        stopLikes.push(stop);
      });

      // LIVE COMMENTS

      posts.forEach(postDoc => {
        const postId = postDoc.id;

        const commentsRef = query(
          collection(db, "posts", postId, "comments"),
          orderBy("createdAt", "asc")
        );

        const stop = onSnapshot(
          commentsRef,

          commentsSnapshot => {
            const container = document.querySelector(
              `[data-comments-post="${postId}"]`
            );

            if (!container) return;

            if (commentsSnapshot.empty) {
              container.innerHTML =
                '<p class="muted">No comments yet. Be the first!</p>';
              return;
            }

            container.innerHTML = commentsSnapshot.docs.map(commentDoc => {
              const c = commentDoc.data();
              const commentId = commentDoc.id;

              const canDelete =
                auth.currentUser &&
                (
                  auth.currentUser.uid === c.uid ||
                  auth.currentUser.uid === "VXDMuU17gifoBqTkbpC55Xre9242"
                );

              return `
                <div class="comment-item">
                  ${avatarHTML(c.name, c.photoURL, "comment-avatar")}

                  <div class="comment-content">
                    <strong>${safe(c.name || "PicShare member")}</strong>
                    <p>${safe(c.text)}</p>
                  </div>

                  ${canDelete ? `
                    <button
                      class="delete-comment"
                      type="button"
                      data-comment-id="${safe(commentId)}"
                      data-post-id="${safe(postId)}"
                    >Delete</button>
                  ` : ""}

                </div>
              `;
            }).join("");

            container.querySelectorAll(".delete-comment").forEach(button => {
              button.addEventListener("click", () => {
                deleteComment(
                  button.dataset.postId,
                  button.dataset.commentId
                );
              });
            });
          },

          error => {
            console.error("Comments could not load:", error);

            const container = document.querySelector(
              `[data-comments-post="${postId}"]`
            );

            if (container) {
              container.textContent = "Could not load comments.";
            }
          }
        );

        stopComments.push(stop);
      });
    },

    error => {
      console.error("Feed error:", error);

      $("feed").textContent =
        "Could not load posts: " + error.message;
    }
  );
}

// AUTHENTICATION STATE

onAuthStateChanged(auth, async user => {
  $("authCard").hidden = !!user;
  $("appArea").hidden = !user;
  $("signOutBtn").hidden = !user;

  if (profileMenuWrap) {
    profileMenuWrap.hidden = !user;
  }

  if (notificationWrap) {
    notificationWrap.hidden = !user;
  }

  closeProfileMenu();
  closeNotificationPanel();

  if (user) {
    startFeed();
    startNotifications(user);

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const profile = userSnap.exists() ? userSnap.data() : {};

      await setDoc(userRef, {
        uid: user.uid,
        name: profile.name || user.displayName || "PicShare member",
        photoURL: profile.photoURL || user.photoURL || ""
      }, { merge: true });

      await loadProfile(user);
    } catch (error) {
      console.error("Profile loading error:", error);

      $("profileStatus").textContent =
        "Profile could not load: " + error.message;
    }
  } else {
    $("profileName").textContent = "Not signed in";
    $("profileNameInput").value = "";

    const oldAvatar = $("profileDisplayPhoto");
    if (oldAvatar) oldAvatar.remove();

    $("profileInitial").hidden = false;
    $("profileInitial").textContent = "P";

    if (stopFeed) {
      stopFeed();
      stopFeed = null;
    }

    if (stopNotifications) {
      stopNotifications();
      stopNotifications = null;
    }

    stopAllListeners();

    if (notificationCount) {
      notificationCount.textContent = "0";
      notificationCount.hidden = true;
    }

    if (notificationList) {
      notificationList.innerHTML =
        '<p class="muted">Sign in to see notifications.</p>';
    }
  }
});
