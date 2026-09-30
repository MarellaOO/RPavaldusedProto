#!/usr/bin/env python3
"""ERR raamatupidamise avalduse prototüüp.

Teenib ühe staatilise lehe ja võtab avalduse vastu POST-iga.
Andmebaasi ei ole: ärivajadus on saata e-kiri, mitte luua uut
isikuandmete hoidlat (E-ITS).

Saatmise ausus:
- õnnestumise vastus antakse alles pärast tegelikku üleandmist;
- SMTP_HOST olemasolul võtab kirja vastu smtplib;
- muidu läheb kiri protsessi mällu (kaob taaskäivitusel) ja logifaili;
- simuleeritud või tehniline viga ei tagasta õnnestumist.
"""

from __future__ import annotations

import json
import os
import secrets
import smtplib
import ssl
import threading
from datetime import datetime
from email.message import EmailMessage
from email.utils import format_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

HOST = "0.0.0.0"
PORT = 8741
ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
LOG_PATH = ROOT / "logs" / "avaldused.log"
TZ = ZoneInfo("Europe/Tallinn")
MAX_BODY_CHARS = 8000
MAX_REQUEST_BYTES = 64 * 1024
SESSION_COOKIE = "err_proto_session"

# Lõpliku nimekirja kinnitab raamatupidamine. Siin on lähteülesande näited ja „Muu“.
APPLICATION_TYPES = (
    "Vaba päeva / puudumisega seotud avaldus",
    "Tasu või väljamaksega seotud avaldus",
    "Hüvitisega seotud avaldus",
    "Muu",
)

# Päris ERR kataloogi ei ole. Need on värava näidisidentiteedid.
EMPLOYEES = (
    {
        "id": "mari",
        "name": "Mari Tamm",
        "email": "mari.tamm@err.ee",
    },
    {
        "id": "kadri",
        "name": "Kadri Lepp",
        "email": "kadri.lepp@err.ee",
    },
    {
        "id": "andres",
        "name": "Andres Kivi",
        "email": "andres.kivi@err.ee",
    },
)

SESSIONS: dict[str, dict[str, str]] = {}
MAILBOX: list[dict[str, str]] = []
LOCK = threading.Lock()


def accounting_email() -> str:
    value = os.environ.get("ACCOUNTING_EMAIL", "raamatupidamine@err.ee").strip()
    return value or "raamatupidamine@err.ee"


def smtp_host() -> str:
    return os.environ.get("SMTP_HOST", "").strip()


def smtp_configured() -> bool:
    return bool(smtp_host())


def smtp_from() -> str:
    return os.environ.get("SMTP_FROM", "noreply-avaldused@err.ee").strip() or "noreply-avaldused@err.ee"


def now_tallinn() -> datetime:
    return datetime.now(TZ)


def public_employee(employee: dict[str, str]) -> dict[str, str]:
    return {
        "id": employee["id"],
        "name": employee["name"],
        "email": employee["email"],
    }


def find_employee(employee_id: str) -> dict[str, str] | None:
    for employee in EMPLOYEES:
        if employee["id"] == employee_id:
            return employee
    return None


def one_line(value: str) -> str:
    return " ".join(value.replace("\t", " ").split())


def compose_text(record: dict[str, str]) -> str:
    return (
        f"Saatja: {record['senderName']}\n"
        f"Saatja e-post: {record['senderEmail']}\n"
        f"Avalduse liik: {record['type']}\n"
        f"Esitatud: {record['submittedAtLabel']} ({record['timezone']})\n"
        f"Saaja: {record['to']}\n"
        "\n"
        "Avalduse tekst:\n"
        f"{record['body']}\n"
    )


def build_record(employee: dict[str, str], app_type: str, body: str, mode: str) -> dict[str, str]:
    moment = now_tallinn()
    record = {
        "id": secrets.token_hex(8),
        "to": accounting_email(),
        "senderName": employee["name"],
        "senderEmail": employee["email"],
        "type": app_type,
        "body": body,
        "submittedAt": moment.isoformat(timespec="seconds"),
        "submittedAtLabel": moment.strftime("%d.%m.%Y %H:%M:%S"),
        "timezone": "Europe/Tallinn",
        "mode": mode,
        "subject": f"Avaldus: {app_type}",
    }
    record["text"] = compose_text(record)
    record["_dt"] = moment  # eemaldatakse enne JSON-vastust
    return record


def public_record(record: dict[str, str]) -> dict[str, str]:
    return {key: value for key, value in record.items() if not key.startswith("_")}


def write_log(record: dict[str, str], outcome: str) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    line = "\t".join(
        [
            record["submittedAt"],
            one_line(outcome),
            f"{one_line(record['senderName'])} <{one_line(record['senderEmail'])}>",
            one_line(record["type"]),
        ]
    )
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def send_smtp(record: dict[str, str]) -> None:
    message = EmailMessage()
    message["Subject"] = record["subject"]
    message["From"] = smtp_from()
    message["To"] = record["to"]
    message["Reply-To"] = record["senderEmail"]
    message["Date"] = format_datetime(record["_dt"])
    message.set_content(record["text"])

    host = smtp_host()
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    timeout = 20

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(host, port, timeout=timeout) as smtp:
        smtp.ehlo()
        if os.environ.get("SMTP_STARTTLS", "1") != "0":
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if user:
            smtp.login(user, password)
        smtp.send_message(message)


def success_copy(mode: str) -> tuple[str, str]:
    target = accounting_email()
    if mode == "smtp":
        return (
            "Avaldus on saadetud",
            f"E-postiserver võttis kirja vastu. Saaja on {target}.",
        )
    return (
        "Avaldus on saadetud prototüübi postkasti",
        (
            "Kiri anti üle prototüübi raamatupidamise postkasti (serveri mälu, kaob taaskäivitusel). "
            "Päris e-kirja ei saadetud, sest SMTP ei ole seadistatud. "
            f"Töökeskkonnas edastatakse sama sisu e-postiga aadressile {target}. "
            "Selle aadressi kinnitab raamatupidamine."
        ),
    )


class ReuseServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = "ERRAvaldusPrototype/0.1"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}", flush=True)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/meta":
            self.send_json(200, self.meta_payload())
            return
        if path == "/api/employees":
            self.send_json(200, {"employees": [public_employee(item) for item in EMPLOYEES]})
            return
        if path == "/api/session":
            employee = self.current_employee()
            if employee is None:
                self.send_json(401, {"ok": False, "message": "Sessiooni ei ole."})
                return
            self.send_json(200, {"ok": True, "employee": public_employee(employee)})
            return
        if path == "/api/postkast":
            if self.current_employee() is None:
                self.send_json(
                    401,
                    {"ok": False, "message": "Postkasti vaatamiseks tuleb siseneda prototüübi identiteediga."},
                )
                return
            with LOCK:
                messages = [public_record(item) for item in MAILBOX]
            self.send_json(
                200,
                {
                    "ok": True,
                    "prototype": True,
                    "persistent": False,
                    "messages": list(reversed(messages)),
                },
            )
            return
        if path == "/":
            self.send_file(STATIC / "index.html", "text/html; charset=utf-8")
            return
        if path == "/styles.css":
            self.send_file(STATIC / "styles.css", "text/css; charset=utf-8")
            return
        if path == "/app.js":
            self.send_file(STATIC / "app.js", "text/javascript; charset=utf-8")
            return
        self.send_json(404, {"ok": False, "message": "Aadressi ei leitud."})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/login":
            self.handle_login()
            return
        if path == "/api/logout":
            self.handle_logout()
            return
        if path == "/api/avaldus":
            self.handle_submit()
            return
        self.send_json(404, {"ok": False, "delivered": False, "message": "Aadressi ei leitud."})

    def handle_login(self) -> None:
        payload, error = self.read_json()
        if error:
            self.send_json(400, {"ok": False, "message": error})
            return
        employee_id = str(payload.get("employeeId", "")).strip()
        employee = find_employee(employee_id)
        if employee is None:
            self.send_json(
                400,
                {"ok": False, "message": "Tundmatu töötaja. Vali näidisnimekirjast."},
            )
            return
        token = secrets.token_urlsafe(24)
        with LOCK:
            SESSIONS[token] = employee
        self.send_json(
            200,
            {"ok": True, "employee": public_employee(employee)},
            set_cookie=self.session_cookie(token),
        )

    def handle_logout(self) -> None:
        token = self.cookies().get(SESSION_COOKIE)
        if token:
            with LOCK:
                SESSIONS.pop(token, None)
        self.send_json(
            200,
            {"ok": True},
            set_cookie=f"{SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
        )

    def handle_submit(self) -> None:
        employee = self.current_employee()
        if employee is None:
            self.send_json(
                401,
                {
                    "ok": False,
                    "delivered": False,
                    "message": "Avalduse saatmiseks tuleb kõigepealt tuvastada ERR töötaja.",
                },
            )
            return

        payload, error = self.read_json()
        if error:
            self.send_json(400, {"ok": False, "delivered": False, "message": error})
            return

        # Nimi ja e-post tulevad ainult sessioonist. Kliendi väljad eiratakse.
        app_type = payload.get("type", "")
        body = payload.get("body", "")
        if not isinstance(app_type, str):
            app_type = ""
        if not isinstance(body, str):
            body = ""
        app_type = app_type.strip()
        fields: dict[str, str] = {}
        if not app_type:
            fields["type"] = "Avalduse liik on kohustuslik."
        elif app_type not in APPLICATION_TYPES:
            fields["type"] = "Avalduse liik ei ole lubatud nimekirjas."
        if body.strip() == "":
            fields["body"] = "Avalduse tekst on kohustuslik ja ei tohi olla tühi ega koosneda ainult tühikutest."
        elif len(body) > MAX_BODY_CHARS:
            fields["body"] = f"Avalduse tekst on liiga pikk. Lubatud on kuni {MAX_BODY_CHARS} tähemärki."
        if fields:
            missing = []
            if "type" in fields and not app_type:
                missing.append("avalduse liik")
            elif "type" in fields:
                missing.append("sobiv avalduse liik")
            if "body" in fields and body.strip() == "":
                missing.append("avalduse tekst")
            elif "body" in fields:
                missing.append("lühem avalduse tekst")
            self.send_json(
                400,
                {
                    "ok": False,
                    "delivered": False,
                    "message": "Avaldust ei saadetud. Puudu või vigane: " + ", ".join(missing) + ".",
                    "fields": fields,
                },
            )
            return

        simulate = payload.get("simulateFailure") is True
        mode = "smtp" if smtp_configured() else "prototype"
        record = build_record(employee, app_type, body.strip(), mode)

        if simulate:
            try:
                with LOCK:
                    write_log(record, "fail-simulated")
            except OSError:
                self.send_json(
                    500,
                    {
                        "ok": False,
                        "delivered": False,
                        "message": "Avaldust ei saadetud. Viga ei õnnestunud logifaili kirjutada.",
                    },
                )
                return
            self.send_json(
                500,
                {
                    "ok": False,
                    "delivered": False,
                    "message": "Avaldust ei saadetud. Saatmine ebaõnnestus (simuleeritud viga). Raamatupidamine kirja ei saanud.",
                },
            )
            return

        if mode == "smtp":
            try:
                send_smtp(record)
            except (OSError, smtplib.SMTPException, ValueError):
                try:
                    with LOCK:
                        write_log(record, "fail-smtp")
                except OSError:
                    pass
                self.send_json(
                    500,
                    {
                        "ok": False,
                        "delivered": False,
                        "message": "Avaldust ei saadetud. E-posti server ei võtnud kirja vastu.",
                    },
                )
                return
            try:
                with LOCK:
                    write_log(record, "ok-smtp")
            except OSError:
                # Kiri on juba serverisse vastu võetud. Logi ebaõnnestumine ei tee saatmist olematuks.
                pass
            title, message = success_copy("smtp")
            self.send_json(200, self.success_payload(record, "smtp", title, message))
            return

        with LOCK:
            MAILBOX.append(record)
            try:
                write_log(record, "ok-prototype")
            except OSError:
                MAILBOX.pop()
                self.send_json(
                    500,
                    {
                        "ok": False,
                        "delivered": False,
                        "message": "Avaldust ei saadetud. Prototüübi postkasti üleandmine ebaõnnestus (logifail).",
                    },
                )
                return
        title, message = success_copy("prototype")
        self.send_json(200, self.success_payload(record, "prototype", title, message))

    def success_payload(self, record: dict[str, str], mode: str, title: str, message: str) -> dict:
        email = public_record(record)
        return {
            "ok": True,
            "delivered": True,
            "mode": mode,
            "title": title,
            "message": message,
            "email": email,
        }

    def meta_payload(self) -> dict:
        configured = smtp_configured()
        return {
            "accountingEmail": accounting_email(),
            "accountingEmailNote": "Kohatäide. Päris aadressi otsustab raamatupidamine.",
            "smtpConfigured": configured,
            "deliveryMode": "smtp" if configured else "prototype",
            "types": list(APPLICATION_TYPES),
            "typesNote": "Esialgne nimekiri lähteülesande näidetest. Lõpliku loetelu kinnitab raamatupidamine.",
        }

    def current_employee(self) -> dict[str, str] | None:
        token = self.cookies().get(SESSION_COOKIE)
        if not token:
            return None
        with LOCK:
            employee = SESSIONS.get(token)
        return employee

    def cookies(self) -> dict[str, str]:
        found: dict[str, str] = {}
        raw = self.headers.get("Cookie", "")
        for part in raw.split(";"):
            if "=" not in part:
                continue
            key, value = part.split("=", 1)
            found[key.strip()] = value.strip()
        return found

    def read_json(self) -> tuple[dict, str | None]:
        content_type = self.headers.get("Content-Type", "")
        if "application/json" not in content_type:
            return {}, "Päring peab olema JSON (Content-Type: application/json)."
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return {}, "Päringu pikkus on vigane."
        if length < 0 or length > MAX_REQUEST_BYTES:
            return {}, "Päring on liiga suur."
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}, "Päring on tühi."
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}, "Päring ei ole korrektne JSON."
        if not isinstance(payload, dict):
            return {}, "Päring peab olema JSON-objekt."
        return payload, None

    def session_cookie(self, token: str) -> str:
        return f"{SESSION_COOKIE}={token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800"

    def send_json(self, status: int, payload: dict, set_cookie: str | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if set_cookie is not None:
            self.send_header("Set-Cookie", set_cookie)
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path: Path, content_type: str) -> None:
        if not path.is_file():
            self.send_json(404, {"ok": False, "message": "Faili ei leitud."})
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ReuseServer((HOST, PORT), Handler)
    print(f"ERR avalduste prototüüp kuulab aadressil http://{HOST}:{PORT}/", flush=True)
    print(f"Raamatupidamise aadress: {accounting_email()}", flush=True)
    print(
        "Saatmine: SMTP" if smtp_configured() else "Saatmine: prototüübi postkast (SMTP seadistamata)",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Peatan serveri.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
