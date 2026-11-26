// Native WhatsApp interactive messages (flows) with a plain-text fallback.
// Buttons supported: quick_reply, cta_url, cta_copy, single_select.

function quickReply(displayText, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: String(displayText).slice(0, 60), id: String(id) })
  };
}

function urlButton(displayText, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({ display_text: String(displayText).slice(0, 60), url: String(url), merchant_url: String(url) })
  };
}

function copyButton(displayText, code) {
  return {
    name: 'cta_copy',
    buttonParamsJson: JSON.stringify({ display_text: String(displayText).slice(0, 60), copy_code: String(code) })
  };
}

export function buildButtonPayload({ text, title = '', footer = '', image = null, buttons = [] }) {
  const normalized = buttons.slice(0, 6);
  const header = title ? `*${title}*\n\n` : '';
  const bodyText = `${header}${text}`;
  const payload = {
    text: bodyText,
    footer: footer ? `> ${footer}` : ''
  };
  if (image && image.url) payload.image = { url: image.url };
  if (normalized.length > 0) {
    payload.interactiveMessage = {
      body: { text: bodyText },
      footer: { text: footer || '' },
      nativeFlowMessage: {
        buttons: normalized.map((b) => {
          if (b.url) return urlButton(b.text, b.url);
          if (b.copy) return copyButton(b.text, b.copy);
          return quickReply(b.text, b.id || b.text);
        })
      }
    };
  }
  return payload;
}

// Send a button message; if the client rejects the interactive payload the
// same content goes out as plain text so the user never hits a dead end.
export async function sendButtons(sock, jid, options, quoted = null) {
  const payload = buildButtonPayload(options);
  if (payload.interactiveMessage) {
    try {
      return await sock.sendMessage(jid, payload, quoted ? { quoted } : {});
    } catch (err) {
      // fall through to the plain-text variant
    }
  }
  const text = [payload.text, payload.footer && `> ${payload.footer.replace(/^> /, '')}`].filter(Boolean).join('\n');
  const send = payload.image && payload.image.url
    ? { image: payload.image, caption: text }
    : { text };
  return sock.sendMessage(jid, send, quoted ? { quoted } : {});
}

// Extract the pressed button id from any incoming interactive reply.
export function extractButtonId(message) {
  if (!message) return null;
  if (message.templateButtonReplyMessage?.selectedId) return message.templateButtonReplyMessage.selectedId;
  if (message.buttonsResponseMessage?.selectedButtonId) return message.buttonsResponseMessage.selectedButtonId;
  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) return message.listResponseMessage.singleSelectReply.selectedRowId;
  if (message.interactiveResponseMessage) {
    const flow = message.interactiveResponseMessage.nativeFlowResponseMessage;
    if (flow?.paramsJson) {
      try {
        const params = JSON.parse(flow.paramsJson);
        if (params.id) return params.id;
      } catch {}
    }
    return message.interactiveResponseMessage.buttonId || null;
  }
  return null;
}
