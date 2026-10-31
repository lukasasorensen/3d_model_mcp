/* global document */
const scenario = document.querySelector("#scenario");
const chat = document.querySelector("#chat-setting");
const workspace = document.querySelector("#workspace");
const setup = document.querySelector("#setup");
const byId = (id) => document.getElementById(id);
let section = "model";
let returnFocus = null;
function selectSection(next) {
  section = next;
  document
    .querySelectorAll("[data-section]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.section === section),
      ),
    );
  byId("model-panel").classList.toggle("mobile-hidden", section === "chat");
  byId("chat-panel").classList.toggle("mobile-hidden", section !== "chat");
  byId("details-panel").classList.toggle(
    "mobile-hidden",
    section !== "details",
  );
  document
    .querySelector(".viewer")
    .classList.toggle("mobile-hidden", section === "details");
  document
    .querySelector(".facts")
    .classList.toggle("mobile-hidden", section === "details");
}
function closeSetup() {
  setup.hidden = true;
  if (returnFocus) returnFocus.focus();
}
function openSetup() {
  returnFocus = document.activeElement;
  setup.hidden = false;
  byId("step-one").hidden = false;
  byId("step-two").hidden = true;
  byId("step-number").textContent = "1";
  byId("close-setup").focus();
}
function update() {
  const value = scenario.value;
  const isEmpty = value === "empty";
  const isHistory = value === "history";
  const format = byId("format").value;
  const busy = ["render", "restoring", "exporting"].includes(value);
  const name = isEmpty ? "Untitled project" : "Bracket project";
  byId("project-title").textContent = name;
  document.querySelector(".project-name").textContent = name;
  byId("empty-history").hidden = !isEmpty;
  document.querySelectorAll(".history-row").forEach((row) => {
    row.hidden = isEmpty;
  });
  document.querySelectorAll(".tools button").forEach((button) => {
    button.disabled = isEmpty;
  });
  document.querySelector(".viewer-note").hidden = isEmpty;
  byId("chat-message").textContent = isEmpty
    ? "No model yet. Describe what you would like to create."
    : "Your model is ready to inspect. What would you like to change?";
  byId("message").placeholder = isEmpty
    ? "Describe your first model…"
    : "Describe a change…";
  byId("format").disabled = isEmpty || busy;
  workspace.classList.toggle("no-chat", chat.value === "off");
  byId("chat-panel").hidden = chat.value === "off";
  document.querySelector('[data-section="chat"]').hidden = chat.value === "off";
  if (chat.value === "off" && section === "chat") selectSection("model");
  byId("model").hidden = isEmpty;
  byId("empty").hidden = !isEmpty;
  byId("revision-heading").textContent = isEmpty
    ? "No current revision"
    : isHistory
      ? "Viewing R2 · Current revision R3"
      : "Current revision · R3";
  byId("viewing").textContent = isEmpty
    ? "No revision"
    : isHistory
      ? "R2 · historical"
      : "R3 · current";
  byId("dimensions").textContent = isEmpty ? "Unavailable" : "100 × 40 × 46 mm";
  byId("download").disabled = isEmpty || busy;
  byId("download").textContent = isEmpty
    ? "Download unavailable"
    : value === "exporting"
      ? `Preparing ${format} · R3…`
      : `Download ${format} · current R3`;
  byId("status").textContent = isEmpty
    ? "No model"
    : value === "exporting"
      ? "Preparing download"
      : value === "render"
        ? "Rendering"
        : value === "restoring"
          ? "Restoring"
          : value === "failure"
            ? "Preview error"
            : value === "export-failure"
              ? "Download error"
              : "Ready";
  const messages = {
    history:
      "You are inspecting R2. Downloads use current revision R3; restore R2 to create a new current revision.",
    render:
      "Rendering a new candidate. The last valid preview remains visible while it completes.",
    restoring:
      "Restoring R2 as a new revision. The current R3 preview remains visible until the restore completes.",
    failure:
      "Preview could not be verified. The last valid model remains visible. Check your connection and retry.",
    download: `Download started · bracket-R3.${format.toLowerCase()}`,
    exporting: `Preparing ${format} from current revision R3 in this browser.`,
    "export-failure": `The ${format} export could not be verified. No file was downloaded. Try downloading again.`,
  };
  const banner = byId("banner");
  banner.hidden = !messages[value];
  byId("banner-text").textContent = messages[value] || "";
  byId("retry").hidden = value !== "failure";
  banner.classList.toggle(
    "error",
    value === "failure" || value === "export-failure",
  );
  byId("history").open = isHistory;
  byId("restore").hidden = !isHistory;
  byId("receipt").hidden = value !== "download";
  if (value === "setup") openSetup();
  else if (!setup.hidden) closeSetup();
}
scenario.addEventListener("change", update);
byId("format").addEventListener("change", () => {
  if (["download", "export-failure"].includes(scenario.value))
    scenario.value = "current";
  update();
});
document.querySelectorAll("[data-project]").forEach((button) =>
  button.addEventListener("click", () => {
    scenario.value = button.dataset.project;
    byId("project-menu").open = false;
    byId("message").value = "";
    selectSection("model");
    update();
    byId("project-menu").querySelector("summary").focus();
  }),
);
chat.addEventListener("change", update);
document
  .querySelectorAll("[data-section]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      selectSection(button.dataset.section),
    ),
  );
document.querySelectorAll("[data-scenario]").forEach((button) =>
  button.addEventListener("click", () => {
    scenario.value = button.dataset.scenario;
    update();
  }),
);
byId("connect").addEventListener("click", openSetup);
byId("retry").addEventListener("click", () => {
  scenario.value = "current";
  update();
});
byId("close-setup").addEventListener("click", closeSetup);
byId("cancel-setup").addEventListener("click", closeSetup);
byId("done-setup").addEventListener("click", closeSetup);
document.querySelectorAll('[name="compute"]').forEach((input) =>
  input.addEventListener("change", () => {
    const local =
      document.querySelector('[name="compute"]:checked').value === "local";
    byId("client-choice").hidden = !local;
    byId("prerequisites").textContent = local
      ? "Requires Node.js 24, pnpm, and your chosen client on an Apple Silicon Mac."
      : "You’ll need Node.js 24 and the Codex CLI on macOS or Linux.";
    byId("after-setup").textContent = local
      ? "Restart your client or start a fresh session after setup. Credentials stay in macOS Keychain; no token belongs in client configuration."
      : "After authorization, restart Codex or start a fresh session. Keep this project tab visible during browser validation.";
  }),
);
byId("next-step").addEventListener("click", () => {
  byId("step-one").hidden = true;
  byId("step-two").hidden = false;
  byId("step-number").textContent = "2";
  byId("previous-step").focus();
});
byId("previous-step").addEventListener("click", () => {
  byId("step-one").hidden = false;
  byId("step-two").hidden = true;
  byId("step-number").textContent = "1";
  byId("next-step").focus();
});
document.addEventListener("keydown", (event) => {
  if (setup.hidden) return;
  if (event.key === "Escape") closeSetup();
  if (event.key === "Tab") {
    const focusable = [
      ...setup.querySelectorAll("button, input, select, summary"),
    ].filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
selectSection("model");
update();
