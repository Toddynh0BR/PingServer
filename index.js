import { google } from 'googleapis';
import express from "express";
import cron from "node-cron";
import dotenv from "dotenv";
import axios from "axios";
import cors from 'cors';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const Backends = process.env.BACKENDS?.split(",") || [];

// Envio de emails

function makeRawMessage(to, from, subject, html) {
  const encodedSubject = `=?utf-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ];

  const message = messageParts.join('\n');
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

async function sendMail({ to, subject, html }) {
  try {
    if (!to || !subject || !html) {
      throw new AppError(
        `Parâmetros inválidos para envio de email. Recebido: to=${to}, subject=${subject}`,
        400
      );
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.DESKTOP_CLIENT_ID,
      process.env.DESKTOP_CLIENT_SECRET
    );
    oAuth2Client.setCredentials({ refresh_token: process.env.DESKTOP_REFRESH_TOKEN });

    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const raw = makeRawMessage(to, process.env.SENDER_EMAIL, subject, html);

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    console.log('✅ Email enviado com sucesso! ID:', res.data.id);
    return res.data;
  } catch (error) {
    console.error('❌ Erro ao enviar email:', error);
  }
};


// Rota que o cron-job.org vai pingar
app.get("/ping", (req, res) => {
  res.status(200).send("PingServer ativo e mantendo backends!");
});
app.post("/ping", (req, res) => {
  res.status(200).send("PingServer ativo e mantendo backends!");
});
  

// Código para enviar requisição aos back ends
async function PingServer(url, retry = 0) {
  try {
    const response = await axios.post(url, { keepAlive: true });

    console.log(`${url} OK (${response.status})`);
    if (retry > 0) {
         sendMail({
          to: "galaxyplay41@gmail.com",
          subject: "Servidor funcionando novamente",
          html: `<p>O servidor: <b><strong>${url}</strong></b> Voltou a funcionar na tentativa: <strong>${retry}</strong></p>`,
        });
    }
    return;
  } catch (error) {
    const status = error.response?.status;

    console.warn(`Falha em ${url} — Status: ${status}, Tentativa: ${retry}`);

    if (status >= 500 && status < 600) {
      if (retry === 0) {
        sendMail({
          to: "galaxyplay41@gmail.com",
          subject: "Servidor com erro 500",
          html: `<p>O servidor <b>${url}</b> retornou erro 500.</p>`,
        });
      }

      if (retry < 5) {
        return setTimeout(() => PingServer(url, retry + 1), 30000); // 30s
      }
    } else {
     console.error('Erro diferente de 500', status)
    }

    return;
  }
};


// Cron interno que roda a cada 9 minutos
cron.schedule("*/9 * * * *", async () => {
  console.log("Iniciando verificação de backends...");
  
  for (const url of Backends) {
    PingServer(url, 0);
  }
  
  console.log('Verificação finalizada')
});

app.listen(PORT, () =>
  console.log(`PingServer rodando na porta ${PORT}`)
);
