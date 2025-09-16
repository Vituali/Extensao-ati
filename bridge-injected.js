console.log("Site ATI: Ponte injetada INICIADA. Monitorando login...");

let lastKnownAttendant = null;

function notifyExtension(currentAttendant) {
  window.postMessage({
    type: "ATI_ATTENDANT_UPDATE",
    attendant: currentAttendant
  }, "*");
  console.log(`Site ATI: Mudança detectada: ${currentAttendant}`);
}

function checkAttendant() {
  const currentAttendant = localStorage.getItem("atendenteAtual");
  if (currentAttendant !== lastKnownAttendant) {
    lastKnownAttendant = currentAttendant;
    notifyExtension(currentAttendant);
  }
}

// em vez de martelar com setInterval
window.addEventListener("storage", (event) => {
  if (event.key === "atendenteAtual") {
    checkAttendant();
  }
});

// fallback (se o site mudar via script sem evento "storage")
setInterval(checkAttendant, 5000);
