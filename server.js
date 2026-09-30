const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Memoria de sesiones y contador global de stickers (1 a 100)
const userSessions = {};
let stickerCounter = 0; 

// Función auxiliar para enviar mensajes a WhatsApp
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

// Menú Principal
const MAIN_MENU = 
`¡Hola! Bienvenid@ a Llanix 🚀
Te acompañamos paso a paso a cumplir tus metas y alcanzar tus sueños financieros.

Selecciona una opción respondiendo con el número correspondiente:
1️⃣ Tienda de Stickers (¡Premio de $140.000 al cliente #100! 🏆)
2️⃣ Ahorro Libre
3️⃣ Reto $2M
4️⃣ Cadenas de Ahorro
5️⃣ Hablar con un asesor`;

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
  }
});

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

      if (text === '0' || text === 'MENU' || text === 'HOLA') {
        userSessions[from] = 'MAIN';
        await sendWhatsAppMessage(from, MAIN_MENU);
        return res.sendStatus(200);
      }

      const currentStep = userSessions[from] || 'MAIN';

      switch (currentStep) {
        case 'MAIN':
          if (text === '1') {
            userSessions[from] = 'STICKERS';
            await sendWhatsAppMessage(
              from,
              `🎨 *Colección de Stickers Llanix*\n` +
              `Cada sticker tiene un valor de *$2.000 COP*.\n\n` +
              `🏆 *¡Incentivo Llanix!*\n` +
              `El cliente que realice la compra *número 100* ganará un premio en efectivo de *$140.000 COP* 💵.\n\n` +
              `¿Cuántos stickers deseas adquirir hoy?\n` +
              `1. 1 Sticker ($2.000 COP)\n` +
              `2. 3 Stickers ($6.000 COP)\n` +
              `3. 5 Stickers ($10.000 COP)\n` +
              `4. Otra cantidad / Pedido especial\n\n` +
              `Responde con el número de la opción o escribe 0 para volver al menú principal.`
            );
          } else if (text === '2') {
            userSessions[from] = 'AHORRO_LIBRE';
            await sendWhatsAppMessage(
              from,
              `💰 *Ahorro Libre - Llanix*\n` +
              `Te acompañamos a construir tu hábito de ahorro a tu propio ritmo.\n\n` +
              `¿Qué deseas hacer hoy?\n` +
              `A. Consultar mi saldo acumulado\n` +
              `B. Realizar un nuevo aporte / abono\n` +
              `C. Solicitar retiro de mi ahorro\n` +
              `0. Volver al menú principal`
            );
          } else if (text === '3') {
            userSessions[from] = 'RETO_2M';
            await sendWhatsAppMessage(
              from,
              `🏆 *Reto $2.000.000 COP*\n` +
              `Tu camino guiado para alcanzar esa gran meta de $2M.\n\n` +
              `Elige una opción:\n` +
              `1. Ver mi progreso hacia la meta\n` +
              `2. Registrar aporte de la semana\n` +
              `3. Ver plan de pagos / tabla del reto\n` +
              `0. Volver al menú principal`
            );
          } else if (text === '4') {
            userSessions[from] = 'CADENAS';
            await sendWhatsAppMessage(
              from,
              `🤝 *Cadenas de Ahorro Llanix*\n` +
              `Ahorro en comunidad con turnos organizados.\n\n` +
              `Opciones:\n` +
              `A. Ver cadenas activas y cupos\n` +
              `B. Consultar el estado de mi cadena actual\n` +
              `C. Cómo funcionan las cadenas\n` +
              `0. Volver al menú principal`
            );
          } else if (text === '5') {
            userSessions[from] = 'ASESOR';
            await sendWhatsAppMessage(
              from,
              `👤 *Atención Personalizada Llanix*\n` +
              `Un integrante de nuestro equipo se sumará a este chat en breve.\n\n` +
              `Escríbenos tu duda mientras te conectamos.\n` +
              `(Escribe 0 para regresar al menú principal)`
            );
          } else {
            await sendWhatsAppMessage(from, MAIN_MENU);
          }
          break;

        case 'STICKERS':
          let qty = 0;
          if (text === '1') qty = 1;
          else if (text === '2') qty = 3;
          else if (text === '3') qty = 5;

          if (qty > 0) {
            const assignedTurns = [];
            for (let i = 0; i < qty; i++) {
              stickerCounter = (stickerCounter % 100) + 1;
              assignedTurns.push(`#${stickerCounter}`);
            }

            const totalAmount = (qty * 2000).toLocaleString('es-CO');
            const turnListText = assignedTurns.join(', ');

            await sendWhatsAppMessage(
              from,
              `¡Excelente elección! 🎨\n\n` +
              `📋 *Detalle de tu pedido:*\n` +
              `- *Cantidad:* ${qty} Sticker(s)\n` +
              `- *Total a pagar:* $${totalAmount} COP\n\n` +
              `🎟️ *Tus números de turno asignados:*\n` +
              `Has quedado registrado con los turnos *${turnListText}* en la ronda actual.\n` +
              `_(¡El comprador del turno #100 se lleva los $140.000 COP en efectivo!)_\n\n` +
              `🔑 *Medio de Pago (Bre-B):*\n` +
              `Realiza tu transferencia a la *Llave Bre-B: 0093393998*\n\n` +
              `📲 Por favor, *envíanos el comprobante de pago por este chat* para validar tu pedido.\n\n` +
              `Escribe 0 para volver al menú principal.`
            );
          } else if (text === '4') {
            await sendWhatsAppMessage(
              from,
              `🎨 *Pedido Personalizado de Stickers*\n\n` +
              `Por favor escríbenos cuántos stickers deseas encargar y un asesor te responderá con los turnos disponibles y el total a pagar.\n\n` +
              `🔑 *Llave de Pago Bre-B:* 0093393998\n\n` +
              `Escribe 0 para volver al menú principal.`
            );
          } else {
            await sendWhatsAppMessage(from, `Opción no válida. Por favor responde 1, 2, 3, 4 o presiona 0 para volver al menú.`);
          }
          break;

        case 'AHORRO_LIBRE':
          if (['A', 'B', 'C'].includes(text)) {
            await sendWhatsAppMessage(
              from,
              `Procesando tu solicitud de Ahorro Libre (Opción ${text})...\nEn breve te contactaremos.\n\nEscribe 0 para volver al menú.`
            );
          } else {
            await sendWhatsAppMessage(from, `Opción no válida. Por favor responde A, B, C o presiona 0 para volver al menú.`);
          }
          break;

        case 'RETO_2M':
          if (['1', '2', '3'].includes(text)) {
            await sendWhatsAppMessage(
              from,
              `Has seleccionado la opción ${text} del Reto $2M. Estamos consultando tus datos...\n\nEscribe 0 para volver al menú.`
            );
          } else {
            await sendWhatsAppMessage(from, `Opción no válida. Por favor responde 1, 2, 3 o presiona 0 para volver al menú.`);
          }
          break;

        case 'CADENAS':
          if (['A', 'B', 'C'].includes(text)) {
            await sendWhatsAppMessage(
              from,
              `Solicitud enviada para Cadenas de Ahorro (Opción ${text}). Te daremos respuesta a la brevedad.\n\nEscribe 0 para volver al menú.`
            );
          } else {
            await sendWhatsAppMessage(from, `Opción no válida. Por favor responde A, B, C o presiona 0 para volver al menú.`);
          }
          break;

        default:
          userSessions[from] = 'MAIN';
          await sendWhatsAppMessage(from, MAIN_MENU);
          break;
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
