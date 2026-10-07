import { connect as tlsConnect, type TLSSocket } from "tls";
import { createConnection, type Socket } from "net";

type SmtpMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

function env(name: string, fallback = ""): string {
  return String(process.env[name] || fallback).trim();
}

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function fromAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] || from).trim();
}

function readReply(socket: Socket): Promise<{ code: number; lines: string }> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const parts = buf.split("\r\n");
      if (parts.length < 2) return;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const line = parts[i];
        if (/^\d{3} /.test(line)) {
          socket.off("data", onData);
          socket.off("error", onErr);
          resolve({ code: Number(line.slice(0, 3)), lines: buf });
          return;
        }
      }
    };
    const onErr = (err: Error) => {
      socket.off("data", onData);
      reject(err);
    };
    socket.on("data", onData);
    socket.once("error", onErr);
  });
}

async function writeCmd(socket: Socket, line: string, ok: number[]): Promise<void> {
  socket.write(`${line}\r\n`);
  const reply = await readReply(socket);
  if (!ok.includes(reply.code)) {
    throw new Error(`SMTP ${reply.code}`);
  }
}

function connectTls(host: string, port: number, timeoutMs: number): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({ host, port, servername: host }, () => resolve(socket));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error("SMTP timeout"));
    });
    socket.once("error", reject);
  });
}

function connectTcp(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port }, () => resolve(socket));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error("SMTP timeout"));
    });
    socket.once("error", reject);
  });
}

function upgradeTls(socket: Socket, host: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSock = tlsConnect({ socket, servername: host, host }, () => resolve(tlsSock));
    tlsSock.once("error", reject);
  });
}

export async function sendSmtpMail(mail: SmtpMail): Promise<void> {
  const host = env("EMAIL_SMTP_HOST");
  const user = env("EMAIL_SMTP_USER");
  const pass = env("EMAIL_SMTP_PASSWORD").replace(/\s+/g, "");
  const port = Number(env("EMAIL_SMTP_PORT", "465")) || 465;
  if (!host || !user || !pass) throw new Error("SMTP not configured");
  const timeoutMs = 15000;
  let socket: Socket = port === 587 ? await connectTcp(host, port, timeoutMs) : await connectTls(host, port, timeoutMs);
  await readReply(socket);
  await writeCmd(socket, `EHLO myticketin.local`, [250]);
  if (port === 587) {
    await writeCmd(socket, "STARTTLS", [220]);
    socket = await upgradeTls(socket, host);
    await writeCmd(socket, `EHLO myticketin.local`, [250]);
  }
  await writeCmd(socket, "AUTH LOGIN", [334]);
  await writeCmd(socket, Buffer.from(user).toString("base64"), [334]);
  await writeCmd(socket, Buffer.from(pass).toString("base64"), [235]);
  await writeCmd(socket, `MAIL FROM:<${fromAddress(mail.from)}>`, [250]);
  await writeCmd(socket, `RCPT TO:<${mail.to}>`, [250, 251]);
  await writeCmd(socket, "DATA", [354]);
  const stamp = Date.now().toString(16);
  const alt = `mtialt${stamp}`;
  const mixed = `mtimix${stamp}`;
  const files = mail.attachments || [];
  const altBody = [
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    mail.text,
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    mail.html,
    `--${alt}--`,
  ];
  const headers = [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeSubject(mail.subject)}`,
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
  ];
  let body: string[];
  if (!files.length) {
    body = [`Content-Type: multipart/alternative; boundary="${alt}"`, "", ...altBody];
  } else {
    const parts = files.flatMap((f) => [
      `--${mixed}`,
      `Content-Type: ${f.contentType}; name="${encodeSubject(f.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${encodeSubject(f.filename)}"`,
      "",
      (f.content.toString("base64").match(/.{1,76}/g) || []).join("\r\n"),
    ]);
    body = [
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      ...altBody,
      ...parts,
      `--${mixed}--`,
    ];
  }
  const payload = [...headers, ...body, "."].join("\r\n");
  socket.write(`${payload}\r\n`);
  const done = await readReply(socket);
  if (done.code !== 250) throw new Error(`SMTP ${done.code}`);
  socket.write("QUIT\r\n");
  socket.end();
}
