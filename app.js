import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://rcfyzegwkopysdmrqiei.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);
const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let stopFeed = null;

function showMessage(message, error=false) {
  $("authMessage").textContent = message;
  $("authMessage").style.color = error ? "#b42318" : "";
}
function getInputs() {
  return { email: $("email").value.trim(), password: $("password").value, name: $("displayName").value.trim() };
}
$("signUpBtn").addEventListener("click", async () => {
  const {email,password,name} = getInputs();
  if (!email || password.length < 6 || !name) return showMessage("Enter an email, a password of at least 6 characters, and a display name.", true);
  try {
    const credential = await createUserWithEmailAndPassword(auth,email,password);
    await updateProfile(credential.user,{displayName:name});
    showMessage("Account created.");
  } catch (e) { showMessage(e.message, true); }
});
$("signInBtn").addEventListener("click", async () => {
  const {email,password} = getInputs();
  if (!email || !password) return showMessage("Enter your email and password.", true);
  try { await signInWithEmailAndPassword(auth,email,password); showMessage(""); }
  catch (e) { showMessage(e.message, true); }
});
$("signOutBtn").addEventListener("click", () => signOut(auth));

// Photo uploads are sent to a Supabase Edge Function, which verifies the Firebase ID token.
$("uploadPhotoBtn")?.addEventListener("click", async () => {
  const user = auth.currentUser;
  const file = $("photoFile").files?.[0];
  if (!user) return alert("Please sign in first.");
  if (!file) return alert("Choose a photo first.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return alert("Choose a JPG, PNG, or WEBP image.");
  if (file.size > 2 * 1024 * 1024) return alert("Please choose an image smaller than 2 MB.");
  const button = $("uploadPhotoBtn");
  button.disabled = true;
  $("photoUploadStatus").textContent = "Uploading…";
  try {
    const token = await user.getIdToken();
    const form = new FormData();
    form.append("file", file, file.name);
    const response = await fetch(`${SUPABASE_URL}/functions/v1/dynamic-function`, {
      method: "POST",
      headers: { "apikey": SUPABASE_PUBLISHABLE_KEY, "x-firebase-token": token },
      body: form
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Upload failed (${response.status})`);
    // Save the uploaded photo's public URL in Firestore so it appears in the live feed.
    await addDoc(collection(db, "posts"), {
      uid: user.uid,
      name: user.displayName || "PicShare member",
      caption: $("caption").value.trim(),
      imageUrl: result.publicUrl,
      storagePath: result.path,
      createdAt: serverTimestamp()
    });
    $("photoUploadStatus").textContent = "Photo uploaded and shared to your feed!";
    $("photoPreview").src = result.publicUrl;
    $("photoPreview").hidden = false;
    $("photoFile").value = "";
    $("caption").value = "";
    $("charCount").textContent = "0 / 220";
  } catch (error) {
    $("photoUploadStatus").textContent = "Upload failed: " + error.message;
  } finally { button.disabled = false; }
});
$("caption").addEventListener("input", () => $("charCount").textContent = `${$("caption").value.length} / 220`);
$("publishBtn").addEventListener("click", async () => {
  const user = auth.currentUser;
  const caption = $("caption").value.trim();
  if (!user) return;
  if (!caption) return alert("Write a message first.");
  $("publishBtn").disabled = true;
  try {
    await addDoc(collection(db,"posts"), {
      uid:user.uid, name:user.displayName || "PicShare member",
      caption, createdAt:serverTimestamp()
    });
    $("caption").value = ""; $("charCount").textContent = "0 / 220";
  } catch (e) { alert("Could not publish: " + e.message); }
  finally { $("publishBtn").disabled = false; }
});

function startFeed() {
  if (stopFeed) stopFeed();
  const q = query(collection(db,"posts"),orderBy("createdAt","desc"));
  stopFeed = onSnapshot(q, snapshot => {
    const docs = snapshot.docs;
    $("postCount").textContent = `${docs.length} ${docs.length===1?"post":"posts"}`;
    if (!docs.length) {
      $("feed").innerHTML = '<div class="card empty"><b>Your feed is waiting.</b> Be the first to share a message.</div>';
      return;
    }
    $("feed").innerHTML = docs.map(doc => {
      const p = doc.data();
      const date = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : "Just now";
      const photo = p.imageUrl ? `<img class="post-image" src="${safe(p.imageUrl)}" alt="Photo shared by ${safe(p.name || "PicShare member")}" loading="lazy">` : "";
      const caption = p.caption ? `<div class="post-caption">${safe(p.caption)}</div>` : "";
      return `<article class="card post"><div class="post-head"><span class="mini-avatar">${safe((p.name||"P").slice(0,1).toUpperCase())}</span><div><div class="post-author">${safe(p.name||"PicShare member")}</div><div class="post-date">${safe(date)}</div></div></div>${photo}${caption}</article>`;
    }).join("");
  }, error => { $("feed").textContent = "Could not load posts: " + error.message; });
}
onAuthStateChanged(auth, user => {
  $("authCard").hidden = !!user;
  $("appArea").hidden = !user;
  $("signOutBtn").hidden = !user;
  $("profileName").textContent = user ? (user.displayName || user.email) : "Not signed in";
  $("profileInitial").textContent = user ? (user.displayName || user.email || "P").slice(0,1).toUpperCase() : "P";
  if (user) startFeed(); else if (stopFeed) { stopFeed(); stopFeed = null; }
});
