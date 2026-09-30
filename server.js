const express = require('express');
const axios = require('axios');

const app = express();

// ======================================================
// CONFIGURACIÓN DEL SERVIDOR
// ======================================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'llanix_verify_token';

const PORT = process.env.PORT || 8080;

// ======================================================
// ESTADO TEMPORAL Y REGISTRO DE PAGOS
// ======================================================

const userSessions = {};
let contadorPagosConfirmados = 0; // Orden de llegada oficial (1, 2, 3...)
const comprobantesRecibidos = [];

// ======================================================
// RUTAS PRINCIPALES
// ======================================================

app.get('/', (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Llanix Bot</title>
      <style>
        body { font-family: Arial, sans-serif; background: #121212; color: white; text-align: center; padding: 50px; }
        .ok { color: #00e676; font-size: 28px; font-weight: bold; }
        a { color: #29b6f6; text-decoration: none; font-size: 18px; margin: 10px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="ok">🤖 Llanix Bot funcionando</div>
      <p>Servidor conectado y ejecutándose correctamente en Railway.</p>
      <p><a href="/estado">🔎 Ver estado del sistema</a></p>
      <p><a href="/comprobantes">📸 Panel de Comprobantes</a></p>
    </body>
    </html>
  `);
});

app.get('/estado', (req, res) => {
  res.status(200).json({
    servidor: 'Llanix Bot',
    estado: 'activo',
    whatsapp_token_configurado: !!WHATSAPP_TOKEN,
    phone_number_id_configurado: !!PHONE_NUMBER_ID,
    comprobantes_registrados: comprobantesRecibidos.length,
    pagos_confirmados: contadorPagosConfirmados,
    hora_servidor: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  });
});

// ======================================================
// FUNCIÓN PARA ENVIAR MENSAJES DE WHATSAPP
// ======================================================

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
    console.log('✅ Mensaje enviado a:', to);
    return true;
  } catch (error) {
    console.error('❌ Error enviando mensaje a WhatsApp:', error.response ? error.response.data : error.message);
    return false;
  }
}

// ======================================================
// MENÚ PRINCIPAL
// ======================================================

const MAIN_MENU = 
`¡Hola! Bienvenid@ a Llanix 🎨

🏆 *¡Gran Dinámica de Stickers Llanix!*
Tu código de Sticker se asigna *al verificar tu pago* según el orden exacto de llegada.
El comprador que obtenga el registro *#100 (STK-100)* ganará el premio acumulado de la categoría 💵.

¿Qué categoría deseas adquirir hoy?
1️⃣ Sticker Básico ($2.000 COP) - Premio: $140.000
2️⃣ Sticker Pro ($5.000 COP) - Premio: $350.000
3️⃣ Sticker Silver ($8.000 COP) - Premio: $560.000
4️⃣ Sticker Gold ($10.000 COP) - Premio: $700.000
5️⃣ Sticker VIP ($12.000 COP) - Premio: $840.000

Responde con el número de la opción (1, 2, 3, 4 o 5).`;

// ======================================================
// WEBHOOKS DE META
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

    // --- MENSAJE DE TEXTO ---
    if (message.type === 'text' && message.text) {
      const text = (message.text.body || '').trim().toUpperCase();

      if (['0', 'MENU', 'HOLA', 'INICIO', 'STICKERS'].includes(text) || !userSessions[from]) {
        userSessions[from] = { step: 'MAIN' };
        await sendWhatsAppMessage(from, MAIN_MENU);
        return res.sendStatus(200);
      }

      let precio = 0;
      let nombreOpcion = '';

      if (text === '1') { precio = 2000; nombreOpcion = 'Sticker Básico'; }
      else if (text === '2') { precio = 5000; nombreOpcion = 'Sticker Pro'; }
      else if (text === '3') { precio = 8000; nombreOpcion = 'Sticker Silver'; }
      else if (text === '4') { precio = 10000; nombreOpcion = 'Sticker Gold'; }
      else if (text === '5') { precio = 12000; nombreOpcion = 'Sticker VIP'; }

      if (precio > 0) {
        const totalAmount = precio.toLocaleString('es-CO');

        userSessions[from] = {
          step: 'PAYMENT',
          categoria: nombreOpcion,
          precio: totalAmount
        };

        await sendWhatsAppMessage(
          from,
          `🎉 *¡Solicitud Registrada con Éxito!*\n\n` +
          `📋 *Detalles de tu solicitud:*\n` +
          `- Opción: ${nombreOpcion}\n` +
          `- Valor a transferir: *$${totalAmount} COP*\n\n` +
          `🔑 *Medio de Pago (Bre-B):*\n` +
          `Transferencia a la *Llave Bre-B: 0093393998*\n\n` +
          `📲 *Paso final:*\n` +
          `Envíanos la captura o foto del comprobante de pago por este chat.\n\n` +
          `⚠️ *Nota importante:* Tu código de Sticker (Ej: STK-001, STK-002...) se asignará oficialmente *al momento de verificar la acreditación de tu pago* según el orden de llegada.\n\n` +
          `Escribe *0* para regresar al menú principal.`
        );
        return res.sendStatus(200);
      }

      await sendWhatsAppMessage(from, MAIN_MENU);
      return res.sendStatus(200);
    }

    // --- RECEPCIÓN DE COMPROBANTE DE PAGO ---
    if (message.type === 'image' && message.image) {
      const session = userSessions[from] || {};
      const idUnico = Date.now().toString();

      comprobantesRecibidos.push({
        id: idUnico,
        from: from,
        mediaId: message.image.id,
        categoria: session.categoria || 'Sticker Llanix',
        precio: session.precio || 'N/A',
        fechaEnvio: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        estado: 'PENDIENTE'
      });

      await sendWhatsAppMessage(
        from,
        `📩 *¡Comprobante de pago recibido!*\n\n` +
        `Estamos verificando tu transferencia en la cuenta Bre-B.\n` +
        `Tan pronto confirmemos el ingreso del dinero, recibirás tu *Sticker Digital Oficial* sellado con tu código de orden asignado y hora exacta de confirmación.`
      );
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error en el webhook:', error);
    return res.sendStatus(200);
  }
});

// ======================================================
// PANEL DE CONTROL Y AUTORIZACIÓN
// ======================================================

app.get('/comprobantes', (req, res) => {
  let html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Panel de Autorizaciones - Llanix</title>
      <style>
        body { font-family: Arial, sans-serif; background: #121212; color: #fff; padding: 20px; }
        h1 { color: #00e676; }
        .card { background: #1e1e1e; border: 1px solid #333; padding: 15px; margin-bottom: 15px; border-radius: 8px; }
        .badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; }
        .PENDIENTE { background: #ff9800; color: #000; }
        .APROBADO { background: #00e676; color: #000; }
        a.btn { background: #29b6f6; color: #000; padding: 8px 12px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; margin-top: 5px; }
        button.btn-autorizar { background: #00e676; color: #000; border: none; padding: 10px 15px; font-weight: bold; border-radius: 4px; cursor: pointer; margin-top: 10px; font-size: 15px; }
      </style>
    </head>
    <body>
      <h1>📸 Panel de Control de Comprobantes - Llanix</h1>
      <p>Revisa la transferencia Bre-B. Al presionar 'Aprobar Pago', se asignará automáticamente el código de orden consecutivo al cliente.</p>
      <hr>
  `;

  if (comprobantesRecibidos.length === 0) {
    html += `<p style="color:#aaa;">No hay comprobantes registrados por el momento.</p>`;
  } else {
    comprobantesRecibidos.slice().reverse().forEach((item) => {
      html += `
        <div class="card">
          <p>📱 <strong>Cliente:</strong> +${item.from}</p>
          <p>🏷 <strong>Categoría:</strong> ${item.categoria} ($${item.precio} COP)</p>
          <p>⏰ <strong>Hora de recepción del comprobante:</strong> ${item.fechaEnvio}</p>
          <p>📌 <strong>Estado:</strong> <span class="badge ${item.estado}">${item.estado}</span></p>
          
          ${item.codigoAsignado ? `<p>🥇 <strong>Código Asignado Oficial:</strong> <span style="font-size:20px; color:#00e676; font-weight:bold;">${item.codigoAsignado}</span></p>` : ''}
          
          <p>🖼️ <strong>Imagen:</strong> <a class="btn" href="/ver-imagen/${item.mediaId}" target="_blank">Ver Comprobante de Pago</a></p>
          
          ${item.estado === 'PENDIENTE' ? `
            <form action="/autorizar" method="POST">
              <input type="hidden" name="id" value="${item.id}">
              <button type="submit" class="btn-autorizar">✅ Aprobar Pago y Asignar Código Oficial</button>
            </form>
          ` : `<p style="color:#00e676;">✨ ¡Pago verificado! Sticker expedido el ${item.fechaAprobacion}</p>`}
        </div>
      `;
    });
  }

  html += `</body></html>`;
  res.send(html);
});

// ======================================================
// RUTA DE AUTORIZACIÓN Y ASIGNACIÓN DEL CÓDIGO
// ======================================================

app.post('/autorizar', async (req, res) => {
  const { id } = req.body;
  const item = comprobantesRecibidos.find(c => c.id === id);

  if (item && item.estado === 'PENDIENTE') {
    // Incrementar el contador global de pagos autorizados
    contadorPagosConfirmados = (contadorPagosConfirmados % 100) + 1;
    
    // Asignación de código oficial estrictamente al verificar el pago
    const codigoGenerado = `STK-${String(contadorPagosConfirmados).padStart(3, '0')}`;
    
    item.estado = 'APROBADO';
    item.codigoAsignado = codigoGenerado;
    item.ordenLlegada = contadorPagosConfirmados;
    item.fechaAprobacion = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

    // Mensaje de Formato Sticker/Certificado Digital oficial enviada al cliente
    const stickerMensaje = 
      `🎨 *==============================*\n` +
      `🏅 *STICKER DIGITAL OFICIAL LLANIX* 🏅\n` +
      `*==============================*\n\n` +
      `✅ *ESTADO:* PAGO VERIFICADO Y CONFIRMADO\n\n` +
      `🆔 *CÓDIGO ASIGNADO:* *${codigoGenerado}*\n` +
      `🥇 *ORDEN DE LLEGADA:* Pago #${contadorPagosConfirmados}\n` +
      `📦 *CATEGORÍA:* ${item.categoria}\n` +
      `⏰ *FECHA Y HORA DE VERIFICACIÓN:*\n` +
      `_${item.fechaAprobacion}_\n\n` +
      `----------------------------------\n` +
      `🏆 *RECORDATORIO DE LA DINÁMICA:*\n` +
      `Guarda este mensaje como tu comprobante oficial. Si tu código asignado es el **STK-100**, ¡ganas automáticamente el premio acumulado!\n\n` +
      `¡Gracias por tu compra y mucha suerte! 🚀`;

    await sendWhatsAppMessage(item.from, stickerMensaje);
  }

  res.redirect('/comprobantes');
});

// ======================================================
// MOSTRAR IMAGEN DE META
// ======================================================

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
    console.error('❌ Error cargando imagen:', error.message);
    res.status(500).send('Error al cargar la imagen.');
  }
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

app.listen(PORT, () => {
  console.log('🤖 LLANIX BOT CORRIENDO EN EL PUERTO:', PORT);
});
