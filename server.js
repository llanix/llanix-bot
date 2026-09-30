const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'llanix_secure_token_2026';
const PORT = process.env.PORT || 8080;

// 1. Verificación del Webhook (GET)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
    res.sendStatus(400);
});

// 2. Recepción y respuesta de mensajes (POST)
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
            const from = message.from; // Número del usuario
            const msgBody = message.text ? message.text.body : ''; // Texto del mensaje

            console.log(`📩 Mensaje de ${from}: ${msgBody}`);

            // Responder al usuario
            await sendWhatsAppMessage(from, `¡Hola desde Llanix Bot! Recibí tu mensaje: "${msgBody}"`);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// Función para enviar mensajes vía Meta Graph API
async function sendWhatsAppMessage(to, text) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.PHONE_NUMBER_ID;

    if (!token || !phoneId) {
        console.error('❌ Falta WHATSAPP_TOKEN o PHONE_NUMBER_ID en Railway.');
        return;
    }

    try {
        await axios.post(
            `https://graph.facebook.com/v20.0/${phoneId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`📤 Respuesta enviada con éxito a ${to}`);
    } catch (error) {
        console.error('❌ Error al enviar mensaje:', error.response ? error.response.data : error.message);
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
