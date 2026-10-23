const SYSTEM_PROMPT = `You are Pennywise AI, a helpful assistant for personal finance and general questions. Explain concepts in plain language for beginners. Give practical, tailored steps and several realistic options when useful. Do not claim access to a user's dashboard, bank accounts, or files unless the user includes that information in their message. Never ask for passwords, OTPs, full account numbers, or card credentials. For financial topics, state assumptions, avoid guaranteed outcomes, and clarify that you are not a licensed financial adviser when appropriate. Be honest about uncertainty.`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Use POST to send a message.'}); }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({error:'Pennywise AI is not configured. Add GEMINI_API_KEY in Vercel Environment Variables, then redeploy.'});
  let body=req.body; if(typeof body==='string'){try{body=JSON.parse(body)}catch{body=null}}
  const incoming=body&&Array.isArray(body.messages)?body.messages:[];
  if(!incoming.length) return res.status(400).json({error:'Please enter a message.'});
  const allowed=new Set(['finance','general','both']); const mode=body && allowed.has(body.mode)?body.mode:'both';
  const messages=incoming.slice(-16).map(m=>({role:m&&m.role==='model'?'model':'user',text:typeof(m&&m.text)==='string'?m.text.slice(0,6000):''})).filter(m=>m.text.trim());
  if(!messages.length||messages[messages.length-1].role!=='user')return res.status(400).json({error:'The last conversation item must be a user message.'});
  const instruction=mode==='finance'?'Focus on budgeting, spending, saving, and financial literacy.':mode==='general'?'Answer general questions; do not assume every question is about finance.':'Help with personal finance and general topics according to the user’s actual question.';
  const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
  for(let attempt=0;attempt<3;attempt++){
    try{
      const upstream=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({systemInstruction:{parts:[{text:`${SYSTEM_PROMPT}\n\nMode: ${instruction}`}]},contents:messages.map(m=>({role:m.role,parts:[{text:m.text}]})),generationConfig:{temperature:.65,maxOutputTokens:1200}})});
      const result=await upstream.json().catch(()=>({}));
      if(!upstream.ok){console.error('Gemini API status',upstream.status,result?.error?.message||'');if(upstream.status===503&&attempt<2){await sleep(600*(2**attempt));continue}if(upstream.status===400)return res.status(502).json({error:'Gemini could not process this request. Check the model setting or try a shorter message.'});if(upstream.status===401||upstream.status===403)return res.status(502).json({error:'Gemini rejected the API key. Check GEMINI_API_KEY and its restrictions.'});if(upstream.status===429)return res.status(429).json({error:'Gemini rate limit or quota reached. Wait and try again, or check your Google AI Studio quota.'});if(upstream.status===503)return res.status(503).json({error:'Gemini is experiencing high demand. Please try again shortly.'});return res.status(502).json({error:'The AI provider is temporarily unavailable. Please try again shortly.'});}
      const reply=(result.candidates||[]).flatMap(c=>(c.content&&c.content.parts)||[]).map(p=>p.text||'').join('\n').trim();if(!reply)return res.status(502).json({error:'Gemini returned no text. Please rephrase your question.'});return res.status(200).json({reply});
    }catch(err){console.error('Gemini request failed:',err?.message);if(attempt<2){await sleep(500*(2**attempt));continue}return res.status(502).json({error:'Could not reach Gemini. Check the connection and try again.'});}
  }
  return res.status(503).json({error:'Gemini is temporarily unavailable. Please try again shortly.'});
};
