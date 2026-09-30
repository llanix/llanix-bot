const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Estado de usuarios y contador de stickers (1 a 100)
const userSessions = {};
let stickerCounter = 0;

// Función para enviar mensajes a WhatsApp
async function sendWhatsAppMessage(to, text) {
  try {
    await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text },
      },
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error.response ? error.response.data : error.message);
  }
}

// Menú de lanzamiento exclusivo de Stickers
const MAIN_MENU = 
`¡Hola! Bienvenid@ a Llanix 🎨

🏆 *¡Gran Dinámica de Stickers Llanix!*
Cada sticker cuesta *$2.000 COP* e incluye un *código único de registro*. 
El comprador que obtenga el registro *#100 (STK-100)* ganará *$140.000 COP* en efectivo 💵.

¿Cuántos stickers deseas adquirir hoy?
1️⃣ 1 Sticker ($2.000 COP)
2️⃣ 3 Stickers ($6.000 COP)
3️⃣ 5 Stickers ($10.000 COP)
4️⃣ Otra cantidad / Pedido especial
5️⃣ Hablar con un asesor

Responde con el número de la opción (1, 2, 3, 4 o 5).`;

// Webhook de verificación para Meta
app.get('/webhook', (req, res) => {
  const verifyToken = process.env.VERIFY_TOKEN || 'llanix_verify_token';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Procesamiento de mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from;
      const text = message.text ? message.text.body.trim().toUpperCase() : '';

      // Volver al menú de stickers desde cualquier punto
      if (text === '0' || text === 'MENU' || text === 'HOLA' || text === 'INICIO' || text === 'STICKERS') {
        userSessions[from] = 'MAIN';
        await sendWhatsAppMessage(from, MAIN_MENU);
        return res.sendStatus(200);
      }

      let qty = 0;
      if (text === '1') qty = 1;
      else if (text === '2') qty = 3;
      else if (text === '3') qty = 5;

      if (qty > 0) {
        // Asignación de códigos STK consecutivos
        const assignedCodes = [];
        for (let i = 0; i < qty; i++) {
          stickerCounter = (stickerCounter % 100) + 1;
          const formattedCode = `STK-${String(stickerCounter).padStart(3, '0')}`;
          assignedCodes.push(formattedCode);
        }

        const totalAmount = (qty * 2000).toLocaleString('es-CO');
        const codeListText = assignedCodes.map(code => `• *${code}*`).join('\n');

        await sendWhatsAppMessage(
          from,
          `🎉 *¡Pedido Registrado con Éxito!*\n\n` +
          `📋 *Detalles de tu orden:*\n` +
          `• Cantidad: ${qty} Sticker(s)\n` +
          `• Valor total: *$${totalAmount} COP*\n\n` +
          `🏷 *Tus Códigos Reservados:*\n` +
          `${codeListText}\n\n` +
          `_(Si alguno de tus códigos es el **STK-100**, ¡ganas los **$140.000 COP** en efectivo!)_\n\n` +
          `🔑 *Medio de Pago (Bre-B):*\n` +
          `Transferencia a la *Llave Bre-B: 0093393998*\n\n` +
          `📲 *Paso final:* Envíanos la captura o foto del comprobante de pago por este chat.\n` +
          `Verificaremos la transacción y confirmaremos la activación de tus códigos.\n\n` +
          `Escribe *0* para regresar al menú principal.`
        );
      } else if (text === '4') {
        await sendWhatsAppMessage(
          from,
          `🎨 *Pedido Personalizado de Stickers*\n\n` +
          `Escríbenos cuántos stickers deseas encargar y un asesor te informará la disponibilidad y tus códigos asignados.\n\n` +
          `🔑 *Llave Bre-B:* 0093393998\n\n` +
          `Escribe *0* para regresar al menú.`
        );
      } else if (text === '5') {
        await sendWhatsAppMessage(
          from,
          `👤 *Atención Personalizada Llanix*\n\n` +
          `Déjanos tu mensaje y un asesor responderá tus dudas en breve por este chat.\n\n` +
          `_(Escribe 0 para regresar al menú principal)_`
        );
      } else {
        await sendWhatsAppMessage(from, MAIN_MENU);
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor de Stickers Llanix corriendo en puerto ${PORT}`);
});
