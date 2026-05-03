const items = [...document.querySelectorAll(".nav-item")];
const panels = [...document.querySelectorAll(".panel")];
const cards = [...document.querySelectorAll("[data-capability]")];
const saveStatus = document.getElementById("save-status");

const storageKey = "agent-adapter-future-ui-capabilities";
const defaultState = {
  forecast: { price: "0.001 0G", enabled: true },
  alerts: { price: "0.0005 0G", enabled: false },
};

const savedState = loadState();

for (const item of items) {
  item.addEventListener("click", () => {
    const id = item.dataset.panel;
    for (const other of items) other.classList.remove("active");
    for (const panel of panels) panel.classList.remove("active");
    item.classList.add("active");
    document.getElementById(id)?.classList.add("active");
  });
}

for (const card of cards) {
  const capability = card.dataset.capability;
  if (!capability) continue;

  const priceInput = card.querySelector("[data-price-input]");
  const toggle = card.querySelector("[data-toggle]");
  const toggleLabel = card.querySelector("[data-toggle-label]");
  const toggleButton = card.querySelector("[data-toggle-button]");
  const saveButton = card.querySelector("[data-save-button]");

  renderCard(capability, {
    priceInput,
    toggle,
    toggleLabel,
    toggleButton,
  });

  toggleButton?.addEventListener("click", () => {
    const current = savedState[capability];
    current.enabled = !current.enabled;
    persistState();
    renderCard(capability, {
      priceInput,
      toggle,
      toggleLabel,
      toggleButton,
    });
    setStatus(
      `${capability} is now ${current.enabled ? "enabled" : "disabled"} in this local preview.`,
    );
  });

  saveButton?.addEventListener("click", () => {
    if (priceInput instanceof HTMLInputElement) {
      savedState[capability].price = priceInput.value.trim() || defaultState[capability].price;
      persistState();
      setStatus(`${capability} pricing saved locally as ${savedState[capability].price}.`);
    }
  });
}

function renderCard(capability, elements) {
  const state = savedState[capability];
  if (elements.priceInput instanceof HTMLInputElement) {
    elements.priceInput.value = state.price;
  }
  if (elements.toggle instanceof HTMLElement) {
    elements.toggle.classList.toggle("enabled", state.enabled);
    elements.toggle.classList.toggle("disabled", !state.enabled);
  }
  if (elements.toggleLabel instanceof HTMLElement) {
    elements.toggleLabel.textContent = state.enabled ? "Enabled" : "Disabled";
  }
  if (elements.toggleButton instanceof HTMLButtonElement) {
    elements.toggleButton.textContent = state.enabled ? "Disable" : "Enable";
  }
}

function setStatus(message) {
  if (saveStatus) saveStatus.textContent = message;
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
    return {
      forecast: { ...defaultState.forecast, ...(parsed?.forecast || {}) },
      alerts: { ...defaultState.alerts, ...(parsed?.alerts || {}) },
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function persistState() {
  localStorage.setItem(storageKey, JSON.stringify(savedState));
}
