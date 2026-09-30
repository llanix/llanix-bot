const express = require('express');
const axios = require('axios');

const app = express();

// ======================================================
// CONFIGURACIÓN DEL SERVIDOR
// ======================================================

app.use(express.json({
  limit: '10mb'
}));

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'llanix_verify_token';

const PORT = process.env.PORT || 8080;

// ======================================================
// ESTADO TEMPORAL
// ======================================================

const userSessions = {};
let stickerCounter = 0;
const comprobantesRecibidos = [];

// ======================================================
// RUTA PRINCIPAL
// ======================================================

app.get('/', (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Llanix Bot</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #121212;
          color: white;
          text-align: center;
          padding: 50px;
        }
        .ok {
          color: #00e676;
          font-size: 28px;
          font-weight: bold;
        }
        a {
          color: #29b6f6;
        }
      </style>
    </head>
    <body>
      <div class="ok">🤖 Llanix Bot funcionando</div>
      <p>Servidor conectado y ejecutándose correctamente en Railway.</p>
      <p><a href="/estado">🔎 Ver estado del sistema</a></p>
      <p><a href="/comprobantes">📸 Ver comprobantes</a></p>
    </body>
    </html>
  `);
});

// ======================================================
// RUTA DE ESTADO
// ======================================================

app.get('/estado', (req, res) => {
  res.status(200).json({
    servidor: 'Llanix Bot',
    estado: 'activo',
    whatsapp_token_configurado: !!WHATSAPP_TOKEN,
    phone_number_id_configurado: !!PHONE_NUMBER_ID,
    verify_token_configurado: !!VERIFY_TOKEN,
    webhook: '/webhook',
    stickers_generados: stickerCounter,
    comprobantes_en_memoria: comprobantesRecibidos.length,
    hora_servidor: new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota'
    })
  });
});

// ======================================================
// FUNCIÓN PARA ENVIAR MENSAJES A WHATSAPP
// ======================================================

async function sendWhatsAppMessage(to, text) {
  if (!to) {
    console.error('❌ Error: No existe número de destinatario.');
    return false;
  }
  if (!PHONE_NUMBER_ID) {
    console.error('❌ Error: Falta PHONE_NUMBER_ID.');
    return false;
  }
  if (!WHATSAPP_TOKEN) {
    console.error('❌ Error: Falta WHATSAPP_TOKEN.');
    return false;
  }

  try {
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        to: String(to),
        type: 'text',
        text: { body: text }
      }
    });

    console.log('✅ Mensaje enviado correctamente a:', to);
    return true;
  } catch (error) {
    console.error('❌ ERROR ENVIANDO MENSAJE A WHATSAPP');
    if (error.response) {
      console.error('Código:', error.response.status);
      console.error('Respuesta de Meta:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Mensaje:', error.message);
    }
    return false;
  }
}

// ======================================================
// MENÚ PRINCIPAL
// ======================================================

const MAIN_MENU = 
`¡Hola! Bienvenid@ a Llanix 🎨

🏆 *¡Gran Dinámica de Stickers Llanix!*
Cada sticker incluye un *código único de registro*. 
El comprador que obtenga el registro *#100 (STK-100)* ganará el premio acumulado de la categoría 💵.

¿Qué categoría deseas adquirir hoy?
1️⃣ Sticker Básico ($2.000 COP) - Premio: $140.000
2️⃣ Sticker Pro ($5.000 COP) - Premio: $350.000
3️⃣ Sticker Silver ($8.000 COP) - Premio: $560.000
4️⃣ Sticker Gold ($10.000 COP) - Premio: $700.000
5️⃣ Sticker VIP ($12.000 COP) - Premio: $840.000

Responde con el número de la opción (1, 2, 3, 4 o 5).`;

// ======================================================
// WEBHOOK DE VERIFICACIÓN DE META
// ======================================================

app.get('/webhook', (req, res) => {
  console.log('========================================');
  console.log('🔐 META ESTÁ INTENTANDO VERIFICAR WEBHOOK');
  console.log('========================================');

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  }

  console.error('❌ ERROR DE VERIFICACIÓN DEL WEBHOOK');
  return res.sendStatus(403);
});

// ======================================================
// WEBHOOK DE MENSAJES DE WHATSAPP
// ======================================================

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (!body || !body.object || !body.entry || !Array.isArray(body.entry) || body.entry.length === 0) {
      return res.sendStatus(200);
    }

    const entry = body.entry[0];
    if (!entry.changes || !Array.isArray(entry.changes) || entry.changes.length === 0) {
      return res.sendStatus(200);
    }

    const value = entry.changes[0].value;
    if (!value || !value.messages || !Array.isArray(value.messages) || value.messages.length === 0) {
      return res.sendStatus(200);
    }

    const message = value.messages[0];
    const from = message.from;

    if (!from) return res.sendStatus(200);

    // --- MENSAJE DE TEXTO ---
    if (message.type === 'text' && message.text) {
      const text = (message.text.body || '').trim().toUpperCase();

      if (!userSessions[from]) {
        userSessions[from] = 'NEW';
      }

      if (['0', 'MENU', 'HOLA', 'INICIO', 'STICKERS'].includes(text)) {
        userSessions[from] = 'MAIN';
        await sendWhatsAppMessage(from, MAIN_MENU);
        return res.sendStatus(200);
      }

      // Procesamiento de categorías de stickers
      let precio = 0;
      let nombreOpcion = '';

      if (text === '1') { precio = 2000; nombreOpcion = 'Sticker Básico'; }
      else if (text === '2') { precio = 5000; nombreOpcion = 'Sticker Pro'; }
      else if (text === '3') { precio = 8000; nombreOpcion = 'Sticker Silver'; }
      else if (text === '4') { precio = 10000; nombreOpcion = 'Sticker Gold'; }
      else if (text === '5') { precio = 12000; nombreOpcion = 'Sticker VIP'; }

      if (precio > 0) {
        stickerCounter = (stickerCounter % 100) + 1;
        const formattedCode = `STK-${String(stickerCounter).padStart(3, '0')}`;
        const totalAmount = precio.toLocaleString('es-CO');

        userSessions[from] = 'PAYMENT';

        await sendWhatsAppMessage(
          from,
          `🎉 *¡Pedido Registrado con Éxito!*\n\n` +
          `📋 *Detalles de tu orden:*\n` +
          `- Opción: ${nombreOpcion}\n` +
          `- Valor total: *$${totalAmount} COP*\n\n` +
          `🏷 *Tu Código Reservado:*\n` +
          `• *${formattedCode}*\n\n` +
          `*(Si tu código es el **STK-100**, ¡ganas el premio acumulado!)*\n\n` +
          `🔑 *Medio de Pago (Bre-B):*\n` +
          `Transferencia a la *Llave Bre-B: 0093393998*\n\n` +
          `📲 *Paso final:*\n` +
          `Envíanos la captura o foto del comprobante de pago por este chat.\n\n` +
          `Verificaremos la transacción y confirmaremos la activación de tu código.\n\n` +
          `Escribe *0* para regresar al menú principal.`
        );
        return res.sendStatus(200);
      }

      await sendWhatsAppMessage(from, MAIN_MENU);
      return res.sendStatus(200);
    }

    // --- MENSAJE DE IMAGEN (COMPROBANTE) ---
    if (message.type === 'image' && message.image) {
      const mediaId = message.image.id;
      const fechaHora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

      comprobantesRecibidos.push({
        from: from,
        mediaId: mediaId,
        fecha: fechaHora,
        messageId: message.id || null
      });

      console.log(`🚨 Comprobante guardado | Cliente: +${from} | Media ID: ${mediaId}`);

      await sendWhatsAppMessage(
        from,
        `📩 *¡Comprobante de pago recibido con éxito!*\n\n` +
        `Nuestro equipo verificará el ingreso en la cuenta Bre-B en breve y te confirmaremos la activación de tus códigos STK.\n\n` +
        `¡Gracias por comprar en Llanix!`
      );
      return res.sendStatus(200);
    }

    await sendWhatsAppMessage(
      from,
      `📩 Hemos recibido tu mensaje.\nPor favor envíanos un mensaje de texto o una imagen del comprobante de pago.\n\nEscribe *0* para regresar al menú principal.`
    );
    return res.sendStatus(200);

  } catch (globalError) {
    console.error('❌ ERROR PROCESANDO WEBHOOK:', globalError.stack || globalError.message);
    return res.sendStatus(200);
  }
});

// ======================================================
// PANEL DE COMPROBANTES
// ======================================================

app.get('/comprobantes', (req, res) => {
  let html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Comprobantes Llanix</title>
      <style>
        body { font-family: Arial, sans-serif; background: #121212; color: #fff; padding: 20px; }
        h1 { color: #00e676; }
        .card { background: #1e1e1e; border: 1px solid #333; padding: 15px; margin-bottom: 15px; border-radius: 8px; }
        .badge { background: #00e676; color: #000; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
        a { color: #29b6f6; text-decoration: none; }
        .empty { color: #aaa; }
      </style>
    </head>
    <body>
      <h1>📸 Comprobantes Recibidos - Llanix Bot</h1>
      <p>Página de verificación manual de transferencias Bre-B.</p>
      <hr>
  `;

  if (comprobantesRecibidos.length === 0) {
    html += `<p class="empty">No hay comprobantes pendientes por verificar.</p>`;
  } else {
    comprobantesRecibidos.slice().reverse().forEach((item, index) => {
      html += `
        <div class="card">
          <p><span class="badge">#${comprobantesRecibidos.length - index}</span> 📱 <strong>Cliente:</strong> +${item.from}</p>
          <p>⏰ <strong>Hora:</strong> ${item.fecha}</p>
          <p>🆔 <strong>Media ID:</strong> ${item.mediaId}</p>
          <p>📨 <strong>Message ID:</strong> ${item.messageId || 'No disponible'}</p>
          <p>🖼️ <strong>Foto del pago:</strong> <a href="/ver-imagen/${item.mediaId}" target="_blank">Abrir comprobante</a></p>
        </div>
      `;
    });
  }

  html += `</body></html>`;
  res.send(html);
});

// ======================================================
// MOSTRAR IMAGEN DE META
// ======================================================

app.get('/ver-imagen/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;

    if (!WHATSAPP_TOKEN) {
      return res.status(500).send('WHATSAPP_TOKEN no configurado.');
    }

    const mediaRes = await axios.get(
      `https://graph.facebook.com/v20.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );

    const imageBuffer = await axios.get(
      mediaRes.data.url,
      {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        responseType: 'arraybuffer'
      }
    );

    res.contentType(mediaRes.data.mime_type || 'image/jpeg');
    res.send(Buffer.from(imageBuffer.data));
  } catch (error) {
    console.error('❌ Error al cargar imagen desde Meta:', error.message);
    res.status(500).send('Error al cargar la imagen del comprobante.');
  }
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

app.listen(PORT, () => {
  console.log('========================================');
  console.log('🤖 LLANIX BOT INICIADO EN PUERTO:', PORT);
  console.log('========================================');
});
