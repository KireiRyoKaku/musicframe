// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA9ed67zvgz6MPBvnKbYK2QA0QDe1q70bk",
  authDomain: "musicframeappstorage.firebaseapp.com",
  projectId: "musicframeappstorage",
  storageBucket: "musicframeappstorage.firebasestorage.app",
  messagingSenderId: "927515116326",
  appId: "1:927515116326:web:b3195cc58d0a9e437df7e7",
  measurementId: "G-HC0S211F5B",
};

// YouTube Data API key - Get one at: https://console.developers.google.com/apis/credentials
const YOUTUBE_API_KEY = "AIzaSyASjzjMY9UoghIqZk_oRQqSodcsRz5Oe7o";

// Feature tooltip rotation
const features = [
  "Add albums",
  "Join discussions",
  "Insert YouTube links",
  /* Mark Rate tracks as new with a small superscript flag */
  'Rate tracks <sup class="feature-new">NEW</sup>',
  'Take Notes <sup class="feature-new">NEW</sup>',
  'Make notes visible to others <sup class="feature-new">NEW</sup>',
  "Dive deep into music",
  "Vote on albums",
  "Lock your album",
  "Edit album details",
  "View track ratings",
  "Navigate months",
  "Leave discussions",
  "Delete your albums",
  "See moderator actions",
  "Fetch track listings",
  "Manage external links",
  "Real-time voting updates",
];
let currentFeatureIndex = 0;

function rotateFeatureTooltip() {
  const loginTooltip = document.getElementById("loginFeatureTooltip");
  const mainTooltip = document.getElementById("mainFeatureTooltip");

  currentFeatureIndex = (currentFeatureIndex + 1) % features.length;
  const newFeature = features[currentFeatureIndex];

  if (loginTooltip) {
    loginTooltip.style.animation = "none";
    setTimeout(() => {
      loginTooltip.innerHTML = newFeature;
      loginTooltip.style.animation = "fadeInOut 0.5s ease-in-out";
    }, 10);
  }

  if (mainTooltip) {
    mainTooltip.style.animation = "none";
    setTimeout(() => {
      mainTooltip.innerHTML = newFeature;
      mainTooltip.style.animation = "fadeInOut 0.5s ease-in-out";
    }, 10);
  }
}

// Start rotating features every 5 seconds
setInterval(rotateFeatureTooltip, 1500);

// Initialize Firebase
let db;
let auth;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();
  console.log("Firebase initialized successfully");

  // Monitor auth state
  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log("Firebase Auth state: User signed in", user.email);
    } else {
      console.log("Firebase Auth state: No user signed in");
    }
  });

  // Load moderators from Firestore
  loadModerators();
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// Month data structure - albums now loaded from Firebase
const monthData = {
  "2025-12": {
    participants: [],
    albums: [],
  },
  "2025-11": {
    participants: [],
    albums: [],
  },
  "2026-01": {
    participants: [],
    albums: [],
  },
};

// Current date tracking
let currentDate = new Date();
let currentUser = null;

// Initialize global participants array to prevent undefined errors
window.currentParticipants = [];

// Store consistent emoji assignments per user email
const userEmojiMap = {};

// Cached DOM elements for performance
const DOMCache = {
  elements: {},
  get(id) {
    if (!this.elements[id]) {
      this.elements[id] = document.getElementById(id);
    }
    return this.elements[id];
  },
  clear() {
    this.elements = {};
  },
};

// Utility: Debounce function for performance optimization
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Utility function to generate month key
function getMonthKey(date = currentDate) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// Album cover gradients (constant)
const ALBUM_GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
];

// Animal emojis for fallback avatars (constant)
const ANIMAL_EMOJIS = [
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🐦",
  "🦆",
  "🦉",
];

// Function to get consistent animal emoji for a user
function getAnimalEmojiForUser(email) {
  if (userEmojiMap[email]) {
    return userEmojiMap[email];
  }

  // Use email hash to consistently assign same emoji
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % ANIMAL_EMOJIS.length;
  const emoji = ANIMAL_EMOJIS[index];

  userEmojiMap[email] = emoji;
  return emoji;
}

// Month names
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Migration function to fetch tracks for existing albums
async function migrateAlbumsWithTracks() {
  if (!db) {
    await showCustomAlert("Database not initialized");
    return;
  }

  // Check if user is moderator
  if (!currentUser || !isModerator(currentUser.email)) {
    await showCustomAlert("Only moderators can run this migration.");
    return;
  }

  const confirmMigrate = await showCustomConfirm(
    "This will fetch and add track listings to all existing albums that have YouTube Music links. Continue?",
    "Migrate Tracks"
  );
  if (!confirmMigrate) return;

  try {
    // Get all albums
    const snapshot = await db.collection("albums").get();
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const doc of snapshot.docs) {
      const album = doc.data();

      // Skip if already has tracks or no playlistId/youtubeUrl
      if (album.tracks && album.tracks.length > 0) {
        console.log(`Skipping ${album.title} - already has tracks`);
        skipped++;
        continue;
      }

      // Extract playlist ID from youtubeUrl if playlistId not stored
      let playlistId = album.playlistId;
      if (!playlistId && album.youtubeUrl) {
        const match = album.youtubeUrl.match(/[?&]list=([^&]+)/);
        if (match) {
          playlistId = match[1];
        }
      }

      if (!playlistId) {
        console.log(`Skipping ${album.title} - no playlist ID`);
        skipped++;
        continue;
      }

      console.log(`Fetching tracks for: ${album.title}`);

      // Fetch tracks
      const tracks = await fetchPlaylistTracks(playlistId);

      if (tracks.length > 0) {
        // Update album with tracks
        await db.collection("albums").doc(doc.id).update({
          tracks: tracks,
          playlistId: playlistId,
        });
        console.log(`Updated ${album.title} with ${tracks.length} tracks`);
        updated++;
      } else {
        console.log(`No tracks found for ${album.title}`);
        failed++;
      }

      // Small delay to avoid hitting API rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await showCustomAlert(
      `Migration complete!\nUpdated: ${updated}\nSkipped: ${skipped}\nFailed: ${failed}`,
      "Migration Complete"
    );

    // Reload albums to show tracks
    loadAlbums();
  } catch (error) {
    console.error("Migration error:", error);
    await showCustomAlert(
      `Migration failed: ${error.message}`,
      "Migration Failed"
    );
  }
}

// Allowed users - Add emails of people who can access the site
const ALLOWED_USERS = [
  "hadzhizhekov.mihail@gmail.com",
  "pesa.voivoda@gmail.com",
  "cls1337@gmail.com",
  "st.takov@googlemail.com",
  "ryokaku23@googlemail.com",
  // Add more emails here
];

// Moderator users - Can delete any album
// Moderator configuration - will be loaded from Firestore
let MODERATORS = [
  "st.takov@googlemail.com", // Fallback in case Firestore fails
];

// Load moderators from Firestore
async function loadModerators() {
  try {
    const doc = await db.collection("config").doc("moderators").get();
    if (doc.exists && doc.data().emails) {
      MODERATORS = doc.data().emails;
      console.log("Moderators loaded from Firestore:", MODERATORS);
    } else {
      console.log("No moderators document found, using default:", MODERATORS);
    }
  } catch (error) {
    console.warn(
      "Could not load moderators from Firestore (using defaults):",
      error.message
    );
    // Keep using the default MODERATORS array defined above
  }
}

// Get moderator first names
function getModeratorNames() {
  const participants = window.currentParticipants || [];
  const moderatorNames = [];

  MODERATORS.forEach((email) => {
    const participant = participants.find((p) => p.email === email);
    if (participant) {
      // Extract first name from full name
      const firstName = participant.name.split(" ")[0];
      moderatorNames.push(firstName);
    }
  });

  return moderatorNames.length > 0 ? moderatorNames : ["a moderator"];
}

// Check if user is a moderator
function isModerator(email) {
  return MODERATORS.includes(email);
}

// Google Sign-In callback
async function handleGoogleSignIn() {
  console.log("Current origin:", window.location.origin);
  console.log("Current hostname:", window.location.hostname);

  if (!auth) {
    await showCustomAlert(
      "Authentication not initialized. Please refresh the page."
    );
    return;
  }

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");

    console.log("Starting sign-in with popup...");
    const result = await auth.signInWithPopup(provider);
    const user = result.user;

    // Check if user is in the allowed list
    if (!ALLOWED_USERS.includes(user.email)) {
      await auth.signOut();
      await showCustomAlert(
        "Access denied. Your email is not authorized to use this application.",
        "Access Denied"
      );
      console.warn("Unauthorized login attempt:", user.email);
      return;
    }

    currentUser = {
      name: sanitizeText(user.displayName),
      email: sanitizeText(user.email),
      picture: user.photoURL,
    };

    // Store minimal session info
    localStorage.setItem("user", JSON.stringify(currentUser));

    console.log("User signed in successfully:", currentUser.email);

    // Show main content and hide login
    console.log("Calling showMainContent...");
    showMainContent();
    console.log("showMainContent completed");

    // Force update display
    await updateDisplay();
  } catch (error) {
    console.error("Sign-in error:", error);

    if (error.code === "auth/popup-blocked") {
      await showCustomAlert(
        "Pop-up was blocked. Please allow pop-ups for this site and try again.",
        "Pop-up Blocked"
      );
    } else if (error.code === "auth/popup-closed-by-user") {
      console.log("User closed the sign-in popup");
    } else {
      await showCustomAlert(`Sign-in failed: ${error.message}`, "Error");
    }
  }
}

// Parse JWT token (ONLY use for Google-verified tokens from handleCredentialResponse)
// WARNING: This does NOT verify signature - only use with trusted sources
function parseJwt(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
  return JSON.parse(jsonPayload);
}

// Sanitize text to prevent XSS attacks
function sanitizeText(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Show main content after login
function showMainContent() {
  console.log("showMainContent called, currentUser:", currentUser);

  const loginOverlay = document.getElementById("loginOverlay");
  const mainContent = document.getElementById("mainContent");
  const userName = document.getElementById("userName");
  const userImage = document.getElementById("userImage");
  const moderatorBadge = document.getElementById("moderatorBadge");
  const moderatorActions = document.getElementById("moderatorActions");

  console.log("Elements found:", {
    loginOverlay: !!loginOverlay,
    mainContent: !!mainContent,
    userName: !!userName,
    userImage: !!userImage,
  });

  if (loginOverlay) loginOverlay.classList.add("hidden");
  if (mainContent) mainContent.classList.remove("hidden");

  // Update user info display (textContent is safe from XSS)
  if (userName) userName.textContent = currentUser.name;
  if (userImage) userImage.src = currentUser.picture;

  // Show moderator badge if user is a moderator
  if (isModerator(currentUser.email)) {
    if (moderatorBadge) moderatorBadge.classList.remove("hidden");
    if (moderatorActions) moderatorActions.classList.remove("hidden");
  } else {
    if (moderatorBadge) moderatorBadge.classList.add("hidden");
    if (moderatorActions) moderatorActions.classList.add("hidden");
  }

  console.log("Main content should now be visible");

  // Initialize the main app
  updateDisplay();

  // Listen for voting state changes
  setupVotingListener();
}

// Custom Alert System
function showCustomAlert(message, title = "Musicframe") {
  return new Promise((resolve) => {
    const modal = document.getElementById("customAlertModal");
    const titleEl = document.getElementById("customAlertTitle");
    const messageEl = document.getElementById("customAlertMessage");
    const buttonsContainer = document.getElementById("customAlertButtons");
    const closeBtn = document.getElementById("closeCustomAlert");

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Single OK button
    buttonsContainer.innerHTML =
      '<button class="modal-btn modal-btn-primary" id="customAlertOk">OK</button>';

    const okBtn = document.getElementById("customAlertOk");

    const closeModal = () => {
      modal.classList.add("hidden");
      resolve(true);
    };

    okBtn.onclick = closeModal;
    closeBtn.onclick = closeModal;

    modal.classList.remove("hidden");
  });
}

// Custom Confirm System
function showCustomConfirm(message, title = "Confirm") {
  return new Promise((resolve) => {
    const modal = document.getElementById("customAlertModal");
    const titleEl = document.getElementById("customAlertTitle");
    const messageEl = document.getElementById("customAlertMessage");
    const buttonsContainer = document.getElementById("customAlertButtons");
    const closeBtn = document.getElementById("closeCustomAlert");

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Cancel and Confirm buttons
    buttonsContainer.innerHTML = `
            <button class="modal-btn modal-btn-cancel" id="customConfirmCancel">Cancel</button>
            <button class="modal-btn modal-btn-primary" id="customConfirmOk">OK</button>
        `;

    const cancelBtn = document.getElementById("customConfirmCancel");
    const okBtn = document.getElementById("customConfirmOk");

    const closeModal = (result) => {
      modal.classList.add("hidden");
      resolve(result);
    };

    okBtn.onclick = () => closeModal(true);
    cancelBtn.onclick = () => closeModal(false);
    closeBtn.onclick = () => closeModal(false);

    modal.classList.remove("hidden");
  });
}

// Small toast notification (non-blocking)
function showToast(message, duration = 1800) {
  try {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.style.position = "fixed";
      container.style.right = "20px";
      container.style.bottom = "20px";
      container.style.zIndex = "99999";
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.gap = "8px";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "app-toast";
    // wrap message in a span so we can apply clipped-gradient text via CSS
    const span = document.createElement("span");
    span.className = "toast-text";
    span.textContent = message;
    toast.appendChild(span);
    // background and color moved to CSS (.app-toast) so theme can be styled centrally
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 6px 18px rgba(0,0,0,0.4)";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "opacity 160ms ease, transform 160ms ease";
    container.appendChild(toast);

    // animate in
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    // remove after duration
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => {
        toast.remove();
        // if container empty, remove it
        if (container && container.children.length === 0) container.remove();
      }, 180);
    }, duration);
  } catch (e) {
    console.log("Toast error:", e);
  }
}

// Setup real-time listener for voting state
function setupVotingListener() {
  const monthKey = getMonthKey();

  // Listen to albums collection for voting state changes
  db.collection("albums")
    .where("monthKey", "==", monthKey)
    .onSnapshot(
      (snapshot) => {
        const wasActive = window.currentVotingActive;
        let isActive = false;

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.votingActive === true) {
            isActive = true;
          }
        });

        window.currentVotingActive = isActive;

        // If voting just started, show overlay
        if (!wasActive && isActive) {
          showVotingOverlay();
          loadAlbums(monthKey);
        } else if (wasActive !== isActive) {
          // Reload if state changed
          loadAlbums(monthKey);
        }
      },
      (error) => {
        console.log("Albums listener error:", error);
        window.currentVotingActive = false;
      }
    );
}

// Sign out
function signOut() {
  // Clear user session
  localStorage.removeItem("user");
  currentUser = null;

  // Show login overlay
  const loginOverlay = DOMCache.get("loginOverlay");
  const mainContent = DOMCache.get("mainContent");

  loginOverlay?.classList.remove("hidden");
  mainContent?.classList.add("hidden");

  // Sign out from Google
  google.accounts.id.disableAutoSelect();
}

// Initialize the page
async function init() {
  // Check if user is already logged in
  const storedUser = localStorage.getItem("user");
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
    showMainContent();
  }

  setupEventListeners();
}

// Setup event listeners
function setupEventListeners() {
  console.log("Setting up event listeners...");

  // Google Sign-In button
  const googleSignInBtn = document.getElementById("googleSignInBtn");
  console.log("Google Sign-In button found:", !!googleSignInBtn);

  if (googleSignInBtn) {
    googleSignInBtn.addEventListener("click", () => {
      console.log("Google Sign-In button clicked!");
      handleGoogleSignIn();
    });
  }

  document
    .getElementById("prevMonth")
    ?.addEventListener("click", () => navigateMonth(-1));
  document
    .getElementById("nextMonth")
    ?.addEventListener("click", () => navigateMonth(1));
  document.getElementById("signOutBtn")?.addEventListener("click", signOut);
  document
    .getElementById("joinDiscussionBtn")
    ?.addEventListener("click", joinDiscussion);
  document
    .getElementById("leaveDiscussionBtn")
    ?.addEventListener("click", leaveDiscussion);
  document
    .getElementById("addAlbumBtn")
    ?.addEventListener("click", showAddAlbumModal);
  document
    .getElementById("migrateTracksBtn")
    ?.addEventListener("click", migrateAlbumsWithTracks);
  document
    .getElementById("startVotingBtn")
    ?.addEventListener("click", showVotingModal);
  document
    .getElementById("submitVotesBtn")
    ?.addEventListener("click", submitVotes);
  document
    .getElementById("endVotingBtn")
    ?.addEventListener("click", showEndVotingConfirmModal);
  document
    .getElementById("resetVotingBtn")
    ?.addEventListener("click", showResetVotingConfirmModal);

  // Album Modal event listeners
  document
    .getElementById("closeAddAlbumModal")
    ?.addEventListener("click", closeAddAlbumModal);
  document
    .getElementById("cancelAddAlbum")
    ?.addEventListener("click", closeAddAlbumModal);
  document
    .getElementById("confirmAddAlbum")
    ?.addEventListener("click", processAddAlbum);

  // Close modal on overlay click
  document.getElementById("addAlbumModal")?.addEventListener("click", (e) => {
    if (e.target.id === "addAlbumModal") {
      closeAddAlbumModal();
    }
  });

  // Submit on Enter key
  document
    .getElementById("albumLinkInput")
    ?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        processAddAlbum();
      }
    });

  // Lock Modal event listeners
  document
    .getElementById("closeLockConfirmModal")
    ?.addEventListener("click", closeLockConfirmModal);
  document
    .getElementById("cancelLock")
    ?.addEventListener("click", closeLockConfirmModal);
  document
    .getElementById("confirmLock")
    ?.addEventListener("click", processLockAlbum);

  // Close modal on overlay click
  document
    .getElementById("lockConfirmModal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "lockConfirmModal") {
        closeLockConfirmModal();
      }
    });

  // Unlock Modal event listeners
  document
    .getElementById("closeUnlockConfirmModal")
    ?.addEventListener("click", closeUnlockConfirmModal);
  document
    .getElementById("cancelUnlock")
    ?.addEventListener("click", closeUnlockConfirmModal);
  document
    .getElementById("confirmUnlock")
    ?.addEventListener("click", processUnlockAlbum);

  // Close modal on overlay click
  document
    .getElementById("unlockConfirmModal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "unlockConfirmModal") {
        closeUnlockConfirmModal();
      }
    });

  // Locked Info Modal event listeners
  document
    .getElementById("closeLockedInfoModal")
    ?.addEventListener("click", closeLockedInfoModal);
  document
    .getElementById("closeLockedInfoBtn")
    ?.addEventListener("click", closeLockedInfoModal);

  // Close modal on overlay click
  document.getElementById("lockedInfoModal")?.addEventListener("click", (e) => {
    if (e.target.id === "lockedInfoModal") {
      closeLockedInfoModal();
    }
  });

  // Rate Track Modal event listeners
  document
    .getElementById("closeRateTrackModal")
    ?.addEventListener("click", closeRateTrackModal);
  document
    .getElementById("cancelRateTrack")
    ?.addEventListener("click", closeRateTrackModal);
  document
    .getElementById("rateFavorite")
    ?.addEventListener("click", () => applyTrackRating("favorite"));
  document
    .getElementById("rateLeast")
    ?.addEventListener("click", () => applyTrackRating("least"));
  document
    .getElementById("rateLiked")
    ?.addEventListener("click", () => applyTrackRating("liked"));
  document
    .getElementById("rateDisliked")
    ?.addEventListener("click", () => applyTrackRating("disliked"));

  // Track Notes event listeners
  document
    .getElementById("notesVisibilityToggle")
    ?.addEventListener("click", toggleNotesVisibility);
  // Save button removed from UI; notes are auto-saved on modal close

  // Close modal on overlay click
  document.getElementById("rateTrackModal")?.addEventListener("click", (e) => {
    if (e.target.id === "rateTrackModal") {
      closeRateTrackModal();
    }
  });

  // Edit Links Modal event listeners
  document
    .getElementById("closeEditLinksModal")
    ?.addEventListener("click", closeEditLinksModal);
  document
    .getElementById("cancelEditLinks")
    ?.addEventListener("click", closeEditLinksModal);
  document
    .getElementById("saveEditLinks")
    ?.addEventListener("click", saveEditedLinks);
  document
    .getElementById("addNewLinkBtn")
    ?.addEventListener("click", addNewLinkRow);

  // Close modal on overlay click
  document.getElementById("editLinksModal")?.addEventListener("click", (e) => {
    if (e.target.id === "editLinksModal") {
      closeEditLinksModal();
    }
  });

  // Custom alert modal event listeners
  document
    .getElementById("closeCustomAlert")
    ?.addEventListener("click", closeCustomAlert);
  document
    .getElementById("confirmCustomAlert")
    ?.addEventListener("click", closeCustomAlert);

  // Voting warning modal event listeners
  document
    .getElementById("closeVotingWarning")
    ?.addEventListener("click", closeVotingWarningModal);
  document
    .getElementById("cancelVotingWarning")
    ?.addEventListener("click", closeVotingWarningModal);
  document
    .getElementById("confirmVotingStart")
    ?.addEventListener("click", showVotingConfirmModal);

  // Second voting confirmation modal event listeners
  document
    .getElementById("closeVotingConfirm")
    ?.addEventListener("click", closeVotingConfirmModal);
  document
    .getElementById("cancelVotingConfirm")
    ?.addEventListener("click", closeVotingConfirmModal);
  document
    .getElementById("confirmVotingGo")
    ?.addEventListener("click", confirmVotingStart);

  // Reset voting confirmation modal event listeners
  document
    .getElementById("closeResetVotingConfirm")
    ?.addEventListener("click", closeResetVotingConfirmModal);
  document
    .getElementById("cancelResetVoting")
    ?.addEventListener("click", closeResetVotingConfirmModal);
  document
    .getElementById("confirmResetVoting")
    ?.addEventListener("click", confirmResetVoting);

  // End voting confirmation modal event listeners
  document
    .getElementById("closeEndVotingConfirm")
    ?.addEventListener("click", closeEndVotingConfirmModal);
  document
    .getElementById("cancelEndVoting")
    ?.addEventListener("click", closeEndVotingConfirmModal);
  document
    .getElementById("confirmEndVoting")
    ?.addEventListener("click", confirmEndVoting);

  // Leave discussion modal event listeners
  document
    .getElementById("closeLeaveDiscussion")
    ?.addEventListener("click", closeLeaveDiscussionModal);
  document
    .getElementById("cancelLeaveDiscussion")
    ?.addEventListener("click", closeLeaveDiscussionModal);
  document
    .getElementById("confirmLeaveDiscussion")
    ?.addEventListener("click", confirmLeaveDiscussion);

  // Voting Modal event listeners
  document
    .getElementById("closeVotingModal")
    ?.addEventListener("click", closeVotingModal);
  document
    .getElementById("cancelVoting")
    ?.addEventListener("click", closeVotingModal);
  document
    .getElementById("submitVotes")
    ?.addEventListener("click", submitVotes);

  // Close modal on overlay click
  document.getElementById("votingModal")?.addEventListener("click", (e) => {
    if (e.target.id === "votingModal") {
      closeVotingModal();
    }
  });
}

function closeAddAlbumModal() {
  document.getElementById("addAlbumModal")?.classList.add("hidden");
}

function closeLockConfirmModal() {
  document.getElementById("lockConfirmModal")?.classList.add("hidden");
}

function closeUnlockConfirmModal() {
  document.getElementById("unlockConfirmModal")?.classList.add("hidden");
}

function closeLockedInfoModal() {
  document.getElementById("lockedInfoModal")?.classList.add("hidden");
}

function closeEditLinksModal() {
  document.getElementById("editLinksModal")?.classList.add("hidden");
}

// Show edit links modal
async function showEditLinksModal(albumId) {
  if (!db) return;

  window.currentEditAlbumId = albumId;

  // Load current links
  const albumDoc = await db.collection("albums").doc(albumId).get();
  if (!albumDoc.exists) {
    alert("Album not found");
    return;
  }

  const albumData = albumDoc.data();
  const externalLinks = albumData.externalLinks || [];
  const youtubeUrl = albumData.youtubeUrl || "";
  const isLocked = albumData.locked || false;

  // Populate YouTube Music section
  const youtubeContainer = document.getElementById("youtubeEditContainer");
  youtubeContainer.innerHTML = "";

  const youtubeLabel = document.createElement("label");
  youtubeLabel.className = "edit-link-label";
  youtubeLabel.textContent = "YouTube Music Link (Primary)";
  youtubeLabel.style.fontWeight = "600";
  youtubeLabel.style.marginBottom = "8px";
  youtubeLabel.style.display = "block";

  const youtubeInfo = document.createElement("p");
  youtubeInfo.style.fontSize = "0.85rem";
  youtubeInfo.style.color = "#a0a0a0";
  youtubeInfo.style.marginTop = "-4px";
  youtubeInfo.style.marginBottom = "8px";
  youtubeInfo.textContent =
    "This is your main album link. Once locked, it cannot be changed. Only a moderator can unlock it.";

  const youtubeInput = document.createElement("input");
  youtubeInput.type = "text";
  youtubeInput.id = "youtubeUrlInput";
  youtubeInput.className = "modal-input";
  youtubeInput.placeholder = "https://music.youtube.com/playlist?list=...";
  youtubeInput.value = youtubeUrl;
  youtubeInput.disabled = isLocked;
  youtubeInput.style.marginBottom = "20px";

  youtubeContainer.appendChild(youtubeLabel);
  youtubeContainer.appendChild(youtubeInfo);

  if (isLocked) {
    const lockNote = document.createElement("p");
    lockNote.style.fontSize = "0.9rem";
    lockNote.style.color = "#ef4444";
    lockNote.style.marginBottom = "8px";
    lockNote.textContent =
      "🔒 Album is locked - YouTube Music link cannot be changed";
    youtubeContainer.appendChild(lockNote);
    youtubeContainer.appendChild(youtubeInput);
  } else {
    youtubeContainer.appendChild(youtubeInput);
  }

  // Populate external links section
  const container = document.getElementById("editLinksContainer");
  container.innerHTML = "";

  if (externalLinks.length > 0) {
    const linksLabel = document.createElement("label");
    linksLabel.className = "edit-link-label";
    linksLabel.textContent = "External Links";
    linksLabel.style.fontWeight = "600";
    linksLabel.style.marginBottom = "12px";
    linksLabel.style.display = "block";
    container.appendChild(linksLabel);
  }

  externalLinks.forEach((link, index) => {
    addLinkRowToEdit(link.url, link.name, index);
  });

  // Show modal
  document.getElementById("editLinksModal").classList.remove("hidden");
}

// Add a link row to the edit container
function addLinkRowToEdit(url = "", name = "", index = null) {
  const container = document.getElementById("editLinksContainer");

  const item = document.createElement("div");
  item.className = "edit-link-item";
  if (index !== null) {
    item.dataset.index = index;
  }

  const inputs = document.createElement("div");
  inputs.className = "edit-link-inputs";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "modal-input link-url-input";
  urlInput.placeholder = "https://...";
  urlInput.value = url;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "modal-input link-name-input";
  nameInput.placeholder = "Platform name (e.g., Bandcamp)";
  nameInput.value = name;

  inputs.appendChild(urlInput);
  inputs.appendChild(nameInput);

  const removeBtn = document.createElement("button");
  removeBtn.className = "edit-link-remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => {
    item.remove();
  });

  item.appendChild(inputs);
  item.appendChild(removeBtn);
  container.appendChild(item);
}

// Add new empty link row
function addNewLinkRow() {
  addLinkRowToEdit();
}

// Save edited links
async function saveEditedLinks() {
  const albumId = window.currentEditAlbumId;
  if (!albumId || !db) return;

  // Get YouTube Music URL
  const youtubeUrlInput = document.getElementById("youtubeUrlInput");
  const youtubeUrl = youtubeUrlInput.value.trim();

  if (!youtubeUrl) {
    await showCustomAlert("YouTube Music link is required");
    return;
  }

  // Collect all external links from the form
  const container = document.getElementById("editLinksContainer");
  const items = container.querySelectorAll(".edit-link-item");

  const newLinks = [];
  items.forEach((item) => {
    const urlInput = item.querySelector(".link-url-input");
    const nameInput = item.querySelector(".link-name-input");

    const url = urlInput.value.trim();
    const name = nameInput.value.trim();

    if (url && name) {
      newLinks.push({
        url: url,
        name: name,
        addedAt: new Date().toISOString(),
      });
    }
  });

  // Close modal
  closeEditLinksModal();

  try {
    // Update in Firebase
    await db.collection("albums").doc(albumId).update({
      externalLinks: newLinks,
    });

    // Refresh display
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error saving links:", error);
    await showCustomAlert(`Failed to save links: ${error.message}`, "Error");
  }
}

// Show locked album info modal
function showLockedInfoModal() {
  const moderatorNames = getModeratorNames();
  const message = document.getElementById("lockedInfoMessage");

  if (moderatorNames.length === 1) {
    message.innerHTML = `This album is already locked in. Only the moderator/s,<strong> ${moderatorNames[0]}</strong> can unlock it. SUCK IT!`;
  } else {
    const namesList =
      moderatorNames.slice(0, -1).join(", ") +
      " or " +
      moderatorNames[moderatorNames.length - 1];
    message.innerHTML = `This album is already locked in. Only the moderator/s, ${namesList} can unlock it. SUCK IT!`;
  }

  const modal = document.getElementById("lockedInfoModal");
  modal.classList.remove("hidden");
}

// Show lock confirmation modal
function showLockConfirmModal(albumId) {
  window.currentLockAlbumId = albumId;
  const modal = document.getElementById("lockConfirmModal");
  modal.classList.remove("hidden");
}

// Process locking the album
async function processLockAlbum() {
  const albumId = window.currentLockAlbumId;
  if (!albumId) {
    alert("Album not found");
    return;
  }

  // Close modal
  document.getElementById("lockConfirmModal").classList.add("hidden");

  try {
    await db.collection("albums").doc(albumId).update({
      locked: true,
      lockedAt: new Date().toISOString(),
    });

    // Refresh albums display
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error locking album:", error);
    await showCustomAlert(`Failed to lock album: ${error.message}`, "Error");
  }
}

// Unlock album (moderator only)
async function showUnlockConfirmModal(albumId) {
  if (!currentUser || !isModerator(currentUser.email)) {
    await showCustomAlert("Only moderators can unlock albums");
    return;
  }

  window.currentUnlockAlbumId = albumId;
  const modal = document.getElementById("unlockConfirmModal");
  modal.classList.remove("hidden");
}

// Process unlocking the album
async function processUnlockAlbum() {
  const albumId = window.currentUnlockAlbumId;
  if (!albumId) {
    alert("Album not found");
    return;
  }

  // Close modal
  document.getElementById("unlockConfirmModal").classList.add("hidden");

  try {
    await db.collection("albums").doc(albumId).update({
      locked: false,
      unlockedAt: new Date().toISOString(),
      unlockedBy: currentUser.email,
    });

    // Refresh albums display
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error unlocking album:", error);
    await showCustomAlert(`Failed to unlock album: ${error.message}`, "Error");
  }
}

// Navigate to previous or next month
function navigateMonth(direction) {
  currentDate.setMonth(currentDate.getMonth() + direction);
  updateDisplay();
}

// Join current month's discussion
async function joinDiscussion() {
  console.log("joinDiscussion called");

  if (!currentUser) {
    console.error("Join failed: No current user");
    await showCustomAlert("Please sign in first!");
    return;
  }

  if (!db) {
    console.error("Join failed: Database not initialized");
    await showCustomAlert("Database not initialized. Please refresh the page.");
    return;
  }

  const monthKey = getMonthKey();
  console.log(
    "Joining discussion for month:",
    monthKey,
    "User:",
    currentUser.email
  );

  try {
    console.log("Checking if user is already a participant...");
    // Check if user is already a participant in Firestore
    const participantRef = db
      .collection("participants")
      .doc(`${monthKey}_${currentUser.email}`);
    const doc = await participantRef.get();

    if (doc.exists && !doc.data().left) {
      console.warn("User already participating");
      await showCustomAlert("You are already participating in this month!");
      return;
    }

    console.log("Adding user as participant...");
    // Add user as participant to Firestore (or rejoin if they left)
    await participantRef.set({
      monthKey: monthKey,
      name: currentUser.name,
      email: currentUser.email,
      picture: currentUser.picture,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      left: false,
    });
    console.log("User added to participants successfully");

    // Refresh display to show updated participants
    console.log("Reloading participants...");
    await loadParticipants(monthKey);

    // Reload albums to update the add album button
    console.log("Reloading albums...");
    await loadAlbums(monthKey);

    console.log("Join discussion completed successfully");
    await showCustomAlert("You have joined the discussion!", "Success");
  } catch (error) {
    console.error("Error joining discussion:", error);
    console.error("Error details:", {
      code: error.code,
      message: error.message,
      stack: error.stack,
    });
    await showCustomAlert(
      "Failed to join discussion. Please try again.",
      "Error"
    );
  }
}

// Leave discussion
async function leaveDiscussion() {
  if (!currentUser) {
    await showCustomAlert("Please sign in first!");
    return;
  }

  if (!db) {
    await showCustomAlert("Database not initialized. Please refresh the page.");
    return;
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  try {
    // Check if user has added an album
    const albumsSnapshot = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .where("addedBy", "==", currentUser.email)
      .get();

    if (!albumsSnapshot.empty) {
      await showCustomAlert(
        "You must delete your album before leaving the discussion."
      );
      return;
    }

    // Show confirmation modal
    const modal = document.getElementById("leaveDiscussionModal");
    modal.classList.remove("hidden");
  } catch (error) {
    console.error("Error checking albums:", error);
    await showCustomAlert("Failed to check albums. Please try again.", "Error");
  }
}

// Confirm leaving discussion
async function confirmLeaveDiscussion() {
  const modal = document.getElementById("leaveDiscussionModal");
  modal.classList.add("hidden");

  const monthKey = getMonthKey(currentDate);

  try {
    const participantRef = db
      .collection("participants")
      .doc(`${monthKey}_${currentUser.email}`);

    // Mark participant as left instead of deleting
    await participantRef.update({
      left: true,
      leftAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Reload data first, then show success message
    await loadParticipants(monthKey);
    await loadAlbums(monthKey);
    await showCustomAlert(
      "You have left the discussion successfully.",
      "Success"
    );
  } catch (error) {
    console.error("Error leaving discussion:", error);
    await showCustomAlert(
      "Failed to leave discussion. Please try again.",
      "Error"
    );
  }
}

// Remove participant (moderator only)
async function removeParticipant(participantEmail, participantName) {
  if (!currentUser || !isModerator(currentUser.email)) {
    await showCustomAlert("Only moderators can remove participants.");
    return;
  }

  const firstName = participantName.split(" ")[0];
  const confirmed = await showCustomConfirm(
    `Are you sure you want to remove ${firstName} from this discussion?`,
    "Remove Participant"
  );
  if (!confirmed) {
    return;
  }

  const monthKey = getMonthKey(currentDate);

  try {
    const participantRef = db
      .collection("participants")
      .doc(`${monthKey}_${participantEmail}`);

    // Mark participant as left (same as voluntary leaving)
    await participantRef.update({
      left: true,
      leftAt: firebase.firestore.FieldValue.serverTimestamp(),
      removedByModerator: true,
    });

    await loadParticipants(monthKey);
    await loadAlbums(monthKey);
    await showCustomAlert(
      `${firstName} has been removed from the discussion.`,
      "Success"
    );
  } catch (error) {
    console.error("Error removing participant:", error);
    await showCustomAlert(
      "Failed to remove participant. Please try again.",
      "Error"
    );
  }
}

// Close leave discussion modal
function closeLeaveDiscussionModal() {
  const modal = document.getElementById("leaveDiscussionModal");
  modal.classList.add("hidden");
}

// Update the display with current month data
async function updateDisplay() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = getMonthKey();

  // Update month/year display
  document.getElementById("currentMonth").textContent = monthNames[month];
  document.getElementById("currentYear").textContent = year;

  // Load participants from Firebase
  await loadParticipants(monthKey);

  // Load albums from Firebase
  await loadAlbums(monthKey);
}

// Load participants from Firebase
async function loadParticipants(monthKey) {
  if (!db) {
    updateParticipants([]);
    return;
  }

  try {
    const snapshot = await db
      .collection("participants")
      .where("monthKey", "==", monthKey)
      .get();

    const participants = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Only include participants who haven't left
      if (!data.left) {
        participants.push({
          name: data.name,
          email: data.email,
          picture: data.picture,
          joinedAt: data.joinedAt,
        });
      }
    });

    // Sort participants by join time (client-side sorting)
    participants.sort((a, b) => {
      if (!a.joinedAt || !b.joinedAt) return 0;
      const timeA = a.joinedAt.toMillis
        ? a.joinedAt.toMillis()
        : new Date(a.joinedAt).getTime();
      const timeB = b.joinedAt.toMillis
        ? b.joinedAt.toMillis()
        : new Date(b.joinedAt).getTime();
      return timeA - timeB;
    });

    // Update join button state
    updateJoinButton(participants);

    // Update participants display
    updateParticipants(participants);

    // Store participants globally for add button check
    window.currentParticipants = participants;
  } catch (error) {
    console.error("Error loading participants:", error);
    updateParticipants([]);
    window.currentParticipants = [];
  }
}

// Update add album button based on whether user has added an album and is a participant
function updateAddAlbumButton(albums) {
  const addBtn = document.getElementById("addAlbumBtn");
  const migrateBtn = document.getElementById("migrateTracksBtn");

  if (!addBtn) return;

  if (!currentUser) {
    addBtn.style.display = "none";
    if (migrateBtn) migrateBtn.style.display = "none";
    return;
  }

  // Show migration button only for moderators
  const userIsModerator = isModerator(currentUser.email);
  if (migrateBtn) {
    migrateBtn.style.display = userIsModerator ? "inline-block" : "none";
  }

  // Check if user is a participant this month
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);

  if (!isParticipant) {
    addBtn.style.display = "none";
    return;
  }

  const userAlbum = albums.find((a) => a.addedBy === currentUser.email);

  if (userAlbum) {
    addBtn.style.display = "none";
  } else {
    addBtn.style.display = "inline-block";
    addBtn.textContent = "+ Add Your Album";
  }
}

// Delete album from Firebase
async function deleteAlbum(albumId) {
  console.log("deleteAlbum called with ID:", albumId);

  if (!db || !currentUser) {
    console.error("Delete failed: db or currentUser not available", {
      db: !!db,
      currentUser: !!currentUser,
    });
    await showCustomAlert("Unable to delete album. Please try again.", "Error");
    return;
  }

  try {
    console.log("Fetching album document...");
    // Get album data
    const albumDoc = await db.collection("albums").doc(albumId).get();
    if (!albumDoc.exists) {
      console.error("Album not found:", albumId);
      await showCustomAlert("Album not found.");
      return;
    }

    const albumData = albumDoc.data();
    console.log("Album data:", albumData);
    const isOwnAlbum = albumData.addedBy === currentUser.email;
    const userIsModerator = isModerator(currentUser.email);
    console.log("Permissions check:", {
      isOwnAlbum,
      userIsModerator,
      locked: albumData.locked,
    });

    // Check if album is locked and user is not a moderator
    if (albumData.locked && !userIsModerator) {
      console.warn("Delete blocked: Album is locked");
      await showCustomAlert(
        "This album is locked. Only a moderator can delete it."
      );
      return;
    }

    // Non-moderators can only delete their own albums
    if (!isOwnAlbum && !userIsModerator) {
      console.warn("Delete blocked: Not own album and not moderator");
      await showCustomAlert("You can only delete your own albums.");
      return;
    }

    const confirmMessage =
      userIsModerator && !isOwnAlbum
        ? `Are you sure you want to delete this album by ${
            albumData.addedByName || "another user"
          }?`
        : "Are you sure you want to delete your album?";

    console.log("Showing confirmation dialog...");
    const confirmed = await showCustomConfirm(confirmMessage, "Delete Album");
    console.log("User confirmation:", confirmed);

    if (!confirmed) {
      console.log("Delete cancelled by user");
      return;
    }

    console.log("Deleting album from Firestore...");
    // Delete the album
    await db.collection("albums").doc(albumId).delete();
    console.log("Album deleted successfully:", albumId);

    // Refresh albums display
    const monthKey = getMonthKey();
    console.log("Reloading albums for month:", monthKey);
    await loadAlbums(monthKey);

    await showCustomAlert("Album deleted successfully!", "Success");
  } catch (error) {
    console.error("Error deleting album:", error);
    console.error("Error details:", {
      code: error.code,
      message: error.message,
      stack: error.stack,
    });
    await showCustomAlert(`Failed to delete album: ${error.message}`, "Error");
  }
}

// Show modal to add album
async function showAddAlbumModal() {
  if (!currentUser) {
    await showCustomAlert("Please sign in first!");
    return;
  }

  // Generate current month key
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Check if user is a participant this month
  const snapshot = await db
    .collection("participants")
    .where("monthKey", "==", monthKey)
    .where("email", "==", currentUser.email)
    .get();

  if (snapshot.empty) {
    await showCustomAlert(
      "You must join this month's discussion before adding an album!"
    );
    return;
  }

  // Show the modal
  const modal = document.getElementById("addAlbumModal");
  const input = document.getElementById("albumLinkInput");
  modal.classList.remove("hidden");
  input.value = "";
  input.focus();
}

// Process album addition from modal
async function processAddAlbum() {
  const input = document.getElementById("albumLinkInput");
  const userLink = input.value.trim();

  if (!userLink) {
    alert("Please enter a YouTube Music link");
    return;
  }

  // Extract playlist ID from the link
  const playlistIdMatch = userLink.match(/[?&]list=([^&]+)/);

  if (!playlistIdMatch) {
    alert(
      "Invalid YouTube Music link. Please make sure it contains a playlist ID."
    );
    return;
  }

  const playlistId = playlistIdMatch[1];

  // Close modal
  document.getElementById("addAlbumModal").classList.add("hidden");

  try {
    if (YOUTUBE_API_KEY === "YOUR_YOUTUBE_API_KEY_HERE") {
      // If no API key, ask for manual title and artist
      const title = prompt("Enter album title:");
      if (!title || title.trim() === "") return;

      const artist = prompt("Enter artist name:");
      if (!artist || artist.trim() === "") return;

      await addAlbum(title.trim(), artist.trim(), "", userLink);
      return;
    }

    // Fetch the playlist to get title, artist, and cover art
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch album details from YouTube");
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      await showCustomAlert(
        "Could not find album information. Please try again."
      );
      return;
    }

    const playlist = data.items[0];
    const title = playlist.snippet.title;
    const artist = playlist.snippet.channelTitle.replace(" - Topic", ""); // Remove "- Topic" from artist name

    let thumbnail =
      playlist.snippet.thumbnails.maxres?.url ||
      playlist.snippet.thumbnails.standard?.url ||
      playlist.snippet.thumbnails.high?.url ||
      playlist.snippet.thumbnails.medium?.url ||
      "";

    // Convert to higher resolution if possible
    if (thumbnail) {
      thumbnail = thumbnail.replace(/=w\d+-h\d+/, "=w544-h544-l90-rj");
    }

    // Fetch playlist tracks
    const tracks = await fetchPlaylistTracks(playlistId);

    await addAlbum(title, artist, thumbnail, userLink, playlistId, tracks);
  } catch (error) {
    console.error("Error fetching album details:", error);
    await showCustomAlert(
      `Failed to fetch album information: ${error.message}\n\nPlease enter details manually.`,
      "Error"
    );

    // Fallback to manual entry
    const title = prompt("Enter album title:");
    if (!title || title.trim() === "") return;

    const artist = prompt("Enter artist name:");
    if (!artist || artist.trim() === "") return;

    await addAlbum(title.trim(), artist.trim(), "", userLink);
  }
}

// Fetch playlist tracks from YouTube API
async function fetchPlaylistTracks(playlistId) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      console.error("Failed to fetch playlist tracks");
      return [];
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return [];
    }

    // Extract track titles from playlist items
    const tracks = data.items.map((item, index) => ({
      position: index + 1,
      title: item.snippet.title,
      videoId: item.snippet.resourceId.videoId,
    }));

    return tracks;
  } catch (error) {
    console.error("Error fetching playlist tracks:", error);
    return [];
  }
}

// Add album to Firebase
async function addAlbum(
  title,
  artist,
  coverUrl,
  youtubeUrl = "",
  playlistId = "",
  tracks = []
) {
  if (!db || !currentUser) {
    await showCustomAlert("Unable to add album. Please try again.");
    return;
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  try {
    // Check if user already added an album this month
    const existingAlbum = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .where("addedBy", "==", currentUser.email)
      .get();

    if (!existingAlbum.empty) {
      await showCustomAlert("You have already added an album for this month!");
      return;
    }

    // Add the album
    console.log("Adding album:", {
      title,
      artist,
      coverUrl,
      youtubeUrl,
      playlistId,
      tracks,
      monthKey,
    });

    await db.collection("albums").add({
      monthKey: monthKey,
      title: title,
      artist: artist,
      coverUrl: coverUrl || "",
      youtubeUrl: youtubeUrl || "",
      playlistId: playlistId || "",
      tracks: tracks || [],
      addedBy: currentUser.email,
      addedByName: currentUser.name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log("Album added successfully");

    // Refresh albums display
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error adding album:", error);
    console.error("Error details:", error.message, error.code);
    await showCustomAlert(
      `Failed to add album: ${error.message}\n\nPlease check the browser console for details.`,
      "Error"
    );
  }
}

// Update join button based on participation status
function updateJoinButton(participants) {
  const joinBtn = document.getElementById("joinDiscussionBtn");
  const leaveBtn = document.getElementById("leaveDiscussionBtn");
  if (!joinBtn) return;

  const isParticipating =
    currentUser && participants.some((p) => p.email === currentUser.email);

  if (isParticipating) {
    joinBtn.style.display = "none";
    if (leaveBtn) leaveBtn.style.display = "inline-block";
  } else {
    joinBtn.style.display = "inline-block";
    joinBtn.textContent = "+ Join This Month's Discussion";
    joinBtn.classList.remove("joined");
    joinBtn.disabled = false;
    if (leaveBtn) leaveBtn.style.display = "none";
  }
}

// Update participants list
function updateParticipants(participants) {
  const participantsList = document.getElementById("participantsList");
  // Clear existing content
  participantsList.innerHTML = "";

  if (participants.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.color = "#666";
    emptyMsg.textContent = "No participants yet. Be the first!";
    participantsList.appendChild(emptyMsg);
    return;
  }

  // Get voting information if voting is active
  let votersSet = new Set();
  if (window.currentVotingActive) {
    // Get all albums to check who has voted
    const albumWrappers = document.querySelectorAll(".album-wrapper");
    albumWrappers.forEach((wrapper) => {
      const albumId = wrapper.dataset.albumId;
      // We'll access this from window.currentAlbums later
    });

    // Access current albums from global state
    if (window.currentAlbums) {
      window.currentAlbums.forEach((album) => {
        if (album.votes) {
          Object.keys(album.votes).forEach((email) => votersSet.add(email));
        }
      });
    }
  }

  // Use cached participant colors
  const participantColors = PARTICIPANT_COLORS;

  // Create elements safely to prevent XSS
  participants.forEach((participant, index) => {
    const div = document.createElement("div");
    div.className = "participant";

    // Add email as data attribute for highlighting
    div.dataset.email = participant.email;

    // Assign color based on index
    const colorIndex = index % participantColors.length;
    div.dataset.colorIndex = colorIndex;

    // Apply participant's color to their avatar border
    const color = participantColors[colorIndex];
    div.style.setProperty("--participant-border", color.border);
    div.style.setProperty("--participant-shadow", color.shadow);

    // If participant has avatar (new format), show it
    if (participant.picture) {
      div.classList.add("has-avatar");

      // Container for avatar with potential vote indicator
      const avatarContainer = document.createElement("div");
      avatarContainer.style.position = "relative";
      avatarContainer.style.display = "inline-block";

      const avatar = document.createElement("img");
      avatar.className = "participant-avatar";
      avatar.src = participant.picture;
      avatar.alt = participant.name;

      // Fallback to random animal emoji if image fails to load
      avatar.onerror = () => {
        const emoji = getAnimalEmojiForUser(participant.email);
        const emojiSpan = document.createElement("div");
        emojiSpan.className = "participant-avatar";
        emojiSpan.textContent = emoji;
        emojiSpan.style.fontSize = "40px";
        emojiSpan.style.display = "flex";
        emojiSpan.style.alignItems = "center";
        emojiSpan.style.justifyContent = "center";
        emojiSpan.style.width = "50px";
        emojiSpan.style.height = "50px";
        emojiSpan.style.borderRadius = "50%";
        avatar.replaceWith(emojiSpan);
      };

      avatarContainer.appendChild(avatar);

      // Add vote indicator if voting is active and user has voted
      if (window.currentVotingActive && votersSet.has(participant.email)) {
        const voteIndicator = document.createElement("div");
        voteIndicator.textContent = "✅";
        voteIndicator.style.position = "absolute";
        voteIndicator.style.top = "-5px";
        voteIndicator.style.right = "-5px";
        voteIndicator.style.fontSize = "20px";
        voteIndicator.style.lineHeight = "1";
        voteIndicator.title = "Has voted";
        avatarContainer.appendChild(voteIndicator);
      }

      div.appendChild(avatarContainer);

      const nameSpan = document.createElement("span");
      nameSpan.className = "participant-name";
      // Show only first name
      const firstName = participant.name.split(" ")[0];
      nameSpan.textContent = firstName;
      div.appendChild(nameSpan);
    } else {
      // Old format - just text
      div.textContent = participant;
    }

    // Add moderator remove button (if current user is moderator and it's not their own participant card)
    if (
      currentUser &&
      isModerator(currentUser.email) &&
      participant.email !== currentUser.email
    ) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "participant-remove-btn";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove participant";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeParticipant(participant.email, participant.name);
      };
      div.appendChild(removeBtn);
    }

    // Add click event to highlight participant's album
    div.addEventListener("click", () => {
      toggleHighlightAlbum(participant.email);
    });

    participantsList.appendChild(div);
  });
}

// Update albums grid
function updateAlbums(albums) {
  const albumsGrid = document.getElementById("albumsGrid");

  // Clear existing content
  albumsGrid.innerHTML = "";

  if (albums.length === 0) {
    const p = document.createElement("p");
    p.style.textAlign = "center";
    p.style.gridColumn = "1/-1";
    p.style.color = "#666";
    p.textContent =
      "No albums added yet. Join the discussion and be the first!";
    albumsGrid.appendChild(p);
    return;
  }

  // Sort albums by creation date (oldest first)
  const sortedAlbums = [...albums].sort((a, b) => {
    if (!a.createdAt || !b.createdAt) return 0;
    return a.createdAt.toMillis() - b.createdAt.toMillis();
  });

  // Use cached album cover gradients
  const gradients = ALBUM_GRADIENTS;

  // Create elements safely to prevent XSS
  sortedAlbums.forEach((album, index) => {
    // Create wrapper for album card + tracks
    const albumWrapper = document.createElement("div");
    albumWrapper.className = "album-wrapper";

    const card = document.createElement("div");
    card.className = "album-card";

    // Add data attribute for the person who added it
    card.dataset.addedBy = album.addedBy;

    // Assign color based on participant
    const participant = document.querySelector(
      `.participant[data-email="${album.addedBy}"]`
    );
    const colorIndex = participant?.dataset.colorIndex || 0;
    const colors = getParticipantColors();
    const color = colors[colorIndex % colors.length];

    // Apply the participant's color to the album border
    card.style.setProperty("--album-border", color.border);
    card.style.setProperty("--album-shadow", color.shadow);

    // Highlight user's own album with special class (but still use their color)
    const isUserAlbum = currentUser && album.addedBy === currentUser.email;
    if (isUserAlbum) {
      card.classList.add("user-album");
    }

    // Make card clickable if YouTube URL exists
    if (album.youtubeUrl) {
      card.style.cursor = "pointer";
      card.addEventListener("click", (e) => {
        // Don't open link if clicking delete button
        if (!e.target.classList.contains("delete-album-btn")) {
          window.open(album.youtubeUrl, "_blank");
        }
      });
    }

    // Add hover listeners to highlight participant
    card.addEventListener("mouseenter", () => {
      card.classList.add("album-hover");
      highlightParticipant(album.addedBy);
    });

    card.addEventListener("mouseleave", () => {
      card.classList.remove("album-hover");
      unhighlightParticipant(album.addedBy);
    });

    const cover = document.createElement("div");
    cover.className = "album-cover";

    // Use cover image if provided, otherwise use gradient
    if (album.coverUrl) {
      console.log("Loading cover:", album.coverUrl);
      const img = document.createElement("img");
      img.src = album.coverUrl;
      img.alt = `${album.title} by ${album.artist}`;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.onerror = () => {
        console.error("Failed to load image:", album.coverUrl);
        // Show vinyl record emoji as fallback
        const vinylEmoji = document.createElement("div");
        vinylEmoji.textContent = "💿";
        vinylEmoji.style.fontSize = "100px";
        vinylEmoji.style.display = "flex";
        vinylEmoji.style.alignItems = "center";
        vinylEmoji.style.justifyContent = "center";
        vinylEmoji.style.width = "100%";
        vinylEmoji.style.height = "100%";
        vinylEmoji.style.background = gradients[index % gradients.length];
        img.replaceWith(vinylEmoji);
      };
      cover.appendChild(img);
    } else {
      console.log("No cover URL, using gradient");
      cover.style.background = gradients[index % gradients.length];
    }

    const info = document.createElement("div");
    info.className = "album-info";

    const title = document.createElement("h3");
    title.textContent = album.title;

    const artist = document.createElement("p");
    artist.textContent = album.artist;

    info.appendChild(title);
    info.appendChild(artist);

    // Check if current user is a moderator
    const userIsModerator = currentUser && isModerator(currentUser.email);

    // Add buttons for user's own album OR if user is a moderator
    if (isUserAlbum || userIsModerator) {
      // Show delete button if: (album not locked) OR (user is moderator)
      if (!album.locked || userIsModerator) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-album-btn";
        deleteBtn.textContent = "✕";
        deleteBtn.title =
          userIsModerator && !isUserAlbum
            ? "Delete album (Moderator)"
            : "Delete your album";
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          console.log("Delete button clicked for album:", album.id);
          await deleteAlbum(album.id);
        });
        card.appendChild(deleteBtn);
      }

      // Only show lock and edit buttons for user's own album
      if (isUserAlbum) {
        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.textContent = "✎";
        editBtn.title = "Edit all external links";
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showEditLinksModal(album.id);
        });
        card.appendChild(editBtn);

        const lockBtn = document.createElement("button");
        lockBtn.className = "lock-btn" + (album.locked ? " locked" : "");
        lockBtn.textContent = album.locked ? "🔒" : "🔓";

        // If moderator and locked, allow unlock; otherwise show lock status
        if (userIsModerator && album.locked) {
          lockBtn.title = "Unlock your album (Moderator)";
          lockBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showUnlockConfirmModal(album.id);
          });
        } else if (album.locked) {
          lockBtn.title = "Album is locked";
          lockBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showLockedInfoModal();
          });
        } else {
          lockBtn.title = "Lock your selection";
          lockBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showLockConfirmModal(album.id);
          });
        }
        card.appendChild(lockBtn);
      }
    }

    // Add unlock button for moderators on locked albums that aren't theirs
    if (userIsModerator && album.locked && !isUserAlbum) {
      const unlockBtn = document.createElement("button");
      unlockBtn.className = "unlock-btn";
      unlockBtn.textContent = "🔓";
      unlockBtn.title = "Unlock album (Moderator)";
      unlockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showUnlockConfirmModal(album.id);
      });
      card.appendChild(unlockBtn);
    }

    // Add lock button for moderators on unlocked albums that aren't theirs
    if (userIsModerator && !album.locked && !isUserAlbum) {
      const lockBtn = document.createElement("button");
      lockBtn.className = "lock-btn";
      lockBtn.textContent = "🔓";
      lockBtn.title = "Lock album (Moderator)";
      lockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showLockConfirmModal(album.id);
      });
      card.appendChild(lockBtn);
    }

    // Add edit button for moderators on other people's albums
    if (userIsModerator && !isUserAlbum) {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "✎";
      editBtn.title = "Edit external links (Moderator)";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showEditLinksModal(album.id);
      });
      card.appendChild(editBtn);
    }

    // Check if voting is active for this month
    const votingActive = window.currentVotingActive || false;

    // Check if current user has already voted
    let userHasVoted = false;
    if (votingActive && currentUser) {
      // Check if user's email appears in any album's votes
      const allAlbums = document.querySelectorAll(".album-wrapper");
      // We'll set this properly in loadAlbums, but for now check album.votes
      if (album.votes && album.votes[currentUser.email]) {
        userHasVoted = true;
      }
    }

    console.log(
      "Album:",
      album.title,
      "votingActive:",
      votingActive,
      "isUserAlbum:",
      isUserAlbum,
      "userHasVoted:",
      userHasVoted,
      "window.currentVotingActive:",
      window.currentVotingActive
    );

    // Hide user's own album during voting if they haven't voted yet
    if (votingActive && isUserAlbum && !window.userHasVotedThisMonth) {
      albumWrapper.style.display = "none";
      return albumWrapper;
    }

    // Fade out user's own album during voting if they have voted
    if (votingActive && isUserAlbum && window.userHasVotedThisMonth) {
      card.style.opacity = "0.3";
      card.style.filter = "grayscale(50%)";
      card.style.pointerEvents = "none";
    } else if (votingActive && isUserAlbum) {
      card.style.opacity = "0.3";
      card.style.filter = "grayscale(50%)";
      card.style.pointerEvents = "none";
    } else {
      albumWrapper.style.display = "block";
      card.style.opacity = "1";
      card.style.filter = "none";
      card.style.pointerEvents = "auto";
    }

    // Show voting circles if voting is active AND it's not the user's album AND user hasn't voted yet
    if (votingActive && !isUserAlbum && !window.userHasVotedThisMonth) {
      console.log("Creating vote circles for album:", album.title);
      const voteCircles = document.createElement("div");
      voteCircles.className = "album-vote-circles";

      const vote3Circle = document.createElement("div");
      vote3Circle.className = "album-vote-circle vote-3";
      vote3Circle.textContent = "3";
      vote3Circle.dataset.albumId = album.id;
      vote3Circle.addEventListener("click", (e) => {
        e.stopPropagation();
        selectVote(album.id, 3);
      });

      const vote1Circle = document.createElement("div");
      vote1Circle.className = "album-vote-circle vote-1";
      vote1Circle.textContent = "1";
      vote1Circle.dataset.albumId = album.id;
      vote1Circle.addEventListener("click", (e) => {
        e.stopPropagation();
        selectVote(album.id, 1);
      });

      voteCircles.appendChild(vote3Circle);
      voteCircles.appendChild(vote1Circle);
      albumWrapper.appendChild(voteCircles);
    }

    // Show vote avatars if voting is active and there are votes
    if (votingActive && album.votes && Object.keys(album.votes).length > 0) {
      const voteAvatarsContainer = document.createElement("div");
      voteAvatarsContainer.style.display = "flex";
      voteAvatarsContainer.style.gap = "8px";
      voteAvatarsContainer.style.justifyContent = "center";
      voteAvatarsContainer.style.marginBottom = "10px";
      voteAvatarsContainer.style.flexWrap = "wrap";

      Object.entries(album.votes).forEach(([voterEmail, points]) => {
        const participant = window.currentParticipants?.find(
          (p) => p.email === voterEmail
        );
        if (participant) {
          // Get participant's color
          const participantElement = document.querySelector(
            `.participant[data-email="${voterEmail}"]`
          );
          const colorIndex = participantElement?.dataset.colorIndex || 0;
          const colors = getParticipantColors();
          const participantColor = colors[colorIndex % colors.length];

          const voteAvatar = document.createElement("div");
          voteAvatar.style.position = "relative";
          voteAvatar.style.display = "flex";
          voteAvatar.style.flexDirection = "column";
          voteAvatar.style.alignItems = "center";

          // Points emoji above avatar
          const pointsEmoji = document.createElement("div");
          pointsEmoji.style.fontSize = "20px";
          pointsEmoji.style.marginBottom = "4px";
          pointsEmoji.textContent = points === 3 ? "🥇" : "🥈";
          voteAvatar.appendChild(pointsEmoji);

          // Avatar
          const avatar = document.createElement("img");
          avatar.src = participant.picture;
          avatar.alt = participant.name;
          avatar.dataset.voterEmail = voterEmail; // Add email as data attribute
          avatar.style.width = "32px";
          avatar.style.height = "32px";
          avatar.style.borderRadius = "50%";
          avatar.style.border = `2px solid ${participantColor.border}`;
          avatar.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
          avatar.title = `${participant.name}: ${points} points`;

          // Fallback to consistent animal emoji if image fails
          avatar.onerror = () => {
            const emoji = getAnimalEmojiForUser(voterEmail);
            const emojiSpan = document.createElement("div");
            emojiSpan.textContent = emoji;
            emojiSpan.dataset.voterEmail = voterEmail; // Add email to emoji fallback too
            emojiSpan.style.fontSize = "32px";
            emojiSpan.style.width = "32px";
            emojiSpan.style.height = "32px";
            emojiSpan.style.display = "flex";
            emojiSpan.style.alignItems = "center";
            emojiSpan.style.justifyContent = "center";
            emojiSpan.title = `${participant.name}: ${points} points`;
            avatar.replaceWith(emojiSpan);
          };

          voteAvatar.appendChild(avatar);

          voteAvatarsContainer.appendChild(voteAvatar);
        }
      });

      albumWrapper.appendChild(voteAvatarsContainer);
    }
    // Show vote results with avatars if voting is not active and there are votes
    else if (
      !votingActive &&
      album.votes &&
      Object.keys(album.votes).length > 0
    ) {
      const totalVotes = Object.values(album.votes).reduce(
        (sum, points) => sum + points,
        0
      );

      // Total points badge at the top
      const voteBadge = document.createElement("div");
      voteBadge.style.textAlign = "center";
      voteBadge.style.marginBottom = "10px";
      voteBadge.style.fontSize = "24px";
      voteBadge.style.fontWeight = "700";
      voteBadge.style.color = "#ffd700";
      voteBadge.style.textShadow = "0 2px 4px rgba(0,0,0,0.5)";
      voteBadge.textContent = `${totalVotes} pts`;
      albumWrapper.appendChild(voteBadge);

      // Show who voted with avatars
      const voteAvatarsContainer = document.createElement("div");
      voteAvatarsContainer.style.display = "flex";
      voteAvatarsContainer.style.gap = "8px";
      voteAvatarsContainer.style.justifyContent = "center";
      voteAvatarsContainer.style.marginBottom = "10px";
      voteAvatarsContainer.style.flexWrap = "wrap";

      Object.entries(album.votes).forEach(([voterEmail, points]) => {
        const participant = window.currentParticipants?.find(
          (p) => p.email === voterEmail
        );
        if (participant) {
          // Get participant's color
          const participantElement = document.querySelector(
            `.participant[data-email="${voterEmail}"]`
          );
          const colorIndex = participantElement?.dataset.colorIndex || 0;
          const colors = getParticipantColors();
          const participantColor = colors[colorIndex % colors.length];

          const voteAvatar = document.createElement("div");
          voteAvatar.style.position = "relative";
          voteAvatar.style.display = "flex";
          voteAvatar.style.flexDirection = "column";
          voteAvatar.style.alignItems = "center";

          // Points emoji above avatar
          const pointsEmoji = document.createElement("div");
          pointsEmoji.style.fontSize = "20px";
          pointsEmoji.style.marginBottom = "4px";
          pointsEmoji.textContent = points === 3 ? "🥇" : "🥈";
          voteAvatar.appendChild(pointsEmoji);

          // Avatar
          const avatar = document.createElement("img");
          avatar.src = participant.picture;
          avatar.alt = participant.name;
          avatar.dataset.voterEmail = voterEmail; // Add email as data attribute
          avatar.style.width = "32px";
          avatar.style.height = "32px";
          avatar.style.borderRadius = "50%";
          avatar.style.border = `2px solid ${participantColor.border}`;
          avatar.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
          avatar.title = `${participant.name}: ${points} points`;

          // Fallback to consistent animal emoji if image fails
          avatar.onerror = () => {
            const emoji = getAnimalEmojiForUser(voterEmail);
            const emojiSpan = document.createElement("div");
            emojiSpan.textContent = emoji;
            emojiSpan.dataset.voterEmail = voterEmail; // Add email to emoji fallback too
            emojiSpan.style.fontSize = "32px";
            emojiSpan.style.width = "32px";
            emojiSpan.style.height = "32px";
            emojiSpan.style.display = "flex";
            emojiSpan.style.alignItems = "center";
            emojiSpan.style.justifyContent = "center";
            emojiSpan.title = `${participant.name}: ${points} points`;
            avatar.replaceWith(emojiSpan);
          };

          voteAvatar.appendChild(avatar);

          voteAvatarsContainer.appendChild(voteAvatar);
        }
      });

      albumWrapper.appendChild(voteAvatarsContainer);
    }

    // Otherwise show external links circles
    if (
      album.externalLinks &&
      album.externalLinks.length > 0 &&
      !votingActive
    ) {
      album.externalLinks.forEach((link, linkIndex) => {
        const linkCircle = document.createElement("a");
        linkCircle.href = link.url;
        linkCircle.target = "_blank";
        linkCircle.className = "external-link-circle";
        linkCircle.title = link.name;
        linkCircle.textContent = link.name.charAt(0).toUpperCase();
        linkCircle.style.left = `${8 + linkIndex * 40}px`;
        linkCircle.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        card.appendChild(linkCircle);
      });
    }

    card.appendChild(cover);
    card.appendChild(info);
    albumWrapper.appendChild(card);

    // Add track list as separate div below the album card (inside wrapper)
    if (album.tracks && album.tracks.length > 0) {
      const tracksContainer = document.createElement("div");
      tracksContainer.className = "album-tracks";
      tracksContainer.dataset.albumId = album.id;

      album.tracks.forEach((track) => {
        const trackItem = document.createElement("div");
        trackItem.className = "track-item";

        const trackText = document.createElement("span");
        trackText.className = "track-text";
        trackText.textContent = `${track.position}. ${track.title}`;
        trackItem.appendChild(trackText);

        // Add ratings container for all users who rated this track (also hosts note indicator)
        const trackRatings = album.trackRatings || {};
        const trackKey = `${track.position}-${track.title}`;
        const ratingsContainer = document.createElement("div");
        ratingsContainer.className = "track-ratings-container";

        let hasNotes = false;

        // Check all users' ratings and notes for this track
        Object.entries(trackRatings).forEach(([userEmail, userRating]) => {
          // Detect notes for this user on this track
          try {
            if (
              userRating.notes &&
              userRating.notes[trackKey] &&
              userRating.notes[trackKey].visible === true &&
              userRating.notes[trackKey].text &&
              userRating.notes[trackKey].text.trim() !== ""
            ) {
              hasNotes = true;
            }
          } catch (e) {
            // ignore malformed entries
          }

          let ratingType = null;

          if (userRating.favorite === trackKey) {
            ratingType = "favorite";
          } else if (userRating.leastFavorite === trackKey) {
            ratingType = "least";
          } else if (userRating.liked && userRating.liked.includes(trackKey)) {
            ratingType = "liked";
          } else if (
            userRating.disliked &&
            userRating.disliked.includes(trackKey)
          ) {
            ratingType = "disliked";
          }

          if (ratingType) {
            // Find participant to get their picture
            const participant = window.currentParticipants?.find(
              (p) => p.email === userEmail
            );
            if (participant) {
              // Determine if this particular user has a visible note for this track
              let userHasNote = false;
              try {
                userHasNote = !!(
                  userRating.notes &&
                  userRating.notes[trackKey] &&
                  userRating.notes[trackKey].visible === true &&
                  userRating.notes[trackKey].text &&
                  userRating.notes[trackKey].text.trim() !== ""
                );
              } catch (e) {
                userHasNote = false;
              }
              addRatingIndicator(
                ratingsContainer,
                ratingType,
                participant,
                userHasNote
              );
            }
          }
        });

        // (note indicator removed — overlay on avatars handles per-user notes)

        // If current user has a visible note for this track but hasn't rated it,
        // show their avatar with the note overlay so they see their note marker.
        try {
          if (currentUser && currentUser.email) {
            const myRating = trackRatings[currentUser.email];
            let iRated = false;
            if (myRating) {
              const myKey = trackKey;
              if (
                myRating.favorite === myKey ||
                myRating.leastFavorite === myKey ||
                (myRating.liked && myRating.liked.includes(myKey)) ||
                (myRating.disliked && myRating.disliked.includes(myKey))
              ) {
                iRated = true;
              }
            }

            // Check if current user's note is visible to others
            let myHasVisibleNote = false;
            if (
              myRating &&
              myRating.notes &&
              myRating.notes[trackKey] &&
              myRating.notes[trackKey].visible === true &&
              myRating.notes[trackKey].text &&
              myRating.notes[trackKey].text.trim() !== ""
            ) {
              myHasVisibleNote = true;
            }

            if (myHasVisibleNote && !iRated) {
              // find participant info for current user
              const me = window.currentParticipants?.find(
                (p) => p.email === currentUser.email
              );
              if (me) {
                addRatingIndicator(ratingsContainer, null, me, true);
              }
            }
          }
        } catch (e) {
          /* ignore */
        }

        if (ratingsContainer.children.length > 0) {
          trackItem.appendChild(ratingsContainer);
        }

        // Add click handler to open rating modal
        trackItem.addEventListener("click", () => {
          if (currentUser) {
            showRateTrackModal(album.id, track, album.trackRatings || {});
          }
        });

        tracksContainer.appendChild(trackItem);
      });

      albumWrapper.appendChild(tracksContainer);
    }

    albumsGrid.appendChild(albumWrapper);
  });
}

// Highlight participant when hovering over their album
function highlightParticipant(email) {
  const participant = document.querySelector(
    `.participant[data-email="${email}"]`
  );
  if (participant) {
    participant.classList.add("highlighted");

    // Get participant's color
    const colorIndex = participant.dataset.colorIndex;
    const colors = getParticipantColors();
    const color = colors[colorIndex % colors.length];

    // Apply custom color
    participant.style.setProperty("--highlight-border", color.border);
    participant.style.setProperty("--highlight-shadow", color.shadow);
  }
}

// Remove highlight from participant
function unhighlightParticipant(email) {
  const participant = document.querySelector(
    `.participant[data-email="${email}"]`
  );
  if (participant) {
    participant.classList.remove("highlighted");
  }
}

// Participant color palette (constant to avoid recreation)
const PARTICIPANT_COLORS = [
  { border: "rgba(102, 126, 234, 0.8)", shadow: "rgba(102, 126, 234, 0.6)" }, // Purple
  { border: "rgba(245, 87, 108, 0.8)", shadow: "rgba(245, 87, 108, 0.6)" }, // Pink
  { border: "rgba(52, 211, 153, 0.8)", shadow: "rgba(52, 211, 153, 0.6)" }, // Green
  { border: "rgba(251, 191, 36, 0.8)", shadow: "rgba(251, 191, 36, 0.6)" }, // Yellow
  { border: "rgba(239, 68, 68, 0.8)", shadow: "rgba(239, 68, 68, 0.6)" }, // Red
  { border: "rgba(59, 130, 246, 0.8)", shadow: "rgba(59, 130, 246, 0.6)" }, // Blue
  { border: "rgba(168, 85, 247, 0.8)", shadow: "rgba(168, 85, 247, 0.6)" }, // Violet
  { border: "rgba(236, 72, 153, 0.8)", shadow: "rgba(236, 72, 153, 0.6)" }, // Magenta
];

// Get participant color palette
function getParticipantColors() {
  return PARTICIPANT_COLORS;
}

// Add rating indicator to track item
function addRatingIndicator(container, type, participant, hasNote = false) {
  const ratingDiv = document.createElement("div");
  ratingDiv.className = "track-rating";

  // Add user email as data attribute for highlighting
  if (participant && participant.email) {
    ratingDiv.dataset.userEmail = participant.email;
  }

  // Add user avatar
  if (participant && participant.picture) {
    const avatar = document.createElement("img");
    avatar.className = "track-rating-avatar";
    avatar.src = participant.picture;
    avatar.alt = `${participant.name}'s rating`;
    avatar.title = participant.name;

    // Fallback to consistent animal emoji if image fails
    avatar.onerror = () => {
      const emoji = getAnimalEmojiForUser(participant.email);
      const emojiSpan = document.createElement("div");
      emojiSpan.textContent = emoji;
      emojiSpan.className = "track-rating-avatar";
      emojiSpan.style.fontSize = "18px";
      emojiSpan.style.display = "flex";
      emojiSpan.style.alignItems = "center";
      emojiSpan.style.justifyContent = "center";
      emojiSpan.style.width = "24px";
      emojiSpan.style.height = "24px";
      emojiSpan.style.borderRadius = "50%";
      emojiSpan.title = participant.name;
      avatar.replaceWith(emojiSpan);
    };

    ratingDiv.appendChild(avatar);
  }

  // If the user has a note for this track, add a small overlay on their avatar
  if (hasNote) {
    const noteOverlay = document.createElement("span");
    noteOverlay.className = "note-overlay";
    noteOverlay.textContent = "📝";
    noteOverlay.title = "User has notes";
    ratingDiv.appendChild(noteOverlay);
  }

  // Add emoji based on rating type (only if a type is provided)
  if (type) {
    const emoji = document.createElement("span");
    emoji.className = "track-rating-emoji";

    if (type === "favorite") {
      emoji.textContent = "⭐";
      emoji.style.color = "#fbbf24";
    } else if (type === "least") {
      emoji.textContent = "💔";
      emoji.style.color = "#ef4444";
    } else if (type === "liked") {
      emoji.textContent = "👍";
      emoji.style.color = "#22c55e";
    } else if (type === "disliked") {
      emoji.textContent = "👎";
      emoji.style.color = "#ef4444";
    }

    ratingDiv.appendChild(emoji);
  }
  container.appendChild(ratingDiv);
}

// Store current rating context
let currentRatingContext = null;
let trackPlayer = null;

// Show rate track modal
async function showRateTrackModal(albumId, track, allTrackRatings = {}) {
  if (!currentUser) {
    await showCustomAlert("You must be signed in to rate tracks.");
    return;
  }

  // Check if user joined the discussion for this month
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);

  currentRatingContext = {
    albumId,
    track,
    currentRatings: allTrackRatings,
  };

  const modal = document.getElementById("rateTrackModal");
  const trackNameEl = document.getElementById("rateTrackName");
  trackNameEl.textContent = `${track.position}. ${track.title}`;

  // Update modal title depending on participation
  try {
    const modalTitle = document.getElementById("rateTrackModalTitle");
    if (modalTitle) {
      modalTitle.textContent = isParticipant
        ? "Rate Track"
        : "Join discussion to rate and take notes";
      if (!isParticipant) {
        modalTitle.classList.add("join-title");
      } else {
        modalTitle.classList.remove("join-title");
      }
    }
  } catch (e) {
    // ignore
  }

  // Clear existing avatars from buttons
  document
    .querySelectorAll(".rating-btn .rating-avatars")
    .forEach((el) => el.remove());

  // Load user's notes for this specific track from ratings
  const trackKey = `${track.position}-${track.title}`;
  const notesTextarea = document.getElementById("trackNotesTextarea");
  const visibilityToggle = document.getElementById("notesVisibilityToggle");

  // Disable rating and notes if user is not a participant
  const ratingButtonIds = [
    "rateFavorite",
    "rateLeast",
    "rateLiked",
    "rateDisliked",
  ];
  if (!isParticipant) {
    // Disable buttons
    ratingButtonIds.forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        b.disabled = true;
        b.classList.add("disabled");
        b.title = "Join the discussion to rate tracks";
      }
    });

    // Disable notes textarea and visibility toggle
    if (notesTextarea) {
      notesTextarea.disabled = true;
      notesTextarea.placeholder = "Join the discussion to add notes";
    }
    if (visibilityToggle) {
      visibilityToggle.disabled = true;
      visibilityToggle.setAttribute("aria-disabled", "true");
    }
  } else {
    // Ensure enabled
    ratingButtonIds.forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        b.disabled = false;
        b.classList.remove("disabled");
        b.title = "";
      }
    });
    if (notesTextarea) notesTextarea.disabled = false;
    if (visibilityToggle) {
      visibilityToggle.disabled = false;
      visibilityToggle.removeAttribute("aria-disabled");
    }
  }

  // Build a map of notes for this track from allTrackRatings
  const trackNotesForThisTrack = {};
  Object.entries(allTrackRatings).forEach(([userEmail, userRating]) => {
    if (userRating && userRating.notes && userRating.notes[trackKey]) {
      trackNotesForThisTrack[userEmail] = userRating.notes[trackKey];
    }
  });

  const userNote = trackNotesForThisTrack[currentUser.email];

  if (userNote) {
    notesTextarea.value = userNote.text || "";
    if (userNote.visible) {
      visibilityToggle.classList.remove("private");
    } else {
      visibilityToggle.classList.add("private");
    }
  } else {
    notesTextarea.value = "";
    visibilityToggle.classList.add("private"); // Default to private
  }

  // Update visibility label text
  try {
    const visibilityLabel = document.getElementById("notesVisibilityLabel");
    if (visibilityLabel) {
      const isPrivate = visibilityToggle.classList.contains("private");
      visibilityLabel.textContent = isPrivate
        ? "Visible only to you"
        : "Visible to others";
      // Update class for color state
      if (isPrivate) {
        visibilityLabel.classList.remove("visible-others");
      } else {
        visibilityLabel.classList.add("visible-others");
      }
    }
  } catch (e) {
    // ignore
  }

  // Display other users' visible notes (pass per-track notes map)
  displayOtherUsersNotes(trackNotesForThisTrack);

  // Convert full trackRatings to track-specific format for avatar display
  // trackKey already declared above
  const trackSpecificRatings = {};

  Object.entries(allTrackRatings).forEach(([userEmail, userRating]) => {
    if (userRating.favorite === trackKey) {
      trackSpecificRatings[userEmail] = "favorite";
    } else if (userRating.leastFavorite === trackKey) {
      trackSpecificRatings[userEmail] = "least";
    } else if (userRating.liked && userRating.liked.includes(trackKey)) {
      trackSpecificRatings[userEmail] = "liked";
    } else if (userRating.disliked && userRating.disliked.includes(trackKey)) {
      trackSpecificRatings[userEmail] = "disliked";
    }
  });

  // Render avatars using helper so UI can be refreshed dynamically
  renderRatingAvatars(track, allTrackRatings);

  modal.classList.remove("hidden");

  // Load YouTube player if we have a video ID
  if (track.videoId) {
    loadTrackPlayer(track.videoId);
  }
}

// Display other users' visible notes
function displayOtherUsersNotes(allTrackNotes) {
  const container = document.getElementById("otherUsersNotes");
  container.innerHTML = "";

  const visibleNotes = Object.entries(allTrackNotes).filter(
    ([email, note]) => note.visible && email !== currentUser.email && note.text
  );

  if (visibleNotes.length === 0) {
    return;
  }

  const title = document.createElement("div");
  title.className = "other-users-notes-title";
  title.textContent = "Participants Notes";
  container.appendChild(title);

  visibleNotes.forEach(([email, note]) => {
    const participant = window.currentParticipants?.find(
      (p) => p.email === email
    );
    if (!participant) return;

    const card = document.createElement("div");
    card.className = "user-note-card";

    const header = document.createElement("div");
    header.className = "user-note-header";

    const avatar = document.createElement("img");
    avatar.className = "user-note-avatar";
    avatar.src = participant.picture;
    avatar.alt = participant.name;
    avatar.onerror = () => {
      const emoji = getAnimalEmojiForUser(email);
      const emojiSpan = document.createElement("div");
      emojiSpan.textContent = emoji;
      emojiSpan.style.fontSize = "20px";
      avatar.replaceWith(emojiSpan);
    };

    const name = document.createElement("div");
    name.className = "user-note-name";
    name.textContent = participant.name.split(" ")[0];

    header.appendChild(avatar);
    header.appendChild(name);

    const text = document.createElement("div");
    text.className = "user-note-text";
    text.textContent = note.text;

    card.appendChild(header);
    card.appendChild(text);
    container.appendChild(card);
  });
}

// Render rating avatars for a given track and ratings map
function renderRatingAvatars(track, allTrackRatings = {}) {
  // Clear existing avatars
  document
    .querySelectorAll(".rating-btn .rating-avatars")
    .forEach((el) => el.remove());

  const trackKey = `${track.position}-${track.title}`;
  const trackSpecificRatings = {};

  Object.entries(allTrackRatings).forEach(([userEmail, userRating]) => {
    if (userRating.favorite === trackKey) {
      trackSpecificRatings[userEmail] = "favorite";
    } else if (userRating.leastFavorite === trackKey) {
      trackSpecificRatings[userEmail] = "least";
    } else if (userRating.liked && userRating.liked.includes(trackKey)) {
      trackSpecificRatings[userEmail] = "liked";
    } else if (userRating.disliked && userRating.disliked.includes(trackKey)) {
      trackSpecificRatings[userEmail] = "disliked";
    }
  });

  if (Object.keys(trackSpecificRatings).length === 0) return;

  const ratingTypes = {
    favorite: "rateFavorite",
    least: "rateLeast",
    liked: "rateLiked",
    disliked: "rateDisliked",
  };

  Object.entries(ratingTypes).forEach(([ratingType, buttonId]) => {
    const button = document.getElementById(buttonId);
    if (!button) return;

    const usersWithRating = Object.entries(trackSpecificRatings)
      .filter(([email, rating]) => rating === ratingType)
      .map(([email]) => email);

    if (usersWithRating.length > 0) {
      const avatarsContainer = document.createElement("div");
      avatarsContainer.className = "rating-avatars";
      avatarsContainer.style.display = "flex";
      avatarsContainer.style.gap = "4px";
      avatarsContainer.style.marginTop = "8px";
      avatarsContainer.style.justifyContent = "center";
      avatarsContainer.style.flexWrap = "wrap";

      usersWithRating.forEach((email) => {
        const participant = window.currentParticipants?.find(
          (p) => p.email === email
        );
        if (participant) {
          const avatar = document.createElement("img");
          avatar.src = participant.picture;
          avatar.alt = participant.name;
          avatar.style.width = "20px";
          avatar.style.height = "20px";
          avatar.style.borderRadius = "50%";
          avatar.style.border = "1px solid rgba(255, 255, 255, 0.3)";
          avatar.title = participant.name;

          avatar.onerror = () => {
            const emoji = getAnimalEmojiForUser(email);
            const emojiSpan = document.createElement("div");
            emojiSpan.textContent = emoji;
            emojiSpan.style.fontSize = "16px";
            emojiSpan.style.width = "20px";
            emojiSpan.style.height = "20px";
            emojiSpan.style.display = "flex";
            emojiSpan.style.alignItems = "center";
            emojiSpan.style.justifyContent = "center";
            emojiSpan.title = participant.name;
            avatar.replaceWith(emojiSpan);
          };

          avatarsContainer.appendChild(avatar);
        }
      });

      button.appendChild(avatarsContainer);
    }
  });
}

// Toggle notes visibility
function toggleNotesVisibility() {
  try {
    const toggle = document.getElementById("notesVisibilityToggle");
    const label = document.getElementById("notesVisibilityLabel");

    console.log("toggleNotesVisibility called");

    if (!toggle) return;

    if (toggle.disabled) {
      console.log(
        "toggleNotesVisibility: toggle is disabled for non-participants"
      );
      return;
    }

    toggle.classList.toggle("private");

    // update aria-pressed for accessibility
    const pressed = !toggle.classList.contains("private");
    try {
      toggle.setAttribute("aria-pressed", pressed ? "true" : "false");
    } catch (e) {}

    if (label) {
      const isPrivate = toggle.classList.contains("private");
      label.textContent = isPrivate
        ? "Visible only to you"
        : "Visible to others";
      if (isPrivate) {
        label.classList.remove("visible-others");
      } else {
        label.classList.add("visible-others");
      }
    }
  } catch (e) {
    console.error("Error in toggleNotesVisibility:", e);
  }
}

// Save track notes
async function saveTrackNotes(options = {}) {
  const { silent = false } = options || {};
  if (!db || !currentUser || !currentRatingContext) {
    return;
  }

  // Prevent non-participants from saving notes
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);
  if (!isParticipant) {
    if (!silent) {
      await showCustomAlert(
        "Join the discussion to add notes.",
        "Join to Participate"
      );
    }
    return;
  }
  const { albumId, track, currentRatings } = currentRatingContext;
  const trackKey = `${track.position}-${track.title}`;
  const textarea = document.getElementById("trackNotesTextarea");
  const visibilityToggle = document.getElementById("notesVisibilityToggle");
  const noteText = textarea.value.trim();
  const isVisible = !visibilityToggle.classList.contains("private");

  // Work with a copy of the ratings object
  const updatedAllRatings = { ...(currentRatings || {}) };

  // Ensure current user's rating object exists
  if (!updatedAllRatings[currentUser.email]) {
    updatedAllRatings[currentUser.email] = {};
  }

  const userRatingObj = { ...(updatedAllRatings[currentUser.email] || {}) };
  const userNotes = { ...(userRatingObj.notes || {}) };

  if (noteText) {
    userNotes[trackKey] = {
      text: noteText,
      visible: isVisible,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    console.log(
      "Adding/updating note for user:",
      currentUser.email,
      "on track",
      trackKey
    );
  } else {
    // Remove note if text is empty
    delete userNotes[trackKey];
    console.log(
      "Removing note for user:",
      currentUser.email,
      "on track",
      trackKey
    );
  }

  // Assign notes back to user's rating object
  userRatingObj.notes = userNotes;
  updatedAllRatings[currentUser.email] = userRatingObj;

  try {
    const docRef = db.collection("albums").doc(albumId);
    console.log("Updating Firestore doc (trackRatings):", docRef.path);
    await docRef.update({
      trackRatings: updatedAllRatings,
    });

    if (!silent) {
      await showCustomAlert("Notes saved successfully!", "Success");
    } else {
      // gentle visual confirmation for auto-save
      showToast("Notes auto-saved");
      console.log("Notes saved silently");
    }

    // Update context with new ratings
    currentRatingContext.currentRatings = updatedAllRatings;

    // Update original note state so unsaved-change detection doesn't trigger
    try {
      currentRatingContext.originalNoteText = noteText || "";
      currentRatingContext.originalNoteVisible = isVisible;
    } catch (e) {
      // ignore
    }

    // Update the album in window.currentAlbums so the data stays fresh
    if (window.currentAlbums) {
      const albumIndex = window.currentAlbums.findIndex(
        (a) => a.id === albumId
      );
      if (albumIndex !== -1) {
        window.currentAlbums[albumIndex].trackRatings = updatedAllRatings;
        console.log("✓ Updated album.trackRatings in window.currentAlbums");
      }
    }

    // Build per-track notes map and refresh display
    const trackNotesForThisTrack = {};
    Object.entries(updatedAllRatings).forEach(([userEmail, userRating]) => {
      if (userRating && userRating.notes && userRating.notes[trackKey]) {
        trackNotesForThisTrack[userEmail] = userRating.notes[trackKey];
      }
    });

    displayOtherUsersNotes(trackNotesForThisTrack);
  } catch (error) {
    console.error("Error saving track notes:", error);
    await showCustomAlert(`Failed to save notes: ${error.message}`, "Error");
  }
}

// Load YouTube IFrame API
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    return;
  }

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Initialize YouTube player when API is ready
function onYouTubeIframeAPIReady() {
  // API is ready, players can now be created
}

// Load track player
function loadTrackPlayer(videoId) {
  // Ensure YouTube API is loaded
  if (!window.YT || !window.YT.Player) {
    loadYouTubeAPI();
    // Wait and retry
    setTimeout(() => loadTrackPlayer(videoId), 500);
    return;
  }

  // Destroy existing player if any
  if (trackPlayer) {
    trackPlayer.destroy();
  }

  // Create new player
  trackPlayer = new YT.Player("trackPlayer", {
    height: "200",
    width: "100%",
    videoId: videoId,
    playerVars: {
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
    },
  });
}

// Close rate track modal
async function closeRateTrackModal() {
  const modal = document.getElementById("rateTrackModal");

  // Attempt to auto-save notes silently if there are changes
  try {
    if (currentRatingContext) {
      // call saveTrackNotes silently; it will update context/original state
      await saveTrackNotes({ silent: true });
    }
  } catch (e) {
    console.warn("Auto-save before close failed:", e);
    // proceed to close anyway
  }

  modal.classList.add("hidden");

  // Destroy player if it exists
  if (trackPlayer) {
    trackPlayer.destroy();
    trackPlayer = null;
  }

  // Clear player container
  const playerContainer = document.getElementById("trackPlayer");
  if (playerContainer) {
    playerContainer.innerHTML = "";
  }

  currentRatingContext = null;
  // Refresh overview when modal is closed
  try {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    loadAlbums(monthKey);
  } catch (e) {
    console.warn("Failed to refresh albums after closing modal:", e);
  }
}

// Apply track rating
async function applyTrackRating(ratingType) {
  if (!db || !currentUser || !currentRatingContext) {
    return;
  }

  // Prevent non-participants from applying ratings
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);
  if (!isParticipant) {
    await showCustomAlert(
      "Join the discussion to rate tracks.",
      "Join to Participate"
    );
    return;
  }

  const { albumId, track, currentRatings } = currentRatingContext;
  const trackKey = `${track.position}-${track.title}`;
  const userEmail = currentUser.email;
  const userRating = currentRatings[userEmail] || {};

  // Clone current ratings
  const updatedRatings = { ...currentRatings };
  const newUserRating = { ...userRating };

  if (ratingType === "favorite") {
    // Only one favorite allowed
    newUserRating.favorite = trackKey;
  } else if (ratingType === "least") {
    // Only one least favorite allowed
    newUserRating.leastFavorite = trackKey;
  } else if (ratingType === "liked") {
    // Multiple liked tracks allowed
    const liked = newUserRating.liked || [];
    if (liked.includes(trackKey)) {
      // Remove if already liked
      newUserRating.liked = liked.filter((k) => k !== trackKey);
    } else {
      // Add to liked
      newUserRating.liked = [...liked, trackKey];
      // Remove from disliked if it was there
      if (newUserRating.disliked) {
        newUserRating.disliked = newUserRating.disliked.filter(
          (k) => k !== trackKey
        );
      }
    }
  } else if (ratingType === "disliked") {
    // Multiple disliked tracks allowed
    const disliked = newUserRating.disliked || [];
    if (disliked.includes(trackKey)) {
      // Remove if already disliked
      newUserRating.disliked = disliked.filter((k) => k !== trackKey);
    } else {
      // Add to disliked
      newUserRating.disliked = [...disliked, trackKey];
      // Remove from liked if it was there
      if (newUserRating.liked) {
        newUserRating.liked = newUserRating.liked.filter((k) => k !== trackKey);
      }
    }
  }

  // Clean up empty arrays
  if (newUserRating.liked && newUserRating.liked.length === 0) {
    delete newUserRating.liked;
  }
  if (newUserRating.disliked && newUserRating.disliked.length === 0) {
    delete newUserRating.disliked;
  }

  // Update or remove user rating
  if (Object.keys(newUserRating).length > 0) {
    updatedRatings[userEmail] = newUserRating;
  } else {
    delete updatedRatings[userEmail];
  }

  try {
    await db.collection("albums").doc(albumId).update({
      trackRatings: updatedRatings,
    });

    // Update in-memory context so modal can reflect changes immediately
    try {
      if (currentRatingContext) {
        currentRatingContext.currentRatings = updatedRatings;

        // Refresh avatars in the open modal
        renderRatingAvatars(track, updatedRatings);

        // Update album in window.currentAlbums so overview stays fresh
        if (window.currentAlbums) {
          const albumIndex = window.currentAlbums.findIndex(
            (a) => a.id === albumId
          );
          if (albumIndex !== -1) {
            window.currentAlbums[albumIndex].trackRatings = updatedRatings;
          }
        }
      }
    } catch (e) {
      console.warn(
        "Error updating in-memory ratings after applyTrackRating:",
        e
      );
    }

    // Reload albums after rating (modal stays open)
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    loadAlbums(monthKey);
  } catch (error) {
    console.error("Error rating track:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);

    if (error.code === "permission-denied") {
      showCustomAlert(
        "Permission denied. You need to be signed in to rate tracks."
      );
    } else {
      showCustomAlert("Failed to save rating: " + error.message);
    }
  }
}

// Toggle highlight on participant's album when clicking their avatar
function toggleHighlightAlbum(email) {
  const albums = document.querySelectorAll(".album-card");
  const participant = document.querySelector(
    `.participant[data-email="${email}"]`
  );

  // Check if already highlighted
  const isHighlighted = participant?.classList.contains("highlighted");

  if (isHighlighted) {
    // Remove highlight from participant
    participant.classList.remove("highlighted");

    // Remove highlight from their album
    albums.forEach((album) => {
      if (album.dataset.addedBy === email) {
        album.classList.remove("highlighted-album");
        album.style.removeProperty("--highlight-border");
        album.style.removeProperty("--highlight-shadow");
      }
    });

    // Remove highlight from vote avatars
    document.querySelectorAll(".vote-avatar-highlight").forEach((el) => {
      el.classList.remove("vote-avatar-highlight");
      el.style.removeProperty("filter");
      el.style.removeProperty("transform");
    });

    // Remove highlight from track ratings
    document.querySelectorAll(".track-rating-highlight").forEach((el) => {
      el.classList.remove("track-rating-highlight");
      el.style.removeProperty("background");
      el.style.removeProperty("border-left");
      el.style.removeProperty("transform");
      el.style.removeProperty("box-shadow");
    });
  } else {
    // Remove all existing highlights first
    document
      .querySelectorAll(".participant.highlighted")
      .forEach((p) => p.classList.remove("highlighted"));
    document.querySelectorAll(".album-card.highlighted-album").forEach((a) => {
      a.classList.remove("highlighted-album");
      a.style.removeProperty("--highlight-border");
      a.style.removeProperty("--highlight-shadow");
    });
    document.querySelectorAll(".vote-avatar-highlight").forEach((el) => {
      el.classList.remove("vote-avatar-highlight");
      el.style.removeProperty("filter");
      el.style.removeProperty("transform");
      el.style.removeProperty("z-index");
    });
    document.querySelectorAll(".track-rating-highlight").forEach((el) => {
      el.classList.remove("track-rating-highlight");
      el.style.removeProperty("background");
      el.style.removeProperty("border-left");
      el.style.removeProperty("transform");
      el.style.removeProperty("box-shadow");
    });

    // Get participant's color
    const colorIndex = participant?.dataset.colorIndex;
    const colors = getParticipantColors();
    const color = colors[colorIndex % colors.length];

    // Add highlight to participant
    if (participant) {
      participant.classList.add("highlighted");
      participant.style.setProperty("--highlight-border", color.border);
      participant.style.setProperty("--highlight-shadow", color.shadow);
    }

    // Add highlight to their album
    albums.forEach((album) => {
      if (album.dataset.addedBy === email) {
        album.classList.add("highlighted-album");
        album.style.setProperty("--highlight-border", color.border);
        album.style.setProperty("--highlight-shadow", color.shadow);
      }
    });

    // Highlight their votes (vote avatars)
    document.querySelectorAll("[data-voter-email]").forEach((voteElement) => {
      if (voteElement.dataset.voterEmail === email) {
        voteElement.classList.add("vote-avatar-highlight");
        voteElement.style.filter = `drop-shadow(0 0 15px ${color.shadow}) drop-shadow(0 0 20px ${color.border})`;
        voteElement.style.transform = "scale(1.2)";
        voteElement.style.transition = "all 0.3s ease";
        voteElement.style.zIndex = "10";
      }
    });

    // Highlight their track ratings - highlight the whole track item
    document.querySelectorAll(".track-rating").forEach((rating) => {
      if (rating.dataset.userEmail === email) {
        // Find the parent track-item
        const trackItem = rating.closest(".track-item");
        if (trackItem) {
          trackItem.classList.add("track-rating-highlight");
          trackItem.style.background = `linear-gradient(135deg, ${color.border}20, ${color.shadow}20)`;
          trackItem.style.borderLeft = `4px solid ${color.border}`;
          trackItem.style.transform = "translateX(4px)";
          trackItem.style.transition = "all 0.3s ease";
          trackItem.style.boxShadow = `0 2px 8px ${color.shadow}`;
        }
      }
    });
  }
}

// Show voting warning modal
async function showVotingModal() {
  if (!currentUser) {
    await showCustomAlert("You must be signed in to vote.");
    return;
  }

  // Check album count first
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Check if user is a participant
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);

  if (!isParticipant) {
    showCustomAlert(
      "Only participants can vote. Please join the discussion first."
    );
    return;
  }

  // Load current month's albums to check count and locked status
  const snapshot = await db
    .collection("albums")
    .where("monthKey", "==", monthKey)
    .get();

  let albumCount = 0;
  let unlockedAlbums = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.addedBy !== currentUser.email) {
      albumCount++;
    }
    // Check if any album is not locked
    if (!data.locked) {
      unlockedAlbums.push(data.addedByName || data.addedBy);
    }
  });

  if (albumCount < 2) {
    showCustomAlert(
      "Voting requires at least 2 other albums (you need at least 3 total participants)."
    );
    return;
  }

  // Check if all albums are locked
  if (unlockedAlbums.length > 0) {
    const participantList = unlockedAlbums.join(", ");
    showCustomAlert(
      `All albums must be locked before voting can start.\n\nParticipants with unlocked albums: ${participantList}`
    );
    return;
  }

  // Show warning modal
  const warningModal = document.getElementById("votingWarningModal");
  warningModal.classList.remove("hidden");
}

// Close voting warning modal
function closeVotingWarningModal() {
  const warningModal = document.getElementById("votingWarningModal");
  warningModal.classList.add("hidden");
}

// Show second voting confirmation modal
function showVotingConfirmModal() {
  closeVotingWarningModal();
  const confirmModal = document.getElementById("votingConfirmModal");
  confirmModal.classList.remove("hidden");
}

// Close second voting confirmation modal
function closeVotingConfirmModal() {
  const confirmModal = document.getElementById("votingConfirmModal");
  confirmModal.classList.add("hidden");
}

// Confirm and start voting
async function confirmVotingStart() {
  closeVotingConfirmModal();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  try {
    console.log("Activating voting for:", monthKey);

    // Set votingActive flag on all albums for this month
    const snapshot = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .get();

    const batch = db.batch();
    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        votingActive: true,
        votingStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
        votingStartedBy: currentUser.email,
      });
    });

    await batch.commit();
    console.log("Voting activated successfully");

    // Set global flag
    window.currentVotingActive = true;

    // Show overlay animation
    showVotingOverlay();

    // Reload albums to show voting UI
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error starting voting:", error);
    showCustomAlert("Failed to start voting: " + error.message);
  }
}

// Show end voting confirmation modal
function showEndVotingConfirmModal() {
  // Only moderators can end voting
  if (!currentUser || !isModerator(currentUser.email)) {
    showCustomAlert("Only moderators can end voting.");
    return;
  }
  const modal = document.getElementById("endVotingConfirmModal");
  modal.classList.remove("hidden");
}

function closeEndVotingConfirmModal() {
  const modal = document.getElementById("endVotingConfirmModal");
  modal.classList.add("hidden");
}

// Confirm and end voting manually
async function confirmEndVoting() {
  closeEndVotingConfirmModal();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  try {
    console.log("Manually ending voting for:", monthKey);
    await endVotingAutomatically(monthKey);
    showCustomAlert("Voting has been ended.");
  } catch (error) {
    console.error("Error ending voting:", error);
    showCustomAlert("Failed to end voting: " + error.message);
  }
}

// Show reset voting confirmation modal
function showResetVotingConfirmModal() {
  // Only moderators can reset voting
  if (!currentUser || !isModerator(currentUser.email)) {
    showCustomAlert("Only moderators can reset voting.");
    return;
  }
  const modal = document.getElementById("resetVotingConfirmModal");
  modal.classList.remove("hidden");
}

function closeResetVotingConfirmModal() {
  const modal = document.getElementById("resetVotingConfirmModal");
  modal.classList.add("hidden");
}

// Confirm and reset voting
async function confirmResetVoting() {
  closeResetVotingConfirmModal();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  try {
    console.log("Resetting votes for:", monthKey);

    // Clear all votes from all albums for this month
    const snapshot = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .get();

    const batch = db.batch();
    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        votes: {},
        votingActive: false,
      });
    });

    await batch.commit();
    console.log("Votes reset successfully");

    // Set global flag
    window.currentVotingActive = false;

    showCustomAlert(
      "All votes have been reset. You can now start voting again."
    );

    // Reload albums to show cleared votes
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error resetting votes:", error);
    showCustomAlert("Failed to reset votes: " + error.message);
  }
}

// End voting automatically when all participants have voted
async function endVotingAutomatically(monthKey) {
  try {
    console.log("Ending voting automatically for:", monthKey);

    // Set votingActive flag to false on all albums for this month
    const snapshot = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .get();

    const batch = db.batch();
    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        votingActive: false,
      });
    });

    await batch.commit();
    console.log("Voting ended automatically - all participants have voted");

    // Set global flag
    window.currentVotingActive = false;

    showCustomAlert("All participants have voted! Voting is now complete.");

    // Reload albums to hide voting UI and show final results
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error ending voting:", error);
    showCustomAlert("Failed to end voting: " + error.message);
  }
}

// Show voting overlay animation
function showVotingOverlay() {
  const overlay = document.getElementById("votingOverlay");
  overlay.classList.remove("hidden");

  // Auto-hide after 3 seconds
  setTimeout(() => {
    overlay.classList.add("hidden");
  }, 3000);
}

// Voting system
let currentMonthVotes = {
  threePoints: null,
  onePoint: null,
};

// Select vote for an album (inline on album card)
async function selectVote(albumId, points) {
  if (!currentUser) {
    showCustomAlert("Please sign in to vote.");
    return;
  }

  // Check if user has already voted
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const albumsSnapshot = await db
    .collection("albums")
    .where("monthKey", "==", monthKey)
    .get();

  let userHasVoted = false;
  albumsSnapshot.forEach((doc) => {
    const votes = doc.data().votes || {};
    if (votes[currentUser.email]) {
      userHasVoted = true;
    }
  });

  if (userHasVoted) {
    showCustomAlert("You have already submitted your votes for this month.");
    return;
  }

  // Store previous votes
  const previousVotes = { ...currentMonthVotes };

  // Get list of votable albums (not user's own album)
  const votableAlbums = [];
  document.querySelectorAll(".album-vote-circle").forEach((circle) => {
    const id = circle.dataset.albumId;
    if (!votableAlbums.includes(id)) {
      votableAlbums.push(id);
    }
  });

  // Update selection - allow toggling and swapping
  if (points === 3) {
    // If clicking same album that already has 3, remove it
    if (currentMonthVotes.threePoints === albumId) {
      currentMonthVotes.threePoints = null;
    } else {
      // If this album already has 1 point, swap the votes
      if (currentMonthVotes.onePoint === albumId) {
        currentMonthVotes.onePoint = currentMonthVotes.threePoints;
        currentMonthVotes.threePoints = albumId;
      } else {
        currentMonthVotes.threePoints = albumId;
      }
    }
  } else if (points === 1) {
    // If clicking same album that already has 1, remove it
    if (currentMonthVotes.onePoint === albumId) {
      currentMonthVotes.onePoint = null;
    } else {
      // If this album already has 3 points, swap the votes
      if (currentMonthVotes.threePoints === albumId) {
        currentMonthVotes.threePoints = currentMonthVotes.onePoint;
        currentMonthVotes.onePoint = albumId;
      } else {
        currentMonthVotes.onePoint = albumId;
      }
    }
  }

  // Auto-assign remaining vote if only 2 albums to vote on
  if (votableAlbums.length === 2) {
    const otherAlbumId = votableAlbums.find((id) => id !== albumId);
    if (currentMonthVotes.threePoints && !currentMonthVotes.onePoint) {
      currentMonthVotes.onePoint = otherAlbumId;
    } else if (currentMonthVotes.onePoint && !currentMonthVotes.threePoints) {
      currentMonthVotes.threePoints = otherAlbumId;
    }
  }

  // Update UI to show selections
  updateVoteUI();

  // Show/hide submit button based on whether both votes are selected
  const submitBtn = document.getElementById("submitVotesBtn");
  if (
    submitBtn &&
    currentMonthVotes.threePoints &&
    currentMonthVotes.onePoint
  ) {
    submitBtn.style.display = "inline-block";
  } else if (submitBtn) {
    submitBtn.style.display = "none";
  }
}

// Update vote UI
function updateVoteUI() {
  document
    .querySelectorAll(".album-vote-circle")
    .forEach((circle) => circle.classList.remove("selected"));

  if (currentMonthVotes.threePoints) {
    const circle3 = document.querySelector(
      `.album-vote-circle.vote-3[data-album-id="${currentMonthVotes.threePoints}"]`
    );
    circle3?.classList.add("selected");
  }

  if (currentMonthVotes.onePoint) {
    const circle1 = document.querySelector(
      `.album-vote-circle.vote-1[data-album-id="${currentMonthVotes.onePoint}"]`
    );
    circle1?.classList.add("selected");
  }
}

// Submit votes
async function submitVotes() {
  if (!currentMonthVotes.threePoints || !currentMonthVotes.onePoint) {
    showCustomAlert(
      "Please select both votes (3 points and 1 point) before submitting."
    );
    return;
  }

  try {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

    // Check if user has already voted
    const vote3Album = db
      .collection("albums")
      .doc(currentMonthVotes.threePoints);
    const vote3Doc = await vote3Album.get();
    const existingVotes3 = vote3Doc.data().votes || {};

    if (existingVotes3[currentUser.email]) {
      showCustomAlert("You have already submitted your votes for this month.");
      return;
    }

    // Update vote counts for both albums
    const vote1Album = db.collection("albums").doc(currentMonthVotes.onePoint);

    await db.runTransaction(async (transaction) => {
      const vote3Doc = await transaction.get(vote3Album);
      const vote1Doc = await transaction.get(vote1Album);

      const votes3 = vote3Doc.data().votes || {};
      const votes1 = vote1Doc.data().votes || {};

      votes3[currentUser.email] = 3;
      votes1[currentUser.email] = 1;

      transaction.update(vote3Album, { votes: votes3 });
      transaction.update(vote1Album, { votes: votes1 });
    });

    showCustomAlert("Votes submitted successfully!");

    // Reset votes
    currentMonthVotes = {
      threePoints: null,
      onePoint: null,
    };

    // Hide submit button
    const submitBtn = document.getElementById("submitVotesBtn");
    if (submitBtn) {
      submitBtn.style.display = "none";
    }

    // Check if all participants have voted
    const participantsSnapshot = await db
      .collection("participants")
      .where("monthKey", "==", monthKey)
      .get();
    const totalParticipants = participantsSnapshot.size;

    // Get all albums and count unique voters
    const albumsSnapshot = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .get();

    const uniqueVoters = new Set();
    albumsSnapshot.forEach((doc) => {
      const votes = doc.data().votes || {};
      Object.keys(votes).forEach((email) => uniqueVoters.add(email));
    });

    // If all participants have voted, end voting automatically
    if (uniqueVoters.size >= totalParticipants) {
      await endVotingAutomatically(monthKey);
    } else {
      // Just reload albums to show updated votes
      await loadAlbums(monthKey);
    }
  } catch (error) {
    console.error("Error submitting votes:", error);
    showCustomAlert("Failed to submit votes: " + error.message);
  }
}

// Load albums from Firebase
async function loadAlbums(monthKey) {
  if (!db) {
    updateAlbums([]);
    updateAddAlbumButton([]);
    return;
  }

  try {
    const snapshot = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .get();

    let votingActive = false;
    const albums = [];
    snapshot.forEach((doc) => {
      const data = doc.data();

      // Check if voting is active from any album
      if (data.votingActive === true) {
        votingActive = true;
      }

      albums.push({
        id: doc.id,
        title: data.title,
        artist: data.artist,
        coverUrl: data.coverUrl,
        youtubeUrl: data.youtubeUrl,
        playlistId: data.playlistId || "",
        tracks: data.tracks || [],
        trackRatings: data.trackRatings || {},
        externalLinks: data.externalLinks || [],
        addedBy: data.addedBy,
        addedByName: data.addedByName,
        locked: data.locked || false,
        votes: data.votes || {},
        votingActive: data.votingActive || false,
        createdAt: data.createdAt,
      });
    });

    window.currentVotingActive = votingActive;
    console.log(
      "loadAlbums: Set window.currentVotingActive to",
      votingActive,
      "from",
      albums.length,
      "albums"
    );

    // Store albums in global variable for access by updateParticipants
    window.currentAlbums = albums;

    // Check if current user has already voted
    let userHasVoted = false;
    if (votingActive && currentUser) {
      albums.forEach((album) => {
        if (album.votes && album.votes[currentUser.email]) {
          userHasVoted = true;
        }
      });
    }

    // Set global flag so album rendering knows if user has voted
    window.userHasVotedThisMonth = userHasVoted;

    // Update voting status message
    const votingStatusMessage = document.getElementById("votingStatusMessage");
    if (votingStatusMessage && votingActive && userHasVoted && currentUser) {
      // Get all participants
      const participantsSnapshot = await db
        .collection("participants")
        .where("monthKey", "==", monthKey)
        .get();

      // Get all voters
      const uniqueVoters = new Set();
      albums.forEach((album) => {
        if (album.votes) {
          Object.keys(album.votes).forEach((email) => uniqueVoters.add(email));
        }
      });

      // Find who hasn't voted yet
      const waitingOn = [];
      participantsSnapshot.forEach((doc) => {
        const participant = doc.data();
        if (!uniqueVoters.has(participant.email)) {
          waitingOn.push(participant.name);
        }
      });

      if (waitingOn.length > 0) {
        votingStatusMessage.textContent = `⏳ Waiting on ${waitingOn.join(
          ", "
        )} to cast their vote${waitingOn.length > 1 ? "s" : ""}`;
        votingStatusMessage.style.display = "block";
      } else {
        votingStatusMessage.style.display = "none";
      }
    } else if (votingStatusMessage) {
      votingStatusMessage.style.display = "none";
    }

    // Show/hide voting buttons based on voting state and user vote status
    const submitBtn = document.getElementById("submitVotesBtn");
    const startBtn = document.getElementById("startVotingBtn");
    const endBtn = document.getElementById("endVotingBtn");
    const resetBtn = document.getElementById("resetVotingBtn");
    const votingModeTitle = document.getElementById("votingModeTitle");
    const userIsModerator = currentUser && isModerator(currentUser.email);

    // Show/hide "TIME TO CHOOSE" title based on voting state
    if (votingModeTitle) {
      votingModeTitle.style.display = votingActive ? "block" : "none";
    }

    if (submitBtn && startBtn && endBtn && resetBtn) {
      if (votingActive && !userHasVoted) {
        // User can still vote
        submitBtn.style.display = "none"; // Will show when both votes selected
        startBtn.style.display = "none";
        endBtn.style.display = userIsModerator ? "inline-block" : "none";
        resetBtn.style.display = userIsModerator ? "inline-block" : "none";
      } else if (votingActive && userHasVoted) {
        // User already voted, hide all buttons except end/reset for moderator
        submitBtn.style.display = "none";
        startBtn.style.display = "none";
        endBtn.style.display = userIsModerator ? "inline-block" : "none";
        resetBtn.style.display = userIsModerator ? "inline-block" : "none";
      } else {
        // Voting not active
        submitBtn.style.display = "none";
        endBtn.style.display = "none";

        // Check if there are any votes from a completed voting session
        const hasAnyVotes = albums.some(
          (album) => album.votes && Object.keys(album.votes).length > 0
        );

        // Get participant count to check if there are enough participants
        const participantsSnapshot = await db
          .collection("participants")
          .where("monthKey", "==", monthKey)
          .get();
        const participantCount = participantsSnapshot.size;

        // Only show Start Voting button if:
        // 1. There are NO votes yet
        // 2. There are at least 2 participants
        // 3. There are at least 2 albums
        const canStartVoting =
          !hasAnyVotes && participantCount >= 2 && albums.length >= 2;
        startBtn.style.display = canStartVoting ? "inline-block" : "none";

        // Show reset button if there are votes to reset (moderator only)
        resetBtn.style.display =
          userIsModerator && hasAnyVotes ? "inline-block" : "none";
      }
    }

    // Update the albums array
    updateAlbums(albums);
    updateAddAlbumButton(albums);

    // Update vote UI if voting is active
    if (votingActive) {
      updateVoteUI();
    }
  } catch (error) {
    console.error("Error loading albums:", error);
    updateAlbums([]);
    updateAddAlbumButton([]);
  }
}

// Show voting overlay animation
function showVotingOverlay() {
  const overlay = document.getElementById("votingOverlay");
  overlay.classList.remove("hidden");

  // Auto-hide after 3 seconds
  setTimeout(() => {
    overlay.classList.add("hidden");
  }, 3000);
}

// Custom alert function
// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Load YouTube API
loadYouTubeAPI();

// Make onYouTubeIframeAPIReady available globally
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
