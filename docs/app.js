(function () {
  "use strict";

  const SESSION_KEY = "err-review-employee";
  const INBOX_KEY = "err-review-inbox";
  const MAX_BODY_CHARS = 8000;

  const EMPLOYEES = [
    { id: "mari", name: "Mari Tamm", email: "mari.tamm@err.ee" },
    { id: "kadri", name: "Kadri Lepp", email: "kadri.lepp@err.ee" },
    { id: "andres", name: "Andres Kivi", email: "andres.kivi@err.ee" },
  ];

  const TYPES = [
    "Vaba päeva / puudumisega seotud avaldus",
    "Tasu või väljamaksega seotud avaldus",
    "Hüvitisega seotud avaldus",
    "Muu",
  ];

  const gate = document.getElementById("gate");
  const app = document.getElementById("app");
  const people = document.getElementById("people");
  const loginForm = document.getElementById("login-form");
  const gateAlert = document.getElementById("gate-alert");
  const topUser = document.getElementById("top-user");
  const topName = document.getElementById("top-name");
  const logoutButton = document.getElementById("logout");
  const whoName = document.getElementById("who-name");
  const whoEmail = document.getElementById("who-email");
  const typeSelect = document.getElementById("type");
  const typeError = document.getElementById("type-error");
  const bodyInput = document.getElementById("body");
  const bodyError = document.getElementById("body-error");
  const formAlert = document.getElementById("form-alert");
  const form = document.getElementById("application-form");
  const composer = document.getElementById("composer");
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

  let currentEmployee = null;

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

  function findEmployee(employeeId) {
    return EMPLOYEES.find(function (employee) {
      return employee.id === employeeId;
    }) || null;
  }

  function readInbox() {
    try {
      const raw = sessionStorage.getItem(INBOX_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeInbox(messages) {
    sessionStorage.setItem(INBOX_KEY, JSON.stringify(messages));
  }

  function tallinnStamp(date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Tallinn",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const map = {};
    parts.forEach(function (part) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    });
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second)
    );
    const offsetMinutes = Math.round((asUtc - date.getTime()) / 60000);
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absolute = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
    const minutes = String(absolute % 60).padStart(2, "0");
    return {
      label: map.day + "." + map.month + "." + map.year + " " + map.hour + ":" + map.minute + ":" + map.second,
      iso: map.year + "-" + map.month + "-" + map.day + "T" + map.hour + ":" + map.minute + ":" + map.second + sign + hours + ":" + minutes,
    };
  }

  function composeLetter(employee, appType, body) {
    const stamp = tallinnStamp(new Date());
    const record = {
      id: crypto.randomUUID(),
      senderName: employee.name,
      senderEmail: employee.email,
      type: appType,
      body: body.trim(),
      submittedAt: stamp.iso,
      submittedAtLabel: stamp.label,
      timezone: "Europe/Tallinn",
    };
    record.text = [
      "Saatja: " + record.senderName,
      "Saatja e-post: " + record.senderEmail,
      "Avalduse liik: " + record.type,
      "Esitatud: " + record.submittedAtLabel + " (" + record.timezone + ")",
      "",
      "Avalduse tekst:",
      record.body,
      "",
    ].join("\n");
    return record;
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
    currentEmployee = null;
    show(gate, true);
    show(app, false);
    show(topUser, false);
    clearOutcome();
  }

  function showApp(employee) {
    currentEmployee = employee;
    show(gate, false);
    show(app, true);
    show(composer, true);
    show(topUser, true);
    topName.textContent = employee.name;
    whoName.textContent = employee.name;
    whoEmail.textContent = employee.email;
    clearOutcome();
    renderInbox();
  }

  function fillTypes() {
    typeSelect.replaceChildren(new Option("Vali liik…", ""));
    TYPES.forEach(function (type) {
      typeSelect.appendChild(new Option(type, type));
    });
  }

  function renderPeople() {
    people.replaceChildren();
    EMPLOYEES.forEach(function (employee, index) {
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

  function showLetter(record) {
    setAlert(formAlert, "");
    show(composer, false);
    successTitle.textContent = "Kiri on koostatud";
    successMessage.textContent = "See GitHub Pagesi koopia ei saatnud e-kirja. Raamatupidamine kirja ei saanud.";
    successFields.replaceChildren(
      row("Saatja", record.senderName),
      row("Saatja e-post", record.senderEmail),
      row("Avalduse liik", record.type),
      row("Esitatud", record.submittedAtLabel + " (Europe/Tallinn)", { time: record.submittedAt }),
      row("Avalduse tekst", record.body)
    );
    successText.textContent = record.text;
    show(success, true);
    success.focus();
  }

  function showSendError(message, fields) {
    show(success, false);
    successTitle.textContent = "";
    successMessage.textContent = "";
    successFields.replaceChildren();
    successText.textContent = "";
    const named = fields || {};
    setFieldError(typeSelect, typeError, named.type || "");
    setFieldError(bodyInput, bodyError, named.body || "");
    setAlert(formAlert, message);
    if (named.type) {
      typeSelect.focus();
    } else if (named.body) {
      bodyInput.focus();
    } else {
      formAlert.focus();
    }
  }

  function renderInbox() {
    setAlert(inboxAlert, "");
    let messages;
    try {
      messages = readInbox();
    } catch (error) {
      inboxList.replaceChildren();
      setAlert(inboxAlert, "Postkasti ei õnnestunud lugeda.");
      return;
    }
    inboxList.replaceChildren();
    if (messages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inbox-empty";
      empty.textContent = "Selles vahekaardis ei ole veel ühtegi koostatud kirja.";
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

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    setAlert(gateAlert, "");
    const selected = loginForm.querySelector("input[name=employeeId]:checked");
    if (!selected) {
      setAlert(gateAlert, "Vali näidistöötaja.");
      return;
    }
    const employee = findEmployee(selected.value);
    if (!employee) {
      setAlert(gateAlert, "Tundmatu töötaja. Vali näidisnimekirjast.");
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, employee.id);
    } catch (error) {
      setAlert(gateAlert, "Sisenemine ebaõnnestus. Brauser ei hoia seansi andmeid.");
      return;
    }
    showApp(employee);
  });

  logoutButton.addEventListener("click", function () {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* Värav kuvatakse ikkagi. */
    }
    form.reset();
    simulate.checked = false;
    showGate();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearOutcome();
    show(composer, true);

    if (!currentEmployee) {
      showSendError("Avalduse koostamiseks tuleb kõigepealt valida näidistöötaja.", {});
      return;
    }

    const appType = typeSelect.value.trim();
    const body = bodyInput.value;
    const fields = {};
    const missing = [];
    if (!appType) {
      fields.type = "Avalduse liik on kohustuslik.";
      missing.push("avalduse liik");
    } else if (TYPES.indexOf(appType) === -1) {
      fields.type = "Avalduse liik ei ole lubatud nimekirjas.";
      missing.push("sobiv avalduse liik");
    }
    if (body.trim() === "") {
      fields.body = "Avalduse tekst on kohustuslik ja ei tohi olla tühi ega koosneda ainult tühikutest.";
      missing.push("avalduse tekst");
    } else if (body.length > MAX_BODY_CHARS) {
      fields.body = "Avalduse tekst on liiga pikk. Lubatud on kuni " + MAX_BODY_CHARS + " tähemärki.";
      missing.push("lühem avalduse tekst");
    }
    if (missing.length) {
      showSendError("Avaldust ei saadetud. Puudu või vigane: " + missing.join(", ") + ".", fields);
      return;
    }

    if (simulate.checked === true) {
      showSendError(
        "Avaldust ei saadetud. Saatmine ebaõnnestus (simuleeritud viga). Raamatupidamine kirja ei saanud.",
        {}
      );
      return;
    }

    const record = composeLetter(currentEmployee, appType, body);
    try {
      const messages = readInbox();
      messages.unshift(record);
      writeInbox(messages);
    } catch (error) {
      showSendError("Kirja ei lisatud ülevaatuse postkasti. Brauser ei hoia seansi andmeid.", {});
      return;
    }
    showLetter(record);
    renderInbox();
  });

  another.addEventListener("click", function () {
    form.reset();
    simulate.checked = false;
    clearOutcome();
    show(composer, true);
    typeSelect.focus();
  });

  refreshInbox.addEventListener("click", function () {
    renderInbox();
  });

  fillTypes();
  renderPeople();
  let storedId = "";
  try {
    storedId = sessionStorage.getItem(SESSION_KEY) || "";
  } catch (error) {
    storedId = "";
  }
  const storedEmployee = findEmployee(storedId);
  if (storedEmployee) {
    showApp(storedEmployee);
  } else {
    showGate();
  }
})();
