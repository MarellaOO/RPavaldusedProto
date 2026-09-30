(function () {
  "use strict";

  const boot = document.getElementById("boot");
  const gate = document.getElementById("gate");
  const app = document.getElementById("app");
  const people = document.getElementById("people");
  const loginForm = document.getElementById("login-form");
  const loginButton = document.getElementById("login-button");
  const gateAlert = document.getElementById("gate-alert");
  const topUser = document.getElementById("top-user");
  const topName = document.getElementById("top-name");
  const logoutButton = document.getElementById("logout");
  const whoName = document.getElementById("who-name");
  const whoEmail = document.getElementById("who-email");
  const deliveryNote = document.getElementById("delivery-note");
  const typeSelect = document.getElementById("type");
  const typeHint = document.getElementById("type-hint");
  const typeError = document.getElementById("type-error");
  const bodyInput = document.getElementById("body");
  const bodyError = document.getElementById("body-error");
  const formAlert = document.getElementById("form-alert");
  const form = document.getElementById("application-form");
  const composer = document.getElementById("composer");
  const sendButton = document.getElementById("send-button");
  const simulate = document.getElementById("simulate");
  const success = document.getElementById("success");
  const successTitle = document.getElementById("success-title");
  const successMessage = document.getElementById("success-message");
  const successFields = document.getElementById("success-fields");
  const successText = document.getElementById("success-text");
  const another = document.getElementById("another");
  const inboxList = document.getElementById("inbox-list");
  const inboxAlert = document.getElementById("inbox-alert");
  const refreshInbox = document.getElementById("refresh-inbox");

  let meta = null;

  function show(node, visible) {
    node.hidden = !visible;
  }

  function setAlert(node, message) {
    node.textContent = message || "";
    node.hidden = !message;
  }

  function setFieldError(input, node, message) {
    node.textContent = message || "";
    if (message) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  async function api(path, options) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Accept": "application/json", ...(options && options.headers) },
      ...options,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }
    return { response, payload };
  }

  function clearOutcome() {
    setAlert(formAlert, "");
    setFieldError(typeSelect, typeError, "");
    setFieldError(bodyInput, bodyError, "");
    show(success, false);
    successTitle.textContent = "";
    successMessage.textContent = "";
    successFields.replaceChildren();
    successText.textContent = "";
  }

  function showGate() {
    show(boot, false);
    show(gate, true);
    show(app, false);
    show(topUser, false);
    clearOutcome();
  }

  function showApp(employee) {
    show(boot, false);
    show(gate, false);
    show(app, true);
    show(composer, true);
    show(topUser, true);
    topName.textContent = employee.name;
    whoName.textContent = employee.name;
    whoEmail.textContent = employee.email;
    clearOutcome();
    loadInbox();
  }

  function fillMeta(data) {
    meta = data;
    typeHint.textContent = data.typesNote;
    const current = typeSelect.value;
    typeSelect.replaceChildren(new Option("Vali liik…", ""));
    data.types.forEach(function (type) {
      typeSelect.appendChild(new Option(type, type));
    });
    if ([...typeSelect.options].some(function (option) { return option.value === current; })) {
      typeSelect.value = current;
    }
    if (data.smtpConfigured) {
      deliveryNote.textContent =
        "Saatmisviis: e-post aadressile " + data.accountingEmail + ". " + data.accountingEmailNote;
    } else {
      deliveryNote.textContent =
        "Saatmisviis praegu: prototüübi postkast, sest SMTP ei ole seadistatud. " +
        "Töökeskkonnas läheks kiri aadressile " + data.accountingEmail + ". " +
        data.accountingEmailNote;
    }
  }

  function renderPeople(employees) {
    people.replaceChildren();
    employees.forEach(function (employee, index) {
      const label = document.createElement("label");
      label.className = "person";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "employeeId";
      input.value = employee.id;
      input.required = true;
      if (index === 0) {
        input.checked = true;
      }
      const text = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = employee.name;
      const email = document.createElement("span");
      email.textContent = employee.email;
      text.append(name, email);
      label.append(input, text);
      people.appendChild(label);
    });
  }

  function row(term, value, options) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    if (options && options.time) {
      const time = document.createElement("time");
      time.dateTime = options.time;
      time.textContent = value;
      dd.appendChild(time);
    } else {
      dd.textContent = value;
    }
    wrap.append(dt, dd);
    return wrap;
  }

  function showSuccess(payload) {
    const email = payload.email;
    if (!payload || payload.delivered !== true || !email) {
      setAlert(formAlert, "Serveri vastus ei kinnitanud saatmist. Avaldust ei loeta saadetuks.");
      show(success, false);
      return;
    }
    if (!email.senderName || !email.senderEmail || !email.type || !email.body || !email.submittedAt) {
      setAlert(formAlert, "Serveri vastus oli puudulik. Avaldust ei loeta saadetuks.");
      show(success, false);
      return;
    }
    setAlert(formAlert, "");
    show(composer, false);
    successTitle.textContent = payload.title || "";
    successMessage.textContent = payload.message || "";
    successFields.replaceChildren(
      row("Saaja", email.to || ""),
      row("Saatja", email.senderName),
      row("Saatja e-post", email.senderEmail),
      row("Avalduse liik", email.type),
      row("Esitatud", (email.submittedAtLabel || email.submittedAt) + " (Europe/Tallinn)", {
        time: email.submittedAt,
      }),
      row("Avalduse tekst", email.body)
    );
    successText.textContent = email.text || "";
    show(success, true);
    success.focus();
    if (payload.mode === "prototype") {
      loadInbox();
    }
  }

  function showSendError(payload, fallback) {
    show(success, false);
    successTitle.textContent = "";
    const fields = payload && payload.fields ? payload.fields : {};
    setFieldError(typeSelect, typeError, fields.type || "");
    setFieldError(bodyInput, bodyError, fields.body || "");
    setAlert(formAlert, (payload && payload.message) || fallback);
    if (fields.type) {
      typeSelect.focus({ focusVisible: true });
    } else if (fields.body) {
      bodyInput.focus({ focusVisible: true });
    } else {
      formAlert.focus({ focusVisible: true });
    }
  }

  async function loadInbox() {
    setAlert(inboxAlert, "");
    let response;
    let payload;
    try {
      const result = await api("/api/postkast");
      response = result.response;
      payload = result.payload;
    } catch (error) {
      inboxList.replaceChildren();
      setAlert(inboxAlert, "Postkasti ei õnnestunud lugeda.");
      return;
    }
    if (!response.ok || !payload) {
      inboxList.replaceChildren();
      setAlert(inboxAlert, (payload && payload.message) || "Postkasti ei õnnestunud lugeda.");
      return;
    }
    const messages = payload.messages || [];
    inboxList.replaceChildren();
    if (messages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inbox-empty";
      empty.textContent = "Postkast on tühi. Siia ilmub avaldus alles pärast seda, kui server on selle prototüübi postkasti vastu võtnud.";
      inboxList.appendChild(empty);
      return;
    }
    messages.forEach(function (message) {
      const card = document.createElement("article");
      card.className = "mail-card";
      const heading = document.createElement("h3");
      heading.textContent = message.type || "Avaldus";
      const who = document.createElement("p");
      who.textContent = (message.senderName || "") + " · " + (message.senderEmail || "");
      const when = document.createElement("p");
      const time = document.createElement("time");
      time.dateTime = message.submittedAt || "";
      time.textContent = (message.submittedAtLabel || message.submittedAt || "") + " (Europe/Tallinn)";
      when.appendChild(time);
      const body = document.createElement("p");
      body.className = "body";
      body.textContent = message.body || "";
      card.append(heading, who, when, body);
      inboxList.appendChild(card);
    });
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    setAlert(gateAlert, "");
    const selected = loginForm.querySelector("input[name=employeeId]:checked");
    if (!selected) {
      setAlert(gateAlert, "Vali näidistöötaja.");
      return;
    }
    loginButton.disabled = true;
    try {
      const { response, payload } = await api("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selected.value }),
      });
      if (!response.ok || !payload || !payload.employee) {
        setAlert(gateAlert, (payload && payload.message) || "Sisenemine ebaõnnestus.");
        return;
      }
      showApp(payload.employee);
    } catch (error) {
      setAlert(gateAlert, "Sisenemine ebaõnnestus. Server ei vastanud.");
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async function () {
    try {
      await api("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    } catch (error) {
      /* Värav kuvatakse ikkagi. */
    }
    form.reset();
    simulate.checked = false;
    showGate();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearOutcome();
    show(composer, true);
    sendButton.disabled = true;
    sendButton.textContent = "Saadan…";
    try {
      const { response, payload } = await api("/api/avaldus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: typeSelect.value,
          body: bodyInput.value,
          simulateFailure: simulate.checked === true,
        }),
      });
      if (!response.ok || !payload || payload.delivered !== true) {
        showSendError(payload, "Avaldust ei saadetud. Tehniline viga.");
        return;
      }
      showSuccess(payload);
    } catch (error) {
      showSendError(null, "Avaldust ei saadetud. Server ei vastanud. Õnnestumist ei kuvata.");
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = "Saada avaldus";
    }
  });

  another.addEventListener("click", function () {
    form.reset();
    simulate.checked = false;
    clearOutcome();
    show(composer, true);
    typeSelect.focus();
  });

  refreshInbox.addEventListener("click", function () {
    loadInbox().catch(function () {
      setAlert(inboxAlert, "Postkasti ei õnnestunud lugeda.");
    });
  });

  async function bootApp() {
    try {
      const metaResult = await api("/api/meta");
      const peopleResult = await api("/api/employees");
      if (!metaResult.response.ok || !peopleResult.response.ok) {
        show(boot, false);
        show(gate, true);
        setAlert(gateAlert, "Serveri algandmeid ei õnnestunud lugeda.");
        return;
      }
      fillMeta(metaResult.payload);
      renderPeople(peopleResult.payload.employees || []);
      const session = await api("/api/session");
      if (session.response.ok && session.payload && session.payload.employee) {
        showApp(session.payload.employee);
      } else {
        showGate();
      }
    } catch (error) {
      show(boot, false);
      show(gate, true);
      setAlert(gateAlert, "Server ei vastanud.");
    }
  }

  bootApp();
})();
