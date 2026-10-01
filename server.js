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
// ESTADO Y BASE DE DATOS TEMPORAL EN MEMORIA
// ======================================================

const userSessions = {};
let contadorStickers = 0; // Orden de llegada oficial Stickers (1 al 100)
let contadorMesas = 100;   // Generador de códigos MESA-101, MESA-102...

const comprobantesRecibidos = [];
const usuariosAhorro = {}; // Registro de saldo para Ahorro Libre y Reto 2M
const mesasCadenas = {};   // Estructura de Mesas Activas

// ======================================================
// RUTAS PRINCIPALES
// ======================================================

app.get('/', (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Llanix Bot Multi-Módulo</title>
      <style>
        body { font-family: Arial, sans-serif; background: #121212; color: white; text-align: center; padding: 50px; }
        .ok { color: #00e676; font-size: 28px; font-weight: bold; }
        a { color: #29b6f6; text-decoration: none; font-size: 18px; margin: 10px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="ok">🤖 Sistema Multi-Módulo Llanix Funcionando</div>
      <p>Servidor conectado y ejecutándose correctamente.</p>
      <p><a href="/estado">🔎 Ver Estado del Sistema</a></p>
      <p><a href="/comprobantes">📸 Panel de Control de Comprobantes</a></p>
    </body>
    </html>
  `);
});

app.get('/estado', (req, res) => {
  res.status(200).json({
    servidor: 'Llanix Bot Multi-Módulo',
    estado: 'activo',
    whatsapp_token_configurado: !!WHATSAPP_TOKEN,
    phone_number_id_configurado: !!PHONE_NUMBER_ID,
    comprobantes_registrados: comprobantesRecibidos.length,
    stickers_emitidos: contadorStickers,
    mesas_creadas: Object.keys(mesasCadenas).length,
    hora_servidor: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  });
});

// ======================================================
// ENVIAR MENSAJES DE WHATSAPP
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
// TEXTOS DE MENÚS Y PLANTILLAS
// ======================================================

const MAIN_MENU = 
`¡Hola! Bienvenid@ a *Llanix* 🚀

Por favor selecciona el servicio o dinámica en la que deseas participar:

1️⃣ *Cliente #100 (Stickers Digitales)* 🎨
   _Gana el acumulado de tu categoría al obtener la casilla #100._

2️⃣ *Ahorro Libre Llanix* 🐖
   _Ahorra a tu ritmo sin fechas fijas. Retiros desde $20.000 COP._

3️⃣ *Reto 2 Millones Llanix* 🎯
   _Ahorro enfocado en la meta de $2'000.000 con plan proyectado._

4️⃣ *Cadenas Semanales (Mesas Llanix)* 🔄
   _Ahorro grupal de 4 turnos ($10.000 semanales)._

Responde con el número de tu opción (1, 2, 3 o 4).`;

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

const MENU_CADENAS = 
`🔄 *MÓDULO 4: CADENAS SEMANALES (MESAS LLANIX)*
Ahorro rotativo de 4 semanas ($10.000 COP semanales por usuario).

Selecciona una opción:
1️⃣ *Crear Mesa (Ser Gestor)*
   _Requiere Fee de $5.000 + Garantía del 70% ($28.000). Asigna Turno #4._
2️⃣ *Unirme a una Mesa Existente*
   _Ingresa con el código entregado por tu Gestor (Turnos 1, 2 o 3)._

Escribe *0* para volver al menú principal.`;

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

    const session = userSessions[from] || { step: 'MAIN' };

    // --- MANEJO DE MENSAJES DE TEXTO ---
    if (message.type === 'text' && message.text) {
      const text = (message.text.body || '').trim().toUpperCase();

      // Reset / Menú Principal
      if (['0', 'MENU', 'HOLA', 'INICIO'].includes(text)) {
        userSessions[from] = { step: 'MAIN' };
        await sendWhatsAppMessage(from, MAIN_MENU);
        return res.sendStatus(200);
      }

      // Nivel 1: Selección del Menú Principal
      if (session.step === 'MAIN') {
        if (text === '1') {
          userSessions[from] = { step: 'STICKERS_SELECT' };
          await sendWhatsAppMessage(from, MENU_STICKERS);
          return res.sendStatus(200);
        }

        if (text === '2') {
          userSessions[from] = { step: 'WAITING_PROOF', modulo: 'AHORRO_LIBRE' };
          await sendWhatsAppMessage(
            from,
            `🐖 *AHORRO LIBRE LLANIX*\n\n` +
            `Puedes abonar el valor que desees a la **Llave Bre-B: 0093393998**.\n\n` +
            `⚠️ *Condiciones de Retiro y Fee:*\n` +
            `- Los retiros solo están habilitados cuando alcances un saldo mínimo acumulado de *$20.000 COP*.\n` +
            `- Al solicitar tu retiro se aplicará un fee único de administración de *$3.000 COP*.\n\n` +
            `📸 *Paso a seguir:* Envía la foto o captura de tu comprobante de transferencia por este chat.`
          );
          return res.sendStatus(200);
        }

        if (text === '3') {
          userSessions[from] = { step: 'WAITING_PROOF', modulo: 'RETO_2M' };
          await sendWhatsAppMessage(
            from,
            `🎯 *RETO 2 MILLONES LLANIX*\n\n` +
            `¡Ahorra a tu propio ritmo hasta alcanzar la meta de *$2'000.000 COP*!\n\n` +
            `🔑 Transferencias a la **Llave Bre-B: 0093393998**.\n\n` +
            `⚠️ *Condición del Fee de Administración:*\n` +
            `- Aplica una tarifa única de *$3.000 COP* que se descontará al completar la meta o en retiros anticipados (saldo mínimo de retiro: *$20.000 COP*).\n\n` +
            `📸 *Paso a seguir:* Envía la foto o captura de tu comprobante de abono.`
          );
          return res.sendStatus(200);
        }

        if (text === '4') {
          userSessions[from] = { step: 'CADENAS_SELECT' };
          await sendWhatsAppMessage(from, MENU_CADENAS);
          return res.sendStatus(200);
        }

        await sendWhatsAppMessage(from, MAIN_MENU);
        return res.sendStatus(200);
      }

      // Nivel 2: Módulo 1 (Stickers)
      if (session.step === 'STICKERS_SELECT') {
        let precio = 0;
        let nombreOpcion = '';
        if (text === '1') { precio = 2000; nombreOpcion = 'Sticker Básico'; }
        else if (text === '2') { precio = 5000; nombreOpcion = 'Sticker Pro'; }
        else if (text === '3') { precio = 8000; nombreOpcion = 'Sticker Silver'; }
        else if (text === '4') { precio = 10000; nombreOpcion = 'Sticker Gold'; }
        else if (text === '5') { precio = 12000; nombreOpcion = 'Sticker VIP'; }

        if (precio > 0) {
          userSessions[from] = {
            step: 'WAITING_PROOF',
            modulo: 'STICKERS',
            categoria: nombreOpcion,
            precio: precio
          };
          await sendWhatsAppMessage(
            from,
            `🎉 *Solicitud de ${nombreOpcion} ($${precio.toLocaleString('es-CO')} COP)*\n\n` +
            `Transferir a la **Llave Bre-B: 0093393998**.\n\n` +
            `📸 *Envía la captura del comprobante por este chat.* Tu código consecutivo (STK-001 al STK-100) se asignará automáticamente al verificar el pago.`
          );
          return res.sendStatus(200);
        }
      }

      // Nivel 2: Módulo 4 (Cadenas)
      if (session.step === 'CADENAS_SELECT') {
        if (text === '1') {
          userSessions[from] = { step: 'WAITING_PROOF', modulo: 'CADENAS_GESTOR' };
          await sendWhatsAppMessage(
            from,
            `👑 *APERTURA DE MESA (GESTOR DE CADENA)*\n\n` +
            `Para crear tu mesa debes transferir *$33.000 COP* ($5.000 Fee de apertura + $28.000 Garantía del 70%) a la **Llave Bre-B: 0093393998**.\n\n` +
            `📌 *Beneficios:*\n` +
            `- Tendrás asignado el *Turno #4* (cobras el pozo + devolución completa de tus $28.000 de garantía).\n\n` +
            `📸 Envía la captura del pago para generar el *Código Único de Mesa* para tus 3 invitados.`
          );
          return res.sendStatus(200);
        }

        if (text === '2') {
          userSessions[from] = { step: 'WAITING_MESA_CODE' };
          await sendWhatsAppMessage(
            from,
            `🔑 Por favor escribe el *Código Único de Mesa* proporcionado por tu Gestor (Ejemplo: MESA-101):`
          );
          return res.sendStatus(200);
        }
      }

      // Nivel 3: Ingreso de Código de Mesa para Invitados
      if (session.step === 'WAITING_MESA_CODE') {
        const codigoMesa = text;
        if (mesasCadenas[codigoMesa]) {
          userSessions[from] = { step: 'WAITING_PROOF', modulo: 'CADENAS_INVITADO', codigoMesa: codigoMesa };
          await sendWhatsAppMessage(
            from,
            `✅ *Mesa Encontrada: ${codigoMesa}*\n\n` +
            `Transfiere tu cuota semanal de *$10.000 COP* a la **Llave Bre-B: 0093393998** y envía la captura de pago por este chat.`
          );
        } else {
          await sendWhatsAppMessage(
            from,
            `❌ El código de mesa *${codigoMesa}* no existe o aún no ha sido activado por el Administrador. Verifica con tu Gestor o escribe *0* para salir.`
          );
        }
        return res.sendStatus(200);
      }

      await sendWhatsAppMessage(from, MAIN_MENU);
      return res.sendStatus(200);
    }

    // --- RECEPCIÓN DE COMPROBANTES DE PAGO (IMÁGENES) ---
    if (message.type === 'image' && message.image) {
      const idUnico = Date.now().toString();
      const moduloActual = session.modulo || 'GENERAL';

      comprobantesRecibidos.push({
        id: idUnico,
        from: from,
        mediaId: message.image.id,
        modulo: moduloActual,
        categoria: session.categoria || 'N/A',
        precio: session.precio || 0,
        codigoMesa: session.codigoMesa || 'N/A',
        fechaEnvio: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        estado: 'PENDIENTE'
      });

      await sendWhatsAppMessage(
        from,
        `📩 *¡Comprobante recibido exitosamente!*\n\n` +
        `Estamos verificando la acreditación en la cuenta Bre-B.\n` +
        `Tan pronto el pago sea validado en el sistema, recibirás la confirmación y certificado oficial correspondiente a tu solicitud.`
      );
      
      // Resetea sesión al estado principal
      userSessions[from] = { step: 'MAIN' };
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error en el webhook:', error);
    return res.sendStatus(200);
  }
});

// ======================================================
// PANEL DE CONTROL WEB
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
        a.btn { background: #29b6f6; color: #000; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; margin-top: 5px; }
        input[type="number"] { padding: 8px; border-radius: 4px; border: 1px solid #555; width: 140px; }
        button.btn-autorizar { background: #00e676; color: #000; border: none; padding: 10px 15px; font-weight: bold; border-radius: 4px; cursor: pointer; margin-top: 10px; }
      </style>
    </head>
    <body>
      <h1>📸 Panel de Control y Validación - Llanix</h1>
      <p>Revisa la transferencia Bre-B. Al aprobar, el sistema emitirá la confirmación y actualizará saldos/turnos.</p>
      <hr>
  `;

  if (comprobantesRecibidos.length === 0) {
    html += `<p style="color:#aaa;">No hay comprobantes pendientes por revisar.</p>`;
  } else {
    comprobantesRecibidos.slice().reverse().forEach((item) => {
      html += `
        <div class="card">
          <p>📱 <strong>Cliente:</strong> +${item.from}</p>
          <p>🧩 <strong>Módulo:</strong> <span style="color:#29b6f6; font-weight:bold;">${item.modulo}</span></p>
          ${item.categoria !== 'N/A' ? `<p>🏷️ <strong>Categoría:</strong> ${item.categoria}</p>` : ''}
          ${item.codigoMesa !== 'N/A' ? `<p>🔑 <strong>Código Mesa:</strong> ${item.codigoMesa}</p>` : ''}
          <p>⏰ <strong>Recibido:</strong> ${item.fechaEnvio}</p>
          <p>📌 <strong>Estado:</strong> <span class="badge ${item.estado}">${item.estado}</span></p>

          <p>🖼️️ <a class="btn" href="/ver-imagen/${item.mediaId}" target="_blank">Ver Comprobante de Pago</a></p>

          ${item.estado === 'PENDIENTE' ? `
            <form action="/autorizar" method="POST">
              <input type="hidden" name="id" value="${item.id}">
              
              ${['AHORRO_LIBRE', 'RETO_2M'].includes(item.modulo) ? `
                <p>💵 <strong>Monto Confirmado Acreditado (COP):</strong> 
                <input type="number" name="montoAbono" placeholder="Ej: 50000" required></p>
              ` : ''}

              <button type="submit" class="btn-autorizar">✅ Aprobar Pago y Notificar al Cliente</button>
            </form>
          ` : `<p style="color:#00e676;">✨ Pago verificado el ${item.fechaAprobacion}</p>`}
        </div>
      `;
    });
  }

  html += `</body></html>`;
  res.send(html);
});

// ======================================================
// RUTA DE AUTORIZACIÓN Y LIQUIDACIÓN POR MÓDULO
// ======================================================

app.post('/autorizar', async (req, res) => {
  const { id, montoAbono } = req.body;
  const item = comprobantesRecibidos.find(c => c.id === id);

  if (item && item.estado === 'PENDIENTE') {
    item.estado = 'APROBADO';
    item.fechaAprobacion = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const valorAbono = parseInt(montoAbono) || item.precio || 0;

    // --- LÓGICA MÓDULO 1: STICKERS ---
    if (item.modulo === 'STICKERS') {
      contadorStickers = (contadorStickers % 100) + 1;
      const codigoGenerado = `STK-${String(contadorStickers).padStart(3, '0')}`;

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

    // --- LÓGICA MÓDULO 2: AHORRO LIBRE ---
    else if (item.modulo === 'AHORRO_LIBRE') {
      usuariosAhorro[item.from] = (usuariosAhorro[item.from] || 0) + valorAbono;
      const totalAcumulado = usuariosAhorro[item.from];
      const refAbono = `AHL-${Math.floor(1000 + Math.random() * 9000)}`;

      const msg = 
        `🐖 *==============================*\n` +
        `💰 *COMPROBANTE AHORRO LIBRE* 💰\n` +
        `*==============================*\n\n` +
        `✅ *ABONO VERIFICADO*\n\n` +
        `💵 *Monto Acreditado:* $${valorAbono.toLocaleString('es-CO')} COP\n` +
        `📊 *Saldo Acumulado:* *$${totalAcumulado.toLocaleString('es-CO')} COP*\n` +
        `📄 *Referencia:* \`${refAbono}\`\n\n` +
        `----------------------------------\n` +
        `⚠️ *Recordatorio de Retiro:* Habilitado a partir de *$20.000 COP* de saldo acumulado. Aplica un fee de administración de *$3.000 COP* al momento del retiro.`;

      await sendWhatsAppMessage(item.from, msg);
    }

    // --- LÓGICA MÓDULO 3: RETO 2 MILLONES ---
    else if (item.modulo === 'RETO_2M') {
      usuariosAhorro[item.from] = (usuariosAhorro[item.from] || 0) + valorAbono;
      const saldoActual = usuariosAhorro[item.from];
      const faltante = Math.max(0, 2000000 - saldoActual);
      const cuotasRestantes = valorAbono > 0 ? Math.ceil(faltante / valorAbono) : 0;
      const refAvance = `R2M-${Math.floor(1000 + Math.random() * 9000)}`;

      const msg = 
        `🎯 *==============================*\n` +
        `🚀 *AVANCE RETO 2 MILLONES* 🚀\n` +
        `*==============================*\n\n` +
        `✅ *APORTE VERIFICADO Y CONFIRMADO*\n\n` +
        `💵 *Aporte Registrado:* $${valorAbono.toLocaleString('es-CO')} COP\n` +
        `📄 *Referencia:* \`${refAvance}\`\n\n` +
        `📊 *ESTADO DE TU RETO:*\n` +
        `💰 *Saldo Acumulado:* *$${saldoActual.toLocaleString('es-CO')} COP*\n` +
        `🏁 *Faltante para la Meta:* *$${faltante.toLocaleString('es-CO')} COP*\n\n` +
        `🔥 *TU PLAN DE VICTORIA:*\n` +
        `¡Mantén el impulso! Si continúas con aportes de *$${valorAbono.toLocaleString('es-CO')} COP*, estarás a solo *${cuotasRestantes} cuotas* de completar tus *$2'000.000 COP*. ¡Tú puedes lograrlo! 💪\n\n` +
        `----------------------------------\n` +
        `⚠️ *Recordatorio:* Al liquidar tu meta o en retiros anticipados (mínimo $20.000 COP), aplica el fee único de administración de $3.000 COP.`;

      await sendWhatsAppMessage(item.from, msg);
    }

    // --- LÓGICA MÓDULO 4: CADENAS (GESTOR) ---
    else if (item.modulo === 'CADENAS_GESTOR') {
      contadorMesas++;
      const codigoMesa = `MESA-${contadorMesas}`;
      mesasCadenas[codigoMesa] = {
        gestor: item.from,
        integrantes: [item.from],
        semanaActual: 1
      };

      const msg = 
        `👑 *==============================*\n` +
        `🎉 *MESA ACTIVADA EXITOSAMENTE* 🎉\n` +
        `*==============================*\n\n` +
        `✅ *Garantía (70%) y Fee Confirmados*\n\n` +
        `🔑 *CÓDIGO ÚNICO DE TU MESA:* \`${codigoMesa}\`\n` +
        `📌 *Tu Turno Asignado:* **Turno #4**\n\n` +
        `📢 *Instrucciones:* Comparte el código \`${codigoMesa}\` con tus 3 invitados de confianza para que se registren en la cadena.`;

      await sendWhatsAppMessage(item.from, msg);
    }

    // --- LÓGICA MÓDULO 4: CADENAS (INVITADO) ---
    else if (item.modulo === 'CADENAS_INVITADO') {
      const codigoMesa = item.codigoMesa;
      const refCadena = `CDN-${Math.floor(1000 + Math.random() * 9000)}`;

      if (mesasCadenas[codigoMesa] && !mesasCadenas[codigoMesa].integrantes.includes(item.from)) {
        mesasCadenas[codigoMesa].integrantes.push(item.from);
      }

      const turnoUsuario = mesasCadenas[codigoMesa] ? mesasCadenas[codigoMesa].integrantes.indexOf(item.from) + 1 : 1;

      const msg = 
        `🔄 *==============================*\n` +
        `🎟️️ *TIQUETE PAGO SEMANAL CADENA* 🎟️\n` +
        `*==============================*\n\n` +
        `✅ *ESTADO:* PAZ Y SALVO 🟢\n\n` +
        `📄 *Referencia:* \`${refCadena}\`\n` +
        `🔑 *Mesa:* \`${codigoMesa}\`\n` +
        `📌 *Tu Turno:* Turno #${turnoUsuario}\n` +
        `💵 *Cuota Verificada:* $10.000 COP\n\n` +
        `¡Gracias por mantener al día tu cuota semanal en Llanix! 🚀`;

      await sendWhatsAppMessage(item.from, msg);
    }
  }

  res.redirect('/comprobantes');
});

// ======================================================
// VER IMAGEN DE META (COMPROBANTES)
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
    console.error('❌ Error cargando la imagen:', error.message);
    res.status(500).send('Error al visualizar el comprobante.');
  }
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

app.listen(PORT, () => {
  console.log('🤖 SISTEMA LLANIX MULTI-MÓDULO CORRIENDO EN EL PUERTO:', PORT);
});
