const SYSTEM_PROMPT = `
You are Pennywise AI, a helpful personal finance assistant.

Explain concepts in simple language for beginners.
Give practical advice and useful alternatives.
Never claim access to dashboard data unless the user shares it.
Never ask for passwords, OTPs, or full bank or card details.
Do not promise financial results.
Be honest when information is uncertain.

You can use relevant memories retrieved from Hindsight.
Treat memories as context, not as unquestionable facts.
If a memory conflicts with what the user says now, prioritize
the user's current message.
`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestJSON(url, options, timeoutMs = 8000) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status}): ${
        data.error?.message || data.error || 'Unknown error'
      }`
    );
  }

  return data;
}

function getHindsightSettings() {
  const apiKey = process.env.HINDSIGHT_API_KEY;
  const baseUrl = (
    process.env.HINDSIGHT_BASE_URL ||
    'https://api.hindsight.vectorize.io'
  ).replace(/\/+$/, '');

  const bankId = process.env.HINDSIGHT_BANK_ID || 'pennywise-demo';

  return { apiKey, baseUrl, bankId };
}

async function recallMemories(query) {
  const { apiKey, baseUrl, bankId } = getHindsightSettings();

  if (!apiKey) return '';

  const data = await requestJSON(
    `${baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}/memories/recall`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
           body: JSON.stringify({
        query,
        budget: 'low',
        max_tokens: 1200,
      }),
    },
    2500
  );

  return (data.results || [])
    .slice(0, 5)
    .map(memory => memory.text || '')
    .filter(Boolean)
    .join('\n');
}

async function retainMemory(userMessage, assistantReply) {
  const { apiKey, baseUrl, bankId } = getHindsightSettings();

  if (!apiKey) return;

  // Do not retain every ordinary exchange. Keep memory focused on
  // information the user explicitly wants Pennywise to remember.
  const asksToRemember =
    /\b(remember|keep in mind|don't forget|do not forget|my goal is|my goal|my monthly allowance|i want to save)\b/i
      .test(userMessage);

  if (!asksToRemember) return;

  const content = [
    `User shared: ${userMessage.slice(0, 1500)}`,
    `Assistant response: ${assistantReply.slice(0, 500)}`,
  ].join('\n');

  await requestJSON(
    `${baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}/memories`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
           body: JSON.stringify({
        items: [{ content }],
      }),
    },
    2000
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'Use POST to send a message.',
    });
  }

  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    return res.status(503).json({
      error: 'Gemini is not configured. Check Vercel environment variables.',
    });
  }

  let body = req.body;

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }

  const incoming = Array.isArray(body?.messages)
    ? body.messages
    : [];

  if (!incoming.length) {
    return res.status(400).json({
      error: 'Please enter a message.',
    });
  }

  const messages = incoming
    .slice(-16)
    .map(message => ({
      role: message?.role === 'model' ? 'model' : 'user',
      text:
        typeof message?.text === 'string'
          ? message.text.slice(0, 6000)
          : '',
    }))
    .filter(message => message.text.trim());

  if (
    !messages.length ||
    messages[messages.length - 1].role !== 'user'
  ) {
    return res.status(400).json({
      error: 'The last message must be from the user.',
    });
  }

  const userMessage = messages[messages.length - 1].text;

  const mode = ['finance', 'general', 'both'].includes(body?.mode)
    ? body.mode
    : 'both';

  const instruction =
    mode === 'finance'
      ? 'Focus on budgeting, saving, and financial literacy.'
      : mode === 'general'
        ? 'Answer general questions without assuming they concern finance.'
        : 'Answer the question according to the user’s actual needs.';

  // This first version uses one shared demo bank.
  // Do not use it for multiple real users until isolation is implemented.
  let memories = '';

  if (body?.memoryEnabled !== false) {
    try {
      memories = await recallMemories(userMessage);
    } catch (error) {
      console.error('Hindsight recall failed:', error.message);
      // Memory failure should not prevent the basic Gemini chat.
    }
  }

  const model = process.env.GEMINI_MODEL;

  if (!model) {
    return res.status(503).json({
      error: 'GEMINI_MODEL is missing from Vercel environment variables.',
    });
  }

  const systemText = [
    SYSTEM_PROMPT,
    `Mode: ${instruction}`,
    memories
      ? `Relevant memories retrieved from Hindsight:\n${memories}`
      : 'No relevant Hindsight memories were retrieved.',
    'Do not invent memories or claim to remember information that is not provided.',
  ].join('\n\n');

  let reply = '';

  for (let attempt = 0; attempt < 1; attempt++) {
    try {
      const result = await requestJSON(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemText }],
            },
            contents: messages.map(message => ({
              role: message.role,
              parts: [{ text: message.text }],
            })),
            generationConfig: {
              temperature: 0.65,
              maxOutputTokens: 1200,
            },
          }),
        },
        15000
      );

      reply = (result.candidates || [])
        .flatMap(candidate => candidate.content?.parts || [])
        .map(part => part.text || '')
        .join('\n')
        .trim();

      if (reply) break;

      return res.status(502).json({
        error: 'Gemini returned no text. Please try again.',
      });
    } catch (error) {
      console.error('Gemini request failed:', error.message);

      if (attempt < 2) {
        await sleep(400 * (attempt + 1));
      } else {
        return res.status(502).json({
          error: 'Gemini could not respond. Check the model and API settings.',
        });
      }
    }
  }

  if (!reply) {
    return res.status(502).json({
      error: 'No AI response was generated.',
    });
  }

  if (body?.memoryEnabled !== false) {
    try {
      await retainMemory(userMessage, reply);
    } catch (error) {
      console.error('Hindsight retention failed:', error.message);
      // Still return the Gemini answer if saving memory fails.
    }
  }

  return res.status(200).json({
    reply,
    memoryEnabled: body?.memoryEnabled !== false,
    memoryRecalled: Boolean(memories),
  });
}
