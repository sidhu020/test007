
/************************************************
 EVENT CHECK-IN FRONTEND
************************************************/

const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbzUX7gozlnpERRSOTJcWMlZZhWE4bpGQpr2Oev2WzjgbFhGIzX3Jyfm9N9zO6FRNbd_/exec",

  // Change for each check-in station.
  DESK_NAME: "DESK-01"
};

let scanner = null;
let currentGuest = null;
let processing = false;

const $ = id => document.getElementById(id);

function showStatus(message, type = "") {
  const box = $("statusBox");

  box.textContent = message;
  box.className = "status-box " + type;
}

function resetGuest() {
  currentGuest = null;

  $("guestPanel").classList.add("hidden");
  $("guestPanel").classList.remove("already");

  $("guestCode").value = "";
}

/**
 * Communicate with Google Apps Script.
 */
async function apiRequest(data) {
  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error("API communication failed.");
  }

  return response.json();
}

/**
 * Lookup guest by QR or manual ID.
 */
async function lookupGuest(code) {
  if (processing) return;

  processing = true;
  showStatus("Verifying guest...", "");

  resetGuest();

  try {
    const result = await apiRequest({
      action: "lookup",
      code: code
    });

    if (!result.success) {
      showStatus(result.message, "error");
      return;
    }

    currentGuest = result.guest;

    displayGuest(result.guest);

  } catch (error) {
    showStatus(
      "Unable to contact server. Check your connection.",
      "error"
    );

  } finally {
    processing = false;
  }
}

/**
 * Display guest information.
 */
function displayGuest(guest) {
  $("guestPanel").classList.remove("hidden");

  $("guestName").textContent = guest.name;
  $("guestId").textContent = guest.id;
  $("rsvpStatus").textContent = guest.rsvp;
  $("checkinStatus").textContent = guest.checkin;

  const already =
    guest.checkin === "CHECKED IN";

  $("guestPanel").classList.toggle(
    "already",
    already
  );

  $("guestBadge").textContent = already
    ? "ALREADY CHECKED IN"
    : "GUEST FOUND";

  $("confirmBtn").disabled =
    already || guest.rsvp === "DECLINED";

  $("previousTime").textContent = already
    ? "Previous entry: " +
      (guest.timestamp
        ? new Date(guest.timestamp).toLocaleString()
        : "Time unavailable")
    : "";

  if (already) {
    showStatus(
      "Warning: This guest has already entered.",
      "error"
    );
  } else if (guest.rsvp === "DECLINED") {
    showStatus(
      "This guest declined the invitation.",
      "error"
    );
  } else {
    showStatus(
      "Guest verified. Confirm identity before entry.",
      "success-status"
    );
  }
}

/**
 * Commit confirmed guest entry.
 */
async function confirmCheckIn() {
  if (!currentGuest || processing) return;

  if (currentGuest.checkin === "CHECKED IN") {
    showStatus("Guest already checked in.", "error");
    return;
  }

  const confirmed = window.confirm(
    "Confirm entry for " + currentGuest.name + "?"
  );

  if (!confirmed) return;

  processing = true;
  $("confirmBtn").disabled = true;

  showStatus("Recording guest entry...", "");

  try {
    const result = await apiRequest({
      action: "commitCheckIn",
      id: currentGuest.id,
      operator: CONFIG.DESK_NAME
    });

    if (!result.success) {
      showStatus(result.message, "error");

      if (result.alreadyCheckedIn) {
        lookupGuest(currentGuest.id);
      }

      return;
    }

    showStatus(
      "SUCCESS! " + result.name + " checked in.",
      "success-status"
    );

    $("checkinStatus").textContent = "CHECKED IN";

    // Soft confirmation sound.
    playSuccessSound();

    // Keep confirmation visible briefly.
    setTimeout(() => {
      resetGuest();
      showStatus("Ready for next guest.");
    }, 2500);

  } catch (error) {
    showStatus(
      "Check-in failed. Please retry after verifying status.",
      "error"
    );

  } finally {
    processing = false;
  }
}

/**
 * Start camera.
 */
async function startScanner() {
  try {
    if (scanner) {
      await scanner.stop().catch(() => {});
      scanner = null;
    }

    scanner = new Html5Qrcode("reader");

    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 15,
        qrbox: {
          width: 240,
          height: 240
        },
        aspectRatio: 1
      },
      async decodedText => {
        if (processing || currentGuest) return;

        await scanner.stop();

        lookupGuest(decodedText);
      },
      () => {}
    );

    showStatus("Camera active. Scan a guest ticket.");

  } catch (error) {
    showStatus(
      "Camera unavailable. Use manual Guest ID entry.",
      "error"
    );
  }
}

/**
 * Stop camera.
 */
async function stopScanner() {
  if (scanner) {
    try {
      await scanner.stop();
    } catch (e) {}

    scanner = null;
  }

  showStatus("Camera stopped.");
}

/**
 * Confirmation chime.
 */
function playSuccessSound() {
  try {
    const audio = new AudioContext();

    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.frequency.value = 880;
    gain.gain.value = 0.07;

    oscillator.start();

    oscillator.stop(audio.currentTime + 0.15);

    oscillator.onended = () => audio.close();

  } catch (e) {
    // Audio is optional.
  }
}

/**
 * UI event bindings.
 */
document.addEventListener("DOMContentLoaded", () => {

  $("startBtn").addEventListener(
    "click",
    startScanner
  );

  $("stopBtn").addEventListener(
    "click",
    stopScanner
  );

  $("lookupBtn").addEventListener(
    "click",
    () => lookupGuest(
      $("guestCode").value.trim().toUpperCase()
    )
  );

  $("guestCode").addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        lookupGuest(
          $("guestCode").value.trim().toUpperCase()
        );
      }
    }
  );

  $("confirmBtn").addEventListener(
    "click",
    confirmCheckIn
  );

  $("cancelBtn").addEventListener(
    "click",
    () => {
      resetGuest();
      showStatus("Verification cancelled.");
    }
  );

});
