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
// MENÚS Y TEXTOS (MÚLTIPLES UNIDADES Y AGILIDAD)
// ======================================================

const MAIN_MENU = 
`¡Hola! Bienvenid@ a *Llanix* 🚀

📌 *Aviso:* Los módulos de ahorro se encuentran en mantenimiento programado.

Actualmente tenemos activa nuestra dinámica de agilidad comercial:

1️⃣ *Cliente #100 (Stickers Digitales - $2.000 COP c/u)* 🎨
   _Adquiere tus Stickers Digitales por $2.000 COP. ¡El comprador que registre el número de orden 100 por estricto orden de llegada recibe la bonificación de **$140.000 COP**!_

⚡ *¡Entre más rápido compren tus conocidos, más rápido se alcanza la casilla #100!*
Puedes comprar la cantidad de stickers que desees para aumentar tus posibilidades y acelerar el conteo. ¡Comparte con tus familiares y amigos para cerrar la ronda más rápido! 🏃‍♂️💨

Responde enviando el número *1* para continuar.`;

const MENU_STICKERS = 
`🎨 *CLIENTE #100 - STICKER DIGITAL LLANIX*

Cada Sticker Básico tiene un costo de *$2.000 COP*.
Tus números de orden se asignan *al verificar tu pago* por estricto orden de llegada. El cliente que registre la casilla *#100 (STK-100)* obtiene la bonificación de *$140.000 COP* 💵.

Responde con la **cantidad de stickers** que deseas comprar:
1️⃣ 1 Sticker ($2.000 COP)
2️⃣ 2 Stickers ($4.000 COP)
3️⃣ 5 Stickers ($10.000 COP)
4️⃣ 10 Stickers ($20.000 COP)

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
          `⚠️ *MÓDULO EN MANTENIMIENTO*\n\n` +
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

      // SELECCIÓN DE CANTIDAD EN MÓDULO 1
      if (session.step === 'STICKERS_SELECT') {
        let cantidad = 0;
        if (text === '1') cantidad = 1;
        else if (text === '2') cantidad = 2;
        else if (text === '3') cantidad = 5;
        else if (text === '4') cantidad = 10;

        if (cantidad > 0) {
          const totalPagar = cantidad * 2000;
          userSessions[from] = { 
            step: 'WAITING_PROOF', 
            modulo: 'STICKERS', 
            categoria: `Sticker Básico x${cantidad}`, 
            precio: totalPagar,
            cantidad: cantidad
          };

          await sendWhatsAppMessage(
            from,
            `🎉 *Solicitud de ${cantidad} Sticker(s) Básico(s)*\n\n` +
            `💵 *Total a transferir:* *$${totalPagar.toLocaleString('es-CO')} COP*\n` +
            `⚡ *Casillas a reservar:* ${cantidad}\n\n` +
            `Transfiere a la **Llave Bre-B: 0093393998**.\n\n` +
            `📸 *Envía la captura del comprobante por este chat para asignarte tus números de llegada.*`
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
        categoria: session.categoria || 'Sticker Básico x1',
        precio: session.precio || 2000,
        cantidad: session.cantidad || 1,
        fechaEnvio: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        estado: 'PENDIENTE'
      });

      await sendWhatsAppMessage(
        from,
        `📩 *¡Comprobante recibido exitosamente!*\n\n` +
        `Estamos verificando la acreditación en la cuenta Bre-B.\n` +
        `Una vez verificado, recibirás la confirmación oficial y tus números de llegada asignados.`
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
          <p>🏷️ <strong>Detalle:</strong> ${item.categoria}</p>
          <p>💵 <strong>Monto Esperado:</strong> $${item.precio.toLocaleString('es-CO')} COP</p>
          <p>⏰ <strong>Recibido:</strong> ${item.fechaEnvio}</p>
          <p>📌 <strong>Estado:</strong> <span class="badge ${item.estado}">${item.estado}</span></p>
          <p>🖼 <a class="btn" href="/ver-imagen/${item.mediaId}" target="_blank">Ver Comprobante</a></p>

          ${item.estado === 'PENDIENTE' ? `
            <form action="/autorizar" method="POST">
              <input type="hidden" name="id" value="${item.id}">
              <button type="submit" class="btn-autorizar">✅ Aprobar Pago y Asignar Casillas</button>
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
    const cantidad = item.cantidad || 1;
    let codigosAsignados = [];

    for (let i = 0; i < cantidad; i++) {
      contadorStickers = (contadorStickers % 100) + 1;
      codigosAsignados.push(`STK-${String(contadorStickers).padStart(3, '0')}`);
    }

    item.estado = 'APROBADO';
    item.fechaAprobacion = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

    const codigosTexto = codigosAsignados.map(c => `• *${c}*`).join('\n');

    const msg = 
      `🎨 *==============================*\n` +
      `🏅 *STICKERS DIGITALES LLANIX* 🏅\n` +
      `*==============================*\n\n` +
      `✅ *PAGO VERIFICADO Y CONFIRMADO*\n\n` +
      `📦 *Cantidad Adquirida:* ${cantidad}\n` +
      `🆔 *CÓDIGOS OFICIALES ASIGNADOS:*\n${codigosTexto}\n\n` +
      `🏆 Si alguno de tus códigos es el **STK-100**, ¡obtienes la bonificación de $140.000 COP! Gracias por tu compra. 🚀`;

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
