const express = require('express');
const axios = require('axios');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ======================================================
// CONFIGURACIÓN DE ENTORNO
// ======================================================

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'llanix_verify_token';
const PORT = process.env.PORT || 8080;

const userSessions = {};
const comprobantesRecibidos = [];
let contadorStickers = 0;

// ======================================================
// MENÚS Y TEXTOS (MÓDULO 1 ÚNICO ACTIVO)
// ======================================================

const MAIN_MENU = 
`¡Hola! Bienvenid@ a *Llanix* 🚀

📌 *Aviso:* Actualmente los módulos de ahorro se encuentran en mantenimiento programado y se reactivarán muy pronto.

Por el momento, solo está disponible nuestro servicio activo:

1️⃣ *Cliente #100 (Stickers Digitales)* 🎨
   _Gana el acumulado de tu categoría al obtener la casilla #100._

Responde enviando el número *1* para continuar.`;

const MENU_STICKERS = 
`🎨 *MÓDULO 1: CLIENTE #100 (STICKERS LLANIX)*
Tu código oficial se asigna *al verificar tu pago* por orden exacto de llegada. El registro *#100 (STK-100)* gana el pozo acumulado 💵.

Selecciona la categoría que deseas adquirir:
1️⃣ Sticker Básico ($2.000 COP) - Premio: $140.000
2️⃣ Sticker Pro ($5.000 COP) - Premio: $350.000
3️⃣ Sticker Silver ($8.000 COP) - Premio: $560.000
4️⃣ Sticker Gold ($10.000 COP) - Premio: $700.000
5️⃣ Sticker VIP ($12.000 COP) - Premio: $840.000

Escribe *0* para volver al menú principal.`;

// ======================================================
// RUTAS PRINCIPALES
// ======================================================

app.get('/', (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Llanix Bot - Módulo 1</title>
      <style>
        body { font-family: Arial, sans-serif; background: #121212; color: white; text-align: center; padding: 50px; }
        .ok { color: #00e676; font-size: 28px; font-weight: bold; }
        a { color: #29b6f6; text-decoration: none; font-size: 18px; margin: 10px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="ok">🤖 Bot Llanix Activo (Módulo 1)</div>
      <p><a href="/comprobantes">📸 Panel de Control de Comprobantes</a></p>
    </body>
    </html>
  `);
});

async function sendWhatsAppMessage(to, text) {
  if (!to || !PHONE_NUMBER_ID || !WHATSAPP_TOKEN) return false;
  try {
    await axios({
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
    return true;
  } catch (error) {
    console.error('Error enviando mensaje WhatsApp:', error.response ? error.response.data : error.message);
    return false;
  }
}

// ======================================================
// WEBHOOK DE META
// ======================================================

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.object || !body.entry || !body.entry[0].changes || !body.entry[0].changes[0].value.messages) {
      return res.sendStatus(200);
    }

    const message = body.entry[0].changes[0].value.messages[0];
    const from = message.from;
    if (!from) return res.sendStatus(200);

    const session = userSessions[from] || { step: 'MAIN' };

    // --- MENSAJES DE TEXTO ---
    if (message.type === 'text' && message.text) {
      const text = (message.text.body || '').trim().toUpperCase();

      if (['0', 'MENU', 'HOLA', 'INICIO'].includes(text)) {
        userSessions[from] = { step: 'MAIN' };
        await sendWhatsAppMessage(from, MAIN_MENU);
        return res.sendStatus(200);
      }

      if (['RETIRO', 'SOLICITAR RETIRO', 'RETIRAR', '2', '3', '4'].includes(text) && session.step === 'MAIN') {
        await sendWhatsAppMessage(
          from,
          `⚠️️ *MÓDULO EN MANTENIMIENTO*\n\n` +
          `Los módulos de Ahorro y Cadenas no están disponibles en este momento mientras actualizamos el sistema.\n\n` +
          `Por favor selecciona la opción *1* para participar en *Cliente #100 (Stickers Digitales)*.`
        );
        return res.sendStatus(200);
      }

      if (session.step === 'MAIN') {
        if (text === '1') {
          userSessions[from] = { step: 'STICKERS_SELECT' };
          await sendWhatsAppMessage(from, MENU_STICKERS);
          return res.sendStatus(200);
        }

        await sendWhatsAppMessage(from, MAIN_MENU);
        return res.sendStatus(200);
      }

      if (session.step === 'STICKERS_SELECT') {
        let precio = 0;
        let nombreOpcion = '';
        if (text === '1') { precio = 2000; nombreOpcion = 'Sticker Básico'; }
        else if (text === '2') { precio = 5000; nombreOpcion = 'Sticker Pro'; }
        else if (text === '3') { precio = 8000; nombreOpcion = 'Sticker Silver'; }
        else if (text === '4') { precio = 10000; nombreOpcion = 'Sticker Gold'; }
        else if (text === '5') { precio = 12000; nombreOpcion = 'Sticker VIP'; }

        if (precio > 0) {
          userSessions[from] = { step: 'WAITING_PROOF', modulo: 'STICKERS', categoria: nombreOpcion, precio: precio };
          await sendWhatsAppMessage(
            from,
            `🎉 *Solicitud de ${nombreOpcion} ($${precio.toLocaleString('es-CO')} COP)*\n\n` +
            `Transfiere a la **Llave Bre-B: 0093393998**.\n\n` +
            `📸 *Envía la captura del comprobante por este chat para asignarte tu casilla.*`
          );
          return res.sendStatus(200);
        }
      }

      await sendWhatsAppMessage(from, MAIN_MENU);
      return res.sendStatus(200);
    }

    // --- RECEPCIÓN DE IMÁGENES ---
    if (message.type === 'image' && message.image) {
      const idUnico = Date.now().toString();

      comprobantesRecibidos.unshift({
        id: idUnico,
        from: from,
        mediaId: message.image.id,
        modulo: 'STICKERS',
        categoria: session.categoria || 'N/A',
        precio: session.precio || 0,
        fechaEnvio: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        estado: 'PENDIENTE'
      });

      await sendWhatsAppMessage(
        from,
        `📩 *¡Comprobante recibido exitosamente!*\n\n` +
        `Estamos verificando la acreditación en la cuenta Bre-B.\n` +
        `Una vez verificado, recibirás la confirmación oficial y tu casilla asignada.`
      );

      userSessions[from] = { step: 'MAIN' };
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('Error en el webhook:', error);
    return res.sendStatus(200);
  }
});

// ======================================================
// PANEL DE CONTROL
// ======================================================

app.get('/comprobantes', (req, res) => {
  let html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Panel Llanix - Módulo 1</title>
      <style>
        body { font-family: Arial, sans-serif; background: #121212; color: #fff; padding: 20px; }
        h1 { color: #00e676; }
        .card { background: #1e1e1e; border: 1px solid #333; padding: 15px; margin-bottom: 15px; border-radius: 8px; }
        .badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; }
        .PENDIENTE { background: #ff9800; color: #000; }
        .APROBADO { background: #00e676; color: #000; }
        a.btn { background: #29b6f6; color: #000; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; margin-top: 5px; }
        button.btn-autorizar { background: #00e676; color: #000; border: none; padding: 10px 15px; font-weight: bold; border-radius: 4px; cursor: pointer; margin-top: 10px; }
      </style>
    </head>
    <body>
      <h1>🎨 Panel Llanix (Solo Módulo 1 Activo)</h1>
      <hr>
  `;

  if (comprobantesRecibidos.length === 0) {
    html += `<p style="color:#aaa;">No hay comprobantes pendientes.</p>`;
  } else {
    comprobantesRecibidos.forEach((item) => {
      html += `
        <div class="card">
          <p>📱 <strong>Cliente:</strong> +${item.from}</p>
          <p>🧩 <strong>Operación:</strong> <span style="color:#29b6f6; font-weight:bold;">${item.modulo}</span></p>
          <p>🏷️ <strong>Categoría:</strong> ${item.categoria}</p>
          <p>⏰ <strong>Recibido:</strong> ${item.fechaEnvio}</p>
          <p>📌 <strong>Estado:</strong> <span class="badge ${item.estado}">${item.estado}</span></p>
          <p>🖼 <a class="btn" href="/ver-imagen/${item.mediaId}" target="_blank">Ver Comprobante</a></p>

          ${item.estado === 'PENDIENTE' ? `
            <form action="/autorizar" method="POST">
              <input type="hidden" name="id" value="${item.id}">
              <button type="submit" class="btn-autorizar">✅ Aprobar Pago y Asignar Casilla</button>
            </form>
          ` : `<p style="color:#00e676;">✨ Procesado el ${item.fechaAprobacion || 'N/A'}</p>`}
        </div>
      `;
    });
  }

  html += `</body></html>`;
  res.send(html);
});

app.post('/autorizar', async (req, res) => {
  const { id } = req.body;
  const item = comprobantesRecibidos.find(c => c.id === id);

  if (item && item.estado === 'PENDIENTE') {
    contadorStickers = (contadorStickers % 100) + 1;
    const codigoGenerado = `STK-${String(contadorStickers).padStart(3, '0')}`;

    item.estado = 'APROBADO';
    item.fechaAprobacion = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

    const msg = 
      `🎨 *==============================*\n` +
      `🏅 *STICKER DIGITAL LLANIX* 🏅\n` +
      `*==============================*\n\n` +
      `✅ *PAGO VERIFICADO Y CONFIRMADO*\n\n` +
      `🆔 *CÓDIGO OFICIAL:* *${codigoGenerado}*\n` +
      `🥇 *ORDEN DE LLEGADA:* #${contadorStickers}\n` +
      `📦 *CATEGORÍA:* ${item.categoria}\n\n` +
      `🏆 Si obtuviste la casilla **STK-100**, ¡ganas el pozo acumulado! Gracias por comprar con Llanix. 🚀`;

    await sendWhatsAppMessage(item.from, msg);
  }

  res.redirect('/comprobantes');
});

app.get('/ver-imagen/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    if (!WHATSAPP_TOKEN) return res.status(500).send('WHATSAPP_TOKEN no configurado.');

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
    console.error('Error cargando imagen:', error.message);
    res.status(500).send('Error al visualizar comprobante.');
  }
});

app.listen(PORT, () => {
  console.log('🤖 SERVIDOR LLANIX (MÓDULO 1) EN PUERTO:', PORT);
});
