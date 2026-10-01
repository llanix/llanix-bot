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
// LÓGICA DE MENSAJES EN EL WEBHOOK (RESTRINGIDO)
// ======================================================

// Dentro de app.post('/webhook', ...), reemplaza la parte de procesamiento de texto por esto:

if (message.type === 'text' && message.text) {
  const text = (message.text.body || '').trim().toUpperCase();

  // Reset al menú
  if (['0', 'MENU', 'HOLA', 'INICIO'].includes(text)) {
    userSessions[from] = { step: 'MAIN' };
    await sendWhatsAppMessage(from, MAIN_MENU);
    return res.sendStatus(200);
  }

  // Respuesta si intentan escribir "RETIRO" u otras opciones
  if (['RETIRO', 'SOLICITAR RETIRO', 'RETIRAR', '2', '3', '4'].includes(text) && session.step === 'MAIN') {
    await sendWhatsAppMessage(
      from,
      `⚠️ *MÓDULO EN MANTENIMIENTO*\n\n` +
      `Los módulos de Ahorro y Cadenas no están disponibles en este momento mientras actualizamos el sistema.\n\n` +
      `Por favor selecciona la opción *1* para participar en *Cliente #100 (Stickers Digitales)*.`
    );
    return res.sendStatus(200);
  }

  // NAVEGACIÓN MENÚ PRINCIPAL -> MÓDULO 1
  if (session.step === 'MAIN') {
    if (text === '1') {
      userSessions[from] = { step: 'STICKERS_SELECT' };
      await sendWhatsAppMessage(from, MENU_STICKERS);
      return res.sendStatus(200);
    }

    await sendWhatsAppMessage(from, MAIN_MENU);
    return res.sendStatus(200);
  }

  // SELECCIÓN DE CATEGORÍA EN MÓDULO 1
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
